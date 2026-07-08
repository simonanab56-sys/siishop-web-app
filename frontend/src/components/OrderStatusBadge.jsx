// components/OrderStatusBadge.jsx — HARDENED
// Fix: status.toLowerCase() crashed when status was undefined/null
// Fix: STEP_META lookup returned undefined for unexpected status values
// Fix: STEP_META now covers all 5 orderStatus values (maps to 3-step display)
import styles from "./OrderStatusBadge.module.css";

const STEPS = ["Pending", "Preparing", "Delivered"];

// Maps 5-step orderStatus values → 3-step display
const STEP_META = {
  // Step 1 — Pending
  pending:   { icon: "⏳", label: "Pending",   desc: "Order received" },
  confirmed: { icon: "⏳", label: "Pending",   desc: "Order received" },
  // Step 2 — Preparing
  preparing:    { icon: "👨‍🍳", label: "Preparing", desc: "Being prepared" },
  // Step 3 — Delivered
  out_for_delivery: { icon: "🛵", label: "Out for Delivery", desc: "On its way" },
  delivered:   { icon: "✅", label: "Delivered",  desc: "Enjoy your meal!" },
};

// 3-step aliases (API uses lowercase strings like "pending")
const LEGACY_STEP_META = {
  Pending:   { icon: "⏳", label: "Pending",   desc: "Order received" },
  Preparing: { icon: "👨‍🍳", label: "Preparing", desc: "Being prepared" },
  Delivered: { icon: "✅", label: "Delivered",  desc: "On its way!" },
};

const ALL_META = { ...LEGACY_STEP_META, ...STEP_META };

// HARDENED: guard null/undefined status before calling .toLowerCase()
export function StatusBadge({ status }) {
  const safeStatus = (status && ALL_META[status]) ? status : "Pending";
  const meta = ALL_META[safeStatus] || ALL_META["Pending"];
  return (
    <span className={`badge badge-${safeStatus.toLowerCase().replace(/_/g, "_")}`}>
      {meta.icon} {meta.label}
    </span>
  );
}

export function OrderTimeline({ status }) {
  // DEPRECATED: unused export kept temporarily as a no-op shim in case any
  // external code still imports it. Will be removed once callers are audited.
  void status;
  return null;
}
