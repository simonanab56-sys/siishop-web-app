
const router = require("express").Router();
const mongoose = require("mongoose");
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const { v4: uuidv4 } = require("uuid");

const Product = require("../models/Product");
const Promo = require("../models/Promo");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { createProductSchema, updateProductSchema, validate } = require("../utils/joiSchemas");
const logger = require("../utils/logger");

// ── CLOUDINARY CONFIGURATION ─────────────────────────────────────────────────
let multiUpload;
let CLOUDINARY_CONFIGURED = false;

// Check if Cloudinary is configured
function checkCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  return !!(cloudName && apiKey && apiSecret && cloudName !== "Root");
}

function initStorage() {
  CLOUDINARY_CONFIGURED = checkCloudinaryConfig();

  if (CLOUDINARY_CONFIGURED) {
    logger.log("☁️ [ADMIN] Using Cloudinary for image storage");
    const { productMulter } = require("../config/cloudinary");
    multiUpload = productMulter.array("images", 10);
  } else {
    // Fallback to local disk storage
    logger.log("💾 [ADMIN] Using local disk storage for images");
    const UPLOAD_DIR = path.join(__dirname, "..", "public", "uploads");
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    const storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, UPLOAD_DIR),
      filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`),
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

initStorage();

// ── VIDEO UPLOAD STORAGE ──────────────────────────────────────────────────────
let videoUpload;
let videoStorage;

function initVideoStorage() {
  if (CLOUDINARY_CONFIGURED) {
    logger.log("☁️ [ADMIN] Using Cloudinary for video storage");
    const { productVideoMulter } = require("../config/cloudinary");
    videoUpload = productVideoMulter.single("video");
  } else {
    // Fallback to local disk storage for videos
    logger.log("💾 [ADMIN] Using local disk storage for videos");
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
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
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

// Multer error handler for admin routes
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error("[ADMIN MULTER ERROR] Code:", err.code, "Message:", err.message);
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Image file too large. Max 5MB per file." });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(413).json({ error: "Too many files. Max 10 images allowed." });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    console.error("[ADMIN UPLOAD ERROR]", err.message);
    return res.status(400).json({ error: err.message });
  }
  next();
};

// ── HELPERS ────────────────────────────────────────────────────────────────────
function isAdmin(req) {
  return req.user?.isAdmin === true;
}

// ── PUBLIC: GET ALL PRODUCTS WITH SEARCH & CATEGORY FILTERING ────────────────
router.get("/", async (req, res) => {
  try {
    const filter = { isDeleted: { $ne: true } };

    // ── COMPREHENSIVE SEARCH: Search by name, description, category, brand, tags, vendor, location ─
    if (req.query.search) {
      const searchTerm = req.query.search.trim();
      const searchRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); // escape special chars

      // First, find vendors matching the search term (including location)
      const Vendor = require("../models/User");
      const matchingVendors = await Vendor.find({
        isVendor: true,
        vendorStatus: "approved",
        $or: [
          { storeName: { $regex: searchRegex } },
          { name: { $regex: searchRegex } },
          { "location.region": { $regex: searchRegex } },
          { "location.city": { $regex: searchRegex } }
        ]
      }).select("_id").lean();

      const vendorIds = matchingVendors.map(v => v._id);

      // Search products with vendor ID match OR text fields
      filter.$or = [
        { name: { $regex: searchRegex } },
        { description: { $regex: searchRegex } },
        { category: { $regex: searchRegex } },
        { brand: { $regex: searchRegex } },
        { tags: { $regex: searchRegex } },
        // Also match by vendor ID if vendors were found
        ...(vendorIds.length > 0 ? [{ vendorId: { $in: vendorIds } }] : [])
      ];
    }

    // ── CATEGORY: Filter by category ──────────────────────────────────────
    if (req.query.category && req.query.category !== "All") {
      filter.category = new RegExp(`^${req.query.category}$`, "i"); // exact match, case-insensitive
    }

    // ── VENDOR: Filter by vendor (if specified) ───────────────────────────
    if (req.query.vendorId) {
      filter.vendorId = req.query.vendorId;
    }

    // ── LOCATION FILTER: Filter by vendor's region ───────────────────────
    if (req.query.region) {
      // Need to filter by vendor's location - we'll do this after fetching
      req.query._regionFilter = req.query.region;
    }

    // ── LOCATION FILTER: Filter by vendor's city ─────────────────────────
    if (req.query.city) {
      req.query._cityFilter = req.query.city;
    }

    // ── PAGINATION (optional) ─────────────────────────────────────────────
    const limit = Math.min(Number(req.query.limit) || 100, 1000);
    const skip = Number(req.query.skip) || 0;

    // ── SORTING ───────────────────────────────────────────────────────────
    const sortBy = req.query.sortBy || "_id";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;

    // ── FETCH PRODUCTS ────────────────────────────────────────────────────
    const products = await Product.find(filter)
      .populate("vendorId", "storeName name email location")
      .sort({ [sortBy]: sortOrder })
      .limit(limit)
      .skip(skip)
      .lean();

    // ── APPLY LOCATION FILTERS (post-query because vendor location is in referenced document) ─
    let filteredProducts = products;
    if (req.query._regionFilter || req.query._cityFilter) {
      filteredProducts = products.filter(p => {
        const vendor = p.vendorId;
        if (!vendor) return false;

        const vendorLocation = vendor.location || {};
        if (req.query._regionFilter && vendorLocation.region !== req.query._regionFilter) {
          return false;
        }
        if (req.query._cityFilter && vendorLocation.city !== req.query._cityFilter) {
          return false;
        }
        return true;
      });
    }

    // ── ADD FORMATTED LOCATION TO EACH PRODUCT ────────────────────────────
    const productsWithLocation = (filteredProducts || []).map(p => ({
      ...p,
      vendorLocation: p.vendorId?.location || null,
    }));

    // ── RETURN RESULTS ────────────────────────────────────────────────────
    res.json(productsWithLocation);
  } catch (err) {
    console.error("❌ Search error:", err.message);
    res.status(500).json({ error: "Failed to search products" });
  }
});

// ── PUBLIC: GET CATEGORIES ───────────────────────────────────────────────────
router.get("/categories", async (req, res) => {
  try {
    const cats = await Product.distinct("category", {
      isDeleted: { $ne: true },
      category: { $ne: null, $ne: "" },
    });
    // ── Sort categories alphabetically ────────────────────────────────────
    const sortedCats = (cats || []).sort((a, b) => a.localeCompare(b));
    res.json(sortedCats);
  } catch (err) {
    console.error("❌ Categories error:", err.message);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// ── PUBLIC: GET PRODUCT BY ID ────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      isDeleted: { $ne: true }
    }).populate("vendorId", "storeName name email location").lean();

    if (!product) return res.status(404).json({ error: "Product not found" });

    // Add vendor location to product response
    const productWithLocation = {
      ...product,
      vendorLocation: product.vendorId?.location || null,
    };
    res.json(productWithLocation);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

// ── ADMIN: UPLOAD PRODUCT VIDEO ────────────────────────────────────────────
router.post("/:id/video", requireAuth, requireAdmin, videoUpload, handleVideoUploadError, async (req, res) => {
  try {
    logger.log("========================================");
    logger.log("[VIDEO UPLOAD] Admin - Starting upload...");
    logger.log("[VIDEO UPLOAD] Admin - videoUpload ready:", !!videoUpload);
    logger.log("[VIDEO UPLOAD] Admin - CLOUDINARY_CONFIGURED:", CLOUDINARY_CONFIGURED);
    logger.log("[VIDEO UPLOAD] Admin - req.file:", req.file ? "exists" : "MISSING");
    if (req.file) {
      logger.log("[VIDEO UPLOAD] Admin - File details:", {
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

    const product = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!product) return res.status(404).json({ error: "Product not found" });

    if (!req.file) {
      return res.status(400).json({ error: "No video file uploaded" });
    }

    // Delete old video from Cloudinary if exists
    if (product.videoPublicId && CLOUDINARY_CONFIGURED) {
      try {
        const { cloudinary } = require("../config/cloudinary");
        await cloudinary.uploader.destroy(product.videoPublicId, { resource_type: "video" });
        logger.log("[VIDEO] Deleted old video:", product.videoPublicId);
      } catch (e) {
        console.error("[VIDEO] Failed to delete old video:", e.message);
      }
    }

    // Get video URL and public ID - FIXED: Always use Cloudinary when configured
    let videoUrl = "";
    let videoPublicId = "";

    // Debug: Log all available Cloudinary-related fields
    logger.log("[VIDEO UPLOAD] Admin - Debug - all file fields:", {
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
      if (req.file.secure_url && req.file.secure_url.startsWith("http")) {
        videoUrl = req.file.secure_url;
        videoPublicId = req.file.public_id || "";
        logger.log("[VIDEO UPLOAD] Admin - ✓ Using Cloudinary secure_url:", videoUrl);
      } else if (req.file.public_id) {
        videoPublicId = req.file.public_id;
        videoUrl = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/${videoPublicId}`;
        logger.log("[VIDEO UPLOAD] Admin - ✓ Using constructed URL from public_id:", videoUrl);
      } else if (req.file.path && req.file.path.startsWith("http")) {
        videoUrl = req.file.path;
        videoPublicId = "";
        logger.log("[VIDEO UPLOAD] Admin - ✓ Using URL from path:", videoUrl);
      } else {
        // Cloudinary configured but no URL - construct from filename
        videoPublicId = `siishop/products/videos/${req.file.filename.split('.')[0]}`;
        videoUrl = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/${videoPublicId}`;
        logger.log("[VIDEO UPLOAD] Admin - ✓ Using constructed URL (fallback):", videoUrl);
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
      logger.log("[VIDEO UPLOAD] Admin - ✗ Using local URL:", videoUrl, "from req.file.filename:", req.file.filename);
    }

    // Update product with video
    product.videoUrl = videoUrl;
    product.videoPublicId = videoPublicId || "";
    await product.save();

    logger.log("[VIDEO UPLOAD] Admin - ✓ Saved product.videoUrl:", product.videoUrl);
    logger.log("========================================");

    res.json({ videoUrl, videoPublicId, message: "Video uploaded successfully" });
  } catch (err) {
    console.error("[VIDEO UPLOAD] Error:", err.message);
    res.status(500).json({ error: "Failed to upload video: " + err.message });
  }
});

// ── ADMIN: DELETE PRODUCT VIDEO ─────────────────────────────────────────────
router.delete("/:id/video", requireAuth, requireAdmin, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Delete from Cloudinary if exists
    if (product.videoPublicId && CLOUDINARY_CONFIGURED) {
      try {
        const { cloudinary } = require("../config/cloudinary");
        await cloudinary.uploader.destroy(product.videoPublicId, { resource_type: "video" });
        logger.log("[VIDEO] Deleted video from Cloudinary:", product.videoPublicId);
      } catch (e) {
        console.error("[VIDEO] Failed to delete video:", e.message);
      }
    }

    // Clear video fields
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

/// ── ADMIN: CREATE PRODUCT ────────────────────────────────────────────────
router.post("/", requireAuth, requireAdmin, multiUpload, handleMulterError, async (req, res) => {
  try {
    // 🐛 DEBUG LOGGING (MANDATORY)
    logger.log("=== ADMIN CREATE PRODUCT DEBUG ===");
    logger.log("ADMIN USER:", req.user ? { userId: req.user.userId, isAdmin: req.user.isAdmin } : "NO USER");
    logger.log("ADMIN BODY:", req.body);
    logger.log("ADMIN FILES:", req.files);
    logger.log("=====================================");

    // Validate at least one image
    if (!req.files || req.files.length === 0) {
      const legacyImage = req.body.image;
      if (!legacyImage) {
        return res.status(400).json({ error: "At least one product image is required" });
      }
    }

    // Handle images from uploaded files
    let images = [];
    if (req.files && req.files.length > 0) {
      images = req.files.map(file => {
        let url;
        let public_id = "";

        // Check if this is a Cloudinary upload (has secure_url or path is a URL)
        const isCloudinaryUpload = CLOUDINARY_CONFIGURED && (file.secure_url || (file.path && file.path.startsWith("http")));

        if (isCloudinaryUpload) {
          // Cloudinary - use secure URL
          url = file.secure_url || file.path;
          public_id = file.public_id || "";
        } else {
          // Local storage
          url = `/uploads/${file.filename}`;
        }

        return { url, public_id };
      });
    }

    // Backward compatibility: if no files but legacy image field provided
    const legacyImage = req.body.image;
    if (images.length === 0 && legacyImage) {
      images.push({ url: legacyImage, public_id: "" });
    }

    const productData = {
      name:        req.body.name        || "",
      description: req.body.description || "",
      price:       parseFloat(req.body.price)    || 0,
      category:    req.body.category   || "",
      stock:       parseInt(req.body.stock, 10)  || 0,
      available:   req.body.available === "true" || req.body.available === true,
      images:      images,
      image:       images.length > 0 ? images[0].url : "",
      vendorId:    req.user.userId,
    };

    logger.log("[ADMIN CREATE] Creating product:", productData);

    const product = await Product.create(productData);
    logger.log("[ADMIN CREATE] Product created:", product._id);

    res.status(201).json(product);
  } catch (err) {
    console.error("[ADMIN CREATE] Error:", err.message);
    res.status(500).json({ error: "Failed to create product: " + err.message });
  }
});

// ── ADMIN: UPDATE PRODUCT ────────────────────────────────────────────────
router.put("/:id", requireAuth, requireAdmin, multiUpload, handleMulterError, async (req, res) => {
  try {
    logger.log("[ADMIN UPDATE] Files:", req.files);
    logger.log("[ADMIN UPDATE] Body:", req.body);

    const product = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!product) return res.status(404).json({ error: "Not found" });

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
          url = file.secure_url || file.path;
          public_id = file.public_id || "";
        } else {
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

    // Update product
    product.images = existingImages;
    product.image = existingImages.length > 0 ? existingImages[0].url : "";

    // Update other fields from body
    if (req.body.name !== undefined)        product.name = req.body.name;
    if (req.body.description !== undefined) product.description = req.body.description;
    if (req.body.price !== undefined)       product.price = parseFloat(req.body.price) || 0;
    if (req.body.category !== undefined)    product.category = req.body.category;
    if (req.body.stock !== undefined)       product.stock = parseInt(req.body.stock, 10) || 0;
    if (req.body.available !== undefined)   product.available = req.body.available === "true" || req.body.available === true;

    await product.save();
    logger.log("[ADMIN UPDATE] Product updated:", product._id);

    res.json(product);
  } catch (err) {
    console.error("[ADMIN UPDATE] Error:", err.message);
    res.status(500).json({ error: "Failed to update product: " + err.message });
  }
});

// ── ADMIN: DELETE PRODUCT (soft delete) ──────────────────────────────────────
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!product) return res.status(404).json({ error: "Not found" });

    product.isDeleted = true;
    await product.save();
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete product" });
  }
});

// ── PUBLIC: GET FLASH DEALS / PROMOS ─────────────────────────────────────────
router.get("/promo/flash-deals", async (req, res) => {
  try {
    const promos = await Promo.find({ isActive: true })
      .populate("productIds")
      .lean();
    res.json(promos || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch promos" });
  }
});

// ── ADMIN: MIGRATE VIDEO URLs ─────────────────────────────────────────────────
// Fix products with incorrect video URLs (local path instead of Cloudinary URL)
router.post("/migrate-video-urls", requireAuth, requireAdmin, async (req, res) => {
  try {
    // Find products with videoUrl that starts with /uploads or contains siishop/products/videos
    const products = await Product.find({
      videoUrl: { $exists: true, $ne: "" },
      $or: [
        { videoUrl: { $regex: "^/uploads" } },
        { videoUrl: { $regex: "siishop/products/videos" } }
      ]
    });

    let fixed = 0;
    let alreadyCorrect = 0;
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

    for (const product of products) {
      // If product has a public_id but wrong URL, reconstruct the Cloudinary URL
      if (product.videoPublicId && cloudName) {
        const newUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${product.videoPublicId}`;
        product.videoUrl = newUrl;
        await product.save();
        fixed++;
        logger.log(`[VIDEO MIGRATION] Fixed product ${product._id}: ${newUrl}`);
      } else {
        alreadyCorrect++;
      }
    }

    res.json({
      message: "Migration complete",
      fixed,
      alreadyCorrect,
      total: products.length
    });
  } catch (err) {
    console.error("[VIDEO MIGRATION] Error:", err.message);
    res.status(500).json({ error: "Migration failed: " + err.message });
  }
});

// ── PUBLIC: GET TRENDING PRODUCTS ──────────────────────────────────────────────
// Based on views, purchases, and recent activity
router.get("/trending", async (req, res) => {
  try {
    const { limit = 12 } = req.query;

    // Get products with highest viewCount or sales, available only
    const products = await Product.find({ available: true })
      .sort({ views: -1, salesCount: -1, updatedAt: -1 })
      .limit(parseInt(limit))
      .populate("vendorId", "storeName slug")
      .lean();

    res.json(products || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch trending products" });
  }
});

// ── PUBLIC: GET RECENTLY ADDED PRODUCTS ───────────────────────────────────────────
router.get("/recent", async (req, res) => {
  try {
    const { limit = 12 } = req.query;

    const products = await Product.find({ available: true })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate("vendorId", "storeName slug")
      .lean();

    res.json(products || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch recent products" });
  }
});

// ── PUBLIC: GET RELATED PRODUCTS ─────────────────────────────────────────────────
// Based on category and vendor
router.get("/related/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 6 } = req.query;

    // Get the product to find related products
    const product = await Product.findById(id).lean();
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Find products in same category, excluding current product
    const related = await Product.find({
      _id: { $ne: id },
      available: true,
      $or: [
        { category: product.category },
        { "vendorId._id": product.vendorId?._id }
      ]
    })
      .sort({ salesCount: -1, views: -1 })
      .limit(parseInt(limit))
      .populate("vendorId", "storeName slug")
      .lean();

    res.json(related || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch related products" });
  }
});

// ── INCREMENT PRODUCT VIEW ─────────────────────────────────────────────────────
router.post("/:id/view", async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByIdAndUpdate(
      id,
      { $inc: { views: 1 } },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({ success: true, views: product.views });
  } catch (err) {
    res.status(500).json({ error: "Failed to increment view" });
  }
});

module.exports = router;
