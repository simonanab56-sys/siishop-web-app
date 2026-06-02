// api.js - Centralized API Configuration
// This file provides safe, production-ready API URL configuration
// Works for: localhost dev, Vercel production, Capacitor Android/iOS
import logger from "../utils/logger";

// Production fallback
const PRODUCTION_API_URL = import.meta.env.VITE_API_URL;

// Get API URL with safe fallback
function getApiUrl() {
  // For development (npm run dev) - use localhost
  if (import.meta.env.DEV) {
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl) {
      logger.log("API: Using dev URL:", envUrl);
      return envUrl;
    }
    logger.warn("API: VITE_API_URL not set in dev mode");
    return PRODUCTION_API_URL;
  }

  // For production builds (npm run build, Capacitor, Vercel)
  const prodUrl = import.meta.env.VITE_API_URL_PROD || import.meta.env.VITE_API_URL;
  if (prodUrl) {
    logger.log("API: Using production URL");
    return prodUrl;
  }

  logger.warn("API: No API URL configured");
  return PRODUCTION_API_URL;
}

// Export the base URL
export const API_BASE = getApiUrl();

export default API_BASE;