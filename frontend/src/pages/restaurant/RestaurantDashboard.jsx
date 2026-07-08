// ✅ v3 (perf audit):
// - The 3 heaviest sub-tab pages (Analytics, Settings, Reviews) are now
//   `React.lazy`-loaded with a per-tab <Suspense> boundary. The 5 lighter
//   tabs (Menu, Orders, Delivered, Wallet, Customers) stay eager because
//   the vendor usually lands on the dashboard or orders tab first — we
//   don't want a spinner on the most-used tabs.
// - Note: the dashboard ALSO has a long inline `<style>{...}` block
//   (further down) that styles the raw `className="stat-card"`,
//   `className="action-btn"`, `className="menu-grid"` etc. used by
//   this file's tab content. That block is NOT a duplicate of
//   `RestaurantDashboard.module.css` — the CSS module covers the
//   camelCased `styles.xxx` references, and the inline block covers
//   the raw className references. Both are needed.
import { lazy, Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { menuAPI, vendorAPI } from "../../services/api";
import { useCurrency } from "../../context/CurrencyContext";
import { useToast } from "../../components/Toast";
import { menuCategories } from "../../config/cuisineTypes";
import SEO from "../../components/SEO";
import MenuItemsPage from "./MenuItemsPage";
import OrderRow from "../../components/vendor/OrderRow";
import VendorDeliveredOrders from "../../components/vendor/VendorDeliveredOrders";
import VendorWallet from "../../components/vendor/VendorWallet";
import RestaurantCustomersPage from "./RestaurantCustomersPage";
import styles from "./RestaurantDashboard.module.css";

// ✅ FIX: Lazy-load the 3 heaviest sub-tab pages. Each pulls in chart
// libs / upload code / large review list rendering. The Suspense
// fallback is a per-tab skeleton so the tab area doesn't collapse.
const RestaurantAnalyticsPage = lazy(() => import("./RestaurantAnalyticsPage"));
const RestaurantSettingsPage   = lazy(() => import("./RestaurantSettingsPage"));
const RestaurantReviewsPage    = lazy(() => import("./RestaurantReviewsPage"));
// Eager: MenuItemsPage, OrderRow, VendorDeliveredOrders, VendorWallet,
// RestaurantCustomersPage — they are smaller and the user lands on
// dashboard / orders first.

/* ── Menu Item Form Modal ─────────────────────────────────────────────────────── */
function MenuItemModal({ item, onSave, onClose }) {
  const { fmt } = useCurrency();

  // Safe format function
  const formatPrice = (value) => {
    if (typeof fmt === "function") return fmt(value);
    return `₵${Number(value || 0).toFixed(2)}`;
  };

  const [form, setForm] = useState({
    name: item?.name || "",
    description: item?.description || "",
    price: item?.price || "",
    category: item?.category || "lunch",
    image: item?.image || "",
    preparationTime: item?.preparationTime || 15,
    available: item?.available !== false,
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...form,
        price: Number(form.price),
        preparationTime: Number(form.preparationTime),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{item ? "Edit Menu Item" : "Add Menu Item"}</h3>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Price (GHS) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Category *</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              required
            >
              {menuCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Image URL</label>
            <input
              type="text"
              placeholder="https://..."
              value={form.image}
              onChange={(e) => setForm({ ...form, image: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Preparation Time (minutes)</label>
            <input
              type="number"
              min="1"
              value={form.preparationTime}
              onChange={(e) => setForm({ ...form, preparationTime: e.target.value })}
            />
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.available}
              onChange={(e) => setForm({ ...form, available: e.target.checked })}
            />
            Available for ordering
          </label>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal-content {
          background: white;
          padding: 24px;
          border-radius: 12px;
          width: 90%;
          max-width: 450px;
          max-height: 90vh;
          overflow-y: auto;
        }
        .modal-content h3 {
          margin: 0 0 20px;
        }
        .field {
          margin-bottom: 16px;
        }
        .field label {
          display: block;
          margin-bottom: 6px;
          font-weight: 500;
          font-size: 0.9rem;
        }
        .field input, .field select, .field textarea {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.95rem;
        }
        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
          cursor: pointer;
        }
        .modal-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 20px;
        }
      `}</style>
    </div>
  );
}

/* ── Main Restaurant Dashboard ───────────────────────────────────────────────── */
export default function RestaurantDashboard({ onNavigate, addToast }) {
  console.log("[RestaurantDashboard] ✅ Component MOUNTED");

  const { user, isLoggedIn } = useAuth();
  const { fmt } = useCurrency();
  const { addToast: showToast } = useToast();

  console.log("[RestaurantDashboard] Auth state:", { isLoggedIn, vendorType: user?.vendorType, vendorStatus: user?.vendorStatus });

  // Safe format function
  const formatPrice = (value) => {
    if (typeof fmt === "function") return fmt(value);
    return `₵${Number(value || 0).toFixed(2)}`;
  };

  const [activeTab, setActiveTab] = useState("dashboard");
  const [menuItems, setMenuItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  // ✅ FIX: Revenue persistence.
  //   The previous code computed revenue as
  //     orders.filter(o => o.orderStatus === "delivered").reduce(sum, totalAmount)
  //   where `orders` came from `GET /api/vendor/orders` — an endpoint that
  //   EXPLICITLY excludes delivered orders (`orderStatus: { $ne: "delivered" }`,
  //   backend/routes/vendor.js line 406). The result was always an empty array,
  //   so revenue was always GH₵0.00 after the page refetched.
  //
  //   The fix mirrors the marketplace VendorDashboard pattern
  //   (frontend/src/pages/vendor/VendorDashboard.jsx #VendorOverview): reuse
  //   the existing `GET /api/vendor/dashboard` endpoint, which already
  //   aggregates `totalRevenue` from MongoDB (paid OR delivered, summed
  //   server-side in routes/vendor.js line 375). The same endpoint works
  //   for restaurants because order.service.js sets a top-level `vendorId`
  //   on every order document, so the `$match: { vendorId }` aggregation
  //   hits restaurant orders identically to marketplace orders.
  //
  //   Polling/focus refetch follow the marketplace dashboard's 30s cadence
  //   so the value stays current while the user is on the page; on hard
  //   reload the initial mount call pulls the persisted aggregate from
  //   the database, fixing the "resets to GH₵0.00" symptom.
  const [dashboardStats, setDashboardStats] = useState(null);
  const dashboardCacheRef = useRef({ data: null, timestamp: 0 });
  const DASHBOARD_CACHE_MS = 30_000;
  const [settings, setSettings] = useState({
    openingHours: "08:00",
    closingHours: "22:00",
    deliveryRadius: 5,
    isOpen: false,
  });

  useEffect(() => {
    console.log("[RestaurantDashboard] useEffect:", { isLoggedIn, vendorType: user?.vendorType, hasRestaurantDetails: !!user?.restaurantDetails, userLoaded: !!user });

    // Wait for user to be loaded before checking
    if (!isLoggedIn || !user) {
      console.log("[RestaurantDashboard] Not logged in or no user - redirecting to home");
      onNavigate?.("home");
      return;
    }

    // Check BOTH vendorType AND restaurantDetails for backwards compatibility
    const isRestaurantVendor = user?.vendorType === "restaurant" ||
      (user?.restaurantDetails && Object.keys(user.restaurantDetails).length > 0);

    console.log("[RestaurantDashboard] isRestaurantVendor:", isRestaurantVendor);

    // CRITICAL FIX: Don't redirect if we don't have vendorType yet (data might still be loading)
    // Only redirect if user is definitively NOT a restaurant vendor
    const hasVendorData = user?.vendorType !== undefined || (user?.restaurantDetails && Object.keys(user.restaurantDetails).length > 0);

    if (hasVendorData && !isRestaurantVendor) {
      console.log("[RestaurantDashboard] User is NOT a restaurant vendor - redirecting to vendor dashboard");
      onNavigate?.("vendor");
      return;
    }

    if (!hasVendorData) {
      console.log("[RestaurantDashboard] User data incomplete - waiting for auth check");
      // Don't redirect - wait for auth to complete
      return;
    }

    console.log("[RestaurantDashboard] Fetching data...");
    fetchData();
  }, [user, isLoggedIn]);

  async function fetchData() {
    console.log("[RestaurantDashboard] fetchData called");
    setLoading(true);
    try {
      // Use Promise.allSettled to prevent one failed request from blocking rendering.
      // Restaurant vendors hit the SAME /api/vendor/orders endpoint as marketplace
      // vendors — restaurants are just vendors whose items[].itemType === "food".
      const results = await Promise.allSettled([
        menuAPI.getItems(),
        vendorAPI.getOrders(),
      ]);

      const itemsRes = results[0].status === "fulfilled" ? results[0].value : [];
      const ordersRes = results[1].status === "fulfilled" ? results[1].value : [];

      console.log("[RestaurantDashboard] API results:", {
        items: itemsRes?.length || 0,
        orders: ordersRes?.length || 0,
        itemErrors: results[0].reason?.message,
        orderErrors: results[1].reason?.message
      });

      setMenuItems(itemsRes || []);
      setOrders(ordersRes || []);

      // Load settings from user
      if (user.restaurantDetails) {
        setSettings({
          openingHours: user.restaurantDetails.openingHours || "08:00",
          closingHours: user.restaurantDetails.closingHours || "22:00",
          deliveryRadius: user.restaurantDetails.deliveryRadius || 5,
          isOpen: user.restaurantDetails.isOpen || false,
        });
      }
    } catch (err) {
      console.error("[RestaurantDashboard] Error:", err.message);
      addToast("Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  }

  // ✅ FIX: Pull server-aggregated revenue (and other vendor-stats
  //   the marketplace dashboard already exposes) from the shared
  //   `/api/vendor/stats` endpoint (single source of truth — see
  //   backend/services/restaurantStats.service.js). The previous
  //   client-side filter on `orders` could never see delivered orders
  //   because `/api/vendor/orders` excludes them by design — that's why
  //   revenue was stuck at GH₵0.00 on every reload. The new path
  //   re-fetches the aggregated totals on mount, every 30s while
  //   the page is open, and on window focus, so the displayed
  //   revenue reflects the persisted database value at all times.
  //   The same numbers flow into the Wallet, Customers and Analytics
  //   tabs because they all read from the same endpoint.
  //   See the comment on `dashboardStats` state above for the
  //   full root-cause writeup.
  const fetchDashboardStats = useCallback(async () => {
    const now = Date.now();
    if (
      dashboardCacheRef.current.data &&
      now - dashboardCacheRef.current.timestamp < DASHBOARD_CACHE_MS
    ) {
      setDashboardStats(dashboardCacheRef.current.data);
      return;
    }
    try {
      const data = await vendorAPI.getStats();
      if (data) {
        dashboardCacheRef.current = { data, timestamp: now };
        setDashboardStats(data);
      }
    } catch (err) {
      // Don't toast here — vendorAPI.getStats may 403/404 in
      // edge cases; the rest of the dashboard still works. The
      // console message is enough for debugging.
      console.error("[RestaurantDashboard] stats fetch failed:", err.message);
    }
  }, []);

  useEffect(() => {
    // Initial fetch on mount + 30s polling + window-focus refresh.
    // Mirrors VendorOverview in pages/vendor/VendorDashboard.jsx so
    // the two dashboards stay in lockstep on their refresh cadence.
    fetchDashboardStats();
    const interval = setInterval(fetchDashboardStats, DASHBOARD_CACHE_MS);
    const handleFocus = () => fetchDashboardStats();
    window.addEventListener("focus", handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchDashboardStats]);

  async function handleSaveItem(itemData) {
    try {
      if (editingItem) {
        await menuAPI.updateItem(editingItem._id, itemData);
        addToast("Item updated", "success");
      } else {
        await menuAPI.createItem(itemData);
        addToast("Item created", "success");
      }
      setShowItemModal(false);
      setEditingItem(null);
      fetchData();
    } catch (err) {
      addToast(err.message || "Failed to save item", "error");
    }
  }

  async function handleDeleteItem(itemId) {
    if (!confirm("Delete this menu item?")) return;
    try {
      await menuAPI.deleteItem(itemId);
      addToast("Item deleted", "success");
      fetchData();
    } catch (err) {
      addToast("Failed to delete item", "error");
    }
  }

  async function handleToggleAvailability(item) {
    try {
      await menuAPI.toggleAvailability(item._id, !item.available);
      fetchData();
    } catch (err) {
      addToast("Failed to update availability", "error");
    }
  }

  async function handleUpdateOrderStatus(orderId, status) {
    try {
      // Single source of truth: vendor status update endpoint handles both
      // marketplace vendors and restaurant vendors via the item-owner check.
      const updated = await vendorAPI.updateStatus(orderId, status);
      addToast("Order status updated", "success");
      // Patch the order in local state to keep UI snappy.
      setOrders((prev) => prev.map((o) => (o._id === orderId ? updated : o)));
    } catch (err) {
      addToast(err.message || "Failed to update status", "error");
    }
  }

  // Canonical 6-status groups (single source of truth — matches OrderTracker).
  const pendingOrders = orders.filter((o) => o.orderStatus === "pending");
  const preparingOrders = orders.filter((o) => o.orderStatus === "preparing");

  if (loading) {
    console.log("[RestaurantDashboard] Rendering loading state");
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <SEO title="Restaurant Dashboard | SiiShop" />

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.headerTitle}>🍽️ Restaurant Dashboard</h1>
          <p>{user?.restaurantDetails?.restaurantName || user?.storeName}</p>
        </div>
        <div className={styles.statusToggle}>
          <label>
            <input
              type="checkbox"
              checked={settings.isOpen}
              onChange={(e) => setSettings({ ...settings, isOpen: e.target.checked })}
            />
            {settings.isOpen ? (
              <span className={`${styles.statusBadge} ${styles.open}`}>🟢 Open for Orders</span>
            ) : (
              <span className={`${styles.statusBadge} ${styles.closed}`}>🔴 Closed</span>
            )}
          </label>
        </div>
      </div>

      {/* Tabs - Matching Vendor Dashboard */}
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${activeTab === "dashboard" ? styles.tabActive : ""}`} onClick={() => setActiveTab("dashboard")}>
          📊 Dashboard
        </button>
        <button className={`${styles.tab} ${activeTab === "menu" ? styles.tabActive : ""}`} onClick={() => setActiveTab("menu")}>
          📋 Menu {menuItems.length > 0 && <span className={styles.tabBadge}>{menuItems.length}</span>}
        </button>
        <button className={`${styles.tab} ${activeTab === "orders" ? styles.tabActive : ""}`} onClick={() => setActiveTab("orders")}>
          📦 Orders {pendingOrders.length > 0 && <span className={styles.tabBadge}>{pendingOrders.length}</span>}
        </button>
        <button className={`${styles.tab} ${activeTab === "delivered" ? styles.tabActive : ""}`} onClick={() => setActiveTab("delivered")}>
          ✅ Delivered
        </button>
        <button className={`${styles.tab} ${activeTab === "wallet" ? styles.tabActive : ""}`} onClick={() => setActiveTab("wallet")}>
          💰 Wallet
        </button>
        <button className={`${styles.tab} ${activeTab === "analytics" ? styles.tabActive : ""}`} onClick={() => setActiveTab("analytics")}>
          📈 Analytics
        </button>
        <button className={`${styles.tab} ${activeTab === "customers" ? styles.tabActive : ""}`} onClick={() => setActiveTab("customers")}>
          👥 Customers
        </button>
        <button className={`${styles.tab} ${activeTab === "reviews" ? styles.tabActive : ""}`} onClick={() => setActiveTab("reviews")}>
          ⭐ Reviews
        </button>
        <button className={`${styles.tab} ${activeTab === "settings" ? styles.tabActive : ""}`} onClick={() => setActiveTab("settings")}>
          ⚙️ Settings
        </button>
      </div>

      {/* Dashboard Overview */}
      {activeTab === "dashboard" && (
        <div className={`${styles.tabContent} ${styles.overview}`}>
          <div className={styles.statsGrid}>
            <div className={styles.statsCard} onClick={() => setActiveTab("menu")}>
              <span className={styles.statsCardLabel}>🍽️ Menu Items</span>
              <span className={styles.statsCardValue}>{menuItems.length}</span>
            </div>
            <div className={styles.statsCard} onClick={() => setActiveTab("orders")}>
              <span className={styles.statsCardLabel}>📦 New Orders</span>
              <span className={styles.statsCardValue}>{pendingOrders.length}</span>
            </div>
            <div className="stat-card" onClick={() => setActiveTab("orders")}>
              <span className="stat-icon">🔥</span>
              <span className="stat-value">{preparingOrders.length}</span>
              <span className="stat-label">Preparing</span>
            </div>
            <div className="stat-card" onClick={() => setActiveTab("analytics")}>
              <span className="stat-icon">💰</span>
              {/* ✅ FIX: Use the server-aggregated `totalRevenue` from
                  `GET /api/vendor/dashboard` instead of filtering the
                  active-orders list. The previous expression
                  (orders.filter(o => o.orderStatus === "delivered")...)
                  was always 0 because /api/vendor/orders excludes
                  delivered orders — see the comment on `dashboardStats`
                  state for the full root-cause writeup. The fallback
                  keeps the UI from flashing a non-numeric value if the
                  stats request is still in flight. */}
              <span className="stat-value">{formatPrice(dashboardStats?.totalRevenue ?? 0)}</span>
              <span className="stat-label">Revenue</span>
            </div>
          </div>

          <div className="quick-actions">
            <button className="action-btn" onClick={() => setActiveTab("menu")}>
              ➕ Add Menu Item
            </button>
            <button className="action-btn" onClick={() => setActiveTab("orders")}>
              📦 View Orders
            </button>
            <button className="action-btn" onClick={() => setActiveTab("analytics")}>
              📈 View Analytics
            </button>
            <button className="action-btn" onClick={() => setActiveTab("settings")}>
              ⚙️ Restaurant Settings
            </button>
          </div>

          <div className="recent-orders">
            <h3>Recent Orders</h3>
            {orders.slice(0, 5).map(order => (
              <div key={order._id} className="recent-order">
                <span className="order-id">#{order.orderId?.slice(-6) || order._id?.slice(-6)}</span>
                <span className="order-status">{order.orderStatus}</span>
                <span className="order-total">{formatPrice(order.totalAmount)}</span>
              </div>
            ))}
            {orders.length === 0 && <p className="no-orders">No orders yet</p>}
            {orders.length > 0 && (
              <button className="view-all-btn" onClick={() => setActiveTab("orders")}>
                View All Orders →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Menu Tab — passes the parent's already-fetched `menuItems` to
          skip the redundant `GET /api/menu/items` round-trip, and
          `onRefresh` to keep the dashboard's view of the list in sync
          after the modal saves an item. */}
      {activeTab === "menu" && (
        <MenuItemsPage
          onBack={() => setActiveTab("dashboard")}
          addToast={showToast}
          initialMenuItems={menuItems}
          onRefresh={fetchData}
        />
      )}

      {/* Orders Tab — uses the SAME shared OrderRow component as Marketplace VendorDashboard.
          Restaurant vendors and marketplace vendors share one order management UI. */}
      {activeTab === "orders" && (
        <OrdersTab
          orders={orders}
          onStatusChange={handleUpdateOrderStatus}
          fmt={formatPrice}
        />
      )}

      {/* Delivered Orders Tab — uses the SAME shared VendorDeliveredOrders component as
          Marketplace VendorDashboard. The backend endpoint already scopes by vendor user id,
          so restaurants see only their own delivered orders. */}
      {activeTab === "delivered" && (
        <VendorDeliveredOrders addToast={showToast} />
      )}

      {/* Wallet Tab — uses the SAME shared VendorWallet component as Marketplace
          VendorDashboard. The backend wallet stack (routes/wallet.js + wallet.service.js)
          is vendor-type agnostic: every endpoint scopes by req.user.userId and the service
          never inspects vendorType. Restaurants share the same Wallet model and the same
          accounting, so they see only their own wallet data automatically.
          `sharedStats` from the consolidated /api/vendor/stats endpoint provides the
          online / COD revenue split so the card displays the same numbers as Dashboard
          and Analytics instead of the wallet-ledger values that lag until
          processOrderEarnings has run. */}
      {activeTab === "wallet" && (
        <VendorWallet addToast={showToast} sharedStats={dashboardStats} />
      )}

      {activeTab === "analytics" && (
        <Suspense fallback={<div className={styles.loading}><div className={styles.spinner} /></div>}>
          <RestaurantAnalyticsPage
            onBack={() => setActiveTab("dashboard")}
            vendorId={user?._id}
            addToast={showToast}
            sharedStats={dashboardStats}
          />
        </Suspense>
      )}

      {activeTab === "customers" && (
        <RestaurantCustomersPage
          onBack={() => setActiveTab("dashboard")}
          vendorId={user?._id}
          addToast={showToast}
          sharedStats={dashboardStats}
        />
      )}

      {activeTab === "reviews" && (
        <Suspense fallback={<div className={styles.loading}><div className={styles.spinner} /></div>}>
          <RestaurantReviewsPage onBack={() => setActiveTab("dashboard")} vendorId={user?._id} addToast={showToast} />
        </Suspense>
      )}

      {activeTab === "settings" && (
        <Suspense fallback={<div className={styles.loading}><div className={styles.spinner} /></div>}>
          <RestaurantSettingsPage onBack={() => setActiveTab("dashboard")} addToast={showToast} />
        </Suspense>
      )}

      {/* Menu Tab */}
      {activeTab === "menu" && (
        <div className="tab-content">
          <div className="tab-header">
            <h2>Menu Items</h2>
            <button className="btn btn-primary" onClick={() => { setEditingItem(null); setShowItemModal(true); }}>
              + Add Item
            </button>
          </div>
          {menuItems.length === 0 ? (
            <div className="empty-state">
              <p>No menu items yet</p>
              <button className="btn btn-primary" onClick={() => setShowItemModal(true)}>
                Add Your First Item
              </button>
            </div>
          ) : (
            <div className="menu-grid">
              {menuItems.map((item) => (
                <div key={item._id} className={`menu-card ${!item.available ? "unavailable" : ""}`}>
                  <div className="item-image">
                    {/* Show first image from images array, or fall back to legacy image field */}
                    {(item.images && item.images.length > 0) ? (
                      <img src={item.images[0].url} alt={item.name} />
                    ) : item.image ? (
                      <img src={item.image} alt={item.name} />
                    ) : (
                      <div className="no-image">🍽️</div>
                    )}
                  </div>
                  <div className="item-info">
                    <h4>{item.name}</h4>
                    <p className="category">{item.category}</p>
                    <p className="description">{item.description}</p>
                    <div className="meta">
                      <span className="price">{formatPrice(item.price)}</span>
                      <span className="prep">⏱️ {item.preparationTime} min</span>
                    </div>
                    {!item.available && <span className="unavailable-badge">Unavailable</span>}
                  </div>
                  <div className="item-actions">
                    <button onClick={() => handleToggleAvailability(item)}>
                      {item.available ? "Disable" : "Enable"}
                    </button>
                    <button onClick={() => { setEditingItem(item); setShowItemModal(true); }}>
                      Edit
                    </button>
                    <button className="delete" onClick={() => handleDeleteItem(item._id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* (Orders Tab is rendered earlier in the JSX above — see comment at line 480.) */}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="tab-content">
          <h2>Restaurant Settings</h2>
          <div className="settings-form">
            <div className="field">
              <label>Opening Hours</label>
              <input
                type="time"
                value={settings.openingHours}
                onChange={(e) => setSettings({ ...settings, openingHours: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Closing Hours</label>
              <input
                type="time"
                value={settings.closingHours}
                onChange={(e) => setSettings({ ...settings, closingHours: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Delivery Radius (km)</label>
              <input
                type="number"
                min="1"
                max="50"
                value={settings.deliveryRadius}
                onChange={(e) => setSettings({ ...settings, deliveryRadius: e.target.value })}
              />
            </div>
            <p className="settings-note">
              Contact admin to update restaurant details like name, logo, and description.
            </p>
          </div>
        </div>
      )}

      {/* Item Modal */}
      {showItemModal && (
        <MenuItemModal
          item={editingItem}
          onSave={handleSaveItem}
          onClose={() => { setShowItemModal(false); setEditingItem(null); }}
        />
      )}

      <style>{`
        .dashboard {
          min-height: 100vh;
          background: #f9fafb;
        }
        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          background: white;
          border-bottom: 1px solid #e5e7eb;
        }
        .dashboard-header h1 {
          margin: 0;
          font-size: 1.5rem;
        }
        .dashboard-header p {
          margin: 4px 0 0;
          color: #6b7280;
        }
        .status-toggle label {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
        }
        .status-badge {
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 500;
        }
        .status-badge.open {
          background: #d1fae5;
          color: #059669;
        }
        .status-badge.closed {
          background: #fee2e2;
          color: #dc2626;
        }
        /* Customer Status badges (Restaurant Customers page).
           Colors reference the --status-customer-* tokens in
           styles/global.css :root. */
        .status-badge.status-active    { background: #dcfce7; color: #166534; }
        .status-badge.status-returning { background: #dbeafe; color: #1e40af; }
        .status-badge.status-new       { background: #ffedd5; color: #9a3412; }
        .status-badge.status-inactive  { background: #f3f4f6; color: #4b5563; }
        /* Order Status badges (latestOrderStatus values). The class
           is the kebab-cased form of the canonical orderStatus enum
           (e.g. "out_for_delivery" → "status-out-for-delivery"). */
        .status-badge.status-pending          { background: #fef3c7; color: #92400e; }
        .status-badge.status-confirmed        { background: #fef3c7; color: #92400e; }
        .status-badge.status-preparing        { background: #fed7aa; color: #9a3412; }
        .status-badge.status-out-for-delivery { background: #dbeafe; color: #1e40af; }
        .status-badge.status-delivered        { background: #dcfce7; color: #166534; }
        .status-badge.status-cancelled        { background: #fee2e2; color: #991b1b; }
        .tabs {
          display: flex;
          gap: 8px;
          padding: 12px 20px;
          background: white;
          border-bottom: 1px solid #e5e7eb;
          overflow-x: auto;
        }
        .tabs button {
          padding: 10px 16px;
          border: none;
          background: transparent;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.95rem;
          white-space: nowrap;
        }
        .tabs button.active {
          background: #f97316;
          color: white;
        }
        .tabs .badge {
          display: inline-block;
          margin-left: 6px;
          padding: 2px 8px;
          background: #dc2626;
          color: white;
          border-radius: 10px;
          font-size: 0.75rem;
        }
        .tab-content {
          padding: 20px;
        }
        .dashboard-overview {
          padding: 20px;
        }
        .overview-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }
        .stat-card {
          background: white;
          padding: 20px;
          border-radius: 12px;
          text-align: center;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          transition: transform 0.2s;
        }
        .stat-card:hover {
          transform: translateY(-2px);
        }
        .stat-icon {
          font-size: 1.5rem;
          display: block;
          margin-bottom: 8px;
        }
        .stat-value {
          display: block;
          font-size: 1.5rem;
          font-weight: 700;
          color: #f97316;
        }
        .stat-label {
          display: block;
          font-size: 0.8rem;
          color: #6b7280;
          margin-top: 4px;
        }
        .quick-actions {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
          margin-bottom: 24px;
        }
        .action-btn {
          padding: 16px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 500;
          text-align: center;
        }
        .action-btn:hover {
          background: #f9fafb;
          border-color: #f97316;
        }
        .recent-orders {
          background: white;
          padding: 20px;
          border-radius: 12px;
        }
        .recent-orders h3 {
          margin: 0 0 16px;
        }
        .recent-order {
          display: flex;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid #f3f4f6;
        }
        .recent-order .order-id {
          font-weight: 500;
        }
        .recent-order .order-status {
          font-size: 0.8rem;
          color: #6b7280;
        }
        .recent-order .order-total {
          font-weight: 600;
          color: #f97316;
        }
        .no-orders {
          text-align: center;
          color: #6b7280;
          padding: 20px;
        }
        .view-all-btn {
          display: block;
          width: 100%;
          padding: 12px;
          margin-top: 12px;
          background: #f97316;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
        }
        .tab-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .tab-header h2 {
          margin: 0;
        }
        .empty-state {
          text-align: center;
          padding: 40px;
          color: #6b7280;
        }
        .empty-state p {
          margin-bottom: 16px;
        }
        .menu-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
        }
        .menu-card {
          display: flex;
          gap: 12px;
          padding: 16px;
          background: white;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
        }
        .menu-card.unavailable {
          opacity: 0.6;
        }
        .item-image {
          width: 80px;
          height: 80px;
          border-radius: 8px;
          overflow: hidden;
          flex-shrink: 0;
        }
        .item-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .no-image {
          width: 100%;
          height: 100%;
          background: #f3f4f6;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
        }
        .item-info {
          flex: 1;
          min-width: 0;
        }
        .item-info h4 {
          margin: 0 0 4px;
        }
        .item-info .category {
          margin: 0;
          font-size: 0.8rem;
          color: #6b7280;
          text-transform: capitalize;
        }
        .item-info .description {
          margin: 4px 0;
          font-size: 0.85rem;
          color: #6b7280;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .item-info .meta {
          display: flex;
          gap: 12px;
          margin-top: 8px;
        }
        .item-info .price {
          font-weight: 600;
          color: #f97316;
        }
        .item-info .prep {
          font-size: 0.8rem;
          color: #6b7280;
        }
        .unavailable-badge {
          display: inline-block;
          margin-top: 6px;
          padding: 2px 8px;
          background: #fee2e2;
          color: #dc2626;
          border-radius: 4px;
          font-size: 0.75rem;
        }
        .item-actions {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .item-actions button {
          padding: 6px 10px;
          border: 1px solid #d1d5db;
          background: white;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.8rem;
        }
        .item-actions button.delete {
          color: #dc2626;
          border-color: #fecaca;
        }
        .orders-summary {
          display: flex;
          gap: 16px;
          margin-bottom: 20px;
        }
        .order-stat {
          flex: 1;
          padding: 16px;
          background: white;
          border-radius: 12px;
          text-align: center;
          border: 1px solid #e5e7eb;
        }
        .order-stat .count {
          display: block;
          font-size: 1.5rem;
          font-weight: 600;
        }
        .order-stat .label {
          color: #6b7280;
          font-size: 0.85rem;
        }
        .orders-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .order-card {
          padding: 16px;
          background: white;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
        }
        .order-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .order-id {
          font-weight: 600;
        }
        .order-status {
          text-transform: capitalize;
          font-weight: 500;
        }
        .order-items {
          border-top: 1px solid #f3f4f6;
          padding-top: 12px;
        }
        .order-item {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
          font-size: 0.9rem;
        }
        .order-total {
          display: flex;
          justify-content: space-between;
          font-weight: 600;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #f3f4f6;
        }
        .order-customer {
          margin-top: 12px;
          font-size: 0.85rem;
          color: #6b7280;
        }
        .order-customer p {
          margin: 4px 0;
        }
        .order-actions {
          margin-top: 12px;
        }
        .settings-form {
          max-width: 400px;
        }
        .settings-form .field {
          margin-bottom: 16px;
        }
        .settings-form label {
          display: block;
          margin-bottom: 6px;
          font-weight: 500;
        }
        .settings-form input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
        }
        .settings-note {
          color: #6b7280;
          font-size: 0.85rem;
          margin-top: 20px;
        }

        /* ============================================
           MOBILE RESPONSIVENESS
           ============================================ */
        @media (max-width: 768px) {
          /* Dashboard container padding for bottom nav */
          .dashboard {
            padding-bottom: 90px;
          }

          /* Header - stack vertically on mobile */
          .dashboard-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
            padding: 16px;
          }
          .dashboard-header h1 {
            font-size: 1.25rem;
          }
          .dashboard-header > div:first-child {
            width: 100%;
          }
          .status-toggle {
            width: 100%;
            justify-content: space-between;
          }

          /* Tabs - horizontal scroll with snap */
          .tabs {
            padding: 12px 16px;
            gap: 6px;
            -webkit-overflow-scrolling: touch;
          }
          .tabs button {
            padding: 8px 12px;
            font-size: 0.85rem;
            min-width: fit-content;
          }
          .tabs .badge {
            font-size: 0.7rem;
            padding: 2px 6px;
          }

          /* Tab content padding */
          .tab-content {
            padding: 16px;
          }

          /* Stats cards - 2 columns on tablet, 1 on mobile */
          .overview-stats {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
          .stat-card {
            padding: 16px 12px;
          }
          .stat-value {
            font-size: 1.25rem;
          }
          .stat-label {
            font-size: 0.75rem;
          }

          /* Quick actions - 2 columns on mobile */
          .quick-actions {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }
          .action-btn {
            padding: 14px 12px;
            font-size: 0.85rem;
            min-height: 44px;
          }

          /* Recent orders */
          .recent-orders {
            padding: 16px;
          }
          .recent-order {
            flex-direction: column;
            gap: 8px;
          }

          /* Menu grid */
          .menu-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .menu-card {
            padding: 12px;
          }
          .item-image {
            height: 160px;
          }

          /* Orders */
          .orders-summary {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
          .order-card {
            padding: 16px;
          }
          .order-header {
            flex-direction: column;
            gap: 8px;
          }
          .order-items {
            max-height: 150px;
            overflow-y: auto;
          }
          .order-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }
          .order-actions button {
            flex: 1;
            min-width: 100px;
          }

          /* Analytics */
          .analytics-page .stats-row {
            grid-template-columns: repeat(2, 1fr);
          }
          .analytics-page .date-select {
            width: 100%;
          }

          /* Settings */
          .settings-form {
            max-width: 100%;
          }
          .settings-form .field-row {
            grid-template-columns: 1fr;
          }

          /* Buttons */
          .page-header {
            flex-direction: column;
            gap: 12px;
            align-items: stretch;
          }
          .page-header .btn {
            width: 100%;
          }
        }

        /* Extra small screens */
        @media (max-width: 480px) {
          .overview-stats {
            grid-template-columns: repeat(2, 1fr);
          }
          .quick-actions {
            grid-template-columns: 1fr 1fr;
          }
          .tabs button {
            padding: 8px 10px;
            font-size: 0.8rem;
          }
          .stat-card {
            padding: 14px 10px;
          }
          .stat-icon {
            font-size: 1.25rem;
          }
        }

        /* Touch-friendly tap targets */
        @media (pointer: coarse) {
          .tabs button,
          .action-btn,
          .stat-card,
          .page-header button,
          .order-actions button {
            min-height: 44px;
            min-width: 44px;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * OrdersTab — shared order management UI for restaurant vendors.
 * Visually identical to Marketplace VendorDashboard's VendorOrders tab.
 * Uses the canonical 6-status enum, click-to-expand rows, and OrderTracker
 * in the expanded detail. Restaurants are just vendors whose
 * items[].itemType === "food" — same component, same behavior.
 */
function OrdersTab({ orders, onStatusChange, fmt }) {
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [updating, setUpdating] = useState(null);

  async function handleChange(orderId, newStatus) {
    if (!orderId || updating === orderId) return;
    setUpdating(orderId);
    try {
      await onStatusChange(orderId, newStatus);
    } finally {
      setUpdating(null);
    }
  }

  const safeOrders = Array.isArray(orders) ? orders : [];

  return (
    <div className="tab-content">
      <div className="table-wrap" style={{ overflowX: "auto" }}>
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
            {safeOrders.map((order) => (
              <OrderRow
                key={order._id}
                order={order}
                isExpanded={expandedOrder === order._id}
                onToggleExpand={(id) =>
                  setExpandedOrder(expandedOrder === id ? null : id)
                }
                updating={updating}
                onStatusChange={handleChange}
                fmt={fmt}
              />
            ))}
          </tbody>
        </table>
      </div>
      {safeOrders.length === 0 && (
        <div className="empty-state">
          <p>No orders yet</p>
        </div>
      )}
    </div>
  );
}