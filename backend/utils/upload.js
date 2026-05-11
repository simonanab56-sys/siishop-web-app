"use strict";

const multer = require("multer");
const path   = require("path");
const fs     = require("fs");
const { v4: uuidv4 } = require("uuid");

const UPLOAD_DIR = path.join(__dirname, "..", "public", "uploads");

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${uuidv4()}${ext}`;
    cb(null, name);
  },
});

function fileFilter(req, file, cb) {
  const allowed = /jpeg|jpg|webp|png|gif/;
  const ext     = allowed.test(path.extname(file.originalname).toLowerCase().slice(1));
  const mime   = allowed.test(file.mimetype);
  if (ext && mime) return cb(null, true);
  cb(new Error("Only image files (JPEG, JPG, WEBP, PNG, GIF) are allowed"));
}

const uploader = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB per file
  },
});

// Helper function to create array upload middleware with custom field name
function createArrayUpload(fieldName, maxCount) {
  return uploader.array(fieldName, maxCount);
}

// Single file upload (backward compatibility)
const singleUpload = uploader.single("image");

// Multiple file upload (up to 10 images) - function that creates middleware
const multiUpload = createArrayUpload("images", 10);

// Single file upload for product images (alternative field name)
const productImageUpload = uploader.single("image");

module.exports = {
  single: singleUpload,
  array: multiUpload,
  productImage: productImageUpload,
  uploader,
  createArrayUpload,
};
