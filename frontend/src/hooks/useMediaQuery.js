import { useState, useEffect } from "react";

/**
 * Custom hook for responsive media query detection
 * @param {string} query - Media query string (e.g., "(max-width: 768px)")
 * @returns {boolean} - Whether the media query matches
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    // Initialize with current match state
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    // Listen for changes
    const handler = (event) => {
      setMatches(event.matches);
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }

    // Legacy Safari
    mediaQuery.addListener(handler);
    return () => mediaQuery.removeListener(handler);
  }, [query]);

  return matches;
}

/**
 * Hook to detect if device is mobile (< 768px)
 * @returns {boolean}
 */
export function useIsMobile() {
  return useMediaQuery("(max-width: 767px)");
}

/**
 * Hook to detect if device is tablet (768px - 1023px)
 * @returns {boolean}
 */
export function useIsTablet() {
  return useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
}

/**
 * Hook to detect if device is desktop (>= 1024px)
 * @returns {boolean}
 */
export function useIsDesktop() {
  return useMediaQuery("(min-width: 1024px)");
}

/**
 * Hook to detect if device is mobile or tablet (< 1024px)
 * @returns {boolean}
 */
export function useIsMobileOrTablet() {
  return useMediaQuery("(max-width: 1023px)");
}