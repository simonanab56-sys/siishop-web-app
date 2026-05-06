"use strict";

/**
 * Standard API response helpers.
 * All return a consistent JSON body with { success, message, ...data }
 */

/**
 * 2xx success response.
 */
function success(res, data = null, message = "Success", statusCode = 200) {
  return res.status(statusCode).json({ success: true, message, data });
}

/**
 * 4xx client error response.  Aliased as `error()` for ergonomics.
 */
function fail(res, message = "Error", statusCode = 400) {
  return res.status(statusCode).json({ success: false, message });
}

// Alias so both `error()` and `fail()` work
const error = fail;

/**
 * 422 unprocessable entity — validation errors
 */
function validationError(res, errors) {
  return res.status(422).json({
    success: false,
    message: "Validation failed",
    errors,
  });
}

/**
 * Paginated list response.
 */
function paginated(res, data = [], pagination = {}, message = "Success") {
  return res.status(200).json({ success: true, message, data, pagination });
}

module.exports = { success, fail, error, validationError, paginated };