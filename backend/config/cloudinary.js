/**
 * Cloudinary Configuration
 *
 * The `cloudinary` singleton is the only export of this file. All multer
 * instances, error middleware, destroy helpers, and file-→-URL mapping
 * live in `backend/services/media.service.js`. Both the Marketplace
 * (products.js, vendor.js) and the Restaurant module (menu.js,
 * restaurants.js) consume the service — there is exactly one place in
 * the codebase that knows about Cloudinary folder names, file-size
 * limits, and allowed formats.
 *
 * Required environment variables (set in `.env`):
 *  - CLOUDINARY_CLOUD_NAME
 *  - CLOUDINARY_API_KEY
 *  - CLOUDINARY_API_SECRET
 *
 * If any of these are missing (or the cloud name is the placeholder
 * "Root"), `media.service.js` falls back to local-disk uploads under
 * `backend/public/uploads/...`.
 */

const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Verify credentials on startup. Don't block the process — if Cloudinary
// isn't configured the service falls back to local disk and the app still
// works (just without off-host media).
cloudinary.api
  .ping()
  .then((result) => {
    if (result.status === "ok") {
      console.log("☁️ Cloudinary connected: OK");
    } else {
      console.warn("⚠️ Cloudinary ping returned non-ok status");
    }
  })
  .catch((err) => {
    console.warn("⚠️ Cloudinary not configured:", err.message);
  });

module.exports = { cloudinary };
