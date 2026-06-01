// api.js - Centralized API Configuration
// This file provides safe, production-ready API URL configuration
// Works for: localhost dev, Vercel production, Capacitor Android/iOS

// Production fallback - NEVER remove this
const PRODUCTION_API_URL = "https://api.siishops.com/api";
// Debug: Log environment details
function logEnvInfo() {
  console.log("🔥 ========== API CONFIG DEBUG ==========");
  console.log("🔥 DEV mode:", import.meta.env.DEV);
  console.log("🔥 PROD mode:", import.meta.env.PROD);
  console.log("🔥 VITE_API_URL:", import.meta.env.VITE_API_URL);
  console.log("🔥 VITE_API_URL_PROD:", import.meta.env.VITE_API_URL_PROD);
  console.log("🔥 =======================================");
}

// Get API URL with safe fallback
function getApiUrl() {
  logEnvInfo();

  // For development (npm run dev) - use localhost
  if (import.meta.env.DEV) {
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl) {
      console.log("🔧 Dev mode - Using API URL:", envUrl);
      return envUrl;
    }
    console.warn("⚠️ VITE_API_URL not set in dev mode. Using production fallback.");
    return PRODUCTION_API_URL;
  }

  // For production builds (npm run build, Capacitor, Vercel)
  // Use production API - localhost won't work on mobile devices
  const prodUrl = import.meta.env.VITE_API_URL_PROD || import.meta.env.VITE_API_URL;
  if (prodUrl) {
    console.log("🚀 Production/Capacitor mode - Using API URL:", prodUrl);
    return prodUrl;
  }

  console.warn("⚠️ No API URL configured. Using production fallback.");
  return PRODUCTION_API_URL;
}

// Export the base URL
export const API_BASE = getApiUrl();

// Export for use in other files
export default API_BASE;