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

module.exports = {
  notifyOrderCreated,
  notifyOrderStatusUpdate,
  sendSMSNotification,
  sendPushNotification,
  wasNotificationSent,
  markNotificationSent,
};