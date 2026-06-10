// utils/recentlyViewed.js - Recently viewed products tracking
const STORAGE_KEY = "recently_viewed_products";
const MAX_ITEMS = 20;

/**
 * Get recently viewed products from localStorage
 * @returns {Array} Array of product objects
 */
export function getRecentlyViewed() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Add a product to recently viewed
 * @param {Object} product - Product object with _id, name, price, image, etc.
 */
export function addRecentlyViewed(product) {
  if (!product?._id) return;

  try {
    const current = getRecentlyViewed();

    // Remove if already exists (to move to front)
    const filtered = current.filter(p => p._id !== product._id);

    // Add to front with essential data only
    const newItem = {
      _id: product._id,
      name: product.name,
      price: product.price,
      image: product.image,
      category: product.category,
      vendorId: product.vendorId,
      addedAt: new Date().toISOString(),
    };

    const updated = [newItem, ...filtered].slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    // Ignore storage errors
  }
}

/**
 * Clear recently viewed products
 */
export function clearRecentlyViewed() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Get recently viewed products filtered by vendor (optional)
 * @param {string} vendorId - Optional vendor ID to filter by
 * @returns {Array} Filtered array of products
 */
export function getRecentlyViewedByVendor(vendorId) {
  const products = getRecentlyViewed();
  if (!vendorId) return products;
  return products.filter(p => p.vendorId?._id === vendorId || p.vendorId === vendorId);
}