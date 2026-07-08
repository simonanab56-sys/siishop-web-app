"use strict";
const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema({
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Wallet",
    required: true,
    index: true,
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  // Transaction type
  type: {
    type: String,
    enum: [
      "order_earning",     // online-payment earnings credited to vendor
      "commission",        // platform commission realized on a paid order
      "commission_due",    // commission accrued on a COD order at delivery
      "commission_payment",// vendor settles commission owed via Paystack
      "cod_sale_recorded", // gross COD sale tracked (no wallet credit)
      "withdrawal",
      "refund",
      "adjustment",
      "held",              // funds held during holding period
      "pending_release",   // held funds still in the queue
      "released",          // held funds released to available
    ],
    required: true,
  },
  // Amount in minor units (GHS = pesewas)
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  // Running balance after this transaction
  balanceAfter: {
    type: Number,
    required: true,
    min: 0,
  },
  // Reference to order (if applicable)
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
  },
  // Reference to withdrawal (if applicable)
  withdrawalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Withdrawal",
  },
  // Reference to gateway payment (Paystack, etc.) — used for
  // idempotency lookups on commission_payment and any future
  // gateway-settled transaction. Indexed so verify can do an
  // O(log n) "already-processed?" check.
  paymentRef: {
    type: String,
    index: true,
    sparse: true,
  },
  // Status
  status: {
    type: String,
    enum: ["pending", "completed", "failed", "cancelled"],
    default: "completed",
  },
  // Description
  description: {
    type: String,
  },
  // Metadata (for flexible data)
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  // Holding period expiry (for held funds)
  heldUntil: {
    type: Date,
  },
}, { timestamps: true });

// Compound indexes for common queries
walletTransactionSchema.index({ vendorId: 1, createdAt: -1 });
walletTransactionSchema.index({ walletId: 1, createdAt: -1 });
walletTransactionSchema.index({ orderId: 1 });
walletTransactionSchema.index({ type: 1, createdAt: -1 });

// Race-proof idempotency for commission_payment: a Paystack
// reference can only mint one commission_payment WalletTransaction.
// The partial filter scopes the uniqueness to commission_payment
// rows only, so other future transaction types that use
// `paymentRef` (refund_payment, withdrawal_payment, etc.) are not
// constrained. The service-level findOne() in wallet.service.js
// #payCommission stays as a fast path that avoids the E11000
// round-trip; this index is the ultimate guarantee.
walletTransactionSchema.index(
  { paymentRef: 1 },
  {
    unique: true,
    partialFilterExpression: { type: "commission_payment" },
    name: "uniq_commission_payment_ref",
  }
);

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);