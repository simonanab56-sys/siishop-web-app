"use strict";

const Order = require("../models/Order");
const User = require("../models/User");
const Notification = require("../models/Notification");
const logger = require("../utils/logger");
const { sendEmail } = require("./email.service");
const { getIO } = require("./socket-helper");
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
          orderId: orderId,
          productId: isProduct ? item.productId : undefined,
          restaurantId: !isProduct ? item.restaurantId : undefined,
          vendorId: item.vendorId,
          deepLink: `/review?orderId=${orderId}`,
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

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-2: GENERIC NOTIFY + AUDIENCE-BASED BROADCASTS
// ═══════════════════════════════════════════════════════════════════════════
//
// notifyUser() is the single entry-point every event site uses. It:
//   1) loads the user's notificationPrefs
//   2) skips if the user is in their DND window
//   3) skips if the type is opt-out for that user
//   4) creates the in-app Notification row
//   5) emits a socket event to the user's room
//   6) optionally sends email (explicit opt-in per call)
//   7) calls the Web Push stub for any registered device tokens
//
// notifyAdmins() and notifyByAudience() are fan-out helpers for the
// admin broadcast page. Both are pure async functions; the
// `buildAudienceQuery` and `validateBroadcastInput` helpers are also
// exported so they can be unit-tested in isolation.

/**
 * Map a notification type to its preference key. Pure helper.
 *   - order_* / rider_* → orderUpdates
 *   - commission_* / wallet / refund → walletUpdates
 *   - review_request → reviewReminders
 *   - coupon / promo / flash_sale / wishlist_price_drop / wishlist_stock_available → promotional
 *   - everything else → null (no per-type opt-out, channel opt-out still applies)
 */
function prefKeyForType(type) {
  if (!type) return null;
  if (type.startsWith("order_") || type === "rider_assigned" || type === "out_for_delivery" || type === "order_new" || type === "order_status") return "orderUpdates";
  if (type === "review_request") return "reviewReminders";
  if (type.startsWith("commission_") || type.startsWith("withdrawal_") || type === "refund_processed" || type === "refund_request" || type === "payment_succeeded" || type === "payment_failed") return "walletUpdates";
  if (type === "coupon_received" || type === "promo_available" || type === "flash_sale" || type === "wishlist_price_drop" || type === "wishlist_stock_available") return "promotional";
  return null;
}

/**
 * Decide whether the notification should be delivered based on the
 * user's per-category preferences. Pure function.
 *   - if prefs is undefined/null → allow (defaults to true)
 *   - if no preference key for the type → allow
 *   - if the preference key is false → suppress
 */
function shouldNotifyByType(prefs, type) {
  if (!prefs) return true;
  const key = prefKeyForType(type);
  if (!key) return true;
  return prefs[key] !== false;
}

/**
 * Parse a "HH:MM" time string into minutes-since-midnight. Pure.
 * Returns null if the input is empty/invalid.
 */
function parseTimeOfDay(str) {
  if (!str || typeof str !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(str.trim());
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/**
 * Return true if `now` (a Date or minutes-since-midnight) is inside
 * the user's DND window. Handles overnight windows (e.g. 22:00-07:00)
 * correctly. Pure function.
 */
function isInDnd(prefs, now) {
  if (!prefs || !prefs.dndStart || !prefs.dndEnd) return false;
  const start = parseTimeOfDay(prefs.dndStart);
  const end = parseTimeOfDay(prefs.dndEnd);
  if (start === null || end === null) return false;
  if (start === end) return false; // a zero-length window is treated as "no DND"

  const minutes = typeof now === "number"
    ? now
    : (now instanceof Date ? now.getHours() * 60 + now.getMinutes() : null);
  if (minutes === null) return false;

  if (start < end) {
    return minutes >= start && minutes < end;
  }
  // wraps midnight
  return minutes >= start || minutes < end;
}

/**
 * Stub: would call web-push / FCM / APNs. Currently logs the action.
 */
async function sendWebPushStub(deviceTokens, payload) {
  for (const dt of deviceTokens || []) {
    const tok = (dt.token || "").substring(0, 8);
    logger.log(`[WebPush] → ${dt.platform || "web"} ${tok}… "${payload.title}"`);
  }
}

/**
 * Send a single notification to a single user, honouring their
 * preferences. Returns `{ created, _id, reason? }`.
 *
 * The function never throws. All errors are caught and logged so
 * callers can fire-and-forget without breaking the primary action.
 */
async function notifyUser(userId, opts) {
  if (!userId) return { created: false, reason: "no_user" };
  if (!opts || !opts.type || !opts.title) return { created: false, reason: "missing_fields" };

  try {
    const user = await User.findById(userId)
      .select("email notificationPrefs deviceTokens")
      .lean();
    if (!user) return { created: false, reason: "user_not_found" };

    // DND
    if (isInDnd(user.notificationPrefs)) {
      return { created: false, reason: "dnd" };
    }
    // Per-category preference
    if (!shouldNotifyByType(user.notificationPrefs, opts.type)) {
      return { created: false, reason: "preference_off" };
    }

    // 1) In-app row
    let notif = null;
    if (user.notificationPrefs?.inApp !== false) {
      const referenceId = opts.referenceId || opts.orderId || opts.productId || opts.restaurantId || opts.withdrawalId || opts.commissionId || opts.reviewId;
      const referenceType = opts.referenceType || (
        opts.orderId ? "order" :
        opts.productId ? "product" :
        opts.restaurantId ? "restaurant" :
        opts.withdrawalId ? "withdrawal" :
        opts.commissionId ? "commission" :
        opts.reviewId ? "review" : null
      );
      notif = await Notification.create({
        userId,
        type: opts.type,
        title: opts.title,
        message: opts.message || "",
        referenceId,
        referenceType,
        orderId: opts.orderId,
        productId: opts.productId,
        restaurantId: opts.restaurantId,
        menuItemId: opts.menuItemId,
        vendorId: opts.vendorId,
        withdrawalId: opts.withdrawalId,
        commissionId: opts.commissionId,
        reviewId: opts.reviewId,
        sender: opts.sender,
        senderType: opts.senderType,
        priority: opts.priority || "medium",
        expiresAt: opts.expiresAt,
        image: opts.image,
        deepLink: opts.deepLink,
        metadata: opts.metadata || {},
      });
    }

    // 2) Socket push (always — the user's bell can refresh in real time)
    try {
      const io = getIO();
      if (io) {
        io.to(`user:${String(userId)}`).emit("user-notification", opts.socketPayload || {
          type: opts.type,
          title: opts.title,
          message: opts.message || "",
          _id: notif?._id,
          deepLink: opts.deepLink,
          priority: opts.priority || "medium",
          image: opts.image,
        });
      }
    } catch (err) {
      logger.log(`[notifyUser] socket emit failed: ${err.message}`);
    }

    // 3) Email (only if explicitly requested AND the user has email opt-in)
    if (opts.sendEmail && user.notificationPrefs?.email !== false && user.email) {
      try {
        const subject = opts.emailSubject || opts.title;
        const html = opts.emailHtml || `<p style="font-family:Arial,sans-serif">${opts.message || opts.title}</p>`;
        await sendEmail(user.email, subject, html);
      } catch (err) {
        logger.log(`[notifyUser] email send failed: ${err.message}`);
      }
    }

    // 4) Web Push stub (only if user has device tokens + push opt-in)
    if (user.notificationPrefs?.push !== false && user.deviceTokens?.length) {
      try {
        await sendWebPushStub(user.deviceTokens, { title: opts.title, message: opts.message, deepLink: opts.deepLink });
      } catch (err) {
        logger.log(`[notifyUser] web-push stub failed: ${err.message}`);
      }
    }

    return { created: !!notif, _id: notif?._id };
  } catch (err) {
    logger.log(`[notifyUser] error for userId=${userId} type=${opts?.type}: ${err.message}`);
    return { created: false, reason: "error", error: err.message };
  }
}

/**
 * Fan out a single notification to all admin users.
 */
async function notifyAdmins(opts) {
  const admins = await User.find({ isAdmin: true }).select("_id").lean();
  const results = await Promise.all(
    admins.map((a) => notifyUser(a._id, { ...opts, senderType: opts.senderType || "admin" }))
  );
  return { matched: admins.length, results };
}

/**
 * Build a Mongoose User query from the audience + filters block. Pure
 * helper — easy to unit-test without DB.
 */
function buildAudienceQuery(audience, filters) {
  const q = {};
  switch (audience) {
    case "all":
      // All non-admin users
      q.isAdmin = { $ne: true };
      break;
    case "customers":
      q.isAdmin = { $ne: true };
      q.isVendor = { $ne: true };
      break;
    case "vendors":
      q.isVendor = true;
      q.vendorType = { $ne: "restaurant" };
      if (filters?.vendorStatus) q.vendorStatus = filters.vendorStatus;
      break;
    case "restaurants":
      q.isVendor = true;
      q.vendorType = "restaurant";
      if (filters?.vendorStatus) q.vendorStatus = filters.vendorStatus;
      break;
    case "admins":
      q.isAdmin = true;
      break;
    case "selected":
      // Caller must supply `selectedUserIds`; this function does not
      // build the query in that case.
      return null;
    default:
      return null;
  }
  if (filters?.country) q["location.country"] = filters.country;
  if (filters?.city)    q["location.city"]    = filters.city;
  return q;
}

/**
 * Validate a broadcast input body. Pure. Returns null on success or
 * an error message string.
 */
function validateBroadcastInput(body) {
  if (!body || typeof body !== "object") return "Body required";
  if (!body.audience) return "audience is required";
  if (!["all", "customers", "vendors", "restaurants", "admins", "selected"].includes(body.audience)) {
    return "audience must be one of: all, customers, vendors, restaurants, admins, selected";
  }
  if (body.audience === "selected" && (!Array.isArray(body.selectedUserIds) || body.selectedUserIds.length === 0)) {
    return "selectedUserIds is required for audience=selected";
  }
  if (!body.title || typeof body.title !== "string" || !body.title.trim()) return "title is required";
  if (!body.message || typeof body.message !== "string" || !body.message.trim()) return "message is required";
  if (body.title.length > 200) return "title too long (max 200)";
  if (body.message.length > 2000) return "message too long (max 2000)";
  if (body.priority && !["high", "medium", "low"].includes(body.priority)) {
    return "priority must be: high, medium, low";
  }
  if (body.scheduledFor) {
    const d = new Date(body.scheduledFor);
    if (isNaN(d.getTime())) return "scheduledFor must be a valid ISO date";
    if (d.getTime() < Date.now() - 60 * 1000) return "scheduledFor must be in the future";
  }
  return null;
}

/**
 * Send a broadcast to a user-segment. The single entry point used by
 * `POST /api/notifications` (admin) and by the in-process scheduler
 * for `scheduledFor` jobs.
 */
async function notifyByAudience({ audience, filters, selectedUserIds, payload, sender }) {
  let userIds = [];
  if (audience === "selected") {
    userIds = (selectedUserIds || []).map(String);
  } else {
    const q = buildAudienceQuery(audience, filters);
    if (!q) return { matched: 0, sent: 0, reason: "invalid_audience" };
    const users = await User.find(q).select("_id").lean();
    userIds = users.map((u) => String(u._id));
  }
  const results = await Promise.all(
    userIds.map((id) => notifyUser(id, { ...payload, sender, senderType: sender ? "admin" : "system" }))
  );
  return {
    matched: userIds.length,
    sent: results.filter((r) => r.created).length,
  };
}

module.exports = {
  // Existing
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
  // Phase-2 additions
  notifyUser,
  notifyAdmins,
  notifyByAudience,
  isInDnd,
  shouldNotifyByType,
  buildAudienceQuery,
  validateBroadcastInput,
  sendWebPushStub,
  prefKeyForType,
  // Re-export for new event sites
  sendEmail,
};
