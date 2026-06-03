// services/api.js — Complete API layer with all methods, no duplicates
import { API_BASE } from "../config/api";
import logger from "../utils/logger";

const DEV = import.meta.env.DEV;

export function getToken() {
  return localStorage.getItem("token");
}

export function getApiBaseUrl() {
  return API_BASE;
}

export async function apiRequest(endpoint, options = {}) {
  const baseURL = getApiBaseUrl();
  const url = `${baseURL}${endpoint}`;

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
      method: "PATCH",
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
  getById: (id) => apiRequest(`/products/${id}`),
  getCategories: () => apiRequest("/products/categories"),
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
};

/* ── Vendor ────────────────────────────────────────────────────────────────── */
export const vendorAPI = {
  dashboard: () =>
    apiRequest("/vendor/dashboard", {
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
  getOrders: () =>
    apiRequest("/vendor/orders", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  updateStatus: (id, orderStatus) =>
    apiRequest(`/vendor/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ orderStatus }),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  // Vendor listing for customers
  getList: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/vendor/list${query ? "?" + query : ""}`);
  },
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
};

/* ── Promos ────────────────────────────────────────────────────────────────── */
export const promoAPI = {
  getAll: () => apiRequest("/promos"),
  getActive: () => apiRequest("/promos/active"),
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

  // Pay commission for COD orders
  payCommission: (amount, paymentMethod, paymentDetails) =>
    apiRequest("/wallet/pay-commission", {
      method: "POST",
      body: JSON.stringify({ amount, paymentMethod, paymentDetails }),
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
};
