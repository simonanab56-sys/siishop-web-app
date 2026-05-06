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
    // For paystack orders it is unique; cash orders leave it null.
    // The unique+sparse index is defined via schema.index() below
    // (inline index options can't express sparse+unique together).
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
 * Unique index on paymentRef with sparse: true.
 *
 * sparse — allows many null values (cash orders have no paymentRef).
 * unique  — prevents duplicate Paystack refs creating two orders.
 *          Also serves as an idempotency guard: if Paystack calls the
 *          webhook twice for the same ref, MongoDB rejects the second
 *          upsert / duplicate insert.
 */
orderSchema.index({ paymentRef: 1 }, { unique: true, sparse: true });
// ✅ ADDED: Performance indexes for common queries
orderSchema.index({ userId: 1, createdAt: -1 });  // For "my orders" listing
orderSchema.index({ paymentStatus: 1 });          // For payment queries
orderSchema.index({ orderStatus: 1 });            // For status queries
orderSchema.index({ createdAt: -1 });             // For sorting by date
orderSchema.index({ "items.vendorId": 1 });      // For vendor order queries
module.exports = mongoose.model("Order", orderSchema);
