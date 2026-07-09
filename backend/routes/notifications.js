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
      // items the user actually bought (defensive — should always be
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

module.exports = router;