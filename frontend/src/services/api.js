// services/api.js — Complete API layer with all methods, no duplicates

function getToken() {
  return localStorage.getItem("token");
}

async function apiRequest(endpoint, options = {}) {
  const baseURL = "http://localhost:5000/api";
  const url = `${baseURL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.error(`[API] ${endpoint}:`, err.message);
    throw err;
  }
}

/* ── Auth ──────────────────────────────────────────────────────────────────── */
export const authAPI = {
  register: (formData) =>
    fetch("http://localhost:5000/api/auth/register", {
      method: "POST",
      body: formData,
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Registration failed");
      return data;
    }),
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
  create: (data) =>
    apiRequest("/products", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  update: (id, data) =>
    apiRequest(`/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
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
  createProduct: (data) =>
    apiRequest("/vendor/products", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  updateProduct: (id, data) =>
    apiRequest(`/vendor/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
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
  getList: () =>
    apiRequest("/vendor/list"),
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
