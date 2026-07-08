"use strict";
const mongoose = require("mongoose");

// Image schema matching Product model
const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    public_id: { type: String, default: "" },
  },
  { _id: false }
);

const menuItemSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: String,
      required: true,
      enum: ["breakfast", "lunch", "dinner", "snacks", "drinks", "desserts"],
    },
    // Multiple images support (matching Product model)
    images: {
      type: [imageSchema],
      validate: [
        { validator: function(v) { return v.length <= 10; }, msg: "Maximum 10 images allowed" }
      ],
      default: []
    },
    // Legacy single image - kept for backward compatibility
    image: {
      type: String,
      default: "",
    },
    // Video support
    video: {
      type: String,
      default: "",
    },
    videoPublicId: {
      type: String,
      default: "",
    },
    preparationTime: {
      type: Number,
      default: 15, // minutes
      min: 0,
    },
    available: {
      type: Boolean,
      default: true,
    },
    portionSize: {
      type: String,
      default: "",
    },
    ingredients: {
      type: String,
      default: "",
    },
    allergens: {
      type: String,
      default: "",
    },
    spiceLevel: {
      type: String,
      enum: ["mild", "normal", "medium", "hot", "very_hot"],
      default: "normal",
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

/* ── Indexes for performance ── */
menuItemSchema.index({ vendorId: 1, category: 1 });
menuItemSchema.index({ vendorId: 1, available: 1 });
menuItemSchema.index({ name: "text", description: "text" });

module.exports = mongoose.model("MenuItem", menuItemSchema);