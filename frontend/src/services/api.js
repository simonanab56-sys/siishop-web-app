// services/api.js — Complete API layer with all methods, no duplicates
import { API_BASE } from "../config/api";
import logger from "../utils/logger";
import { cachedFetch } from "../utils/cache";

const DEV = import.meta.env.DEV;

export function getToken() {
  return localStorage.getItem("token");
}

// Helper to get auth header (only if token exists)
function getAuthHeader() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getApiBaseUrl() {
  return API_BASE;
}

export async function apiRequest(endpoint, options = {}) {
  const baseURL = getApiBaseUrl();
  const url = `${baseURL}${endpoint}`;

  // ✅ DEBUG: Log token presence for debugging 401 errors.
  // Routed through `logger.log` so the call site is stripped from the
  // production bundle entirely (Vite drops the dead branch because
  // `isDev` is a module-level const). The token prefix would otherwise
  // leak into the production browser console.
  const token = getToken();
  logger.log(`[API] ${endpoint} - Token present:`, !!token, "Token prefix:", token?.substring(0, 20));

  if (DEV) {
    logger.log(`[API] ${endpoint}`, { method: options.method || "GET" });
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    // ✅ DEBUG: Log response status for debugging.
    // Same `logger.log` so it disappears in production.
    if (!response.ok) {
      logger.log(`[API] ${endpoint} - HTTP ${response.status} - Token was:`, token ? "sent" : "NOT SENT");
    }

    if (!response.ok) {
      const errorBody = await response.text();
      if (DEV) {
        logger.error(`[API] ${endpoint}: HTTP ${response.status}`, errorBody);
      }
      try {
        const error = JSON.parse(errorBody);
        throw new Error(error.error || error.message || `HTTP ${response.status}`);
      } catch {
        throw new Error(errorBody || `HTTP ${response.status}`);
      }
    }

    const data = await response.json();

    // ✅ DEBUG: Log raw API responses for auth endpoints.
    // Routed through `logger.log` so it disappears in production. The
    // full user object (including vendorType, restaurantDetails) is
    // debug-only — these are visible during local dev and replaced by
    // a real "user signed in" toast in production.
    if (endpoint.includes("auth")) {
      logger.log(`[API] ${endpoint} response:`, data);
      if (data?.user) {
        logger.log(`[API] ${endpoint} user keys:`, Object.keys(data.user));
        logger.log(`[API] ${endpoint} vendorType:`, data.user.vendorType);
        logger.log(`[API] ${endpoint} restaurantDetails:`, data.user.restaurantDetails);
      }
    }

    return data;
  } catch (err) {
    if (DEV) {
      logger.error(`[API] ${endpoint}:`, err.message);
    }
    throw err;
  }
}

/* ── Auth ──────────────────────────────────────────────────────────────────── */
export const authAPI = {
  register: (formData) => {
    const baseURL = getApiBaseUrl();
    return fetch(`${baseURL}/auth/register`, {
      method: "POST",
      body: formData,
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Registration failed");
      return data;
    });
  },
  login: (email, password) =>
    apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  getMe: () =>
    apiRequest("/auth/me", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  updateMe: (data) =>
    apiRequest("/auth/me", {
      method: "PUT",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  changePassword: (data) =>
    apiRequest("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  forgotPassword: (email) =>
    apiRequest("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token, newPassword) =>
    apiRequest("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    }),
  // OAuth methods (stub - implement if needed)
  googleLogin: (credential) => // ✅ FIXED: Changed to accept credential from Google Identity Services
    apiRequest("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }), // ✅ FIXED: Send credential instead of token
    }),
  appleLogin: (token) =>
    apiRequest("/auth/apple", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
};

/* ── Products ──────────────────────────────────────────────────────────────── */
export const productAPI = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/products${query ? "?" + query : ""}`);
  },
  // Get products by location
  getByLocation: (region, city) => {
    const params = new URLSearchParams();
    if (region) params.append("region", region);
    if (city) params.append("city", city);
    return apiRequest(`/products?${params.toString()}`);
  },
  getById: (id) => apiRequest(`/products/${id}`),
  // ✅ Optional params: { search } — substring filter, case-insensitive,
  // applied server-side in the categories endpoint. Backward-compatible
  // (no-arg callers still get the full list).
  getCategories: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/products/categories${q ? "?" + q : ""}`);
  },
  create: async (data, imageFiles = []) => {
    // If there are image files, use FormData
    if (imageFiles.length > 0) {
      const formData = new FormData();
      Object.keys(data).forEach(key => {
        if (data[key] !== undefined && data[key] !== null) {
          formData.append(key, data[key]);
        }
      });
      imageFiles.forEach(file => {
        formData.append("images", file);
      });
      const baseURL = getApiBaseUrl();
      const response = await fetch(`${baseURL}/products`, {
        method: "POST",
        body: formData,
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to create product");
      return result;
    }
    // Otherwise use JSON
    return apiRequest("/products", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  },
  update: async (id, data, newImageFiles = [], deleteImages = []) => {
    // If there are new image files or images to delete, use FormData
    if (newImageFiles.length > 0 || deleteImages.length > 0) {
      const formData = new FormData();
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) return;
        // ✅ Round-trip explicit nulls on the FormData path. Multipart bodies
        // can't carry JSON `null` natively, so we send the string "null" as
        // a sentinel — the server's discount normalizers (routes/products.js,
        // routes/vendor.js) treat it the same as an absent value with the
        // intent of "clear". Without this, clearing a discount while also
        // editing images would silently keep the stale DB value.
        if (data[key] === null) {
          formData.append(key, "null");
        } else {
          formData.append(key, data[key]);
        }
      });
      newImageFiles.forEach(file => {
        formData.append("images", file);
      });
      if (deleteImages.length > 0) {
        formData.append("deleteImages", JSON.stringify(deleteImages));
      }
      const baseURL = getApiBaseUrl();
      const response = await fetch(`${baseURL}/products/${id}`, {
        method: "PUT",
        body: formData,
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to update product");
      return result;
    }
    // Otherwise use JSON
    return apiRequest(`/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  },
  delete: (id) =>
    apiRequest(`/products/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  uploadVideo: async (productId, videoFile) => {
    const formData = new FormData();
    formData.append("video", videoFile);
    const baseURL = getApiBaseUrl();
    const response = await fetch(`${baseURL}/products/${productId}/video`, {
      method: "POST",
      body: formData,
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Failed to upload video");
    return result;
  },
  deleteVideo: async (productId) => {
    const baseURL = getApiBaseUrl();
    const response = await fetch(`${baseURL}/products/${productId}/video`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Failed to delete video");
    return result;
  },
  getTrending: (limit = 12) => apiRequest(`/products/trending?limit=${limit}`),
  getRecent: (limit = 12) => apiRequest(`/products/recent?limit=${limit}`),
  getRelated: (productId, limit = 6) => apiRequest(`/products/related/${productId}?limit=${limit}`),
  incrementView: (productId) => apiRequest(`/products/${productId}/view`, { method: "POST" }),
};

/* ── Orders ────────────────────────────────────────────────────────────────── */
export const orderAPI = {
  getAll: () =>
    apiRequest("/orders/my", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  getMy: () =>
    apiRequest("/orders/my", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  create: (data) =>
    apiRequest("/orders", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  initializePayment: (data) =>
    apiRequest("/orders/initialize-payment", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  getById: (id) =>
    apiRequest(`/orders/${id}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  updateStatus: (id, orderStatus) =>
    apiRequest(`/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ orderStatus }),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  delete: (id) =>
    apiRequest(`/orders/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  verifyPayment: (paymentRef, orderId) =>
    apiRequest("/orders/verify-payment", {
      method: "POST",
      body: JSON.stringify({ paymentRef, orderId }),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  // Get items in a delivered order that the current user can still review.
  // Source of truth for the ReviewPage. Returns the same shape used by
  // notificationAPI.getPendingReviews (per-item, with `orderId`).
  getPendingReviews: (orderId) =>
    apiRequest(`/orders/${orderId}/pending-reviews`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
};

/* ── Vendor ────────────────────────────────────────────────────────────────── */
export const vendorAPI = {
  dashboard: () =>
    apiRequest("/vendor/dashboard", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  // ✅ Consolidated stats: single source of truth for Total Revenue,
  // Online Revenue, COD Revenue, Total Customers, Total Orders. Called
  // by Restaurant Dashboard, Wallet, Customers and Analytics pages so
  // they all show identical numbers after refresh.
  getStats: () =>
    apiRequest("/vendor/stats", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  getProducts: () =>
    apiRequest("/vendor/products", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  createProduct: async (data, imageFiles = []) => {
    // If there are image files, use FormData
    if (imageFiles.length > 0) {
      const formData = new FormData();
      Object.keys(data).forEach(key => {
        if (data[key] !== undefined && data[key] !== null) {
          formData.append(key, data[key]);
        }
      });
      imageFiles.forEach(file => {
        formData.append("images", file);
      });
      const baseURL = getApiBaseUrl();
      const response = await fetch(`${baseURL}/vendor/products`, {
        method: "POST",
        body: formData,
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to create product");
      return result;
    }
    // Otherwise use JSON
    return apiRequest("/vendor/products", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  },
  updateProduct: async (id, data, newImageFiles = [], deleteImages = []) => {
    // If there are new image files or images to delete, use FormData
    if (newImageFiles.length > 0 || deleteImages.length > 0) {
      const formData = new FormData();
      Object.keys(data).forEach(key => {
        if (data[key] !== undefined && data[key] !== null) {
          formData.append(key, data[key]);
        }
      });
      newImageFiles.forEach(file => {
        formData.append("images", file);
      });
      if (deleteImages.length > 0) {
        formData.append("deleteImages", JSON.stringify(deleteImages));
      }
      const baseURL = getApiBaseUrl();
      const response = await fetch(`${baseURL}/vendor/products/${id}`, {
        method: "PUT",
        body: formData,
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to update product");
      return result;
    }
    // Otherwise use JSON
    return apiRequest(`/vendor/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  },
  deleteProduct: (id) =>
    apiRequest(`/vendor/products/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  uploadVideo: async (productId, videoFile) => {
    const formData = new FormData();
    formData.append("video", videoFile);
    const baseURL = getApiBaseUrl();
    const response = await fetch(`${baseURL}/vendor/products/${productId}/video`, {
      method: "POST",
      body: formData,
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Failed to upload video");
    return result;
  },
  deleteVideo: async (productId) => {
    const baseURL = getApiBaseUrl();
    const response = await fetch(`${baseURL}/vendor/products/${productId}/video`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Failed to delete video");
    return result;
  },
  getOrders: () =>
    apiRequest("/vendor/orders", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  // Delivered Orders
  getDeliveredOrders: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/vendor/orders/delivered${query ? "?" + query : ""}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  },
  // Stats share the same filter contract as the list endpoint so the four
  // stat cards always stay in lockstep with the filtered table. Callers
  // pass the same `{ filter, startDate, endDate, search }` object.
  getDeliveredOrdersStats: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/vendor/orders/delivered/stats${query ? "?" + query : ""}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  },
  updateStatus: (id, orderStatus) =>
    apiRequest(`/vendor/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ orderStatus }),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  // Vendor listing for customers (default to marketplace for backward compatibility)
  getList: (params = {}) => {
    // Ensure vendorType is set to marketplace for backward compatibility
    // Use "vendorType" parameter to match backend route
    const mergedParams = { ...params, vendorType: params.vendorType || "marketplace" };
    const query = new URLSearchParams(mergedParams).toString();
    return apiRequest(`/vendor/list${query ? "?" + query : ""}`);
  },
  // Get vendors by location
  getByLocation: (region, city) => {
    const params = new URLSearchParams({ vendorType: "marketplace" });
    if (region) params.append("region", region);
    if (city) params.append("city", city);
    return apiRequest(`/vendor/list?${params.toString()}`);
  },
  // Public: Get vendor store by slug
  getStoreBySlug: (slug) => apiRequest(`/vendor/store/${slug}`),
  // Public: Get vendor products by slug
  getStoreProducts: (slug, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/vendor/store/${slug}/products${query ? "?" + query : ""}`);
  },
  // Vendor: Generate store slug
  generateSlug: () =>
    apiRequest("/vendor/generate-slug", {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  // Vendor: Get current store slug
  getStoreSlug: () =>
    apiRequest("/vendor/store-slug", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  // Get locations (regions and cities)
  getLocations: () => apiRequest("/vendor/locations"),
  // Get cities for a specific region
  getCitiesByRegion: (region) => apiRequest(`/vendor/locations/${encodeURIComponent(region)}`),
  // Admin methods for vendor management
  adminGetAll: () =>
    apiRequest("/admin/vendors", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  adminApprove: (id) =>
    apiRequest(`/admin/vendors/${id}/approve`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  adminSuspend: (id) =>
    apiRequest(`/admin/vendors/${id}/suspend`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  // Analytics
  getCalendar: (year, month) =>
    apiRequest(`/vendor/analytics/calendar?year=${year}&month=${month}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  getDailyAnalytics: (date) =>
    apiRequest(`/vendor/analytics/daily?date=${date}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  getSummary: (period = "all") =>
    apiRequest(`/vendor/analytics/summary?period=${period}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  getChartData: (type = "daily", days = 30) =>
    apiRequest(`/vendor/analytics/chart?type=${type}&days=${days}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  getPopular: (limit = 10) => apiRequest(`/vendor/popular?limit=${limit}`),
};

/* ── Admin ─────────────────────────────────────────────────────────────────── */
export const adminAPI = {
  getStats: () =>
    apiRequest("/admin/stats", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  getUsers: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/admin/users${query ? "?" + query : ""}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  },
  toggleAdmin: (id) =>
    apiRequest(`/admin/users/${id}/toggle-admin`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  deleteUser: (id) =>
    apiRequest(`/admin/users/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  getPendingVendors: () =>
    apiRequest("/admin/vendors/pending", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  approveVendor: (id) =>
    apiRequest(`/admin/vendors/${id}/approve`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  rejectVendor: (id, reason) =>
    apiRequest(`/admin/vendors/${id}/reject`, {
      method: "PATCH",
      body: JSON.stringify({ reason }),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  getOrders: () =>
    apiRequest("/admin/orders", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  // Delivered Orders
  getDeliveredOrders: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/admin/orders/delivered${query ? "?" + query : ""}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  },
  getDeliveredOrdersStats: () =>
    apiRequest("/admin/orders/delivered/stats", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  // Analytics
  getCalendar: (year, month) =>
    apiRequest(`/admin/analytics/calendar?year=${year}&month=${month}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  getDailyAnalytics: (date) =>
    apiRequest(`/admin/analytics/daily?date=${date}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  getSummary: (period = "all") =>
    apiRequest(`/admin/analytics/summary?period=${period}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  getChartData: (type = "daily", days = 30) =>
    apiRequest(`/admin/analytics/chart?type=${type}&days=${days}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  // Vendors
  getVendors: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/admin/vendors${query ? "?" + query : ""}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  },
  suspendVendor: (id) =>
    apiRequest(`/admin/vendors/${id}/suspend`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
};

/* ── Promos ────────────────────────────────────────────────────────────────── */
export const promoAPI = {
  getAll: () => apiRequest("/promos"),
  getActive: (params = {}) => {
    // Optional query-string builder so callers can request a filtered view
    // (e.g. by category). Server-side currently ignores extra params — the
    // frontend does its own category filtering client-side from the returned
    // data — but accepting the param keeps the door open for a future
    // server-side filter without an API shape change.
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/promos/active${q ? "?" + q : ""}`);
  },
  getAdmin: () =>
    apiRequest("/promos/admin", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  getById: (id) => apiRequest(`/promos/${id}`),
  create: (data) =>
    apiRequest("/promos", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  update: (id, data) =>
    apiRequest(`/promos/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  delete: (id) =>
    apiRequest(`/promos/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  validate: (code) =>
    apiRequest(`/promos/validate/${code}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
};

/* ── Category requests ──────────────────────────────────────────────────────
   Vendors ask admin to add a new marketplace category; admin approves or
   rejects. The approved names are merged into the live categories list so
   the vendor's product form dropdown reflects them immediately.
   ──────────────────────────────────────────────────────────────────────────── */
export const categoryAPI = {
  // Vendor — submit a new request. Server validates against the live list
  // and any pending/approved requests.
  requestNew: (name, note = "") =>
    apiRequest("/category-requests", {
      method: "POST",
      body: JSON.stringify({ name, note }),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  // Vendor — list my own requests (pending / approved / rejected).
  getMine: () =>
    apiRequest("/category-requests/mine", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  // Admin — list all (optional status filter).
  getAll: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/category-requests${q ? "?" + q : ""}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  },
  // Admin — approve or reject.
  review: (id, action /* "approve" | "reject" */) =>
    apiRequest(`/category-requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
};

/* ── Homepage sections (Task 7) ─────────────────────────────────────────────
   Admin-curated dynamic blocks on the homepage (like Jumia). Public
   endpoints fetch the active section configs and per-section product lists;
   admin endpoints manage the section documents themselves.
   ──────────────────────────────────────────────────────────────────────────── */
export const homepageSectionAPI = {
  /** Public: list active section configs (no products). */
  getActive: () => apiRequest("/homepage-sections/configs"),

  /** Public: list active sections WITH their resolved products. */
  getAll: () => apiRequest("/homepage-sections"),

  /** Public: get one section document. */
  getOne: (id) => apiRequest(`/homepage-sections/${id}`),

  /** Public: get the resolved product list for a single section. */
  getProducts: (id) => apiRequest(`/homepage-sections/${id}/products`),

  /** Admin: list ALL sections (including inactive / scheduled). */
  getAdmin: () =>
    apiRequest("/homepage-sections/admin", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  /** Admin: create. Accepts FormData when a banner image is provided. */
  create: async (data, bannerFile = null) => {
    if (bannerFile) {
      const formData = new FormData();
      Object.keys(data).forEach((key) => {
        if (data[key] === undefined || data[key] === null) return;
        // source + sortOverride are objects — server expects JSON strings
        if (key === "source" || key === "sortOverride") {
          formData.append(key, JSON.stringify(data[key]));
        } else {
          formData.append(key, data[key]);
        }
      });
      formData.append("banner", bannerFile);
      const baseURL = getApiBaseUrl();
      const response = await fetch(`${baseURL}/homepage-sections`, {
        method: "POST",
        body: formData,
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to create section");
      return result;
    }
    return apiRequest("/homepage-sections", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  },

  /** Admin: update. `deleteBanner=true` removes the existing banner. */
  update: async (id, data, bannerFile = null, deleteBanner = false) => {
    if (bannerFile || deleteBanner) {
      const formData = new FormData();
      Object.keys(data).forEach((key) => {
        if (data[key] === undefined || data[key] === null) return;
        if (key === "source" || key === "sortOverride") {
          formData.append(key, JSON.stringify(data[key]));
        } else {
          formData.append(key, data[key]);
        }
      });
      if (bannerFile) formData.append("banner", bannerFile);
      if (deleteBanner) formData.append("deleteBanner", "true");
      const baseURL = getApiBaseUrl();
      const response = await fetch(`${baseURL}/homepage-sections/${id}`, {
        method: "PUT",
        body: formData,
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to update section");
      return result;
    }
    return apiRequest(`/homepage-sections/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  },

  /** Admin: hard delete. */
  remove: (id) =>
    apiRequest(`/homepage-sections/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  /** Admin: bulk-update displayOrder. */
  reorder: (orderedIds) =>
    apiRequest("/homepage-sections/reorder", {
      method: "PATCH",
      body: JSON.stringify({ orderedIds }),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
};

/* ── Webhooks ──────────────────────────────────────────────────────────────── */
export const webhookAPI = {
  verifyPaystackWebhook: (body) =>
    apiRequest("/webhooks/paystack", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

/* ── Delivery Tracking ─────────────────────────────────────────────────────────── */
export const deliveryAPI = {
  trackOrder: (orderId) =>
    apiRequest(`/delivery/track/${orderId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  updateLocation: (data) =>
    apiRequest("/delivery/update-location", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  getETA: (orderId) =>
    apiRequest(`/delivery/eta/${orderId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  // Rider APIs
  getRiderOrders: (status) => {
    const query = status ? `?status=${status}` : "";
    return apiRequest(`/delivery/rider/orders${query}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  },
  startDelivery: (orderId) =>
    apiRequest("/delivery/rider/start-delivery", {
      method: "POST",
      body: JSON.stringify({ orderId }),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  completeDelivery: (orderId, deliveryCode) =>
    apiRequest("/delivery/rider/complete-delivery", {
      method: "POST",
      body: JSON.stringify({ orderId, deliveryCode }),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  // Admin APIs
  assignRider: (orderId, riderId) =>
    apiRequest("/delivery/assign-rider", {
      method: "POST",
      body: JSON.stringify({ orderId, riderId }),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  getAdminLive: () =>
    apiRequest("/delivery/admin/live", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  getRiders: () =>
    apiRequest("/delivery/admin/riders", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  // Vendor APIs
  getVendorLive: () =>
    apiRequest("/delivery/vendor/live", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
};

/* ── Wallet ──────────────────────────────────────────────────────────────────── */
export const walletAPI = {
  // Get wallet summary
  getSummary: () =>
    apiRequest("/wallet/summary", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Get transaction history
  getTransactions: (options = {}) =>
    apiRequest(`/wallet/transactions?${new URLSearchParams(options)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Get withdrawal history
  getWithdrawals: (options = {}) =>
    apiRequest(`/wallet/withdrawals?${new URLSearchParams(options)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Request withdrawal
  withdraw: (data) =>
    apiRequest("/wallet/withdraw", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Update bank details
  updateBankDetails: (bankDetails) =>
    apiRequest("/wallet/bank-details", {
      method: "PUT",
      body: JSON.stringify(bankDetails),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Update mobile money details
  updateMobileMoney: (mobileMoneyDetails) =>
    apiRequest("/wallet/mobile-money", {
      method: "PUT",
      body: JSON.stringify(mobileMoneyDetails),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Commission payment via Paystack — two-step flow.
  //
  // Step 1: initializeCommissionPayment(amount) — server calls
  //   Paystack and returns { authorization_url, reference, access_code }.
  //   No wallet change happens here.
  // Step 2: verifyCommissionPayment(paymentRef, amount) — server
  //   re-verifies the reference with Paystack before debiting
  //   commissionOwed. Only on a successful Paystack verify do we
  //   create the WalletTransaction and update balances.
  //
  // The split is mandatory: a single "trust the client" endpoint
  // would let anyone mark their commission as paid by sending a
  // fabricated amount. Paystack is the single source of truth.
  initializeCommissionPayment: (amount) =>
    apiRequest("/wallet/commission/initialize", {
      method: "POST",
      body: JSON.stringify({ amount }),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  verifyCommissionPayment: (paymentRef, amount) =>
    apiRequest("/wallet/commission/verify", {
      method: "POST",
      body: JSON.stringify({ paymentRef, amount }),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
};

/* ── Admin Wallet ──────────────────────────────────────────────────────────── */
export const adminWalletAPI = {
  // Get analytics
  getAnalytics: () =>
    apiRequest("/admin/wallet/analytics", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Get all withdrawals
  getWithdrawals: (options = {}) =>
    apiRequest(`/admin/wallet/withdrawals?${new URLSearchParams(options)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Get withdrawal details
  getWithdrawal: (id) =>
    apiRequest(`/admin/wallet/withdrawal/${id}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Approve withdrawal
  approveWithdrawal: (id) =>
    apiRequest(`/admin/wallet/withdrawal/${id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Reject withdrawal
  rejectWithdrawal: (id, reason) =>
    apiRequest(`/admin/wallet/withdrawal/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Get vendor wallet
  getVendorWallet: (vendorId) =>
    apiRequest(`/admin/wallet/vendor/${vendorId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Get settings
  getSettings: () =>
    apiRequest("/admin/wallet/settings", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Update settings
  updateSettings: (settings) =>
    apiRequest("/admin/wallet/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Release held funds
  releaseHeldFunds: () =>
    apiRequest("/admin/wallet/release-held", {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  /* ── Admin Commissions & Payouts (per-vendor financial table) ── */
  // Platform summary for the 9 stat cards on the new Commissions tab.
  // Returns: { totalVendors, vendorsOwingCommission,
  //   totalOutstandingCommission, totalVendorEarnings,
  //   pendingWithdrawalRequests, totalPendingPayouts, totalPaidOut,
  //   totalCommissionCollected, platformRevenue, settings }
  getCommissionAnalytics: () =>
    apiRequest("/admin/wallet/commissions/analytics", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Per-vendor list (paginated, filterable by vendorType, status,
  // search, dateFrom, dateTo). Returns { vendors, pagination }.
  getCommissionVendors: (options = {}) =>
    apiRequest(
      `/admin/wallet/commissions/vendors?${new URLSearchParams(options)}`,
      { headers: { Authorization: `Bearer ${getToken()}` } }
    ),

  // Single-vendor detail (for the drawer). Returns { vendor, wallet,
  // recentTransactions, withdrawals, commissionPayments, recentOrders,
  // paystackReferences }.
  getCommissionVendor: (vendorId) =>
    apiRequest(`/admin/wallet/commissions/vendors/${vendorId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
};

/* ── Notifications ──────────────────────────────────────────────────────── */
export const notificationAPI = {
  // Get notifications
  getNotifications: (options = {}) =>
    apiRequest(`/notifications?${new URLSearchParams(options)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Get unread count
  getUnreadCount: () =>
    apiRequest("/notifications/unread-count", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Mark as read
  markAsRead: (id) =>
    apiRequest(`/notifications/${id}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Mark all as read
  markAllAsRead: () =>
    apiRequest("/notifications/read-all", {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Aggregated list of items the current user can still review, across
  // ALL delivered orders. Powers the bell's "Leave a review" quick action.
  getPendingReviews: () =>
    apiRequest("/notifications/pending-reviews", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // ── Phase 2 additions: full inbox + preferences + device tokens + admin broadcast ──

  // Delete a single notification (owner only)
  delete: (id) =>
    apiRequest(`/notifications/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Delete all read notifications for the current user
  clearAll: () =>
    apiRequest(`/notifications`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Get the user's notification preferences
  getPreferences: () =>
    apiRequest(`/notifications/preferences`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Update the user's notification preferences. `prefs` is a partial
  // object of { push, email, inApp, promotional, orderUpdates,
  // walletUpdates, reviewReminders, marketing, dndStart, dndEnd }.
  updatePreferences: (prefs) =>
    apiRequest(`/notifications/preferences`, {
      method: "PUT",
      body: JSON.stringify(prefs),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Register a Web Push / FCM device token so the server can target
  // it. The token is opaque to the backend — Phase-2 only logs it
  // (the Web Push service-account wiring requires VAPID keys we don't
  // have yet; see services/notification.service.js#sendWebPushStub).
  registerDeviceToken: (token, platform = "web", userAgent = "") =>
    apiRequest(`/notifications/device-token`, {
      method: "POST",
      body: JSON.stringify({ token, platform, userAgent }),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Remove a previously-registered device token
  removeDeviceToken: (token) =>
    apiRequest(`/notifications/device-token`, {
      method: "DELETE",
      body: JSON.stringify({ token }),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Admin: send a broadcast. Audience is one of
  // "all" | "customers" | "vendors" | "restaurants" | "admins" | "selected".
  sendBroadcast: (payload) =>
    apiRequest(`/notifications`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Admin: list the last N broadcast history rows.
  listBroadcasts: (limit = 20) =>
    apiRequest(`/notifications/broadcasts?limit=${limit}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
};

/* ── Wishlist ──────────────────────────────────────────────────────────────── */
export const wishlistAPI = {
  // Get user's wishlist with pagination
  getWishlist: (page = 1, limit = 20) =>
    apiRequest(`/wishlist?page=${page}&limit=${limit}`, {
      headers: getAuthHeader(),
    }),

  // Get wishlist count
  getCount: () =>
    apiRequest("/wishlist/count", {
      headers: getAuthHeader(),
    }),

  // Check if product is in wishlist
  checkProduct: (productId) =>
    apiRequest(`/wishlist/check/${productId}`, {
      headers: getAuthHeader(),
    }),

  // Add product to wishlist
  add: (productId, notifyPriceDrop = true, notifyBackInStock = true) =>
    apiRequest("/wishlist/add", {
      method: "POST",
      body: JSON.stringify({ productId, notifyPriceDrop, notifyBackInStock }),
      headers: getAuthHeader(),
    }),

  // Remove product from wishlist
  remove: (productId) =>
    apiRequest(`/wishlist/remove/${productId}`, {
      method: "DELETE",
      headers: getAuthHeader(),
    }),

  // Update notification preferences
  updatePreferences: (productId, notifyPriceDrop, notifyBackInStock) =>
    apiRequest(`/wishlist/preferences/${productId}`, {
      method: "PUT",
      body: JSON.stringify({ notifyPriceDrop, notifyBackInStock }),
      headers: getAuthHeader(),
    }),

  // Clear entire wishlist
  clear: () =>
    apiRequest("/wishlist/clear", {
      method: "DELETE",
      headers: getAuthHeader(),
    }),

  // Get recommendations based on wishlist
  getRecommendations: () =>
    apiRequest("/wishlist/recommendations", {
      headers: getAuthHeader(),
    }),
};

/* ── Restaurant / Food Marketplace ──────────────────────────────────────────── */
export const restaurantAPI = {
  // Get all restaurants.
  // ✅ FIX: The new `composite: "true"` query mode asks the server to
  //   return `{ all, featured, popular }` in a single round-trip
  //   instead of 3. FoodPage collapses its 3 parallel calls into 1.
  //   Default callers (no `composite` in params) still get the original
  //   array shape.
  getRestaurants: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/restaurants?${query}`, {});
  },

  // ✅ NEW: Get all food items (unified from Product collection)
  getFoodItems: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/restaurants/food?${query}`, {});
  },

  // Get restaurant by slug
  // ✅ FIX: Cached for 60s. The same restaurant is often opened twice
  //   in a session (refresh, back button) — a per-user 60s TTL is plenty.
  //   The slug endpoint is the heaviest single call in the food flow
  //   (User + categories + products + review stats), so even a short
  //   cache saves a perceptible amount of network + DB work.
  getRestaurantBySlug: (slug) =>
    cachedFetch(
      `restaurant:${slug}`,
      () => apiRequest(`/restaurants/${slug}`, {}),
      60_000
    ),

  // Search restaurants and menu items
  search: (query, limit = 20) =>
    apiRequest(`/restaurants/search/query?q=${encodeURIComponent(query)}&limit=${limit}`, {}),

  // Get restaurants by location
  getByLocation: (region, city) => {
    const params = new URLSearchParams();
    if (region) params.append("region", region);
    if (city) params.append("city", city);
    return apiRequest(`/restaurants/locations?${params}`, {});
  },

  // Get all regions with restaurants
  // ✅ Cached for 10 min — regions rarely change, but every filter
  // interaction on FoodPage would otherwise re-fetch them.
  getRegions: () =>
    cachedFetch("restaurants:regions", () => apiRequest("/restaurants/regions", {}), 10 * 60_000),

  // Get all cuisine types
  // ✅ Cached for 10 min — same rationale as getRegions.
  getCuisines: () =>
    cachedFetch("restaurants:cuisines", () => apiRequest("/restaurants/cuisines", {}), 10 * 60_000),
};

/* ── Menu (Restaurant Dashboard) ──────────────────────────────────────────────── */
export const menuAPI = {
  // Get menu categories
  // ✅ Cached for 5 min — categories change rarely, but the vendor dashboard
  // hot-reloads them on every tab switch.
  getCategories: () =>
    cachedFetch(
      "menu:categories",
      () => apiRequest("/menu/categories", { headers: getAuthHeader() }),
      5 * 60_000
    ),

  // Create category
  createCategory: (name, displayOrder = 0) =>
    apiRequest("/menu/categories", {
      method: "POST",
      body: JSON.stringify({ name, displayOrder }),
      headers: getAuthHeader(),
    }),

  // Update category
  updateCategory: (id, data) =>
    apiRequest(`/menu/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: getAuthHeader(),
    }),

  // Delete category
  deleteCategory: (id) =>
    apiRequest(`/menu/categories/${id}`, {
      method: "DELETE",
      headers: getAuthHeader(),
    }),

  // Get menu items
  getItems: (category) => {
    const params = category ? `?category=${category}` : "";
    return apiRequest(`/menu/items${params}`, { headers: getAuthHeader() });
  },

  // Create menu item
  createItem: (itemData) =>
    apiRequest("/menu/items", {
      method: "POST",
      body: JSON.stringify(itemData),
      headers: getAuthHeader(),
    }),

  // Update menu item
  updateItem: (id, data) =>
    apiRequest(`/menu/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: getAuthHeader(),
    }),

  // Delete menu item
  deleteItem: (id) =>
    apiRequest(`/menu/items/${id}`, {
      method: "DELETE",
      headers: getAuthHeader(),
    }),

  // Toggle availability
  toggleAvailability: (id, available) =>
    apiRequest(`/menu/items/${id}/availability`, {
      method: "PATCH",
      body: JSON.stringify({ available }),
      headers: getAuthHeader(),
    }),

  // Upload menu item images (supports multiple)
  uploadImages: async (itemId, imageFiles = []) => {
    const baseURL = getApiBaseUrl();
    const formData = new FormData();

    imageFiles.forEach(file => {
      formData.append("images", file);
    });

    if (itemId) {
      formData.append("itemId", itemId);
    }

    const response = await fetch(`${baseURL}/menu/upload`, {
      method: "POST",
      body: formData,
      headers: { ...getAuthHeader() }, // Don't set Content-Type for FormData
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Upload failed");
    return data;
  },

  // Upload single image for menu item — Cloudinary-backed (returns {url, public_id})
  uploadSingleImage: async (imageFile) => {
    const baseURL = getApiBaseUrl();
    const formData = new FormData();
    formData.append("image", imageFile);

    const response = await fetch(`${baseURL}/menu/upload-single`, {
      method: "POST",
      body: formData,
      headers: { ...getAuthHeader() },
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Upload failed");
    return data; // { url, public_id }
  },

  // Upload a short video for a menu item — Cloudinary video resource.
  uploadVideo: async (videoFile) => {
    const baseURL = getApiBaseUrl();
    const formData = new FormData();
    formData.append("video", videoFile);

    const response = await fetch(`${baseURL}/menu/upload-video`, {
      method: "POST",
      body: formData,
      headers: { ...getAuthHeader() },
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Video upload failed");
    return data; // { url, public_id, duration }
  },
};

/* ── Food Orders ──────────────────────────────────────────────────────────────── */
export const foodOrderAPI = {
  // Create food order
  create: (orderData) =>
    apiRequest("/food-orders", {
      method: "POST",
      body: JSON.stringify(orderData),
      headers: getAuthHeader(),
    }),

  // Get user's food orders
  getMyOrders: (status, limit = 20, skip = 0) => {
    const params = new URLSearchParams({ limit, skip });
    if (status) params.append("status", status);
    return apiRequest(`/food-orders/my?${params}`, { headers: getAuthHeader() });
  },

  // Get single order
  getOrder: (id) =>
    apiRequest(`/food-orders/${id}`, { headers: getAuthHeader() }),

  // Update order status
  updateStatus: (id, orderStatus) =>
    apiRequest(`/food-orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ orderStatus }),
      headers: getAuthHeader(),
    }),

  // Get restaurant orders
  getRestaurantOrders: (restaurantId, status, limit = 50, skip = 0) => {
    const params = new URLSearchParams({ limit, skip });
    if (status) params.append("status", status);
    return apiRequest(`/food-orders/restaurant/${restaurantId}?${params}`, { headers: getAuthHeader() });
  },

  // Initialize payment
  initializePayment: (id) =>
    apiRequest(`/food-orders/${id}/initialize-payment`, {
      method: "POST",
      headers: getAuthHeader(),
    }),

  // Verify payment
  verifyPayment: (id, paymentRef) =>
    apiRequest(`/food-orders/${id}/verify-payment`, {
      method: "POST",
      body: JSON.stringify({ paymentRef }),
      headers: getAuthHeader(),
    }),
};

/* ── Restaurant Reviews ──────────────────────────────────────────────────────── */
export const restaurantReviewAPI = {
  // Get restaurant reviews
  getReviews: (restaurantId, limit = 20, skip = 0) =>
    apiRequest(`/restaurant-reviews/${restaurantId}?limit=${limit}&skip=${skip}`, {}),

  // Create review
  create: (restaurantId, orderId, rating, review) =>
    apiRequest("/restaurant-reviews", {
      method: "POST",
      body: JSON.stringify({ restaurantId, orderId, rating, review }),
      headers: getAuthHeader(),
    }),

  // Get review for order
  getOrderReview: (orderId) =>
    apiRequest(`/restaurant-reviews/order/${orderId}`, { headers: getAuthHeader() }),
};

/* ── Product Reviews ────────────────────────────────────────────────────────── */
export const productReviewAPI = {
  // Public list of reviews for a product
  list: (productId, params = {}) =>
    apiRequest(`/products/${productId}/reviews?${new URLSearchParams(params)}`),

  // Has the current user already reviewed this product? Returns the review
  // or null. Used by the form to disable / pre-fill the input.
  mine: (productId) =>
    apiRequest(`/products/${productId}/reviews/mine`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  // Submit a new review. Eligibility is checked server-side — the order
  // must belong to the user, be `delivered`, contain the product, and have
  // no prior review for the {user, product, order} triple.
  create: (productId, { orderId, rating, review }) =>
    apiRequest(`/products/${productId}/reviews`, {
      method: "POST",
      body: JSON.stringify({ orderId, rating, review }),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
};
