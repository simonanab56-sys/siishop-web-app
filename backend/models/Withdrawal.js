"use strict";
const mongoose = require("mongoose");

const withdrawalSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Wallet",
    required: true,
  },
  // Amount requested in GHS (minor units)
  amount: {
    type: Number,
    required: true,
    min: 1,
  },
  // Withdrawal method
  method: {
    type: String,
    enum: ["bank_transfer", "mobile_money"],
    required: true,
  },
  // For bank transfers
  bankDetails: {
    bankName: String,
    accountNumber: String,
    accountName: String,
    branchCode: String,
  },
  // For mobile money
  mobileMoneyDetails: {
    provider: {
      type: String,
      enum: ["mtn", "telecel", "airteltigo"],
    },
    phoneNumber: String,
    accountName: String,
  },
  // Status
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "processing", "completed", "failed"],
    default: "pending",
    index: true,
  },
  // Admin who approved/rejected
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  reviewedAt: Date,
  // Rejection reason
  rejectionReason: String,
  // External reference (e.g., Paystack transfer ref)
  externalRef: String,
  // Processing notes
  notes: String,
  // Fee charged (if any)
  fee: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Net amount (amount - fee)
  netAmount: {
    type: Number,
    required: true,
    min: 0,
  },
}, { timestamps: true });

// Compound indexes
withdrawalSchema.index({ vendorId: 1, createdAt: -1 });
withdrawalSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Withdrawal", withdrawalSchema);