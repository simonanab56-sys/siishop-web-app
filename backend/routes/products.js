
const router = require("express").Router();

const Product = require("../models/Product");
const Promo = require("../models/Promo");
const User = require("../models/User");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { createProductSchema, updateProductSchema, validate } = require("../utils/joiSchemas");
const { validateCategory } = require("../utils/categoryValidator");
const { prepareProductForSave } = require("../services/product.service");
const mediaService = require("../services/media.service");
const logger = require("../utils/logger");

// ✅ All upload middleware (Cloudinary or local-disk) flows through the shared
// media service. `productMulter` / `productVideoMulter` are named presets
// produced by `mediaService.getMulter(...)`; when Cloudinary env vars are
// missing the service falls back to a disk-storage multer rooted at
// `backend/public/uploads/...` with the same fileFilter / size limits.

// ✅ NEW: Helper function to get marketplace vendor IDs
// BACKWARD COMPATIBLE: Includes vendors without vendorType (legacy data)
async function getMarketplaceVendorIds() {
  const vendors = await User.find({
    isVendor: true,
    vendorStatus: "approved",
    $or: [
      { vendorType: "marketplace" },
      { vendorType: { $exists: false } },
      { vendorType: null },
      { vendorType: "" }
    ]
  }).select("_id").lean();
  return vendors.map(v => v._id);
}

// ── UPLOAD MIDDLEWARE (shared via media.service) ────────────────────────────
// `multiUpload` accepts up to 10 product images; `videoUpload` accepts one
// product video. Both are Cloudinary-backed when env vars are set, local-disk
// otherwise. The named presets expose the same `req.file` / `req.files` shape
// in either case, so the route handlers can use a single normalization path.
const multiUpload = mediaService.productMulter.array("images", 10);
const videoUpload = mediaService.productVideoMulter.single("video");

// ── HELPERS ────────────────────────────────────────────────────────────────────
function isAdmin(req) {
  return req.user?.isAdmin === true;
}

// ── PUBLIC: GET ALL PRODUCTS WITH SEARCH & CATEGORY FILTERING ────────────────
router.get("/", async (req, res) => {
  try {
    // ✅ NEW: Filter to only marketplace products by default
    // This ensures restaurant menu items never appear on marketplace pages
    const filter = {
      isDeleted: { $ne: true },
      // ✅ NEW: Filter by productType to ensure only marketplace products
      productType: "product"
    };

    // Get marketplace vendor IDs using helper
    const marketplaceVendorIds = await getMarketplaceVendorIds();
    console.log("[PRODUCTS] Marketplace vendor IDs found:", marketplaceVendorIds.length);

    // Only show products from marketplace vendors
    // If no marketplace vendors exist, return empty array (not error)
    if (marketplaceVendorIds.length > 0) {
      filter.vendorId = { $in: marketplaceVendorIds };
    } else {
      console.log("[PRODUCTS] No marketplace vendors found, returning empty array");
      return res.json([]);
    }

    // ── COMPREHENSIVE SEARCH: Search by name, description, category, brand, tags, vendor, location ─
    if (req.query.search) {
      const searchTerm = req.query.search.trim();
      const searchRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); // escape special chars

      // First, find MARKETPLACE vendors matching the search term (including location)
      // BACKWARD COMPATIBLE: Include vendors without vendorType (legacy data)
      const matchingVendors = await User.find({
        isVendor: true,
        vendorStatus: "approved",
        $or: [
          { vendorType: "marketplace" },
          { vendorType: { $exists: false } },
          { vendorType: null },
          { vendorType: "" }
        ],
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

    // ── CATEGORIES (Task 7): Multi-category CSV union (used by HomepageSection "category" source) ──
    if (req.query.categories) {
      const list = String(req.query.categories)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length === 1) {
        filter.category = new RegExp(`^${list[0]}$`, "i");
      } else if (list.length > 1) {
        const escaped = list.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        filter.category = { $in: list.map((s) => new RegExp(`^${s}$`, "i")) };
      }
    }

    // ── VENDOR: Filter by vendor (if specified) ───────────────────────────
    if (req.query.vendorId) {
      filter.vendorId = req.query.vendorId;
    }

    // ── VENDORIDS (Task 7): Multi-vendor CSV union (used by HomepageSection "vendor" source) ──
    if (req.query.vendorIds) {
      const ids = String(req.query.vendorIds)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length > 0) {
        // Intersect with the marketplace-vendor whitelist so we never leak non-marketplace vendors.
        const allowed = new Set(marketplaceVendorIds.map(String));
        const intersection = ids.filter((id) => allowed.has(String(id)));
        if (intersection.length === 0) {
          return res.json([]);
        }
        filter.vendorId = { $in: intersection };
      }
    }

    // ── MERCHANDISING FLAGS (Task 7): Filter by isFeatured / isOnSale ───────
    if (String(req.query.isFeatured).toLowerCase() === "true") {
      filter.isFeatured = true;
    }
    if (String(req.query.isOnSale).toLowerCase() === "true") {
      filter.isOnSale = true;
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
    // ✅ Filter to only marketplace vendors' products
    const marketplaceVendorIds = await getMarketplaceVendorIds();

    if (marketplaceVendorIds.length === 0) {
      // Don't bail — vendors may still submit new category requests before
      // any product is listed, so we should still return approved names.
    }

    const cats = marketplaceVendorIds.length
      ? await Product.distinct("category", {
          isDeleted: { $ne: true },
          category: { $ne: null, $ne: "" },
          vendorId: { $in: marketplaceVendorIds },
        })
      : [];

    // ✅ Merge distinct live categories with admin-approved CategoryRequest
    // names AND the curated starter list. This is the union that the vendor
    // dropdown reads from — a starter name is immediately selectable, even
    // before any product has used it.
    const CategoryRequest = require("../models/CategoryRequest");
    const { STARTER_CATEGORIES } = require("../config/starterCategories");
    const [approved, starter] = await Promise.all([
      CategoryRequest.find({ status: "approved" }).select("name").lean(),
      Promise.resolve(STARTER_CATEGORIES),
    ]);
    const approvedSet = new Set(approved.map((r) => String(r.name).toLowerCase()));

    const merged = new Set();
    for (const c of cats || []) {
      if (c) merged.add(String(c).trim());
    }
    for (const name of approvedSet) {
      if (name) merged.add(name);
    }
    for (const name of starter) {
      if (name) merged.add(String(name).trim());
    }

    let result = Array.from(merged).sort((a, b) => a.localeCompare(b));

    // Optional case-insensitive substring filter for the searchable dropdown.
    if (req.query.search) {
      const s = String(req.query.search).toLowerCase().trim();
      if (s) result = result.filter((c) => c.toLowerCase().includes(s));
    }

    res.json(result);
  } catch (err) {
    console.error("❌ Categories error:", err.message);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// ── PUBLIC: GET PRODUCT BY ID ────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    // ✅ Verify product is from marketplace vendor
    const marketplaceVendorIds = await getMarketplaceVendorIds();

    const product = await Product.findOne({
      _id: req.params.id,
      isDeleted: { $ne: true },
      vendorId: { $in: marketplaceVendorIds },
    }).populate("vendorId", "storeName name email location vendorType").lean();

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
router.post(
  "/:id/video",
  requireAuth, requireAdmin,
  videoUpload,
  mediaService.handleVideoUploadError,
  async (req, res) => {
    try {
      const product = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
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
      // `{ url, public_id, duration }` shape whether the upload went to
      // Cloudinary (URL is a https://res.cloudinary.com/... string) or to the
      // local-disk fallback (URL is /uploads/videos/<uuid>.<ext>).
      const rec = mediaService.toVideoRecord(req.file);
      const videoUrl = rec.url;
      const videoPublicId = rec.public_id;
      const videoDuration = rec.duration || 0;

      // Update product with video. Persist duration too so the product detail
      // page can show a length badge without a follow-up probe.
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

// ── ADMIN: DELETE PRODUCT VIDEO ─────────────────────────────────────────────
router.delete("/:id/video", requireAuth, requireAdmin, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Delete from Cloudinary if we have a public_id.
    if (product.videoPublicId) {
      const result = await mediaService.destroyAsset(product.videoPublicId, { resourceType: "video" });
      logger.log("[VIDEO] Destroyed video from Cloudinary:", product.videoPublicId, "→", result?.result || "ok");
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
router.post(
  "/",
  requireAuth, requireAdmin,
  multiUpload,
  mediaService.handleMulterError,
  async (req, res) => {
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

      // Handle images from uploaded files. `toImageRecords` produces the
      // canonical `{ url, public_id }` shape for every file regardless of
      // whether the upload streamed to Cloudinary or to the local-disk
      // fallback.
      let images = mediaService.toImageRecords(req.files);

      // Backward compatibility: if no files but legacy image field provided
      const legacyImage = req.body.image;
      if (images.length === 0 && legacyImage) {
        images.push({ url: legacyImage, public_id: "" });
      }

    // ✅ Reject arbitrary category strings; require a value from the live list
    // (union of distinct Product.category + approved CategoryRequest names).
    const catCheck = await validateCategory({
      submitted: req.body.category,
      op: "create",
    });
    if (!catCheck.ok) {
      return res.status(400).json({ error: catCheck.message });
    }

    const productData = {
      name:        req.body.name        || "",
      description: req.body.description || "",
      price:       parseFloat(req.body.price)    || 0,
      category:    catCheck.category,
      stock:       parseInt(req.body.stock, 10)  || 0,
      available:   req.body.available === "true" || req.body.available === true,
      images:      images,
      image:       images.length > 0 ? images[0].url : "",
      vendorId:    req.user.userId,
      // Discount fields (optional). Normalized by prepareProductForSave().
      originalPrice:  req.body.originalPrice !== undefined && req.body.originalPrice !== ""
        ? parseFloat(req.body.originalPrice) : null,
      discountType:   req.body.discountType || null,
      discountValue:  req.body.discountValue !== undefined && req.body.discountValue !== ""
        ? parseFloat(req.body.discountValue) : null,
    };

    // ✅ Normalize & validate discount (auto-derives isOnSale).
    const prepared = prepareProductForSave(productData);
    if (prepared.error) {
      return res.status(400).json({ error: prepared.error });
    }

    logger.log("[ADMIN CREATE] Creating product:", productData);

    const product = await Product.create(prepared.payload);
    logger.log("[ADMIN CREATE] Product created:", product._id);

    res.status(201).json(product);
  } catch (err) {
    console.error("[ADMIN CREATE] Error:", err.message);
    res.status(500).json({ error: "Failed to create product: " + err.message });
  }
});

// ── ADMIN: UPDATE PRODUCT ────────────────────────────────────────────────
router.put(
  "/:id",
  requireAuth, requireAdmin,
  multiUpload,
  mediaService.handleMulterError,
  async (req, res) => {
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

    // Update product
    product.images = existingImages;
    product.image = existingImages.length > 0 ? existingImages[0].url : "";

    // Update other fields from body
    if (req.body.name !== undefined)        product.name = req.body.name;
    if (req.body.description !== undefined) product.description = req.body.description;
    if (req.body.price !== undefined)       product.price = parseFloat(req.body.price) || 0;
    // ✅ Category whitelist with legacy preservation. The product's CURRENT
    // category is passed so re-saving an unchanged legacy typo is allowed.
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
    if (req.body.stock !== undefined)       product.stock = parseInt(req.body.stock, 10) || 0;
    if (req.body.available !== undefined)   product.available = req.body.available === "true" || req.body.available === true;

    // Discount fields (optional). Normalized by prepareProductForSave().
    // ✅ Multipart forms can't carry JSON `null` natively, so we accept the
    // string sentinel "null" (and "undefined") as an explicit clear signal.
    // This lets the client FormData path round-trip a "clear the discount"
    // intent instead of having the route silently keep the stale DB value.
    const isClear = (v) => v === null || v === "" || v === "null" || v === "undefined";
    if (req.body.originalPrice !== undefined) {
      product.originalPrice = isClear(req.body.originalPrice)
        ? null
        : parseFloat(req.body.originalPrice);
    }
    if (req.body.discountType !== undefined) {
      product.discountType = isClear(req.body.discountType) ? null : req.body.discountType;
    }
    if (req.body.discountValue !== undefined) {
      product.discountValue = isClear(req.body.discountValue)
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
    // ✅ Filter to only marketplace vendors
    const marketplaceVendorIds = await getMarketplaceVendorIds();

    if (marketplaceVendorIds.length === 0) {
      return res.json([]);
    }

    const promos = await Promo.find({ isActive: true })
      .populate({
        path: "productIds",
        match: { vendorId: { $in: marketplaceVendorIds } },
      })
      .lean();

    // Filter out promos with no valid products (due to match)
    const validPromos = (promos || []).filter(promo =>
      promo.productIds && promo.productIds.length > 0
    );

    res.json(validPromos);
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

    // ✅ Filter to only marketplace vendors
    const marketplaceVendorIds = await getMarketplaceVendorIds();

    if (marketplaceVendorIds.length === 0) {
      return res.json([]);
    }

    // Get products with highest viewCount or sales, available only
    const products = await Product.find({
      available: true,
      vendorId: { $in: marketplaceVendorIds },
    })
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

    // ✅ Filter to only marketplace vendors
    const marketplaceVendorIds = await getMarketplaceVendorIds();

    if (marketplaceVendorIds.length === 0) {
      return res.json([]);
    }

    const products = await Product.find({
      available: true,
      vendorId: { $in: marketplaceVendorIds },
    })
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

    // ✅ Filter to only marketplace vendors
    const marketplaceVendorIds = await getMarketplaceVendorIds();

    if (marketplaceVendorIds.length === 0) {
      return res.json([]);
    }

    // Get the product to find related products
    const product = await Product.findById(id).lean();
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Find products in same category, excluding current product, from marketplace vendors
    const related = await Product.find({
      _id: { $ne: id },
      available: true,
      vendorId: { $in: marketplaceVendorIds },
      $or: [
        { category: product.category },
        { vendorId: product.vendorId }
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

    // ✅ Task 7: only increment for live, available, marketplace products
    const product = await Product.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true }, available: true },
      { $inc: { views: 1 } },
      { new: true, projection: { views: 1 } }
    );

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({ success: true, views: product.views });
  } catch (err) {
    res.status(500).json({ error: "Failed to increment view" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT REVIEWS
// ═══════════════════════════════════════════════════════════════════════════
// Customer-submitted reviews of marketplace products. Eligibility at the
// DB layer is enforced by the compound unique index on
// { userId, productId, orderId } in models/ProductReview — a duplicate
// insert fails with E11000 and the API maps that to a 400.
//
// The customer can only review a product if:
//   1) They placed an order containing that product.
//   2) That order is `delivered`.
//   3) They have not already reviewed that {product, order} pair.
//
// All three checks happen server-side, both in the POST handler and in
// the GET /reviews/mine preflight — the frontend never has to trust
// client-side validation for eligibility.

const ProductReview = require("../models/ProductReview");
const ReviewOrder = require("../models/Order");

// ── POST /api/products/:id/reviews ────────────────────────────────────────────
router.post(
  "/:id/reviews",
  requireAuth,
  async (req, res) => {
    try {
      const { orderId, rating, review } = req.body || {};
      const productId = req.params.id;
      const userId = req.user.userId;

      // ── Validate the product exists and is a marketplace item ────────────
      const product = await Product.findOne({
        _id: productId,
        isDeleted: { $ne: true },
      }).select("_id vendorId rating reviewCount").lean();
      if (!product) {
        return res.status(404).json({ error: "This product is no longer available." });
      }

      // ── Validate inputs ──────────────────────────────────────────────────
      if (!orderId) {
        return res.status(400).json({ error: "orderId is required" });
      }
      const ratingErr = (function validate(r) {
        const n = Number(r);
        if (!Number.isFinite(n)) return "Rating must be a number";
        if (n < 1 || n > 5) return "Rating must be between 1 and 5";
        if (!Number.isInteger(n)) return "Rating must be a whole number (1-5)";
        return null;
      })(rating);
      if (ratingErr) {
        return res.status(400).json({ error: ratingErr });
      }
      const cleanReview = String(review || "").trim().slice(0, 2000);

      // ── Eligibility: the order must belong to the user, be delivered, and
      //    contain this product. We collapse "not yours" / "wrong status" /
      //    "missing product" into a single 404 with the same customer-facing
      //    message so an unauthorized caller cannot probe other customers'
      //    order ids.
      const order = await ReviewOrder.findById(orderId).lean();
      if (
        !order ||
        String(order.userId) !== String(userId) ||
        order.orderStatus !== "delivered" ||
        !(order.items || []).some(
          (it) =>
            it &&
            String(it.productId) === String(productId) &&
            it.itemType !== "food"
        )
      ) {
        return res.status(404).json({ error: "This order is no longer available." });
      }

      // ── Eligibility: no prior review for the same {user, product, order}.
      //    The DB-layer compound unique index is the authoritative guard — a
      //    second insert fails with E11000 and we map that to 400.
      const existing = await ProductReview.findOne({
        userId, productId, orderId,
      }).select("_id").lean();
      if (existing) {
        return res.status(400).json({ error: "You have already reviewed this item." });
      }

      // ── Persist the review. The unique index would also catch a race, but
      //    we still wrap the insert in try/catch so a duplicate-key error
      //    from a concurrent request returns a clean 400 to the client.
      let saved;
      try {
        saved = await ProductReview.create({
          userId,
          productId,
          vendorId: product.vendorId,
          orderId,
          rating: Number(rating),
          review: cleanReview,
        });
      } catch (err) {
        if (err && err.code === 11000) {
          return res.status(400).json({ error: "You have already reviewed this item." });
        }
        throw err;
      }

      // ── Aggregate into the parent Product. We compute the new average
      //    rating and total count from scratch — simple, correct, and cheap
      //    at marketplace scale. A worker that recomputes on a schedule
      //    could replace this if write volume ever justifies it.
      const [stats] = await ProductReview.aggregate([
        { $match: { productId: product._id, isDeleted: { $ne: true } } },
        { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
      ]);
      await Product.updateOne(
        { _id: product._id },
        {
          $set: {
            rating: stats ? Number(stats.avg.toFixed(2)) : 0,
            reviewCount: stats ? stats.count : 0,
          },
        }
      );

      res.status(201).json({
        _id: saved._id,
        userId: saved.userId,
        productId: saved.productId,
        orderId: saved.orderId,
        rating: saved.rating,
        review: saved.review,
        createdAt: saved.createdAt,
      });
    } catch (err) {
      console.error("[PRODUCT REVIEW] POST error:", err.message);
      res.status(500).json({ error: "Failed to submit review" });
    }
  }
);

// ── GET /api/products/:id/reviews ─────────────────────────────────────────────
// Public, paginated list of reviews for a product. Returns the most recent
// reviews first and includes the averageRating / totalReviews for the badge.
router.get("/:id/reviews", async (req, res) => {
  try {
    const productId = req.params.id;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const skip = Number(req.query.skip) || 0;

    const [reviews, stats] = await Promise.all([
      ProductReview.find({ productId, isDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name")
        .lean(),
      ProductReview.aggregate([
        { $match: { productId: new (require("mongoose").Types.ObjectId)(productId), isDeleted: { $ne: true } } },
        { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      reviews: (reviews || []).map((r) => ({
        _id: r._id,
        rating: r.rating,
        review: r.review,
        userName: r.userId?.name || "Customer",
        createdAt: r.createdAt,
      })),
      averageRating: stats?.[0] ? Number(stats[0].avg.toFixed(2)) : 0,
      totalReviews: stats?.[0]?.count || 0,
    });
  } catch (err) {
    console.error("[PRODUCT REVIEW] GET list error:", err.message);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// ── GET /api/products/:id/reviews/mine ────────────────────────────────────────
// Has the current user reviewed this product? Returns the review if so, or
// null. The frontend uses this to pre-fill / disable the review form when
// the customer lands on a product page directly.
router.get("/:id/reviews/mine", requireAuth, async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.user.userId;

    const review = await ProductReview.findOne({
      userId,
      productId,
      isDeleted: { $ne: true },
    }).lean();

    if (!review) return res.json(null);
    res.json({
      _id: review._id,
      rating: review.rating,
      review: review.review,
      orderId: review.orderId,
      createdAt: review.createdAt,
    });
  } catch (err) {
    console.error("[PRODUCT REVIEW] GET mine error:", err.message);
    res.status(500).json({ error: "Failed to fetch your review" });
  }
});

module.exports = router;
