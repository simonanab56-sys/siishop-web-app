"use strict";

/**
 * Global Express error handler.
 * Must be registered LAST — after all routes and other middleware.
 * Catches both synchronous thrown errors and async errors forwarded via next(err).
 *
 * NEVER sends a raw error to the client — always return a clean JSON body.
 */
function globalErrorHandler(err, req, res, next) {
  // Log full error for debugging
  console.error(`[ERROR] ${req.method} ${req.path} — ${err.message}`);
  if (process.env.NODE_ENV !== "production") {
    console.error(err.stack);
  }

  // Avoid double-headers if response already started
  if (res.headersSent) {
    return next(err);
  }

  // Multer file size limit
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Image file is too large. Maximum size is 5 MB." });
  }

  // Operational errors can set isOperational/statusCode directly.
  if (err.isOperational) {
    return res.status(err.statusCode || 400).json({
      success: false,
      message: err.message,
    });
  }

  // Mongoose validation error — flatten field errors
  if (err.name === "ValidationError" && err.errors) {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(422).json({
      success: false,
      message: "Validation failed",
      errors: messages,
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(409).json({
      success: false,
      message: `Duplicate value for ${field}. This value already exists.`,
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: `Invalid ${err.path}: ${err.value}`,
    });
  }

  // Default: 500 Internal Server Error
  // Never leak error details in production
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message,
  });
}

module.exports = globalErrorHandler;
