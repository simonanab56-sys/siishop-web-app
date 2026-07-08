"use strict";

/*
 * HomepageSection router — admin-curated blocks on the homepage.
 *
 * Public endpoints:
 *   GET    /api/homepage-sections/configs     — list active section configs (no products)
 *                                              Used by HomePage to render skeleton blocks
 *                                              instantly, then fetch per-section products in
 *                                              parallel.
 *   GET    /api/homepage-sections/:id/products — list resolved products for one section.
 *   GET    /api/homepage-sections             — list active sections WITH their products
 *                                              (used by SeeAllPage's first load).
 *
 * Admin endpoints:
 *   GET    /api/homepage-sections/admin       — list ALL sections (incl. inactive / scheduled)
 *   POST   /api/homepage-sections             — create (multipart, banner image)
 *   PUT    /api/homepage-sections/:id         — update (multipart, banner image)
 *   DELETE /api/homepage-sections/:id         — hard delete
 *   PATCH  /api/homepage-sections/reorder     — bulk-update displayOrder from {orderedIds:[]}
 *
 * The product resolver is the heart of this router. Given a section, it
 * inspects source.type and builds the corresponding product query. The same
 * helper is used by /configs (skips product loading) and /:id/products (loads).
 */

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const HomepageSection = require("../models/HomepageSection");
const Product = require("../models/Product");
const Promo = require("../models/Promo");
const User = require("../models/User");
const { requireAuth, requireAdmin } = require("../middleware/auth");

/* ── Image upload (banner) ──────────────────────────────────────────────── */
const UPLOAD_DIR = path.join(__dirname, "..", "public", "uploads", "sections");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
const bannerStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) =>
    cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`),
});
const bannerFileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|webp|png|gif/;
  const okExt = allowed.test(path.extname(file.originalname).toLowerCase().slice(1));
  const okMime = allowed.test(file.mimetype);
  if (okExt && okMime) return cb(null, true);
  cb(new Error("Only image files (JPEG, JPG, WEBP, PNG, GIF) are allowed"));
};
const bannerUpload = multer({
  storage: bannerStorage,
  fileFilter: bannerFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("banner");

function handleBannerUploadError(err, req, res, next) {
  if (err) {
    return res.status(400).json({ error: err.message || "Banner upload failed" });
  }
  next();
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

async function getMarketplaceVendorIds() {
  const vendors = await User.find({
    isVendor: true,
    vendorStatus: "approved",
    $or: [
      { vendorType: "marketplace" },
      { vendorType: { $exists: false } },
      { vendorType: null },
      { vendorType: "" },
    ],
  })
    .select("_id")
    .lean();
  return vendors.map((v) => v._id);
}

/**
 * Returns true if the section is currently visible (active, within window).
 */
function isVisible(section, now = new Date()) {
  if (!section || section.active === false) return false;
  if (section.startDate && now < new Date(section.startDate)) return false;
  if (section.endDate && now > new Date(section.endDate)) return false;
  return true;
}

/**
 * Build the product filter and sort for a given section.
 * Returns { filter, sort, populate } ready for Product.find().
 * Always limits to section.maxProducts and only returns available products
 * from marketplace vendors.
 */
function buildSectionQuery(section) {
  const limit = Math.min(Math.max(Number(section.maxProducts) || 12, 1), 100);
  const src = section.source || {};
  const filter = {
    isDeleted: { $ne: true },
    available: true,
    productType: "product",
  };
  let sort = { displayOrder: 1, _id: 1 };

  switch (src.type) {
    case "manual": {
      const ids = (src.manualProductIds || []).filter(Boolean);
      filter._id = { $in: ids };
      sort = { _id: 1 }; // honor admin's selection order (we'll re-order below)
      break;
    }
    case "category": {
      const cats = (src.categories || []).filter(Boolean);
      if (cats.length === 0) {
        return { filter: { _id: null }, sort, limit: 0 };
      }
      filter.category = { $in: cats.map((c) => new RegExp(`^${c}$`, "i")) };
      sort = { createdAt: -1 };
      break;
    }
    case "vendor": {
      const vIds = (src.vendorIds || []).filter(Boolean);
      if (vIds.length === 0) {
        return { filter: { _id: null }, sort, limit: 0 };
      }
      filter.vendorId = { $in: vIds };
      sort = { createdAt: -1 };
      break;
    }
    case "featured": {
      filter.isFeatured = true;
      sort = { createdAt: -1 };
      break;
    }
    case "promo": {
      // resolved at fetch time (active promos today)
      // we set a marker and override the actual fetch below.
      return { type: "promo", limit };
    }
    case "automatic": {
      const t = src.automaticType;
      switch (t) {
        case "best_sellers":
        case "most_purchased":
          sort = { salesCount: -1, createdAt: -1 };
          break;
        case "new_arrivals":
        case "recently_added":
          sort = { createdAt: -1 };
          break;
        case "most_viewed":
          sort = { views: -1, createdAt: -1 };
          break;
        case "trending":
          // Combined signal: views + salesCount. We approximate by sorting
          // on views (engine doesn't support compound $sort on unindexed
          // computed fields cheaply). Trending will improve as data grows.
          sort = { views: -1, salesCount: -1, updatedAt: -1 };
          break;
        case "discounted":
          filter.isOnSale = true;
          sort = { createdAt: -1 };
          break;
        case "featured":
          filter.isFeatured = true;
          sort = { createdAt: -1 };
          break;
        case "highest_rated":
          // No rating field yet — fall back to newest for now so admins
          // still see a populated section.
          sort = { createdAt: -1 };
          break;
        default:
          sort = { createdAt: -1 };
      }
      break;
    }
    default:
      return { filter: { _id: null }, sort, limit: 0 };
  }

  // Manual sort override (per-section).
  if (section.sortOverride && section.sortOverride.by) {
    const dir = section.sortOverride.order === "asc" ? 1 : -1;
    sort = { [section.sortOverride.by]: dir, _id: -1 };
  }

  return { type: "products", filter, sort, limit };
}

/**
 * Resolve the products for a section, returning an array of product objects
 * ready to ship to the client. Honors manual order for source.type="manual".
 */
async function resolveSectionProducts(section) {
  const query = buildSectionQuery(section);

  if (query.type === "promo") {
    // Pull currently-active promos, expand to products, cap to limit.
    const now = new Date();
    const promos = await Promo.find({
      active: true,
      startDate: { $lte: now },
      endDate: { $gt: now },
    })
      .sort({ featured: -1, priority: -1, displayOrder: 1, endDate: 1 })
      .limit(query.limit)
      .populate("productId")
      .lean();
    return (promos || [])
      .map((p) => p.productId)
      .filter((p) => p && p.isDeleted === false && p.available !== false)
      .map((p) => ({ ...p, vendorLocation: p.vendorId?.location || null }));
  }

  if (!query.filter || query.filter._id === null) return [];

  const products = await Product.find(query.filter)
    .populate("vendorId", "storeName name email location")
    .sort(query.sort)
    .limit(query.limit)
    .lean();

  // Manual source — preserve the admin's chosen order.
  if (section.source?.type === "manual") {
    const order = new Map(
      (section.source.manualProductIds || []).map((id, i) => [String(id), i])
    );
    products.sort(
      (a, b) =>
        (order.get(String(a._id)) ?? 9999) - (order.get(String(b._id)) ?? 9999)
    );
  }

  return (products || []).map((p) => ({
    ...p,
    vendorLocation: p.vendorId?.location || null,
  }));
}

/**
 * Restrict the public endpoints to marketplace products only. We re-filter
 * the resolved list by the marketplace whitelist (for sources like "category"
 * or "featured" the filter doesn't include it, to stay simple).
 */
async function filterToMarketplaceProducts(products) {
  if (!products || products.length === 0) return products;
  const ids = await getMarketplaceVendorIds();
  const allowed = new Set(ids.map(String));
  return products.filter(
    (p) => p.vendorId && allowed.has(String(p.vendorId._id || p.vendorId))
  );
}

/* ── ROUTE TABLE
 *
 * IMPORTANT: All fixed paths (/configs, /admin, /reorder, /) MUST be
 * declared BEFORE the parameterized ones (/:id, /:id/products).
 *
 * Express matches routes in registration order. If /:id comes first, a
 * request to GET /api/homepage-sections/admin will match /:id with
 * id="admin", the ObjectId validator will reject it, and the client will
 * get a misleading 400 "Invalid section id" — exactly the bug we hit
 * before. The /:id handlers below still validate ObjectId; the fixed
 * paths do not (they never expect an id).
 * ──────────────────────────────────────────────────────────────────── */

/* ── PUBLIC: GET ACTIVE SECTION CONFIGS (no products) ─────────────────── */
router.get("/configs", async (req, res) => {
  try {
    const sections = await HomepageSection.find({ active: true })
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean();
    const now = new Date();
    const visible = sections.filter((s) => isVisible(s, now));
    res.json(visible);
  } catch (err) {
    console.error("[homepage-sections/configs]", err.message);
    res.status(500).json({ error: "Failed to fetch section configs" });
  }
});

/* ── ADMIN: LIST ALL SECTIONS ─────────────────────────────────────────── */
router.get("/admin", requireAuth, requireAdmin, async (req, res) => {
  try {
    const sections = await HomepageSection.find()
      .populate("createdBy", "name email")
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean();
    res.json(sections);
  } catch (err) {
    console.error("[homepage-sections/admin]", err.message);
    res.status(500).json({ error: "Failed to fetch sections" });
  }
});

/* ── ADMIN: REORDER (bulk) ────────────────────────────────────────────── */
router.patch("/reorder", requireAuth, requireAdmin, async (req, res) => {
  try {
    const orderedIds = Array.isArray(req.body?.orderedIds)
      ? req.body.orderedIds.filter((id) => mongoose.isValidObjectId(id))
      : [];
    if (orderedIds.length === 0) {
      return res.status(400).json({ error: "orderedIds must be a non-empty array" });
    }
    const ops = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { displayOrder: index } },
      },
    }));
    await HomepageSection.bulkWrite(ops, { ordered: false });
    res.json({ success: true, count: orderedIds.length });
  } catch (err) {
    console.error("[homepage-sections/reorder]", err.message);
    res.status(500).json({ error: "Failed to reorder sections" });
  }
});

/* ── PUBLIC: LIST ACTIVE SECTIONS WITH PRODUCTS (used by See All first load) ─ */
router.get("/", async (req, res) => {
  try {
    const sections = await HomepageSection.find({ active: true })
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean();
    const now = new Date();
    const visible = sections.filter((s) => isVisible(s, now));

    // Resolve products in parallel — small N (usually <12 sections).
    const withProducts = await Promise.all(
      visible.map(async (s) => {
        const products = await resolveSectionProducts(s);
        const filtered = await filterToMarketplaceProducts(products);
        return { section: s, products: filtered };
      })
    );
    res.json(withProducts);
  } catch (err) {
    console.error("[homepage-sections/]", err.message);
    res.status(500).json({ error: "Failed to fetch homepage sections" });
  }
});

/* ── PUBLIC: GET RESOLVED PRODUCTS FOR ONE SECTION ────────────────────── */
router.get("/:id/products", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid section id" });
    }
    const section = await HomepageSection.findById(req.params.id).lean();
    if (!section) return res.status(404).json({ error: "Section not found" });
    if (!isVisible(section)) return res.json([]);

    const products = await resolveSectionProducts(section);
    const filtered = await filterToMarketplaceProducts(products);
    res.json(filtered);
  } catch (err) {
    console.error("[homepage-sections/:id/products]", err.message);
    res.status(500).json({ error: "Failed to fetch section products" });
  }
});

/* ── PUBLIC: GET ONE SECTION (for See All header) ─────────────────────── */
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid section id" });
    }
    const section = await HomepageSection.findById(req.params.id).lean();
    if (!section) return res.status(404).json({ error: "Section not found" });
    res.json(section);
  } catch (err) {
    console.error("[homepage-sections/:id]", err.message);
    res.status(500).json({ error: "Failed to fetch section" });
  }
});

/* ── ADMIN: CREATE ────────────────────────────────────────────────────── */
router.post(
  "/",
  requireAuth,
  requireAdmin,
  bannerUpload,
  handleBannerUploadError,
  async (req, res) => {
    try {
      const data = parseSectionPayload(req.body);
      if (data.error) return res.status(400).json({ error: data.error });

      if (req.file) {
        data.bannerImage = {
          url: `/uploads/sections/${req.file.filename}`,
          public_id: "",
        };
      }

      const created = await HomepageSection.create({
        ...data.doc,
        createdBy: req.user.userId,
      });
      res.status(201).json(created.toObject());
    } catch (err) {
      console.error("[homepage-sections/create]", err.message);
      res.status(500).json({ error: "Failed to create section" });
    }
  }
);

/* ── ADMIN: UPDATE ────────────────────────────────────────────────────── */
router.put(
  "/:id",
  requireAuth,
  requireAdmin,
  bannerUpload,
  handleBannerUploadError,
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ error: "Invalid section id" });
      }
      const existing = await HomepageSection.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Section not found" });

      const data = parseSectionPayload(req.body);
      if (data.error) return res.status(400).json({ error: data.error });

      // Banner replacement
      if (req.file) {
        // delete old local file (if any)
        if (
          existing.bannerImage?.url &&
          existing.bannerImage.url.startsWith("/uploads/sections/")
        ) {
          const oldPath = path.join(__dirname, "..", "public", existing.bannerImage.url);
          if (fs.existsSync(oldPath)) {
            try { fs.unlinkSync(oldPath); } catch (_) {}
          }
        }
        existing.bannerImage = {
          url: `/uploads/sections/${req.file.filename}`,
          public_id: "",
        };
      } else if (String(req.body?.deleteBanner) === "true") {
        if (
          existing.bannerImage?.url &&
          existing.bannerImage.url.startsWith("/uploads/sections/")
        ) {
          const oldPath = path.join(__dirname, "..", "public", existing.bannerImage.url);
          if (fs.existsSync(oldPath)) {
            try { fs.unlinkSync(oldPath); } catch (_) {}
          }
        }
        existing.bannerImage = { url: "", public_id: "" };
      }

      Object.assign(existing, data.doc);
      await existing.save();
      res.json(existing.toObject());
    } catch (err) {
      console.error("[homepage-sections/update]", err.message);
      res.status(500).json({ error: "Failed to update section" });
    }
  }
);

/* ── ADMIN: DELETE ────────────────────────────────────────────────────── */
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid section id" });
    }
    const section = await HomepageSection.findByIdAndDelete(req.params.id);
    if (!section) return res.status(404).json({ error: "Section not found" });

    if (section.bannerImage?.url?.startsWith("/uploads/sections/")) {
      const oldPath = path.join(__dirname, "..", "public", section.bannerImage.url);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (_) {}
      }
    }
    res.json({ success: true, deleted: section._id });
  } catch (err) {
    console.error("[homepage-sections/delete]", err.message);
    res.status(500).json({ error: "Failed to delete section" });
  }
});

/**
 * Parse the JSON / form-data payload into a HomepageSection-shaped object.
 * Accepts nested JSON via stringified `source` and `sortOverride` fields
 * (the admin form sends these as JSON for multipart submission).
 */
function parseSectionPayload(body) {
  const title = (body.title || "").toString().trim();
  if (!title) return { error: "title is required" };

  const source = parseJsonField(body.source) || {};
  if (!source.type) {
    return { error: "source.type is required" };
  }

  // Coerce CSV / JSON fields
  if (typeof source.manualProductIds === "string") {
    source.manualProductIds = source.manualProductIds
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && mongoose.isValidObjectId(s));
  }
  if (typeof source.categories === "string") {
    source.categories = source.categories
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof source.vendorIds === "string") {
    source.vendorIds = source.vendorIds
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && mongoose.isValidObjectId(s));
  }

  const doc = {
    title,
    subtitle: (body.subtitle || "").toString().trim(),
    icon: (body.icon || "").toString().trim(),
    layout: body.layout || "grid",
    displayOrder: Number(body.displayOrder) || 0,
    active: body.active === undefined ? true : String(body.active) === "true",
    source,
    maxProducts: Math.min(Math.max(Number(body.maxProducts) || 12, 1), 100),
    sortOverride: parseJsonField(body.sortOverride) || {},
    startDate: body.startDate ? new Date(body.startDate) : null,
    endDate: body.endDate ? new Date(body.endDate) : null,
    showSeeAll: body.showSeeAll === undefined ? true : String(body.showSeeAll) === "true",
  };

  // Trim subtitle length defensively
  if (doc.subtitle && doc.subtitle.length > 240) doc.subtitle = doc.subtitle.slice(0, 240);

  return { doc };
}

function parseJsonField(value) {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

module.exports = router;
