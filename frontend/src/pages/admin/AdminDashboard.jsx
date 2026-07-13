// pages/admin/AdminDashboard.jsx — v11: Wallet tab
import React, { useState, useEffect, useCallback, useRef } from "react";
import { adminAPI, vendorAPI, productAPI, orderAPI, promoAPI, categoryAPI, adminWalletAPI, homepageSectionAPI } from "../../services/api";
import { useAuth }     from "../../context/AuthContext";
import { useCurrency } from "../../context/CurrencyContext";
import { getImageUrl, PLACEHOLDER_IMAGE } from "../../utils/image";
import { regions, getCitiesByRegion } from "../../config/ghanaLocations";
import ImageUpload     from "../../components/ImageUpload";
import MultiImageUpload from "../../components/MultiImageUpload";
import SearchableSelect from "../../components/SearchableSelect";
import ProductMultiPicker from "../../components/ProductMultiPicker";
import { useDebounce } from "../../hooks/useDebounce";
import { StatusBadge } from "../../components/OrderStatusBadge";
import OrderTracker from "../../components/OrderTracker";
import { AnalyticsCalendar, DateFilter, StatsCard } from "../../components/analytics";
import AdminChatPage   from "./AdminChatPage";
import AdminBroadcastPage from "./AdminBroadcastPage";
import { DISCOUNT_TYPES, deriveSellingPrice } from "../../utils/pricing";
import socketService   from "../../services/socket";
import styles          from "./AdminDashboard.module.css";

const ORDER_STATUSES = ["pending","confirmed","preparing","out_for_delivery","delivered"];
const EMPTY_PRODUCT  = { name:"", description:"", price:"", originalPrice:"", discountType:"", discountValue:"", category:"", image:"", images:[], available:true, stock:"" };

function safeId(id)   { return id ? `#${String(id).slice(-6).toUpperCase()}` : "#------"; }

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

export default function AdminDashboard({ addToast, onRequireAuth }) {
  const { isLoggedIn, isAdmin } = useAuth();
  const { fmt }                 = useCurrency();
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

  // ─────────────────────────────────────────────────────────
  // Live admin-notify room: connect the socket on mount, join the
  // admin-notify-room, and forward any `commission_paid` (or future
  // admin-only) events to a window CustomEvent that the Navbar's
  // NotificationBell listens for. This is how the bell badge updates
  // instantly when a vendor pays commission — the bell itself
  // remains HTTP-polled (every 30s) as a fallback.
  //
  // Why a window event instead of a context: NotificationBell
  // lives in the Navbar (one level above this component), and
  // prop-drilling through App.jsx would be invasive. A
  // CustomEvent is the existing pattern this codebase uses for
  // cross-component messaging.
  //
  // Non-fatal: if the socket fails to connect (no token, network
  // error, etc.) the admin still gets notifications via the 30s
  // bell poll, so we log and move on.
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;

    (async () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        await socketService.connect(token);
        if (cancelled) return;
        socketService.adminNotifyJoin();

        const handler = (data) => {
          if (data && data.type) {
            window.dispatchEvent(new CustomEvent("admin-notification", { detail: data }));
          }
        };
        socketService.on("admin-notify-room-broadcast", handler);

        return () => {
          socketService.off("admin-notify-room-broadcast", handler);
          socketService.adminNotifyLeave();
        };
      } catch (err) {
        // Non-fatal — bell still updates via 30s poll.
        console.warn("[AdminDashboard] Live admin-notify socket unavailable:", err.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!isLoggedIn) return <GateScreen msg="Sign in to access the Admin Dashboard" onAuth={onRequireAuth} icon="🔐" />;
  if (!isAdmin)    return <GateScreen msg="Admin access required." icon="🚫" />;

  const TABS = [["overview","📊 Overview"],["users","👥 Users"],["vendors","🏪 Vendors"],["products","📦 Products"],["orders","🚚 Orders"],["delivered-orders","✅ Delivered"],["analytics","📈 Analytics"],["wallet","💰 Wallet"],["commissions","💼 Commissions & Payouts"],["promos","🏷️ Promos"],["categories","🗂️ Categories"],["sections","🧩 Sections"],["chat","💬 Chat"],["restaurants","🍔 Restaurants"],["broadcast","📣 Broadcast"]];

  return (
    <React.Fragment>
      {/* Image fullscreen modal - outside container */}
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
      <div className={`container page-enter ${styles.page}`}>
      <div className="page-header"><h1>🛠️ Admin Dashboard</h1><p>Full platform control</p></div>
      <div className={styles.tabScroll}>
        <div className={styles.tabs}>
          {TABS.map(([key,label]) => (
            <button key={key} className={`${styles.tab} ${tab===key?styles.tabActive:""}`} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
      </div>
      {tab === "overview"   && <AdminOverview   addToast={addToast} fmt={fmt} />}
      {tab === "users"      && <AdminUsers      addToast={addToast} />}
      {tab === "vendors"    && <AdminVendors    addToast={addToast} />}
      {tab === "products"   && <AdminProducts   addToast={addToast} fmt={fmt} />}
      {tab === "orders"     && <AdminOrders     addToast={addToast} fmt={fmt} setImageModal={setImageModal} />}
      {tab === "delivered-orders" && <AdminDeliveredOrders addToast={addToast} fmt={fmt} />}
      {tab === "analytics"  && <AdminAnalytics  addToast={addToast} fmt={fmt} />}
      {tab === "wallet"     && <AdminWallet    addToast={addToast} fmt={fmt} />}
      {tab === "commissions" && <AdminCommissions addToast={addToast} fmt={fmt} />}
      {tab === "promos"     && <AdminPromos     addToast={addToast} fmt={fmt} />}
      {tab === "categories" && <AdminCategories addToast={addToast} fmt={fmt} />}
      {tab === "sections"   && <AdminSections   addToast={addToast} fmt={fmt} />}
      {tab === "chat"       && <AdminChatPage   addToast={addToast} />}
      {tab === "restaurants" && <AdminRestaurants addToast={addToast} fmt={fmt} />}
      {tab === "broadcast" && <AdminBroadcastPage addToast={addToast} />}
    </div>
    </React.Fragment>
  );
}

function GateScreen({ msg, onAuth, icon }) {
  return (
    <div className="container"><div className="empty-state" style={{paddingTop:80}}>
      <div className="empty-icon">{icon}</div><h3>{msg}</h3>
      {onAuth && <button className="btn btn-primary" style={{marginTop:20}} onClick={() => onAuth?.()}>Sign In</button>}
    </div></div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────
function AdminOverview({ addToast, fmt }) {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current=true; return ()=>{mountedRef.current=false;}; }, []);

  // Cache for stats data (30 seconds)
  const statsCacheRef = useRef({ data: null, timestamp: 0 });
  const CACHE_DURATION = 30000;

  const fetchStats = useCallback(() => {
    const now = Date.now();
    // Return cached data if still valid
    if (statsCacheRef.current.data && (now - statsCacheRef.current.timestamp) < CACHE_DURATION) {
      setStats(statsCacheRef.current.data);
      setLoading(false);
      return;
    }

    adminAPI.getStats()
      .then(d => {
        if (mountedRef.current) {
          const data = d || {};
          setStats(data);
          // Update cache
          statsCacheRef.current = { data, timestamp: now };
        }
      })
      .catch(err => { if (mountedRef.current) addToast?.(err.message, "error"); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [addToast]);

  useEffect(() => {
    fetchStats();
    // Poll every 30 seconds (minimum recommended)
    const interval = setInterval(fetchStats, 30000);
    // Refresh on page focus
    const handleFocus = () => fetchStats();
    window.addEventListener("focus", handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchStats]);

  if (loading) return <div className="loading-center"><div className="spinner"/></div>;
  if (!stats)  return <div className="empty-state"><div className="empty-icon">⚠️</div><h3>Could not load stats</h3></div>;

  const rev = typeof stats.totalRevenue === "number" ? stats.totalRevenue : 0;
  const pending = typeof stats.pendingVendors === "number" ? stats.pendingVendors : 0;
  const recentOrders = Array.isArray(stats.recentOrders) ? stats.recentOrders : [];

  return (
    <div className={styles.overview}>
      <div className={styles.statsGrid}>
        {[
          ["👥","Total Users",    stats.totalUsers    ?? 0, "registered accounts"],
          ["🏪","Vendors",        stats.totalVendors  ?? 0, `${pending} pending approval`],
          ["📦","Products",       stats.totalProducts ?? 0, "listed items"],
          ["🛒","Orders",         stats.totalOrders   ?? 0, "placed orders"],
          ["💰","Revenue",        fmt(rev),                 "from paid orders"],
        ].map(([icon,label,value,sub]) => (
          <div key={label} className="stat-card">
            <span className="stat-icon">{icon}</span>
            <span className="stat-label">{label}</span>
            <span className="stat-value">{value}</span>
            <span className="stat-sub">{sub}</span>
          </div>
        ))}
      </div>
      {recentOrders.length > 0 && (
        <>
          <h3 className={styles.sectionTitle}>Recent Orders</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Order #</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead>
              <tbody>
                {recentOrders.map(o => o?._id && (
                  <tr key={o._id}>
                    <td><code>{safeId(o._id)}</code></td>
                    <td>{o.customerName||"—"}</td>
                    <td>{fmt(typeof o.totalAmount==="number"?o.totalAmount:0)}</td>
                    <td><span className={`badge ${o.paymentStatus==="paid"?"badge-delivered":"badge-pending"}`}>{o.paymentStatus||"unknown"}</span></td>
                    <td><StatusBadge status={o.orderStatus || o.status || "pending"}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Analytics ─────────────────────────────────────────────────────────────────
/* ───────────────────────────────────────── */
/* DELIVERED ORDERS TAB                     */
/* ───────────────────────────────────────── */
function AdminDeliveredOrders({ addToast, fmt }) {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const mountedRef = useRef(true);

  const fetchStats = useCallback(async () => {
    try {
      const data = await adminAPI.getDeliveredOrdersStats();
      if (mountedRef.current) setStats(data);
    } catch (err) {
      logger.error("Failed to load stats:", err);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const params = { filter };
      if (filter === "custom") {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      if (search) params.search = search;
      const data = await adminAPI.getDeliveredOrders(params);
      if (mountedRef.current) setOrders(data || []);
    } catch (err) {
      logger.error("Failed to load delivered orders:", err);
      addToast?.("Failed to load delivered orders", "error");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [filter, startDate, endDate, search, addToast]);

  useEffect(() => {
    mountedRef.current = true;
    fetchStats();
    fetchOrders();
    return () => { mountedRef.current = false; };
  }, [fetchStats, fetchOrders]);

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    if (newFilter !== "custom") {
      setStartDate("");
      setEndDate("");
    }
  };

  const formatDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  };

  return (
    <div className={styles.deliveredTab}>
      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className="stat-card">
          <span className="stat-icon">✅</span>
          <span className="stat-label">Total Delivered</span>
          <span className="stat-value">{stats?.totalDelivered || 0}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">💰</span>
          <span className="stat-label">Total Revenue</span>
          <span className="stat-value">{fmt(stats?.totalRevenue || 0)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">📅</span>
          <span className="stat-label">Today</span>
          <span className="stat-value">{stats?.deliveredToday || 0}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">📆</span>
          <span className="stat-label">This Month</span>
          <span className="stat-value">{stats?.deliveredThisMonth || 0}</span>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filtersRow}>
        <div className={styles.filterBtns}>
          {["all", "today", "last7days", "last30days", "custom"].map((f) => (
            <button key={f} className={`${styles.filterBtn} ${filter === f ? styles.filterBtnActive : ""}`} onClick={() => handleFilterChange(f)}>
              {f === "all" ? "All" : f === "today" ? "Today" : f === "last7days" ? "7 Days" : f === "last30days" ? "30 Days" : "Custom"}
            </button>
          ))}
        </div>
        {filter === "custom" && (
          <div className={styles.dateInputs}>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={styles.dateInput} />
            <span>to</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={styles.dateInput} />
          </div>
        )}
        <input type="text" placeholder="Search order ID, customer..." value={search} onChange={(e) => setSearch(e.target.value)} className={styles.searchInput} />
      </div>

      {/* Orders Table */}
      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : orders.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">📦</div><h3>No delivered orders found</h3></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Vendor</th>
                <th>Products</th>
                <th>Total</th>
                <th>Delivery Date</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order._id}>
                  <td>{safeId(order._id)}</td>
                  <td>{order.userId?.name || "Unknown"}</td>
                  <td>{(order.items || []).map((i) => i.vendorId?.storeName).filter(Boolean).join(", ") || "Unknown"}</td>
                  <td>{(order.items || []).length} items</td>
                  <td>{fmt(order.totalAmount)}</td>
                  <td>{formatDate(order.deliveredAt)}</td>
                  <td>{order.paymentMethod === "paystack" ? "Online" : "COD"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AdminAnalytics({ addToast, fmt }) {
  const [view, setView] = useState("calendar"); // calendar | summary | chart
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

  useEffect(() => { mountedRef.current=true; return ()=>{mountedRef.current=false;}; }, []);

  // Fetch calendar data on mount
  useEffect(() => {
    const fetchCalendar = async () => {
      if (!mountedRef.current) return;
      setLoading(true);
      try {
        const now = new Date();
        const data = await adminAPI.getCalendar(now.getFullYear(), now.getMonth());
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
      const data = await adminAPI.getSummary(newPeriod);
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
        const data = await adminAPI.getChartData("daily", 30);
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
      const data = await adminAPI.getDailyAnalytics(dateStr);
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

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

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

                  {dailyData.vendorStats?.length > 0 && (
                    <div className={styles.topSection}>
                      <h5>Top Vendors</h5>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead><tr><th>Vendor</th><th>Orders</th><th>Revenue</th></tr></thead>
                          <tbody>
                            {dailyData.vendorStats.map((v, i) => (
                              <tr key={i}>
                                <td>{v.name}</td>
                                <td>{v.orders}</td>
                                <td>{fmt(v.revenue)}</td>
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
              <StatsCard icon="🏪" label="Active Vendors" value={summary.activeVendors || 0} />
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

// ── Users ─────────────────────────────────────────────────────────────────────
function AdminUsers({ addToast }) {
  const { user: me } = useAuth();
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [role,     setRole]     = useState("");
  const [deleting, setDeleting] = useState(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current=true; return ()=>{mountedRef.current=false;}; }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (role)   params.role   = role;
      const res = await adminAPI.getUsers(params);
      // Response is { data: [...], pagination: {...} }
      if (!mountedRef.current) return;
      setUsers(Array.isArray(res?.data) ? res.data : []);
    } catch (err) { if(mountedRef.current) { addToast?.(err.message,"error"); setUsers([]); } }
    finally { if(mountedRef.current) setLoading(false); }
  }, [search, role, addToast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleDelete(id) {
    if (!id || deleting) return;
    if (!window.confirm("Delete this user?")) return;
    setDeleting(id);
    try {
      await adminAPI.deleteUser(id);
      if(!mountedRef.current) return;
      setUsers(prev => prev.filter(u => u._id !== id));
      addToast?.("User deleted.","info");
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
    finally { if(mountedRef.current) setDeleting(null); }
  }

  async function toggleAdmin(user) {
    if (!user?._id) return;
    try {
      const updated = await adminAPI.toggleAdmin(user._id);
      if(!mountedRef.current) return;
      setUsers(prev => prev.map(u => u._id === user._id ? updated : u));
      addToast?.(updated.isAdmin ? "Admin role granted" : "Admin role revoked", "success");
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
  }

  const myId = me?._id;
  return (
    <div>
      <div className={styles.toolbar}>
        <input type="text" placeholder="Search name or email…" value={search} onChange={e=>setSearch(e.target.value)} className={styles.searchInput} />
        <select value={role} onChange={e=>setRole(e.target.value)} className={styles.roleFilter}>
          <option value="">All roles</option>
          <option value="customer">Customers</option>
          <option value="vendor">Vendors</option>
          <option value="admin">Admins</option>
        </select>
      </div>
      {loading ? <div className="loading-center"><div className="spinner"/></div> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>
              {(Array.isArray(users)?users:[]).map(u => {
                if(!u?._id) return null;
                const isMe = myId && String(u._id)===myId;
                return (
                  <tr key={u._id}>
                    <td><strong>{u.name||"—"}</strong></td>
                    <td>{u.email||"—"}</td>
                    <td>
                      {u.isAdmin  && <span className="role-badge role-admin">Admin</span>}
                      {u.isVendor && <span className="role-badge role-vendor" style={{marginLeft:4}}>{u.storeName||"Vendor"}</span>}
                      {!u.isAdmin && !u.isVendor && <span className="role-badge role-customer">Customer</span>}
                    </td>
                    <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</td>
                    <td>
                      <div className={styles.actionBtns}>
                        {!isMe && <button className="btn btn-secondary btn-sm" onClick={() => toggleAdmin(u)}>{u.isAdmin?"Revoke Admin":"Make Admin"}</button>}
                        {!isMe && <button className="btn btn-danger btn-sm" disabled={deleting===u._id} onClick={() => handleDelete(u._id)}>{deleting===u._id?"…":"Delete"}</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(Array.isArray(users)?users:[]).length === 0 && <tr><td colSpan={5} style={{textAlign:"center",color:"var(--brand-muted)",padding:"32px"}}>No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Vendors ───────────────────────────────────────────────────────────────────
function AdminVendors({ addToast }) {
  const [vendors,    setVendors]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState("all");
  const [processing, setProcessing] = useState(null);
  const [selectedVendor, setSelectedVendor] = useState(null);
  // Location filters
  const [locationFilter, setLocationFilter] = useState({ region: "", city: "" });
  const [availableCities, setAvailableCities] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current=true; return ()=>{mountedRef.current=false;}; }, []);

  // Fetch vendors with filters
  const fetchVendors = useCallback(() => {
    setLoading(true);
    const params = {};
    if (locationFilter.region) params.region = locationFilter.region;
    if (locationFilter.city) params.city = locationFilter.city;
    if (searchQuery) params.search = searchQuery;

    vendorAPI.adminGetAll()
      .then(d => { if(mountedRef.current) setVendors(Array.isArray(d)?d:[]); })
      .catch(err => { if(mountedRef.current) addToast?.(err.message,"error"); setVendors([]); })
      .finally(() => { if(mountedRef.current) setLoading(false); });
  }, [locationFilter, searchQuery, addToast]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  // Update cities when region changes
  useEffect(() => {
    if (locationFilter.region) {
      setAvailableCities(getCitiesByRegion(locationFilter.region));
      setLocationFilter(prev => ({ ...prev, city: "" }));
    } else {
      setAvailableCities([]);
    }
  }, [locationFilter.region]);

  async function approve(id) {
    if (processing) return; setProcessing(id);
    try {
      const updated = await vendorAPI.adminApprove(id);
      if(!mountedRef.current) return;
      setVendors(prev=>(Array.isArray(prev)?prev:[]).map(v=>v._id===id ? { ...v, vendorStatus: updated?.vendorStatus || "approved" } : v));
      addToast?.("Vendor approved! ✅","success");
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
    finally { if(mountedRef.current) setProcessing(null); }
  }
  async function suspend(id) {
    if (processing) return; setProcessing(id);
    try {
      const updated = await vendorAPI.adminSuspend(id);
      if(!mountedRef.current) return;
      setVendors(prev=>(Array.isArray(prev)?prev:[]).map(v=>v._id===id ? { ...v, vendorStatus: updated?.vendorStatus || "suspended" } : v));
      addToast?.("Vendor suspended.","info");
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
    finally { if(mountedRef.current) setProcessing(null); }
  }
  const safeVendors = Array.isArray(vendors) ? vendors : [];
  const filtered    = filter==="all" ? safeVendors : safeVendors.filter(v=>v?.vendorStatus===filter);
  return (
    <div>
      <div className={styles.toolbar}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search vendors..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #ddd", width: "200px" }}
        />
        {/* Status filter */}
        {["all","pending","approved","suspended"].map(f => (
          <button key={f} className={`btn ${filter===f?"btn-primary":"btn-secondary"} btn-sm`} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase()+f.slice(1)}
          </button>
        ))}
        {/* Location filters */}
        <select
          value={locationFilter.region}
          onChange={(e) => setLocationFilter(prev => ({ ...prev, region: e.target.value }))}
          style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #ddd" }}
        >
          <option value="">All Regions</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          value={locationFilter.city}
          onChange={(e) => setLocationFilter(prev => ({ ...prev, city: e.target.value }))}
          disabled={!locationFilter.region}
          style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #ddd" }}
        >
          <option value="">{locationFilter.region ? "All Cities" : "Select Region"}</option>
          {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(locationFilter.region || locationFilter.city || searchQuery) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setLocationFilter({ region: "", city: "" }); setSearchQuery(""); }}>
            Clear Filters
          </button>
        )}
      </div>
      {loading ? <div className="loading-center"><div className="spinner"/></div> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Store</th><th>Owner</th><th>Region</th><th>City</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(v => v?._id && (
                <tr key={v._id}>
                  <td><strong>{v.storeName||"—"}</strong></td>
                  <td>{v.name||"—"}</td>
                  <td>{v.location?.region || "—"}</td>
                  <td>{v.location?.city || "—"}</td>
                  <td><span className={`badge badge-${v.vendorStatus==="approved"?"delivered":v.vendorStatus==="suspended"?"pending":"preparing"}`}>{v.vendorStatus||"pending"}</span></td>
                  <td>
                    <div className={styles.actionBtns}>
                      <button className="btn btn-info btn-sm" onClick={() => setSelectedVendor(v)}>Details</button>
                      {v.vendorStatus!=="approved" && <button className="btn btn-secondary btn-sm" onClick={() => approve(v._id)} disabled={processing===v._id}>Approve</button>}
                      {v.vendorStatus!=="suspended" && <button className="btn btn-danger btn-sm" onClick={() => suspend(v._id)} disabled={processing===v._id}>Suspend</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length===0 && <tr><td colSpan={6} style={{textAlign:"center",color:"var(--brand-muted)",padding:"32px"}}>No vendors found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {selectedVendor && (
        <div className={styles.modal} onClick={() => setSelectedVendor(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Vendor Details - {selectedVendor.storeName}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedVendor(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.detailsGrid}>
                <div><strong>Store Name:</strong> {selectedVendor.storeName||"—"}</div>
                <div><strong>Owner Name:</strong> {selectedVendor.name||"—"}</div>
                <div><strong>Email:</strong> {selectedVendor.email||"—"}</div>
                <div><strong>Phone:</strong> {selectedVendor.phoneNumber||"—"}</div>
                <div><strong>ID Type:</strong> {selectedVendor.idType||"—"}</div>
                <div><strong>Status:</strong> <span className={`badge badge-${selectedVendor.vendorStatus==="approved"?"delivered":selectedVendor.vendorStatus==="suspended"?"pending":"preparing"}`}>{selectedVendor.vendorStatus||"pending"}</span></div>
              </div>
              <div style={{marginTop:"20px",padding:"12px",background:"#f5f5f5",borderRadius:"8px"}}>
                <h4>📍 Location</h4>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginTop:"8px"}}>
                  <div><strong>Country:</strong> {selectedVendor.location?.country || "Ghana"}</div>
                  <div><strong>Region:</strong> {selectedVendor.location?.region || "Not specified"}</div>
                  <div><strong>City:</strong> {selectedVendor.location?.city || "Not specified"}</div>
                </div>
              </div>
              <div style={{marginTop:"20px"}}>
                <h4>National ID Documents</h4>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px",marginTop:"12px"}}>
                  <div>
                    <p style={{fontSize:"12px",color:"var(--brand-muted)",marginBottom:"8px"}}>Front</p>
                    {selectedVendor.idFrontImage ? (
                      <img src={getImageUrl(selectedVendor.idFrontImage)} alt="ID Front" style={{maxWidth:"100%",maxHeight:"200px",borderRadius:"8px",border:"1px solid var(--border-color)"}} />
                    ) : (
                      <div style={{padding:"40px",textAlign:"center",background:"var(--bg-secondary)",borderRadius:"8px",color:"var(--brand-muted)"}}>No image</div>
                    )}
                  </div>
                  <div>
                    <p style={{fontSize:"12px",color:"var(--brand-muted)",marginBottom:"8px"}}>Back</p>
                    {selectedVendor.idBackImage ? (
                      <img src={getImageUrl(selectedVendor.idBackImage)} alt="ID Back" style={{maxWidth:"100%",maxHeight:"200px",borderRadius:"8px",border:"1px solid var(--border-color)"}} />
                    ) : (
                      <div style={{padding:"40px",textAlign:"center",background:"var(--bg-secondary)",borderRadius:"8px",color:"var(--brand-muted)"}}>No image</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Products ──────────────────────────────────────────────────────────────────
function AdminProducts({ addToast, fmt }) {
  const [products,   setProducts]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [editingId,  setEditingId]  = useState(null);
  const [videoFile,  setVideoFile]  = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [form,       setForm]       = useState(EMPTY_PRODUCT);
  const [formErrors, setFormErrors] = useState({});
  const [saving,     setSaving]     = useState(false);
  // ✅ Category dropdown state (mirrors the vendor flow).
  const [categories,        setCategories]        = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError,   setCategoriesError]   = useState(null);
  const [requestingCategory, setRequestingCategory] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState("");
  const debouncedQuery = useDebounce(categoryQuery, 200);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current=true; return ()=>{mountedRef.current=false;}; }, []);

  useEffect(() => {
    productAPI.getAll()
      .then(d => { if(mountedRef.current) setProducts(Array.isArray(d)?d:[]); })
      .catch(err => { if(mountedRef.current) addToast?.(err.message,"error"); setProducts([]); })
      .finally(() => { if(mountedRef.current) setLoading(false); });
  }, [addToast]);

  // ✅ Live categories — loaded on form open and on debounced search.
  const loadCategories = useCallback(async (search = "") => {
    if (!mountedRef.current) return;
    setCategoriesLoading(true);
    setCategoriesError(null);
    try {
      const data = await productAPI.getCategories(search ? { search } : {});
      if (mountedRef.current) setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      if (mountedRef.current) {
        setCategoriesError(err?.message || "Failed to load categories");
        setCategories([]);
      }
    } finally {
      if (mountedRef.current) setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showForm) loadCategories(debouncedQuery);
  }, [showForm, debouncedQuery, loadCategories]);

  const handleRequestNewCategory = useCallback(async (rawName) => {
    const name = (rawName || "").trim();
    if (!name || requestingCategory) return;
    setRequestingCategory(true);
    try {
      await categoryAPI.requestNew(name);
      addToast?.(
        `Requested "${name}". Approving it will add it to the list.`,
        "success"
      );
      setCategoryQuery("");
    } catch (err) {
      addToast?.(err?.message || "Failed to submit request", "error");
    } finally {
      if (mountedRef.current) setRequestingCategory(false);
    }
  }, [addToast, requestingCategory]);

  // Handle image changes
  const handleImagesChange = useCallback((newImages) => {
    setForm((prev) => ({ ...prev, images: newImages }));
    setFormErrors((prev) => ({ ...prev, image: "" }));
  }, []);

  function validate() {
    const e={};
    if(!form.name?.trim()) e.name="Required";
    if(!form.description?.trim()) e.description="Required";
    if(!form.price||isNaN(form.price)||Number(form.price)<=0) e.price="Enter a valid price";
    if(!form.category?.trim()) e.category="Please select a category";
    // Check for at least one image
    const hasImages = form.images?.length > 0 || form.image;
    if(!hasImages) e.image="Upload at least one image";

    // ✅ Discount validation — mirrors backend prepareProductForSave so we
    // fail fast in the form before submitting.
    const op = form.originalPrice === "" ? null : Number(form.originalPrice);
    const dv = form.discountValue === "" ? null : Number(form.discountValue);
    if (op != null && (isNaN(op) || op < 0)) e.originalPrice = "Must be ≥ 0";
    if (dv != null && (isNaN(dv) || dv < 0)) e.discountValue = "Must be ≥ 0";
    if (form.discountType === "percentage" && dv != null && dv > 100)
      e.discountValue = "Cannot exceed 100%";
    if (form.discountType === "fixed" && op != null && dv != null && dv > op)
      e.discountValue = "Cannot exceed original price";

    return e;
  }

  // handleAdd is now inline after handleEdit

  async function handleDelete(id) {
    if(!id) return;
    if(!window.confirm("Delete this product?")) return;
    try {
      await productAPI.delete(id);
      if(!mountedRef.current) return;
      setProducts(prev => Array.isArray(prev)?prev.filter(p=>p._id!==id):[]);
      addToast?.("Product deleted.","info");
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
  }

  function handleEdit(product) {
    setEditingId(product._id);
    setForm({
      name: product.name || "",
      description: product.description || "",
      price: product.price || "",
      originalPrice: product.originalPrice != null ? String(product.originalPrice) : "",
      discountType: product.discountType || "",
      discountValue: product.discountValue != null ? String(product.discountValue) : "",
      category: product.category || "",
      stock: product.stock || "",
      available: product.available !== false,
      images: product.images || [],
      image: product.image || "",
    });
    setVideoFile(null);
    setVideoPreview(product.videoUrl || null);
    setShowForm(true);
  }

  // Handle video file selection
  const handleVideoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ["video/mp4", "video/webm", "video/quicktime"];
    if (!validTypes.includes(file.type)) {
      addToast?.("Invalid file type. Only MP4, WebM, and MOV are allowed.", "error");
      return;
    }

    // Validate file size (50MB)
    if (file.size > 50 * 1024 * 1024) {
      addToast?.("Video file too large. Maximum 50MB allowed.", "error");
      return;
    }

    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  // Upload video
  const handleUploadVideo = async () => {
    if (!editingId || !videoFile) return;

    setVideoUploading(true);
    try {
      await productAPI.uploadVideo(editingId, videoFile);
      addToast?.("Video uploaded successfully!", "success");
      // Refresh products to get updated video URL
      const data = await productAPI.getAll();
      if (mountedRef.current) {
        setProducts(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      addToast?.(err.message, "error");
    } finally {
      setVideoUploading(false);
    }
  };

  // Delete video
  const handleDeleteVideo = async () => {
    if (!editingId) return;

    try {
      await productAPI.deleteVideo(editingId);
      setVideoFile(null);
      setVideoPreview(null);
      addToast?.("Video deleted!", "success");
      const data = await productAPI.getAll();
      if (mountedRef.current) {
        setProducts(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      addToast?.(err.message, "error");
    }
  };

  async function handleAdd(e) {
    e.preventDefault(); if(saving) return;
    const errs = validate(); if(Object.keys(errs).length){ setFormErrors(errs); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        price: parseFloat(form.price),
        category: form.category,
        stock: form.stock ? parseInt(form.stock, 10) : 0,
        available: form.available,
        // ✅ Discount fields (optional). Empty strings are normalized to null
        // server-side via prepareProductForSave().
        originalPrice: form.originalPrice === "" ? null : parseFloat(form.originalPrice),
        discountType:  form.discountType  || null,
        discountValue: form.discountValue === "" ? null : parseFloat(form.discountValue),
      };

      // Get file objects from form.images
      const imageList = form.images || [];
      const newFiles = imageList.filter(img => img.file).map(img => img.file);
      const deleteImages = imageList.filter(img => img.shouldDelete).map(img => img.public_id);

      let saved;
      if (editingId) {
        // Update existing product
        saved = await productAPI.update(editingId, payload, newFiles, deleteImages);
        if(!mountedRef.current) return;
        setProducts(prev => Array.isArray(prev)?prev.map(p=>p._id===editingId?saved:p):[saved]);
        addToast?.("Product updated!","success");
      } else {
        // Create new product
        saved = await productAPI.create(payload, newFiles);
        if(!mountedRef.current) return;
        setProducts(prev => Array.isArray(prev)?[saved,...prev]:[saved]);
        addToast?.("Product added!","success");
      }
      setForm(EMPTY_PRODUCT); setShowForm(false); setEditingId(null); setFormErrors({});
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
    finally { if(mountedRef.current) setSaving(false); }
  }

  const f = (key) => ({ value: form[key], onChange: (e) => { setForm({...form,[key]:e.target.value}); setFormErrors({...formErrors,[key]:""}); } });
  const safeProducts = Array.isArray(products) ? products : [];

  // Get primary image for table display (support both new and legacy)
  const getPrimaryImage = (p) => {
    return getImageUrl(p.images?.[0]?.url || p.image);
  };

  return (
    <div>
      <div className={styles.toolbar}>
        <span style={{fontWeight:600}}>{safeProducts.length} products</span>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(v=>!v); if(showForm) { setEditingId(null); setForm(EMPTY_PRODUCT); } }}>{showForm?"✕ Cancel":"+ Add Product"}</button>
      </div>
      {showForm && (
        <div className={styles.formCard}>
          <h4>{editingId ? "Edit Product" : "Add New Product"}</h4>
          <form onSubmit={handleAdd} noValidate>
            <div className={styles.formGrid}>
              <div className={styles.formFields}>
                {[["name","Name","text","Product name"],["description","Description","textarea","Describe it"],["stock","Stock Qty","number","0"]].map(([key,label,type,ph]) => (
                  <div key={key} className={styles.formGroup}>
                    <label className={styles.label}>{label}</label>
                    {type==="textarea"?<textarea rows={2} placeholder={ph} {...f(key)} style={{resize:"vertical"}}/>:<input type={type} step={type==="number"?"0.01":undefined} min={type==="number"?"0":undefined} placeholder={ph} {...f(key)}/>}
                    {formErrors[key] && <span className={styles.fieldError}>{formErrors[key]}</span>}
                  </div>
                ))}

                {/* ✅ Price input — auto-derives from the discount trio when
                    originalPrice + discountType + discountValue are all set.
                    The user's direct edit always wins; the auto-derive only
                    fires when the discount fields change and the derived
                    selling price is well-defined. This ensures the value sent
                    in the payload matches what the live preview shows. */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Price (GHS)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="9.99"
                    value={form.price}
                    onChange={(e) => {
                      setForm({ ...form, price: e.target.value });
                      setFormErrors({ ...formErrors, price: "" });
                    }}
                  />
                  {formErrors.price && <span className={styles.fieldError}>{formErrors.price}</span>}
                </div>

                {/* ✅ Discount / Pricing section — OPTIONAL.
                    - Original Price + Discount Type + Discount Value produce a
                      live-derived Selling Price preview.
                    - Leaving Original Price blank disables discounts (server
                      normalizes all three discount fields to null in
                      prepareProductForSave). */}
                <div className={`${styles.formGroup} ${styles.discountSection}`}>
                  <label className={styles.label}>Discount (optional)</label>
                  <div className={styles.discountGrid}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Original Price"
                      value={form.originalPrice}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((prev) => {
                          const next = { ...prev, originalPrice: v };
                          // ✅ Auto-derive selling price whenever the discount
                          // trio is well-defined. Mirrors backend semantics
                          // (deriveSellingPrice + prepareProductForSave).
                          const op = v === "" ? null : Number(v);
                          const dv = prev.discountValue === "" ? null : Number(prev.discountValue);
                          const derived = deriveSellingPrice({
                            originalPrice: op,
                            discountType: prev.discountType,
                            discountValue: dv,
                          });
                          if (derived != null) next.price = String(derived);
                          return next;
                        });
                        setFormErrors((prev) => ({ ...prev, originalPrice: "" }));
                      }}
                    />
                    <select
                      value={form.discountType}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((prev) => {
                          const next = { ...prev, discountType: v };
                          const op = prev.originalPrice === "" ? null : Number(prev.originalPrice);
                          const dv = prev.discountValue === "" ? null : Number(prev.discountValue);
                          const derived = deriveSellingPrice({
                            originalPrice: op,
                            discountType: v,
                            discountValue: dv,
                          });
                          if (derived != null) next.price = String(derived);
                          return next;
                        });
                        setFormErrors((prev) => ({ ...prev, discountValue: "" }));
                      }}
                    >
                      {DISCOUNT_TYPES.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={
                        form.discountType === "percentage"
                          ? "Discount %"
                          : form.discountType === "fixed"
                          ? "Discount GHS"
                          : "Discount value"
                      }
                      value={form.discountValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((prev) => {
                          const next = { ...prev, discountValue: v };
                          const op = prev.originalPrice === "" ? null : Number(prev.originalPrice);
                          const dv = v === "" ? null : Number(v);
                          const derived = deriveSellingPrice({
                            originalPrice: op,
                            discountType: prev.discountType,
                            discountValue: dv,
                          });
                          if (derived != null) next.price = String(derived);
                          return next;
                        });
                        setFormErrors((prev) => ({ ...prev, discountValue: "" }));
                      }}
                    />
                  </div>
                  {/* Live preview line */}
                  {(() => {
                    const op = form.originalPrice === "" ? null : Number(form.originalPrice);
                    const dv = form.discountValue === "" ? null : Number(form.discountValue);
                    const selling = form.price === "" ? null : Number(form.price);
                    const derived = deriveSellingPrice({
                      originalPrice: op,
                      discountType: form.discountType,
                      discountValue: dv,
                    });
                    const previewPrice = derived != null ? derived : selling;
                    const savings = op != null && derived != null ? op - derived : 0;
                    const pct = op != null && op > 0 && derived != null
                      ? Math.round((savings / op) * 100)
                      : 0;
                    if (previewPrice == null || form.originalPrice === "") return null;
                    return (
                      <p className={styles.discountPreview}>
                        Final selling price: <strong>{fmt(previewPrice)}</strong>
                        {savings > 0 && pct > 0 && (
                          <span className={styles.discountPreviewSave}>
                            {" — Save "}{fmt(savings)} (-{pct}%)
                          </span>
                        )}
                      </p>
                    );
                  })()}
                  {(formErrors.originalPrice || formErrors.discountValue) && (
                    <span className={styles.fieldError}>
                      {formErrors.originalPrice || formErrors.discountValue}
                    </span>
                  )}
                </div>

                {/* ✅ Category — searchable dropdown, same UX as the vendor form. */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    Category
                    <span style={{ color: "var(--brand-danger)", marginLeft: 4 }}>*</span>
                  </label>
                  <SearchableSelect
                    options={categories}
                    value={form.category}
                    onChange={(v) => {
                      setForm((prev) => ({ ...prev, category: v }));
                      setFormErrors((prev) => ({ ...prev, category: "" }));
                    }}
                    onQueryChange={setCategoryQuery}
                    loading={categoriesLoading}
                    error={categoriesError}
                    placeholder="Select a category…"
                    emptyMessage="No matching categories"
                    onRequestNew={handleRequestNewCategory}
                    requestNewLabel="Request new category"
                    required
                    disabled={requestingCategory}
                  />
                  {formErrors.category && (
                    <span className={styles.fieldError}>{formErrors.category}</span>
                  )}
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Availability</label>
                  <select value={form.available} onChange={e=>setForm({...form,available:e.target.value==="true"})}>
                    <option value="true">Available</option>
                    <option value="false">Unavailable</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={styles.label}>Product Images (max 10)</label>
                <MultiImageUpload
                  images={form.images || []}
                  onImagesChange={handleImagesChange}
                />
                {formErrors.image && <span className={styles.fieldError}>{formErrors.image}</span>}
              </div>
              {/* Video Upload */}
              <div>
                <label className={styles.label}>Product Video (optional - max 30s, 50MB)</label>
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
              <button type="button" className="btn btn-ghost" onClick={() => {setShowForm(false);setForm(EMPTY_PRODUCT);setFormErrors({});setEditingId(null);setVideoFile(null);setVideoPreview(null);}}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving?"Saving…":editingId ? "Save Product" : "Add Product"}</button>
            </div>
          </form>
        </div>
      )}
      {loading ? <div className="loading-center"><div className="spinner"/></div> : (
        <div className="table-wrap" style={{marginTop:8}}>
          <table className="data-table">
            <thead><tr><th>Image</th><th>Name</th><th>Category</th><th>Vendor</th><th>Price</th><th>Stock</th><th></th></tr></thead>
            <tbody>
              {safeProducts.map(p => {
                if(!p?._id) return null;
                const price = typeof p.price==="number"?p.price:0;
                const primaryImage = getPrimaryImage(p);
                return (
                  <tr key={p._id}>
                    <td>{primaryImage && primaryImage !== PLACEHOLDER_IMAGE
                      ? <img src={primaryImage} alt={p.name||"Product"} style={{width:40,height:40,objectFit:"cover",borderRadius:8}} onError={(e)=>{e.target.style.display='none'}}/>
                      : <div style={{width:40,height:40,background:"var(--brand-surface)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"}}>🛍️</div>}</td>
                    <td><strong>{p.name||"—"}</strong></td>
                    <td>{p.category||"—"}</td>
                    <td>{p.vendorName || (typeof p.vendorId === "object" && p.vendorId?.storeName ? p.vendorId.storeName : <em style={{color:"var(--brand-muted)"}}>—</em>)}</td>
                    <td>{fmt(price)}</td>
                    <td>{(typeof p.stock === "number" && p.stock >= 999) ? "∞" : (typeof p.stock === "number" ? p.stock : 0)}</td>
                    <td>
                      <div className={styles.actionBtns}>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(p)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p._id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {safeProducts.length===0 && <tr><td colSpan={7} style={{textAlign:"center",color:"var(--brand-muted)",padding:"32px"}}>No products yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Orders ────────────────────────────────────────────────────────────────────
function AdminOrders({ addToast, fmt, setImageModal }) {
  const [orders,         setOrders]         = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [updating,       setUpdating]       = useState(null);
  const [expandedOrder,  setExpandedOrder]  = useState(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current=true; return ()=>{mountedRef.current=false;}; }, []);

  useEffect(() => {
    adminAPI.getOrders()
      .then(d => { if(mountedRef.current) setOrders(Array.isArray(d)?d:[]); })
      .catch(err => { if(mountedRef.current) addToast?.(err.message,"error"); setOrders([]); })
      .finally(() => { if(mountedRef.current) setLoading(false); });
  }, [addToast]);

  async function handleStatus(id, os) {
    if(updating===id) return; setUpdating(id);
    const legacyMap = {pending:"pending",confirmed:"confirmed",preparing:"preparing",out_for_delivery:"out_for_delivery",delivered:"delivered"};
    try {
      const updated = await orderAPI.updateStatus(id, legacyMap[os]||"pending");
      if(!mountedRef.current) return;
      setOrders(prev=>(Array.isArray(prev)?prev:[]).map(o=>o._id===id?(updated||o):o));
      addToast?.("Order updated.","success");
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
    finally { if(mountedRef.current) setUpdating(null); }
  }

  if(loading) return <div className="loading-center"><div className="spinner"/></div>;
  const safeOrders = Array.isArray(orders) ? orders : [];

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Order #</th><th>Customer</th><th>Phone</th><th>Total</th><th>Method</th><th>Payment</th><th>Status</th><th>Update</th></tr></thead>
        <tbody>
          {safeOrders.map(o => {
            if(!o?._id) return null;
            const isExpanded = expandedOrder === o._id;
            return (
              <React.Fragment key={o._id}>
                <tr onClick={() => setExpandedOrder(isExpanded ? null : o._id)} style={{cursor:"pointer"}} className={isExpanded ? styles.expandedRow : ""}>
                  <td><code>{safeId(o._id)}</code><br/><small style={{color:"var(--brand-muted)"}}>{o.createdAt?new Date(o.createdAt).toLocaleDateString():"—"}</small></td>
                  <td>{o.customerName||"—"}<br/><small style={{color:"var(--brand-muted)"}}>{o.customerEmail||""}</small></td>
                  <td>{o.customerPhone||<em style={{color:"var(--brand-muted)"}}>—</em>}</td>
                  <td><strong>{fmt(typeof o.totalAmount==="number"?o.totalAmount:0)}</strong></td>
                  <td>{o.paymentMethod==="cash"?"💵 COD":"💳 Card"}</td>
                  <td><span className={`badge ${o.paymentStatus==="paid"?"badge-delivered":"badge-pending"}`}>{o.paymentStatus||"unknown"}</span></td>
                  <td><StatusBadge status={o.orderStatus||o.status}/></td>
                  <td onClick={e => e.stopPropagation()}>
                    <select value={o.orderStatus||"pending"} onChange={e=>handleStatus(o._id,e.target.value)} className={styles.statusSelect} disabled={updating===o._id}>
                      {ORDER_STATUSES.map(s=><option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
                    </select>
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${o._id}-detail`} className={styles.detailRow}>
                    <td colSpan={8} style={{padding:"16px 20px"}}>
                      <div className={styles.trackerWrap}>
                        <p className={styles.detailHeading}><strong>Order Progress</strong> — tap row to collapse</p>
                        <OrderTracker orderStatus={o.orderStatus || "pending"}/>
                        {o.items && o.items.length > 0 && (
                          <div className={styles.orderItemsList}>
                            <strong>Items:</strong>
                            {o.items.map((item, idx) => {
                              const rawImg = getItemImage(item);
                              const itemImg = rawImg;
                              return (
                              <div key={idx} className={styles.orderItemRow}>
                                {itemImg && <img src={itemImg} alt={item.name} style={{width:"40px",height:"40px",borderRadius:"4px",marginRight:"8px",objectFit:"cover",cursor:"pointer"}} onClick={() => setImageModal({ isOpen: true, src: itemImg, title: item.name || "Product Image" })} onError={(e) => { e.target.style.display = "none"; }} />}
                                <span>{item.quantity}x {item.name}</span>
                                <span>{fmt((typeof item.price === "number" ? item.price : 0) * (typeof item.quantity === "number" ? item.quantity : 1))}</span>
                              </div>
                            );
                          })}
                            {o.deliveryAddress && (
                              <p className={styles.deliveryAddr}><strong>Delivery address:</strong> {o.deliveryAddress}</p>
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
          {safeOrders.length===0 && <tr><td colSpan={8} style={{textAlign:"center",color:"var(--brand-muted)",padding:"32px"}}>No orders yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ── Promo management ──────────────────────────────────────────────────────────
function AdminPromos({ addToast, fmt }) {
  const [promos,   setPromos]   = useState([]);
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [form,     setForm]     = useState({
    productId: "", discountPercent: "", startDate: "", endDate: "", title: "",
    // ✅ ADDED: marketplace-level configurability fields. All optional.
    badge: "", featured: false, priority: "", displayOrder: "",
  });
  const [formErrors, setFormErrors] = useState({});
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current=true; return ()=>{mountedRef.current=false;}; }, []);

  useEffect(() => {
    Promise.all([promoAPI.getAdmin(), productAPI.getAll()])
      .then(([p, pr]) => {
        if(!mountedRef.current) return;
        setPromos(Array.isArray(p)?p:[]);
        setProducts(Array.isArray(pr)?pr:[]);
      })
      .catch(err => { if(mountedRef.current) addToast?.(err.message,"error"); })
      .finally(() => { if(mountedRef.current) setLoading(false); });
  }, [addToast]);

  function validateForm() {
    const e={};
    if(!form.productId) e.productId="Select a product";
    if(!form.discountPercent||isNaN(form.discountPercent)||Number(form.discountPercent)<1||Number(form.discountPercent)>99) e.discountPercent="Enter 1–99";
    if(!form.startDate) e.startDate="Required";
    if(!form.endDate)   e.endDate="Required";
    else if(new Date(form.endDate)<=new Date(form.startDate)) e.endDate="End must be after start";
    return e;
  }

  async function handleCreate(e) {
    e.preventDefault(); if(saving) return;
    const errs = validateForm(); if(Object.keys(errs).length){ setFormErrors(errs); return; }
    setSaving(true);
    try {
      await promoAPI.create({
        productId:       form.productId,
        discountPercent: Number(form.discountPercent),
        startDate:       new Date(form.startDate).toISOString(),
        endDate:         new Date(form.endDate).toISOString(),
        title:           form.title.trim(),
        // ✅ ADDED: marketplace-level configurability. Backend treats all four as
        // optional — omitted fields fall back to schema defaults.
        badge:           form.badge.trim() || null,
        featured:        Boolean(form.featured),
        priority:        form.priority === "" ? 0 : Number(form.priority),
        displayOrder:    form.displayOrder === "" ? 0 : Number(form.displayOrder),
      });
      if(!mountedRef.current) return;
      const updated = await promoAPI.getAdmin();
      if(mountedRef.current) setPromos(Array.isArray(updated)?updated:[]);
      setShowForm(false);
      setForm({
        productId:"", discountPercent:"", startDate:"", endDate:"", title:"",
        badge:"", featured:false, priority:"", displayOrder:"",
      });
      addToast?.("Promo created! 🎉","success");
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
    finally { if(mountedRef.current) setSaving(false); }
  }

  async function handleDelete(id) {
    if(!window.confirm("Delete this promo?")) return;
    try {
      await promoAPI.delete(id);
      if(!mountedRef.current) return;
      setPromos(prev=>(Array.isArray(prev)?prev:[]).filter(p=>p._id!==id));
      addToast?.("Promo deleted.","info");
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
  }

  async function toggleActive(promo) {
    try {
      await promoAPI.update(promo._id, { active: !promo.active });
      if(!mountedRef.current) return;
      setPromos(prev=>(Array.isArray(prev)?prev:[]).map(p=>p._id===promo._id?{...p,active:!p.active}:p));
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
  }

  const f = (key) => ({ value: form[key], onChange: (e)=>{ setForm({...form,[key]:e.target.value}); setFormErrors({...formErrors,[key]:""}); } });
  // Checkbox helper — same shape as f() but driven by e.target.checked so the
  // existing per-field error-clearing flow stays consistent.
  const fBool = (key) => ({
    checked: !!form[key],
    onChange: (e)=>{ setForm({...form,[key]:e.target.checked}); setFormErrors({...formErrors,[key]:""}); },
  });
  const safePromos = Array.isArray(promos) ? promos : [];

  return (
    <div>
      <div className={styles.toolbar}>
        <span style={{fontWeight:600}}>{safePromos.length} promo{safePromos.length!==1?"s":""}</span>
        <button className="btn btn-primary btn-sm" onClick={()=>setShowForm(v=>!v)}>{showForm?"✕ Cancel":"+ New Promo"}</button>
      </div>

      {showForm && (
        <div className={styles.formCard}>
          <h4>Create Flash Deal</h4>
          <form onSubmit={handleCreate} noValidate>
            <div className={styles.promoFormGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Product</label>
                <select {...f("productId")} className={styles.select}>
                  <option value="">— Select a product —</option>
                  {(Array.isArray(products)?products:[]).map(p=>(
                    <option key={p._id} value={p._id}>{p.name} ({fmt(p.price||0)})</option>
                  ))}
                </select>
                {formErrors.productId && <span className={styles.fieldError}>{formErrors.productId}</span>}
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Discount %</label>
                <input type="number" min="1" max="99" placeholder="e.g. 30" {...f("discountPercent")}/>
                {formErrors.discountPercent && <span className={styles.fieldError}>{formErrors.discountPercent}</span>}
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Start Date & Time</label>
                <input type="datetime-local" {...f("startDate")}/>
                {formErrors.startDate && <span className={styles.fieldError}>{formErrors.startDate}</span>}
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>End Date & Time</label>
                <input type="datetime-local" {...f("endDate")}/>
                {formErrors.endDate && <span className={styles.fieldError}>{formErrors.endDate}</span>}
              </div>
              <div className={styles.formGroup} style={{gridColumn:"span 2"}}>
                <label className={styles.label}>Promo Title (optional)</label>
                <input type="text" placeholder="e.g. Weekend Special — 30% Off" {...f("title")}/>
              </div>
              {/* ✅ ADDED: marketplace-level configurability fields (all optional). */}
              <div className={styles.formGroup}>
                <label className={styles.label}>Card Badge (optional)</label>
                <input type="text" maxLength={40} placeholder="e.g. Best Deal, Hot, Limited" {...f("badge")}/>
              </div>
              <div className={styles.formGroup} style={{display:"flex", alignItems:"center", gap:8}}>
                <input type="checkbox" id="promoFeatured" {...fBool("featured")}/>
                <label htmlFor="promoFeatured" className={styles.label} style={{margin:0}}>
                  Featured — pin to top of carousel
                </label>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Priority (optional)</label>
                <input type="number" min="0" placeholder="0 — higher = sooner" {...f("priority")}/>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Display Order (optional)</label>
                <input type="number" min="0" placeholder="0 — lower = sooner" {...f("displayOrder")}/>
              </div>
            </div>
            <div className={styles.formActions}>
              <button type="button" className="btn btn-ghost" onClick={()=>{
                setShowForm(false);
                setFormErrors({});
                setForm({
                  productId:"", discountPercent:"", startDate:"", endDate:"", title:"",
                  badge:"", featured:false, priority:"", displayOrder:"",
                });
              }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving?"Creating…":"Create Promo"}</button>
            </div>
          </form>
        </div>
      )}

      {loading ? <div className="loading-center"><div className="spinner"/></div> : (
        <div className="table-wrap" style={{marginTop:8}}>
          <table className="data-table">
            <thead><tr><th>Product</th><th>Discount</th><th>Original</th><th>Sale Price</th><th>Start</th><th>End</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {safePromos.map(promo => {
                if(!promo?._id) return null;
                const product  = promo.productId;
                const now      = new Date();
                const start    = new Date(promo.startDate);
                const end      = new Date(promo.endDate);
                const isLive   = promo.active && start <= now && end > now;
                const isFuture = promo.active && start > now;
                const original = typeof product?.price === "number" ? product.price : 0;
                const sale     = parseFloat((original * (1 - (promo.discountPercent||0)/100)).toFixed(2));

                return (
                  <tr key={promo._id}>
                    <td><strong>{product?.name||"—"}</strong></td>
                    <td><span style={{fontWeight:700,color:"var(--brand-primary)"}}>{promo.discountPercent}%</span></td>
                    <td>{fmt(original)}</td>
                    <td><strong>{fmt(sale)}</strong></td>
                    <td style={{fontSize:"0.78rem"}}>{start.toLocaleString()}</td>
                    <td style={{fontSize:"0.78rem"}}>{end.toLocaleString()}</td>
                    <td>
                      {!promo.active ? <span className="badge badge-pending">Inactive</span>
                        : isLive     ? <span className="badge badge-delivered">🔴 Live</span>
                        : isFuture   ? <span className="badge badge-preparing">Scheduled</span>
                        :              <span className="badge badge-pending">Expired</span>
                      }
                    </td>
                    <td>
                      <div className={styles.actionBtns}>
                        <button className={`btn btn-sm ${promo.active?"btn-secondary":"btn-primary"}`} onClick={()=>toggleActive(promo)}>
                          {promo.active?"Pause":"Activate"}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={()=>handleDelete(promo._id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {safePromos.length===0 && <tr><td colSpan={8} style={{textAlign:"center",color:"var(--brand-muted)",padding:"32px"}}>No promos yet. Create your first flash deal!</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────── */
/* WALLET TAB                                 */
/* ───────────────────────────────────────── */
function AdminWallet({ addToast, fmt }) {
  const [analytics, setAnalytics] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [actionLoading, setActionLoading] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchAnalytics = useCallback(() => {
    adminWalletAPI.getAnalytics()
      .then((data) => { if (mountedRef.current) setAnalytics(data); })
      .catch((err) => { if (mountedRef.current) addToast?.(err.message, "error"); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [addToast]);

  const fetchWithdrawals = useCallback(() => {
    adminWalletAPI.getWithdrawals({ status: filter, limit: 50 })
      .then((data) => { if (mountedRef.current) setWithdrawals(data.withdrawals || []); })
      .catch((err) => { if (mountedRef.current) addToast?.(err.message, "error"); });
  }, [filter, addToast]);

  useEffect(() => {
    fetchAnalytics();
    fetchWithdrawals();
  }, [fetchAnalytics, fetchWithdrawals]);

  const handleApprove = async (id) => {
    setActionLoading(id);
    try {
      await adminWalletAPI.approveWithdrawal(id);
      addToast?.("Withdrawal approved successfully!", "success");
      fetchAnalytics();
      fetchWithdrawals();
    } catch (err) {
      addToast?.(err.message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id) => {
    const reason = prompt("Enter rejection reason:");
    if (!reason) return;
    setActionLoading(id);
    try {
      await adminWalletAPI.rejectWithdrawal(id, reason);
      addToast?.("Withdrawal rejected", "success");
      fetchAnalytics();
      fetchWithdrawals();
    } catch (err) {
      addToast?.(err.message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <div className="loading-center"><div className="spinner" /></div>;
  }

  return (
    <div className={styles.walletContainer}>
      {/* Online Earnings Section */}
      <h3 className={styles.walletSectionTitle}>Online Payment Earnings</h3>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Available</span>
          <span className={styles.statValue}>{fmt(analytics?.totalAvailableBalance || 0)}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Pending</span>
          <span className={styles.statValue}>{fmt(analytics?.totalPendingBalance || 0)}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Online Earnings</span>
          <span className={styles.statValue}>{fmt(analytics?.totalOnlineEarnings || 0)}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Withdrawn</span>
          <span className={styles.statValue}>{fmt(analytics?.totalWithdrawn || 0)}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Platform Commission</span>
          <span className={styles.statValue}>{fmt(analytics?.totalCommissionPaid || 0)}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Pending Withdrawals</span>
          <span className={styles.statValue}>{analytics?.pendingWithdrawals || 0}</span>
          <span className={styles.statSub}>{fmt(analytics?.pendingWithdrawalAmount || 0)}</span>
        </div>
      </div>

      {/* COD Sales Section */}
      <h3 className={styles.walletSectionTitle}>Cash On Delivery (COD) Sales</h3>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total COD Sales</span>
          <span className={styles.statValue} style={{color:"#059669"}}>{fmt(analytics?.totalCODSales || 0)}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Commission Owed</span>
          <span className={styles.statValue} style={{color:"#dc2626"}}>{fmt(analytics?.totalCommissionOwed || 0)}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Commission Paid</span>
          <span className={styles.statValue}>{fmt(analytics?.totalCommissionPaidByVendors || 0)}</span>
        </div>
      </div>

      {/* Settings Summary */}
      <div className={styles.settingsCard}>
        <h4>Wallet Settings</h4>
        <div className={styles.settingsGrid}>
          <div><span>Global Commission:</span> <strong>{analytics?.settings?.globalCommission}%</strong></div>
          <div><span>Holding Period:</span> <strong>{analytics?.settings?.defaultHoldingPeriod} days</strong></div>
          <div><span>Min Withdrawal:</span> <strong>{fmt(analytics?.settings?.minWithdrawal)}</strong></div>
          <div><span>Max Withdrawal:</span> <strong>{fmt(analytics?.settings?.maxWithdrawal)}</strong></div>
          <div><span>Withdrawal Fee:</span> <strong>{analytics?.settings?.withdrawalFee}%</strong></div>
          <div><span>Active Vendors:</span> <strong>{analytics?.totalVendors}</strong></div>
        </div>
      </div>

      {/* Withdrawal Requests */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>Withdrawal Requests</h3>
          <div className={styles.filterBtns}>
            {["pending", "approved", "rejected", "completed"].map((s) => (
              <button key={s} className={`${styles.filterBtn} ${filter === s ? styles.filterBtnActive : ""}`} onClick={() => setFilter(s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Fee</th>
                <th>Net</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((wd) => (
                <tr key={wd._id}>
                  <td>
                    <div>{wd.vendorId?.name || "—"}</div>
                    <div style={{fontSize:"0.75rem",color:"var(--brand-muted)"}}>{wd.vendorId?.storeName}</div>
                  </td>
                  <td style={{textTransform:"capitalize"}}>{wd.method?.replace("_", " ")}</td>
                  <td><strong>{fmt(wd.amount)}</strong></td>
                  <td>{fmt(wd.fee)}</td>
                  <td><strong style={{color:"var(--brand-primary)"}}>{fmt(wd.netAmount)}</strong></td>
                  <td style={{fontSize:"0.8rem"}}>{new Date(wd.createdAt).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge badge-${wd.status === "pending" ? "preparing" : wd.status === "approved" || wd.status === "completed" ? "delivered" : "pending"}`}>
                      {wd.status}
                    </span>
                  </td>
                  <td>
                    {wd.status === "pending" && (
                      <div className={styles.actionBtns}>
                        <button className="btn btn-primary btn-sm" onClick={() => handleApprove(wd._id)} disabled={actionLoading === wd._id}>
                          Approve
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleReject(wd._id)} disabled={actionLoading === wd._id}>
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {withdrawals.length === 0 && (
                <tr><td colSpan={8} style={{textAlign:"center",padding:"32px",color:"var(--brand-muted)"}}>No withdrawals found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Restaurants ─────────────────────────────────────────────────────────────────
function AdminRestaurants({ addToast, fmt }) {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [actionLoading, setActionLoading] = useState(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current=true; return ()=>{mountedRef.current=false;}; }, []);

  useEffect(() => {
    fetchRestaurants();
  }, [filter]);

  async function fetchRestaurants() {
    setLoading(true);
    try {
      const filterParam = filter === "all" ? "" : filter;
      const data = await adminAPI.getVendors(filterParam ? { status: filterParam, vendorType: "restaurant" } : { vendorType: "restaurant" });
      if (mountedRef.current) setRestaurants(data || []);
    } catch (err) {
      console.error("[AdminRestaurants] Error:", err.message);
      addToast("Failed to load restaurants", "error");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function handleApprove(id) {
    setActionLoading(id);
    try {
      await adminAPI.approveVendor(id);
      addToast("Restaurant approved!", "success");
      fetchRestaurants();
    } catch (err) {
      addToast(err.message || "Failed to approve", "error");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(id) {
    const reason = prompt("Rejection reason:");
    if (!reason) return;
    setActionLoading(id);
    try {
      await adminAPI.rejectVendor(id, reason);
      addToast("Restaurant rejected", "success");
      fetchRestaurants();
    } catch (err) {
      addToast(err.message || "Failed to reject", "error");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSuspend(id) {
    if (!confirm("Suspend this restaurant?")) return;
    setActionLoading(id);
    try {
      await adminAPI.suspendVendor(id);
      addToast("Restaurant suspended", "success");
      fetchRestaurants();
    } catch (err) {
      addToast(err.message || "Failed to suspend", "error");
    } finally {
      setActionLoading(null);
    }
  }

  const safeRestaurants = Array.isArray(restaurants) ? restaurants : [];
  const pendingCount = safeRestaurants.filter(r => r.vendorStatus === "pending").length;
  const approvedCount = safeRestaurants.filter(r => r.vendorStatus === "approved").length;
  const suspendedCount = safeRestaurants.filter(r => r.vendorStatus === "suspended").length;

  return (
    <div>
      <div style={{marginBottom:16,display:"flex",gap:8,flexWrap:"wrap"}}>
        <button className={`btn ${filter==="pending"?"btn-primary":"btn-ghost"}`} onClick={()=>setFilter("pending")}>
          ⏳ Pending ({pendingCount})
        </button>
        <button className={`btn ${filter==="approved"?"btn-primary":"btn-ghost"}`} onClick={()=>setFilter("approved")}>
          ✅ Approved ({approvedCount})
        </button>
        <button className={`btn ${filter==="suspended"?"btn-primary":"btn-ghost"}`} onClick={()=>setFilter("suspended")}>
          ⛔ Suspended ({suspendedCount})
        </button>
        <button className={`btn ${filter==="all"?"btn-primary":"btn-ghost"}`} onClick={()=>setFilter("all")}>
          📋 All ({safeRestaurants.length})
        </button>
      </div>

      {loading ? <div className="loading-center"><div className="spinner"/></div> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Restaurant</th>
                <th>Owner</th>
                <th>Location</th>
                <th>Cuisine</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {safeRestaurants.map(r => {
                if (!r?._id) return null;
                return (
                  <tr key={r._id}>
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        {r.storeLogo && <img src={getImageUrl(r.storeLogo)} alt="" style={{width:40,height:40,borderRadius:8,objectFit:"cover"}}/>}
                        <div>
                          <div style={{fontWeight:600}}>{r.restaurantDetails?.restaurantName || r.storeName}</div>
                          <div style={{fontSize:"0.8rem",color:"var(--brand-muted)"}}>{r.restaurantDetails?.cuisineType}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div>{r.name}</div>
                      <div style={{fontSize:"0.8rem",color:"var(--brand-muted)"}}>{r.email}</div>
                    </td>
                    <td>
                      {r.location?.city && r.location?.region ? (
                        <div>{r.location.city}, {r.location.region}</div>
                      ) : (
                        <span style={{color:"var(--brand-muted)"}}>Not set</span>
                      )}
                    </td>
                    <td>{r.restaurantDetails?.cuisineType || "-"}</td>
                    <td>
                      <span className={`badge badge-${r.vendorStatus==="approved"?"delivered":r.vendorStatus==="suspended"?"pending":"preparing"}`}>
                        {r.vendorStatus}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actionBtns}>
                        {r.vendorStatus === "pending" && (
                          <>
                            <button className="btn btn-primary btn-sm" onClick={() => handleApprove(r._id)} disabled={actionLoading === r._id}>
                              Approve
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleReject(r._id)} disabled={actionLoading === r._id}>
                              Reject
                            </button>
                          </>
                        )}
                        {r.vendorStatus === "approved" && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleSuspend(r._id)} disabled={actionLoading === r._id}>
                            Suspend
                          </button>
                        )}
                        {r.vendorStatus === "suspended" && (
                          <button className="btn btn-primary btn-sm" onClick={() => handleApprove(r._id)} disabled={actionLoading === r._id}>
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {safeRestaurants.length === 0 && (
                <tr><td colSpan={6} style={{textAlign:"center",padding:"32px",color:"var(--brand-muted)"}}>No restaurants found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── CATEGORIES TAB ────────────────────────────────────────────────────────
   Admins review vendor-submitted category requests. Approving a request
   makes the new name appear in the vendor dropdown immediately (merged into
   GET /api/products/categories on the server).
   ─────────────────────────────────────────────────────────────────────────── */
function AdminCategories({ addToast, fmt: _fmt }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [statusFilter, setStatusFilter] = useState("pending"); // "pending" | "approved" | "rejected" | "all"
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    try {
      const params = statusFilter === "all" ? {} : { status: statusFilter };
      const data = await categoryAPI.getAll(params);
      if (mountedRef.current) setRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      if (mountedRef.current) addToast?.(err?.message || "Failed to load category requests", "error");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [statusFilter, addToast]);

  useEffect(() => { load(); }, [load]);

  const handleReview = async (id, action) => {
    if (actionLoading) return;
    setActionLoading(id);
    try {
      await categoryAPI.review(id, action);
      if (!mountedRef.current) return;
      addToast?.(action === "approve" ? "Category approved" : "Category rejected", "success");
      // Remove the row from the local list (matches the new filter view).
      setRequests((prev) => (Array.isArray(prev) ? prev : []).filter((r) => r._id !== id));
    } catch (err) {
      if (mountedRef.current) addToast?.(err?.message || `Failed to ${action}`, "error");
    } finally {
      if (mountedRef.current) setActionLoading(null);
    }
  };

  const safeRequests = Array.isArray(requests) ? requests : [];

  // Lightweight badge styling — keep parity with AdminPromos table.
  const statusBadge = (status) => {
    if (status === "pending")  return <span className="badge badge-preparing">Pending</span>;
    if (status === "approved") return <span className="badge badge-delivered">✓ Approved</span>;
    if (status === "rejected") return <span className="badge badge-pending">✗ Rejected</span>;
    return status;
  };

  return (
    <div>
      <div className={styles.toolbar}>
        <span style={{ fontWeight: 600 }}>
          {safeRequests.length} request{safeRequests.length !== 1 ? "s" : ""}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {["pending", "approved", "rejected", "all"].map((s) => (
            <button
              key={s}
              className={`btn btn-sm ${statusFilter === s ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setStatusFilter(s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Category Name</th>
                <th>Requested By</th>
                <th>Note</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {safeRequests.map((r) => (
                <tr key={r._id}>
                  <td>
                    <strong style={{ fontSize: "0.95rem" }}>{r.name}</strong>
                  </td>
                  <td>{r.requestedBy?.name || r.requestedBy?.email || "—"}</td>
                  <td style={{ color: "var(--brand-muted)", maxWidth: 280 }}>
                    {r.note ? r.note : <span style={{ opacity: 0.6 }}>—</span>}
                  </td>
                  <td>{statusBadge(r.status)}</td>
                  <td style={{ fontSize: "0.78rem" }}>
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}
                  </td>
                  <td>
                    {r.status === "pending" ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleReview(r._id, "approve")}
                          disabled={actionLoading === r._id}
                        >
                          ✓ Approve
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleReview(r._id, "reject")}
                          disabled={actionLoading === r._id}
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: "var(--brand-muted)", fontSize: "0.78rem" }}>
                        {r.reviewedAt
                          ? `by ${r.reviewedBy?.name || r.reviewedBy?.email || "admin"} · ${new Date(r.reviewedAt).toLocaleDateString()}`
                          : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {safeRequests.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "var(--brand-muted)" }}>
                    No category requests {statusFilter === "all" ? "" : `with status "${statusFilter}"`}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   TASK 7 — AdminSections
   Admin-curated blocks on the homepage. Mirrors AdminPromos' pattern:
   toolbar (count + "+ New Section"), collapsible form card, data table
   with reordering arrows + actions.
   ────────────────────────────────────────────────────────────────────────── */

const SOURCE_TYPES = [
  { value: "automatic", label: "Automatic" },
  { value: "manual",    label: "Manual (pick products)" },
  { value: "category",  label: "By category" },
  { value: "vendor",    label: "By vendor" },
  { value: "featured",  label: "Featured" },
  { value: "promo",     label: "Active promos" },
];

const AUTOMATIC_TYPES = [
  { value: "best_sellers",     label: "Best Sellers" },
  { value: "new_arrivals",     label: "New Arrivals" },
  { value: "recently_added",   label: "Recently Added" },
  { value: "most_viewed",      label: "Most Viewed" },
  { value: "trending",         label: "Trending" },
  { value: "most_purchased",   label: "Most Purchased" },
  { value: "discounted",       label: "Discounted" },
  { value: "featured",         label: "Featured" },
  { value: "highest_rated",    label: "Highest Rated" },
];

const LAYOUTS = [
  { value: "grid",     label: "Grid" },
  { value: "carousel", label: "Carousel" },
  { value: "featured", label: "Featured (1 large + grid)" },
  { value: "mixed",    label: "Mixed (carousel + grid)" },
];

function AdminSections({ addToast }) {
  const [sections, setSections] = useState([]);
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptySectionForm());
  const [formErrors, setFormErrors] = useState({});
  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPreview, setBannerPreview] = useState(null);
  const [deleteBanner, setDeleteBanner] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  function emptySectionForm() {
    return {
      title: "",
      subtitle: "",
      icon: "",
      layout: "grid",
      displayOrder: 0,
      active: true,
      maxProducts: 12,
      showSeeAll: true,
      startDate: "",
      endDate: "",
      source: { type: "automatic", automaticType: "best_sellers" },
    };
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      homepageSectionAPI.getAdmin(),
      productAPI.getCategories(),
      // Vendors — use the existing vendorAPI helper (handles base URL,
      // auth header, and JSON parsing the same way as the rest of the app).
      vendorAPI.getList({ limit: 200 }).catch(() => []),
    ])
      .then(([secs, cats, vlist]) => {
        if (cancelled || !mountedRef.current) return;
        setSections(Array.isArray(secs) ? secs : []);
        setCategories(Array.isArray(cats) ? cats : []);
        setVendors(Array.isArray(vlist) ? vlist : []);
      })
      .catch((err) => {
        if (mountedRef.current) addToast?.(err.message || "Failed to load sections", "error");
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [addToast]);

  function openCreate() {
    setEditingId(null);
    setForm(emptySectionForm());
    setFormErrors({});
    setBannerFile(null);
    setBannerPreview(null);
    setDeleteBanner(false);
    setShowForm(true);
  }

  function openEdit(section) {
    setEditingId(section._id);
    setForm({
      title: section.title || "",
      subtitle: section.subtitle || "",
      icon: section.icon || "",
      layout: section.layout || "grid",
      displayOrder: section.displayOrder ?? 0,
      active: section.active !== false,
      maxProducts: section.maxProducts ?? 12,
      showSeeAll: section.showSeeAll !== false,
      startDate: section.startDate ? toLocalInput(section.startDate) : "",
      endDate: section.endDate ? toLocalInput(section.endDate) : "",
      source: {
        type: section.source?.type || "automatic",
        manualProductIds: section.source?.manualProductIds || [],
        categories: section.source?.categories || [],
        vendorIds: section.source?.vendorIds || [],
        automaticType: section.source?.automaticType || "best_sellers",
      },
    });
    setFormErrors({});
    setBannerFile(null);
    setBannerPreview(section.bannerImage?.url || null);
    setDeleteBanner(false);
    setShowForm(true);
  }

  function validate() {
    const e = {};
    if (!form.title.trim()) e.title = "Title is required";
    if (!form.source?.type) e.sourceType = "Source type is required";
    if (form.source?.type === "automatic" && !form.source.automaticType) {
      e.automaticType = "Pick an automatic collection";
    }
    if (form.source?.type === "manual" && (!form.source.manualProductIds || form.source.manualProductIds.length === 0)) {
      e.manualProductIds = "Add at least one product";
    }
    if (form.source?.type === "category" && (!form.source.categories || form.source.categories.length === 0)) {
      e.categories = "Pick at least one category";
    }
    if (form.source?.type === "vendor" && (!form.source.vendorIds || form.source.vendorIds.length === 0)) {
      e.vendorIds = "Pick at least one vendor";
    }
    if (form.endDate && form.startDate && new Date(form.endDate) <= new Date(form.startDate)) {
      e.endDate = "End must be after start";
    }
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    const errs = validate();
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        subtitle: form.subtitle.trim(),
        icon: form.icon.trim(),
        layout: form.layout,
        displayOrder: Number(form.displayOrder) || 0,
        active: !!form.active,
        maxProducts: Math.min(Math.max(Number(form.maxProducts) || 12, 1), 100),
        showSeeAll: !!form.showSeeAll,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        source: form.source,
      };
      if (editingId) {
        await homepageSectionAPI.update(editingId, payload, bannerFile, deleteBanner);
        addToast?.("Section updated.", "success");
      } else {
        await homepageSectionAPI.create(payload, bannerFile);
        addToast?.("Section created! 🎉", "success");
      }
      if (!mountedRef.current) return;
      const updated = await homepageSectionAPI.getAdmin();
      if (mountedRef.current) setSections(Array.isArray(updated) ? updated : []);
      setShowForm(false);
    } catch (err) {
      if (mountedRef.current) addToast?.(err.message || "Failed to save", "error");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this section?")) return;
    try {
      await homepageSectionAPI.remove(id);
      if (!mountedRef.current) return;
      setSections((prev) => (Array.isArray(prev) ? prev : []).filter((s) => s._id !== id));
      addToast?.("Section deleted.", "info");
    } catch (err) {
      if (mountedRef.current) addToast?.(err.message, "error");
    }
  }

  async function toggleActive(section) {
    try {
      await homepageSectionAPI.update(section._id, { active: !section.active });
      if (!mountedRef.current) return;
      setSections((prev) => (Array.isArray(prev) ? prev : []).map((s) => s._id === section._id ? { ...s, active: !s.active } : s));
    } catch (err) {
      if (mountedRef.current) addToast?.(err.message, "error");
    }
  }

  async function moveSection(idx, dir) {
    const safe = Array.isArray(sections) ? [...sections] : [];
    const target = idx + dir;
    if (target < 0 || target >= safe.length) return;
    const [a, b] = [safe[idx], safe[target]];
    safe[idx] = b; safe[target] = a;
    setSections(safe);
    try {
      await homepageSectionAPI.reorder(safe.map((s) => s._id));
    } catch (err) {
      if (mountedRef.current) addToast?.(err.message || "Failed to reorder", "error");
    }
  }

  function onBannerChange(file) {
    setBannerFile(file || null);
    setBannerPreview(file ? URL.createObjectURL(file) : null);
    setDeleteBanner(false);
  }

  function clearBanner() {
    setBannerFile(null);
    setBannerPreview(null);
    setDeleteBanner(true);
  }

  function updateSource(patch) {
    setForm((prev) => ({ ...prev, source: { ...prev.source, ...patch } }));
    setFormErrors((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(patch).map((k) => [k, ""])) }));
  }

  function toggleCategory(cat) {
    const list = form.source.categories || [];
    const next = list.includes(cat) ? list.filter((c) => c !== cat) : [...list, cat];
    updateSource({ categories: next });
  }

  function toggleVendor(vid) {
    const list = form.source.vendorIds || [];
    const next = list.includes(vid) ? list.filter((v) => v !== vid) : [...list, vid];
    updateSource({ vendorIds: next });
  }

  const safeSections = Array.isArray(sections) ? sections : [];
  const f = (key) => ({
    value: form[key] ?? "",
    onChange: (e) => {
      setForm({ ...form, [key]: e.target.value });
      setFormErrors({ ...formErrors, [key]: "" });
    },
  });
  const fBool = (key) => ({
    checked: !!form[key],
    onChange: (e) => {
      setForm({ ...form, [key]: e.target.checked });
      setFormErrors({ ...formErrors, [key]: "" });
    },
  });
  const fNum = (key) => ({
    value: form[key] ?? "",
    onChange: (e) => {
      setForm({ ...form, [key]: e.target.value === "" ? "" : Number(e.target.value) });
      setFormErrors({ ...formErrors, [key]: "" });
    },
  });

  return (
    <div>
      <div className={styles.toolbar}>
        <span style={{ fontWeight: 600 }}>
          {safeSections.length} section{safeSections.length !== 1 ? "s" : ""}
        </span>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          {showForm ? "✕ Cancel" : "+ New Section"}
        </button>
      </div>

      {showForm && (
        <div className={styles.formCard}>
          <h4>{editingId ? "Edit Section" : "Create Homepage Section"}</h4>
          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.promoFormGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Title *</label>
                <input type="text" maxLength={120} {...f("title")} />
                {formErrors.title && <span className={styles.fieldError}>{formErrors.title}</span>}
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Icon (emoji or short text)</label>
                <input type="text" maxLength={16} placeholder="🔥" {...f("icon")} />
              </div>
              <div className={styles.formGroup} style={{ gridColumn: "span 2" }}>
                <label className={styles.label}>Subtitle</label>
                <input type="text" maxLength={240} {...f("subtitle")} />
              </div>

              {/* Banner */}
              <div className={styles.formGroup} style={{ gridColumn: "span 2" }}>
                <label className={styles.label}>Banner image (optional)</label>
                <ImageUpload value={bannerPreview} onChange={(dataUrl) => {
                  // ImageUpload returns base64 — but our backend takes a real file.
                  // Convert the dataUrl back to a File so we can upload it.
                  if (!dataUrl) { onBannerChange(null); return; }
                  fetch(dataUrl).then((r) => r.blob()).then((blob) => {
                    const file = new File([blob], "banner.png", { type: blob.type || "image/png" });
                    onBannerChange(file);
                  });
                }} />
                {editingId && (bannerPreview || sectionHasBanner(sections, editingId)) && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={clearBanner} style={{ marginTop: 8 }}>
                    Remove current banner
                  </button>
                )}
              </div>

              {/* Layout + display order */}
              <div className={styles.formGroup}>
                <label className={styles.label}>Layout</label>
                <select {...f("layout")} className={styles.select}>
                  {LAYOUTS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Display order (lower = sooner)</label>
                <input type="number" min="0" {...fNum("displayOrder")} />
              </div>

              {/* Source type */}
              <div className={styles.formGroup} style={{ gridColumn: "span 2" }}>
                <label className={styles.label}>Source *</label>
                <div className={styles.sourceRow}>
                  {SOURCE_TYPES.map((t) => (
                    <label
                      key={t.value}
                      className={`${styles.sourceChip} ${form.source.type === t.value ? styles.sourceChipActive : ""}`}
                    >
                      <input
                        type="radio"
                        name="sourceType"
                        checked={form.source.type === t.value}
                        onChange={() => updateSource({ type: t.value })}
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
                {formErrors.sourceType && <span className={styles.fieldError}>{formErrors.sourceType}</span>}
              </div>

              {/* Conditional fields per source type */}
              {form.source.type === "automatic" && (
                <div className={styles.formGroup} style={{ gridColumn: "span 2" }}>
                  <label className={styles.label}>Collection</label>
                  <select
                    value={form.source.automaticType}
                    onChange={(e) => updateSource({ automaticType: e.target.value })}
                    className={styles.select}
                  >
                    {AUTOMATIC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  {formErrors.automaticType && <span className={styles.fieldError}>{formErrors.automaticType}</span>}
                </div>
              )}

              {form.source.type === "manual" && (
                <div className={styles.formGroup} style={{ gridColumn: "span 2" }}>
                  <label className={styles.label}>Pick products</label>
                  <ProductMultiPicker
                    value={form.source.manualProductIds}
                    onChange={(ids) => updateSource({ manualProductIds: ids })}
                    maxSelected={50}
                  />
                  {formErrors.manualProductIds && <span className={styles.fieldError}>{formErrors.manualProductIds}</span>}
                </div>
              )}

              {form.source.type === "category" && (
                <div className={styles.formGroup} style={{ gridColumn: "span 2" }}>
                  <label className={styles.label}>Categories</label>
                  <div className={styles.sourceRow}>
                    {(Array.isArray(categories) ? categories : []).map((cat) => (
                      <label
                        key={cat}
                        className={`${styles.sourceChip} ${(form.source.categories || []).includes(cat) ? styles.sourceChipActive : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={(form.source.categories || []).includes(cat)}
                          onChange={() => toggleCategory(cat)}
                        />
                        {cat}
                      </label>
                    ))}
                  </div>
                  {formErrors.categories && <span className={styles.fieldError}>{formErrors.categories}</span>}
                </div>
              )}

              {form.source.type === "vendor" && (
                <div className={styles.formGroup} style={{ gridColumn: "span 2" }}>
                  <label className={styles.label}>Vendors</label>
                  <div className={styles.sourceRow}>
                    {(Array.isArray(vendors) ? vendors : []).map((v) => (
                      <label
                        key={v._id}
                        className={`${styles.sourceChip} ${(form.source.vendorIds || []).includes(v._id) ? styles.sourceChipActive : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={(form.source.vendorIds || []).includes(v._id)}
                          onChange={() => toggleVendor(v._id)}
                        />
                        {v.storeName || v.name || "Vendor"}
                      </label>
                    ))}
                  </div>
                  {formErrors.vendorIds && <span className={styles.fieldError}>{formErrors.vendorIds}</span>}
                </div>
              )}

              {/* Limits + scheduling */}
              <div className={styles.formGroup}>
                <label className={styles.label}>Max products</label>
                <input type="number" min="1" max="100" {...fNum("maxProducts")} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Show "See All"</label>
                <div style={{ paddingTop: 8 }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" {...fBool("showSeeAll")} />
                    Show button on the section
                  </label>
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Start (optional)</label>
                <input type="datetime-local" {...f("startDate")} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>End (optional)</label>
                <input type="datetime-local" {...f("endDate")} />
                {formErrors.endDate && <span className={styles.fieldError}>{formErrors.endDate}</span>}
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Active</label>
                <div style={{ paddingTop: 8 }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" {...fBool("active")} />
                    Visible on the homepage
                  </label>
                </div>
              </div>
            </div>
            <div className={styles.formActions}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save Changes" : "Create Section"}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 70 }}>Order</th>
                <th>Title</th>
                <th>Source</th>
                <th>Layout</th>
                <th>Max</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {safeSections.map((section, idx) => (
                <tr key={section._id}>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        type="button"
                        className={styles.reorderBtn}
                        onClick={() => moveSection(idx, -1)}
                        disabled={idx === 0}
                        title="Move up"
                      >↑</button>
                      <button
                        type="button"
                        className={styles.reorderBtn}
                        onClick={() => moveSection(idx, 1)}
                        disabled={idx === safeSections.length - 1}
                        title="Move down"
                      >↓</button>
                    </div>
                  </td>
                  <td>
                    <strong>{section.icon ? `${section.icon} ` : ""}{section.title}</strong>
                    {section.subtitle && (
                      <div style={{ fontSize: "0.78rem", color: "var(--brand-muted)" }}>
                        {section.subtitle.length > 60 ? section.subtitle.slice(0, 60) + "…" : section.subtitle}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`${styles.sourceBadge} ${styles[`sourceBadge${capitalize(section.source?.type || "")}`]}`}>
                      {capitalize(section.source?.type || "")}
                      {section.source?.type === "automatic" && ` · ${labelFor(AUTOMATIC_TYPES, section.source.automaticType)}`}
                    </span>
                  </td>
                  <td style={{ textTransform: "capitalize" }}>{section.layout || "grid"}</td>
                  <td>{section.maxProducts ?? 12}</td>
                  <td>
                    {!section.active ? (
                      <span className="badge badge-pending">Inactive</span>
                    ) : !isVisible(section) ? (
                      <span className="badge badge-preparing">Scheduled</span>
                    ) : (
                      <span className="badge badge-delivered">Live</span>
                    )}
                  </td>
                  <td>
                    <div className={styles.actionBtns}>
                      <button className="btn btn-sm btn-secondary" onClick={() => openEdit(section)}>Edit</button>
                      <button className={`btn btn-sm ${section.active ? "btn-secondary" : "btn-primary"}`} onClick={() => toggleActive(section)}>
                        {section.active ? "Pause" : "Activate"}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(section._id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {safeSections.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "var(--brand-muted)" }}>
                    No homepage sections yet. Click "+ New Section" to add your first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function sectionHasBanner(sections, id) {
  const s = (sections || []).find((x) => x._id === id);
  return !!(s && s.bannerImage && s.bannerImage.url);
}

function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function labelFor(list, value) {
  const m = list.find((x) => x.value === value);
  return m ? m.label : value;
}

function isVisible(section) {
  if (!section || section.active === false) return false;
  const now = new Date();
  if (section.startDate && now < new Date(section.startDate)) return false;
  if (section.endDate && now > new Date(section.endDate)) return false;
  return true;
}

function toLocalInput(date) {
  // Convert ISO/Date → "YYYY-MM-DDTHH:MM" for datetime-local inputs.
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Admin Commissions & Payouts ──────────────────────────────────────────────
// Per-vendor financial control center.
//
// Renders:
//   • 9 stat cards fed by /admin/wallet/commissions/analytics
//   • Filter bar (vendor type, status, date range, search)
//   • 16-column per-vendor table fed by /admin/wallet/commissions/vendors
//   • Detail drawer (slide-in) for any vendor, with 7 sub-tabs:
//       Business, Wallet Balance, Commission, Withdrawals,
//       Commission Payments, Recent Orders, Recent Transactions, Paystack Refs
//   • Approve / Reject withdrawal handlers — gated on the BUSINESS RULE
//     "vendor cannot be paid while outstandingCommission > 0".
//   • Socket-based real-time refresh on admin-notification events.
//
// All endpoints are admin-only GETs in backend/routes/admin-wallet.js. The
// existing wallet.service.js approveWithdrawal is intentionally NOT modified
// — the new page enforces the rule at the UI layer only so the original
// AdminWallet tab continues to work exactly as before.
function AdminCommissions({ addToast, fmt }) {
  const fmtMoney = fmt || ((n) => `GHS ${(Number(n) || 0).toFixed(2)}`);
  const formatDate = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };
  const formatDateTime = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  // Filters
  const [vendorType, setVendorType] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  // Data
  const [analytics, setAnalytics] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Drawer state
  const [drawerVendor, setDrawerVendor] = useState(null);
  const [drawerDetail, setDrawerDetail] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerTab, setDrawerTab] = useState("business");
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch analytics + vendor list together
  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const opts = { vendorType, status: statusFilter };
      if (debouncedSearch) opts.search = debouncedSearch;
      if (dateFrom) opts.dateFrom = dateFrom;
      if (dateTo) opts.dateTo = dateTo;
      const [a, v] = await Promise.all([
        adminWalletAPI.getCommissionAnalytics(),
        adminWalletAPI.getCommissionVendors(opts),
      ]);
      if (!mountedRef.current) return;
      setAnalytics(a || {});
      setVendors(Array.isArray(v?.vendors) ? v.vendors : []);
    } catch (e) {
      addToast?.(`Failed to load commissions: ${e?.message || e}`, "error");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [vendorType, statusFilter, debouncedSearch, dateFrom, dateTo, addToast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Socket-based real-time refresh on admin notifications
  useEffect(() => {
    const handler = (e) => {
      const t = e?.detail?.type || e?.detail?.notification?.type;
      if (
        t === "commission_paid" ||
        t === "withdrawal_submitted" ||
        t === "withdrawal_approved" ||
        t === "withdrawal_rejected" ||
        t === "withdrawal_completed"
      ) {
        fetchAll(true);
      }
    };
    window.addEventListener("admin-notification", handler);
    return () => window.removeEventListener("admin-notification", handler);
  }, [fetchAll]);

  // Drawer fetcher
  const openDrawer = useCallback(async (v) => {
    setDrawerVendor(v);
    setDrawerDetail(null);
    setDrawerLoading(true);
    setDrawerTab("business");
    setRejectTarget(null);
    setRejectReason("");
    try {
      const detail = await adminWalletAPI.getCommissionVendor(v.vendorId);
      if (!mountedRef.current) return;
      setDrawerDetail(detail || null);
    } catch (e) {
      addToast?.(`Failed to load vendor detail: ${e?.message || e}`, "error");
    } finally {
      if (mountedRef.current) setDrawerLoading(false);
    }
  }, [addToast]);

  const closeDrawer = useCallback(() => {
    setDrawerVendor(null);
    setDrawerDetail(null);
    setDrawerTab("business");
    setRejectTarget(null);
    setRejectReason("");
  }, []);

  // Approve / reject handlers
  const handleApprove = useCallback(async (withdrawalId) => {
    try {
      await adminWalletAPI.approveWithdrawal(withdrawalId);
      addToast?.("Withdrawal approved — vendor notified.", "success");
      // Re-fetch drawer detail + list
      if (drawerVendor) {
        const detail = await adminWalletAPI.getCommissionVendor(drawerVendor.vendorId);
        if (mountedRef.current) setDrawerDetail(detail || null);
      }
      fetchAll(true);
    } catch (e) {
      addToast?.(`Approval failed: ${e?.message || e}`, "error");
    }
  }, [addToast, drawerVendor, fetchAll]);

  const handleReject = useCallback(async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      addToast?.("Rejection reason is required.", "error");
      return;
    }
    try {
      await adminWalletAPI.rejectWithdrawal(rejectTarget, rejectReason.trim());
      addToast?.("Withdrawal rejected — vendor notified.", "success");
      setRejectTarget(null);
      setRejectReason("");
      if (drawerVendor) {
        const detail = await adminWalletAPI.getCommissionVendor(drawerVendor.vendorId);
        if (mountedRef.current) setDrawerDetail(detail || null);
      }
      fetchAll(true);
    } catch (e) {
      addToast?.(`Rejection failed: ${e?.message || e}`, "error");
    }
  }, [rejectTarget, rejectReason, addToast, drawerVendor, fetchAll]);

  const statusOptions = [
    { value: "all", label: "All" },
    { value: "outstanding", label: "Outstanding Commission" },
    { value: "withdrawal", label: "Withdrawal Requested" },
    { value: "paid", label: "Paid Out" },
    { value: "pending", label: "Awaiting Approval" },
    { value: "suspended", label: "Suspended" },
  ];

  return (
    <div className={styles.commissionsContainer}>
      {/* ── 9 stat cards ── */}
      <div className="statsGrid">
        <div className="statCard">
          <div className="statValue">{analytics?.totalVendors ?? "—"}</div>
          <div className="statLabel">Total Vendors</div>
        </div>
        <div className="statCard">
          <div className="statValue">{analytics?.vendorsOwingCommission ?? "—"}</div>
          <div className="statLabel">Vendors Owing Commission</div>
        </div>
        <div className="statCard" style={{ borderLeft: "4px solid #dc2626" }}>
          <div className="statValue" style={{ color: "#dc2626" }}>
            {fmtMoney((analytics?.totalOutstandingCommission || 0))}
          </div>
          <div className="statLabel">Total Outstanding Commission</div>
        </div>
        <div className="statCard">
          <div className="statValue">{fmtMoney(analytics?.totalVendorEarnings || 0)}</div>
          <div className="statLabel">Total Vendor Earnings</div>
        </div>
        <div className="statCard">
          <div className="statValue">{analytics?.pendingWithdrawalRequests ?? "—"}</div>
          <div className="statLabel">Pending Withdrawal Requests</div>
        </div>
        <div className="statCard" style={{ borderLeft: "4px solid #f59e0b" }}>
          <div className="statValue" style={{ color: "#f59e0b" }}>
            {fmtMoney(analytics?.totalPendingPayouts || 0)}
          </div>
          <div className="statLabel">Total Pending Payouts</div>
        </div>
        <div className="statCard" style={{ borderLeft: "4px solid #16a34a" }}>
          <div className="statValue" style={{ color: "#16a34a" }}>
            {fmtMoney(analytics?.totalPaidOut || 0)}
          </div>
          <div className="statLabel">Total Paid Out</div>
        </div>
        <div className="statCard" style={{ borderLeft: "4px solid #16a34a" }}>
          <div className="statValue" style={{ color: "#16a34a" }}>
            {fmtMoney(analytics?.totalCommissionCollected || 0)}
          </div>
          <div className="statLabel">Total Commission Collected</div>
        </div>
        <div className="statCard" style={{ borderLeft: "4px solid var(--brand-primary)" }}>
          <div className="statValue" style={{ color: "var(--brand-primary)", fontWeight: 700 }}>
            {fmtMoney(analytics?.platformRevenue || 0)}
          </div>
          <div className="statLabel">Platform Revenue</div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className={styles.commissionsFilters}>
        <span className={styles.commissionsFilterLabel}>Type</span>
        <div className={styles.commissionsFilterChips}>
          {[
            ["all", "All"],
            ["marketplace", "Marketplace"],
            ["restaurant", "Restaurant"],
          ].map(([v, l]) => (
            <button
              key={v}
              className={`${styles.commissionsFilterChip} ${vendorType === v ? styles.commissionsFilterChipActive : ""}`}
              onClick={() => setVendorType(v)}
            >
              {l}
            </button>
          ))}
        </div>

        <span className={styles.commissionsFilterLabel}>Status</span>
        <select
          className={styles.commissionsFilterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <span className={styles.commissionsFilterLabel}>From</span>
        <input
          type="date"
          className={`${styles.commissionsFilterInput} ${styles.commissionsFilterDate}`}
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <span className={styles.commissionsFilterLabel}>To</span>
        <input
          type="date"
          className={`${styles.commissionsFilterInput} ${styles.commissionsFilterDate}`}
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />

        <input
          type="search"
          placeholder="Search vendor or business…"
          className={`${styles.commissionsFilterInput} ${styles.commissionsFilterSearch}`}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />

        <button
          className="btn btn-secondary"
          onClick={() => fetchAll()}
          disabled={refreshing}
          style={{ marginLeft: "auto" }}
        >
          {refreshing ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {/* ── Per-vendor table ── */}
      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : vendors.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">💼</div>
          <h3>No vendors found</h3>
          <p>Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="tableWrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Business</th>
                <th>Type</th>
                <th>Orders</th>
                <th>Total Sales</th>
                <th>Rate</th>
                <th>Commission Earned</th>
                <th>Commission Paid</th>
                <th>Outstanding</th>
                <th>Vendor Earnings</th>
                <th>Already Withdrawn</th>
                <th>Withdrawable</th>
                <th>Withdrawal Status</th>
                <th>Last Withdrawal</th>
                <th>Last Commission Pmt</th>
                <th>Wallet</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => {
                const vtClass =
                  v.vendorType === "marketplace" ? "marketplace" :
                  v.vendorType === "restaurant" ? "restaurant" : "none";
                return (
                  <tr key={v.vendorId}>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <strong>{v.name || "—"}</strong>
                        <small style={{ color: "var(--brand-muted)" }}>{v.email}</small>
                      </div>
                    </td>
                    <td>{v.businessName || v.storeName || "—"}</td>
                    <td>
                      <span className={`${styles.vendorTypeBadge} ${styles[vtClass]}`}>
                        {v.vendorType === "marketplace" ? "Marketplace" : v.vendorType === "restaurant" ? "Restaurant" : "—"}
                      </span>
                    </td>
                    <td className={styles.commissionsAmount}>{v.orderCount ?? 0}</td>
                    <td className={styles.commissionsAmount}>{fmtMoney(v.totalSales || 0)}</td>
                    <td className={styles.commissionsAmount}>{v.commissionRate ?? 0}%</td>
                    <td className={styles.commissionsAmount}>{fmtMoney(v.commissionEarned || 0)}</td>
                    <td className={styles.commissionsAmount}>{fmtMoney(v.commissionPaidByVendor || 0)}</td>
                    <td className={`${styles.commissionsAmount} ${(v.outstandingCommission || 0) > 0 ? styles.commissionsAmountOwed : styles.commissionsAmountSettled}`}>
                      {fmtMoney(v.outstandingCommission || 0)}
                    </td>
                    <td className={styles.commissionsAmount}>{fmtMoney(v.totalOnlineEarnings || 0)}</td>
                    <td className={styles.commissionsAmount}>{fmtMoney(v.totalWithdrawn || 0)}</td>
                    <td className={styles.commissionsAmount}>{fmtMoney(v.availableBalance || 0)}</td>
                    <td>
                      {(() => {
                        // The backend returns `withdrawalStatusLabel` as
                        // a human-readable string ("Outstanding
                        // Commission", "Withdrawal Requested", etc.).
                        // We derive a kebab-case key for the CSS class
                        // (e.g. "Outstanding Commission" →
                        // "outstanding-commission") and fall back to
                        // "commissionPaid" if the label is missing.
                        const label = v.withdrawalStatusLabel || "Commission Paid";
                        const key = String(label)
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-+|-+$/g, "") || "commissionPaid";
                        return (
                          <span className={`${styles.withdrawalStatusBadge} ${styles[key] || styles.commissionPaid}`}>
                            {label}
                          </span>
                        );
                      })()}
                    </td>
                    <td>{formatDate(v.lastWithdrawalDate)}</td>
                    <td>{formatDate(v.lastCommissionPaymentDate)}</td>
                    <td>
                      <span className={`${styles.walletStatusBadge} ${styles[v.walletStatus || "none"]}`}>
                        {v.walletStatus === "active" ? "Active" : v.walletStatus === "inactive" ? "Inactive" : "None"}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-secondary" onClick={() => openDrawer(v)}>
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Drawer ── */}
      {drawerVendor && (
        <>
          <div className={styles.commissionsDrawerBackdrop} onClick={closeDrawer} />
          <div className={styles.commissionsDrawer} role="dialog" aria-label="Vendor details">
            <div className={styles.commissionsDrawerHeader}>
              <div className={styles.commissionsDrawerTitle}>
                {drawerVendor.businessName || drawerVendor.name}
                <span style={{ marginLeft: 8, fontSize: "0.78rem", color: "var(--brand-muted)", fontWeight: 400 }}>
                  ({drawerVendor.email})
                </span>
              </div>
              <button className={styles.commissionsDrawerClose} onClick={closeDrawer} aria-label="Close">×</button>
            </div>

            <div className={styles.commissionsDrawerTabs}>
              {[
                ["business", "Business"],
                ["wallet", "Wallet Balance"],
                ["commission", "Commission"],
                ["withdrawals", "Withdrawals"],
                ["commissionPayments", "Commission Pmts"],
                ["orders", "Recent Orders"],
                ["transactions", "Transactions"],
                ["paystack", "Paystack Refs"],
              ].map(([k, l]) => (
                <button
                  key={k}
                  className={`${styles.commissionsDrawerTab} ${drawerTab === k ? styles.active : ""}`}
                  onClick={() => setDrawerTab(k)}
                >
                  {l}
                </button>
              ))}
            </div>

            <div className={styles.commissionsDrawerBody}>
              {drawerLoading ? (
                <div className="loading-center"><div className="spinner" /></div>
              ) : !drawerDetail ? (
                <div className={styles.commissionsEmpty}>No detail available.</div>
              ) : (
                <>
                  {drawerTab === "business" && (() => {
                    // The detail endpoint returns everything under
                    // `drawerDetail.vendor` (NOT `drawerDetail.user`).
                    // We pull out a small `v` alias and a `nd`
                    // ("not-defined") fallback for fields that are
                    // genuinely missing from the database — the spec
                    // is explicit: only show "—" when the field is
                    // truly absent, never for a mapping bug. For
                    // optional fields like `username` we use a more
                    // descriptive "Not set" so the admin can tell a
                    // real null apart from a missing piece of data.
                    const v = drawerDetail.vendor || {};
                    const stats = drawerDetail.statistics || {};
                    const kyc = v.kyc || {};
                    const nd = (val, friendlyForNull = true) => {
                      if (val === undefined || val === null || val === "") {
                        return friendlyForNull ? <span style={{ color: "var(--brand-muted)" }}>Not set</span> : "—";
                      }
                      return val;
                    };
                    const fmtVendorType = (t) =>
                      t === "marketplace" ? "Marketplace" : t === "restaurant" ? "Restaurant" : nd(t);
                    return (
                      <div className={styles.commissionsDrawerSection}>
                        <h4>Personal Information</h4>
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>Full Name</span>
                          <span className={styles.commissionsDrawerFieldValue}>{nd(v.name, false)}</span>
                        </div>
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>Email</span>
                          <span className={styles.commissionsDrawerFieldValue}>{nd(v.email, false)}</span>
                        </div>
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>Phone</span>
                          <span className={styles.commissionsDrawerFieldValue}>{nd(v.phone, false)}</span>
                        </div>
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>Username</span>
                          <span className={styles.commissionsDrawerFieldValue}>{nd(v.username)}</span>
                        </div>

                        <h4 style={{ marginTop: 16 }}>Business Information</h4>
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>Vendor Type</span>
                          <span className={styles.commissionsDrawerFieldValue}>{fmtVendorType(v.vendorType)}</span>
                        </div>
                        {v.vendorType === "restaurant" ? (
                          <div className={styles.commissionsDrawerField}>
                            <span className={styles.commissionsDrawerFieldLabel}>Restaurant Name</span>
                            <span className={styles.commissionsDrawerFieldValue}>
                              {nd(v.restaurantDetails?.restaurantName, false)}
                            </span>
                          </div>
                        ) : (
                          <div className={styles.commissionsDrawerField}>
                            <span className={styles.commissionsDrawerFieldLabel}>Store Name</span>
                            <span className={styles.commissionsDrawerFieldValue}>{nd(v.storeName, false)}</span>
                          </div>
                        )}
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>Business Name</span>
                          <span className={styles.commissionsDrawerFieldValue}>{nd(v.businessName, false)}</span>
                        </div>
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>Vendor Status</span>
                          <span className={styles.commissionsDrawerFieldValue}>{nd(v.vendorStatus, false)}</span>
                        </div>
                        {v.vendorStatus === "rejected" && v.vendorRejectedReason && (
                          <div className={`${styles.commissionsCallout} ${styles.danger}`}>
                            <span className={styles.commissionsCalloutIcon}>⚠️</span>
                            <span>Rejection reason: {v.vendorRejectedReason}</span>
                          </div>
                        )}
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>Approval Status</span>
                          <span className={styles.commissionsDrawerFieldValue}>
                            {v.vendorStatus === "approved" ? "✅ Approved" : v.vendorStatus === "pending" ? "⏳ Pending" : v.vendorStatus === "rejected" ? "❌ Rejected" : v.vendorStatus === "suspended" ? "🚫 Suspended" : nd(v.vendorStatus, false)}
                          </span>
                        </div>
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>Approved Date</span>
                          <span className={styles.commissionsDrawerFieldValue}>{formatDateTime(v.approvedAt)}</span>
                        </div>
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>Registration Date</span>
                          <span className={styles.commissionsDrawerFieldValue}>{formatDateTime(v.createdAt)}</span>
                        </div>
                        {v.location && (v.location.region || v.location.city) && (
                          <div className={styles.commissionsDrawerField}>
                            <span className={styles.commissionsDrawerFieldLabel}>Location</span>
                            <span className={styles.commissionsDrawerFieldValue}>
                              {[v.location.city, v.location.region].filter(Boolean).join(", ")}
                            </span>
                          </div>
                        )}

                        <h4 style={{ marginTop: 16 }}>KYC</h4>
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>KYC Status</span>
                          <span className={styles.commissionsDrawerFieldValue}>{nd(kyc.status, false)}</span>
                        </div>
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>ID Type</span>
                          <span className={styles.commissionsDrawerFieldValue}>{nd(kyc.idType)}</span>
                        </div>
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>ID Front Image</span>
                          <span className={styles.commissionsDrawerFieldValue}>
                            {kyc.idFrontImage ? (
                              <a href={kyc.idFrontImage} target="_blank" rel="noreferrer" className={styles.commissionsRefChip}>
                                View document
                              </a>
                            ) : nd(null)}
                          </span>
                        </div>
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>ID Back Image</span>
                          <span className={styles.commissionsDrawerFieldValue}>
                            {kyc.idBackImage ? (
                              <a href={kyc.idBackImage} target="_blank" rel="noreferrer" className={styles.commissionsRefChip}>
                                View document
                              </a>
                            ) : nd(null)}
                          </span>
                        </div>

                        <h4 style={{ marginTop: 16 }}>Statistics</h4>
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>Total Orders</span>
                          <span className={styles.commissionsDrawerFieldValue}>{stats.totalOrders ?? 0}</span>
                        </div>
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>Completed Orders</span>
                          <span className={styles.commissionsDrawerFieldValue}>{stats.completedOrders ?? 0}</span>
                        </div>
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>Cancelled Orders</span>
                          <span className={styles.commissionsDrawerFieldValue}>{stats.cancelledOrders ?? 0}</span>
                        </div>
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>Revenue</span>
                          <span className={styles.commissionsDrawerFieldValue}>{fmtMoney(stats.revenue || 0)}</span>
                        </div>
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>Commission Paid</span>
                          <span className={styles.commissionsDrawerFieldValue}>{fmtMoney(stats.commissionPaid || 0)}</span>
                        </div>
                        <div className={styles.commissionsDrawerField}>
                          <span className={styles.commissionsDrawerFieldLabel}>Commission Owing</span>
                          <span className={styles.commissionsDrawerFieldValue}>
                            <span className={(stats.commissionOwing || 0) > 0 ? styles.commissionsAmountOwed : styles.commissionsAmountSettled}>
                              {fmtMoney(stats.commissionOwing || 0)}
                            </span>
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {drawerTab === "wallet" && drawerDetail.wallet && (
                    <div className={styles.commissionsDrawerSection}>
                      <h4>Wallet Balance</h4>
                      <div className={styles.commissionsDrawerField}>
                        <span className={styles.commissionsDrawerFieldLabel}>Available Balance</span>
                        <span className={styles.commissionsDrawerFieldValue}>{fmtMoney((drawerDetail.wallet.availableBalance || 0))}</span>
                      </div>
                      <div className={styles.commissionsDrawerField}>
                        <span className={styles.commissionsDrawerFieldLabel}>Pending Balance</span>
                        <span className={styles.commissionsDrawerFieldValue}>{fmtMoney((drawerDetail.wallet.pendingBalance || 0))}</span>
                      </div>
                      <div className={styles.commissionsDrawerField}>
                        <span className={styles.commissionsDrawerFieldLabel}>Total Online Earnings</span>
                        <span className={styles.commissionsDrawerFieldValue}>{fmtMoney(drawerDetail.wallet.totalOnlineEarnings || 0)}</span>
                      </div>
                      <div className={styles.commissionsDrawerField}>
                        <span className={styles.commissionsDrawerFieldLabel}>Total Withdrawn</span>
                        <span className={styles.commissionsDrawerFieldValue}>{fmtMoney(drawerDetail.wallet.totalWithdrawn || 0)}</span>
                      </div>
                      <div className={styles.commissionsDrawerField}>
                        <span className={styles.commissionsDrawerFieldLabel}>Total Commission Paid</span>
                        <span className={styles.commissionsDrawerFieldValue}>{fmtMoney(drawerDetail.wallet.totalCommissionPaid || 0)}</span>
                      </div>
                      <div className={styles.commissionsDrawerField}>
                        <span className={styles.commissionsDrawerFieldLabel}>Total COD Sales</span>
                        <span className={styles.commissionsDrawerFieldValue}>{fmtMoney(drawerDetail.wallet.totalCODSales || 0)}</span>
                      </div>
                      <div className={styles.commissionsDrawerField}>
                        <span className={styles.commissionsDrawerFieldLabel}>Currency</span>
                        <span className={styles.commissionsDrawerFieldValue}>{drawerDetail.wallet.currency || "GHS"}</span>
                      </div>
                      <div className={styles.commissionsDrawerField}>
                        <span className={styles.commissionsDrawerFieldLabel}>Wallet Active</span>
                        <span className={styles.commissionsDrawerFieldValue}>{drawerDetail.wallet.isActive ? "Yes" : "No"}</span>
                      </div>
                    </div>
                  )}

                  {drawerTab === "commission" && (
                    <div className={styles.commissionsDrawerSection}>
                      <h4>Commission Balance</h4>
                      <div className={styles.commissionsDrawerField}>
                        <span className={styles.commissionsDrawerFieldLabel}>Outstanding (owed to SiiShop)</span>
                        <span className={`${styles.commissionsDrawerFieldValue} ${(drawerDetail.wallet?.commissionOwed || 0) > 0 ? styles.commissionsAmountOwed : styles.commissionsAmountSettled}`}>
                          {fmtMoney(drawerDetail.wallet?.commissionOwed || 0)}
                        </span>
                      </div>
                      <div className={styles.commissionsDrawerField}>
                        <span className={styles.commissionsDrawerFieldLabel}>Commission Paid (lifetime)</span>
                        <span className={styles.commissionsDrawerFieldValue}>{fmtMoney(drawerDetail.wallet?.commissionPaid || 0)}</span>
                      </div>
                      <div className={styles.commissionsDrawerField}>
                        <span className={styles.commissionsDrawerFieldLabel}>Commission Earned by SiiShop (lifetime)</span>
                        <span className={styles.commissionsDrawerFieldValue}>{fmtMoney(drawerDetail.commissionEarned || 0)}</span>
                      </div>
                      {(drawerDetail.wallet?.commissionOwed || 0) > 0 ? (
                        <div className={`${styles.commissionsCallout} ${styles.danger}`}>
                          <span className={styles.commissionsCalloutIcon}>⚠️</span>
                          <span>
                            Vendor owes SiiShop <strong>{fmtMoney(drawerDetail.wallet.commissionOwed)}</strong> in commission.
                            Payout blocked until commission is settled.
                          </span>
                        </div>
                      ) : (
                        <div className={`${styles.commissionsCallout} ${styles.success}`}>
                          <span className={styles.commissionsCalloutIcon}>✅</span>
                          <span>Commission fully settled — vendor is eligible for withdrawal approval.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {drawerTab === "withdrawals" && (
                    <div className={styles.commissionsDrawerSection}>
                      <h4>Withdrawal History</h4>
                      {(drawerDetail.withdrawals || []).length === 0 ? (
                        <div className={styles.commissionsEmpty}>No withdrawals yet.</div>
                      ) : (
                        <div className={styles.commissionsTableScroll}>
                          <table className={styles.commissionsMiniTable}>
                            <thead>
                              <tr>
                                <th>Amount</th>
                                <th>Net</th>
                                <th>Fee</th>
                                <th>Status</th>
                                <th>Requested</th>
                                <th>Reviewed</th>
                                <th>Reviewer</th>
                                <th>Transfer Ref</th>
                                <th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {drawerDetail.withdrawals.map((w) => {
                                const canApprove =
                                  (w.status === "pending" || w.status === "requested") &&
                                  (drawerDetail.wallet?.commissionOwed || 0) === 0;
                                return (
                                  <tr key={w._id || w.id}>
                                    <td>{fmtMoney(w.requestedAmount || w.amount || 0)}</td>
                                    <td>{fmtMoney(w.netAmount || 0)}</td>
                                    <td>{fmtMoney(w.fee || 0)}</td>
                                    <td>{w.status}</td>
                                    <td>{formatDateTime(w.createdAt)}</td>
                                    <td>{formatDateTime(w.reviewedAt)}</td>
                                    <td>{w.reviewedByName || w.reviewedBy || "—"}</td>
                                    <td>{w.externalRef ? <span className={styles.commissionsRefChip}>{w.externalRef}</span> : "—"}</td>
                                    <td style={{ whiteSpace: "nowrap" }}>
                                      {canApprove ? (
                                        <div className={styles.commissionsActionRow}>
                                          <button className="btn btn-primary" onClick={() => handleApprove(w._id || w.id)}>Approve</button>
                                          <button className="btn btn-secondary" onClick={() => { setRejectTarget(w._id || w.id); setRejectReason(""); }}>Reject</button>
                                        </div>
                                      ) : w.status === "pending" || w.status === "requested" ? (
                                        <div className={`${styles.commissionsCallout} ${styles.danger}`} style={{ margin: 0, fontSize: "0.78rem", padding: "6px 8px" }}>
                                          <span className={styles.commissionsCalloutIcon}>🚫</span>
                                          <span>Vendor owes SiiShop commission. Payout blocked.</span>
                                        </div>
                                      ) : (
                                        <span style={{ color: "var(--brand-muted)" }}>—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {rejectTarget && (
                        <div className={styles.commissionsRejectForm}>
                          <label style={{ fontSize: "0.82rem", color: "var(--brand-muted)" }}>Rejection reason</label>
                          <textarea
                            placeholder="Why are you rejecting this withdrawal?"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                          />
                          <div className={styles.commissionsActionRow}>
                            <button className="btn btn-primary" onClick={handleReject}>Confirm Reject</button>
                            <button className="btn btn-secondary" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {drawerTab === "commissionPayments" && (
                    <div className={styles.commissionsDrawerSection}>
                      <h4>Commission Payment History</h4>
                      {(drawerDetail.commissionPayments || []).length === 0 ? (
                        <div className={styles.commissionsEmpty}>No commission payments yet.</div>
                      ) : (
                        <div className={styles.commissionsTableScroll}>
                          <table className={styles.commissionsMiniTable}>
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Amount</th>
                                <th>Reference</th>
                                <th>Description</th>
                              </tr>
                            </thead>
                            <tbody>
                              {drawerDetail.commissionPayments.map((tx) => (
                                <tr key={tx._id || tx.id}>
                                  <td>{formatDateTime(tx.createdAt)}</td>
                                  <td>{fmtMoney(tx.amount || 0)}</td>
                                  <td>{tx.paymentRef ? <span className={styles.commissionsRefChip}>{tx.paymentRef}</span> : "—"}</td>
                                  <td>{tx.description || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {drawerTab === "orders" && (
                    <div className={styles.commissionsDrawerSection}>
                      <h4>Recent Orders</h4>
                      {(drawerDetail.recentOrders || []).length === 0 ? (
                        <div className={styles.commissionsEmpty}>No orders yet.</div>
                      ) : (
                        <div className={styles.commissionsTableScroll}>
                          <table className={styles.commissionsMiniTable}>
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Total</th>
                                <th>Status</th>
                                <th>Payment</th>
                                <th>Payment Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {drawerDetail.recentOrders.map((o) => (
                                <tr key={o._id || o.id}>
                                  <td>{formatDateTime(o.createdAt)}</td>
                                  <td>{fmtMoney(o.totalAmount || 0)}</td>
                                  <td>{o.orderStatus}</td>
                                  <td>{o.paymentMethod}</td>
                                  <td>{o.paymentStatus}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {drawerTab === "transactions" && (
                    <div className={styles.commissionsDrawerSection}>
                      <h4>Recent Wallet Transactions</h4>
                      {(drawerDetail.recentTransactions || []).length === 0 ? (
                        <div className={styles.commissionsEmpty}>No transactions yet.</div>
                      ) : (
                        <div className={styles.commissionsTableScroll}>
                          <table className={styles.commissionsMiniTable}>
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Amount</th>
                                <th>Balance After</th>
                                <th>Status</th>
                                <th>Description</th>
                              </tr>
                            </thead>
                            <tbody>
                              {drawerDetail.recentTransactions.map((tx) => (
                                <tr key={tx._id || tx.id}>
                                  <td>{formatDateTime(tx.createdAt)}</td>
                                  <td>{tx.type}</td>
                                  <td>{fmtMoney(tx.amount || 0)}</td>
                                  <td>{fmtMoney(tx.balanceAfter || 0)}</td>
                                  <td>{tx.status}</td>
                                  <td>{tx.description || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {drawerTab === "paystack" && (
                    <div className={styles.commissionsDrawerSection}>
                      <h4>Paystack References</h4>
                      {(drawerDetail.paystackReferences || []).length === 0 ? (
                        <div className={styles.commissionsEmpty}>No Paystack references on file.</div>
                      ) : (
                        <div className={styles.commissionsTableScroll}>
                          <table className={styles.commissionsMiniTable}>
                            <thead>
                              <tr>
                                <th>Type</th>
                                <th>Reference</th>
                                <th>Date</th>
                                <th>Amount</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {drawerDetail.paystackReferences.map((r) => (
                                <tr key={`${r.type}-${r.reference}`}>
                                  <td>{r.type}</td>
                                  <td><span className={styles.commissionsRefChip}>{r.reference}</span></td>
                                  <td>{formatDateTime(r.date)}</td>
                                  <td>{fmtMoney(r.amount || 0)}</td>
                                  <td>{r.status || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}