// utils/mapProvider.js - Map provider detection

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

/**
 * Check if Google Maps API key is available
 * @returns {boolean} true if Google Maps should be used
 */
export function hasGoogleMaps() {
  return Boolean(GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY.trim() !== "");
}

/**
 * Get the active map provider
 * @returns {"google" | "osm"} The active map provider
 */
export function getActiveMapProvider() {
  return hasGoogleMaps() ? "google" : "osm";
}

/**
 * Get Google Maps API key
 * @returns {string|null} The API key or null
 */
export function getGoogleMapsApiKey() {
  return GOOGLE_MAPS_API_KEY || null;
}

/**
 * Load Google Maps script dynamically
 * @returns {Promise<void>} Promise that resolves when script is loaded
 */
export function loadGoogleMapsScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve();
      return;
    }

    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      reject(new Error("No Google Maps API key"));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;

    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));

    document.head.appendChild(script);
  });
}

export default {
  hasGoogleMaps,
  getActiveMapProvider,
  getGoogleMapsApiKey,
  loadGoogleMapsScript,
};