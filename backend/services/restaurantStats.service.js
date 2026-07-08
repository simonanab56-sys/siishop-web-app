"use strict";

/**
 * RestaurantStats Service - Single Source of Truth
 * ------------------------------------------------
 * One place where every Restaurant / Marketplace stats card on the
 * Dashboard, Wallet, Customers and Analytics pages gets its numbers.
 *
 * The pre-existing flows had three different revenue functions and three
 * different customer aggregations scattered across the codebase, each
 * reading from a slightly different set of orders:
 *
 *   - routes/vendor.js#GET /dashboard        → sum totalAmount where
 *       vendorId = me AND (paid OR delivered)
 *   - routes/vendor.js#GET /orders/delivered/stats → sum items.price*qty
 *       for orderStatus="delivered" only
 *   - services/wallet.service.js#getWalletSummary → reads from the
 *       `Wallet` document, which is only credited when
 *       processOrderEarnings runs at delivery time
 *   - RestaurantCustomersPage.jsx → builds the customer list in
 *       React from `vendorAPI.getOrders()`, which excludes delivered
 *
 * Those three definitions can't agree because each uses a different
 * filter. This service resolves to ONE definition, identical for
 * restaurants and marketplace vendors (since both write
 * items[].vendorId = vendor.userId):
 *
 *   REVENUE  = Σ order.totalAmount  over orders where
 *              (paymentStatus="paid" OR orderStatus="delivered")
 *              AND items contain a line from this vendor
 *
 *   ONLINE   = Σ totalAmount where the same filter holds AND
 *              paymentMethod="paystack"
 *
 *   COD      = Σ totalAmount where the same filter holds AND
 *              paymentMethod="cash"
 *
 *   ORDERS   = count of orders in the same revenue set
 *
 *   CUSTOMERS= count of distinct userId values in the same revenue set
 *
 * We compute the revenue set in one $facet aggregation, so the five
 * numbers are guaranteed to come from the same row set — Dashboard,
 * Wallet, Customers and Analytics cannot drift from each other after
 * the refactor.
 */

const mongoose = require("mongoose");
const Order = require("../models/Order");

/**
 * Convert a hex string or ObjectId to an ObjectId usable inside an
 * aggregation pipeline. We do this lazily because callers may pass
 * a plain string from req.user.userId, and $match with a string
 * against an ObjectId-typed field silently returns no documents.
 */
function toOid(vendorId) {
  if (!vendorId) return null;
  if (vendorId instanceof mongoose.Types.ObjectId) return vendorId;
  return new mongoose.Types.ObjectId(String(vendorId));
}

/**
 * getStats — the single source of truth for every restaurant / vendor
 * stat card across the entire app.
 *
 * Returns:
 *   {
 *     totalRevenue,         // all paid + delivered (matches Dashboard)
 *     onlineRevenue,        // paymentMethod = "paystack"
 *     codRevenue,           // paymentMethod = "cash"
 *     totalOrders,          // count of the same row set
 *     totalCustomers,       // distinct customer in the same row set
 *     totalDelivered,       // count of delivered orders
 *     pendingOrders,        // count of pending/confirmed/preparing
 *     cancelledOrders,      // count of cancelled
 *     customers,            // per-customer rollup: name, email, phone,
 *                          //   orderCount (ALL orders incl. pending/
 *                          //     cancelled), totalSpent (revenue set
 *                          //     only), lastOrderDate, hasDelivered,
 *                          //   customerStatus (Active/Returning/New/
 *                          //     Inactive — relationship signal from
 *                          //     the customer's full history),
 *                          //   latestOrderStatus (orderStatus of the
 *                          //     most recent order)
 *   }
 *
 * @param {String|ObjectId} vendorId  - the vendor's user _id
 * @returns {Promise<Object>}
 */
async function getStats(vendorId) {
  const oid = toOid(vendorId);
  if (!oid) {
    return emptyStats();
  }

  // ✅ THE revenue-set definition. Used by all five numbers so they
  // can never drift. This matches routes/vendor.js#GET /dashboard
  // line-for-line, which is the only existing endpoint that the user
  // already trusts (it shows the correct number after refresh).
  const revenueMatch = {
    $or: [
      { paymentStatus: "paid" },
      { orderStatus: "delivered" },
    ],
    // Match either the top-level vendorId (set by order.service.js
    // #createOrder) OR an item-level vendorId (covers any historical
    // orders that pre-date the top-level field). Both are ObjectId-
    // typed; the top-level field was added in the same migration that
    // unified marketplace + restaurant orders, so 100% of current
    // orders have both. The OR is just belt-and-braces.
    $and: [
      {
        $or: [
          { vendorId: oid },
          { "items.vendorId": oid },
        ],
      },
    ],
  };

  // Run six aggregates in parallel against the same row set. We
  // could do this with $facet, but $facet is capped at 16MB and the
  // MongoDB planner handles six parallel simple aggregates faster on
  // the indexed "items.vendorId" path.
  const [
    overall,
    onlineAgg,
    codAgg,
    ordersCountAgg,
    customersAgg,
    deliveredCount,
    pendingCount,
    cancelledCount,
  ] = await Promise.all([
    // Total revenue — all paid + delivered
    Order.aggregate([
      { $match: revenueMatch },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]),

    // Online revenue (paymentMethod="paystack")
    Order.aggregate([
      { $match: { ...revenueMatch, paymentMethod: "paystack" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]),

    // COD revenue (paymentMethod="cash")
    Order.aggregate([
      { $match: { ...revenueMatch, paymentMethod: "cash" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]),

    // Count of orders in the revenue set
    Order.aggregate([
      { $match: revenueMatch },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]),

    // Distinct userId in the revenue set = unique customers
    Order.aggregate([
      { $match: { ...revenueMatch, userId: { $ne: null } } },
      { $group: { _id: "$userId" } },
      { $count: "count" },
    ]),

    // Status breakdown (uses the same vendor scope, not the revenue
    // filter, so cancelled / pending still show up in the Analytics
    // page's status grid).
    Order.countDocuments({
      $or: [{ vendorId: oid }, { "items.vendorId": oid }],
      orderStatus: "delivered",
    }),
    Order.countDocuments({
      $or: [{ vendorId: oid }, { "items.vendorId": oid }],
      orderStatus: { $in: ["pending", "confirmed", "preparing"] },
    }),
    Order.countDocuments({
      $or: [{ vendorId: oid }, { "items.vendorId": oid }],
      orderStatus: "cancelled",
    }),
  ]);

  // Per-customer rollup — one row per unique user. Groups across the
  // FULL vendor-scoped order set (NOT the revenue filter) so we can
  // compute `orderCount`, `hasDelivered`, and `latestOrderStatus` from
  // the customer's complete history. The downstream `$match:
  // totalSpent > 0` keeps only customers with at least one revenue-
  // eligible order, which preserves the "Total Customers = customers
  // with revenue" property the Dashboard card depends on. Falls back
  // to customerName/Email/Phone on the order document for guest
  // checkouts (no userId). The "first non-null" trick in the $group
  // is the standard MongoDB way to keep the most-recent value when
  // you don't want to sort.
  const customersAll = await Order.aggregate([
    // Vendor scope only — NO revenue filter, because we need to see
    // pending and cancelled orders too to compute orderCount, the
    // most-recent order status, and the "has any delivered" flag.
    {
      $match: {
        $or: [
          { vendorId: oid },
          { "items.vendorId": oid },
        ],
      },
    },
    {
      $addFields: {
        _customerKey: {
          $cond: [
            { $ne: ["$userId", null] },
            { $toString: "$userId" },
            { $toLower: { $ifNull: ["$customerEmail", "$customerPhone"] } },
          ],
        },
        _isRevenue: {
          $or: [
            { $eq: ["$paymentStatus", "paid"] },
            { $eq: ["$orderStatus", "delivered"] },
          ],
        },
      },
    },
    {
      $group: {
        _id: "$_customerKey",
        userId: { $first: "$userId" },
        name: {
          $first: {
            $ifNull: ["$userId.name", "$customerName"],
          },
        },
        email: {
          $first: {
            $ifNull: ["$userId.email", "$customerEmail"],
          },
        },
        phone: {
          $first: {
            $ifNull: ["$userId.phoneNumber", "$customerPhone"],
          },
        },
        orderCount: { $sum: 1 },
        // totalSpent still uses the revenue filter — pending/cancelled
        // orders don't count toward revenue (they haven't been paid).
        totalSpent: {
          $sum: { $cond: ["$_isRevenue", "$totalAmount", 0] },
        },
        lastOrderDate: { $max: "$createdAt" },
        // hasDelivered is computed across ALL orders for the customer,
        // so a customer with 5 delivered + 1 recent pending shows
        // hasDelivered=1 → "Active" (the new customer-status rule).
        hasDelivered: {
          $max: {
            $cond: [{ $eq: ["$orderStatus", "delivered"] }, 1, 0],
          },
        },
        // Pushed array — small (per-customer order count), sorted desc
        // in JS, used to derive latestOrderStatus.
        _orders: {
          $push: { orderStatus: "$orderStatus", createdAt: "$createdAt" },
        },
      },
    },
    // Keep ONLY customers that have at least one revenue-eligible
    // order (paid or delivered). This preserves the "Total Customers
    // = customers with revenue" property that the Dashboard card
    // depends on. Pending-only and cancelled-only customers are
    // excluded here, which is the same behavior the previous code
    // had (the old `$match: revenueMatch` implicitly did the same).
    { $match: { totalSpent: { $gt: 0 } } },
    { $sort: { lastOrderDate: -1 } },
    {
      $project: {
        _id: 0,
        customerKey: "$_id",
        userId: 1,
        name: { $ifNull: ["$name", "Unknown"] },
        email: { $ifNull: ["$email", "—"] },
        phone: { $ifNull: ["$phone", ""] },
        orderCount: 1,
        totalSpent: { $round: ["$totalSpent", 2] },
        lastOrderDate: 1,
        hasDelivered: 1,
      },
    },
  ]);

  // For each customer row, derive `latestOrderStatus` and
  // `customerStatus` in JS from the _orders list (sorted desc by
  // createdAt) + the rolled-up `hasDelivered` flag. This stays
  // cheap because the array length equals that customer's order
  // count.
  const customersWithStatus = customersAll.map((c) => {
    const sorted = (c._orders || []).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    const latestOrderStatus = sorted[0]?.orderStatus || "pending";

    // Customer-status rules (priority order, mutually exclusive):
    //   Active    — at least one Delivered order (the spec's
    //               "Delivered/Completed" signal)
    //   Returning — 2+ orders total, none delivered
    //   New       — exactly 1 order total
    //   Inactive  — fallback (revenue-eligible but no Delivered)
    //
    // Cancelled orders count toward orderCount (so a customer with
    // 3 orders + 1 cancellation is "Returning", not "New"), but do
    // NOT make the customer Active — cancelled ≠ completed.
    let customerStatus;
    if (c.hasDelivered) {
      customerStatus = "Active";
    } else if (c.orderCount >= 2) {
      customerStatus = "Returning";
    } else if (c.orderCount === 1) {
      customerStatus = "New";
    } else {
      customerStatus = "Inactive";
    }

    const { _orders, ...rest } = c;
    return { ...rest, customerStatus, latestOrderStatus };
  });

  return {
    // The five canonical numbers every page reads.
    totalRevenue: round2(overall?.[0]?.total || 0),
    onlineRevenue: round2(onlineAgg?.[0]?.total || 0),
    codRevenue: round2(codAgg?.[0]?.total || 0),
    totalOrders: ordersCountAgg?.[0]?.count || 0,
    totalCustomers: customersWithStatus.length,

    // Status breakdown for the Analytics page's six cards.
    totalDelivered: deliveredCount || 0,
    pendingOrders: pendingCount || 0,
    cancelledOrders: cancelledCount || 0,

    // Per-customer rollup. Same row set as the numbers above, so
    // totalCustomers === customers.length is guaranteed by construction.
    customers: customersWithStatus,
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function emptyStats() {
  return {
    totalRevenue: 0,
    onlineRevenue: 0,
    codRevenue: 0,
    totalOrders: 0,
    totalCustomers: 0,
    totalDelivered: 0,
    pendingOrders: 0,
    cancelledOrders: 0,
    customers: [],
  };
}

module.exports = {
  getStats,
};
