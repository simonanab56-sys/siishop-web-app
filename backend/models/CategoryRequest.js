"use strict";

const mongoose = require("mongoose");

/*
 * CategoryRequest — vendor-submitted requests to add a new product category.
 *
 * The marketplace's "list of categories" is derived live from
 * `Product.distinct("category")` (no canonical Category collection). To let
 * vendors grow the list without typing arbitrary text in the product form,
 * they submit a request here, and an admin reviews it.
 *
 * Lifecycle:
 *   pending   → vendor has requested, admin has not yet reviewed
 *   approved  → admin accepted; the name is merged into
 *               GET /api/products/categories (live, no marker product needed)
 *   rejected  → admin denied; vendor must pick an existing category
 *
 * Approved names are merged with distinct("category") in the categories
 * endpoint, so an approval makes the new category immediately selectable
 * in the vendor dropdown — without inserting phantom products.
 */

const categoryRequestSchema = new mongoose.Schema(
  {
    // Lowercased, trimmed at the route layer. Unique per pending/approved
    // status (rejected requests may repeat to allow re-submission after edits).
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: {
      type: Date,
    },
    // Optional vendor note (e.g. "for organic soaps I sell").
    note: {
      type: String,
      trim: true,
      maxlength: 200,
    },
  },
  { timestamps: true }
);

// Case-insensitive unique guard for the live list — only one active
// (pending or approved) request per name. Rejected requests are excluded
// so a vendor can re-submit after a typo fix.
categoryRequestSchema.index(
  { name: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["pending", "approved"] } },
  }
);

module.exports = mongoose.model("CategoryRequest", categoryRequestSchema);