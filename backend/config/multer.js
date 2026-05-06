/* ─────────────────────────────────────────────────────────────────────────────
 * config/multer.js — File upload configuration for vendor KYC documents
 * ─────────────────────────────────────────────────────────────────────────────
 */

const multer = require("multer");
const path = require("path");
const fs = require("fs");

/* ── Ensure upload directory exists with proper permissions ── */
const uploadDir = path.join(__dirname, "../public/uploads/vendor-docs");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
}

/* ── Verify directory is writable ── */
try {
  fs.accessSync(uploadDir, fs.constants.W_OK);
} catch (err) {
  console.error(`❌ Upload directory not writable: ${uploadDir}`);
  console.error(`   Please run: chmod 755 ${uploadDir}`);
}

/* ── Storage configuration ── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // ✅ Verify directory exists before saving
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // ✅ Generate unique filename to prevent overwrites
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    
    // ✅ Preserve original extension
    const ext = path.extname(file.originalname).toLowerCase();
    
    // ✅ Get base name without extension
    const name = path.basename(file.originalname, ext);
    
    // ✅ Sanitize filename (remove special characters)
    const sanitizedName = name
      .replace(/[^a-zA-Z0-9_-]/g, "_")  // Replace special chars with underscore
      .substring(0, 50);  // Limit to 50 chars to avoid path issues
    
    // ✅ Generate final filename
    const finalFilename = `${sanitizedName}-${uniqueSuffix}${ext}`;
    
    cb(null, finalFilename);
  },
});

/* ── File filter: Only allow images ── */
const fileFilter = (req, file, cb) => {
  // ✅ Allowed MIME types
  const allowedMimes = ["image/jpeg", "image/png", "image/jpg"];
  
  // ✅ Allowed extensions
  const allowedExts = [".jpg", ".jpeg", ".png"];

  // ✅ Get extension and MIME type
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  // ✅ Validate both MIME type and extension
  if (allowedMimes.includes(mime) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${mime}. Only JPG, JPEG, and PNG images are allowed`));
  }
};

/* ── Multer instance for vendor KYC uploads ── */
const vendorKYCUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024,  // ✅ 2MB limit
    files: 2,  // ✅ Max 2 files per request (front + back)
  },
  // ✅ Use streaming to prevent memory issues with large files
  // ✅ Multer automatically streams to disk with diskStorage
});

module.exports = {
  vendorKYCUpload,
};
