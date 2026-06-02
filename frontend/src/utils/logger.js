// utils/logger.js - Production-safe logging utility
const isDev = import.meta.env.DEV;

export const logger = {
  // Only log in development
  log: (...args) => isDev && console.log(...args),
  warn: (...args) => isDev && console.warn(...args),
  debug: (...args) => isDev && console.debug(...args),

  // Always log errors (production needs these)
  error: (...args) => console.error(...args),
  info: (...args) => isDev && console.info(...args),

  // Group logs (dev only)
  group: (...args) => isDev && console.group(...args),
  groupEnd: () => isDev && console.groupEnd(),

  // Table logs (dev only)
  table: (...args) => isDev && console.table(...args),

  // Time logs (dev only)
  time: (...args) => isDev && console.time(...args),
  timeEnd: (...args) => isDev && console.timeEnd(...args),
};

export default logger;