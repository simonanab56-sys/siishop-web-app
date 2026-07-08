"use strict";

const mongoose = require("mongoose");
const Product = require("../models/Product");
const MenuItem = require("../models/MenuItem");
const Promo = require("../models/Promo");

/**
 * Validate items and calculate total from DATABASE prices (batch queries - FIXED N+1)
 *
 * ✅ SUPPORT FOR RESTAURANT ORDERS:
 * - For itemType="food" items, looks in MenuItem collection
 * - For itemType="product" items, looks in Product collection
 * - Also checks Product collection with productType="food" for unified system
 *
 * IMPORTANT: We NEVER trust the frontend price. We always:
 *   1. Fetch ALL products in ONE query (batch)
 *   2. Fetch ALL menu items for food orders
 *   3. Fetch ALL promos in ONE query (batch)
 *   4. Use the correct price (promo or base) for the total calculation
 *   5. If frontend price differs from calculated price → log warning, use calculated price
 */
async function validateAndCalculateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error("Order must contain at least one item"), {
      code: "INVALID_ITEMS",
      statusCode: 400,
    });
  }

  const now = new Date();
  const productIds = items.map(i => i.productId);

  // ✅ Batch fetch all products (marketplace items)
  const products = await Product.find({
    _id: { $in: productIds }
  }).lean();

  const productMap = {};
  products.forEach(p => {
    productMap[String(p._id)] = { ...p, source: "product" };
  });

  // ✅ NEW: Also fetch menu items for food orders
  // This supports both MenuItem collection and Product collection with productType="food"
  const menuItems = await MenuItem.find({
    _id: { $in: productIds },
    isDeleted: false,
    available: true,
  }).lean();

  menuItems.forEach(m => {
    productMap[String(m._id)] = { ...m, source: "menuItem" };
  });

  // Also check Product collection for food items (unified system)
  const foodProducts = await Product.find({
    _id: { $in: productIds },
    productType: "food",
    isDeleted: { $ne: true },
    available: true,
  }).lean();

  foodProducts.forEach(f => {
    if (!productMap[String(f._id)]) {
      productMap[String(f._id)] = { ...f, source: "product-food" };
    }
  });

  // ✅ FIXED: Batch fetch all promos (1 query instead of N)
  const promos = await Promo.find({
    productId: { $in: productIds },
    active: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).lean();

  const promoMap = {};
  promos.forEach(p => {
    promoMap[String(p.productId)] = p;
  });

  let total = 0;

  for (const item of items) {
    if (!item.productId) {
      throw Object.assign(new Error("productId is required for each item"), {
        code: "MISSING_PRODUCT_ID",
        statusCode: 400,
      });
    }

    const product = productMap[String(item.productId)];

    if (!product) {
      throw Object.assign(new Error(`Product not found or unavailable: ${item.name || item.productId}`), {
        code: "INVALID_PRODUCT",
        statusCode: 400,
      });
    }

    // ✅ For food items, skip stock check (they're prepared on-demand)
    // Only check stock for marketplace products
    if (product.source !== "menuItem" && product.stock < item.quantity) {
      throw Object.assign(new Error(`Insufficient stock for "${product.name}": requested ${item.quantity}, available ${product.stock}`), {
        code: "OUT_OF_STOCK",
        statusCode: 409,
      });
    }

    // ✅ FIXED: Calculate price based on fromPromo flag
    // Backend is source of truth - respects frontend's promo choice but validates it
    const basePrice = Number(product.price);
    let finalPrice = basePrice;
    let hasPromo = false;
    let pricingReason = "";

    // ✅ Check if frontend claims this came from promo section
    if (item.fromPromo === true) {
      // Frontend says it came from promo - verify promo is still active
      const promo = promoMap[String(item.productId)];
      if (promo) {
        hasPromo = true;
        const discountAmount = (basePrice * promo.discountPercent) / 100;
        finalPrice = basePrice - discountAmount;
        pricingReason = `WITH PROMO (${promo.discountPercent}%): base ${basePrice} - ${promo.discountPercent}% = ${finalPrice}`;
      } else {
        // Frontend claimed promo but it's not active anymore - use base price
        pricingReason = `PROMO EXPIRED/INVALID: using base price ${basePrice}`;
      }
    } else {
      // Frontend says no promo - use base price
      pricingReason = `NO PROMO: price ${basePrice}`;
    }

    console.log(
      `[ORDER] ${product.source === "menuItem" ? "Food" : "Product"} "${product.name}" (${item.productId}) - ${pricingReason}`
    );

    // ✅ Always use DB-calculated price (prevents fraud)
    total += finalPrice * item.quantity;
  }

  // Round to 2 decimal places to avoid floating point drift
  return Math.round(total * 100) / 100;
}

/**
 * ✅ NEW: SAFE STOCK REDUCTION with external session (for transactional orders)
 * ✅ SKIPS food items - food is prepared on-demand, no stock reduction needed
 * ✅ Also handles items not found in Product collection (they might be food items)
 */
async function reduceStockTransactional(items, session) {
  try {
    // ✅ DEBUG: Log what we're receiving
    console.log("[reduceStockTransactional] Received items:", JSON.stringify(items, null, 2));

    // ✅ Filter out food items AND items not found in Product collection
    // Food items are prepared on-demand, they don't have inventory
    // Items not in Product collection might be food items from MenuItem
    const productItems = [];
    const skippedItems = [];

    for (const item of items) {
      const isFood = item.itemType === "food";
      if (isFood) {
        skippedItems.push({ name: item.name, reason: "food item" });
        continue;
      }

      // Check if this item exists in Product collection
      const product = await Product.findById(item.productId).session(session);
      if (!product) {
        // Item not in Product collection - likely a food item, skip it
        skippedItems.push({ name: item.name, reason: "not in Product collection" });
        continue;
      }

      productItems.push(item);
    }

    console.log("[reduceStockTransactional] Skipped items:", skippedItems);
    console.log("[reduceStockTransactional] Product items to reduce stock:", productItems.length);

    // If no product items (all food or not in Product collection), skip stock reduction entirely
    if (productItems.length === 0) {
      console.log("[reduceStockTransactional] ⏭️ No marketplace products - skipping stock reduction");
      return true;
    }

    for (const item of productItems) {
      console.log(`[reduceStockTransactional] Looking for product: ${item.productId}`);
      const product = await Product.findOne({
        _id: item.productId,
        stock: { $gte: item.quantity },
      }).session(session);

      if (!product) {
        console.error(`[reduceStockTransactional] ❌ Product not found or insufficient stock: ${item.productId}`);
        throw new Error(`Stock conflict: insufficient stock for ${item.productId}`);
      }

      const stockBefore = product.stock;
      product.stock -= item.quantity;
      await product.save({ session });
      console.log(`[reduceStockTransactional] ✅ Stock reduced for "${product.name}": ${stockBefore} -> ${product.stock}`);
    }

    return true;
  } catch (err) {
    console.error("[reduceStockTransactional] Error:", err.message);
    console.error("[reduceStockTransactional] Stack:", err.stack);
    return false;
  }
}

/**
 * SAFE STOCK REDUCTION (atomic + safe) - standalone transaction for backward compatibility
 * ✅ SKIPS food items - food is prepared on-demand
 */
async function reduceStock(items) {
  // ✅ Filter out food items - they don't need stock reduction
  const productItems = items.filter(item => item.itemType !== "food");

  if (productItems.length === 0) {
    // All items are food - no stock to reduce
    return true;
  }

  const session = await Product.startSession();

  try {
    session.startTransaction();

    for (const item of items) {
      const product = await Product.findOne({
        _id: item.productId,
        stock: { $gte: item.quantity },
      }).session(session);

      if (!product) {
        throw new Error(`Stock conflict: ${item.productId}`);
      }

      product.stock -= item.quantity;
      await product.save({ session });
    }

    await session.commitTransaction();
    session.endSession();
    return true;

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("[reduceStock] Transaction aborted:", err.message);
    return false;
  }
}

module.exports = {
  validateAndCalculateItems,
  reduceStock,
  reduceStockTransactional,
  prepareProductForSave,
};

/**
 * Normalize & validate the discount fields on a product create/update payload.
 * Auto-derives `isOnSale` and clears stale discount fields when no real
 * discount is set (e.g. originalPrice missing or 0).
 *
 * Returns { payload } on success or { error } on validation failure.
 *
 * Used by both routes/products.js and routes/vendor.js — single source of
 * truth for discount semantics.
 */
function prepareProductForSave(payload) {
  if (!payload || typeof payload !== "object") return { payload };

  const num = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const price          = num(payload.price);
  const originalPrice  = num(payload.originalPrice);
  const discountType   = payload.discountType === "percentage" || payload.discountType === "fixed"
    ? payload.discountType
    : null;
  const discountValue  = num(payload.discountValue);

  // ── Validation ─────────────────────────────────────────────────────────
  if (discountType === "percentage" && discountValue != null && discountValue > 100) {
    return { error: "Discount cannot exceed 100%" };
  }
  if (discountType === "percentage" && discountValue != null && discountValue < 0) {
    return { error: "Discount cannot be negative" };
  }
  if (discountType === "fixed" && originalPrice != null && discountValue != null && discountValue > originalPrice) {
    return { error: "Discount cannot exceed original price" };
  }
  if (discountType === "fixed" && discountValue != null && discountValue < 0) {
    return { error: "Discount cannot be negative" };
  }
  if (price != null && price < 0) {
    return { error: "Price cannot be negative" };
  }
  if (originalPrice != null && originalPrice < 0) {
    return { error: "Original price cannot be negative" };
  }

  // ── hasDiscount derivation ─────────────────────────────────────────────
  // Real discount = originalPrice is set AND price is set AND originalPrice > price.
  // Discount fields alone (without a price/originalPrice) do not constitute
  // an active discount — the form is responsible for completing the trio.
  const hasDiscount =
    originalPrice != null &&
    price != null &&
    originalPrice > price &&
    originalPrice > 0;

  if (hasDiscount) {
    payload.isOnSale = true;
    payload.originalPrice = originalPrice;
    payload.price = price;
    payload.discountType = discountType;
    payload.discountValue = discountValue;
  } else {
    // Clear stale discount state when no real discount is configured.
    payload.isOnSale = false;
    payload.originalPrice = null;
    payload.discountType = null;
    payload.discountValue = null;
  }

  return { payload };
}
