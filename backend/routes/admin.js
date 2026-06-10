"use strict";
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Promo = require("../models/Promo"); // Added Promo model for consistency
const { requireAuth, requireAdmin } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function toInt(val, def, min = 1, max = 100) {
  const num = parseInt(val);
  if (isNaN(num)) return def;
  return Math.min(Math.max(num, min), max);
}
/* ───────────────────────── GLOBAL PROTECTION ───────────────────────── */
router.use(requireAuth);
router.use(requireAdmin);
/* ───────────────────────── STATS ───────────────────────── */
router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const [totalUsers, totalVendors, totalProducts, totalOrders] =
      await Promise.all([
        User.countDocuments({ isAdmin: false }),
        User.countDocuments({ isVendor: true }),
        Product.countDocuments({ isDeleted: { $ne: true } }), // Only count non-deleted products
        Order.countDocuments(),
      ]);
    let totalRevenue = 0;
    let vendorEarnings = [];
    try {
      const revenueAgg = await Order.aggregate([
        { $match: { $or: [{ paymentStatus: "paid" }, { orderStatus: "delivered" }] } },
        {
          $group: {
            _id: null,
            total: { $sum: "$totalAmount" },
          },
        },
      ]);
      totalRevenue = Number(revenueAgg?.[0]?.total || 0);
      // ✅ CRITICAL FIX: Use top-level vendorId for much simpler aggregation
      const vendorAgg = await Order.aggregate([
        { $match: { vendorId: { $ne: null }, $or: [{ paymentStatus: "paid" }, { orderStatus: "delivered" }] } },
        {
          $group: {
            _id: "$vendorId",
            totalRevenue: { $sum: "$totalAmount" },
            totalOrders: { $sum: 1 },
            totalItems: { $sum: { $sum: "$items.quantity" } }
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 20 },
      ]);
      const vendorIds = vendorAgg.map((v) => v._id).filter(Boolean);
      const vendors = await User.find({ _id: { $in: vendorIds } })
        .select("name storeName email")
        .lean();
      const map = {};
      vendors.forEach((v) => {
        map[String(v._id)] = v;
      });
      vendorEarnings = vendorAgg.map((v) => ({
        vendorId: v._id,
        vendorName:
          map[String(v._id)]?.storeName ||
          map[String(v._id)]?.name ||
          "Unknown",
        vendorEmail: map[String(v._id)]?.email || "",
        totalRevenue: Number(v.totalRevenue || 0),
        totalOrders: v.totalOrders || 0,
        totalItems: v.totalItems || 0,
      }));
    } catch (err) {
      console.error("[admin/stats aggregation]", err.message);
    }
    const [recentOrders, pendingVendors] = await Promise.all([
      Order.find().sort({ createdAt: -1 }).limit(5).lean(),
      User.countDocuments({ isVendor: true, vendorStatus: "pending" }),
    ]);
    // Return flat object (NOT wrapped in success helper to match frontend expectation)
    res.json({
      totalUsers,
      totalVendors,
      totalProducts,
      totalOrders,
      totalRevenue,
      vendorEarnings,
      recentOrders,
      pendingVendors,
    });
  })
);
/* ───────────────────────── USERS (PAGINATED) ───────────────────────── */
router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const { search, role, page = 1, limit = 20 } = req.query;
    const pageNum = toInt(page, 1);
    const limitNum = toInt(limit, 20, 1, 100);
    const skip = (pageNum - 1) * limitNum;
    const filter = {};
    if (search?.trim()) {
      const safe = escapeRegex(search.trim());
      filter.$or = [
        { name: { $regex: safe, $options: "i" } },
        { email: { $regex: safe, $options: "i" } },
      ];
    }
    if (role === "admin") filter.isAdmin = true;
    if (role === "vendor") filter.isVendor = true;
    if (role === "customer") {
      filter.isAdmin = false;
      filter.isVendor = false;
    }
    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password -resetToken -resetExpires")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(filter),
    ]);
    res.json({
      data: users || [],
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    });
  })
);
/* ───────────────────────── UPDATE USER ───────────────────────── */
router.put(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  })
);
/* ───────────────────────── DELETE USER ───────────────────────── */
router.delete(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deleted" });
  })
);
/* ───────────────────────── TOGGLE ADMIN STATUS ───────────────────────── */
router.patch(
  "/users/:id/toggle-admin",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.isAdmin = !user.isAdmin;
    await user.save();
    res.json(user);
  })
);
/* ───────────────────────── ALL VENDORS (FOR ADMIN) ───────────────────────── */
router.get(
  "/vendors",
  asyncHandler(async (req, res) => {
    const vendors = await User.find({ isVendor: true })
      .select("-password -resetToken -resetExpires")
      .sort({ createdAt: -1 })
      .lean();
    res.json(vendors || []);
  })
);
/* ───────────────────────── APPROVE VENDOR (PATCH) ───────────────────────── */
router.patch(
  "/vendors/:id/approve",
  asyncHandler(async (req, res) => {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { vendorStatus: "approved", approvedAt: new Date() } },
      { new: true }
    ).lean();
    if (!user) return res.status(404).json({ error: "Vendor not found" });
    res.json(user);
  })
);
/* ───────────────────────── SUSPEND VENDOR (PATCH) ───────────────────────── */
router.patch(
  "/vendors/:id/suspend",
  asyncHandler(async (req, res) => {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { vendorStatus: "suspended" } },
      { new: true }
    ).lean();
    if (!user) return res.status(404).json({ error: "Vendor not found" });
    res.json(user);
  })
);
/* ───────────────────────── VENDOR APPROVAL WORKFLOW ───────────────────────── */
const vendorRoutes = require("./admin-vendors");
/* ───────────────────────── PENDING VENDORS ───────────────────────── */
router.get(
  "/vendors/pending",
  asyncHandler(async (req, res) => {
    const vendors = await User.find({ isVendor: true, vendorStatus: "pending" })
      .select("-password -resetToken -resetExpires")
      .sort({ createdAt: -1 })
      .lean();
    res.json(vendors || []);
  })
);

/* ───────────────────────── REJECT VENDOR ───────────────────────── */
router.patch(
  "/vendors/:id/reject",
  asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { vendorStatus: "rejected", vendorRejectedReason: reason || "" } },
      { new: true }
    ).lean();
    if (!user) return res.status(404).json({ error: "Vendor not found" });
    res.json(user);
  })
);

/* ───────────────────────── VENDOR APPROVAL WORKFLOW ───────────────────────── */
router.use("/vendors", vendorRoutes);

/* ───────────────────────── GET ALL ORDERS ───────────────────────── */
router.get(
  "/orders",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    // Only show non-delivered orders (active orders)
    const orders = await Order.find({ orderStatus: { $ne: "delivered" } })
      .populate("userId", "name email phone")
      .populate("items.vendorId", "storeName")
      .sort({ createdAt: -1 })
      .lean();
    res.json(orders || []);
  })
);

/* ───────────────────────── GET DELIVERED ORDERS ───────────────────────── */
router.get(
  "/orders/delivered",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { filter, startDate, endDate, search, vendorId } = req.query;

    // Build date filter
    const dateFilter = {};
    const now = new Date();

    switch (filter) {
      case "today":
        const todayStart = new Date(now.setHours(0, 0, 0, 0));
        const todayEnd = new Date(now.setHours(23, 59, 59, 999));
        dateFilter.deliveredAt = { $gte: todayStart, $lte: todayEnd };
        break;
      case "last7days":
        dateFilter.deliveredAt = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
        break;
      case "last30days":
        dateFilter.deliveredAt = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
        break;
      case "custom":
        if (startDate && endDate) {
          dateFilter.deliveredAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }
        break;
    }

    // Base query: only delivered orders
    const query = { orderStatus: "delivered", ...dateFilter };

    // Filter by vendor if specified
    if (vendorId) {
      query["items.vendorId"] = vendorId;
    }

    // Search filter
    if (search) {
      const searchRegex = new RegExp(search, "i");
      query.$or = [
        { _id: searchRegex },
        { "userId.name": searchRegex },
        { "items.vendorId.storeName": searchRegex },
      ];
    }

    const orders = await Order.find(query)
      .populate("userId", "name email phone")
      .populate("items.vendorId", "storeName")
      .sort({ deliveredAt: -1 })
      .lean();

    res.json(orders || []);
  })
);

/* ───────────────────────── MIGRATION: Set deliveredAt for existing delivered orders ───────────────────────── */
router.post(
  "/orders/delivered/migrate",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    // Find all delivered orders without deliveredAt
    const ordersWithoutDate = await Order.find({
      orderStatus: "delivered",
      deliveredAt: { $exists: false }
    });

    // Set deliveredAt to createdAt (approximate)
    let updated = 0;
    for (const order of ordersWithoutDate) {
      order.deliveredAt = order.createdAt;
      await order.save();
      updated++;
    }

    res.json({
      message: "Migration complete",
      updatedCount: updated
    });
  })
);

/* ───────────────────────── DELIVERED ORDERS STATISTICS ───────────────────────── */
router.get(
  "/orders/delivered/stats",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Total delivered orders
    const totalDelivered = await Order.countDocuments({ orderStatus: "delivered" });

    // Total revenue from delivered orders
    const revenueAgg = await Order.aggregate([
      { $match: { orderStatus: "delivered", paymentStatus: "paid" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    // Delivered today
    const deliveredToday = await Order.countDocuments({
      orderStatus: "delivered",
      deliveredAt: { $gte: startOfToday },
    });

    // Delivered this month
    const deliveredThisMonth = await Order.countDocuments({
      orderStatus: "delivered",
      deliveredAt: { $gte: startOfMonth },
    });

    // Monthly revenue
    const monthlyRevenueAgg = await Order.aggregate([
      { $match: { orderStatus: "delivered", paymentStatus: "paid", deliveredAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);
    const monthlyRevenue = monthlyRevenueAgg[0]?.total || 0;

    // Average order value
    const avgOrderValue = totalDelivered > 0 ? totalRevenue / totalDelivered : 0;

    res.json({
      totalDelivered,
      totalRevenue,
      deliveredToday,
      deliveredThisMonth,
      monthlyRevenue,
      avgOrderValue,
    });
  })
);


/* ───────────────────────── REVENUE SYNC (Admin Maintenance) ───────────────────────── */
const { syncMissingRevenue } = require("../services/revenue");

router.post(
  "/sync-revenue",
  asyncHandler(async (req, res) => {
    const result = await syncMissingRevenue();
    res.json(result);
  })
);

/* ───────────────────────── ANALYTICS - CALENDAR DATA ───────────────────────── */
router.get(
  "/analytics/calendar",
  asyncHandler(async (req, res) => {
    const { year, month } = req.query;
    const now = new Date();
    const targetYear = parseInt(year) || now.getFullYear();
    const targetMonth = parseInt(month) || now.getMonth();

    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

    // Aggregate orders by day for the month
    const calendarData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: "$totalAmount" },
          paidOrders: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] },
          },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "pending"] }, 1, 0] },
          },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, 1, 0] },
          },
          codOrders: {
            $sum: { $cond: [{ $eq: ["$paymentMethod", "cash"] }, 1, 0] },
          },
          paystackOrders: {
            $sum: { $cond: [{ $eq: ["$paymentMethod", "paystack"] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Format for calendar display
    const calendarMap = {};
    calendarData.forEach((day) => {
      calendarMap[day._id] = {
        totalOrders: day.totalOrders || 0,
        totalRevenue: Number(day.totalRevenue || 0),
        paidOrders: day.paidOrders || 0,
        pendingOrders: day.pendingOrders || 0,
        deliveredOrders: day.deliveredOrders || 0,
        codOrders: day.codOrders || 0,
        paystackOrders: day.paystackOrders || 0,
      };
    });

    res.json({
      year: targetYear,
      month: targetMonth,
      data: calendarMap,
    });
  })
);

/* ───────────────────────── ANALYTICS - DAILY DETAILS ───────────────────────── */
router.get(
  "/analytics/daily",
  asyncHandler(async (req, res) => {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: "Date is required (YYYY-MM-DD)" });
    }

    const targetDate = new Date(date);
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const orders = await Order.find({
      createdAt: { $gte: targetDate, $lt: nextDate },
    })
      .populate("userId", "name email")
      .populate("vendorId", "storeName")
      .sort({ createdAt: -1 })
      .lean();

    // Calculate metrics
    const metrics = {
      totalOrders: orders.length,
      totalRevenue: 0,
      paidRevenue: 0,
      pendingRevenue: 0,
      deliveredRevenue: 0,
      codCount: 0,
      paystackCount: 0,
      pendingOrders: 0,
      confirmedOrders: 0,
      preparingOrders: 0,
      outForDelivery: 0,
      deliveredOrders: 0,
    };

    const topProducts = {};
    const vendorStats = {};

    orders.forEach((order) => {
      const amount = Number(order.totalAmount || 0);
      metrics.totalRevenue += amount;

      if (order.paymentStatus === "paid") {
        metrics.paidRevenue += amount;
      } else if (order.paymentStatus === "pending") {
        metrics.pendingRevenue += amount;
      }

      if (order.paymentMethod === "cash") {
        metrics.codCount++;
      } else if (order.paymentMethod === "paystack") {
        metrics.paystackCount++;
      }

      // Status counts
      switch (order.orderStatus) {
        case "pending":
          metrics.pendingOrders++;
          break;
        case "confirmed":
          metrics.confirmedOrders++;
          break;
        case "preparing":
          metrics.preparingOrders++;
          break;
        case "out_for_delivery":
          metrics.outForDelivery++;
          break;
        case "delivered":
          metrics.deliveredOrders++;
          metrics.deliveredRevenue += amount;
          break;
      }

      // Top products
      (order.items || []).forEach((item) => {
        const key = item.name || "Unknown";
        if (!topProducts[key]) {
          topProducts[key] = { name: key, quantity: 0, revenue: 0 };
        }
        topProducts[key].quantity += item.quantity || 1;
        topProducts[key].revenue += (item.price || 0) * (item.quantity || 1);
      });

      // Vendor stats (for admin)
      const vendorName = order.vendorId?.storeName || "Unknown";
      if (!vendorStats[vendorName]) {
        vendorStats[vendorName] = { name: vendorName, orders: 0, revenue: 0 };
      }
      vendorStats[vendorName].orders++;
      vendorStats[vendorName].revenue += amount;
    });

    // Sort top products
    const topProductsList = Object.values(topProducts)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Sort vendor stats
    const vendorStatsList = Object.values(vendorStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    res.json({
      date,
      metrics,
      orders: orders.map((o) => ({
        _id: o._id,
        customerName: o.customerName,
        customerEmail: o.customerEmail,
        customerPhone: o.customerPhone,
        totalAmount: o.totalAmount,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        orderStatus: o.orderStatus,
        createdAt: o.createdAt,
        items: o.items,
        vendorName: o.vendorId?.storeName,
      })),
      topProducts: topProductsList,
      vendorStats: vendorStatsList,
    });
  })
);

/* ───────────────────────── ANALYTICS - SUMMARY STATS ───────────────────────── */
router.get(
  "/analytics/summary",
  asyncHandler(async (req, res) => {
    const { period = "all" } = req.query;
    let dateFilter = {};

    const now = new Date();
    switch (period) {
      case "today":
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        dateFilter = { createdAt: { $gte: todayStart } };
        break;
      case "yesterday":
        const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        dateFilter = { createdAt: { $gte: yesterdayStart, $lt: yesterdayEnd } };
        break;
      case "7days":
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFilter = { createdAt: { $gte: weekAgo } };
        break;
      case "30days":
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFilter = { createdAt: { $gte: monthAgo } };
        break;
      case "month":
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFilter = { createdAt: { $gte: monthStart } };
        break;
      case "lastMonth":
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        dateFilter = { createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd } };
        break;
      default:
        // "all" - no filter
        break;
    }

    // Get totals
    const [
      totalOrders,
      totalRevenue,
      paidOrders,
      paidRevenue,
      pendingOrders,
      codOrders,
      paystackOrders,
      deliveredOrders,
    ] = await Promise.all([
      Order.countDocuments(dateFilter),
      Order.aggregate([
        { $match: dateFilter },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      Order.countDocuments({ ...dateFilter, paymentStatus: "paid" }),
      Order.aggregate([
        { $match: { ...dateFilter, paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      Order.countDocuments({ ...dateFilter, paymentStatus: "pending" }),
      Order.countDocuments({ ...dateFilter, paymentMethod: "cash" }),
      Order.countDocuments({ ...dateFilter, paymentMethod: "paystack" }),
      Order.countDocuments({ ...dateFilter, orderStatus: "delivered" }),
    ]);

    // Get average order value
    const avgOrderValue =
      totalOrders > 0 ? Number(totalRevenue[0]?.total || 0) / totalOrders : 0;

    // Get active vendors count
    const activeVendors = await User.countDocuments({
      isVendor: true,
      vendorStatus: "approved",
    });

    res.json({
      period,
      totalOrders,
      totalRevenue: Number(totalRevenue[0]?.total || 0),
      paidOrders,
      paidRevenue: Number(paidRevenue[0]?.total || 0),
      pendingOrders,
      codOrders,
      paystackOrders,
      deliveredOrders,
      avgOrderValue,
      activeVendors,
    });
  })
);

/* ───────────────────────── ANALYTICS - CHART DATA ───────────────────────── */
router.get(
  "/analytics/chart",
  asyncHandler(async (req, res) => {
    const { type = "daily", days = 30 } = req.query;
    const numDays = parseInt(days) || 30;
    const now = new Date();
    const startDate = new Date(now.getTime() - numDays * 24 * 60 * 60 * 1000);

    let groupBy;
    switch (type) {
      case "weekly":
        groupBy = {
          $dateToString: { format: "%Y-W%V", date: "$createdAt" },
        };
        break;
      case "monthly":
        groupBy = {
          $dateToString: { format: "%Y-%m", date: "$createdAt" },
        };
        break;
      default:
        // daily
        groupBy = {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
        };
    }

    const chartData = await Order.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: groupBy,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: "$totalAmount" },
          paidOrders: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] } },
          deliveredOrders: { $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json(chartData.map((d) => ({
      period: d._id,
      totalOrders: d.totalOrders,
      totalRevenue: Number(d.totalRevenue || 0),
      paidOrders: d.paidOrders,
      deliveredOrders: d.deliveredOrders,
    })));
  })
);

module.exports = router;
