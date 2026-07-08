"use strict";

/*
 * HomepageSection
 *
 * One document = one block on the homepage. Admins create and order these
 * from the Admin Dashboard → "🧩 Sections" tab. Each section resolves a
 * product list at request time (see backend/routes/homepageSections.js).
 *
 * Source types:
 *   manual     — products explicitly picked by an admin (manualProductIds)
 *   category   — products from one or more categories (categories[])
 *   vendor     — products from one or more vendors (vendorIds[])
 *   featured   — products flagged isFeatured = true
 *   promo      — products that have an active Promo today
 *   automatic  — derived collection: best_sellers / new_arrivals / etc.
 *
 * Layouts: grid | carousel | featured | mixed
 *
 * Visibility: a section is visible when:
 *   - active === true
 *   - now >= startDate (if set)
 *   - now <= endDate   (if set)
 *
 * Sorting at fetch time: displayOrder ASC, then _id ASC.
 */

const mongoose = require("mongoose");

const sourceSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["manual", "category", "vendor", "featured", "promo", "automatic"],
    },
    // ── manual ───────────────────────────────────────────────────────
    manualProductIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    ],
    // ── category (multi-union) ───────────────────────────────────────
    categories: [{ type: String, trim: true }],
    // ── vendor (multi-union) ─────────────────────────────────────────
    vendorIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // ── automatic ────────────────────────────────────────────────────
    automaticType: {
      type: String,
      enum: [
        "best_sellers",
        "new_arrivals",
        "recently_added",
        "most_viewed",
        "trending",
        "most_purchased",
        "discounted",
        "featured",
        "highest_rated",
      ],
    },
  },
  { _id: false }
);

const bannerImageSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    public_id: { type: String, default: "" },
  },
  { _id: false }
);

const sortOverrideSchema = new mongoose.Schema(
  {
    by: { type: String, default: "" },
    order: { type: String, enum: ["asc", "desc"], default: "desc" },
  },
  { _id: false }
);

const homepageSectionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    subtitle: { type: String, default: "", trim: true, maxlength: 240 },
    icon: { type: String, default: "", trim: true, maxlength: 16 },
    bannerImage: { type: bannerImageSchema, default: () => ({}) },

    layout: {
      type: String,
      enum: ["grid", "carousel", "featured", "mixed"],
      default: "grid",
    },

    displayOrder: { type: Number, default: 0, index: true },
    active: { type: Boolean, default: true, index: true },

    source: { type: sourceSchema, required: true },

    maxProducts: { type: Number, default: 12, min: 1, max: 100 },
    sortOverride: { type: sortOverrideSchema, default: () => ({}) },

    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    showSeeAll: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Compound index used for the public active-sorted listing.
homepageSectionSchema.index({ active: 1, displayOrder: 1, createdAt: 1 });
// Index used by scheduled-visibility filtering at request time.
homepageSectionSchema.index({ endDate: 1 });

/**
 * Returns true if the section should be visible RIGHT NOW, accounting for
 * the active flag and the optional startDate / endDate window.
 */
homepageSectionSchema.methods.isVisibleNow = function isVisibleNow(now = new Date()) {
  if (this.active === false) return false;
  if (this.startDate && now < this.startDate) return false;
  if (this.endDate && now > this.endDate) return false;
  return true;
};

module.exports =
  mongoose.models.HomepageSection ||
  mongoose.model("HomepageSection", homepageSectionSchema);
