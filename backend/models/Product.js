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
    isDeleted: { type: Boolean, default: false },
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
      console.log(`[Cleanup] Deleted promotions for soft-deleted product: ${doc._id}`);
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
      console.log(`[Cleanup] Deleted promotions for hard-deleted product: ${doc._id}`);
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Prevent conflicts if model already exists
module.exports =
  mongoose.models.Product || mongoose.model("Product", productSchema);