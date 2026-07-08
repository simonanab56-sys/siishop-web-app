"use strict";

const mongoose = require("mongoose");

const promoSchema = new mongoose.Schema(
  {
    // FIX: Added 'ref: "Product"' to allow .populate("productId") to work correctly.
    // Without this, Mongoose doesn't know which collection to look in for the product details.
    productId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Product",
      required: true 
    },
    discountPercent: { 
      type: Number, 
      required: true,
      min: 0,
      max: 100
    },
    startDate: { 
      type: Date, 
      required: true 
    },
    endDate: { 
      type: Date, 
      required: true 
    },
    title: String,
    active: {
      type: Boolean,
      default: true
    },
    // ✅ ADDED: Marketplace-level configurability fields. All optional with safe
    // defaults so legacy promo documents (created before this schema change)
    // continue to load and render correctly.
    // Admin can override the on-card label ("Best Deal", "Hot", "Limited", etc.).
    // When empty, the frontend auto-derives a label from stock / discount.
    badge: {
      type: String,
      default: null,
      trim: true,
      maxlength: 40,
    },
    // Featured promos pin to the top of the carousel regardless of priority.
    featured: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Higher value = earlier in sort order. Independent of featured (tiebreaker).
    priority: {
      type: Number,
      default: 0,
    },
    // Manual ordering tiebreaker — lower value renders first.
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Promo", promoSchema);