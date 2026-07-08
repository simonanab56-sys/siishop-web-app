"use strict";

const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    public_id: { type: String, default: "" },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, default: "" },

    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    stock:    { type: Number, default: 0, min: 0 },
    available: { type: Boolean, default: true },

    // ✅ NEW: Product type for unified marketplace + restaurant system
    // "product" = marketplace item (electronics, fashion, etc.)
    // "food" = restaurant menu item (jollof rice, pizza, etc.)
    productType: {
      type: String,
      enum: ["product", "food"],
      default: "product",
    },

    // ✅ NEW: Preparation time (for food items only)
    preparationTime: {
      type: Number,
      default: 0, // 0 means not applicable (for regular products)
    },

    // New multi-image field
    images: {
      type: [imageSchema],
      validate: [
        { validator: function(v) { return v.length <= 10; }, msg: "Maximum 10 images allowed" }
      ],
      default: []
    },
    // Legacy field - kept for backward compatibility
    image: { type: String, default: "" },
    // Video support
    videoUrl: { type: String, default: "" },
    videoPublicId: { type: String, default: "" },
    videoDuration: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },

    // ✅ NEW (Task 7 — Dynamic Homepage Sections): analytics + merchandising flags.
    // All default to safe values so existing products continue to work without migration.
    views:         { type: Number,  default: 0,    index: true },     // incremented by POST /:id/view
    salesCount:    { type: Number,  default: 0,    index: true },     // incremented on order delivered
    isFeatured:    { type: Boolean, default: false, index: true },     // surfaces in "Featured" automatic section
    isOnSale:      { type: Boolean, default: false, index: true },     // surfaces in "Discounted" automatic section
    originalPrice: { type: Number,  default: null },                  // pre-sale price, shown as a strikethrough

    // ✅ NEW: optional per-product discount fields. When present, the form
    // typically collects (originalPrice + discountType + discountValue) and the
    // server snapshots the final selling price into `price`. `isOnSale` is
    // auto-derived in prepareProductForSave().
    discountType:  { type: String, enum: ["percentage", "fixed"], default: null },
    discountValue: { type: Number, min: 0, default: null },
  },
  { timestamps: true }
);

// Virtual getter for backward compatibility - returns first image URL
productSchema.virtual("primaryImage").get(function() {
  if (this.images && this.images.length > 0) {
    return this.images[0].url;
  }
  return this.image || "";
});

// ✅ NEW: discountAmount — absolute savings when the product is on sale.
// Returns 0 when not on sale. Used by the /deals sort=biggest/smallest modes
// via sortBy=discountAmount (the virtual participates in Mongoose sort).
productSchema.virtual("discountAmount").get(function() {
  const op = Number(this.originalPrice);
  const p  = Number(this.price);
  if (!op || !Number.isFinite(op) || !Number.isFinite(p)) return 0;
  if (op <= p) return 0;
  return Math.round((op - p) * 100) / 100;
});

// Ensure virtuals are included in JSON
productSchema.set("toJSON", { virtuals: true });
productSchema.set("toObject", { virtuals: true });

/**
 * MIDDLEWARE: Cleanup Promotions on Soft Delete
 * This hook runs every time a product is saved. 
 * If 'isDeleted' is changed to true, it automatically removes all linked promotions.
 */
productSchema.post("save", async function (doc, next) {
  try {
    if (doc.isDeleted === true) {
      // We use the model name directly to avoid circular dependency issues
      await mongoose.model("Promo").deleteMany({ productId: doc._id });
      // Also clean up wishlist - remove product from all wishlists when deleted
      await mongoose.model("Wishlist").deleteMany({ productId: doc._id });
      console.log(`[Cleanup] Deleted promotions and wishlist items for soft-deleted product: ${doc._id}`);
    }
    next();
  } catch (err) {
    console.error("[Cleanup Error]", err.message);
    next(err);
  }
});

/**
 * MIDDLEWARE: Cleanup Promotions on Hard Delete (Optional but recommended)
 * In case you ever use .deleteOne() or .findOneAndDelete()
 */
productSchema.post("findOneAndDelete", async function (doc, next) {
  try {
    if (doc) {
      await mongoose.model("Promo").deleteMany({ productId: doc._id });
      // Also clean up wishlist - remove product from all wishlists when hard deleted
      await mongoose.model("Wishlist").deleteMany({ productId: doc._id });
      console.log(`[Cleanup] Deleted promotions and wishlist items for hard-deleted product: ${doc._id}`);
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Prevent conflicts if model already exists
// ✅ NEW: Composite index for the food items query in routes/restaurants.js
// (`GET /api/restaurants/food`, `GET /api/restaurants/:slug`). The query
// filters by `vendorId + productType + isDeleted` and sorts by `createdAt`;
// this compound index makes the filter + sort O(log n) regardless of catalog
// size.
productSchema.index({ vendorId: 1, productType: 1, isDeleted: 1, createdAt: -1 });

// ✅ NEW: Sparse partial index on `name` to back the search endpoint's
// anchored regex (`^q`). Without an index, `new RegExp(q, "i")` is
// unanchored and forces a full collection scan. The sparse partial filter
// keeps the index small by only indexing non-deleted documents (the
// search query already filters `{ isDeleted: { $ne: true } }`).
productSchema.index(
  { name: 1 },
  {
    name: "name_search_partial",
    partialFilterExpression: { isDeleted: { $ne: true } },
  }
);

module.exports =
  mongoose.models.Product || mongoose.model("Product", productSchema);