// pages/OrdersPage.jsx — v5: Fixed image URLs
import { useState, useEffect, useCallback, useRef } from "react";
import { orderAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { getImageUrl } from "../utils/image";
import { StatusBadge } from "../components/OrderStatusBadge";
import OrderTracker   from "../components/OrderTracker";
import ImageModal from "../components/ImageModal";
import styles         from "./OrdersPage.module.css";

const POLL_INTERVAL = 10_000;
function safeId(id)     { return id ? `#${String(id).slice(-6).toUpperCase()}` : "#------"; }
function safeItems(arr) { return Array.isArray(arr) ? arr : []; }

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

export default function OrdersPage({ addToast, onRequireAuth, onNavigate }) {
  const { isLoggedIn } = useAuth();
  const { fmt }        = useCurrency();
  const [orders,      setOrders]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [selectedId,  setSelectedId]  = useState(() => { try { return localStorage.getItem("lastOrderId")||null; } catch { return null; } });
  const [lastRefresh, setLastRefresh] = useState(null);
  const [imageModal, setImageModal] = useState({ src: "", alt: "" });
  const mountedRef = useRef(true);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!isLoggedIn) { if (mountedRef.current) setLoading(false); return; }
    try {
      const data = await orderAPI.getMy();
      if (!mountedRef.current) return;
      setOrders(Array.isArray(data) ? data : []);
      setLastRefresh(new Date());
    } catch (err) {
      if (!mountedRef.current) return;
      if (!silent) addToast?.(`Failed to load orders: ${err.message}`, "error");
    } finally { if (mountedRef.current) setLoading(false); }
  }, [isLoggedIn, addToast]);

  useEffect(() => {
    fetchOrders();
    const t = setInterval(() => fetchOrders(true), POLL_INTERVAL);
    return () => clearInterval(t);
  }, [fetchOrders]);

  if (!isLoggedIn) {
    return (
      <div className="container">
        <div className="empty-state" style={{paddingTop:80}}>
          <div className="empty-icon">🔐</div>
          <h3>Sign in to view your orders</h3>
          <p>Track all your past and current orders after signing in.</p>
          <button className="btn btn-primary" style={{marginTop:20}} onClick={() => onRequireAuth?.()}>Sign In</button>
        </div>
      </div>
    );
  }

  const safeOrders    = Array.isArray(orders) ? orders : [];
  const selectedOrder = safeOrders.find(o => o?._id === selectedId) || null;

  if (loading) return <div className="container"><div className="loading-center"><div className="spinner" /><p>Loading orders…</p></div></div>;

  return (
    <div className={`container page-enter ${styles.page}`}>
      {/* Image fullscreen modal */}
      {imageModal.src && (
        <ImageModal src={imageModal.src} alt={imageModal.alt} onClose={() => setImageModal({ src: "", alt: "" })} />
      )}
      <div className={styles.header}>
        <h1 className={styles.title}>My Orders</h1>
        <div className={styles.headerRight}>
          {lastRefresh && <span className={styles.refreshNote}>Updated {lastRefresh.toLocaleTimeString()}</span>}
          <button className="btn btn-secondary btn-sm" onClick={() => fetchOrders()}>Refresh</button>
        </div>
      </div>

      {safeOrders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <h3>No orders yet</h3>
          <p>Place your first order from the shop!</p>
        </div>
      ) : (
        <div className={styles.layout}>
          {/* List */}
          <div className={styles.list}>
            {safeOrders.map(order => {
              if (!order?._id) return null;
              const itemCount = safeItems(order.items).length;
              return (
                <button key={order._id}
                  className={`${styles.orderCard} ${selectedId === order._id ? styles.orderCardActive : ""}`}
                  onClick={() => setSelectedId(order._id)}>
                  <div className={styles.orderCardTop}>
                    <div>
                      <span className={styles.orderId}>{safeId(order._id)}</span>
                      <span className={styles.orderName}>{order.customerName || "Unknown"}</span>
                    </div>
                    <StatusBadge status={order.orderStatus || order.status || "Pending"} />
                  </div>
                  <div className={styles.orderCardBottom}>
                    {/* ✅ NEW: Show product thumbnail in order list */}
                    {getItemImage(safeItems(order.items)?.[0]) && (
                      <img src={getItemImage(safeItems(order.items)[0])} alt="First item" className={styles.orderCardThumb} onError={(e) => {e.target.style.display = "none";}} onClick={() => setImageModal({ src: getItemImage(safeItems(order.items)[0]), alt: safeItems(order.items)[0]?.name })} style={{ cursor: "pointer" }} />
                    )}
                    <span>{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
                    <span className={styles.orderTotal}>{fmt(typeof order.totalAmount === "number" ? order.totalAmount : 0)}</span>
                    <span className={styles.payMethodChip}>{order.paymentMethod === "cash" ? "💵 COD" : "💳 Card"}</span>
                    <span className={styles.orderDate}>{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "—"}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail */}
          <div className={styles.detail}>
            {selectedOrder ? (
              <div className={styles.detailCard}>
                <div className={styles.detailHeader}>
                  <div>
                    <h2 className={styles.detailTitle}>Order {safeId(selectedOrder._id)}</h2>
                    <p className={styles.detailDate}>Placed on {selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleString() : "—"}</p>
                  </div>
                  <StatusBadge status={selectedOrder.orderStatus || selectedOrder.status || "Pending"} />
                </div>

                <OrderTracker orderStatus={selectedOrder.orderStatus || "pending"} />

                {/* Track Delivery Button - Show when order is out for delivery */}
                {selectedOrder.orderStatus === "out_for_delivery" && (
                  <div style={{ marginTop: 16 }}>
                    <button
                      className="btn btn-primary"
                      style={{ width: "100%" }}
                      onClick={() => {
                        sessionStorage.setItem("trackingOrderId", selectedOrder._id);
                        onNavigate?.("delivery-tracking");
                      }}
                    >
                      🚴 Track Delivery
                    </button>
                  </div>
                )}

                <div className={styles.divider} />

                <div className={styles.infoGrid}>
                  <div><span className={styles.infoLabel}>Customer</span><span className={styles.infoValue}>{selectedOrder.customerName || "—"}</span></div>
                  <div><span className={styles.infoLabel}>Email</span><span className={styles.infoValue}>{selectedOrder.customerEmail || "—"}</span></div>
                  {/* PART 5: phone number */}
                  {selectedOrder.customerPhone && (
                    <div><span className={styles.infoLabel}>Phone</span><span className={styles.infoValue}>{selectedOrder.customerPhone}</span></div>
                  )}
                  <div style={{gridColumn:"span 2"}}>
                    <span className={styles.infoLabel}>Address</span>
                    <span className={styles.infoValue}>{selectedOrder.deliveryAddress || "—"}</span>
                  </div>
                  <div>
                    <span className={styles.infoLabel}>Payment</span>
                    <span className={styles.infoValue}>{selectedOrder.paymentMethod === "cash" ? "Cash on Delivery" : "Paystack"}</span>
                  </div>
                  <div>
                    <span className={styles.infoLabel}>Pay Status</span>
                    <span className={`badge ${selectedOrder.paymentStatus === "paid" ? "badge-delivered" : "badge-pending"}`}>
                      {selectedOrder.paymentStatus === "paid" ? "💳 Paid" : "⏳ Pending"}
                    </span>
                  </div>
                  {selectedOrder.paymentRef && (
                    <div style={{gridColumn:"span 2"}}>
                      <span className={styles.infoLabel}>Payment Ref</span>
                      <span className={styles.infoValue} style={{fontFamily:"monospace",fontSize:"0.78rem"}}>{selectedOrder.paymentRef}</span>
                    </div>
                  )}
                </div>

                <div className={styles.divider} />
                <h3 className={styles.itemsTitle}>Items</h3>
                <div className={styles.itemsList}>
                  {safeItems(selectedOrder.items).map((item, i) => {
                    if (!item) return null;
                    const price = Number(item.price)||0;
                    const qty   = Number(item.quantity)||0;
                    // Use helper to get image from single or multiple images
                    const imageUrl = getItemImage(item) || "/no-image.svg";
                    const resolvedImage = getItemImage(item);
                    return (
                      <div key={i} className={styles.itemRow}>
                        <img src={imageUrl} alt={item.name||"Item"} className={styles.itemImg} onError={(e) => {e.target.src = "/no-image.svg";}} onClick={() => resolvedImage && setImageModal({ src: resolvedImage, alt: item.name })} style={{ cursor: resolvedImage ? "pointer" : "default" }} />
                        <span className={styles.itemName}>{item.name || "Unknown item"}</span>
                        <span className={styles.itemQty}>×{qty}</span>
                        <span className={styles.itemPrice}>{fmt(price * qty)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.detailTotal}>
                  <span>Total</span>
                  <span>{fmt(typeof selectedOrder.totalAmount === "number" ? selectedOrder.totalAmount : 0)}</span>
                </div>
              </div>
            ) : (
              <div className={styles.detailPlaceholder}>
                <div style={{fontSize:"2.5rem"}}>👆</div>
                <p>Select an order to see details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
