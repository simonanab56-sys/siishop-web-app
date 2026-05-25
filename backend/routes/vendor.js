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

  console.log("[CLOUDINARY] Config check:", { cloudName, apiKey: !!apiKey, apiSecret: !!apiSecret });

  return !!(cloudName && apiKey && apiSecret && cloudName !== "Root");
}

// Initialize storage based on configuration
function initStorage() {
  CLOUDINARY_CONFIGURED = checkCloudinaryConfig();

  if (CLOUDINARY_CONFIGURED) {
    console.log("☁️ Using Cloudinary for image storage");
    const { productMulter } = require("../config/cloudinary");
    multiUpload = productMulter.array("images", 10);
  } else {
    // Fallback to local disk storage
    console.log("💾 Using local disk storage for images");
    UPLOAD_DIR = path.join(__dirname, "..", "public", "uploads");
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        console.log("[MULTER] Saving to:", UPLOAD_DIR);
        cb(null, UPLOAD_DIR);
      },
      filename: (req, file, cb) => {
        const filename = `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`;
        console.log("[MULTER] Generated filename:", filename);
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

function toObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

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

/* DASHBOARD */
router.get("/dashboard", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const vendorId = toObjectId(req.user.userId);

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
    });
  } catch (err) {
    res.status(500).json({ error: "Dashboard error" });
  }
});

/* MY ORDERS — vendor sees orders containing their products */
router.get("/orders", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const vendorId = toObjectId(req.user.userId);

    const orders = await Order.find({ "items.vendorId": vendorId })
      .sort({ createdAt: -1 })
      .lean();

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders" });
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

router.post("/products", requireAuth, requireApprovedVendor, multiUpload, handleMulterError, async (req, res) => {
  try {
    // 🐛 DEBUG LOGGING (MANDATORY)
    console.log("=== VENDOR CREATE PRODUCT DEBUG ===");
    console.log("REQ.USER:", req.user ? { userId: req.user.userId, isAdmin: req.user.isAdmin } : "NO USER");
    console.log("REQ.BODY:", req.body);
    console.log("REQ.FILES:", req.files ? `(${req.files.length} files)` : "NO FILES");
    console.log("FILES DETAIL:", req.files ? req.files.map(f => ({ name: f.originalname, size: f.size, mimetype: f.mimetype })) : []);
    console.log("===================================");

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
          console.log("[CREATE PRODUCT] Cloudinary image:", url);
        } else {
          // Local storage - use relative path
          url = `/uploads/${file.filename}`;
          console.log("[CREATE PRODUCT] Local image:", url);
        }

        return { url, public_id };
      });
      console.log("[CREATE PRODUCT] Processed images:", images);
    } else {
      console.log("[CREATE PRODUCT] No files in req.files, req.files =", req.files);
    }

    // Backward compatibility: if no files but legacy image field provided
    const legacyImage = req.body.image;
    if (images.length === 0 && legacyImage) {
      images.push({ url: legacyImage, public_id: "" });
      console.log("[CREATE PRODUCT] Using legacy image:", legacyImage);
    }

    // Validate: require at least one image
    if (images.length === 0) {
      console.log("[CREATE PRODUCT] ERROR: No images provided");
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

    console.log("[CREATE PRODUCT] Creating product with:", JSON.stringify(productData));

    let product;
    try {
      product = await Product.create(productData);
    } catch (dbErr) {
      console.error("[CREATE PRODUCT] DB ERROR:", dbErr.message);
      console.error("[CREATE PRODUCT] DB ERRORS:", dbErr.errors);
      return res.status(500).json({ error: "Database error: " + dbErr.message });
    }
    console.log("[CREATE PRODUCT] Product created:", product._id);

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
    console.log("=== VENDOR UPDATE PRODUCT DEBUG ===");
    console.log("REQ.USER:", req.user ? { userId: req.user.userId, isAdmin: req.user.isAdmin } : "NO USER");
    console.log("REQ.BODY:", req.body);
    console.log("REQ.FILES:", req.files ? `(${req.files.length} files)` : "NO FILES");
    console.log("PRODUCT ID:", req.params.id);
    console.log("===================================");

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

module.exports = router;
