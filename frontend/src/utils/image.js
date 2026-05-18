/**
 * Image Utility Service
 * Provides centralized, production-safe image URL handling.
 * Works correctly in: local dev, production, Android/iOS, emulators
 */

import { API_BASE } from "../config/api";

// Check if running in development mode
const isDev = import.meta.env.DEV;

// In development mode, use relative URLs (goes through Vite proxy to backend)
// In production, use full URLs
const IMAGE_BASE = isDev ? "" : API_BASE.replace("/api", "");

// Cloudinary base URL for legacy /uploads/ paths (only for recent uploads that may still exist)
// Old files on Render's ephemeral filesystem are likely gone
const RENDER_BASE_URL = "https://siishop-web-app-backend.onrender.com";

// Fallback placeholder image
export const PLACEHOLDER_IMAGE = "/no-image.svg";

/**
 * Check if URL is a Cloudinary URL
 */
function isCloudinaryUrl(url) {
  if (!url || typeof url !== "string") return false;
  return url.includes("res.cloudinary.com") || url.includes("cloudinary.com");
}

/**
 * Check if URL is a legacy local upload path (/uploads/...)
 */
function isLegacyUploadPath(url) {
  if (!url || typeof url !== "string") return false;
  return url.startsWith("/uploads/") || url.includes("/uploads/");
}

/**
 * Get a production-safe image URL from any path format.
 *
 * @param {string|object|null} path - Image path, URL, or object with url property
 * @returns {string} - Production-safe URL (relative in dev, full in prod)
 *
 * Examples:
 * - Cloudinary URL -> returned as-is (already in cloud)
 * - "/uploads/image.jpg" -> "/uploads/image.jpg" (dev) or Cloudinary URL (prod tries render, may fail)
 * - "http://localhost:5000/uploads/image.jpg" -> "/uploads/image.jpg"
 * - "https://other.com/image.jpg" -> returned as-is
 * - "data:image/png;base64,..." -> returned as-is
 * - { url: "/uploads/image.jpg" } -> extracted and processed
 */
export function getImageUrl(path) {
  // Handle null/undefined
  if (!path) return PLACEHOLDER_IMAGE;

  // Handle object with url property (common MongoDB format)
  if (typeof path === "object") {
    if (path.url) return getImageUrl(path.url);
    if (path.src) return getImageUrl(path.src);
    if (path.image) return getImageUrl(path.image);
    return PLACEHOLDER_IMAGE;
  }

  // Handle string
  if (typeof path !== "string") return PLACEHOLDER_IMAGE;

  // Handle Cloudinary URLs - return as-is (already in cloud)
  if (isCloudinaryUrl(path)) {
    return path;
  }

  // Already a full URL (http/https) - normalize it
  if (path.startsWith("http://") || path.startsWith("https://")) {
    // Handle localhost URLs - convert to relative path (works in both dev and prod via proxy)
    if (path.includes("localhost") || path.includes("127.0.0.1")) {
      const match = path.match(/\/uploads\/.+$/);
      if (match) {
        return match[0];
      }
    }
    // In production, return external URLs as-is
    // In dev, external URLs won't work - convert to relative
    if (isDev) {
      const match = path.match(/\/uploads\/.+$/);
      if (match) {
        return match[0];
      }
      return PLACEHOLDER_IMAGE;
    }
    return path;
  }

  // Handle data URL (base64) - return as-is
  if (path.startsWith("data:")) {
    return path;
  }

  // Handle relative path starting with /
  if (path.startsWith("/")) {
    // Legacy /uploads/ paths in production
    if (!isDev) {
      // In production, /uploads/ paths are from the old Render filesystem
      // Try the Render URL, but these files likely don't exist anymore
      // Since we now use Cloudinary, new uploads won't have this path
      const result = `${RENDER_BASE_URL}${path}`;
      console.log("🖼️ getImageUrl PROD legacy:", path, "->", result);
      return result;
    }
    // In dev mode, use relative URLs - Vite proxy handles them
    console.log("🖼️ getImageUrl DEV relative:", path, "->", path);
    return path;
  }

  // Handle filename only (no leading slash) - assume /uploads/
  if (isDev) {
    const result = `/uploads/${path}`;
    console.log("🖼️ getImageUrl DEV filename:", path, "->", result);
    return result;
  }
  const result = `${RENDER_BASE_URL}/uploads/${path}`;
  console.log("🖼️ getImageUrl PROD filename:", path, "->", result);
  return result;
}

/**
 * Get image URL from a product object (supports multiple images array)
 *
 * @param {object} product - Product object with images array or image field
 * @param {number} index - Index of image to get (default: 0 for primary)
 * @returns {string} - Production-safe image URL
 */
export function getProductImage(product, index = 0) {
  if (!product) return PLACEHOLDER_IMAGE;

  // Handle new images array format
  if (product.images && Array.isArray(product.images) && product.images.length > 0) {
    const img = product.images[index];
    if (img && img.url) return getImageUrl(img.url);
  }

  // Handle legacy single image field
  if (product.image) {
    return getImageUrl(product.image);
  }

  return PLACEHOLDER_IMAGE;
}

/**
 * Get all image URLs from a product
 *
 * @param {object} product - Product object
 * @returns {string[]} - Array of production-safe image URLs
 */
export function getProductImages(product) {
  if (!product || !product.images || !Array.isArray(product.images)) {
    if (product?.image) {
      return [getImageUrl(product.image)];
    }
    return [];
  }

  return product.images
    .map(img => img?.url)
    .filter(Boolean)
    .map(url => getImageUrl(url));
}

/**
 * Get vendor/store logo URL
 *
 * @param {string|object|null} logo - Logo path or object
 * @returns {string} - Production-safe logo URL
 */
export function getVendorLogo(logo) {
  if (!logo) return null;
  return getImageUrl(logo);
}

/**
 * Check if an image URL is valid and accessible
 * Useful for error handling
 *
 * @param {string} url - Image URL to check
 * @returns {boolean} - Whether URL appears valid
 */
export function isValidImageUrl(url) {
  if (!url || url === PLACEHOLDER_IMAGE) return false;
  if (typeof url !== "string") return false;

  // Data URLs are always valid
  if (url.startsWith("data:")) return true;

  // Must have valid protocol or path
  return url.startsWith("http") || url.startsWith("/") || url.startsWith("/uploads");
}

/**
 * Convert a File object to a preview URL
 * For use in image upload previews
 *
 * @param {File} file - File object
 * @returns {string} - Object URL for preview
 */
export function createPreviewUrl(file) {
  if (!file || !file.type.startsWith("image/")) {
    return null;
  }
  return URL.createObjectURL(file);
}

/**
 * Revoke a preview URL to free memory
 * Should be called when component unmounts
 *
 * @param {string} url - Object URL to revoke
 */
export function revokePreviewUrl(url) {
  if (url && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

// Export for convenience
export default {
  getImageUrl,
  getProductImage,
  getProductImages,
  getVendorLogo,
  isValidImageUrl,
  createPreviewUrl,
  revokePreviewUrl,
  PLACEHOLDER_IMAGE,
  IMAGE_BASE,
};