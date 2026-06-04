// pages/vendor/VendorDashboard.jsx — v11: Wallet tab
import React, { useState, useEffect, useRef, useCallback } from "react";
import { vendorAPI, walletAPI } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useCurrency } from "../../context/CurrencyContext";
import { getImageUrl, PLACEHOLDER_IMAGE } from "../../utils/image";
import ImageUpload from "../../components/ImageUpload";
import MultiImageUpload from "../../components/MultiImageUpload";
import { StatusBadge } from "../../components/OrderStatusBadge";
import OrderTracker from "../../components/OrderTracker";
import { AnalyticsCalendar, DateFilter, StatsCard } from "../../components/analytics";
import logger from "../../utils/logger";
import styles from "./VendorDashboard.module.css";
import VendorStatusBanner from "../../components/VendorStatusBanner";

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
];

const EMPTY_PRODUCT = {
  name: "",
  description: "",
  price: "",
  category: "",
  image: "",
  images: [], // Array of { file, preview, name } or { url }
  available: true,
  stock: "",
};

function safeId(id) {
  return id ? `#${String(id).slice(-6).toUpperCase()}` : "#------";
}

// Helper to get image from item (supports single image and multiple images)
function getItemImage(item) {
  if (!item) return null;
  let img = null;

  // Check for direct image fields
  if (item.image) {
    img = item.image;
  } else if (item.images && item.images.length > 0) {
    const firstImg = item.images[0];
    img = typeof firstImg === "string" ? firstImg : firstImg?.url;
  }

  // Check product reference (for promos and older orders)
  if (!img && item.productId) {
    const productRef = typeof item.productId === "object" ? item.productId : null;
    if (productRef) {
      if (productRef.image) {
        img = productRef.image;
      } else if (productRef.images && productRef.images.length > 0) {
        const firstImg = productRef.images[0];
        img = typeof firstImg === "string" ? firstImg : firstImg?.url;
      }
    }
  }

  // Check product object (another reference format)
  if (!img && item.product) {
    if (item.product.image) {
      img = item.product.image;
    } else if (item.product.images && item.product.images.length > 0) {
      const firstImg = item.product.images[0];
      img = typeof firstImg === "string" ? firstImg : firstImg?.url;
    }
  }

  if (!img) return null;
  return getImageUrl(img);
}

export default function VendorDashboard({ addToast, onRequireAuth }) {
  const { isLoggedIn, isApprovedVendor, isAdmin, user } = useAuth();
  const [tab, setTab] = useState("overview");
  const [imageModal, setImageModal] = useState({ isOpen: false, src: "", title: "" });

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (imageModal.isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [imageModal.isOpen]);

  const canManage = isAdmin;
  const isOwnProduct = (p) => isAdmin || String(p.vendorId) === String(user?._id);

  if (!isLoggedIn) {
    return (
      <div className="container">
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <div className="empty-icon">🔐</div>
          <h3>Sign in to access your Vendor Dashboard</h3>
          <button className="btn btn-primary" onClick={onRequireAuth}>
            Sign In
          </button>
        </div>
      </div>
    );
  }

  if (!isApprovedVendor && !isAdmin) {
    return (
      <div className="container">
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <div className="empty-icon">⏳</div>
          <h3>Vendor access required</h3>
          <p>Your vendor account is still pending approval.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`container ${styles.page}`}>
      <div className="page-header">
        <h1>🏪 {user?.storeName || "Vendor Dashboard"}</h1>
        <p>Manage your store, products and orders</p>
      </div>
      <VendorStatusBanner />

      {/* Image fullscreen modal */}
      {imageModal.isOpen && (
        <div
          className={styles.imageModalOverlay}
          onClick={() => setImageModal({ isOpen: false, src: "", title: "" })}
        >
          <div className={styles.imageModalContent} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.imageModalClose}
              onClick={() => setImageModal({ isOpen: false, src: "", title: "" })}
            >
              ×
            </button>
            <img src={imageModal.src} alt={imageModal.title} className={styles.imageModalImage} />
            <p className={styles.imageModalTitle}>{imageModal.title}</p>
          </div>
        </div>
      )}

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "overview" ? styles.tabActive : ""}`}
          onClick={() => setTab("overview")}
        >
          📊 Overview
        </button>
        <button
          className={`${styles.tab} ${tab === "orders" ? styles.tabActive : ""}`}
          onClick={() => setTab("orders")}
        >
          🚚 Orders
        </button>
        <button
          className={`${styles.tab} ${tab === "products" ? styles.tabActive : ""}`}
          onClick={() => setTab("products")}
        >
          📦 Products
        </button>
        <button
          className={`${styles.tab} ${tab === "analytics" ? styles.tabActive : ""}`}
          onClick={() => setTab("analytics")}
        >
          📈 Analytics
        </button>
        <button
          className={`${styles.tab} ${tab === "wallet" ? styles.tabActive : ""}`}
          onClick={() => setTab("wallet")}
        >
          💰 Wallet
        </button>
      </div>

      {tab === "overview" && <VendorOverview addToast={addToast} />}
      {tab === "orders"   && <VendorOrders   addToast={addToast} setImageModal={setImageModal} />}
      {tab === "products" && <VendorProducts addToast={addToast} isOwnProduct={isOwnProduct} />}
      {tab === "analytics" && <VendorAnalytics addToast={addToast} />}
      {tab === "wallet" && <VendorWallet addToast={addToast} />}
    </div>
  );
}

/* ───────────────────────────────────────── */
/* OVERVIEW TAB                              */
/* ───────────────────────────────────────── */
function VendorOverview({ addToast }) {
  const { fmt } = useCurrency();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Cache for dashboard data (30 seconds)
  const dashboardCacheRef = useRef({ data: null, timestamp: 0 });
  const CACHE_DURATION = 30000;

  const fetchDashboard = useCallback(() => {
    const now = Date.now();
    // Return cached data if still valid
    if (dashboardCacheRef.current.data && (now - dashboardCacheRef.current.timestamp) < CACHE_DURATION) {
      setStats(dashboardCacheRef.current.data);
      setLoading(false);
      return;
    }

    vendorAPI
      .dashboard()
      .then((d) => {
        if (mountedRef.current) {
          const data = d || {};
          setStats(data);
          // Update cache
          dashboardCacheRef.current = { data, timestamp: now };
        }
      })
      .catch((err) => { if (mountedRef.current) addToast?.(err.message, "error"); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [addToast]);

  useEffect(() => {
    fetchDashboard();
    // Poll every 30 seconds (minimum recommended)
    const interval = setInterval(fetchDashboard, 30000);
    // Refresh on page focus
    const handleFocus = () => fetchDashboard();
    window.addEventListener("focus", handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchDashboard]);
  if (loading) {
    return <div className="loading-center"><div className="spinner" /></div>;
  }

  if (!stats) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <h3>Could not load dashboard</h3>
      </div>
    );
  }

  const totalProducts =
    typeof stats.totalProducts === "number" ? stats.totalProducts : 0;
  const totalOrders =
    typeof stats.totalOrders === "number" ? stats.totalOrders : 0;
  const totalRevenue =
    typeof stats.totalRevenue === "number" ? stats.totalRevenue : 0;
  const recentOrders = Array.isArray(stats.recentOrders)
    ? stats.recentOrders
    : [];

  return (
    <div className={styles.overview}>
      <div className={styles.statsGrid}>
        <div className="stat-card">
          <span className="stat-icon">📦</span>
          <span className="stat-label">My Products</span>
          <span className="stat-value">{totalProducts}</span>
          <span className="stat-sub">listed items</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🛒</span>
          <span className="stat-label">Total Orders</span>
          <span className="stat-value">{totalOrders}</span>
          <span className="stat-sub">containing your items</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">💰</span>
          <span className="stat-label">Revenue</span>
          <span className="stat-value">{fmt(totalRevenue)}</span>
          <span className="stat-sub">from paid orders</span>
        </div>
      </div>

      {recentOrders.length > 0 && (
        <div className={styles.recentSection}>
          <h3 className={styles.sectionTitle}>Recent Orders</h3>
          <div className={styles.tableWrap}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) =>
                  o?._id ? (
                    <tr key={o._id}>
                      <td><code>{safeId(o._id)}</code></td>
                      <td>{o.customerName || "—"}</td>
                      <td>{fmt(typeof o.totalAmount === "number" ? o.totalAmount : 0)}</td>
                      <td><StatusBadge status={o.orderStatus || o.status || "pending"} /></td>
                    </tr>
                  ) : null
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recentOrders.length === 0 && (
        <div className="empty-state" style={{ paddingTop: 40 }}>
          <div className="empty-icon">📊</div>
          <h3>No orders yet</h3>
          <p>Orders containing your products will appear here.</p>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────── */
/* ORDERS TAB — FIXED WITH EXPAND/COLLAPSE  */
/* ───────────────────────────────────────── */
function VendorOrders({ addToast, setImageModal }) {
  const { fmt } = useCurrency();
  const [orders,         setOrders]         = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [updating,       setUpdating]       = useState(null);
  const [expandedOrder,  setExpandedOrder]  = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    vendorAPI
      .getOrders()
      .then((data) => { if (mountedRef.current) setOrders(Array.isArray(data) ? data : []); })
      .catch((err) => { if (mountedRef.current) { addToast?.(err.message, "error"); setOrders([]); } })
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [addToast]);

  async function handleStatus(orderId, newStatus) {
    if (!orderId || updating === orderId) return;
    setUpdating(orderId);
    try {
      const updated = await vendorAPI.updateStatus(orderId, newStatus);
      if (!mountedRef.current) return;
      setOrders((prev) => prev.map((o) => (o._id === orderId ? updated : o)));
      addToast?.("Order updated", "success");
    } catch (err) {
      addToast?.(err.message || "Update failed", "error");
    } finally {
      if (mountedRef.current) setUpdating(null);
    }
  }

  if (loading) {
    return <div className="loading-center"><div className="spinner" /></div>;
  }

  if (orders.length === 0) {
    return (
      <div className="empty-state" style={{ paddingTop: 40 }}>
        <div className="empty-icon">📦</div>
        <h3>No orders yet</h3>
      </div>
    );
  }

  const safeOrders = Array.isArray(orders) ? orders : [];

  return (
    <div className={styles.ordersTab}>
      <div className={styles.tableWrap}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
              <th>Update</th>
            </tr>
          </thead>
          <tbody>
            {safeOrders.map((order) => {
              if (!order?._id) return null;
              const items = Array.isArray(order.items) ? order.items : [];
              const isExpanded = expandedOrder === order._id;
              
              return (
                <React.Fragment key={order._id}>
                  <tr 
                    onClick={() => setExpandedOrder(isExpanded ? null : order._id)} 
                    style={{cursor:"pointer"}} 
                    className={isExpanded ? styles.expandedRow : ""}
                  >
                    <td>
                      <code>{safeId(order._id)}</code>
                      <br />
                      <small style={{ color: "var(--brand-muted)" }}>
                        {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "—"}
                      </small>
                    </td>
                    <td>
                      <strong>{order.customerName || "—"}</strong>
                      <br />
                      <small style={{ color: "var(--brand-muted)" }}>{order.customerPhone || ""}</small>
                    </td>
                    <td>{items.length} item{items.length !== 1 ? "s" : ""}</td>
                    <td><strong>{fmt(typeof order.totalAmount === "number" ? order.totalAmount : 0)}</strong></td>
                    <td><StatusBadge status={order.orderStatus || "pending"} /></td>
                    <td onClick={e => e.stopPropagation()}>
                      <select
                        className={styles.statusSelect}
                        value={order.orderStatus || "pending"}
                        onChange={(e) => handleStatus(order._id, e.target.value)}
                        disabled={updating === order._id}
                      >
                        {ORDER_STATUSES.map((s) => (
                          <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${order._id}-detail`} className={styles.detailRow}>
                      <td colSpan={6} style={{padding:"16px 20px"}}>
                        <div className={styles.trackerWrap}>
                          <p className={styles.detailHeading}><strong>Order Progress</strong> — tap row to collapse</p>
                          <OrderTracker orderStatus={order.orderStatus || "pending"}/>
                          {items.length > 0 && (
                            <div className={styles.orderItemsList}>
                              <strong>Items:</strong>
                              {items.map((item, idx) => {
                                const itemImg = getItemImage(item);
                                return (
                                <div key={idx} className={styles.orderItemRow}>
                                  {itemImg && <img src={itemImg} alt={item.name} style={{width:"40px",height:"40px",borderRadius:"4px",marginRight:"8px",objectFit:"cover",cursor:"pointer"}} onClick={() => setImageModal({ isOpen: true, src: itemImg, title: item.name || "Product Image" })} onError={(e) => { e.target.style.display = "none"; }} />}
                                  <span>{item.quantity}x {item.name}</span>
                                  <span>{fmt((typeof item.price === "number" ? item.price : 0) * (typeof item.quantity === "number" ? item.quantity : 1))}</span>
                                </div>
                                );
                              })}
                              {order.deliveryAddress && (
                                <p className={styles.deliveryAddr}><strong>Delivery address:</strong> {order.deliveryAddress}</p>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────── */
/* PRODUCTS TAB                             */
/* ───────────────────────────────────────── */
function VendorProducts({ addToast, isOwnProduct }) {
  const { fmt } = useCurrency();
  const [products,   setProducts]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [editingId,  setEditingId]  = useState(null); // _id of product being edited
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState(EMPTY_PRODUCT);
  const [formErrors, setFormErrors] = useState({});
  const [saving,    setSaving]    = useState(false);
  const [deleting,   setDeleting]  = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    vendorAPI
      .getProducts()
      .then((data) => { if (mountedRef.current) setProducts(Array.isArray(data) ? data : []); })
      .catch((err) => { if (mountedRef.current) addToast?.(err.message, "error"); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [addToast]);

  function validateForm() {
    const e = {};
    if (!form.name?.trim())               e.name = "Required";
    if (!form.description?.trim())         e.description = "Required";
    if (!form.price || isNaN(form.price) || Number(form.price) <= 0)
                                                e.price = "Enter a valid price";
    if (!form.category?.trim())            e.category = "Required";

    // Check for at least one image (either legacy image or new images array)
    const hasImages = form.images?.length > 0 || form.image;
    if (!hasImages)                       e.image = "Upload at least one product image";

    return e;
  }

  function startAdd() {
    setEditingId(null);
    setForm(EMPTY_PRODUCT);
    setFormErrors({});
    setShowForm(true);
  }

  function startEdit(product) {
    // Convert existing images to editable format
    let existingImages = [];
    if (product.images && product.images.length > 0) {
      existingImages = product.images.map(img => ({
        url: img.url,
        existing: true,
      }));
    } else if (product.image) {
      // Legacy single image support
      existingImages = [{ url: product.image, existing: true }];
    }

    setEditingId(product._id);
    setForm({
      name:        product.name        || "",
      description: product.description || "",
      price:       String(product.price ?? ""),
      category:    product.category    || "",
      image:       product.image       || "",
      images:      existingImages,
      available:   product.available === true,
      stock:       String(product.stock ?? ""),
    });
    setFormErrors({});
    setVideoFile(null);
    console.log("[VENDOR] startEdit - videoUrl:", product.videoUrl);
    setVideoPreview(product.videoUrl || null);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_PRODUCT);
    setFormErrors({});
    setVideoFile(null);
    setVideoPreview(null);
  }

  // Video handlers
  const handleVideoChange = (e) => {
    console.log("[VIDEO] handleVideoChange called");
    const file = e.target.files?.[0];
    if (!file) return;
    console.log("[VIDEO] File selected:", file.name, file.size);
    if (file.size > 50 * 1024 * 1024) {
      addToast?.("Video file too large. Maximum 50MB allowed.", "error");
      return;
    }
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const handleUploadVideo = async () => {
    console.log("[VIDEO] handleUploadVideo called, editingId:", editingId, "videoFile:", videoFile?.name);
    if (!editingId || !videoFile) {
      console.log("[VIDEO] Early return - missing editingId or videoFile");
      return;
    }
    setVideoUploading(true);
    try {
      console.log("[VIDEO] Calling vendorAPI.uploadVideo...");
      const result = await vendorAPI.uploadVideo(editingId, videoFile);
      console.log("[VIDEO] Upload result:", result);
      addToast?.("Video uploaded successfully!", "success");
      // Refresh products
      const data = await vendorAPI.getProducts();
      if (mountedRef.current) {
        setProducts(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      addToast?.(err.message, "error");
    } finally {
      setVideoUploading(false);
    }
  };

  const handleDeleteVideo = async () => {
    if (!editingId) return;
    try {
      const result = await vendorAPI.deleteVideo(editingId);
      console.log("[VIDEO] Delete result:", result);
      setVideoFile(null);
      setVideoPreview(null);
      addToast?.("Video deleted!", "success");
      const data = await vendorAPI.getProducts();
      if (mountedRef.current) {
        setProducts(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      addToast?.(err.message, "error");
    }
  };

  // Handler for image changes
  const handleImagesChange = useCallback((newImages) => {
    setForm((prev) => ({ ...prev, images: newImages }));
    setFormErrors((prev) => ({ ...prev, image: "" }));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    if (saving) return;
    const errs = validateForm();
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        price: parseFloat(form.price),
        category: form.category,
        stock: form.stock ? parseInt(form.stock, 10) : 0,
        available: form.available,
      };

      // Separate new files from existing URLs
      const imageList = form.images || [];
      const newFiles = imageList.filter(img => img.file).map(img => img.file);
      const existingUrls = imageList.filter(img => img.existing).map(img => img.url);

      // Get images to delete (for edit mode - images that existed but were removed)
      let deleteImages = [];
      if (editingId) {
        // Get original product to compare
        const originalProduct = products.find(p => p._id === editingId);
        if (originalProduct) {
          const originalUrls = (originalProduct.images || []).map(img => img.url);
          deleteImages = originalUrls.filter(url => !existingUrls.includes(url));
        }
      }

      let saved;
      if (editingId) {
        saved = await vendorAPI.updateProduct(editingId, payload, newFiles, deleteImages);
      } else {
        saved = await vendorAPI.createProduct(payload, newFiles);
      }

      logger.log("Product saved, images:", saved?.images);

      if (!mountedRef.current) return;

      setProducts((prev) => {
        if (editingId) {
          return prev.map((p) => (p._id === editingId ? saved : p));
        }
        return [saved, ...prev];
      });

      addToast?.(editingId ? "Product updated!" : "Product added!", "success");
      cancelForm();
    } catch (err) {
      if (mountedRef.current) addToast?.(err.message || "Save failed", "error");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  async function handleDelete(productId) {
    if (!productId || deleting === productId) return;
    if (!window.confirm("Delete this product?")) return;
    setDeleting(productId);
    try {
      await vendorAPI.deleteProduct(productId);
      if (!mountedRef.current) return;
      setProducts((prev) => prev.filter((p) => p._id !== productId));
      addToast?.("Product deleted.", "info");
    } catch (err) {
      if (mountedRef.current) addToast?.(err.message || "Delete failed", "error");
    } finally {
      if (mountedRef.current) setDeleting(null);
    }
  }

  function field(key) {
    return {
      value:    form[key],
      onChange: (e) => {
        const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
        setForm((prev) => ({ ...prev, [key]: val }));
        setFormErrors((prev) => ({ ...prev, [key]: "" }));
      },
    };
  }

  if (loading) {
    return <div className="loading-center"><div className="spinner" /></div>;
  }

  const safeProducts = Array.isArray(products) ? products : [];

  return (
    <div className={styles.productsTab}>
      {/* Tab header with + Add button */}
      <div className={styles.tabHeader}>
        <h3>{safeProducts.length} Product{safeProducts.length !== 1 ? "s" : ""}</h3>
        <button
          disabled={!isOwnProduct} className={`btn btn-primary btn-sm ${showForm ? "btn-ghost" : ""}`}
          onClick={showForm ? cancelForm : startAdd}
        >
          {showForm ? "✕ Cancel" : "+ Add Product"}
        </button>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className={styles.formCard}>
          <h4>{editingId ? "Edit Product" : "Add New Product"}</h4>
          <form onSubmit={handleSave} noValidate>
            <div className={styles.formGrid}>
              {/* Left: form fields */}
              <div className={styles.formFields}>
                {[
                  ["name",        "Product Name",       "text",     "e.g. Jollof Rice"],
                  ["description",  "Description",        "textarea",  "Describe your product"],
                  ["price",       "Price (GHS)",        "number",   "9.99"],
                  ["category",    "Category",           "text",     "e.g. electricals"],
                  ["stock",       "Stock Qty",          "number",   "0"],
                ].map(([key, label, type, placeholder]) => (
                  <div key={key} className={styles.formGroup}>
                    <label className={styles.label}>{label}</label>
                    {type === "textarea" ? (
                      <textarea
                        rows={2}
                        placeholder={placeholder}
                        {...field(key)}
                        style={{ resize: "vertical" }}
                      />
                    ) : (
                      <input
                        type={type}
                        step={type === "number" ? "0.01" : undefined}
                        min={type === "number" ? "0" : undefined}
                        placeholder={placeholder}
                        {...field(key)}
                      />
                    )}
                    {formErrors[key] && (
                      <span className={styles.fieldError}>{formErrors[key]}</span>
                    )}
                  </div>
                ))}

                {/* Availability */}
                <div className={styles.formGroup}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={form.available}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, available: e.target.checked }));
                        setFormErrors((prev) => ({ ...prev, available: "" }));
                      }}
                    />
                    <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                      Available for purchase
                    </span>
                  </label>
                </div>
              </div>

              {/* Right: image upload */}
              <div>
                <label className={styles.label}>Product Images (max 10)</label>
                <MultiImageUpload
                  images={form.images || []}
                  onImagesChange={handleImagesChange}
                />
                {formErrors.image && (
                  <span className={styles.fieldError}>{formErrors.image}</span>
                )}
              </div>
              {/* Video Upload */}
              <div>
                <label className={styles.label}>Product Video (optional - max 30s, 50MB) editingId={String(editingId)}</label>
                {editingId && (
                  <>
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      onChange={handleVideoChange}
                      className={styles.fileInput}
                    />
                    {videoPreview && (
                      <div className={styles.videoPreview}>
                        <video src={videoPreview} controls preload="metadata" style={{ maxWidth: "100%", maxHeight: 200 }} />
                        <button type="button" className="btn btn-danger btn-sm" onClick={handleDeleteVideo}>
                          Remove Video
                        </button>
                      </div>
                    )}
                    {videoFile && (
                      <div className={styles.videoPreview}>
                        <video src={videoPreview} controls preload="metadata" style={{ maxWidth: "100%", maxHeight: 200 }} />
                        <button type="button" className="btn btn-primary btn-sm" onClick={handleUploadVideo} disabled={videoUploading}>
                          {videoUploading ? "Uploading..." : "Upload Video"}
                        </button>
                      </div>
                    )}
                  </>
                )}
                {!editingId && <p className={styles.hint}>Save product first, then edit to add video.</p>}
              </div>
            </div>

            <div className={styles.formActions}>
              <button type="button" className="btn btn-ghost" onClick={cancelForm}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Update Product" : "Add Product"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Product grid */}
      {safeProducts.length === 0 && !showForm ? (
        <div className="empty-state" style={{ paddingTop: 40 }}>
          <div className="empty-icon">📦</div>
          <h3>No products listed yet</h3>
          <p>Click "+ Add Product" to list your first item.</p>
        </div>
      ) : (
        <div className="grid-4" style={{ marginTop: showForm ? 0 : 24 }}>
          {safeProducts.map((p) => {
            if (!p?._id) return null;
            const price = typeof p.price === "number" ? p.price : 0;
            const stock = typeof p.stock === "number" ? p.stock : 0;
            const isUnavailable = p.available === false || stock === 0;

            // Get primary image (support both new images array and legacy image)
            const primaryImage = getImageUrl(p.images?.[0]?.url || p.image);

            return (
              <div key={p._id} className={`card ${styles.productCard}`}>
                <div className={styles.productImg}>
                  {primaryImage && primaryImage !== PLACEHOLDER_IMAGE ? (
                    <img src={primaryImage} alt={p.name || "Product"} />
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: "2rem" }}>📦</div>
                  )}
                  {isUnavailable && (
                    <span className={styles.unavailable}>
                      {stock === 0 ? "Out of Stock" : "Unavailable"}
                    </span>
                  )}
                </div>

                <div className={styles.productBody}>
                  {p.category && <span className={styles.productCat}>{p.category}</span>}
                  <h4 className={styles.productName}>{p.name || "Unnamed"}</h4>
                  <p className={styles.productPrice}>{fmt(price)}</p>
                  <p className={styles.productStock}>
                    {stock >= 999 ? "∞ in stock" : `${stock} in stock`}
                  </p>

                  <div className={styles.productActions}>
                    {isOwnProduct(p) && (
                      <>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ flex: 1 }}
                          onClick={() => startEdit(p)}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={deleting === p._id}
                          onClick={() => handleDelete(p._id)}
                        >
                          {deleting === p._id ? "…" : "🗑"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────── */
/* ANALYTICS TAB                             */
/* ───────────────────────────────────────── */
function VendorAnalytics({ addToast }) {
  const { fmt } = useCurrency();
  const [view, setView] = useState("calendar");
  const [period, setPeriod] = useState("30days");
  const [calendarData, setCalendarData] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const [dailyData, setDailyData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [dailyLoading, setDailyLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch calendar data on mount
  useEffect(() => {
    const fetchCalendar = async () => {
      if (!mountedRef.current) return;
      setLoading(true);
      try {
        const now = new Date();
        const data = await vendorAPI.getCalendar(now.getFullYear(), now.getMonth());
        if (mountedRef.current) {
          setCalendarData(data?.data || {});
        }
      } catch (err) {
        if (mountedRef.current) addToast?.(err.message, "error");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };
    fetchCalendar();
  }, [addToast]);

  // Handle period change
  const handlePeriodChange = async (newPeriod) => {
    if (!mountedRef.current) return;
    setPeriod(newPeriod);
    setSummaryLoading(true);
    try {
      const data = await vendorAPI.getSummary(newPeriod);
      if (mountedRef.current) {
        setSummary(data);
      }
    } catch (err) {
      if (mountedRef.current) addToast?.(err.message, "error");
    } finally {
      if (mountedRef.current) setSummaryLoading(false);
    }
  };

  // Fetch chart data
  const handleViewChange = async (newView) => {
    if (!mountedRef.current) return;
    setView(newView);

    if (newView === "chart") {
      setChartLoading(true);
      try {
        const data = await vendorAPI.getChartData("daily", 30);
        if (mountedRef.current) {
          setChartData(data || []);
        }
      } catch (err) {
        if (mountedRef.current) addToast?.(err.message, "error");
      } finally {
        if (mountedRef.current) setChartLoading(false);
      }
    } else if (newView === "summary" && !summary) {
      handlePeriodChange(period);
    }
  };

  // Handle date selection
  const handleDateSelect = async (dateStr) => {
    if (!mountedRef.current) return;
    setSelectedDate(dateStr);
    setDailyLoading(true);
    try {
      const data = await vendorAPI.getDailyAnalytics(dateStr);
      if (mountedRef.current) {
        setDailyData(data);
      }
    } catch (err) {
      if (mountedRef.current) addToast?.(err.message, "error");
    } finally {
      if (mountedRef.current) setDailyLoading(false);
    }
  };

  // Initial summary fetch
  useEffect(() => {
    handlePeriodChange("30days");
  }, []);

  return (
    <div className={styles.analyticsTab}>
      <div className={styles.analyticsNav}>
        <button className={`${styles.analyticsBtn} ${view === "calendar" ? styles.analyticsBtnActive : ""}`} onClick={() => handleViewChange("calendar")}>
          📅 Calendar
        </button>
        <button className={`${styles.analyticsBtn} ${view === "summary" ? styles.analyticsBtnActive : ""}`} onClick={() => handleViewChange("summary")}>
          📊 Summary
        </button>
        <button className={`${styles.analyticsBtn} ${view === "chart" ? styles.analyticsBtnActive : ""}`} onClick={() => handleViewChange("chart")}>
          📈 Charts
        </button>
      </div>

      {/* Calendar View */}
      {view === "calendar" && (
        <>
          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : (
            <div className={styles.calendarWrap}>
              <AnalyticsCalendar
                calendarData={calendarData}
                onDateSelect={handleDateSelect}
                selectedDate={selectedDate}
                fmt={fmt}
              />
            </div>
          )}

          {selectedDate && (
            <div className={styles.dailyDetails}>
              <h4 className={styles.dailyTitle}>
                Orders for {new Date(selectedDate).toLocaleDateString()}
              </h4>
              {dailyLoading ? (
                <div className="loading-center"><div className="spinner" /></div>
              ) : dailyData ? (
                <>
                  <div className={styles.statsGrid}>
                    <StatsCard icon="🛒" label="Total Orders" value={dailyData.metrics?.totalOrders || 0} />
                    <StatsCard icon="💰" label="Total Revenue" value={fmt(dailyData.metrics?.totalRevenue || 0)} color="primary" />
                    <StatsCard icon="✅" label="Paid Revenue" value={fmt(dailyData.metrics?.paidRevenue || 0)} color="success" />
                    <StatsCard icon="📦" label="Delivered" value={dailyData.metrics?.deliveredOrders || 0} color="info" />
                  </div>

                  {dailyData.topProducts?.length > 0 && (
                    <div className={styles.topSection}>
                      <h5>Top Products</h5>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead><tr><th>Product</th><th>Qty</th><th>Revenue</th></tr></thead>
                          <tbody>
                            {dailyData.topProducts.map((p, i) => (
                              <tr key={i}>
                                <td>{p.name}</td>
                                <td>{p.quantity}</td>
                                <td>{fmt(p.revenue)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </>
      )}

      {/* Summary View */}
      {view === "summary" && (
        <>
          <DateFilter onPeriodChange={handlePeriodChange} selectedPeriod={period} />
          {summaryLoading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : summary ? (
            <div className={styles.statsGrid}>
              <StatsCard icon="💰" label="Total Revenue" value={fmt(summary.totalRevenue || 0)} color="primary" />
              <StatsCard icon="🛒" label="Total Orders" value={summary.totalOrders || 0} />
              <StatsCard icon="📦" label="Delivered Orders" value={summary.deliveredOrders || 0} color="success" />
              <StatsCard icon="⏳" label="Pending Orders" value={summary.pendingOrders || 0} color="warning" />
              <StatsCard icon="💵" label="COD Orders" value={summary.codOrders || 0} />
              <StatsCard icon="💳" label="Paystack" value={summary.paystackOrders || 0} color="info" />
              <StatsCard icon="📈" label="Avg Order Value" value={fmt(summary.avgOrderValue || 0)} />
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <h3>No summary data</h3>
            </div>
          )}
        </>
      )}

      {/* Chart View */}
      {view === "chart" && (
        <>
          {chartLoading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : chartData.length > 0 ? (
            <div className={styles.chartWrap}>
              <h4 className={styles.chartTitle}>Daily Sales (Last 30 Days)</h4>
              <div className={styles.chartContainer}>
                {chartData.map((item, i) => (
                  <div key={i} className={styles.chartBar}>
                    <div className={styles.barFill} style={{ height: `${Math.min(100, (item.totalRevenue / Math.max(...chartData.map(d => d.totalRevenue))) * 100)}%` }} />
                    <span className={styles.barLabel}>{item.period?.slice(-5)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📈</div>
              <h3>No chart data</h3>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ───────────────────────────────────────── */
/* WALLET TAB                                */
/* ───────────────────────────────────────── */
function VendorWallet({ addToast }) {
  const { fmt } = useCurrency();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState("summary");
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState({ amount: "", method: "mobile_money", provider: "mtn", phoneNumber: "", accountName: "", bankName: "", accountNumber: "" });
  const [submitting, setSubmitting] = useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchWallet = useCallback(() => {
    walletAPI.getSummary()
      .then((data) => { if (mountedRef.current) setWallet(data); })
      .catch((err) => { if (mountedRef.current) addToast?.(err.message, "error"); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [addToast]);

  const fetchTransactions = useCallback(() => {
    walletAPI.getTransactions({ limit: 20 })
      .then((data) => { if (mountedRef.current) setTransactions(data.transactions || []); })
      .catch((err) => { if (mountedRef.current) addToast?.(err.message, "error"); });
  }, [addToast]);

  const fetchWithdrawals = useCallback(() => {
    walletAPI.getWithdrawals({ limit: 10 })
      .then((data) => { if (mountedRef.current) setWithdrawals(data.withdrawals || []); })
      .catch((err) => { if (mountedRef.current) addToast?.(err.message, "error"); });
  }, [addToast]);

  useEffect(() => {
    if (activeSection === "summary") fetchWallet();
    if (activeSection === "transactions") fetchTransactions();
    if (activeSection === "withdrawals") fetchWithdrawals();
  }, [activeSection, fetchWallet, fetchTransactions, fetchWithdrawals]);

  const handleWithdraw = async (e) => {
    e.preventDefault();
    if (!withdrawForm.amount || parseFloat(withdrawForm.amount) <= 0) {
      addToast?.("Please enter a valid amount", "error");
      return;
    }

    setSubmitting(true);
    try {
      const data = {
        amount: parseFloat(withdrawForm.amount),
        method: withdrawForm.method,
        mobileMoneyDetails: withdrawForm.method === "mobile_money" ? {
          provider: withdrawForm.provider,
          phoneNumber: withdrawForm.phoneNumber,
          accountName: withdrawForm.accountName,
        } : undefined,
        bankDetails: withdrawForm.method === "bank_transfer" ? {
          bankName: withdrawForm.bankName,
          accountNumber: withdrawForm.accountNumber,
          accountName: withdrawForm.accountName,
        } : undefined,
      };
      await walletAPI.withdraw(data);
      addToast?.("Withdrawal request submitted successfully!", "success");
      setShowWithdrawModal(false);
      setWithdrawForm({ amount: "", method: "mobile_money", provider: "mtn", phoneNumber: "", accountName: "", bankName: "", accountNumber: "" });
      fetchWallet();
      fetchWithdrawals();
    } catch (err) {
      addToast?.(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayCommission = async (e) => {
    e.preventDefault();
    if (!withdrawForm.amount || parseFloat(withdrawForm.amount) <= 0) {
      addToast?.("Please enter a valid amount", "error");
      return;
    }
    if (parseFloat(withdrawForm.amount) > (wallet?.outstandingCommission || 0)) {
      addToast?.("Amount exceeds commission owed", "error");
      return;
    }

    setSubmitting(true);
    try {
      await walletAPI.payCommission(parseFloat(withdrawForm.amount), withdrawForm.method, {
        provider: withdrawForm.provider,
        phoneNumber: withdrawForm.phoneNumber,
        accountName: withdrawForm.accountName,
        bankName: withdrawForm.bankName,
        accountNumber: withdrawForm.accountNumber,
      });
      addToast?.("Commission payment successful!", "success");
      setShowCommissionModal(false);
      setWithdrawForm({ amount: "", method: "mobile_money", provider: "mtn", phoneNumber: "", accountName: "", bankName: "", accountNumber: "" });
      fetchWallet();
    } catch (err) {
      addToast?.(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateDetails = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (withdrawForm.method === "mobile_money") {
        await walletAPI.updateMobileMoney({
          provider: withdrawForm.provider,
          phoneNumber: withdrawForm.phoneNumber,
          accountName: withdrawForm.accountName,
        });
      } else {
        await walletAPI.updateBankDetails({
          bankName: withdrawForm.bankName,
          accountNumber: withdrawForm.accountNumber,
          accountName: withdrawForm.accountName,
        });
      }
      addToast?.("Payment details updated successfully!", "success");
      setShowDetailsModal(false);
      fetchWallet();
    } catch (err) {
      addToast?.(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="loading-center"><div className="spinner" /></div>;
  }

  const settings = wallet?.settings || {};

  return (
    <div className={styles.walletContainer}>
      {/* WALLET BALANCE SECTION - Online Payments */}
      <h3 className={styles.walletSectionTitle}>Wallet Balance (Online Payments)</h3>
      <div className={styles.walletCards}>
        <div className={styles.walletCard}>
          <span className={styles.walletCardLabel}>Available (Withdrawable)</span>
          <span className={styles.walletCardValue}>{fmt(wallet?.availableBalance || 0)}</span>
        </div>
        <div className={styles.walletCard}>
          <span className={styles.walletCardLabel}>Pending (Held)</span>
          <span className={styles.walletCardValuePending}>{fmt(wallet?.pendingBalance || 0)}</span>
        </div>
        <div className={styles.walletCard}>
          <span className={styles.walletCardLabel}>Online Earnings</span>
          <span className={styles.walletCardValue}>{fmt(wallet?.totalOnlineEarnings || 0)}</span>
        </div>
        <div className={styles.walletCard}>
          <span className={styles.walletCardLabel}>Total Withdrawn</span>
          <span className={styles.walletCardValue}>{fmt(wallet?.totalWithdrawn || 0)}</span>
        </div>
      </div>

      {/* COD SALES SECTION */}
      <h3 className={styles.walletSectionTitle}>COD Sales (Cash Collected)</h3>
      <div className={styles.walletCards}>
        <div className={styles.walletCard}>
          <span className={styles.walletCardLabel}>Total COD Sales</span>
          <span className={styles.walletCardValueCOD}>{fmt(wallet?.totalCODSales || 0)}</span>
        </div>
        <div className={styles.walletCard}>
          <span className={styles.walletCardLabel}>Commission Owed</span>
          <span className={`${styles.walletCardValue} ${(wallet?.commissionOwed || 0) > 0 ? styles.walletCardValueNegative : ""}`}>{fmt(wallet?.commissionOwed || 0)}</span>
        </div>
        <div className={styles.walletCard}>
          <span className={styles.walletCardLabel}>Commission Paid</span>
          <span className={styles.walletCardValue}>{fmt(wallet?.commissionPaid || 0)}</span>
        </div>
        <div className={styles.walletCard}>
          <span className={styles.walletCardLabel}>Outstanding</span>
          <span className={`${styles.walletCardValue} ${(wallet?.outstandingCommission || 0) > 0 ? styles.walletCardValueNegative : ""}`}>{fmt(wallet?.outstandingCommission || 0)}</span>
        </div>
      </div>

      {/* Wallet Actions */}
      <div className={styles.walletActions}>
        <button className="btn btn-primary" onClick={() => setShowWithdrawModal(true)} disabled={!wallet?.availableBalance || wallet?.availableBalance < settings.minWithdrawal}>
          Withdraw Funds
        </button>
        <button className="btn btn-secondary" onClick={() => setShowDetailsModal(true)}>
          Payment Details
        </button>
        {(wallet?.commissionOwed || 0) > 0 && (
          <button className="btn btn-warning" onClick={() => setShowCommissionModal(true)}>
            Pay Commission ({fmt(wallet?.commissionOwed || 0)})
          </button>
        )}
      </div>

      {/* Settings Info */}
      <div className={styles.walletInfo}>
        <p>Min withdrawal: <strong>{fmt(settings.minWithdrawal)}</strong> | Commission: <strong>{settings.commissionRate}%</strong> | Holding period: <strong>{settings.holdingPeriod} days</strong></p>
        <p style={{marginTop:"8px",color:"#92400e"}}>Note: COD earnings are collected directly from customers. Only online payment earnings can be withdrawn through the wallet.</p>
      </div>

      {/* Section Tabs */}
      <div className={styles.walletSections}>
        <button className={`${styles.walletSectionTab} ${activeSection === "transactions" ? styles.walletSectionTabActive : ""}`} onClick={() => setActiveSection("transactions")}>Transactions</button>
        <button className={`${styles.walletSectionTab} ${activeSection === "withdrawals" ? styles.walletSectionTabActive : ""}`} onClick={() => setActiveSection("withdrawals")}>Withdrawal History</button>
      </div>

      {/* Transactions List */}
      {activeSection === "transactions" && (
        <div className={styles.transactionList}>
          {transactions.length === 0 ? (
            <div className="empty-state"><p>No transactions yet</p></div>
          ) : (
            transactions.map((txn, idx) => (
              <div key={idx} className={styles.transactionItem}>
                <div className={styles.transactionInfo}>
                  <span className={styles.transactionType}>{txn.type.replace(/_/g, " ")}</span>
                  <span className={styles.transactionDesc}>{txn.description}</span>
                  <span className={styles.transactionDate}>{new Date(txn.createdAt).toLocaleDateString()}</span>
                </div>
                <span className={`${styles.transactionAmount} ${["withdrawal", "commission", "commission_due", "commission_payment"].includes(txn.type) ? styles.transactionNegative : styles.transactionPositive}`}>
                  {["withdrawal", "commission", "commission_due", "commission_payment"].includes(txn.type) ? "-" : "+"}{fmt(txn.amount)}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Withdrawals List */}
      {activeSection === "withdrawals" && (
        <div className={styles.transactionList}>
          {withdrawals.length === 0 ? (
            <div className="empty-state"><p>No withdrawal requests yet</p></div>
          ) : (
            withdrawals.map((wd, idx) => (
              <div key={idx} className={styles.transactionItem}>
                <div className={styles.transactionInfo}>
                  <span className={styles.transactionType}>{wd.method.replace("_", " ")}</span>
                  <span className={styles.transactionDesc}>Ref: {wd._id?.slice(-8)}</span>
                  <span className={styles.transactionDate}>{new Date(wd.createdAt).toLocaleDateString()}</span>
                </div>
                <div className={styles.transactionRight}>
                  <span className={styles.transactionAmountNegative}>-{fmt(wd.amount)}</span>
                  <span className={`${styles.transactionStatus} ${styles[`status${wd.status}`]}`}>{wd.status}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className={styles.modalOverlay} onClick={() => setShowWithdrawModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3>Request Withdrawal</h3>
            <form onSubmit={handleWithdraw}>
              <div className={styles.formGroup}>
                <label>Amount (GHS)</label>
                <input type="number" min={settings.minWithdrawal} max={wallet?.availableBalance} value={withdrawForm.amount} onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })} placeholder={`Min: ${settings.minWithdrawal}`} required />
              </div>
              <div className={styles.formGroup}>
                <label>Method</label>
                <select value={withdrawForm.method} onChange={(e) => setWithdrawForm({ ...withdrawForm, method: e.target.value })}>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>
              {withdrawForm.method === "mobile_money" ? (
                <>
                  <div className={styles.formGroup}>
                    <label>Provider</label>
                    <select value={withdrawForm.provider} onChange={(e) => setWithdrawForm({ ...withdrawForm, provider: e.target.value })}>
                      <option value="mtn">MTN</option>
                      <option value="telecel">Telecel</option>
                      <option value="airteltigo">AirtelTigo</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Phone Number</label>
                    <input type="tel" value={withdrawForm.phoneNumber} onChange={(e) => setWithdrawForm({ ...withdrawForm, phoneNumber: e.target.value })} placeholder="e.g. 0201234567" required />
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.formGroup}>
                    <label>Bank Name</label>
                    <input type="text" value={withdrawForm.bankName} onChange={(e) => setWithdrawForm({ ...withdrawForm, bankName: e.target.value })} placeholder="e.g. Ghana Commercial Bank" required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Account Number</label>
                    <input type="text" value={withdrawForm.accountNumber} onChange={(e) => setWithdrawForm({ ...withdrawForm, accountNumber: e.target.value })} placeholder="e.g. 1234567890" required />
                  </div>
                </>
              )}
              <div className={styles.formGroup}>
                <label>Account Name</label>
                <input type="text" value={withdrawForm.accountName} onChange={(e) => setWithdrawForm({ ...withdrawForm, accountName: e.target.value })} placeholder="Full name on account" required />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowWithdrawModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Processing..." : "Submit Request"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Details Modal */}
      {showDetailsModal && (
        <div className={styles.modalOverlay} onClick={() => setShowDetailsModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3>Update Payment Details</h3>
            <form onSubmit={handleUpdateDetails}>
              <div className={styles.formGroup}>
                <label>Method</label>
                <select value={withdrawForm.method} onChange={(e) => setWithdrawForm({ ...withdrawForm, method: e.target.value })}>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>
              {withdrawForm.method === "mobile_money" ? (
                <>
                  <div className={styles.formGroup}>
                    <label>Provider</label>
                    <select value={withdrawForm.provider} onChange={(e) => setWithdrawForm({ ...withdrawForm, provider: e.target.value })}>
                      <option value="mtn">MTN</option>
                      <option value="telecel">Telecel</option>
                      <option value="airteltigo">AirtelTigo</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Phone Number</label>
                    <input type="tel" value={withdrawForm.phoneNumber} onChange={(e) => setWithdrawForm({ ...withdrawForm, phoneNumber: e.target.value })} required />
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.formGroup}>
                    <label>Bank Name</label>
                    <input type="text" value={withdrawForm.bankName} onChange={(e) => setWithdrawForm({ ...withdrawForm, bankName: e.target.value })} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Account Number</label>
                    <input type="text" value={withdrawForm.accountNumber} onChange={(e) => setWithdrawForm({ ...withdrawForm, accountNumber: e.target.value })} required />
                  </div>
                </>
              )}
              <div className={styles.formGroup}>
                <label>Account Name</label>
                <input type="text" value={withdrawForm.accountName} onChange={(e) => setWithdrawForm({ ...withdrawForm, accountName: e.target.value })} required />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowDetailsModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Saving..." : "Save"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Commission Modal */}
      {showCommissionModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCommissionModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3>Pay Commission Owed</h3>
            <div className={styles.commissionInfo}>
              <p>Outstanding Commission: <strong>{fmt(wallet?.commissionOwed || 0)}</strong></p>
            </div>
            <form onSubmit={handlePayCommission}>
              <div className={styles.formGroup}>
                <label>Amount (GHS)</label>
                <input type="number" min={1} max={wallet?.commissionOwed} value={withdrawForm.amount} onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })} placeholder={`Max: ${wallet?.commissionOwed}`} required />
              </div>
              <div className={styles.formGroup}>
                <label>Payment Method</label>
                <select value={withdrawForm.method} onChange={(e) => setWithdrawForm({ ...withdrawForm, method: e.target.value })}>
                  <option value="paystack">Paystack Card</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>
              {withdrawForm.method === "mobile_money" && (
                <>
                  <div className={styles.formGroup}>
                    <label>Provider</label>
                    <select value={withdrawForm.provider} onChange={(e) => setWithdrawForm({ ...withdrawForm, provider: e.target.value })}>
                      <option value="mtn">MTN</option>
                      <option value="telecel">Telecel</option>
                      <option value="airteltigo">AirtelTigo</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Phone Number</label>
                    <input type="tel" value={withdrawForm.phoneNumber} onChange={(e) => setWithdrawForm({ ...withdrawForm, phoneNumber: e.target.value })} required />
                  </div>
                </>
              )}
              {withdrawForm.method === "bank_transfer" && (
                <>
                  <div className={styles.formGroup}>
                    <label>Bank Name</label>
                    <input type="text" value={withdrawForm.bankName} onChange={(e) => setWithdrawForm({ ...withdrawForm, bankName: e.target.value })} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Account Number</label>
                    <input type="text" value={withdrawForm.accountNumber} onChange={(e) => setWithdrawForm({ ...withdrawForm, accountNumber: e.target.value })} required />
                  </div>
                </>
              )}
              <div className={styles.formGroup}>
                <label>Account Name</label>
                <input type="text" value={withdrawForm.accountName} onChange={(e) => setWithdrawForm({ ...withdrawForm, accountName: e.target.value })} required />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCommissionModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-warning" disabled={submitting}>{submitting ? "Processing..." : "Pay Now"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}