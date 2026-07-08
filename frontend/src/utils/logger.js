// utils/logger.js — Production-safe logging utility.
//
// Contract (per project spec):
//   • Production (`import.meta.env.PROD === true`):
//       - log / info / debug / trace    → NO-OP (do not call console.*)
//       - group / groupEnd / table / time / timeEnd → NO-OP
//       - warn                          → passes through to console.warn
//                                       (genuine warnings must remain
//                                        visible in production so admins
//                                        and the support team can see
//                                        deprecations, network failures,
//                                        React warnings, etc.)
//       - error                         → passes through to console.error
//                                       (genuine errors must remain
//                                        visible in production for
//                                        error reporting, crash
//                                        analytics, and Sentry-style
//                                        tooling hooked to console.error)
//   • Development (`import.meta.env.DEV === true`):
//       - every method forwards to the corresponding console.* call.
//
// Reasoning for keeping `warn` + `error` in production:
//   1. React's own dev warnings (e.g. missing keys, deprecated lifecycle)
//      are emitted via `console.warn` — silencing these would hide real
//      bugs that surface in production only.
//   2. Third-party error reporters (Sentry, Datadog RUM, LogRocket, etc.)
//      typically install a `console.error` shim. Silencing console.error
//      would break observability.
//   3. Unhandled promise rejections and unexpected exceptions surface as
//      `console.error` calls in most browsers; removing them would hide
//      crash signals from the support team.
//
// The spec is explicit: "Do NOT suppress: console.error(), ErrorBoundary
// errors, Unhandled promise errors, Network failures, Unexpected
// exceptions. These should still appear in production for debugging."
//
// Importing the logger anywhere in the codebase is therefore safe in
// both environments: a `logger.log("x")` call in production is
// dead-code-eliminated by Vite (the IIFE short-circuits and the
// argument expressions inside are never evaluated).

const isDev = import.meta.env.DEV;

export const logger = {
  // ── Dev-only ─────────────────────────────────────────────────────────────
  // Short-circuit on the static `isDev` constant. Because `isDev` is a
  // module-level `const`, the bundler can inline the boolean and drop
  // the entire branch (and the call site) from the production bundle
  // as unreachable code.
  log: (...args) => isDev && console.log(...args),
  info: (...args) => isDev && console.info(...args),
  debug: (...args) => isDev && console.debug(...args),
  trace: (...args) => isDev && console.trace(...args),

  // Group logs (dev only)
  group: (...args) => isDev && console.group(...args),
  groupEnd: () => isDev && console.groupEnd(),

  // Table logs (dev only)
  table: (...args) => isDev && console.table(...args),

  // Time logs (dev only)
  time: (...args) => isDev && console.time(...args),
  timeEnd: (...args) => isDev && console.timeEnd(...args),

  // ── Always-on ────────────────────────────────────────────────────────────
  // Genuine warnings — React deprecations, browser warnings, deprecation
  // notices from third-party libraries — must remain visible in
  // production so the support team sees them.
  warn: (...args) => console.warn(...args),

  // Genuine errors — unhandled exceptions, network failures, ErrorBoundary
  // catches, Sentry / Datadog RUM hooks — must remain visible in
  // production for crash reporting.
  error: (...args) => console.error(...args),
};

export default logger;
