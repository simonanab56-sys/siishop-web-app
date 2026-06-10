"use strict";

const express = require("express");
const router  = express.Router();
const mongoose = require("mongoose");
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const { v4: uuidv4 } = require("uuid");

const User    = require("../models/User");
const Product = require("../models/Product");
const requireApprovedVendor = require("../middleware/requireApprovedVendor");
const Order   = require("../models/Order");
const { requireAuth, requireVendor } = require("../middleware/auth");
const { notifyOrderStatusUpdate } = require("../services/notification.service");
const logger  = require("../utils/logger");

// ── CLOUDINARY CONFIGURATION ─────────────────────────────────────────────────
// Try to use Cloudinary if configured, otherwise fallback to local storage
let multiUpload;
let UPLOAD_DIR;
let CLOUDINARY_CONFIGURED = false;

// Check if Cloudinary is configured (after dotenv loaded)
function checkCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  logger.log("[CLOUDINARY] Config check:", { cloudName, apiKey: !!apiKey, apiSecret: !!apiSecret });

  return !!(cloudName && apiKey && apiSecret && cloudName !== "Root");
}

// Initialize storage based on configuration
function initStorage() {
  CLOUDINARY_CONFIGURED = checkCloudinaryConfig();

  if (CLOUDINARY_CONFIGURED) {
    logger.log("☁️ Using Cloudinary for image storage");
    const { productMulter } = require("../config/cloudinary");
    multiUpload = productMulter.array("images", 10);
  } else {
    // Fallback to local disk storage
    logger.log("💾 Using local disk storage for images");
    UPLOAD_DIR = path.join(__dirname, "..", "public", "uploads");
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        logger.log("[MULTER] Saving to:", UPLOAD_DIR);
        cb(null, UPLOAD_DIR);
      },
      filename: (req, file, cb) => {
        const filename = `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`;
        logger.log("[MULTER] Generated filename:", filename);
        cb(null, filename);
      },
    });

    const fileFilter = (req, file, cb) => {
      const allowed = /jpeg|jpg|webp|png|gif/;
      const ext = allowed.test(path.extname(file.originalname).toLowerCase().slice(1));
      const mime = allowed.test(file.mimetype);
      if (ext && mime) return cb(null, true);
      cb(new Error("Only image files (JPEG, JPG, WEBP, PNG, GIF) are allowed"));
    };

    multiUpload = multer({
      storage,
      fileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }).array("images", 10);
  }
}

// Initialize on module load
initStorage();

// ── VIDEO UPLOAD STORAGE ──────────────────────────────────────────────────────
let videoUpload;

function initVideoStorage() {
  if (CLOUDINARY_CONFIGURED) {
    logger.log("☁️ [VENDOR] Using Cloudinary for video storage");
    const { productVideoMulter } = require("../config/cloudinary");
    videoUpload = productVideoMulter.single("video");
  } else {
    // Fallback to local disk storage for videos
    const UPLOAD_DIR = path.join(__dirname, "..", "public", "uploads", "videos");
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    const storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, UPLOAD_DIR),
      filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`),
    });

    const fileFilter = (req, file, cb) => {
      const allowed = /mp4|webm|mov/;
      const ext = allowed.test(path.extname(file.originalname).toLowerCase().slice(1));
      const mime = allowed.test(file.mimetype) || file.mimetype.startsWith("video/");
      if (ext && mime) return cb(null, true);
      cb(new Error("Only video files (MP4, WebM, MOV) are allowed"));
    };

    videoUpload = multer({
      storage,
      fileFilter,
      limits: { fileSize: 50 * 1024 * 1024 },
    }).single("video");
  }
}

initVideoStorage();

// Video upload error handler
const handleVideoUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error("[VIDEO UPLOAD ERROR] Code:", err.code, "Message:", err.message);
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Video file too large. Max 50MB allowed." });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    console.error("[VIDEO UPLOAD ERROR]", err.message);
    return res.status(400).json({ error: err.message });
  }
  next();
};

function toObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

/* PUBLIC — Get vendor store by slug */
router.get("/store/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const vendor = await User.findOne({
      vendorSlug: slug,
      isVendor: true,
      vendorStatus: "approved",
    }).select("storeName storeDescription storeLogo vendorSlug vendorStatus kycStatus approvedAt");

    if (!vendor) {
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
    let vendor = await User.findOne({
      vendorSlug: slug,
      isVendor: true,
      vendorStatus: "approved",
    }).select("_id storeName vendorSlug");

    // If not found, try alternative field name storeSlug
    if (!vendor) {
      logger.log("Vendor not found with vendorSlug:", slug);
      vendor = await User.findOne({
        storeSlug: slug,
        isVendor: true,
        vendorStatus: "approved",
      }).select("_id storeName storeSlug");

      if (!vendor) {
        logger.log("Vendor still not found, returning 404");
        return res.status(404).json({ error: "Store not found" });
      }
      logger.log("Found vendor using storeSlug field:", vendor._id, vendor.storeName);
    }

    logger.log("Vendor found:", vendor._id, vendor.storeName, "vendorSlug:", vendor.vendorSlug || vendor.storeSlug);

    const Product = require("../models/Product");
    // CRITICAL: Filter by vendor._id - never return all products
    const products = await Product.find({
      vendorId: vendor._id,
      isDeleted: { $ne: true }
    })
      .populate("vendorId", "storeName storeLogo vendorSlug")
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
    const filter = {
      isVendor: true,
      vendorStatus: "approved",
    };

    // ── SEARCH: Search by store name, name, or description ────────────────
    if (req.query.search) {
      const searchTerm = req.query.search.trim();
      const searchRegex = new RegExp(searchTerm, "i"); // case-insensitive

      filter.$or = [
        { storeName: { $regex: searchRegex } },
        { name: { $regex: searchRegex } },
        { storeDescription: { $regex: searchRegex } }
      ];
    }

    const vendors = await User.find(filter)
      .select("name storeName storeDescription storeLogo email")
      .sort({ createdAt: -1 })
      .lean();

    res.json(vendors || []);
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
      .select("name storeName storeDescription storeLogo email")
      .lean();

    if (!vendor) return res.status(404).json({ error: "Vendor not found" });
    res.json(vendor);
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

    // Get vendor info (storeName, storeSlug)
    const User = require("../models/User");
    const vendor = await User.findById(vendorId).select("storeName vendorSlug").lean();

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
    });
  } catch (err) {
    res.status(500).json({ error: "Dashboard error" });
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

/* MY DELIVERED ORDERS STATISTICS */
router.get("/orders/delivered/stats", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const vendorId = toObjectId(req.user.userId);
    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Total delivered orders for this vendor
    const totalDelivered = await Order.countDocuments({
      "items.vendorId": vendorId,
      orderStatus: "delivered"
    });

    // Total revenue from delivered orders (paid only)
    const revenueAgg = await Order.aggregate([
      {
        $match: {
          "items.vendorId": vendorId,
          orderStatus: "delivered",
          paymentStatus: "paid"
        }
      },
      { $unwind: "$items" },
      { $match: { "items.vendorId": vendorId } },
      { $group: { _id: null, total: { $sum: "$items.price" } } },
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    // Delivered today
    const deliveredToday = await Order.countDocuments({
      "items.vendorId": vendorId,
      orderStatus: "delivered",
      deliveredAt: { $gte: startOfToday },
    });

    // Delivered this month
    const deliveredThisMonth = await Order.countDocuments({
      "items.vendorId": vendorId,
      orderStatus: "delivered",
      deliveredAt: { $gte: startOfMonth },
    });

    // Monthly revenue
    const monthlyRevenueAgg = await Order.aggregate([
      {
        $match: {
          "items.vendorId": vendorId,
          orderStatus: "delivered",
          paymentStatus: "paid",
          deliveredAt: { $gte: startOfMonth }
        }
      },
      { $unwind: "$items" },
      { $match: { "items.vendorId": vendorId } },
      { $group: { _id: null, total: { $sum: "$items.price" } } },
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
  } catch (err) {
    logger.error("Failed to fetch delivered orders stats:", err);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

/* UPDATE ORDER STATUS — vendor updates their own orders */
router.patch(
  "/orders/:id/status",
  requireAuth,
  requireVendor,
  async (req, res) => {
    try {
      const { orderStatus } = req.body;
      const vendorId = toObjectId(req.user.userId);

      const order = await Order.findById(req.params.id);

      if (!order) return res.status(404).json({ error: "Order not found" });

      // Ensure this vendor owns at least one item in this order
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

/* CREATE PRODUCT — handles multipart/form-data (multiple image uploads) */
// Wrapper to catch multer errors explicitly
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error("[MULTER ERROR] Code:", err.code, "Message:", err.message);
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Image file too large. Max 5MB per file." });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(413).json({ error: "Too many files. Max 10 images allowed." });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    console.error("[UPLOAD ERROR]", err.message);
    return res.status(400).json({ error: err.message });
  }
  next();
};

/* VENDOR: UPLOAD PRODUCT VIDEO */
router.post("/products/:id/video", requireAuth, requireApprovedVendor, videoUpload, handleVideoUploadError, async (req, res) => {
  try {
    logger.log("========================================");
    logger.log("[VIDEO UPLOAD] Starting upload...");
    logger.log("[VIDEO UPLOAD] videoUpload ready:", !!videoUpload);
    logger.log("[VIDEO UPLOAD] CLOUDINARY_CONFIGURED:", CLOUDINARY_CONFIGURED);
    logger.log("[VIDEO UPLOAD] req.file:", req.file ? "exists" : "MISSING");
    if (req.file) {
      logger.log("[VIDEO UPLOAD] File details:", {
        originalname: req.file.originalname,
        filename: req.file.filename,
        path: req.file.path,
        destination: req.file.destination,
        size: req.file.size,
        secure_url: req.file.secure_url,
        public_id: req.file.public_id
      });
    }
    logger.log("========================================");

    const product = await Product.findOne({ _id: req.params.id, vendorId: req.user.userId, isDeleted: { $ne: true } });
    if (!product) return res.status(404).json({ error: "Product not found" });

    if (!req.file) {
      return res.status(400).json({ error: "No video file uploaded" });
    }

    // Delete old video from Cloudinary if exists
    if (product.videoPublicId && CLOUDINARY_CONFIGURED) {
      try {
        const { cloudinary } = require("../config/cloudinary");
        await cloudinary.uploader.destroy(product.videoPublicId, { resource_type: "video" });
      } catch (e) {
        console.error("[VIDEO] Failed to delete old video:", e.message);
      }
    }

    let videoUrl = "";
    let videoPublicId = "";

    // Debug: Log all available Cloudinary-related fields
    logger.log("[VIDEO UPLOAD] Debug - all file fields:", {
      secure_url: req.file.secure_url,
      public_id: req.file.public_id,
      url: req.file.url,
      path: req.file.path,
      filename: req.file.filename,
      originalname: req.file.originalname,
      CLOUDINARY_CONFIGURED: CLOUDINARY_CONFIGURED
    });

    // FIXED: Check Cloudinary first, even if secure_url seems empty
    if (CLOUDINARY_CONFIGURED) {
      // Try secure_url first
      if (req.file.secure_url && req.file.secure_url.startsWith("http")) {
        videoUrl = req.file.secure_url;
        videoPublicId = req.file.public_id || "";
        logger.log("[VIDEO UPLOAD] ✓ Using Cloudinary secure_url:", videoUrl);
      }
      // Try public_id
      else if (req.file.public_id) {
        videoPublicId = req.file.public_id;
        videoUrl = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/${videoPublicId}`;
        logger.log("[VIDEO UPLOAD] ✓ Using constructed URL from public_id:", videoUrl);
      }
      // Try to get from path (sometimes Cloudinary puts URL here)
      else if (req.file.path && req.file.path.startsWith("http")) {
        videoUrl = req.file.path;
        videoPublicId = "";
        logger.log("[VIDEO UPLOAD] ✓ Using URL from path:", videoUrl);
      }
      else {
        // Cloudinary configured but no URL - use filename as public_id fallback
        videoPublicId = `siishop/products/videos/${req.file.filename.split('.')[0]}`;
        videoUrl = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/${videoPublicId}`;
        logger.log("[VIDEO UPLOAD] ✓ Using constructed URL (fallback):", videoUrl);
      }
    } else {
      // Fallback to local storage - use full filename (includes extension)
      let filename = req.file.filename;
      if (filename.includes('/')) {
        filename = filename.split('/').pop();
      }
      if (filename.includes('\\')) {
        filename = filename.split('\\').pop();
      }
      videoUrl = `/uploads/videos/${filename}`;
      logger.log("[VIDEO UPLOAD] ✗ Using local URL:", videoUrl, "from req.file.filename:", req.file.filename);
    }

    product.videoUrl = videoUrl;
    product.videoPublicId = videoPublicId;
    await product.save();

    logger.log("[VIDEO UPLOAD] ✓ Saved product.videoUrl:", product.videoUrl);
    logger.log("========================================");

    res.json({ videoUrl, videoPublicId, message: "Video uploaded successfully" });
  } catch (err) {
    console.error("[VIDEO UPLOAD] Error:", err.message);
    res.status(500).json({ error: "Failed to upload video: " + err.message });
  }
});

/* VENDOR: DELETE PRODUCT VIDEO */
router.delete("/products/:id/video", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, vendorId: req.user.userId, isDeleted: { $ne: true } });
    if (!product) return res.status(404).json({ error: "Product not found" });

    if (product.videoPublicId && CLOUDINARY_CONFIGURED) {
      try {
        const { cloudinary } = require("../config/cloudinary");
        await cloudinary.uploader.destroy(product.videoPublicId, { resource_type: "video" });
      } catch (e) {
        console.error("[VIDEO] Failed to delete video:", e.message);
      }
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

router.post("/products", requireAuth, requireApprovedVendor, multiUpload, handleMulterError, async (req, res) => {
  try {
    // 🐛 DEBUG LOGGING (MANDATORY)
    logger.log("=== VENDOR CREATE PRODUCT DEBUG ===");
    logger.log("REQ.USER:", req.user ? { userId: req.user.userId, isAdmin: req.user.isAdmin } : "NO USER");
    logger.log("REQ.BODY:", req.body);
    logger.log("REQ.FILES:", req.files ? `(${req.files.length} files)` : "NO FILES");
    logger.log("FILES DETAIL:", req.files ? req.files.map(f => ({ name: f.originalname, size: f.size, mimetype: f.mimetype })) : []);
    logger.log("===================================");

    // Process uploaded files into images array
    let images = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      images = req.files.map(file => {
        // Cloudinary provides file.path (cloud URL) or file.secure_url
        // Local storage provides file.filename
        let url;
        let public_id = "";

        // Check if this is a Cloudinary upload (has secure_url or path is a URL)
        const isCloudinaryUpload = CLOUDINARY_CONFIGURED && (file.secure_url || (file.path && file.path.startsWith("http")));

        if (isCloudinaryUpload) {
          // Cloudinary - use the cloud URL
          url = file.secure_url || file.path;
          public_id = file.public_id || "";
          logger.log("[CREATE PRODUCT] Cloudinary image:", url);
        } else {
          // Local storage - use relative path
          url = `/uploads/${file.filename}`;
          logger.log("[CREATE PRODUCT] Local image:", url);
        }

        return { url, public_id };
      });
      logger.log("[CREATE PRODUCT] Processed images:", images);
    } else {
      logger.log("[CREATE PRODUCT] No files in req.files, req.files =", req.files);
    }

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

    const productData = {
      name:        req.body.name        || "",
      description: req.body.description || "",
      price:       parseFloat(req.body.price)    || 0,
      category:    req.body.category   || "",
      stock:       parseInt(req.body.stock, 10)  || 0,
      available:   req.body.available === "true" || req.body.available === true,
      images:      images,
      // Legacy field - keep for backward compatibility
      image:       images.length > 0 ? images[0].url : "",
      vendorId:    req.user.userId,
    };

    logger.log("[CREATE PRODUCT] Creating product with:", JSON.stringify(productData));

    let product;
    try {
      product = await Product.create(productData);
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
router.put("/products/:id", requireAuth, requireApprovedVendor, multiUpload, handleMulterError, async (req, res) => {
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

    // Add new uploaded images
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => {
        let url;
        let public_id = "";

        // Check if this is a Cloudinary upload (has secure_url or path is a URL)
        const isCloudinaryUpload = CLOUDINARY_CONFIGURED && (file.secure_url || (file.path && file.path.startsWith("http")));

        if (isCloudinaryUpload) {
          // Cloudinary
          url = file.secure_url || file.path;
          public_id = file.public_id || "";
        } else {
          // Local storage
          url = `/uploads/${file.filename}`;
        }

        return { url, public_id };
      });
      existingImages = [...existingImages, ...newImages];
    }

    // Limit to 10 images max
    if (existingImages.length > 10) {
      existingImages = existingImages.slice(0, 10);
    }

    // Update product with new images array
    product.images = existingImages;
    product.image = existingImages.length > 0 ? existingImages[0].url : "";

    // Handle text fields
    const fields = ["name","description","category","available"];
    fields.forEach((k) => {
      if (req.body[k] !== undefined) {
        if (k === "available") product[k] = req.body[k] === "true" || req.body[k] === true;
        else product[k] = req.body[k];
      }
    });

    if (req.body.price  !== undefined) product.price  = parseFloat(req.body.price)  || 0;
    if (req.body.stock   !== undefined) product.stock   = Math.max(0, parseInt(req.body.stock, 10) || 0);

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

module.exports = router;
