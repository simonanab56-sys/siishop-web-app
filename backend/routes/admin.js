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
    const orders = await Order.find()
      .populate("userId", "name email phone")
      .populate("items.vendorId", "storeName")
      .sort({ createdAt: -1 })
      .lean();
    res.json(orders || []);
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

module.exports = router;
