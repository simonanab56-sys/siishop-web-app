"use strict";
/**
 * Shared "Delivered Orders" tab — used by both Marketplace VendorDashboard
 * and Restaurant Dashboard. Single source of truth for the vendor-side
 * delivered orders view.
 *
 * The backend endpoint GET /api/vendor/orders/delivered already scopes by
 * the authenticated vendor's req.user.userId. Restaurant orders write
 * items[].vendorId = restaurant.userId, so restaurants hitting this same
 * endpoint automatically see only their own delivered orders — no
 * endpoint duplication required.
 *
 * Reused: vendorAPI.getDeliveredOrders, vendorAPI.getDeliveredOrdersStats,
 * filters (all / today / 7d / 30d / custom), search, stats cards,
 * loading + empty states, table layout.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useCurrency } from "../../context/CurrencyContext";
import { vendorAPI } from "../../services/api";
import logger from "../../utils/logger";
import styles from "./VendorDeliveredOrders.module.css";

function safeId(id) {
  return id ? "#" + String(id).slice(-6).toUpperCase() : "#------";
}

const FILTERS = ["all", "today", "last7days", "last30days", "custom"];

const FILTER_LABELS = {
  all: "All",
  today: "Today",
  last7days: "7 Days",
  last30days: "30 Days",
  custom: "Custom",
};

function VendorDeliveredOrders({ addToast }) {
  const { fmt } = useCurrency();
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const mountedRef = useRef(true);

  const buildFilterParams = useCallback(() => {
    // Single source of truth for the query shape sent to BOTH the list and
    // the stats endpoint — guarantees the four stat cards always reflect
    // the same window the table is showing.
    const params = { filter };
    if (filter === "custom") {
      params.startDate = startDate;
      params.endDate = endDate;
    }
    if (search) params.search = search;
    return params;
  }, [filter, startDate, endDate, search]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await vendorAPI.getDeliveredOrdersStats(buildFilterParams());
      if (mountedRef.current) setStats(data);
    } catch (err) {
      logger.error("Failed to load stats:", err);
    }
  }, [buildFilterParams]);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await vendorAPI.getDeliveredOrders(buildFilterParams());
      if (mountedRef.current) setOrders(data || []);
    } catch (err) {
      logger.error("Failed to load delivered orders:", err);
      addToast?.("Failed to load delivered orders", "error");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [buildFilterParams, addToast]);

  useEffect(() => {
    mountedRef.current = true;
    fetchStats();
    fetchOrders();
    return () => {
      mountedRef.current = false;
    };
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
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className={styles.deliveredTab}>
      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className="stat-card">
          <span className="stat-icon">✅</span>
          <span className="stat-label">Delivered Orders</span>
          <span className="stat-value">{stats?.totalDelivered || 0}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">💰</span>
          <span className="stat-label">Revenue Generated</span>
          <span className="stat-value">{fmt(stats?.totalRevenue || 0)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">📅</span>
          <span className="stat-label">Monthly Revenue</span>
          <span className="stat-value">{fmt(stats?.monthlyRevenue || 0)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">📊</span>
          <span className="stat-label">Avg Order Value</span>
          <span className="stat-value">{fmt(stats?.avgOrderValue || 0)}</span>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filtersRow}>
        <div className={styles.filterBtns}>
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`${styles.filterBtn} ${
                filter === f ? styles.filterBtnActive : ""
              }`}
              onClick={() => handleFilterChange(f)}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        {filter === "custom" && (
          <div className={styles.dateInputs}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={styles.dateInput}
            />
            <span>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={styles.dateInput}
            />
          </div>
        )}
        <input
          type="text"
          placeholder="Search order ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {/* Orders Table */}
      {loading ? (
        <div className="loading-center">
          <div className="spinner" />
        </div>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <h3>No delivered orders found</h3>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Amount</th>
                <th>Delivered</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order._id}>
                  <td data-label="Order ID">{safeId(order._id)}</td>
                  <td data-label="Customer">{order.userId?.name || "Unknown"}</td>
                  <td data-label="Product">
                    {(order.items || [])
                      .map((i) => i.name || i.productId?.name)
                      .filter(Boolean)
                      .slice(0, 2)
                      .join(", ") || "-"}
                  </td>
                  <td data-label="Qty">
                    {(order.items || []).reduce(
                      (sum, i) => sum + (i.quantity || 0),
                      0
                    )}
                  </td>
                  <td data-label="Amount">{fmt(order.totalAmount)}</td>
                  <td data-label="Delivered">{formatDate(order.deliveredAt)}</td>
                  <td data-label="Payment">
                    {order.paymentMethod === "paystack" ? "Online" : "COD"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default VendorDeliveredOrders;