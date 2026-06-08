// utils/logger.js - Production-safe logging utility
const isProduction = process.env.NODE_ENV === "production";

const logger = {
  // Development-only logs (disabled in production)
  log: (...args) => !isProduction && console.log(...args),
  debug: (...args) => !isProduction && console.debug(...args),
  info: (...args) => !isProduction && console.info(...args),
  warn: (...args) => !isProduction && console.warn(...args),

  // Always log errors (production needs these)
  error: (...args) => console.error(...args),

  // Group logs (dev only)
  group: (...args) => !isProduction && console.group(...args),
  groupEnd: () => !isProduction && console.groupEnd(),

  // Table logs (dev only)
  table: (...args) => !isProduction && console.table(...args),

  // Time logs (dev only)
  time: (...args) => !isProduction && console.time(...args),
  timeEnd: (...args) => !isProduction && console.timeEnd(...args),

  // Conditional logging helper
  if: {
    dev: (...args) => !isProduction && console.log(...args),
    prod: (...args) => isProduction && console.log(...args),
  },
};

module.exports = logger;