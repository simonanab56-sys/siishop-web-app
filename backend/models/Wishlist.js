"use strict";

const mongoose = require("mongoose");

const wishlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  // Price when saved
  priceWhenSaved: {
    type: Number,
    required: true,
    min: 0,
  },
  // Last time we checked for price changes
  lastPriceChecked: {
    type: Date,
    default: Date.now,
  },
  // Notification preferences
  notifyPriceDrop: {
    type: Boolean,
    default: true,
  },
  notifyBackInStock: {
    type: Boolean,
    default: true,
  },
  // Price drop notification sent flag
  priceDropNotified: {
    type: Boolean,
    default: false,
  },
  // Stock notification sent flag
  stockNotified: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

// Compound index to prevent duplicates
wishlistSchema.index({ userId: 1, productId: 1 }, { unique: true });
// Index for product lookups
wishlistSchema.index({ productId: 1 });
// Index for user lookups
wishlistSchema.index({ userId: 1, createdAt: -1 });

// Static method: Check if product is in user's wishlist
wishlistSchema.statics.isInWishlist = async function(userId, productId) {
  const item = await this.findOne({ userId, productId });
  return !!item;
};

// Static method: Get user's wishlist count
wishlistSchema.statics.getWishlistCount = async function(userId) {
  return this.countDocuments({ userId });
};

// Static method: Get all users watching a product
wishlistSchema.statics.getUsersWatchingProduct = async function(productId) {
  return this.find({ productId, notifyBackInStock: true }).populate("userId");
};

// Static method: Get all users watching a product for price drops
wishlistSchema.statics.getUsersWatchingPriceDrop = async function(productId) {
  return this.find({ productId, notifyPriceDrop: true }).populate("userId");
};

module.exports = mongoose.model("Wishlist", wishlistSchema);