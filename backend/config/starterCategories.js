"use strict";

/*
 * Canonical starter list of marketplace product categories.
 *
 * These names are seeded into the dropdown so vendors have a curated
 * vocabulary from day one, even before any vendor has used a category.
 *
 * The live source of truth for "what vendors can pick" remains the union of:
 *   - Product.distinct("category")          (categories already in use)
 *   - CategoryRequest.find({status:"approved"}) (admin-approved vendor requests)
 *   - STARTER_CATEGORIES (this list)        (curated defaults)
 *
 * Anything not in this union is rejected by the validator when creating a
 * product. Vendors can grow the list by submitting a CategoryRequest.
 *
 * To add a new canonical category in code, append to this array. The change
 * takes effect on the next request to GET /api/products/categories — no
 * migration needed.
 */

const STARTER_CATEGORIES = Object.freeze([
  "Fashion",
  "Shoes",
  "Bags",
  "Watches",
  "Phones",
  "Electronics",
  "Computers",
  "Gaming",
  "Beauty",
  "Health",
  "Groceries",
  "Food",
  "Drinks",
  "Home & Kitchen",
  "Furniture",
  "Baby Products",
  "Toys",
  "Books",
  "Office Supplies",
  "Automotive",
  "Sports",
  "Agriculture",
  "Pet Supplies",
  "Jewellery",
  "Men's Fashion",
  "Women's Fashion",
  "Kids Fashion",
]);

module.exports = { STARTER_CATEGORIES };