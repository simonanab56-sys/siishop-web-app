/**
 * backend/services/media.service.js
 *
 * Single source of truth for all media uploads across the SiiShop platform.
 * Used by:
 *  - routes/products.js   (Marketplace admin — product images + videos)
 *  - routes/vendor.js     (Marketplace vendor — product images + videos)
 *  - routes/menu.js       (Restaurant vendor — menu item images + videos)
 *  - routes/restaurants.js(Restaurant vendor — logo + cover image)
 *
 * Provides:
 *  - Named multer presets (productMulter, productVideoMulter,
 *    restaurantMenuMulter, restaurantBrandingMulter, restaurantVideoMulter).
 *  - `localStorageFor(...)` — disk-storage fallback when Cloudinary env vars
 *    are missing. Returns a configured multer instance with the same shape
 *    as the Cloudinary presets so the rest of the code does not need to
 *    branch on storage type.
 *  - `toImageRecord(file)`, `toImageRecords(files)`, `toVideoRecord(file)` —
 *    normalize a `req.file` / `req.files` entry into the canonical
 *    `{ url, public_id }` shape (or `{ url, public_id, duration }` for video)
 *    that the rest of the app and frontend expect.
 *  - `destroyAsset(publicId, { resourceType })` — wraps
 *    `cloudinary.uploader.destroy(...)` with consistent error handling
 *    (not-found is silent, other failures log a warning). Resource type
 *    defaults to `image`; pass `video` for videos.
 *  - `handleMulterError(err, req, res, next)` + `handleVideoUploadError(...)`
 *    — express middleware that converts a `multer.MulterError` into a
 *    friendly JSON response (HTTP 413 for size, HTTP 400 for count) instead
 *    of a 500.
 *
 * Folders used (Cloudinary):
 *  - siishop/products                — marketplace product images
 *  - siishop/products/videos         — marketplace product videos
 *  - siishop/restaurants/foods       — restaurant menu item images
 *  - siishop/restaurants/branding    — restaurant logo + cover image
 *  - siishop/restaurants/videos      — restaurant videos
 *
 * Folder names match the convention already used by the marketplace routes
 * and are preserved exactly so existing data and Cloudinary URLs continue
 * to work.
 */

"use strict";

const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { v4: uuidv4 } = require("uuid");

const { cloudinary } = require("../config/cloudinary");
const logger = require("../utils/logger");

// ─── Configuration detection ──────────────────────────────────────────────────

/**
 * Returns true when all three CLOUDINARY_* env vars are present and look
 * real (the project guards against a placeholder cloud name "Root"). The
 * Marketplace routes had the same check inlined; it lives here now.
 */
function checkConfigured() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  return !!(cloudName && apiKey && apiSecret && cloudName !== "Root");
}

const CLOUDINARY_CONFIGURED = checkConfigured();

if (CLOUDINARY_CONFIGURED) {
  logger.log("☁️ [media.service] Cloudinary configured — uploads will stream to Cloudinary");
} else {
  logger.warn("💾 [media.service] Cloudinary NOT configured — uploads fall back to local disk");
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Build a CloudinaryStorage with the given params. Centralised so every
 * preset is one line.
 */
function cloudinaryStorage({ folder, allowedFormats, resourceType = "image", transformation = [] }) {
  return new CloudinaryStorage({
    cloudinary,
    params: {
      folder,
      allowed_formats: allowedFormats,
      ...(resourceType === "video" ? { resource_type: "video" } : {}),
      transformation,
    },
  });
}

/**
 * Build a `multer.diskStorage` for the local-disk fallback. Mirrors the
 * behavior previously inlined in routes/products.js and routes/vendor.js:
 *  - destination is `backend/public/uploads/<dest>` (auto-created).
 *  - filename is `<uuid><lowercased ext>` to keep collisions impossible.
 *  - fileFilter rejects anything whose ext or mime doesn't match
 *    `allowedExts` (with the leading dot stripped for the regex).
 *
 * The allowed-format list is the same regex used by the legacy code
 * (`/jpeg|jpg|webp|png|gif/` for images, `/mp4|webm|mov/` for videos).
 */
function localDiskStorage({ dest, allowedExts, mimePrefix }) {
  const uploadDir = path.join(__dirname, "..", "public", "uploads", dest);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const allowed = new RegExp(allowedExts.map((e) => e.replace(/^\./, "")).join("|"), "i");
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) =>
      cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`),
  });
}

/**
 * Build a multer instance for the given preset. When Cloudinary is
 * configured, uses CloudinaryStorage; otherwise falls back to a
 * `multer.diskStorage` rooted at `backend/public/uploads/<dest>`.
 *
 * This is the **only** place multer instances are constructed.
 */
function getMulter({
  folder,
  allowedFormats,
  resourceType = "image",
  transformation = [],
  maxSize,
  // Local-disk fallback fields
  dest,
  allowedExts = [],
  mimePrefix = "image",
}) {
  if (CLOUDINARY_CONFIGURED) {
    return multer({
      storage: cloudinaryStorage({ folder, allowedFormats, resourceType, transformation }),
      limits: { fileSize: maxSize },
    });
  }

  // Local fallback. Build the storage + filter by hand so we can keep the
  // exact same `req.file` shape that Cloudinary gives us (filename, etc.).
  const storage = localDiskStorage({ dest, allowedExts, mimePrefix });
  const fileFilter = (req, file, cb) => {
    const ext = allowedExts.some((e) =>
      path.extname(file.originalname).toLowerCase() === e.toLowerCase()
    );
    const mime = file.mimetype && file.mimetype.startsWith(`${mimePrefix}/`);
    if (ext && mime) return cb(null, true);
    cb(new Error(`Only ${mimePrefix} files (${allowedExts.join(", ")}) are allowed`));
  };
  return multer({ storage, fileFilter, limits: { fileSize: maxSize } });
}

// ─── Public multer presets ────────────────────────────────────────────────────
// These are the exact replacements for the presets previously exported from
// `config/cloudinary.js` (product images / product videos / vendor documents)
// and from `config/multer.js` (vendor KYC documents). Behavior and limits
// match the previous implementations byte-for-byte.

// ✅ RESTORED: pre-migration Marketplace upload config. The OLD `config/cloudinary.js`
// had `transformation: [{ width: 1200, height: 1200, crop: "limit",
// quality: "auto:good" }]` set on the productImageStorage. With it, every
// upload pre-generates a w_1200 derived variant on Cloudinary — so when
// the frontend later requests that variant (or a near-equivalent like
// w_400,f_auto,q_auto) it is already cached and serves as a 200, not a
// 404. Without this transformation, the secure_url points to the original
// and the FREE-plan derived-resource cap prevents new widths from being
// generated on demand. THIS IS THE REGRESSION FIX for marketplace media.
// Restaurant presets below keep their own (unchanged) transformation config.
const productMulter = getMulter({
  folder: "siishop/products",
  allowedFormats: ["jpg", "jpeg", "png", "gif", "webp"],
  transformation: [
    { width: 1200, height: 1200, crop: "limit", quality: "auto:good" },
  ],
  maxSize: 5 * 1024 * 1024,
  dest: "products",
  allowedExts: [".jpeg", ".jpg", ".webp", ".png", ".gif"],
  mimePrefix: "image",
});

const productVideoMulter = getMulter({
  folder: "siishop/products/videos",
  allowedFormats: ["mp4", "webm", "mov"],
  resourceType: "video",
  transformation: [
    { quality: "auto:good", crop: "limit", width: 1920 },
    { duration: 30 },
  ],
  maxSize: 50 * 1024 * 1024,
  dest: "videos",
  allowedExts: [".mp4", ".webm", ".mov"],
  mimePrefix: "video",
});

const restaurantMenuMulter = getMulter({
  folder: "siishop/restaurants/foods",
  allowedFormats: ["jpg", "jpeg", "png", "webp", "gif"],
  transformation: [
    { width: 1200, height: 1200, crop: "limit", quality: "auto:good", fetch_format: "auto" },
  ],
  maxSize: 5 * 1024 * 1024,
  dest: "menu",
  allowedExts: [".jpeg", ".jpg", ".webp", ".png", ".gif"],
  mimePrefix: "image",
});

const restaurantBrandingMulter = getMulter({
  folder: "siishop/restaurants/branding",
  allowedFormats: ["jpg", "jpeg", "png", "webp"],
  transformation: [
    { width: 1600, height: 900, crop: "limit", quality: "auto:good", fetch_format: "auto" },
  ],
  maxSize: 2 * 1024 * 1024,
  dest: "branding",
  allowedExts: [".jpeg", ".jpg", ".webp", ".png"],
  mimePrefix: "image",
});

const restaurantVideoMulter = getMulter({
  folder: "siishop/restaurants/videos",
  allowedFormats: ["mp4", "webm", "mov"],
  resourceType: "video",
  transformation: [
    { quality: "auto:good", crop: "limit", width: 1920 },
    { duration: 30 },
  ],
  maxSize: 50 * 1024 * 1024,
  dest: "videos",
  allowedExts: [".mp4", ".webm", ".mov"],
  mimePrefix: "video",
});

// ✅ KYC documents: ID front + back images uploaded during vendor
// registration. JPG/PNG only, 2MB per file, 2 files max. The Cloudinary
// folder is `siishop/vendor-docs` (preserved from the original
// config/cloudinary.js `vendorDocMulter` so existing assets keep working).
// The local-disk fallback writes to `backend/public/uploads/vendor-docs/`
// and matches the fileFilter / limits the legacy `config/multer.js` had.
const vendorKycMulter = getMulter({
  folder: "siishop/vendor-docs",
  allowedFormats: ["jpg", "jpeg", "png"],
  transformation: [
    { width: 800, height: 800, crop: "limit", quality: "auto:good" },
  ],
  maxSize: 2 * 1024 * 1024,
  dest: "vendor-docs",
  allowedExts: [".jpg", ".jpeg", ".png"],
  mimePrefix: "image",
});

// ─── `req.file` normalization ─────────────────────────────────────────────────

/**
 * Normalize one uploaded file into the canonical `{ url, public_id }` shape
 * used by every consumer of the upload pipeline. Matches the behavior of
 * the inlined `req.files.map(file => ...)` blocks in products.js and
 * vendor.js — Cloudinary wins when configured, local path otherwise.
 */
function toImageRecord(file) {
  if (!file) return null;
  // Cloudinary: `secure_url` is the canonical URL; `path` is also a URL when
  // CloudinaryStorage streams through. We accept either, prefer secure_url.
  if (file.secure_url || (file.path && String(file.path).startsWith("http"))) {
    return {
      url: file.secure_url || file.path,
      // ✅ FIX: pre-existing public_id bug. `multer-storage-cloudinary` does
      // NOT set `file.public_id` — it sets `file.filename` to the public_id
      // (and `file.path` to the secure_url). Reading from `file.public_id`
      // always returned undefined, so `public_id` was always persisted as
      // "" in MongoDB. `file.filename` is the public_id with the folder
      // prefix (e.g. "siishop/products/abc123") and is what we need for
      // later destroyAsset() calls. Fall back to `file.public_id` then ""
      // to stay safe in any code path that ever does set the legacy field.
      public_id: file.filename || file.public_id || "",
    };
  }
  // Local fallback — `multer-storage-cloudinary` is not in play, so the
  // file was written to `backend/public/uploads/...` with a uuid filename.
  return {
    url: `/uploads/${file.filename}`,
    public_id: "",
  };
}

function toImageRecords(files) {
  if (!Array.isArray(files)) return [];
  return files.map(toImageRecord).filter(Boolean);
}

/**
 * Same as toImageRecord but with the `duration` field that menu items and
 * products need for `<video>` elements. Cloudinary returns the duration on
 * the file when `resource_type: "video"` is set; we pass it through.
 */
function toVideoRecord(file) {
  if (!file) return null;
  const rec = toImageRecord(file);
  if (!rec) return null;
  rec.duration = file.duration || 0;
  return rec;
}

// ─── Cloudinary destroy helper ────────────────────────────────────────────────

/**
 * Best-effort destroy of a Cloudinary asset. Silently treats
 * "not found" (HTTP 404) as success — old records from before this PR
 * may have a public_id pointing at an asset that was deleted manually.
 * Other failures are logged but never throw, so the calling save() path
 * can continue.
 *
 * For local-disk files there is nothing to destroy (the file is in
 * /uploads and we don't track its path here) — return immediately.
 */
async function destroyAsset(publicId, { resourceType = "image" } = {}) {
  if (!publicId) return { skipped: true };
  if (!CLOUDINARY_CONFIGURED) return { skipped: true, reason: "cloudinary-not-configured" };
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      invalidate: true,
      resource_type: resourceType,
    });
    logger.log(`[media.service] Destroyed ${resourceType} ${publicId} → ${result.result}`);
    return result;
  } catch (err) {
    // Cloudinary returns a 404 with `result: "not found"` for missing
    // assets — that's not an error worth surfacing. Anything else is
    // logged as a warning so the calling code can keep going.
    if (err && /not found/i.test(err.message || "")) {
      return { result: "not found" };
    }
    logger.warn(`[media.service] Failed to destroy ${resourceType} ${publicId}: ${err.message}`);
    return { error: err.message };
  }
}

// ─── Multer error handler middleware ──────────────────────────────────────────

/**
 * Generic multer error → JSON handler. Sits between the multer middleware
 * and the route handler. Maps:
 *  - LIMIT_FILE_SIZE → HTTP 413 with a friendly message
 *  - LIMIT_FILE_COUNT → HTTP 413 with a friendly message
 *  - other multer errors → HTTP 400 with the underlying message
 *  - non-multer errors → next(err)
 *
 * The default messages are image-flavored; pass `{ kind: "video" }` for
 * the video preset (or call `handleVideoUploadError` directly).
 */
function handleMulterError(err, req, res, next, { kind = "image" } = {}) {
  if (err instanceof multer.MulterError) {
    logger.error(`[MULTER ERROR] Code: ${err.code} Message: ${err.message}`);
    if (err.code === "LIMIT_FILE_SIZE") {
      const msg = kind === "video"
        ? "Video file too large. Max 50MB allowed."
        : "Image file too large. Max 5MB per file.";
      return res.status(413).json({ error: msg });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(413).json({ error: "Too many files. Max 10 images allowed." });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    logger.error(`[UPLOAD ERROR] ${err.message}`);
    return res.status(400).json({ error: err.message });
  }
  next();
}

/**
 * Convenience wrapper — equivalent to `handleMulterError(err, req, res, next, { kind: "video" })`.
 * Kept as a separate export because every video route already uses this name.
 */
function handleVideoUploadError(err, req, res, next) {
  return handleMulterError(err, req, res, next, { kind: "video" });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Configuration
  cloudinary,
  isCloudinaryConfigured: () => CLOUDINARY_CONFIGURED,

  // Multer presets
  productMulter,
  productVideoMulter,
  restaurantMenuMulter,
  restaurantBrandingMulter,
  restaurantVideoMulter,
  vendorKycMulter,

  // Helpers
  toImageRecord,
  toImageRecords,
  toVideoRecord,
  destroyAsset,
  localStorageFor: localDiskStorage,

  // Error middleware
  handleMulterError,
  handleVideoUploadError,
};
