/**
 * Image Utility Service
 * Provides centralized, production-safe image URL handling.
 * Works correctly in: local dev, production, Android/iOS, emulators
 */

import { API_BASE } from "../config/api";
import logger from "./logger";

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
 * Cloudinary-derived width variants pre-baked by the upload pipeline
 * (`backend/services/media.service.js`). Cloudinary's free plan caps
 * derived-resource generation; we only request widths the pipeline has
 * already baked so we never 404 on a cold cache.
 *
 *   800  → vendor KYC documents
 *   1200 → product / food images
 *   1600 → restaurant branding (logo + cover)
 */
const PRE_BAKED_WIDTHS = [800, 1200, 1600];

/**
 * Map a requested pixel width to the smallest pre-baked Cloudinary width
 * that is still ≥ the requested size (so the image is never undersized).
 *
 *   160 → 800     360 → 800      800 → 800
 *   801 → 1200    1200 → 1200    1500 → 1600
 */
function pickCloudinaryWidth(requested) {
  if (!requested || !Number.isFinite(requested)) return null;
  for (const w of PRE_BAKED_WIDTHS) {
    if (w >= requested) return w;
  }
  // Above the largest pre-baked width → fall through to the largest
  // pre-baked variant (Cloudinary will serve the original; we don't 404).
  return PRE_BAKED_WIDTHS[PRE_BAKED_WIDTHS.length - 1];
}

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
 * Inject a Cloudinary transformation segment into a Cloudinary delivery
 * URL. Returns the URL unchanged if it can't be parsed.
 *
 *   in : https://res.cloudinary.com/<cloud>/image/upload/v123/abc.jpg
 *   out: https://res.cloudinary.com/<cloud>/image/upload/w_360,f_auto,q_auto,c_limit/v123/abc.jpg
 */
function injectCloudinaryTransform(url, transform) {
  if (!url || typeof url !== "string" || !transform) return url;
  // The delivery segment is `image/upload/`. We insert the transform
  // right after the trailing `/`.
  const marker = "/image/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) {
    // Try video deliveries too — same transform syntax.
    const videoMarker = "/video/upload/";
    const vIdx = url.indexOf(videoMarker);
    if (vIdx === -1) return url;
    return url.slice(0, vIdx + videoMarker.length) + transform + "/" + url.slice(vIdx + videoMarker.length);
  }
  return url.slice(0, idx + marker.length) + transform + "/" + url.slice(idx + marker.length);
}

/**
 * Get a production-safe image URL from any path format.
 *
 * @param {string|object|null} path - Image path, URL, or object with url property
 * @param {object} [options] - Optional transforms. The only field read today
 *   is `width` (pixels). When the URL is a Cloudinary delivery URL and a
 *   `width` is supplied, a `w_<width>,f_auto,q_auto,c_limit` transform is
 *   injected so the browser downloads a variant sized for the slot instead
 *   of the original asset. Callers that omit `options` (the historical
 *   contract) get exactly the same URL as before — no regression.
 * @returns {string} - Production-safe URL (relative in dev, full in prod)
 *
 * Examples:
 * - Cloudinary URL + { width: 360 }  → Cloudinary URL with w_360,f_auto,q_auto transform
 * - Cloudinary URL, no options       → Cloudinary URL as-is
 * - "/uploads/image.jpg"             → "/uploads/image.jpg" (dev) or render URL (prod)
 * - "http://localhost:5000/uploads/image.jpg" → "/uploads/image.jpg"
 * - "https://other.com/image.jpg"    → returned as-is
 * - "data:image/png;base64,..."      → returned as-is
 * - { url: "/uploads/image.jpg" }    → extracted and processed
 */
export function getImageUrl(path, options = {}) {
  // Handle null/undefined
  if (!path) return PLACEHOLDER_IMAGE;

  // Handle object with url property (common MongoDB format)
  if (typeof path === "object") {
    if (path.url) return getImageUrl(path.url, options);
    if (path.src) return getImageUrl(path.src, options);
    if (path.image) return getImageUrl(path.image, options);
    return PLACEHOLDER_IMAGE;
  }

  // Handle string
  if (typeof path !== "string") return PLACEHOLDER_IMAGE;

  // Handle Cloudinary URLs - apply the requested width transform if any.
  // Widths map to the closest pre-baked Cloudinary variant so we never
  // request a derived resource the free plan hasn't cached.
  if (isCloudinaryUrl(path)) {
    const width = options && options.width;
    if (width) {
      const baked = pickCloudinaryWidth(width);
      if (baked) {
        return injectCloudinaryTransform(path, `w_${baked},f_auto,q_auto,c_limit`);
      }
    }
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
      const result = `${RENDER_BASE_URL}${path}`;
      logger.log("Image URL (legacy):", path);
      return result;
    }
    // In dev mode, use relative URLs - Vite proxy handles them
    logger.log("Image URL (dev):", path);
    return path;
  }

  // Handle filename only (no leading slash) - assume /uploads/
  if (isDev) {
    const result = `/uploads/${path}`;
    logger.log("Image URL (dev):", path);
    return result;
  }
  const result = `${RENDER_BASE_URL}/uploads/${path}`;
  logger.log("Image URL:", path);
  return result;
}

/**
 * Build a `srcSet` string for a Cloudinary URL.
 *
 * Each requested width is mapped to the closest pre-baked Cloudinary
 * variant so the browser actually downloads a smaller image instead of
 * the original. Duplicate URLs (caused by multiple requested widths
 * landing on the same pre-baked variant) are removed — `srcSet` is
 * allowed to contain the same URL at multiple descriptors, but doing so
 * just confuses the browser's candidate-selection algorithm.
 *
 * @param {string} url - Cloudinary image URL.
 * @param {number[]} widths - Pixel widths to generate variants for
 *   (e.g. [400, 800, 1200]). Each value is rounded up to the closest
 *   pre-baked variant (800, 1200, 1600) by `pickCloudinaryWidth`.
 * @returns {string} - `srcset` attribute value: `"url 800w, url 1200w, ..."`.
 *   Returns an empty string for non-Cloudinary URLs (no point serving
 *   variants the CDN doesn't know about).
 */
export function getImageSrcSet(url, widths = [400, 800, 1200]) {
  if (!isCloudinaryUrl(url)) return "";

  const seen = new Set();
  const descriptors = [];
  for (const w of widths) {
    const baked = pickCloudinaryWidth(w);
    if (!baked) continue;
    const variantUrl = injectCloudinaryTransform(
      url,
      `w_${baked},f_auto,q_auto,c_limit`
    );
    if (seen.has(variantUrl)) continue;
    seen.add(variantUrl);
    descriptors.push(`${variantUrl} ${baked}w`);
  }
  return descriptors.join(", ");
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
  getImageSrcSet,
  PLACEHOLDER_IMAGE,
  IMAGE_BASE,
};