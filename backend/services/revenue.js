/**
 * Revenue Update Service - Minimal, Safe, Additive
 * 
 * Handles vendor revenue updates when orders are paid
 * Prevents double-counting with idempotency checks
 * Does NOT modify existing order or payment logic
 */

const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");

/**
 * Update vendor revenue when an order is marked as paid
 * 
 * SAFETY FEATURES:
 * 1. Only updates if order.paymentStatus === "paid"
 * 2. Checks if revenue was already added (prevents double-counting)
 * 3. Uses atomic transaction to ensure consistency
 * 4. Handles multiple vendors in one order
 * 
 * @param {String} orderId - MongoDB order ID
 * @returns {Object} - { success: boolean, message: string }
 */
async function updateRevenueForPaidOrder(orderId) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // ✅ Fetch order with all items
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      throw new Error("Order not found");
    }

    // ✅ SAFETY: Only process if order is paid
    if (order.paymentStatus !== "paid") {
      await session.abortTransaction();
      return {
        success: false,
        message: `Order status is "${order.paymentStatus}", not "paid". Revenue not updated.`,
      };
    }

    // ✅ SAFETY: Check if revenue was already added (idempotency)
    if (order._revenueTracked === true) {
      await session.abortTransaction();
      return {
        success: false,
        message: "Revenue already tracked for this order. Skipping to prevent double-counting.",
      };
    }

    // ✅ Group items by vendor
    const vendorItems = {};
    for (const item of order.items) {
      if (!item.vendorId) continue;
      const vendorId = String(item.vendorId);
      if (!vendorItems[vendorId]) {
        vendorItems[vendorId] = [];
      }
      vendorItems[vendorId].push(item);
    }

    // ✅ Update revenue for each vendor
    const vendorUpdates = [];
    for (const vendorId of Object.keys(vendorItems)) {
      const items = vendorItems[vendorId];
      const vendorRevenue = items.reduce((sum, item) => {
        const itemTotal = (item.price || 0) * (item.quantity || 1);
        return sum + itemTotal;
      }, 0);

      // ✅ Increment vendor revenue atomically
      const updateResult = await User.findByIdAndUpdate(
        vendorId,
        {
          $inc: { revenue: vendorRevenue },
          $set: { lastRevenueUpdate: new Date() },
        },
        { new: true, session }
      );

      if (updateResult) {
        vendorUpdates.push({
          vendorId,
          vendorRevenue,
          newTotal: updateResult.revenue,
        });
      }
    }

    // ✅ Mark order as revenue-tracked (prevent double-counting)
    await Order.findByIdAndUpdate(
      orderId,
      { $set: { _revenueTracked: true } },
      { session }
    );

    await session.commitTransaction();

    return {
      success: true,
      message: `Revenue updated for ${vendorUpdates.length} vendor(s)`,
      vendorUpdates,
    };
  } catch (error) {
    await session.abortTransaction();
    console.error("[REVENUE] Error updating revenue:", error.message);
    return {
      success: false,
      message: `Error updating revenue: ${error.message}`,
    };
  } finally {
    await session.endSession();
  }
}

/**
 * Sync revenue for existing paid orders (admin maintenance)
 * 
 * Safely backfills revenue for orders that were already paid
 * but don't have _revenueTracked flag
 * 
 * @returns {Object} - { success: boolean, processed: number }
 */
async function syncMissingRevenue() {
  try {
    // Find all paid orders that haven't been revenue-tracked
    const paidOrders = await Order.find({
      paymentStatus: "paid",
      _revenueTracked: { $ne: true },
    });

    console.log(`[REVENUE] Found ${paidOrders.length} orders to sync`);

    let processed = 0;
    for (const order of paidOrders) {
      const result = await updateRevenueForPaidOrder(order._id);
      if (result.success) {
        processed++;
      }
    }

    return {
      success: true,
      message: `Synced revenue for ${processed} orders`,
      processed,
    };
  } catch (error) {
    console.error("[REVENUE] Error syncing revenue:", error.message);
    return {
      success: false,
      message: `Error syncing revenue: ${error.message}`,
      processed: 0,
    };
  }
}

/**
 * Get vendor revenue (real-time from database)
 * 
 * @param {String} vendorId - MongoDB vendor ID
 * @returns {Number} - Vendor revenue amount
 */
async function getVendorRevenue(vendorId) {
  try {
    const vendor = await User.findById(vendorId).select("revenue");
    return vendor?.revenue || 0;
  } catch (error) {
    console.error("[REVENUE] Error getting vendor revenue:", error.message);
    return 0;
  }
}

module.exports = {
  updateRevenueForPaidOrder,
  syncMissingRevenue,
  getVendorRevenue,
};
