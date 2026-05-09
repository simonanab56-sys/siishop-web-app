"use strict";
const mongoose = require("mongoose");
const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }, // ✅ CRITICAL: Top-level vendor reference for aggregation
    customerName: String,
    customerEmail: String,
    customerPhone: String,
    deliveryAddress: String,
    items: [
      {
        productId: mongoose.Schema.Types.ObjectId,
        name: String,
        description: String,  // ✅ ADDED: Product description
        price: Number,
        quantity: Number,
        image: String,  // ✅ ADDED: Product image for order display
        vendorId: mongoose.Schema.Types.ObjectId,
      },
    ],
    totalAmount: Number,
    paymentMethod: {
      type: String,
      enum: ["paystack", "cash"],
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    // paymentRef is the Paystack transaction reference.
    // Only set for online payments - COD orders don't have paymentRef.
    // The partial unique index ensures uniqueness only when paymentRef exists.
    paymentRef: String,
    orderStatus: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "preparing",
        "out_for_delivery",
        "delivered",
      ],
      default: "pending",
    },
    // ✅ ADDED: Track if order used promo code
    fromPromo: {
      type: Boolean,
      default: false,
    },
    // ✅ ADDED: Track if revenue was already added (prevent double-counting)
    _revenueTracked: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);
/*
 * Partial unique index on paymentRef.
 *
 * partialFilterExpression — only enforces uniqueness when paymentRef exists and is not null.
 * This allows multiple COD orders without paymentRef without duplicate key errors.
 * unique — prevents duplicate Paystack refs creating two orders.
 * Also serves as an idempotency guard: if Paystack calls the webhook twice for the same ref,
 * MongoDB rejects the second upsert / duplicate insert.
 */
// ✅ FIX: Partial unique index - only enforces uniqueness when paymentRef exists and is not null
// This allows multiple COD orders without paymentRef without causing duplicate key errors
orderSchema.index(
  { paymentRef: 1 },
  { unique: true, partialFilterExpression: { paymentRef: { $exists: true, $ne: null } } }
);
// ✅ ADDED: Performance indexes for common queries
orderSchema.index({ userId: 1, createdAt: -1 });  // For "my orders" listing
orderSchema.index({ paymentStatus: 1 });          // For payment queries
orderSchema.index({ orderStatus: 1 });            // For status queries
orderSchema.index({ createdAt: -1 });             // For sorting by date
orderSchema.index({ "items.vendorId": 1 });      // For vendor order queries
module.exports = mongoose.model("Order", orderSchema);
