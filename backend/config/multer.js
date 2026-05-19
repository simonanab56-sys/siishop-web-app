/* ─────────────────────────────────────────────────────────────────────────────
 * config/multer.js — File upload configuration for vendor KYC documents
 * Supports both Cloudinary (production) and local storage (development)
 * ───────────────────────────────────────────────────────────────────────────── */

const multer = require("multer");
const path = require("path");
const fs = require("fs");

let vendorDocUpload;
let CLOUDINARY_KYC_CONFIGURED = false;

// Check if Cloudinary is configured
function checkCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  return !!(cloudName && apiKey && apiSecret && cloudName !== "Root");
}

// Initialize storage based on configuration
function initKYCStorage() {
  CLOUDINARY_KYC_CONFIGURED = checkCloudinaryConfig();

  if (CLOUDINARY_KYC_CONFIGURED) {
    console.log("☁️ [KYC] Using Cloudinary for vendor documents");

    // Dynamic import to avoid issues if cloudinary not installed
    try {
      const { vendorDocMulter } = require("./cloudinary");
      vendorDocUpload = vendorDocMulter;
    } catch (err) {
      console.warn("⚠️ [KYC] Cloudinary multer not available, falling back to local:", err.message);
      vendorDocUpload = createLocalStorage();
    }
  } else {
    console.log("💾 [KYC] Using local disk storage for vendor documents");
    vendorDocUpload = createLocalStorage();
  }
}

// Create local storage fallback
function createLocalStorage() {
  const uploadDir = path.join(__dirname, "../public/uploads/vendor-docs");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
  }

  // Verify directory is writable
  try {
    fs.accessSync(uploadDir, fs.constants.W_OK);
  } catch (err) {
    console.error(`❌ Upload directory not writable: ${uploadDir}`);
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname).toLowerCase();
      const name = path.basename(file.originalname, ext);
      const sanitizedName = name
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .substring(0, 50);
      const finalFilename = `${sanitizedName}-${uniqueSuffix}${ext}`;
      cb(null, finalFilename);
    },
  });

  const fileFilter = (req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/jpg"];
    const allowedExts = [".jpg", ".jpeg", ".png"];
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype.toLowerCase();

    if (allowedMimes.includes(mime) && allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${mime}. Only JPG, JPEG, and PNG images are allowed`));
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: 2 * 1024 * 1024,
      files: 2,
    },
  });
}

// Initialize on module load
initKYCStorage();

module.exports = {
  vendorKYCUpload: vendorDocUpload,
  isKYCCloudinaryConfigured: () => CLOUDINARY_KYC_CONFIGURED,
};