"use strict";

const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const { validateAndCalculateItems, reduceStockTransactional } = require("./product.service");
const { verifyPaystackPayment } = require("./paystack.service");

/**
 * Verify Paystack payment before order creation.
 * Throws if payment is invalid or not successful.
 */
async function verifyPayment(paymentRef, expectedAmount) {
  const paystackData = await verifyPaystackPayment(paymentRef);

  const expectedAmountInKobo = Math.round(Number(expectedAmount) * 100);

  console.log("[Paystack Verify]");
  console.log("Expected:", expectedAmountInKobo);
  console.log("Received:", paystackData.amount);

  const difference = Math.abs(paystackData.amount - expectedAmountInKobo);
  const ALLOWED_DIFFERENCE = 100;

  if (difference > ALLOWED_DIFFERENCE) {
    throw Object.assign(
      new Error(
        `Amount mismatch: expected ${expectedAmountInKobo} kobo, got ${paystackData.amount} kobo`
      ),
      { code: "AMOUNT_MISMATCH", statusCode: 402 }
    );
  }

  if (paystackData.status !== "success") {
    throw Object.assign(new Error(`Payment not successful. Status: ${paystackData.status}`), {
      code: "PAYMENT_FAILED",
      statusCode: 402,
    });
  }

  return paystackData;
}

/**
 * ✅ ENHANCED: Attach vendorId AND product image to each item
 * SECURITY: Always fetch from DB, never trust frontend images
 * This ensures admin/vendor/customer can see what was actually ordered
 */
async function attachVendorAndImageToItems(items) {
  const productIds = items.map((i) => i.productId);

  const products = await Product.find({
    _id: { $in: productIds },
  }).select("_id vendorId image name description").lean();

  const productMap = {};
  products.forEach((p) => {
    productMap[String(p._id)] = {
      vendorId: p.vendorId,
      image: p.image,
      name: p.name,
      description: p.description,
    };
  });

  return items.map((item) => ({
    ...item,
    vendorId: productMap[String(item.productId)]?.vendorId || null,
    image: productMap[String(item.productId)]?.image || null,
    name: productMap[String(item.productId)]?.name || item.name || "Unknown Product",
    description: productMap[String(item.productId)]?.description || null,
  }));
}

/**
 * ✅ FIXED: Shared order creation logic with TRANSACTION support
 * 
 * CRITICAL FIXES:
 * 1. Order creation and stock reduction are now ATOMIC (both succeed or both fail)
 * 2. Cash orders now have correct status: paymentStatus="pending", orderStatus="pending"
 * 3. Paystack orders have: paymentStatus="paid", orderStatus="confirmed"
 * 4. Stock reduction failure BLOCKS order creation (no overselling)
 */
async function createOrder(data, { paymentMethod, paymentRef = null }) {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // ✅ Validate items and calculate total
    const total = await validateAndCalculateItems(data.items);
    const totalAmount = total;

    // ✅ Attach vendorId AND image to items BEFORE saving
    const itemsWithVendor = await attachVendorAndImageToItems(data.items);

    if (paymentMethod === "paystack") {
      if (!paymentRef) {
        throw Object.assign(new Error("Payment reference is required for Paystack orders"), {
          code: "MISSING_REF",
          statusCode: 400,
        });
      }

      await verifyPayment(paymentRef, totalAmount);
    }

    // ✅ FIXED: Create order within transaction
    // ✅ CRITICAL: Extract vendorId from first item for top-level reference
    const vendorId = itemsWithVendor[0]?.vendorId || null;
    
    // ✅ FIX: Build order data - omit paymentRef for COD orders
    const orderData = {
      ...data,
      vendorId, // ✅ CRITICAL: Set top-level vendorId for aggregation queries
      items: itemsWithVendor,
      totalAmount: totalAmount,
      paymentMethod,
      // ✅ CRITICAL FIX: Set correct status based on payment method
      // Cash orders: pending (waiting for payment)
      // Paystack orders: paid (payment already verified)
      paymentStatus: paymentMethod === "paystack" ? "paid" : "pending",
      orderStatus: paymentMethod === "paystack" ? "confirmed" : "pending",
      // ✅ ADDED: Track if order used promo code
      fromPromo: data.fromPromo || false,
    };

    // Only add paymentRef for online (paystack) orders - not for COD
    if (paymentMethod === "paystack" && paymentRef) {
      orderData.paymentRef = paymentRef;
    }

    const [order] = await Order.create([orderData], { session });

    // ✅ CRITICAL FIX: Reduce stock within transaction
    const stockReduced = await reduceStockTransactional(data.items, session);
    if (!stockReduced) {
      throw Object.assign(new Error("Stock reduction failed"), {
        code: "STOCK_ERROR",
        statusCode: 500,
      });
    }

    // ✅ Only commit if BOTH order creation and stock reduction succeed
    await session.commitTransaction();
    session.endSession();

    console.log(`[Order] Created ${paymentMethod} order ${order._id} for ${totalAmount}`);

    return order;

  } catch (err) {
    // ✅ Automatic rollback: if any error occurs, transaction is aborted
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

async function createCashOrder(data) {
  return createOrder(data, { paymentMethod: "cash" });
}

async function createPaidOrder(data) {
  if (!data.paymentRef) {
    throw Object.assign(new Error("paymentRef is required for Paystack orders"), {
      code: "MISSING_REF",
      statusCode: 400,
    });
  }

  return createOrder(data, {
    paymentMethod: "paystack",
    paymentRef: data.paymentRef,
  });
}

module.exports = {
  createCashOrder,
  createPaidOrder,
  attachVendorAndImageToItems,
};
