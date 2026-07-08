"use strict";

/**
 * Socket.IO Helper
 * ─────────────────────────────────────────────────────────────────────────────
 * Exposes the Socket.IO `io` instance to SERVICE code (not just route
 * handlers). Routes already get `io` via `req.app.get("io")` — that pattern
 * is preserved in routes/delivery.js and routes/chat.js. This helper exists
 * for the (newer) case where a service needs to emit an event from a
 * non-route context, e.g. commission-notification.service.js firing a
 * Socket.IO push after a successful Paystack verification.
 *
 * The instance is set ONCE during server bootstrap (see server.js, after
 * `app.set("io", io)`). Services can then call `getIO()` from anywhere.
 *
 * If `getIO()` is called before `setIO()` (e.g. during a test bootstrap
 * that never started a real server), it returns `null` and the caller
 * must guard the emit. The commission notification service treats a
 * missing `io` as a no-op (the DB Notification + emails are still sent;
 * only the live Socket.IO push is skipped).
 */

let _io = null;

function setIO(io) {
  _io = io;
}

function getIO() {
  return _io;
}

module.exports = { setIO, getIO };
