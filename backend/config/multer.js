/* ─────────────────────────────────────────────────────────────────────────────
 * config/multer.js — File upload configuration for vendor KYC documents.
 *
 * The actual multer instance (Cloudinary-backed when env vars are set, or a
 * local-disk fallback otherwise) lives in `services/media.service.js` as the
 * `vendorKycMulter` preset. This file is kept as a thin compatibility
 * shim because `routes/auth.js` imports `vendorKYCUpload` from here, and
 * the public contract — a 2MB / 2-file / JPG+PNG-only multer that supports
 * `.fields([{ name: "idFrontImage", maxCount: 1 }, { name: "idBackImage", maxCount: 1 }])`
 * — is preserved exactly.
 *
 * Cloudinary folder: `siishop/vendor-docs` (matches the original
 * `config/cloudinary.js` `vendorDocMulter` so existing assets keep working).
 * Local-disk fallback: `backend/public/uploads/vendor-docs/`.
 *
 * The 2MB file-size limit, JPG/PNG file filter, and Cloudinary folder are
 * baked into the `vendorKycMulter` preset. The `files: 2` count limit is
 * enforced at the route level (auth.js) via the per-field maxCount on
 * `.fields([...])` — we don't re-wrap with a second multer() because that
 * would mask the underlying storage from the shared service.
 * ───────────────────────────────────────────────────────────────────────────── */

const mediaService = require("../services/media.service");

function checkCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  return !!(cloudName && apiKey && apiSecret && cloudName !== "Root");
}

// `vendorKYCUpload` IS the shared-service multer instance, re-exported
// under the legacy name that `routes/auth.js` already imports.
const vendorKYCUpload = mediaService.vendorKycMulter;

// Local-disk path: the shared service's `vendorKycMulter` already routes
// uploads to `backend/public/uploads/vendor-docs/` (it auto-creates the
// directory). We expose a small helper so other parts of the codebase can
// detect Cloudinary availability without reaching into the service module.
function isKYCCloudinaryConfigured() {
  return checkCloudinaryConfig();
}

module.exports = {
  vendorKYCUpload,
  isKYCCloudinaryConfigured,
};
