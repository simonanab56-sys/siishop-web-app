// components/analytics/DateFilter.jsx
import { useState, useEffect } from "react";
import styles from "./DateFilter.module.css";

const DATE_RANGES = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7days", label: "Last 7 days" },
  { value: "30days", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "all", label: "All time" },
];

export default function DateFilter({ onPeriodChange, selectedPeriod = "30days" }) {
  const [period, setPeriod] = useState(selectedPeriod);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    setPeriod(selectedPeriod);
  }, [selectedPeriod]);

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    if (newPeriod === "custom") {
      setShowCustom(true);
    } else {
      setShowCustom(false);
      onPeriodChange?.(newPeriod);
    }
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      onPeriodChange?.("custom", { start: customStart, end: customEnd });
    }
  };

  return (
    <div className={styles.filter}>
      <div className={styles.periodButtons}>
        {DATE_RANGES.map((range) => (
          <button
            key={range.value}
            className={`${styles.periodBtn} ${period === range.value ? styles.active : ""}`}
            onClick={() => handlePeriodChange(range.value)}
          >
            {range.label}
          </button>
        ))}
      </div>

      {showCustom && (
        <div className={styles.customRange}>
          <div className={styles.customInputs}>
            <div className={styles.customField}>
              <label>From</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </div>
            <div className={styles.customField}>
              <label>To</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
            <button className={styles.applyBtn} onClick={handleCustomApply}>
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}