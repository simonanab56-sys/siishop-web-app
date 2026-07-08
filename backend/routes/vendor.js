"use strict";

const express = require("express");
const router  = express.Router();
const mongoose = require("mongoose");

const User    = require("../models/User");
const Product = require("../models/Product");
const requireApprovedVendor = require("../middleware/requireApprovedVendor");
const Order   = require("../models/Order");
const { requireAuth, requireVendor } = require("../middleware/auth");
const { notifyOrderStatusUpdate } = require("../services/notification.service");
const { validate, vendorUpdateOrderStatusSchema } = require("../utils/joiSchemas");
const { validateCategory } = require("../utils/categoryValidator");
const { prepareProductForSave } = require("../services/product.service");
const walletService = require("../services/wallet.service");
const mediaService = require("../services/media.service");
const restaurantStats = require("../services/restaurantStats.service");
const logger  = require("../utils/logger");

// ── LOCATION CONFIG ─────────────────────────────────────────────────────────────
// Load Ghana locations configuration safely
let ghanaLocations = null;
try {
  ghanaLocations = require("../config/ghanaLocations");
} catch (err) {
  console.error("[VENDOR] Failed to load ghanaLocations:", err.message);
}

// ── UPLOAD MIDDLEWARE (shared via media.service) ────────────────────────────
// Same presets as routes/products.js — Cloudinary-backed when env vars are
// set, local-disk fallback otherwise. The named `productMulter` /
// `productVideoMulter` instances know about the right folders, size limits,
// and file filters; routes just chain them and call `toImageRecords` /
// `toVideoRecord` / `destroyAsset` to normalize the result.
const multiUpload = mediaService.productMulter.array("images", 10);
const videoUpload = mediaService.productVideoMulter.single("video");

function toObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

/* PUBLIC — Get vendor store by slug */
router.get("/store/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    // ✅ ADDED: Filter by vendorType to only show marketplace vendors
    // BACKWARD COMPATIBLE: Include vendors without vendorType (legacy data)
    const vendor = await User.findOne({
      vendorSlug: slug,
      isVendor: true,
      vendorStatus: "approved",
      $or: [
        { vendorType: "marketplace" },
        { vendorType: { $exists: false } },
        { vendorType: null },
        { vendorType: "" }
      ]
    }).select("storeName storeDescription storeLogo vendorSlug vendorStatus kycStatus approvedAt location vendorType");

    if (!vendor) {
      return res.status(404).json({ error: "Store not found" });
    }

    // Double-check vendor is marketplace type (or legacy without vendorType = marketplace)
    if (vendor.vendorType && vendor.vendorType !== "marketplace") {
      return res.status(404).json({ error: "Store not found" });
    }

    // Get vendor statistics
    const Product = require("../models/Product");
    const Order = require("../models/Order");

    const productCount = await Product.countDocuments({
      vendorId: vendor._id,
      isDeleted: { $ne: true }
    });

    const ordersCompleted = await Order.countDocuments({
      "items.vendorId": vendor._id,
      orderStatus: "delivered"
    });

    res.json({
      vendor: {
        _id: vendor._id,
        storeName: vendor.storeName,
        storeDescription: vendor.storeDescription,
        storeLogo: vendor.storeLogo,
        vendorSlug: vendor.vendorSlug,
        vendorStatus: vendor.vendorStatus,
        kycStatus: vendor.kycStatus,
        approvedAt: vendor.approvedAt,
        location: vendor.location || null,
        formattedLocation: vendor.getFormattedLocation?.() || "Location not specified",
      },
      stats: {
        productCount,
        ordersCompleted,
      }
    });
  } catch (err) {
    console.error("[VENDOR STORE] Error:", err.message);
    res.status(500).json({ error: "Failed to load store" });
  }
});

/* PUBLIC — Get vendor products by slug */
router.get("/store/:slug/products", async (req, res) => {
  try {
    const { slug } = req.params;
    const { limit = 20, skip = 0 } = req.query;
    logger.log("=== VENDOR PRODUCTS DEBUG ===");
    logger.log("Store slug:", slug);

    // GUARD: Ensure slug is provided
    if (!slug || slug.trim() === "") {
      logger.log("ERROR: Empty slug provided, returning 400");
      return res.status(400).json({ error: "Store slug is required" });
    }

    // Find vendor by vendorSlug field
    // ✅ ADDED: Filter by vendorType to only show marketplace vendors
    // BACKWARD COMPATIBLE: Include vendors without vendorType (legacy data)
    let vendor = await User.findOne({
      vendorSlug: slug,
      isVendor: true,
      vendorStatus: "approved",
      $or: [
        { vendorType: "marketplace" },
        { vendorType: { $exists: false } },
        { vendorType: null },
        { vendorType: "" }
      ]
    }).select("_id storeName vendorSlug location vendorType");

    // If not found, try alternative field name storeSlug
    if (!vendor) {
      logger.log("Vendor not found with vendorSlug:", slug);
      vendor = await User.findOne({
        storeSlug: slug,
        isVendor: true,
        vendorStatus: "approved",
        $or: [
          { vendorType: "marketplace" },
          { vendorType: { $exists: false } },
          { vendorType: null },
          { vendorType: "" }
        ]
      }).select("_id storeName storeSlug location vendorType");

      if (!vendor) {
        logger.log("Vendor still not found, returning 404");
        return res.status(404).json({ error: "Store not found" });
      }
      logger.log("Found vendor using storeSlug field:", vendor._id, vendor.storeName);
    }

    // Double-check vendor is marketplace type (belt and suspenders)
    // BACKWARD COMPATIBLE: Allow vendors without vendorType (legacy data)
    if (vendor.vendorType && vendor.vendorType !== "marketplace") {
      logger.log("Vendor is not a marketplace vendor:", slug, vendor.vendorType);
      return res.status(404).json({ error: "Store not found" });
    }

    logger.log("Vendor found:", vendor._id, vendor.storeName, "vendorSlug:", vendor.vendorSlug || vendor.storeSlug);

    const Product = require("../models/Product");
    // CRITICAL: Filter by vendor._id - never return all products
    const products = await Product.find({
      vendorId: vendor._id,
      isDeleted: { $ne: true }
    })
      .populate("vendorId", "storeName storeLogo vendorSlug location")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip))
      .lean();

    logger.log("Products count for vendor", vendor._id, ":", products.length);
    if (products.length > 0) {
      logger.log("First product vendor:", products[0].vendorId?.storeName);
    }
    res.json(products || []);
  } catch (err) {
    console.error("[VENDOR PRODUCTS] Error:", err.message);
    res.status(500).json({ error: "Failed to load products" });
  }
});

/* PUBLIC — list approved vendors (for StoresPage) with optional search */
router.get("/list", async (req, res) => {
  try {
    // ✅ NEW: Filter by vendorType (default to marketplace for backward compatibility)
    // Accept both "type" and "vendorType" for backward compatibility
    const vendorType = req.query.vendorType || req.query.type || "marketplace";

    // BACKWARD COMPATIBLE: Include vendors without vendorType (legacy data)
    let filter;
    if (vendorType === "marketplace") {
      filter = {
        isVendor: true,
        vendorStatus: "approved",
        $or: [
          { vendorType: "marketplace" },
          { vendorType: { $exists: false } },
          { vendorType: null },
          { vendorType: "" }
        ]
      };
    } else {
      // For restaurant, only show explicit restaurant vendors
      filter = {
        isVendor: true,
        vendorType: "restaurant",
        vendorStatus: "approved",
      };
    }

    // ── SEARCH: Search by store name, name, description, or location ────────────────
    if (req.query.search) {
      const searchTerm = req.query.search.trim();
      const searchRegex = new RegExp(searchTerm, "i"); // case-insensitive

      filter.$or = [
        { storeName: { $regex: searchRegex } },
        { name: { $regex: searchRegex } },
        { storeDescription: { $regex: searchRegex } },
        { "location.region": { $regex: searchRegex } },
        { "location.city": { $regex: searchRegex } }
      ];
    }

    // ── LOCATION FILTER: Filter by region ────────────────
    if (req.query.region) {
      filter["location.region"] = req.query.region;
    }

    // ── LOCATION FILTER: Filter by city ────────────────
    if (req.query.city) {
      filter["location.city"] = req.query.city;
    }

    const vendors = await User.find(filter)
      .select("name storeName storeDescription storeLogo email location")
      .sort({ createdAt: -1 })
      .lean();

    // Add formatted location to each vendor
    const vendorsWithLocation = (vendors || []).map(v => ({
      ...v,
      formattedLocation: (v.location?.region && v.location?.city)
        ? `${v.location.city}, ${v.location.region}`
        : "Location not specified"
    }));

    res.json(vendorsWithLocation);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

/* PUBLIC — vendor profile by ID */
router.get("/profile/:id", async (req, res) => {
  try {
    const vendor = await User.findOne({
      _id: req.params.id,
      isVendor: true,
      vendorStatus: "approved",
    })
      .select("name storeName storeDescription storeLogo email location")
      .lean();

    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    // Add formatted location
    const vendorWithLocation = {
      ...vendor,
      formattedLocation: (vendor.location?.region && vendor.location?.city)
        ? `${vendor.location.city}, ${vendor.location.region}`
        : "Location not specified"
    };
    res.json(vendorWithLocation);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch vendor profile" });
  }
});

/* VENDOR: Generate or get store slug */
router.post("/generate-slug", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const vendorId = toObjectId(req.user.userId);
    const User = require("../models/User");

    let vendor = await User.findById(vendorId);

    // If vendor already has slug, return it
    if (vendor.vendorSlug) {
      return res.json({ slug: vendor.vendorSlug, message: "Slug already exists" });
    }

    // Generate slug from store name
    const baseSlug = (vendor.storeName || vendor.name || "store")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();

    // Check if slug exists and make it unique
    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await User.findOne({
        vendorSlug: slug,
        _id: { $ne: vendorId }
      });

      if (!existing) break;

      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    vendor.vendorSlug = slug;
    await vendor.save();

    res.json({ slug: vendor.vendorSlug, message: "Slug generated successfully" });
  } catch (err) {
    console.error("[GENERATE SLUG] Error:", err.message);
    res.status(500).json({ error: "Failed to generate slug" });
  }
});

/* VENDOR: Get current store slug */
router.get("/store-slug", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const vendorId = toObjectId(req.user.userId);
    const User = require("../models/User");

    const vendor = await User.findById(vendorId).select("vendorSlug storeName");

    res.json({
      slug: vendor.vendorSlug || null,
      storeName: vendor.storeName
    });
  } catch (err) {
    console.error("[GET SLUG] Error:", err.message);
    res.status(500).json({ error: "Failed to get slug" });
  }
});

/* DASHBOARD */
router.get("/dashboard", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const vendorId = toObjectId(req.user.userId);

    // Get vendor info (storeName, storeSlug, location)
    const User = require("../models/User");
    const vendor = await User.findById(vendorId).select("storeName vendorSlug location").lean();

    const [productsCount, ordersCount, recentOrders] = await Promise.all([
      Product.countDocuments({ vendorId, isDeleted: { $ne: true } }),
      Order.countDocuments({ "items.vendorId": vendorId }),
      Order.find({ "items.vendorId": vendorId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    // ✅ CRITICAL FIX: Use top-level vendorId for aggregation (much simpler and faster)
    const revenueAgg = await Order.aggregate([
      { $match: { vendorId: vendorId, $or: [{ paymentStatus: "paid" }, { orderStatus: "delivered" }] } },
      {
        $group: {
          _id: null,
          total: { $sum: "$totalAmount" },
        },
      },
    ]);

    res.json({
      totalProducts: productsCount,
      totalOrders: ordersCount,
      totalRevenue: revenueAgg?.[0]?.total || 0,
      recentOrders,
      storeName: vendor?.storeName || "",
      storeSlug: vendor?.vendorSlug || "",
      location: vendor?.location || null,
    });
  } catch (err) {
    res.status(500).json({ error: "Dashboard error" });
  }
});

/* CONSOLIDATED STATS — single source of truth for every page
 *
 * Used by Restaurant Dashboard, Restaurant Wallet, Restaurant Customers,
 * and Restaurant Analytics. Returns the same five numbers (Total Revenue,
 * Online Revenue, COD Revenue, Total Orders, Total Customers) computed in
 * a single MongoDB aggregation in services/restaurantStats.service.js.
 *
 * Why a new endpoint rather than calling /api/wallet/summary for the
 * wallet numbers: the wallet service reads from a `Wallet` document that
 * is only credited when an order transitions to "delivered" via
 * walletService.processOrderEarnings. If the vendor has historical
 * delivered orders that pre-date that hook, the wallet shows zero
 * even though the orders exist. Aggregating directly from the Order
 * collection guarantees the numbers the vendor sees on Wallet match
 * the numbers on Dashboard, Customers and Analytics.
 *
 * Vendor scope: `requireApprovedVendor` + `items.vendorId = req.user.userId`
 * (mirrors every other /vendor/* endpoint — works for both marketplace
 * and restaurant vendors because both write items[].vendorId).
 */
router.get("/stats", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const vendorId = toObjectId(req.user.userId);
    const stats = await restaurantStats.getStats(vendorId);
    res.json(stats);
  } catch (err) {
    console.error("[VENDOR STATS] Error:", err.message);
    res.status(500).json({ error: "Failed to load stats" });
  }
});

/* MY ORDERS — vendor sees orders containing their products (active orders only) */
router.get("/orders", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const vendorId = toObjectId(req.user.userId);

    const orders = await Order.find({
      "items.vendorId": vendorId,
      orderStatus: { $ne: "delivered" }
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

/* MY DELIVERED ORDERS — vendor sees their delivered orders */
router.get("/orders/delivered", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const vendorId = toObjectId(req.user.userId);
    const { filter, startDate, endDate, search } = req.query;

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

    // Base query: delivered orders for this vendor
    const query = {
      "items.vendorId": vendorId,
      orderStatus: "delivered",
      ...dateFilter
    };

    // Search filter
    if (search) {
      const searchRegex = new RegExp(search, "i");
      query.$or = [
        { _id: searchRegex },
        { "userId.name": searchRegex },
      ];
    }

    const orders = await Order.find(query)
      .populate("userId", "name email phone")
      .sort({ deliveredAt: -1 })
      .lean();

    res.json(orders);
  } catch (err) {
    logger.error("Failed to fetch delivered orders:", err);
    res.status(500).json({ error: "Failed to fetch delivered orders" });
  }
});

/* MY DELIVERED ORDERS STATISTICS
 *
 * Mirrors the list endpoint's filter contract so the four stat cards stay
 * in lockstep with the table. The active filter (today / last7days /
 * last30days / custom) narrows every count and every revenue aggregation
 * to the same window the table shows.
 *
 * Revenue is summed as `price × quantity` per line item, matching the
 * formula used in services/wallet.service.js#processOrderEarnings so the
 * numbers here agree with what the Wallet tab credits.
 *
 * Scope: `items.vendorId = req.user.userId` — works identically for
 * marketplace vendors and restaurants because restaurant orders write
 * `items[].vendorId = restaurant.userId`.
 */
router.get("/orders/delivered/stats", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const vendorId = toObjectId(req.user.userId);
    const { filter, startDate, endDate, search } = req.query;

    // Reuse the same window builder as the list endpoint so the cards and
    // the table cannot drift apart.
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    let filterStart = null;
    let filterEnd = null;
    switch (filter) {
      case "today":
        filterStart = todayStart;
        filterEnd = todayEnd;
        break;
      case "last7days":
        filterStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filterEnd = now;
        break;
      case "last30days":
        filterStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        filterEnd = now;
        break;
      case "custom":
        if (startDate && endDate) {
          filterStart = new Date(startDate);
          filterEnd = new Date(endDate);
        }
        break;
      default:
        // "all" or unset → no filter window.
        break;
    }

    // deliveredAt constraint applied to every query so cards stay
    // synchronized with the table.
    const deliveredAtFilter = (filterStart || filterEnd)
      ? { deliveredAt: { ...(filterStart ? { $gte: filterStart } : {}), ...(filterEnd ? { $lte: filterEnd } : {}) } }
      : {};

    // Optional search (matches the table's case-insensitive _id / userId.name regex).
    const searchMatch = search
      ? { $or: [{ _id: new RegExp(search, "i") }, { "userId.name": new RegExp(search, "i") }] }
      : {};

    const baseMatch = {
      "items.vendorId": vendorId,
      orderStatus: "delivered",
      ...deliveredAtFilter,
      ...searchMatch,
    };

    // Total delivered orders for this vendor (filter-aware)
    const totalDelivered = await Order.countDocuments(baseMatch);

    // Revenue from delivered orders — sum of price × quantity per line item
    // that belongs to this vendor. Mirrors services/wallet.service.js so the
    // stats agree with the wallet accounting.
    const revenueAgg = await Order.aggregate([
      { $match: baseMatch },
      { $unwind: "$items" },
      { $match: { "items.vendorId": vendorId } },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $multiply: [
                { $ifNull: ["$items.price", 0] },
                { $ifNull: ["$items.quantity", 1] },
              ],
            },
          },
        },
      },
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    // Monthly revenue — revenue whose `deliveredAt` falls in the
    // intersection of the current calendar month and the active filter
    // window, so "7 Days" / "30 Days" / "Today" / "Custom" all narrow the
    // Monthly Revenue card in step with the table.
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStart = filterStart && filterStart > startOfMonth ? filterStart : startOfMonth;
    const monthEnd = filterEnd || now;

    const monthlyRevenueAgg = await Order.aggregate([
      {
        $match: {
          ...baseMatch,
          deliveredAt: { $gte: monthStart, $lte: monthEnd },
        },
      },
      { $unwind: "$items" },
      { $match: { "items.vendorId": vendorId } },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $multiply: [
                { $ifNull: ["$items.price", 0] },
                { $ifNull: ["$items.quantity", 1] },
              ],
            },
          },
        },
      },
    ]);
    const monthlyRevenue = monthlyRevenueAgg[0]?.total || 0;

    // Average order value
    const avgOrderValue = totalDelivered > 0 ? totalRevenue / totalDelivered : 0;

    res.json({
      totalDelivered,
      totalRevenue,
      monthlyRevenue,
      avgOrderValue,
    });
  } catch (err) {
    logger.error("Failed to fetch delivered orders stats:", err);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

/* UPDATE ORDER STATUS — vendor updates their own orders
 * Single source of truth for ALL vendors (marketplace + restaurant).
 * Restaurant vendors use this same endpoint via the shared item-owner check.
 */
router.patch(
  "/orders/:id/status",
  requireAuth,
  requireVendor,
  async (req, res) => {
    try {
      // Validate against the canonical 6-status enum so restaurants cannot
      // set legacy restaurant-only statuses (received/ready/rider_assigned/on_the_way).
      const { error, value } = validate(req.body, vendorUpdateOrderStatusSchema);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { orderStatus } = value;
      const vendorId = toObjectId(req.user.userId);

      const order = await Order.findById(req.params.id);

      if (!order) return res.status(404).json({ error: "Order not found" });

      // Ensure this vendor owns at least one item in this order.
      // For restaurant orders, items[].vendorId is set to the restaurant's userId
      // (see food-orders.js POST flow), so the same check covers both vendor types.
      const vendorItem = order.items?.find(
        (item) => String(item.vendorId) === String(vendorId)
      );
      if (!vendorItem) {
        return res.status(403).json({ error: "Not authorized for this order" });
      }

      const oldStatus = order.orderStatus;
      order.orderStatus = orderStatus;

      // Set deliveredAt timestamp when order is delivered
      if (orderStatus === "delivered" && !order.deliveredAt) {
        order.deliveredAt = new Date();
      }

      await order.save();

      // Send status update notification to customer (async, don't block response)
      notifyOrderStatusUpdate(order._id, oldStatus, orderStatus).catch((err) => {
        console.error(`[Vendor] Failed to send status notification:`, err.message);
      });

      // Process wallet earnings when the order transitions to delivered.
      // This mirrors the rider delivery flow in routes/delivery.js and ensures
      // vendors who mark orders delivered from their own dashboard (e.g.
      // restaurants) still credit the wallet correctly. processOrderEarnings
      // is idempotent (guarded by order._walletEarningsProcessed), so the
      // delivery.js hook remains safe if both fire.
      if (orderStatus === "delivered" && oldStatus !== "delivered") {
        walletService.processOrderEarnings(req.params.id).catch((err) => {
          console.error(`[Vendor] Failed to process wallet earnings:`, err.message);
        });
      }

      res.json(order);
    } catch (err) {
      res.status(500).json({ error: "Failed to update order status" });
    }
  }
);

/* MY PRODUCTS */
router.get("/products", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const products = await Product.find({ 
      vendorId: req.user.userId,
      isDeleted: { $ne: true } 
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json(products);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

/* VENDOR: UPLOAD PRODUCT VIDEO */
router.post(
  "/products/:id/video",
  requireAuth, requireApprovedVendor,
  videoUpload,
  mediaService.handleVideoUploadError,
  async (req, res) => {
    try {
      const product = await Product.findOne({ _id: req.params.id, vendorId: req.user.userId, isDeleted: { $ne: true } });
      if (!product) return res.status(404).json({ error: "Product not found" });

      if (!req.file) {
        return res.status(400).json({ error: "No video file uploaded" });
      }

      // Delete old video from Cloudinary if we have a public_id.
      if (product.videoPublicId) {
        const result = await mediaService.destroyAsset(product.videoPublicId, { resourceType: "video" });
        logger.log("[VIDEO] Destroyed old video:", product.videoPublicId, "→", result?.result || "ok");
      }

      // Normalize the uploaded file. `toVideoRecord` returns the canonical
      // `{ url, public_id, duration }` shape regardless of Cloudinary vs.
      // local-disk fallback, so we don't need a giant if/else here.
      const rec = mediaService.toVideoRecord(req.file);
      const videoUrl = rec.url;
      const videoPublicId = rec.public_id;
      const videoDuration = rec.duration || 0;

      product.videoUrl = videoUrl;
      product.videoPublicId = videoPublicId;
      product.videoDuration = videoDuration;
      await product.save();

      res.json({ videoUrl, videoPublicId, videoDuration, message: "Video uploaded successfully" });
    } catch (err) {
      console.error("[VIDEO UPLOAD] Error:", err.message);
      res.status(500).json({ error: "Failed to upload video: " + err.message });
    }
  }
);

/* VENDOR: DELETE PRODUCT VIDEO */
router.delete("/products/:id/video", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, vendorId: req.user.userId, isDeleted: { $ne: true } });
    if (!product) return res.status(404).json({ error: "Product not found" });

    if (product.videoPublicId) {
      const result = await mediaService.destroyAsset(product.videoPublicId, { resourceType: "video" });
      logger.log("[VIDEO] Destroyed video from Cloudinary:", product.videoPublicId, "→", result?.result || "ok");
    }

    product.videoUrl = "";
    product.videoPublicId = "";
    product.videoDuration = 0;
    await product.save();

    res.json({ message: "Video deleted successfully" });
  } catch (err) {
    console.error("[VIDEO DELETE] Error:", err.message);
    res.status(500).json({ error: "Failed to delete video: " + err.message });
  }
});

router.post(
  "/products",
  requireAuth, requireApprovedVendor,
  multiUpload,
  mediaService.handleMulterError,
  async (req, res) => {
    try {
      // 🐛 DEBUG LOGGING (MANDATORY)
      logger.log("=== VENDOR CREATE PRODUCT DEBUG ===");
      logger.log("REQ.USER:", req.user ? { userId: req.user.userId, isAdmin: req.user.isAdmin } : "NO USER");
      logger.log("REQ.BODY:", req.body);
      logger.log("REQ.FILES:", req.files ? `(${req.files.length} files)` : "NO FILES");
      logger.log("FILES DETAIL:", req.files ? req.files.map(f => ({ name: f.originalname, size: f.size, mimetype: f.mimetype })) : []);
      logger.log("===================================");

      // Process uploaded files into images array. `toImageRecords` produces
      // the canonical `{ url, public_id }` shape for every file regardless
      // of Cloudinary vs. local-disk fallback.
      let images = mediaService.toImageRecords(req.files);
      logger.log("[CREATE PRODUCT] Processed images:", images);

      // Backward compatibility: if no files but legacy image field provided
      const legacyImage = req.body.image;
      if (images.length === 0 && legacyImage) {
        images.push({ url: legacyImage, public_id: "" });
        logger.log("[CREATE PRODUCT] Using legacy image:", legacyImage);
      }

      // Validate: require at least one image
      if (images.length === 0) {
        logger.log("[CREATE PRODUCT] ERROR: No images provided");
        return res.status(400).json({ error: "At least one product image is required" });
      }

    // ✅ NEW: Get vendor info to determine productType
    const vendor = await User.findById(req.user.userId);
    const isRestaurant = vendor?.vendorType === "restaurant";
    const productType = isRestaurant ? "food" : "product";
    const preparationTime = isRestaurant ? parseInt(req.body.preparationTime, 10) || 15 : 0;

    // ✅ Reject arbitrary category strings; require a value from the live list
    // (union of distinct Product.category + approved CategoryRequest names).
    const catCheck = await validateCategory({
      submitted: req.body.category,
      op:        "create",
    });
    if (!catCheck.ok) {
      return res.status(400).json({ error: catCheck.message });
    }

    // ✅ Multipart forms can't carry JSON `null` natively, so we accept the
    // string sentinel "null" (and "undefined") as an explicit clear signal.
    // This lets the client FormData path round-trip a "clear the discount"
    // intent instead of having the route silently drop the field.
    const isClearV = (v) => v === null || v === "" || v === "null" || v === "undefined";
    const productData = {
      name:        req.body.name        || "",
      description: req.body.description || "",
      price:       parseFloat(req.body.price)    || 0,
      category:    catCheck.category,
      stock:       parseInt(req.body.stock, 10)  || 0,
      available:   req.body.available === "true" || req.body.available === true,
      images:      images,
      // Legacy field - keep for backward compatibility
      image:       images.length > 0 ? images[0].url : "",
      vendorId:    req.user.userId,
      // ✅ NEW: Unified product system - auto-set based on vendor type
      productType: productType,
      preparationTime: preparationTime,
      // Discount fields (optional). Normalized by prepareProductForSave().
      originalPrice:  isClearV(req.body.originalPrice)
        ? null
        : parseFloat(req.body.originalPrice),
      discountType:   isClearV(req.body.discountType) ? null : req.body.discountType,
      discountValue:  isClearV(req.body.discountValue)
        ? null
        : parseFloat(req.body.discountValue),
    };

    console.log(`[CREATE PRODUCT] Vendor type: ${vendor?.vendorType}, Setting productType: ${productType}`);

    // ✅ Normalize & validate discount (auto-derives isOnSale).
    const prepared = prepareProductForSave(productData);
    if (prepared.error) {
      return res.status(400).json({ error: prepared.error });
    }

    logger.log("[CREATE PRODUCT] Creating product with:", JSON.stringify(prepared.payload));

    let product;
    try {
      product = await Product.create(prepared.payload);
    } catch (dbErr) {
      console.error("[CREATE PRODUCT] DB ERROR:", dbErr.message);
      console.error("[CREATE PRODUCT] DB ERRORS:", dbErr.errors);
      return res.status(500).json({ error: "Database error: " + dbErr.message });
    }
    logger.log("[CREATE PRODUCT] Product created:", product._id);

    res.status(201).json(product);
  } catch (err) {
    console.error("[CREATE PRODUCT] Error:", err.message);
    console.error("[CREATE PRODUCT] Stack:", err.stack);
    res.status(500).json({ error: "Failed to create product: " + err.message });
  }
});

/* UPDATE PRODUCT — ownership-gated, supports multiple images */
router.put(
  "/products/:id",
  requireAuth, requireApprovedVendor,
  multiUpload,
  mediaService.handleMulterError,
  async (req, res) => {
    try {
      // 🐛 DEBUG LOGGING (MANDATORY)
      logger.log("=== VENDOR UPDATE PRODUCT DEBUG ===");
      logger.log("REQ.USER:", req.user ? { userId: req.user.userId, isAdmin: req.user.isAdmin } : "NO USER");
      logger.log("REQ.BODY:", req.body);
      logger.log("REQ.FILES:", req.files ? `(${req.files.length} files)` : "NO FILES");
      logger.log("PRODUCT ID:", req.params.id);
      logger.log("===================================");

      const product = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
      if (!product) return res.status(404).json({ error: "Product not found" });

      // Admin → full access. Vendor → own products only.
      if (!req.user.isAdmin && String(product.vendorId) !== String(req.user.userId)) {
        return res.status(403).json({ error: "Not authorized to update this product" });
      }

      // Get existing images array or initialize
      let existingImages = product.images || [];
      if (existingImages.length === 0 && product.image) {
        existingImages = [{ url: product.image, public_id: "" }];
      }

      // Parse deleteImages - array of URLs to remove
      let imagesToDelete = [];
      if (req.body.deleteImages) {
        try {
          imagesToDelete = typeof req.body.deleteImages === "string"
            ? JSON.parse(req.body.deleteImages)
            : req.body.deleteImages;
        } catch (e) {
          imagesToDelete = req.body.deleteImages ? [req.body.deleteImages] : [];
        }
      }

      // Remove deleted images
      if (imagesToDelete.length > 0) {
        existingImages = existingImages.filter(img => !imagesToDelete.includes(img.url));
      }

      // Add new uploaded images (Cloudinary or local-disk both flow through
      // the shared `toImageRecords` normalizer).
      const newImages = mediaService.toImageRecords(req.files);
      if (newImages.length > 0) {
        existingImages = [...existingImages, ...newImages];
      }

    // Limit to 10 images max
    if (existingImages.length > 10) {
      existingImages = existingImages.slice(0, 10);
    }

    // Update product with new images array
    product.images = existingImages;
    product.image = existingImages.length > 0 ? existingImages[0].url : "";

    // Handle text fields. `category` is whitelist-validated (with legacy
    // preservation); the rest are passthrough.
    const fields = ["name","description","available"];
    fields.forEach((k) => {
      if (req.body[k] !== undefined) {
        if (k === "available") product[k] = req.body[k] === "true" || req.body[k] === true;
        else product[k] = req.body[k];
      }
    });

    if (req.body.category !== undefined) {
      const catCheck = await validateCategory({
        submitted: req.body.category,
        current:   product.category,
        op:        "update",
      });
      if (!catCheck.ok) {
        return res.status(400).json({ error: catCheck.message });
      }
      product.category = catCheck.category;
    }

    if (req.body.price  !== undefined) product.price  = parseFloat(req.body.price)  || 0;
    if (req.body.stock   !== undefined) product.stock   = Math.max(0, parseInt(req.body.stock, 10) || 0);

    // ✅ Multipart forms can't carry JSON `null` natively, so we accept the
    // string sentinel "null" (and "undefined") as an explicit clear signal.
    // This lets the client FormData path round-trip a "clear the discount"
    // intent instead of having the route silently keep the stale DB value.
    const isClearVU = (v) => v === null || v === "" || v === "null" || v === "undefined";
    // Discount fields (optional). Normalized by prepareProductForSave().
    if (req.body.originalPrice !== undefined) {
      product.originalPrice = isClearVU(req.body.originalPrice)
        ? null
        : parseFloat(req.body.originalPrice);
    }
    if (req.body.discountType !== undefined) {
      product.discountType = isClearVU(req.body.discountType) ? null : req.body.discountType;
    }
    if (req.body.discountValue !== undefined) {
      product.discountValue = isClearVU(req.body.discountValue)
        ? null
        : parseFloat(req.body.discountValue);
    }

    // ✅ Normalize & validate discount (auto-derives isOnSale).
    const prepared = prepareProductForSave(product.toObject ? product.toObject() : product);
    if (prepared.error) {
      return res.status(400).json({ error: prepared.error });
    }
    Object.assign(product, prepared.payload);

    await product.save();
    res.json(product);
  } catch (err) {
    console.error("Update product error:", err);
    res.status(500).json({ error: "Failed to update product" });
  }
});

/* DELETE PRODUCT — ownership-gated */
router.delete("/products/:id", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Admin → full access. Vendor → own products only.
    if (!req.user.isAdmin && String(product.vendorId) !== String(req.user.userId)) {
      return res.status(403).json({ error: "Not authorized to delete this product" });
    }

    product.isDeleted = true;
    product.available = false;
    product.stock     = 0;
    await product.save();

    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete product" });
  }
});

/* ───────────────────────── ANALYTICS - CALENDAR DATA ───────────────────────── */
router.get("/analytics/calendar", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const vendorId = toObjectId(req.user.userId);
    const { year, month } = req.query;
    const now = new Date();
    const targetYear = parseInt(year) || now.getFullYear();
    const targetMonth = parseInt(month) || now.getMonth();

    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

    // Aggregate vendor's orders by day for the month
    const calendarData = await Order.aggregate([
      {
        $match: {
          vendorId: vendorId,
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
  } catch (err) {
    res.status(500).json({ error: "Failed to get calendar data" });
  }
});

/* ───────────────────────── ANALYTICS - DAILY DETAILS ───────────────────────── */
router.get("/analytics/daily", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const vendorId = toObjectId(req.user.userId);
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: "Date is required (YYYY-MM-DD)" });
    }

    const targetDate = new Date(date);
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const orders = await Order.find({
      vendorId: vendorId,
      createdAt: { $gte: targetDate, $lt: nextDate },
    })
      .populate("userId", "name email")
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

      // Top products (vendor-specific)
      (order.items || []).forEach((item) => {
        // Only count items from this vendor
        if (String(item.vendorId) === String(vendorId)) {
          const key = item.name || "Unknown";
          if (!topProducts[key]) {
            topProducts[key] = { name: key, quantity: 0, revenue: 0 };
          }
          topProducts[key].quantity += item.quantity || 1;
          topProducts[key].revenue += (item.price || 0) * (item.quantity || 1);
        }
      });
    });

    // Sort top products
    const topProductsList = Object.values(topProducts)
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
        items: o.items?.filter((i) => String(i.vendorId) === String(vendorId)),
      })),
      topProducts: topProductsList,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get daily analytics" });
  }
});

/* ───────────────────────── ANALYTICS - SUMMARY STATS ───────────────────────── */
router.get("/analytics/summary", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const vendorId = toObjectId(req.user.userId);
    const { period = "all" } = req.query;
    let dateFilter = { vendorId: vendorId };

    const now = new Date();
    switch (period) {
      case "today":
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        dateFilter.createdAt = { $gte: todayStart };
        break;
      case "yesterday":
        const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        dateFilter.createdAt = { $gte: yesterdayStart, $lt: yesterdayEnd };
        break;
      case "7days":
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFilter.createdAt = { $gte: weekAgo };
        break;
      case "30days":
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFilter.createdAt = { $gte: monthAgo };
        break;
      case "month":
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFilter.createdAt = { $gte: monthStart };
        break;
      case "lastMonth":
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        dateFilter.createdAt = { $gte: lastMonthStart, $lte: lastMonthEnd };
        break;
      default:
        // "all" - remove date filter for all time
        delete dateFilter.createdAt;
        break;
    }

    // Get totals for this vendor
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
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get summary stats" });
  }
});

/* ───────────────────────── ANALYTICS - CHART DATA ───────────────────────── */
router.get("/analytics/chart", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const vendorId = toObjectId(req.user.userId);
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
      { $match: { vendorId: vendorId, createdAt: { $gte: startDate } } },
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
  } catch (err) {
    res.status(500).json({ error: "Failed to get chart data" });
  }
});

// ── VENDOR: MIGRATE VIDEO URLs ─────────────────────────────────────────────────
router.post("/migrate-video-urls", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const products = await Product.find({
      vendorId: req.user.userId,
      videoUrl: { $exists: true, $ne: "" },
      $or: [
        { videoUrl: { $regex: "^/uploads" } },
        { videoUrl: { $regex: "siishop/products/videos" } }
      ]
    });

    let fixed = 0;
    for (const product of products) {
      if (product.videoPublicId && cloudName) {
        const newUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${product.videoPublicId}`;
        product.videoUrl = newUrl;
        await product.save();
        fixed++;
      }
    }

    res.json({ message: "Migration complete", fixed });
  } catch (err) {
    res.status(500).json({ error: "Migration failed: " + err.message });
  }
});

// ── PUBLIC: GET POPULAR STORES ─────────────────────────────────────────────────
// Based on product count, sales, and orders completed
router.get("/popular", async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    // Get approved vendors with their stats
    const vendors = await User.find({
      isVendor: true,
      vendorStatus: "approved",
      isDeleted: { $ne: true }
    })
      .select("storeName slug avatar description stats")
      .lean();

    // Sort by a composite score: product count + orders completed
    const sorted = vendors
      .map(v => ({
        ...v,
        score: (v.stats?.productCount || 0) + (v.stats?.ordersCompleted || 0) * 2
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, parseInt(limit));

    res.json(sorted || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch popular stores" });
  }
});

// ── PUBLIC: GET GHANA LOCATIONS ─────────────────────────────────────────────────
// Returns all Ghana regions and their cities
router.get("/locations", async (req, res) => {
  try {
    // Reload to ensure we have the latest
    if (!ghanaLocations) {
      ghanaLocations = require("../config/ghanaLocations");
    }

    // Defensive: Check ghanaLocations is properly loaded
    if (!ghanaLocations || typeof ghanaLocations.getRegions !== 'function') {
      return res.status(500).json({ error: "Location service unavailable" });
    }

    res.json({
      regions: ghanaLocations.getRegions(),
      citiesByRegion: ghanaLocations.citiesByRegion,
    });
  } catch (err) {
    console.error("[LOCATIONS] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch locations" });
  }
});

// ── PUBLIC: GET CITIES BY REGION ─────────────────────────────────────────────────
// Returns cities for a specific region
router.get("/locations/:region", async (req, res) => {
  try {
    const { region } = req.params;

    // Defensive: Check ghanaLocations is properly loaded
    if (!ghanaLocations || typeof ghanaLocations.isValidRegion !== 'function') {
      return res.status(500).json({ error: "Location service unavailable" });
    }

    // Accept any region with at least 2 characters (allow custom)
    if (!region || region.trim().length < 2) {
      return res.status(400).json({ error: "Invalid region" });
    }

    const isValid = ghanaLocations.isValidRegion(region);
    const cities = isValid ? ghanaLocations.getCitiesByRegion(region) : [];

    res.json({ region, cities });
  } catch (err) {
    console.error("[LOCATIONS] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch cities" });
  }
});

module.exports = router;
