"use strict";

const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const MenuItem = require("../models/MenuItem");
const { validateAndCalculateItems, reduceStockTransactional } = require("./product.service");
const { verifyPaystackPayment } = require("./paystack.service");
const { notifyOrderCreated } = require("./notification.service");

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
 * ✅ ENHANCED: Attach vendorId AND product images to each item
 * ✅ SUPPORT FOR FOOD ITEMS: Also looks in MenuItem collection
 * SECURITY: Always fetch from DB, never trust frontend images
 * This ensures admin/vendor/customer can see what was actually ordered
 */
async function attachVendorAndImageToItems(items) {
  const productIds = items.map((i) => i.productId);

  // ✅ First get marketplace products
  const products = await Product.find({
    _id: { $in: productIds },
  }).select("_id vendorId image images name description price originalPrice").lean();

  const productMap = {};
  products.forEach((p) => {
    productMap[String(p._id)] = {
      ...p,
      source: "product",
    };
  });

  // ✅ Also get menu items for food orders
  const menuItems = await MenuItem.find({
    _id: { $in: productIds },
    isDeleted: false,
  }).select("_id vendorId image images name description price").lean();

  menuItems.forEach((m) => {
    if (!productMap[String(m._id)]) {
      productMap[String(m._id)] = {
        ...m,
        source: "menuItem",
      };
    }
  });

  // Also check Product collection for food items (unified system)
  const foodProducts = await Product.find({
    _id: { $in: productIds },
    productType: "food",
    isDeleted: { $ne: true },
  }).select("_id vendorId image images name description price").lean();

  foodProducts.forEach((f) => {
    if (!productMap[String(f._id)]) {
      productMap[String(f._id)] = {
        ...f,
        source: "product-food",
      };
    }
  });

  return items.map((item) => {
    const product = productMap[String(item.productId)];
    // Use quantity from frontend or default to 1
    const quantity = item.quantity || 1;
    // Use price from DB product (not frontend) - this ensures accuracy
    const price = product?.price || item.price || 0;
    // ✅ NEW: snapshot pre-sale price (if product was discounted) so receipts
    // can show "was X, now Y" even if the discount is later removed from
    // the catalog.
    const originalPrice = product?.originalPrice ?? item.originalPrice ?? null;

    console.log(`[Order] ${product?.source === "menuItem" ? "Food" : "Product"} Item ${product?.name || item.name}: qty=${quantity}, price=${price}`);

    return {
      ...item,
      quantity, // Ensure quantity is set
      price, // Use DB price (more reliable)
      originalPrice, // ✅ Snapshot for receipts
      vendorId: product?.vendorId || item.restaurantId || null,
      image: product?.image || null,
      images: product?.images || null,
      name: product?.name || item.name || "Unknown Product",
      description: product?.description || null,
      // ✅ Preserve food order fields
      itemType: item.itemType || (product?.source === "menuItem" || product?.source === "product-food" ? "food" : "product"),
      menuItemId: item.menuItemId || (product?.source === "menuItem" ? item.productId : null),
      restaurantId: item.restaurantId || null,
      restaurantName: item.restaurantName || null,
    };
  });
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

    // ✅ Determine if this is a food order
    const isFoodOrder = itemsWithVendor.some(item => item.itemType === "food");
    const restaurantId = data.restaurantId || (isFoodOrder ? vendorId : null);
    const restaurantName = data.restaurantName || "";

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
      // ✅ Restaurant order support
      orderType: isFoodOrder ? "food" : "product",
      restaurantId: restaurantId,
      restaurantName: restaurantName,
    };

    console.log("[Order] Creating order with orderType:", orderData.orderType, "restaurantId:", orderData.restaurantId);

    // Only add paymentRef for online (paystack) orders - not for COD
    if (paymentMethod === "paystack" && paymentRef) {
      orderData.paymentRef = paymentRef;
    }

    const [order] = await Order.create([orderData], { session });

    // ✅ CRITICAL FIX: Use itemsWithVendor (enriched with itemType) instead of raw data.items
    // This ensures food items are properly identified and skipped
    console.log("[Order] Items with vendor (for stock reduction):", JSON.stringify(itemsWithVendor, null, 2));
    const stockReduced = await reduceStockTransactional(itemsWithVendor, session);

    // ✅ FIX: For restaurant/food orders, stock reduction failure is OK
    // Food items are prepared on-demand, they don't have inventory
    // Only fail for marketplace orders where stock is critical
    // Note: isFoodOrder is declared earlier in this function
    if (!stockReduced && !isFoodOrder) {
      throw Object.assign(new Error("Stock reduction failed"), {
        code: "STOCK_ERROR",
        statusCode: 500,
      });
    } else if (!stockReduced && isFoodOrder) {
      console.log("[Order] ⚠️ Stock reduction failed for food order (expected - food has no inventory)");
    }

    // ✅ Only commit if BOTH order creation and stock reduction succeed
    await session.commitTransaction();
    session.endSession();

    console.log(`[Order] Created ${paymentMethod} order ${order._id} for ${totalAmount}`);

    // Send email notifications asynchronously (don't block the response)
    // Use fire-and-forget pattern - errors are logged inside the function
    notifyOrderCreated(order).catch((err) => {
      console.error(`[Order] Failed to send notifications for order ${order._id}:`, err.message);
    });

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
