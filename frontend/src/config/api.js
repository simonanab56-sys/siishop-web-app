// api.js - Centralized API Configuration
// This file provides safe, production-ready API URL configuration

// Production fallback - NEVER remove this
const PRODUCTION_API_URL = "https://siishop-web-app-backend.onrender.com/api";

// Get API URL with safe fallback
function getApiUrl() {
  const envUrl = import.meta.env.VITE_API_URL;

  if (!envUrl) {
    // No API URL configured - use production as fallback
    console.warn("⚠️ VITE_API_URL not set. Using production fallback.");
    return PRODUCTION_API_URL;
  }

  // Development mode check
  if (import.meta.env.DEV) {
    console.log("🔧 Development mode - API URL:", envUrl);
  }

  return envUrl;
}

// Export the base URL
export const API_BASE = getApiUrl();

// Export for use in other files
export default API_BASE;