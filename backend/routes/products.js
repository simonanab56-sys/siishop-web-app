
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

// ── MULTER CONFIGURATION ───────────────────────────────────────────────────
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

const multiUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).array("images", 10);

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
    
    // ── SEARCH: Search by product name or description ──────────────────────
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i"); // case-insensitive
      filter.$or = [
        { name: { $regex: searchRegex } },
        { description: { $regex: searchRegex } },
        { category: { $regex: searchRegex } }
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
    
    // ── PAGINATION (optional) ─────────────────────────────────────────────
    const limit = Math.min(Number(req.query.limit) || 100, 1000);
    const skip = Number(req.query.skip) || 0;
    
    // ── SORTING ───────────────────────────────────────────────────────────
    const sortBy = req.query.sortBy || "_id";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
    
    // ── FETCH PRODUCTS ────────────────────────────────────────────────────
    const products = await Product.find(filter)
      .populate("vendorId", "storeName name email")
      .sort({ [sortBy]: sortOrder })
      .limit(limit)
      .skip(skip)
      .lean();
    
    // ── RETURN RESULTS ────────────────────────────────────────────────────
    res.json(products || []);
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
    }).populate("vendorId", "storeName name email").lean();
    
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

/// ── ADMIN: CREATE PRODUCT ────────────────────────────────────────────────
router.post("/", requireAuth, requireAdmin, multiUpload, handleMulterError, async (req, res) => {
  try {
    // 🐛 DEBUG LOGGING (MANDATORY)
    console.log("=== ADMIN CREATE PRODUCT DEBUG ===");
    console.log("ADMIN USER:", req.user ? { userId: req.user.userId, isAdmin: req.user.isAdmin } : "NO USER");
    console.log("ADMIN BODY:", req.body);
    console.log("ADMIN FILES:", req.files);
    console.log("=====================================");

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
      images = req.files.map(file => ({
        url: `/uploads/${file.filename}`,
        public_id: "",
      }));
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

    console.log("[ADMIN CREATE] Creating product:", productData);

    const product = await Product.create(productData);
    console.log("[ADMIN CREATE] Product created:", product._id);

    res.status(201).json(product);
  } catch (err) {
    console.error("[ADMIN CREATE] Error:", err.message);
    res.status(500).json({ error: "Failed to create product: " + err.message });
  }
});

// ── ADMIN: UPDATE PRODUCT ────────────────────────────────────────────────
router.put("/:id", requireAuth, requireAdmin, multiUpload, handleMulterError, async (req, res) => {
  try {
    console.log("[ADMIN UPDATE] Files:", req.files);
    console.log("[ADMIN UPDATE] Body:", req.body);

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
      const newImages = req.files.map(file => ({
        url: `/uploads/${file.filename}`,
        public_id: "",
      }));
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
    console.log("[ADMIN UPDATE] Product updated:", product._id);

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

module.exports = router;
