/**
 * Cloudinary Configuration
 *
 * Provides cloud-based image storage for production deployments.
 * Images persist across container restarts and deploys.
 *
 * Required environment variables:
 * - CLOUDINARY_CLOUD_NAME
 * - CLOUDINARY_API_KEY
 * - CLOUDINARY_API_SECRET
 */

const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Verify credentials on startup
cloudinary.api.ping()
  .then(result => {
    console.log("☁️ Cloudinary connected:", result.status === "ok" ? "OK" : "FAILED");
  })
  .catch(err => {
    console.warn("⚠️ Cloudinary not configured:", err.message);
  });

// Create multer storage for product images
const productImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "siishop/products",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    transformation: [{ width: 1200, height: 1200, crop: "limit", quality: "auto:good" }],
  },
});

// Create multer storage for vendor documents (ID images)
const vendorDocStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "siishop/vendor-docs",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [{ width: 800, height: 800, crop: "limit", quality: "auto:good" }],
  },
});

// Create multer storage for store logos
const logoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "siishop/logos",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 200, height: 200, crop: "fill", quality: "auto:good" }],
  },
});

// Create multer storage for product videos
const productVideoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "siishop/products/videos",
    resource_type: "video",
    allowed_formats: ["mp4", "webm", "mov"],
    transformation: [
      { quality: "auto:good", crop: "limit", width: 1920 },
      { duration: 30 } // Enforce max 30 seconds
    ],
  },
});

// Export multer instances with Cloudinary storage
const productMulter = multer({
  storage: productImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const vendorDocMulter = multer({
  storage: vendorDocStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

const logoMulter = multer({
  storage: logoStorage,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB
});

const productVideoMulter = multer({
  storage: productVideoStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// Export utilities
module.exports = {
  cloudinary,
  productMulter,
  vendorDocMulter,
  logoMulter,
  productVideoMulter,
};