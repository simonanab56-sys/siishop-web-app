"use strict";
const mongoose = require("mongoose");

const menuCategorySchema = new mongoose.Schema(
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
      enum: ["breakfast", "lunch", "dinner", "snacks", "drinks", "desserts"],
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

/* ── Indexes ── */
menuCategorySchema.index({ vendorId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("MenuCategory", menuCategorySchema);