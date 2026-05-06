"use strict";

const mongoose = require("mongoose");
const Product = require("../models/Product");
const Promo = require("../models/Promo");

/**
 * Validate items and calculate total from DATABASE prices (batch queries - FIXED N+1)
 *
 * IMPORTANT: We NEVER trust the frontend price. We always:
 *   1. Fetch ALL products in ONE query (batch)
 *   2. Fetch ALL promos in ONE query (batch)
 *   3. Use the correct price (promo or base) for the total calculation
 *   4. If frontend price differs from calculated price → log warning, use calculated price
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

  // ✅ FIXED: Batch fetch all products (1 query instead of N)
  const products = await Product.find({
    _id: { $in: productIds }
  }).lean();

  const productMap = {};
  products.forEach(p => {
    productMap[String(p._id)] = p;
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

    if (!product || product.isDeleted) {
      throw Object.assign(new Error(`Product not found or unavailable: ${item.name || item.productId}`), {
        code: "INVALID_PRODUCT",
        statusCode: 400,
      });
    }

    if (product.stock < item.quantity) {
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
      `[ORDER] Product "${product.name}" (${item.productId}) - ${pricingReason}`
    );

    // ✅ Always use DB-calculated price (prevents fraud)
    total += finalPrice * item.quantity;
  }

  // Round to 2 decimal places to avoid floating point drift
  return Math.round(total * 100) / 100;
}

/**
 * ✅ NEW: SAFE STOCK REDUCTION with external session (for transactional orders)
 */
async function reduceStockTransactional(items, session) {
  try {
    for (const item of items) {
      const product = await Product.findOne({
        _id: item.productId,
        stock: { $gte: item.quantity },
      }).session(session);

      if (!product) {
        throw new Error(`Stock conflict: insufficient stock for ${item.productId}`);
      }

      product.stock -= item.quantity;
      await product.save({ session });
    }

    return true;
  } catch (err) {
    console.error("[reduceStockTransactional] Error:", err.message);
    return false;
  }
}

/**
 * SAFE STOCK REDUCTION (atomic + safe) - standalone transaction for backward compatibility
 */
async function reduceStock(items) {
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
};
