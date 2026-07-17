// pages/restaurant/RestaurantAnalyticsPage.jsx - Restaurant analytics dashboard
//
// ✅ FIX: When the parent RestaurantDashboard passes `sharedStats`
// (populated from `GET /api/vendor/stats` — single source of truth),
// the headline KPIs (Total Revenue, Online, COD, Total Orders,
// Total Customers) read from the consolidated endpoint. The local
// date-range filtering still drives the chart, top-items and status
// breakdown because those are date-scoped views that need the raw
// order list.
import { useState, useEffect } from "react";
import { vendorAPI } from "../../services/api";
import { useCurrency } from "../../context/CurrencyContext";
import { useToast } from "../../components/Toast";

export default function RestaurantAnalyticsPage({ onBack, vendorId, addToast, sharedStats }) {
  const { fmt } = useCurrency() || {};
  const { addToast: showToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("week");

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  async function fetchData() {
    setLoading(true);
    try {
      // Two fetches: delivered (revenue/dates) + active (status breakdown).
      // Both go through the unified /api/vendor/orders endpoint.
      const filterMap = {
        today: "today",
        week: "last7days",
        month: "last30days",
        year: "last30days", // backend doesn't have year; use 30d as a wide proxy
      };
      const [delivered, active] = await Promise.all([
        vendorAPI.getDeliveredOrders({ filter: filterMap[dateRange] || "last7days" }),
        vendorAPI.getOrders(),
      ]);
      setOrders([...(Array.isArray(delivered) ? delivered : []), ...(Array.isArray(active) ? active : [])]);
    } catch (err) {
      showToast?.("Failed to load analytics", "error");
    } finally {
      setLoading(false);
    }
  }

  // Calculate date range
  const now = new Date();
  const getStartDate = () => {
    const d = new Date(now);
    switch (dateRange) {
      case "today": return d.setHours(0, 0, 0, 0);
      case "week": return d.setDate(d.getDate() - 7);
      case "month": return d.setMonth(d.getMonth() - 1);
      case "year": return d.setFullYear(d.getFullYear() - 1);
      default: return d.setDate(d.getDate() - 7);
    }
  };

  const startDate = getStartDate();
  const safeOrders = Array.isArray(orders) ? orders : [];
  const filteredOrders = safeOrders.filter(o => new Date(o.createdAt) >= startDate);

  // Calculate metrics
  const totalRevenue = filteredOrders
    .filter(o => o.orderStatus === "delivered")
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  const totalOrders = filteredOrders.length;
  const deliveredOrders = filteredOrders.filter(o => o.orderStatus === "delivered").length;
  const cancelledOrders = filteredOrders.filter(o => o.orderStatus === "cancelled").length;
  const pendingOrders = filteredOrders.filter(o => o.orderStatus === "pending").length;

  const averageOrderValue = totalOrders > 0 ? totalRevenue / deliveredOrders || 0 : 0;

  // Top selling items
  const itemCounts = {};
  filteredOrders.forEach(order => {
    order.items?.forEach(item => {
      if (!itemCounts[item.name]) itemCounts[item.name] = 0;
      itemCounts[item.name] += item.quantity;
    });
  });
  const topItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Daily sales for the chart
  const dailySales = {};
  filteredOrders
    .filter(o => o.orderStatus === "delivered")
    .forEach(order => {
      const date = new Date(order.createdAt).toLocaleDateString();
      if (!dailySales[date]) dailySales[date] = 0;
      dailySales[date] += order.totalAmount || 0;
    });
  const chartData = Object.entries(dailySales)
    .sort((a, b) => new Date(a[0]) - new Date(b[0]))
    .slice(-14);

  const maxSale = Math.max(...chartData.map(d => d[1]), 1);

  // Status breakdown over the unified 6-status canonical enum.
  const statusBreakdown = {
    pending: orders.filter(o => o.orderStatus === "pending").length,
    confirmed: orders.filter(o => o.orderStatus === "confirmed").length,
    preparing: orders.filter(o => o.orderStatus === "preparing").length,
    out_for_delivery: orders.filter(o => o.orderStatus === "out_for_delivery").length,
    delivered: orders.filter(o => o.orderStatus === "delivered").length,
    cancelled: orders.filter(o => o.orderStatus === "cancelled").length,
  };

  return (
    <div className="analytics-page">
      <div className="page-header">
        <button onClick={onBack} className="back-btn">← Back to Dashboard</button>
        <h2>📊 Analytics</h2>
        <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="date-select">
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : (
        <>
          {/* KPI Cards — use the consolidated /api/vendor/stats when
              available so this page matches Dashboard, Wallet, and
              Customers exactly. Otherwise fall back to the in-memory
              order list (date-range filtered). */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-label">Total Revenue</span>
              <span className="kpi-value">
                {fmt
                  ? fmt(sharedStats?.totalRevenue ?? totalRevenue)
                  : `GH₵ ${(sharedStats?.totalRevenue ?? totalRevenue).toFixed(2)}`}
              </span>
              <span className="kpi-change">
                {sharedStats?.totalOrders ?? totalOrders} orders
              </span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Total Orders</span>
              <span className="kpi-value">
                {sharedStats?.totalOrders ?? totalOrders}
              </span>
              <span className="kpi-change">
                {(sharedStats?.pendingOrders ?? pendingOrders) > 0
                  ? `${sharedStats?.pendingOrders ?? pendingOrders} pending`
                  : "No pending"}
              </span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Online (Paystack)</span>
              <span className="kpi-value">
                {fmt ? fmt(sharedStats?.onlineRevenue ?? 0) : `GH₵ ${(sharedStats?.onlineRevenue ?? 0).toFixed(2)}`}
              </span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Cash on Delivery</span>
              <span className="kpi-value">
                {fmt ? fmt(sharedStats?.codRevenue ?? 0) : `GH₵ ${(sharedStats?.codRevenue ?? 0).toFixed(2)}`}
              </span>
              <span className="kpi-change">
                {sharedStats?.totalCustomers ?? 0} customers
              </span>
            </div>
          </div>

          {/* Sales Chart */}
          <div className="chart-section">
            <h3>📈 Revenue Trend</h3>
            <div className="chart">
              {chartData.length === 0 ? (
                <p className="no-data">No data available</p>
              ) : (
                chartData.map(([date, amount]) => (
                  <div key={date} className="chart-bar">
                    <div
                      className="bar"
                      style={{ height: `${(amount / maxSale) * 100}%` }}
                    />
                    <span className="bar-label">{date}</span>
                    <span className="bar-value">{fmt ? fmt(amount) : `GH₵ ${amount.toFixed(0)}`}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top Items */}
          <div className="top-section">
            <h3>🔥 Top Selling Foods</h3>
            {topItems.length === 0 ? (
              <p className="no-data">No orders yet</p>
            ) : (
              <div className="top-list">
                {topItems.map(([name, qty], idx) => (
                  <div key={name} className="top-item">
                    <span className="rank">#{idx + 1}</span>
                    <span className="item-name">{name}</span>
                    <span className="item-qty">{qty} sold</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Order Status — uses the canonical 6-status enum */}
          <div className="status-section">
            <h3>📦 Order Status</h3>
            <div className="status-grid">
              <div className="status-card pending">
                <span className="status-count">{statusBreakdown.pending}</span>
                <span className="status-label">Pending</span>
              </div>
              <div className="status-card confirmed">
                <span className="status-count">{statusBreakdown.confirmed}</span>
                <span className="status-label">Confirmed</span>
              </div>
              <div className="status-card preparing">
                <span className="status-count">{statusBreakdown.preparing}</span>
                <span className="status-label">Preparing</span>
              </div>
              <div className="status-card out-for-delivery">
                <span className="status-count">{statusBreakdown.out_for_delivery}</span>
                <span className="status-label">Out for Delivery</span>
              </div>
              <div className="status-card delivered">
                <span className="status-count">{statusBreakdown.delivered}</span>
                <span className="status-label">Delivered</span>
              </div>
              <div className="status-card cancelled">
                <span className="status-count">{statusBreakdown.cancelled}</span>
                <span className="status-label">Cancelled</span>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        .analytics-page {
          padding: 20px;
          box-sizing: border-box;
          max-width: 100%;
          overflow-x: hidden;
        }
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .back-btn {
          background: none;
          border: none;
          color: #6b7280;
          cursor: pointer;
          font-size: 0.9rem;
        }
        .date-select {
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
        }
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }
        .kpi-card {
          background: white;
          padding: 20px;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          text-align: center;
        }
        .kpi-label {
          display: block;
          font-size: 0.85rem;
          color: #6b7280;
          margin-bottom: 8px;
        }
        .kpi-value {
          display: block;
          font-size: 1.5rem;
          font-weight: 700;
          color: #f97316;
        }
        .kpi-change {
          display: block;
          font-size: 0.75rem;
          color: #6b7280;
          margin-top: 4px;
        }
        .chart-section, .top-section, .status-section {
          background: white;
          padding: 20px;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          margin-bottom: 20px;
        }
        .chart-section h3, .top-section h3, .status-section h3 {
          margin: 0 0 16px;
        }
        .chart {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          height: 200px;
          overflow-x: auto;
        }
        .chart-bar {
          flex: 1;
          min-width: 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          height: 100%;
        }
        .bar {
          width: 100%;
          background: linear-gradient(180deg, #f97316 0%, #ea580c 100%);
          border-radius: 4px 4px 0 0;
          margin-top: auto;
        }
        .bar-label {
          font-size: 0.65rem;
          color: #6b7280;
          margin-top: 4px;
        }
        .bar-value {
          font-size: 0.6rem;
          color: #374151;
          margin-top: 2px;
        }
        .no-data {
          text-align: center;
          color: #6b7280;
          padding: 40px;
        }
        .top-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .top-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #f9fafb;
          border-radius: 8px;
        }
        .rank {
          font-weight: 700;
          color: #f97316;
          width: 30px;
        }
        .item-name {
          flex: 1;
        }
        .item-qty {
          color: #6b7280;
          font-size: 0.9rem;
        }
        .status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
          gap: 12px;
        }
        .status-card {
          padding: 16px;
          border-radius: 8px;
          text-align: center;
        }
        .status-card.pending { background: #f3f4f6; }
        .status-card.preparing { background: #fef3c7; }
        .status-card.ready { background: #d1fae5; }
        .status-card.delivered { background: #dcfce7; }
        .status-card.cancelled { background: #fee2e2; }
        .status-count {
          display: block;
          font-size: 1.5rem;
          font-weight: 700;
        }
        .status-label {
          display: block;
          font-size: 0.75rem;
          color: #6b7280;
        }
        .loading-state {
          display: flex;
          justify-content: center;
          padding: 60px;
        }
        @media (max-width: 768px) {
          .analytics-page {
            padding-bottom: 90px;
          }
          .page-header {
            flex-direction: column;
            gap: 12px;
          }
          .date-select {
            width: 100%;
          }
          .stats-row {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
          .stat-card {
            padding: 16px;
          }
          .chart-container {
            height: 250px;
          }
          .top-items-list {
            gap: 8px;
          }
          .top-item {
            padding: 12px;
          }
        }
        @media (max-width: 480px) {
          .analytics-page { padding: 16px 14px 90px; }
          .page-header { align-items: stretch; }
          .stats-row { grid-template-columns: 1fr; }
          .chart-section, .top-section, .status-section { padding: 14px; }
          .chart { height: 160px; gap: 4px; }
          .chart-bar { min-width: 32px; }
          .bar-label { font-size: 0.6rem; }
          .bar-value { font-size: 0.55rem; }
          .status-grid { grid-template-columns: repeat(2, 1fr); }
          .kpi-value { font-size: 1.3rem; }
          .top-item { flex-wrap: wrap; gap: 6px; padding: 10px; }
          .item-qty { width: 100%; }
        }
      `}</style>
    </div>
  );
}