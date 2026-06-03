"use strict";
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: [
      "withdrawal_submitted",
      "withdrawal_approved",
      "withdrawal_processing",
      "withdrawal_completed",
      "withdrawal_rejected",
      "withdrawal_cancelled",
      "order_new",
      "order_status",
      "payment_received",
      "commission_due",
      "wishlist_price_drop",
      "wishlist_stock_available",
      "system",
    ],
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  // Reference to related object (withdrawal, order, etc.)
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
  },
  referenceType: {
    type: String,
    enum: ["withdrawal", "order", "commission", "product", null],
  },
  // Status
  isRead: {
    type: Boolean,
    default: false,
  },
  readAt: Date,
  // Metadata for flexible data
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, { timestamps: true });

// Index for common queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

// Static method to count unread
notificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({ userId, isRead: false });
};

module.exports = mongoose.model("Notification", notificationSchema);