"use strict";
const mongoose = require("mongoose");

const notificationLogSchema = new mongoose.Schema({
  // Notification type
  type: {
    type: String,
    required: true,
    enum: ["email", "sms", "whatsapp", "in_app", "push"],
  },
  // Recipient info
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  recipientEmail: String,
  recipientPhone: String,
  // What triggered this notification
  trigger: {
    type: String,
    enum: ["withdrawal_submitted", "withdrawal_approved", "withdrawal_processing", "withdrawal_completed", "withdrawal_rejected", "order_created", "order_status", "system"],
  },
  // Reference to related object
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
  },
  referenceType: {
    type: String,
    enum: ["withdrawal", "order", "user", null],
  },
  // Delivery status
  status: {
    type: String,
    enum: ["pending", "sent", "delivered", "failed"],
    default: "pending",
  },
  // Error message if failed
  errorMessage: String,
  // Email specific
  emailSubject: String,
  emailTo: String,
  // SMS/WhatsApp specific
  messageContent: String,
  provider: String,
  externalRef: String,
}, { timestamps: true });

// Indexes for querying
notificationLogSchema.index({ createdAt: -1 });
notificationLogSchema.index({ recipientId: 1, createdAt: -1 });
notificationLogSchema.index({ type: 1, status: 1 });
notificationLogSchema.index({ referenceId: 1, referenceType: 1 });

module.exports = mongoose.model("NotificationLog", notificationLogSchema);