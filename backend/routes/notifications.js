"use strict";

const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
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

module.exports = router;