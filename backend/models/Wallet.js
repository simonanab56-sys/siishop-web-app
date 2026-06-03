"use strict";
const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
    index: true,
  },
  // Available balance - can be withdrawn (ONLY for online payments)
  availableBalance: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Pending balance - being held during holding period (ONLY for online payments)
  pendingBalance: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Total earned from online payments (lifetime)
  totalOnlineEarnings: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Total withdrawn (lifetime)
  totalWithdrawn: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Total commissions paid from online earnings (lifetime)
  totalCommissionPaid: {
    type: Number,
    default: 0,
    min: 0,
  },
  // ============ COD TRACKING FIELDS ============
  // Total COD sales (vendor collected cash from customers)
  totalCODSales: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Commission owed to SiiShop for COD orders
  commissionOwed: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Commission actually paid by vendor
  commissionPaid: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Currency (default GHS)
  currency: {
    type: String,
    default: "GHS",
  },
  // Is wallet active
  isActive: {
    type: Boolean,
    default: true,
  },
  // Bank details for withdrawals
  bankDetails: {
    bankName: String,
    accountNumber: String,
    accountName: String,
    branchCode: String,
  },
  // Mobile money details
  mobileMoneyDetails: {
    provider: {
      type: String,
      enum: ["mtn", "telecel", "airteltigo", null],
    },
    phoneNumber: String,
    accountName: String,
  },
}, { timestamps: true });

// Compound index for querying wallets by vendor
walletSchema.index({ vendorId: 1 });

module.exports = mongoose.model("Wallet", walletSchema);