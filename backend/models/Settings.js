"use strict";
const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema({
  // Unique key for settings (singleton pattern)
  key: {
    type: String,
    required: true,
    unique: true,
    default: "global",
  },
  // Commission settings
  commission: {
    // Global commission rate (percentage, e.g., 10 = 10%)
    globalRate: {
      type: Number,
      default: 10,
      min: 0,
      max: 100,
    },
    // Category-specific commissions: { categoryId: rate }
    categoryRates: {
      type: Map,
      of: Number,
      default: {},
    },
    // Vendor-specific commissions: { vendorId: rate }
    vendorRates: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  // Holding period settings (in days)
  holdingPeriod: {
    // Default holding period in days (0-14)
    defaultDays: {
      type: Number,
      default: 3,
      min: 0,
      max: 14,
    },
    // Category-specific holding periods: { categoryId: days }
    categoryDays: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  // Withdrawal settings
  withdrawal: {
    // Minimum withdrawal amount in GHS
    minAmount: {
      type: Number,
      default: 50,
      min: 1,
    },
    // Maximum withdrawal amount in GHS
    maxAmount: {
      type: Number,
      default: 5000,
      min: 1,
    },
    // Withdrawal fee (percentage)
    feePercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },
    // Processing time in days (for vendor reference)
    processingDays: {
      type: Number,
      default: 3,
      min: 1,
    },
  },
  // Payment provider settings
  payment: {
    // Paystack configuration
    paystack: {
      transferEnabled: {
        type: Boolean,
        default: false,
      },
      bankTransferEnabled: {
        type: Boolean,
        default: false,
      },
      mobileMoneyEnabled: {
        type: Boolean,
        default: false,
      },
    },
  },
}, { timestamps: true });

module.exports = mongoose.model("Settings", settingsSchema);