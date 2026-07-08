// utils/useCountdown.js
// ─────────────────────────────────────────────────────────────────────────────
// Shared countdown hook — single source of truth for all "X ends in" timers
// (Promo section header countdown, per-promo-card countdown, future
// scheduled-deal countdowns, etc).
//
// Returns an object that ticks every 1s until `endDate`:
//   {
//     days, hours, minutes, seconds,
//     expired: boolean,    // true once endDate has passed
//     totalMs:  number,    // ms remaining (negative when expired)
//   }
//
// Caller controls how the values are rendered; this hook is pure and
// side-effect-isolated (clears its interval on unmount or when endDate
// changes).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";

function calcDiff(end) {
  const ms = new Date(end).getTime() - Date.now();
  if (ms <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true, totalMs: ms };
  }
  return {
    days:    Math.floor(ms / 86_400_000),
    hours:   Math.floor((ms % 86_400_000) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000)  / 60_000),
    seconds: Math.floor((ms % 60_000)     / 1_000),
    expired: false,
    totalMs: ms,
  };
}

/**
 * @param {string|Date} endDate - ISO string or Date object
 * @returns {{days:number, hours:number, minutes:number, seconds:number, expired:boolean, totalMs:number}}
 */
export function useCountdown(endDate) {
  const [timeLeft, setTimeLeft] = useState(() => calcDiff(endDate));
  const timerRef = useRef(null);

  useEffect(() => {
    // Reset immediately so a prop change is reflected without waiting for the next tick.
    setTimeLeft(calcDiff(endDate));
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setTimeLeft(calcDiff(endDate)), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [endDate]);

  return timeLeft;
}