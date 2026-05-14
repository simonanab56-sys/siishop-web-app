// pages/vendor/VendorDashboard.jsx — v9: Fixed image URLs
import React, { useState, useEffect, useRef, useCallback } from "react";
import { vendorAPI } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useCurrency } from "../../context/CurrencyContext";
import ImageUpload from "../../components/ImageUpload";
import MultiImageUpload from "../../components/MultiImageUpload";
import { StatusBadge } from "../../components/OrderStatusBadge";
import OrderTracker from "../../components/OrderTracker";
import styles from "./VendorDashboard.module.css";
import VendorStatusBanner from "../../components/VendorStatusBanner";

const API_BASE = import.meta.env.VITE_API_URL_PROD || import.meta.env.VITE_API_URL || "http://localhost:10000/api";

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

// Helper to properly resolve image URL
function getImageUrl(image) {
  if (!image) return "/no-image.svg";
  // Handle Base64 data URLs - return as-is
  if (image.startsWith("data:image")) return image;
  // Handle full URLs
  if (image.startsWith("http")) return image;
  // Handle relative paths
  if (image.startsWith("/uploads")) {
    return API_BASE.replace("/api", "") + image;
  }
  if (image.startsWith("/")) {
    return API_BASE.replace("/api", "") + image;
  }
  // Handle filename only
  return `${API_BASE.replace("/api", "")}/uploads/products/${image}`;
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
      </div>

      {tab === "overview" && <VendorOverview addToast={addToast} />}
      {tab === "orders"   && <VendorOrders   addToast={addToast} setImageModal={setImageModal} />}
      {tab === "products" && <VendorProducts addToast={addToast} isOwnProduct={isOwnProduct} />}
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

  useEffect(() => {
    const fetchDashboard = () => {
      vendorAPI
        .dashboard()
        .then((d) => { if (mountedRef.current) setStats(d || {}); })
        .catch((err) => { if (mountedRef.current) addToast?.(err.message, "error"); })
        .finally(() => { if (mountedRef.current) setLoading(false); });
    };
    
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 5000);
    return () => clearInterval(interval);
  }, [addToast]);
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
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_PRODUCT);
    setFormErrors({});
  }

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
            const primaryImage = p.images?.[0]?.url || p.image || "";

            return (
              <div key={p._id} className={`card ${styles.productCard}`}>
                <div className={styles.productImg}>
                  {primaryImage ? (
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