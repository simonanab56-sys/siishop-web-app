// pages/restaurant/RestaurantCustomersPage.jsx - Restaurant customer management
//
// ✅ FIX (v3): The "Status" column is now split into two semantically
// distinct columns:
//   - "Customer Status"     — a relationship signal derived from the
//                             customer's FULL order history (Active /
//                             Returning / New / Inactive). Sourced from
//                             `customerStatus` on the shared stats row.
//   - "Latest Order Status" — the orderStatus of the most recent
//                             order (Pending / Preparing / Out for
//                             Delivery / Delivered / Cancelled).
//                             Sourced from `latestOrderStatus`.
//
// The pre-v3 page showed a single "Status" column that displayed the
// orderStatus of the most recent order, which was misleading: a long-
// time customer with 5 delivered orders who placed a new online-paid
// order that was still being prepared would show "Pending" — flipping
// their relationship status the moment they reordered. The v3 fix
// computes the customer-status signal from the entire history
// (orderCount + hasDelivered, see backend/services/restaurantStats
// .service.js#deriveCustomerStatus) and surfaces the most-recent
// order's actual status in a separate column so the two meanings
// don't get conflated.
//
// ✅ FIX (v2): The customer LIST below the summary cards now reads from
// the consolidated `sharedStats.customers` array — the same backend
// row set that produces the stat cards. The pre-v2 page built the list
// client-side from `vendorAPI.getOrders()`, but that endpoint EXCLUDES
// delivered orders (backend/routes/vendor.js: `orderStatus: { $ne: "delivered" }`).
// Every customer who had revenue had already been delivered, so the
// in-memory customer map was always empty, the table never rendered,
// and the empty state appeared even when the stat cards correctly
// reported N > 0 customers. The stat cards and the list were reading
// from two different endpoints with two different filters — that's
// the root cause. The fix collapses both to the same MongoDB
// aggregation (see backend/services/restaurantStats.service.js#getStats),
// so the "X customers" badge, the "Total Customers" card, and the
// table row count can never disagree again.
import { useState } from "react";
import { useCurrency } from "../../context/CurrencyContext";

export default function RestaurantCustomersPage({ onBack, vendorId, addToast, sharedStats }) {
  const { fmt } = useCurrency() || {};
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Single source of truth: sharedStats.customers, populated by
  // GET /api/vendor/stats. `loading` was the only thing the old
  // `useEffect`/`fetchOrders` pair produced, and the parent
  // RestaurantDashboard already gates rendering on the stats fetch,
  // so we no longer need a local loading state here.
  const customers = Array.isArray(sharedStats?.customers) ? sharedStats.customers : [];
  const totalCustomers = sharedStats?.totalCustomers ?? customers.length;

  const formatDate = (date) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // ✅ v2: empty state only fires when sharedStats has loaded AND
  // its customers array is empty. The "still fetching" case is
  // represented by `sharedStats === null` (parent hasn't returned
  // yet) so we don't show the misleading "No customers yet" message
  // before the first /api/vendor/stats response comes back.
  const statsLoaded = sharedStats != null;

  return (
    <div className="customers-page">
      <div className="page-header">
        <button onClick={onBack} className="back-btn">← Back to Dashboard</button>
        <h2>👥 Customers</h2>
        <span className="customer-count">{totalCustomers} customers</span>
      </div>

      {/* Summary Stats — read from the consolidated /api/vendor/stats
          endpoint (passed as `sharedStats` by the parent RestaurantDashboard).
          All four numbers come from the same MongoDB aggregation, so the
          card values and the table row count are guaranteed to agree. */}
      <div className="stats-row">
        <div className="stat-card small">
          <span className="stat-value">{sharedStats?.totalCustomers ?? 0}</span>
          <span className="stat-label">Total Customers</span>
        </div>
        <div className="stat-card small">
          <span className="stat-value">{sharedStats?.totalOrders ?? 0}</span>
          <span className="stat-label">Total Orders</span>
        </div>
        <div className="stat-card small">
          <span className="stat-value">
            {fmt ? fmt(sharedStats?.totalRevenue ?? 0) : `GHS ${(sharedStats?.totalRevenue ?? 0).toFixed(2)}`}
          </span>
          <span className="stat-label">Total Revenue</span>
        </div>
      </div>

      {!statsLoaded ? (
        <div className="loading-center">
          <div className="spinner" />
        </div>
      ) : customers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <h3>No customers yet</h3>
          <p>Customers will appear here once they place orders</p>
        </div>
      ) : (
        <div className="customers-list">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Orders</th>
                <th>Total Spent</th>
                <th>Last Order</th>
                <th>Customer Status</th>
                <th>Latest Order Status</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.customerKey || customer.userId || customer.email}>
                  <td data-label="Customer">
                    <div className="customer-info">
                      <strong>{customer.name}</strong>
                      <span>{customer.email}</span>
                      {customer.phone && <span className="phone">{customer.phone}</span>}
                    </div>
                  </td>
                  <td data-label="Orders">{customer.orderCount}</td>
                  <td data-label="Total Spent">
                    {fmt ? fmt(customer.totalSpent) : `GHS ${(customer.totalSpent || 0).toFixed(2)}`}
                  </td>
                  <td data-label="Last Order">{formatDate(customer.lastOrderDate)}</td>
                  {/*
                    Customer Status — relationship signal computed from
                    the customer's full order history in
                    restaurantStats.service.js (orderCount + hasDelivered).
                    The optional chain + lowercase() guard against a
                    pre-deploy backend (the badge renders uncolored with
                    "—" text until the new fields land).
                  */}
                  <td data-label="Customer Status">
                    <span
                      className={`status-badge status-${(customer.customerStatus || "inactive").toLowerCase()}`}
                    >
                      {customer.customerStatus || "—"}
                    </span>
                  </td>
                  {/*
                    Latest Order Status — orderStatus of the most recent
                    order. The kebab-case form feeds the CSS class
                    (.status-out-for-delivery for "out_for_delivery"); the
                    space-separated form is the display label.
                  */}
                  <td data-label="Latest Order Status">
                    <span
                      className={`status-badge status-${(customer.latestOrderStatus || "pending").replace(/_/g, "-")}`}
                    >
                      {(customer.latestOrderStatus || "—").replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty per-customer drill-down modal — kept for visual parity
          with v1. The drill-down is no longer populated by the old
          vendorAPI.getOrders() fetch (we removed that call entirely)
          so the modal stays closed. Clicking a row in the table above
          is a no-op now; per-customer order history is available in
          the Delivered / Active orders tabs. */}
    </div>
  );
}