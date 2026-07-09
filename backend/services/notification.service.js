"use strict";

const Order = require("../models/Order");
const User = require("../models/User");
const logger = require("../utils/logger");
const {
  sendOrderConfirmationEmail,
  sendVendorOrderNotificationEmail,
  sendAdminOrderNotificationEmail,
  sendOrderStatusUpdateEmail,
  sendOrderDeliveredEmail,
} = require("./order-email.service");

// In-memory cache for sent notifications (for production, use Redis or DB)
const sentNotifications = new Map();
const NOTIFICATION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate unique key for notification deduplication
 */
function getNotificationKey(type, orderId, recipient) {
  return `${type}:${orderId}:${recipient}`;
}

/**
 * Check if notification was already sent
 */
function wasNotificationSent(type, orderId, recipient) {
  const key = getNotificationKey(type, orderId, recipient);
  return sentNotifications.has(key);
}

/**
 * Mark notification as sent
 */
function markNotificationSent(type, orderId, recipient) {
  const key = getNotificationKey(type, orderId, recipient);
  sentNotifications.set(key, Date.now());

  // Cleanup old entries periodically
  if (sentNotifications.size > 1000) {
    const now = Date.now();
    for (const [k, v] of sentNotifications.entries()) {
      if (now - v > NOTIFICATION_CACHE_TTL) {
        sentNotifications.delete(k);
      }
    }
  }
}

/**
 * Get admin user(s) email(s)
 */
async function getAdminEmails() {
  const admins = await User.find({ isAdmin: true })
    .select("email")
    .lean();
  return admins.map((a) => a.email).filter(Boolean);
}

/**
 * Get vendor emails for specific order items
 */
async function getVendorEmails(order) {
  const vendorIds = [...new Set(order.items.map((i) => String(i.vendorId)))];
  logger.log(`[Notification] Looking for vendors with IDs:`, vendorIds);

  const vendors = await User.find({ _id: { $in: vendorIds } })
    .select("email storeName name")
    .lean();

  logger.log(`[Notification] Found vendors:`, JSON.stringify(vendors, null, 2));

  return vendors.map((v) => ({
    email: v.email,
    storeName: v.storeName || v.name || "Your Store", // Fallback to name if storeName is not set
    _id: v._id,
  }));
}

/**
 * Send order created notifications
 * Called after successful order creation (both COD and Paystack)
 */
async function notifyOrderCreated(order) {
  logger.log(`[Notification] Processing notifications for order ${order._id}`);
  logger.log(`[Notification] Order customerEmail: ${order.customerEmail}, customerName: ${order.customerName}`);

  try {
    // Get customer email from order (stored during checkout) OR from User model
    let customerEmail = order.customerEmail;
    let customerName = order.customerName;

    // Fallback: try to get from User if not in order
    if (!customerEmail && order.userId) {
      const customer = await User.findById(order.userId)
        .select("name email")
        .lean();
      if (customer) {
        customerEmail = customer.email;
        customerName = customer.name;
      }
    }

    if (!customerEmail) {
      console.error(`[Notification] No customer email found for order ${order._id}`);
      return;
    }

    logger.log(`[Notification] Sending to customer: ${customerEmail}`);

    // 1. Send confirmation to customer
    if (customerEmail && !wasNotificationSent("customer_confirmation", order._id, customerEmail)) {
      try {
        await sendOrderConfirmationEmail(customerEmail, order, { name: customerName });
        markNotificationSent("customer_confirmation", order._id, customerEmail);
      } catch (err) {
        console.error(`[Notification] Failed to send customer confirmation:`, err.message);
      }
    }

    // 2. Send to each vendor
    const vendorEmails = await getVendorEmails(order);
    for (const vendor of vendorEmails) {
      if (vendor.email && !wasNotificationSent("vendor_order", order._id, vendor.email)) {
        try {
          await sendVendorOrderNotificationEmail(vendor.email, order, vendor);
          markNotificationSent("vendor_order", order._id, vendor.email);
        } catch (err) {
          console.error(`[Notification] Failed to send vendor notification to ${vendor.email}:`, err.message);
        }
      }
    }

    // 3. Send to admin
    const adminEmails = await getAdminEmails();
    for (const adminEmail of adminEmails) {
      if (adminEmail && !wasNotificationSent("admin_order", order._id, adminEmail)) {
        try {
          await sendAdminOrderNotificationEmail(adminEmail, order, { name: "Admin" });
          markNotificationSent("admin_order", order._id, adminEmail);
        } catch (err) {
          console.error(`[Notification] Failed to send admin notification:`, err.message);
        }
      }
    }

    logger.log(`[Notification] Order created notifications sent for ${order._id}`);
  } catch (err) {
    console.error(`[Notification] Error in notifyOrderCreated:`, err.message);
    // Don't throw - email failures shouldn't break order creation
  }
}

/**
 * Send order status update notification
 * Called when order status changes
 */
async function notifyOrderStatusUpdate(orderId, oldStatus, newStatus) {
  logger.log(`[Notification] Processing status update for order ${orderId}: ${oldStatus} -> ${newStatus}`);

  try {
    const order = await Order.findById(orderId).lean();
    if (!order) {
      console.error(`[Notification] Order not found: ${orderId}`);
      return;
    }

    // Get customer email from order OR from User model
    let customerEmail = order.customerEmail;
    let customerName = order.customerName;

    if (!customerEmail && order.userId) {
      const customer = await User.findById(order.userId)
        .select("name email")
        .lean();
      if (customer) {
        customerEmail = customer.email;
        customerName = customer.name;
      }
    }

    if (!customerEmail) {
      console.error(`[Notification] No customer email for order ${orderId}`);
      return;
    }

    // Send status update to customer
    if (!wasNotificationSent(`status_${newStatus}`, orderId, customerEmail)) {
      try {
        await sendOrderStatusUpdateEmail(customerEmail, order, oldStatus, newStatus);
        markNotificationSent(`status_${newStatus}`, orderId, customerEmail);
      } catch (err) {
        console.error(`[Notification] Failed to send status update:`, err.message);
      }
    }

    // Special handling for delivered status
    if (newStatus === "delivered") {
      if (!wasNotificationSent("delivered", orderId, customerEmail)) {
        try {
          await sendOrderDeliveredEmail(customerEmail, order);
          markNotificationSent("delivered", orderId, customerEmail);
        } catch (err) {
          console.error(`[Notification] Failed to send delivered confirmation:`, err.message);
        }
      }
    }

    logger.log(`[Notification] Status update notifications sent for order ${orderId}`);
  } catch (err) {
    console.error(`[Notification] Error in notifyOrderStatusUpdate:`, err.message);
    // Don't throw - email failures shouldn't break status updates
  }
}

/**
 * Future support: Send SMS notification
 * Placeholder for future implementation
 */
async function sendSMSNotification(phone, message) {
  logger.log(`[SMS] Would send to ${phone}: ${message}`);
  // TODO: Integrate with SMS provider (Twilio, etc.)
}

/**
 * Future support: Send push notification
 * Placeholder for future implementation
 */
async function sendPushNotification(userId, title, body) {
  logger.log(`[Push] Would send to user ${userId}: ${title} - ${body}`);
  // TODO: Integrate with FCM or similar
}

// ═══════════════════════════════════════════════════════════════════════════
// REVIEW-FLOW NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════
// When an order transitions to "delivered" the customer should receive
// in-app notifications asking them to leave a review. This is the
// customer-facing counterpart to the order-status email — the email
// is for users who don't have the app open, the in-app notification
// is for users who do (and see the bell badge light up in real time).
//
// Two Notification rows are created per delivered order:
//   - one per UNIQUE product in the order (filter itemType === "product",
//     dedupe by productId). Triggers product review flow.
//   - one per UNIQUE restaurant (filter itemType === "food", dedupe by
//     restaurantId). Triggers restaurant review flow.
//
// Notifications are deduped against prior reviews: if the customer has
// already reviewed the product or restaurant for this orderId, no
// notification is created. This makes the service idempotent — calling
// notifyOrderDelivered twice for the same order (e.g. once from the
// rider endpoint and once from the admin status endpoint) does not
// produce duplicate notifications.
//
// Pure helpers are exported so they can be unit-tested without
// touching MongoDB. See backend/tests/unit.test.js section 19.

/**
 * Build the list of pending-review items for a delivered order.
 *
 * Pure function — no I/O. Takes the raw order object (with `items`,
 * `userId`, `_id`) and an optional `existingReviews` set shaped as:
 *   { product: Set<"<productId>:<orderId>">, food: Set<"<restaurantId>:<orderId>"> }
 *
 * Returns an array of items, one per unique product or restaurant in
 * the order. The shape matches what the review page consumes:
 *   { type: "product" | "food",
 *     orderId, productId|restaurantId, name, image, vendorId, orderType,
 *     alreadyReviewed }
 *
 * If the order is not in `delivered` state, returns [].
 */
function buildPendingReviewItems(order, existingReviews) {
  if (!order || order.orderStatus !== "delivered") return [];
  const reviews = existingReviews || { product: new Set(), food: new Set() };
  const productMap = new Map();
  const restaurantMap = new Map();

  const items = Array.isArray(order.items) ? order.items : [];
  for (const it of items) {
    if (it.itemType === "food" && it.restaurantId) {
      const key = String(it.restaurantId);
      if (!restaurantMap.has(key)) {
        restaurantMap.set(key, {
          type: "food",
          orderId: String(order._id),
          restaurantId: it.restaurantId,
          name: it.restaurantName || "Restaurant",
          image: it.image || "",
          vendorId: it.restaurantId,
          orderType: "food",
          alreadyReviewed: reviews.food.has(`${key}:${String(order._id)}`),
        });
      }
    } else if (it.itemType !== "food" && it.productId) {
      const key = String(it.productId);
      if (!productMap.has(key)) {
        productMap.set(key, {
          type: "product",
          orderId: String(order._id),
          productId: it.productId,
          name: it.name || "Product",
          image: it.image || "",
          vendorId: it.vendorId,
          orderType: "product",
          alreadyReviewed: reviews.product.has(`${key}:${String(order._id)}`),
        });
      }
    }
  }

  return [...productMap.values(), ...restaurantMap.values()];
}

/**
 * Decide whether a Notification row should be created for a single
 * pending-review item. Pure boolean helper.
 *
 *   - false if the order is not delivered
 *   - false if the customer has already reviewed this item
 *   - true otherwise
 */
function shouldCreateReviewNotification(item, isDelivered, alreadyReviewed) {
  if (!isDelivered) return false;
  if (!item) return false;
  if (alreadyReviewed) return false;
  return true;
}

/**
 * Validate a rating value. Pure function. Returns null if valid, an
 * error message string if not.
 */
function validateRating(rating) {
  const n = Number(rating);
  if (!Number.isFinite(n)) return "Rating must be a number";
  if (n < 1 || n > 5) return "Rating must be between 1 and 5";
  if (!Number.isInteger(n)) return "Rating must be a whole number (1-5)";
  return null;
}

/**
 * Send "your order is delivered — leave a review" notifications.
 *
 * Side effects:
 *   - Inserts one Notification per unique product (or per restaurant
 *     for food items) in the order, skipping items the customer has
 *     already reviewed for this order.
 *   - Emits a socket "review_request" event to the user's room so the
 *     bell updates live.
 *
 * Failures are logged but never thrown — notification delivery must
 * not block the order status update.
 */
async function notifyOrderDelivered(order, io) {
  if (!order || order.orderStatus !== "delivered") {
    logger.log(`[Notification] notifyOrderDelivered: order ${order?._id} not delivered, skipping`);
    return { created: 0, skipped: 0 };
  }

  // Lazy-load review models to avoid circular requires (ProductReview
  // and RestaurantReview are only needed in this code path).
  const ProductReview = require("../models/ProductReview");
  const RestaurantReview = require("../models/RestaurantReview");
  const Notification = require("../models/Notification");
  const { getIO } = require("./socket-helper");

  try {
    // Find all existing reviews for this order so we don't notify
    // for items the customer has already reviewed.
    const orderId = order._id;
    const [productReviews, restaurantReviews] = await Promise.all([
      ProductReview.find({ orderId }).select("productId").lean(),
      RestaurantReview.find({ orderId }).select("restaurantId").lean(),
    ]);
    const existingReviews = {
      product: new Set(productReviews.map((r) => `${String(r.productId)}:${String(orderId)}`)),
      food: new Set(restaurantReviews.map((r) => `${String(r.restaurantId)}:${String(orderId)}`)),
    };

    const items = buildPendingReviewItems(order, existingReviews);
    const eligible = items.filter((it) => !it.alreadyReviewed);

    let created = 0;
    let skipped = items.length - eligible.length;

    for (const item of eligible) {
      const isProduct = item.type === "product";
      const title = isProduct ? "How was your order?" : "How was your meal?";
      const message = isProduct
        ? `Leave a review for ${item.name}`
        : `Leave a review for ${item.name}`;

      const metadata = isProduct
        ? {
            orderId: String(orderId),
            productId: String(item.productId),
            productName: item.name,
            productImage: item.image,
            vendorId: String(item.vendorId || ""),
            orderType: "product",
          }
        : {
            orderId: String(orderId),
            restaurantId: String(item.restaurantId),
            restaurantName: item.name,
            vendorId: String(item.vendorId || item.restaurantId || ""),
            orderType: "food",
          };

      try {
        await Notification.create({
          userId: order.userId,
          type: "review_request",
          title,
          message,
          referenceId: orderId,
          referenceType: "order",
          metadata,
        });
        created += 1;
      } catch (err) {
        logger.log(`[Notification] Failed to create review_request for order ${orderId} item ${item.name}: ${err.message}`);
      }
    }

    // Live socket push: emit one event per eligible item so the bell
    // can refresh even if the server is unreachable. The frontend
    // bell listens for "user-notification" on the user's room.
    const socket = io || getIO();
    if (socket && created > 0) {
      try {
        socket.to(`user:${String(order.userId)}`).emit("user-notification", {
          type: "review_request",
          orderId: String(orderId),
          count: created,
        });
      } catch (err) {
        logger.log(`[Notification] Failed to emit socket push for review_request: ${err.message}`);
      }
    }

    logger.log(`[Notification] notifyOrderDelivered for order ${orderId}: created=${created}, skipped=${skipped}`);
    return { created, skipped };
  } catch (err) {
    // Never throw — notification failures must not break the order flow.
    console.error(`[Notification] Error in notifyOrderDelivered for order ${order?._id}:`, err.message);
    return { created: 0, skipped: 0 };
  }
}

module.exports = {
  notifyOrderCreated,
  notifyOrderStatusUpdate,
  notifyOrderDelivered,
  buildPendingReviewItems,
  shouldCreateReviewNotification,
  validateRating,
  sendSMSNotification,
  sendPushNotification,
  wasNotificationSent,
  markNotificationSent,
};