"use strict";

const { fail } = require("./response");

/**
 * Async route wrapper.
 * Catches all thrown errors and sends a clean JSON response.
 * Prevents unhandled promise rejections from crashing the server.
 *
 * Usage:
 *   router.get("/", asyncHandler(async (req, res) => { ... }));
 */
module.exports = function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error(`[ERROR] ${req.method} ${req.path} — ${err.message}`);

      if (res.headersSent) {
        return next(err);
      }

      const statusCode = err.statusCode || err.status || 500;
      const message = err.message || "Internal server error";

      // Avoid leaking stack traces in production
      const stack = process.env.NODE_ENV === "production" ? undefined : err.stack;

      return fail(res, message, statusCode);
    });
  };
}