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
      // ── Withdrawal flow (existing) ────────────────────────────────────
      "withdrawal_submitted",
      "withdrawal_approved",
      "withdrawal_processing",
      "withdrawal_completed",
      "withdrawal_rejected",
      "withdrawal_cancelled",
      // ── Order flow (existing + new) ──────────────────────────────────
      "order_new",
      "order_status",
      "order_placed",
      "order_accepted",
      "order_preparing",
      "order_packed",
      "rider_assigned",
      "out_for_delivery",
      // ── Payment / Refund / Cancellation ─────────────────────────────
      "payment_received",
      "payment_succeeded",
      "payment_failed",
      "refund_processed",
      "refund_request",
      "cancellation_approved",
      // ── Commissions ─────────────────────────────────────────────────
      "commission_due",
      "commission_paid",
      "commission_generated",
      "commission_overdue",
      // ── Wishlist (existing) ─────────────────────────────────────────
      "wishlist_price_drop",
      "wishlist_stock_available",
      // ── Reviews (existing) ──────────────────────────────────────────
      "review_request",
      "new_review",
      // ── Promotional / Marketing ─────────────────────────────────────
      "coupon_received",
      "promo_available",
      "flash_sale",
      // ── Account / Security ─────────────────────────────────────────
      "account_suspended",
      "account_restored",
      "password_changed",
      "password_reset",
      // ── Vendor product lifecycle ───────────────────────────────────
      "product_approved",
      "product_rejected",
      "product_hidden",
      "product_out_of_stock",
      "product_low_stock",
      // ── Vendor / restaurant KYC + approval ─────────────────────────
      "kyc_submitted",
      "kyc_approved",
      "kyc_rejected",
      "store_approved",
      "store_suspended",
      "store_restored",
      "store_rejected",
      "restaurant_approved",
      "restaurant_rejected",
      "restaurant_suspended",
      "restaurant_restored",
      "menu_item_approved",
      "menu_item_rejected",
      // ── Admin: new registrations / pending approvals ───────────────
      "new_customer_registration",
      "new_vendor_registration",
      "new_restaurant_registration",
      "new_product_pending",
      "new_restaurant_pending",
      // ── Reports / Forms / Tickets ───────────────────────────────────
      "vendor_report",
      "customer_report",
      "restaurant_report",
      "contact_form",
      "support_ticket",
      "support_reply",
      // ── System / generic ───────────────────────────────────────────
      "system_error",
      "system",
      "system_announcement",
      // ── Welcome (new user) ─────────────────────────────────────────
      "welcome",
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
  // Polymorphic FK
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
  },
  referenceType: {
    type: String,
    enum: ["withdrawal", "order", "commission", "product", "restaurant", "menu_item", "review", "broadcast", null],
  },
  // ── First-class entity fields (new) ──────────────────────────────
  // These promote what used to live in `metadata` blobs to indexed
  // top-level fields so admin/list queries can filter without JSON
  // scans. `metadata` is preserved for back-compat with any existing
  // readers and to carry ad-hoc fields we haven't promoted yet.
  orderId:      { type: mongoose.Schema.Types.ObjectId, ref: "Order",  index: true },
  productId:    { type: mongoose.Schema.Types.ObjectId, ref: "Product", index: true },
  restaurantId: { type: mongoose.Schema.Types.ObjectId, index: true },
  menuItemId:   { type: mongoose.Schema.Types.ObjectId, index: true },
  vendorId:     { type: mongoose.Schema.Types.ObjectId, ref: "User",   index: true },
  withdrawalId: { type: mongoose.Schema.Types.ObjectId, index: true },
  commissionId: { type: mongoose.Schema.Types.ObjectId, index: true },
  reviewId:     { type: mongoose.Schema.Types.ObjectId, index: true },
  // ── Sender (actor that triggered the notification, if any) ───────
  sender:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  senderType: { type: String, enum: ["system", "admin", "vendor", "user"] },
  // ── Priority + expiry (new) ───────────────────────────────────────
  priority: { type: String, enum: ["high", "medium", "low"], default: "medium", index: true },
  expiresAt: { type: Date, index: true },     // TTL-friendly
  // ── Visual + navigation (new) ────────────────────────────────────
  image: String,                              // optional hero image
  deepLink: String,                           // app path, e.g. "/orders/123"
  // ── Read state (existing) ────────────────────────────────────────
  isRead: {
    type: Boolean,
    default: false,
  },
  readAt: Date,
  // ── Flexible data (existing) ────────────────────────────────────
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, { timestamps: true });

// Index for common queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, type: 1, createdAt: -1 });

// Idempotency guard for commission_paid notifications: a Paystack
// reference can only generate ONE in-app notification. Other
// notification types that use metadata.paymentRef are not
// constrained (the partial filter scopes the uniqueness).
notificationSchema.index(
  { "metadata.paymentRef": 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "commission_paid",
      "metadata.paymentRef": { $exists: true, $type: "string" },
    },
    name: "uniq_commission_paid_paymentRef",
  }
);

// Static method to count unread
notificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({ userId, isRead: false });
};

module.exports = mongoose.model("Notification", notificationSchema);
