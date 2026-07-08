// hooks/useDebounce.js
// ─────────────────────────────────────────────────────────────────────────────
// Generic value debouncer. Delays updating the returned value until `delay`
// milliseconds have passed without the input value changing. Used by the
// SearchableSelect to throttle live-search requests.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

/**
 * @template T
 * @param {T} value
 * @param {number} delay  default 200ms
 * @returns {T}
 */
export function useDebounce(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}