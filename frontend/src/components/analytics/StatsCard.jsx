// components/analytics/StatsCard.jsx
import styles from "./StatsCard.module.css";

export default function StatsCard({ icon, label, value, subValue, color = "primary" }) {
  return (
    <div className={`${styles.card} ${styles[color]}`}>
      <div className={styles.icon}>{icon}</div>
      <div className={styles.content}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{value}</span>
        {subValue && <span className={styles.sub}>{subValue}</span>}
      </div>
    </div>
  );
}