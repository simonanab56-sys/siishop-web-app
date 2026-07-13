"use strict";
const mongoose = require("mongoose");

/**
 * Broadcast — admin-issued manual announcements.
 *
 * Persisted both for history (the "Last 10 broadcasts" table in the
 * admin UI) and for scheduling (the in-process scheduler polls for
 * scheduled broadcasts that have come due). A status field tracks
 * lifecycle: draft → scheduled → sent (or failed).
 *
 * Recipients are resolved at dispatch time via `notifyByAudience()`,
 * so the audience/filters columns are always stored — even for
 * "sent" broadcasts — so they can be re-sent from the history.
 */
const broadcastSchema = new mongoose.Schema(
  {
    audience: {
      type: String,
      enum: ["all", "customers", "vendors", "restaurants", "admins", "selected"],
      required: true,
    },
    filters: {
      country: { type: String, default: "" },
      city: { type: String, default: "" },
      vendorType: { type: String, default: "" },
      vendorStatus: { type: String, default: "" },
      category: { type: String, default: "" },
    },
    selectedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Composer fields
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    image: { type: String, default: "" },
    deepLink: { type: String, default: "" },
    priority: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium",
    },
    sendEmail: { type: Boolean, default: false },
    expiresAt: { type: Date },
    // Scheduling + lifecycle
    scheduledFor: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["draft", "scheduled", "sent", "failed"],
      default: "draft",
      index: true,
    },
    matchedCount: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failureReason: { type: String, default: "" },
    // Audit
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

broadcastSchema.index({ createdAt: -1 });
broadcastSchema.index({ status: 1, scheduledFor: 1 });

module.exports = mongoose.model("Broadcast", broadcastSchema);
