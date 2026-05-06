
const router = require("express").Router();
const Product = require("../models/Product");
const Promo = require("../models/Promo");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { createProductSchema, updateProductSchema, validate } = require("../utils/joiSchemas");

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
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    // ✅ ADDED: Input validation
    const { error, value } = validate(req.body, createProductSchema);
    if (error) {
      const messages = error.details.map(d => d.message).join(", ");
      return res.status(400).json({ error: messages });
    }
    const product = await Product.create({
      name:        value.name,
      description: value.description,
      price:       value.price,
      category:    value.category,
      stock:       value.stock,
      available:   value.available || false,
      image:       value.image || "",
      vendorId:    req.user.userId,
    });
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: "Failed to create product" });
  }
});

// ── ADMIN: UPDATE PRODUCT ────────────────────────────────────────────────
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    // ✅ ADDED: Input validation
    const { error, value } = validate(req.body, updateProductSchema);
    if (error) {
      const messages = error.details.map(d => d.message).join(", ");
      return res.status(400).json({ error: messages });
    }
    const product = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!product) return res.status(404).json({ error: "Not found" });

    // Update fields (validated)
    if (value.name !== undefined)        product.name = value.name;
    if (value.description !== undefined) product.description = value.description;
    if (value.price !== undefined)       product.price = value.price;
    if (value.category !== undefined)    product.category = value.category;
    if (value.stock !== undefined)       product.stock = value.stock;
    if (value.available !== undefined)   product.available = value.available;
    if (value.image !== undefined)       product.image = value.image;

    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: "Failed to update product" });
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
