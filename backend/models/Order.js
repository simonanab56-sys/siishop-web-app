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
        originalPrice: Number,  // ✅ NEW: pre-sale price when product was discounted (for receipts)
        quantity: Number,
        image: String,  // ✅ ADDED: Product image for order display
        vendorId: mongoose.Schema.Types.ObjectId,
        // ✅ Restaurant/Food order fields
        itemType: { type: String, enum: ["food", "product"], default: "product" },
        menuItemId: mongoose.Schema.Types.ObjectId,
        restaurantId: mongoose.Schema.Types.ObjectId,
        restaurantName: String,
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
      // Canonical 6-status enum — single source of truth for both marketplace
      // and restaurant vendors. Legacy restaurant-only values (received,
      // ready, rider_assigned, on_the_way) were normalized to the canonical
      // set by migrations/migrateRestaurantOrderStatuses.js and removed here
      // as part of the restaurant-order unification.
      enum: [
        "pending",
        "confirmed",
        "preparing",
        "out_for_delivery",
        "delivered",
        "cancelled",
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
    // ✅ ADDED: Track if wallet earnings were already processed (prevent double-credit)
    // Mirrors _revenueTracked's role in services/revenue.js. Declared in the
    // schema so Mongoose's strict mode persists it; otherwise wallet.service.js
    // would silently strip the value and the idempotency check would always
    // re-process the order.
    _walletEarningsProcessed: {
      type: Boolean,
      default: false,
      index: true,
    },
    // ✅ Restaurant order support
    orderType: {
      type: String,
      enum: ["food", "product"],
      default: "product",
    },
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    restaurantName: String,
    /* ── Delivery Tracking Fields ── */
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    riderLocation: {
      lat: Number,
      lng: Number,
      speed: Number,
      heading: Number,
      updatedAt: Date,
    },
    deliveryStartedAt: Date,
    deliveredAt: Date,
    estimatedArrival: Date,
    deliveryAddressCoords: {
      lat: Number,
      lng: Number,
      address: String,
    },
    liveTrackingEnabled: { type: Boolean, default: false },
    deliveryCode: String, // For COD verification
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
// ✅ Delivery indexes
orderSchema.index({ riderId: 1, orderStatus: 1 }); // For rider orders
orderSchema.index({ deliveryStartedAt: -1 });     // For delivery monitoring
module.exports = mongoose.model("Order", orderSchema);
