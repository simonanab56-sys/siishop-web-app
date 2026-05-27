// components/analytics/AnalyticsCalendar.jsx
import { useState, useEffect, useMemo } from "react";
import { useCurrency } from "../../context/CurrencyContext";
import styles from "./AnalyticsCalendar.module.css";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AnalyticsCalendar({
  calendarData = {},
  onDateSelect,
  selectedDate,
  fmt,
}) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days = [];

    // Previous month padding
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ day: null, isCurrentMonth: false });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const data = calendarData[dateStr] || {};
      days.push({
        day,
        dateStr,
        isCurrentMonth: true,
        hasOrders: data.totalOrders > 0,
        totalOrders: data.totalOrders || 0,
        totalRevenue: data.totalRevenue || 0,
      });
    }

    return days;
  }, [year, month, calendarData]);

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const handleDayClick = (dayData) => {
    if (dayData.isCurrentMonth && dayData.hasOrders && onDateSelect) {
      onDateSelect(dayData.dateStr);
    }
  };

  const isSelected = (dateStr) => selectedDate === dateStr;

  return (
    <div className={styles.calendar}>
      <div className={styles.header}>
        <button className={styles.navBtn} onClick={goToPrevMonth} aria-label="Previous month">
          ‹
        </button>
        <div className={styles.title}>
          <span className={styles.monthName}>{MONTH_NAMES[month]}</span>
          <span className={styles.yearName}>{year}</span>
        </div>
        <button className={styles.navBtn} onClick={goToNextMonth} aria-label="Next month">
          ›
        </button>
      </div>

      <button className={styles.todayBtn} onClick={goToToday}>
        Today
      </button>

      <div className={styles.weekdays}>
        {WEEKDAYS.map((day) => (
          <div key={day} className={styles.weekday}>
            {day}
          </div>
        ))}
      </div>

      <div className={styles.days}>
        {calendarDays.map((dayData, index) => (
          <div
            key={index}
            className={`${styles.day}
              ${!dayData.isCurrentMonth ? styles.otherMonth : ""}
              ${dayData.hasOrders ? styles.hasOrders : ""}
              ${isSelected(dayData.dateStr) ? styles.selected : ""}`}
            onClick={() => handleDayClick(dayData)}
          >
            {dayData.day && (
              <>
                <span className={styles.dayNumber}>{dayData.day}</span>
                {dayData.hasOrders && (
                  <div className={styles.dayStats}>
                    <span className={styles.orderCount}>{dayData.totalOrders} orders</span>
                    <span className={styles.revenue}>{fmt(dayData.totalRevenue)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} />
          <span>Days with orders</span>
        </div>
      </div>
    </div>
  );
}