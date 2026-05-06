// components/OrderTracker.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Renders a 5-step animated progress bar for the orderStatus field:
//   pending → confirmed → preparing → out_for_delivery → delivered
//
// Props:
//   orderStatus {string} — one of the 5 status strings above
// ─────────────────────────────────────────────────────────────────────────────

import styles from "./OrderTracker.module.css";

const STEPS = [
  { key: "pending",          icon: "⏳", label: "Pending",         desc: "Order received" },
  { key: "confirmed",        icon: "✅", label: "Confirmed",       desc: "Payment verified" },
  { key: "preparing",        icon: "👨‍🍳", label: "Preparing",      desc: "Being cooked" },
  { key: "out_for_delivery", icon: "🛵", label: "On the Way",      desc: "Out for delivery" },
  { key: "delivered",        icon: "🎉", label: "Delivered",       desc: "Enjoy your meal!" },
];

export default function OrderTracker({ orderStatus = "pending" }) {
  const currentIndex = STEPS.findIndex((s) => s.key === orderStatus);
  // Fallback to 0 if status is unrecognised
  const activeIndex = currentIndex === -1 ? 0 : currentIndex;

  return (
    <div className={styles.tracker}>
      {STEPS.map((step, i) => {
        const completed = i < activeIndex;
        const current   = i === activeIndex;

        return (
          <div key={step.key} className={styles.stepGroup}>
            {/* Connector line between steps */}
            {i > 0 && (
              <div className={`${styles.line} ${completed || current ? styles.lineActive : ""}`} />
            )}

            <div className={`${styles.step} ${completed ? styles.completed : ""} ${current ? styles.current : ""}`}>
              {/* Circle */}
              <div className={styles.circle}>
                {completed ? "✓" : step.icon}
              </div>
              {/* Label */}
              <div className={styles.label}>{step.label}</div>
              <div className={styles.desc}>{step.desc}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
