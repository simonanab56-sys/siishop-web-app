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
    enum: ["order_earning", "commission", "withdrawal", "refund", "adjustment", "held", "released"],
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

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);