"use strict";
const mongoose = require("mongoose");

const restaurantReviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodOrder",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    review: {
      type: String,
      default: "",
      maxlength: 1000,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

/* ── Indexes ── */
restaurantReviewSchema.index({ restaurantId: 1, createdAt: -1 });
restaurantReviewSchema.index({ userId: 1, restaurantId: 1 }, { unique: true }); // One review per order

module.exports = mongoose.model("RestaurantReview", restaurantReviewSchema);