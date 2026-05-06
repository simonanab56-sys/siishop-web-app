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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Promo", promoSchema);