"use strict";
import React from "react";
import OrderTracker from "../OrderTracker";
import { StatusBadge } from "../OrderStatusBadge";
import styles from "../../pages/vendor/VendorDashboard.module.css";

/**
 * Canonical 6-status enum — single source of truth for both marketplace
 * and restaurant vendor dashboards.
 */
export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

function safeId(id) {
  return id ? "#" + String(id).slice(-6).toUpperCase() : "#------";
}

function getItemImage(item) {
  if (!item) return "";
  if (item.image) return item.image;
  if (Array.isArray(item.images) && item.images.length) return item.images[0];
  if (item.productId && item.productId.image) return item.productId.image;
  if (item.productId && Array.isArray(item.productId.images) && item.productId.images.length) {
    return item.productId.images[0];
  }
  if (item.product && item.product.image) return item.product.image;
  if (item.product && Array.isArray(item.product.images) && item.product.images.length) {
    return item.product.images[0];
  }
  return "";
}

/**
 * Shared order row used by both Marketplace VendorDashboard and
 * RestaurantDashboard. Click-to-expand row, status <select>, OrderTracker
 * in the expanded detail, plus per-item thumbnails.
 *
 * Props:
 *   order              — the order document
 *   isExpanded         — boolean
 *   onToggleExpand     — (orderId) => void
 *   updating           — orderId currently being updated (or null)
 *   onStatusChange     — (orderId, newStatus) => void
 *   fmt                — currency formatter from useCurrency()
 *   setImageModal      — (modalObj) => void  (opens fullscreen image viewer)
 *   stylesOverride     — optional CSS module overrides
 */
export default function OrderRow({
  order,
  isExpanded,
  onToggleExpand,
  updating,
  onStatusChange,
  fmt,
  setImageModal,
  stylesOverride,
}) {
  const css = stylesOverride || styles;
  if (!order?._id) return null;
  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <React.Fragment>
      <tr
        onClick={() => onToggleExpand?.(order._id)}
        style={{ cursor: "pointer" }}
        className={isExpanded ? css.expandedRow : ""}
      >
        <td data-label="Order">
          <code>{safeId(order._id)}</code>
          <br />
          <small style={{ color: "var(--brand-muted)" }}>
            {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "—"}
          </small>
        </td>
        <td data-label="Customer">
          <strong>{order.customerName || "—"}</strong>
          <br />
          <small style={{ color: "var(--brand-muted)" }}>
            {order.customerPhone || ""}
          </small>
        </td>
        <td data-label="Items">
          {items.length} item{items.length !== 1 ? "s" : ""}
        </td>
        <td data-label="Total">
          <strong>{fmt(typeof order.totalAmount === "number" ? order.totalAmount : 0)}</strong>
        </td>
        <td data-label="Status">
          <StatusBadge status={order.orderStatus || "pending"} />
        </td>
        <td data-label="Update" onClick={(e) => e.stopPropagation()}>
          <select
            className={css.statusSelect}
            value={order.orderStatus || "pending"}
            onChange={(e) => onStatusChange?.(order._id, e.target.value)}
            disabled={updating === order._id}
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </td>
      </tr>

      {isExpanded && (
        <tr className={css.detailRow}>
          <td colSpan={6} style={{ padding: "16px 20px" }}>
            <div className={css.trackerWrap}>
              <p className={css.detailHeading}>
                <strong>Order Progress</strong> — tap row to collapse
              </p>
              <OrderTracker orderStatus={order.orderStatus || "pending"} />
              {items.length > 0 && (
                <div className={css.orderItemsList}>
                  <strong>Items:</strong>
                  {items.map((item, idx) => {
                    const itemImg = getItemImage(item);
                    return (
                      <div key={idx} className={css.orderItemRow}>
                        {itemImg && (
                          <img
                            src={itemImg}
                            alt={item.name}
                            style={{
                              width: "40px",
                              height: "40px",
                              borderRadius: "4px",
                              marginRight: "8px",
                              objectFit: "cover",
                              cursor: "pointer",
                            }}
                            onClick={() =>
                              setImageModal?.({
                                isOpen: true,
                                src: itemImg,
                                title: item.name || "Product Image",
                              })
                            }
                            onError={(e) => {
                              e.target.style.display = "none";
                            }}
                          />
                        )}
                        <span>
                          {item.quantity}x {item.name}
                        </span>
                        <span>
                          {fmt(
                            (typeof item.price === "number" ? item.price : 0) *
                              (typeof item.quantity === "number" ? item.quantity : 1)
                          )}
                        </span>
                      </div>
                    );
                  })}
                  {order.deliveryAddress && (
                    <p className={css.deliveryAddr}>
                      <strong>Delivery address:</strong> {order.deliveryAddress}
                    </p>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}