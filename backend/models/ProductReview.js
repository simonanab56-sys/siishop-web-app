"use strict";

const mongoose = require("mongoose");

/**
 * ProductReview
 * ─────────────────────────────────────────────────────────────────────────────
 * Customer-submitted review of a marketplace Product. One review per
 * `{user, product, order}` triple — enforced by the compound unique
 * index below. This is the eligibility guard at the DB layer: a
 * duplicate insert fails with E11000 and the API maps that to a
 * 400 "You have already reviewed this item."
 *
 * The `orderId` field is the link back to the original Order, so the
 * review flow can always answer "did this user buy this product in a
 * delivered order?" with a single indexed lookup.
 *
 * The `rating` field is stored as 1..5 (integer). Aggregation back
 * into Product.rating / Product.reviewCount is handled by the POST
 * /api/products/:id/reviews route on each successful insert.
 */
const productReviewSchema = new mongoose.Schema(
  {
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User",    required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    vendorId:  { type: mongoose.Schema.Types.ObjectId, ref: "User",    required: true, index: true },
    orderId:   { type: mongoose.Schema.Types.ObjectId, ref: "Order",   required: true, index: true },

    rating: { type: Number, required: true, min: 1, max: 5 },
    review: { type: String, default: "" },

    // Soft-delete flag — admin can hide a review without losing the
    // row. The unique index above does NOT include this field, so a
    // deleted review does not free the slot. (Re-reviewing the same
    // {user, product, order} is intentionally not allowed.)
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// ✅ Eligibility guard: one review per {user, product, order}.
productReviewSchema.index(
  { userId: 1, productId: 1, orderId: 1 },
  { unique: true, name: "uniq_user_product_order" }
);

// ✅ Common query patterns:
//   - "All reviews for product X, newest first"
//   - "All reviews by user Y"
//   - "Vendor analytics: average rating across my products"
productReviewSchema.index({ productId: 1, createdAt: -1 });
productReviewSchema.index({ vendorId: 1, createdAt: -1 });

module.exports =
  mongoose.models.ProductReview ||
  mongoose.model("ProductReview", productReviewSchema);
