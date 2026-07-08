"use strict";

/*
 * Category validation helper — shared by both the admin and vendor product
 * POST/PUT routes. Replaces free-text `category` with a strict whitelist
 * while preserving backward compatibility for products whose category was
 * hand-typed before this change.
 *
 * Whitelist = union of:
 *   - live `Product.distinct("category")` strings (case-insensitive)
 *   - approved `CategoryRequest.name` values (lowercase by construction)
 *
 * Behaviour:
 *   POST: `category` (if non-empty) MUST equal an allowed value.
 *   PUT:  same as POST, EXCEPT the product's CURRENT `category` is also
 *         allowed (legacy preservation — we don't want existing products
 *         breaking because admin happens not to have approved the typo).
 *
 * The function returns:
 *   { ok: true,  category: <canonical-cased value> }   on success
 *   { ok: false, message: <string> }                    on failure
 *   { ok: true,  category: <unchanged>, skipped: true }  if no category was provided
 */

const Product = require("../models/Product");
const CategoryRequest = require("../models/CategoryRequest");
const { STARTER_CATEGORIES } = require("../config/starterCategories");

/**
 * Build the allowed set (case-insensitive keys, original-case values kept).
 * Returned as an array of strings for membership checks.
 */
async function fetchAllowedCategories() {
  const [cats, approved] = await Promise.all([
    Product.distinct("category", {
      isDeleted: { $ne: true },
      category: { $ne: null, $ne: "" },
    }),
    CategoryRequest.find({ status: "approved" }).select("name").lean(),
  ]);
  const set = new Set();
  for (const c of cats || []) {
    if (c) set.add(String(c).trim());
  }
  for (const r of approved || []) {
    if (r && r.name) set.add(String(r.name).trim());
  }
  // Curated starter names — accepted on first run, before any vendor has
  // used them, so the dropdown is useful from day one.
  for (const name of STARTER_CATEGORIES) {
    if (name) set.add(String(name).trim());
  }
  return Array.from(set);
}

/**
 * @param {object} opts
 * @param {string} [opts.submitted]   — raw category from the request body
 * @param {string} [opts.current]     — product's current category (PUT only)
 * @param {'create'|'update'} opts.op
 */
async function validateCategory({ submitted, current, op }) {
  const value = (submitted || "").toString().trim();
  if (!value) {
    return { ok: false, message: "Category is required" };
  }
  const allowed = await fetchAllowedCategories();
  const allowedLower = new Set(allowed.map((c) => c.toLowerCase()));

  if (allowedLower.has(value.toLowerCase())) {
    return { ok: true, category: value };
  }

  // Legacy preservation path — the product already had this category before
  // the validator was introduced. Keep the value so we don't break edits.
  if (op === "update" && current && current.toString().trim().toLowerCase() === value.toLowerCase()) {
    return { ok: true, category: value, skipped: true, legacy: true };
  }

  return {
    ok: false,
    message:
      `Invalid category "${value}". ` +
      `Please pick from the existing list, or use the "Request new category" option to ask admin to add it.`,
  };
}

module.exports = {
  fetchAllowedCategories,
  validateCategory,
};