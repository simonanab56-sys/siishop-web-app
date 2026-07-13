"use strict";

const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const Order = require("../models/Order");
const ProductReview = require("../models/ProductReview");
const RestaurantReview = require("../models/RestaurantReview");
const { buildPendingReviewItems } = require("../services/notification.service");
const {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
} = require("../services/withdrawal-notification.service");

// Apply auth to all routes
router.use(requireAuth);

/**
 * GET /api/notifications
 * Get user notifications
 */
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    const result = await getUserNotifications(req.user.userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unreadOnly === "true",
    });
    res.json(result);
  } catch (error) {
    console.error("[NOTIFICATIONS] Error getting notifications:", error.message);
    res.status(500).json({ error: "Failed to get notifications" });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get unread notification count
 */
router.get("/unread-count", async (req, res) => {
  try {
    const Notification = require("../models/Notification");
    const count = await Notification.getUnreadCount(req.user.userId);
    res.json({ count });
  } catch (error) {
    console.error("[NOTIFICATIONS] Error getting unread count:", error.message);
    res.status(500).json({ error: "Failed to get unread count" });
  }
});

/**
 * POST /api/notifications/:id/read
 * Mark notification as read
 */
router.post("/:id/read", async (req, res) => {
  try {
    const notification = await markAsRead(req.params.id, req.user.userId);
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }
    res.json(notification);
  } catch (error) {
    console.error("[NOTIFICATIONS] Error marking as read:", error.message);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read
 */
router.post("/read-all", async (req, res) => {
  try {
    const result = await markAllAsRead(req.user.userId);
    res.json(result);
  } catch (error) {
    console.error("[NOTIFICATIONS] Error marking all as read:", error.message);
    res.status(500).json({ error: "Failed to mark all as read" });
  }
});

/**
 * GET /api/notifications/pending-reviews
 *
 * Aggregated list of items the current customer can still review,
 * across ALL of their delivered orders. Used by the bell's quick
 * action and the OrdersPage header. Each entry is the same shape
 * returned by GET /api/orders/:id/pending-reviews, with the source
 * `orderId` included so the frontend knows where to navigate.
 */
router.get("/pending-reviews", async (req, res) => {
  try {
    const userId = req.user.userId;

    // Find all delivered orders for this user. Lean for speed; the
    // list is bounded by typical customer order history.
    const orders = await Order.find({ userId, orderStatus: "delivered" })
      .sort({ deliveredAt: -1 })
      .limit(20)
      .lean();

    if (!orders.length) {
      return res.json({ items: [] });
    }

    // Pull all existing reviews for these orders in one round trip.
    const orderIds = orders.map((o) => o._id);
    const [productReviews, restaurantReviews] = await Promise.all([
      ProductReview.find({ orderId: { $in: orderIds } })
        .select("orderId productId")
        .lean(),
      RestaurantReview.find({ orderId: { $in: orderIds } })
        .select("orderId restaurantId")
        .lean(),
    ]);

    const allItems = [];
    for (const order of orders) {
      const existingReviews = {
        product: new Set(
          productReviews
            .filter((r) => String(r.orderId) === String(order._id))
            .map((r) => `${String(r.productId)}:${String(order._id)}`)
        ),
        food: new Set(
          restaurantReviews
            .filter((r) => String(r.orderId) === String(order._id))
            .map((r) => `${String(r.restaurantId)}:${String(order._id)}`)
        ),
      };
      const items = buildPendingReviewItems(order, existingReviews);
      // Only surface items the user has NOT yet reviewed, and only
      // items the user actually bought (defensive â€” should always be
      // true given the query, but cheap to check).
      for (const it of items) {
        if (!it.alreadyReviewed) allItems.push(it);
      }
    }

    res.json({ items: allItems });
  } catch (error) {
    console.error("[NOTIFICATIONS] Error getting pending reviews:", error.message);
    res.status(500).json({ error: "Failed to get pending reviews" });
  }
});



// ═══════════════════════════════════════════════════════════════════════════
// PHASE-2 ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

const { requireAdmin } = require("../middleware/auth");
const User = require("../models/User");
const Broadcast = require("../models/Broadcast");
const {
  notifyByAudience,
  validateBroadcastInput,
  buildAudienceQuery,
  isInDnd,
  shouldNotifyByType,
} = require("../services/notification.service");

/**
 * DELETE /api/notifications/:id
 * Delete a single notification (owner only).
 */
router.delete("/:id", async (req, res) => {
  try {
    const Notification = require("../models/Notification");
    const deleted = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });
    if (!deleted) return res.status(404).json({ error: "Notification not found" });
    res.json({ ok: true });
  } catch (error) {
    console.error("[NOTIFICATIONS] Error deleting notification:", error.message);
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

/**
 * DELETE /api/notifications
 * Clear all READ notifications for the current user. Unread are kept.
 */
router.delete("/", async (req, res) => {
  try {
    const Notification = require("../models/Notification");
    const r = await Notification.deleteMany({ userId: req.user.userId, isRead: true });
    res.json({ deleted: r.deletedCount || 0 });
  } catch (error) {
    console.error("[NOTIFICATIONS] Error clearing notifications:", error.message);
    res.status(500).json({ error: "Failed to clear notifications" });
  }
});

/**
 * POST /api/notifications
 * Admin broadcast. Resolves the audience to a set of users and calls
 * `notifyUser()` for each. Persists a Broadcast row for history.
 */
router.post("/", requireAdmin, async (req, res) => {
  try {
    const err = validateBroadcastInput(req.body);
    if (err) return res.status(400).json({ error: err });

    const {
      audience, filters, selectedUserIds,
      title, message, image, deepLink, priority, expiresAt,
      scheduledFor, sendEmail,
    } = req.body;

    // If scheduled, persist a draft Broadcast and let the in-process
    // scheduler pick it up. Otherwise dispatch immediately.
    if (scheduledFor) {
      const draft = await Broadcast.create({
        audience,
        filters: filters || {},
        selectedUserIds: audience === "selected" ? (selectedUserIds || []) : [],
        title, message, image, deepLink, priority,
        sendEmail: !!sendEmail,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        scheduledFor: new Date(scheduledFor),
        status: "scheduled",
        createdBy: req.user.userId,
      });
      return res.json({ ok: true, broadcastId: draft._id, status: "scheduled" });
    }

    // Immediate dispatch
    const result = await notifyByAudience({
      audience,
      filters,
      selectedUserIds,
      sender: req.user.userId,
      payload: {
        type: "system_announcement",
        title,
        message,
        image,
        deepLink,
        priority: priority || "medium",
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        sendEmail: !!sendEmail,
      },
    });

    await Broadcast.create({
      audience,
      filters: filters || {},
      selectedUserIds: audience === "selected" ? (selectedUserIds || []) : [],
      title, message, image, deepLink, priority,
      sendEmail: !!sendEmail,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      status: "sent",
      sentAt: new Date(),
      matchedCount: result.matched,
      sentCount: result.sent,
      createdBy: req.user.userId,
    });

    res.json({ ok: true, status: "sent", matched: result.matched, sent: result.sent });
  } catch (error) {
    console.error("[NOTIFICATIONS] Admin broadcast failed:", error.message);
    res.status(500).json({ error: "Broadcast failed" });
  }
});

/**
 * GET /api/notifications/broadcasts
 * Admin: list the last 20 broadcasts.
 */
router.get("/broadcasts", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const list = await Broadcast.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("createdBy", "name email")
      .lean();
    res.json({ broadcasts: list });
  } catch (error) {
    console.error("[NOTIFICATIONS] Error listing broadcasts:", error.message);
    res.status(500).json({ error: "Failed to list broadcasts" });
  }
});

/**
 * GET /api/notifications/preferences
 * Returns the current user's notificationPrefs (or defaults).
 */
router.get("/preferences", async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("notificationPrefs").lean();
    const defaults = {
      push: true, email: true, inApp: true,
      promotional: true, orderUpdates: true, walletUpdates: true,
      reviewReminders: true, marketing: false,
      dndStart: "", dndEnd: "",
    };
    res.json({ preferences: { ...defaults, ...(user?.notificationPrefs || {}) } });
  } catch (error) {
    console.error("[NOTIFICATIONS] Error getting prefs:", error.message);
    res.status(500).json({ error: "Failed to get preferences" });
  }
});

/**
 * PUT /api/notifications/preferences
 * Update the current user's notificationPrefs.
 */
router.put("/preferences", async (req, res) => {
  try {
    const allowed = ["push", "email", "inApp", "promotional", "orderUpdates", "walletUpdates", "reviewReminders", "marketing", "dndStart", "dndEnd"];
    const update = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) update[`notificationPrefs.${k}`] = req.body[k];
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "No recognized fields" });
    }
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: update },
      { new: true }
    ).select("notificationPrefs").lean();
    res.json({ preferences: user?.notificationPrefs || {} });
  } catch (error) {
    console.error("[NOTIFICATIONS] Error updating prefs:", error.message);
    res.status(500).json({ error: "Failed to update preferences" });
  }
});

/**
 * POST /api/notifications/device-token
 * Register a device token for Web Push / FCM delivery.
 */
router.post("/device-token", async (req, res) => {
  try {
    const { token, platform, userAgent } = req.body || {};
    if (!token || typeof token !== "string") return res.status(400).json({ error: "token required" });
    const plat = ["web", "android", "ios"].includes(platform) ? platform : "web";
    // Upsert: remove existing same-token entry, then push a new one
    await User.findByIdAndUpdate(req.user.userId, {
      $pull: { deviceTokens: { token } },
    });
    await User.findByIdAndUpdate(req.user.userId, {
      $push: { deviceTokens: { token, platform: plat, userAgent: userAgent || "", createdAt: new Date() } },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error("[NOTIFICATIONS] Error registering device token:", error.message);
    res.status(500).json({ error: "Failed to register device token" });
  }
});

/**
 * DELETE /api/notifications/device-token
 * Remove a device token (logout, opt-out, etc).
 */
router.delete("/device-token", async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: "token required" });
    await User.findByIdAndUpdate(req.user.userId, {
      $pull: { deviceTokens: { token } },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error("[NOTIFICATIONS] Error removing device token:", error.message);
    res.status(500).json({ error: "Failed to remove device token" });
  }
});
module.exports = router;
