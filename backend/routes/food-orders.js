"use strict";
/**
 * DEPRECATED ROUTES — Restaurant order legacy endpoints
 *
 * Status update + read endpoints (PATCH /:id/status, GET /my, GET /:id,
 * GET /restaurant/:restaurantId) have been REMOVED as part of the
 * restaurant-order unification. Restaurant vendors and customers should
 * use the unified Order endpoints:
 *
 *   Customer reads:    GET  /api/orders/my
 *   Single order:      GET  /api/orders/:id
 *   Status update:     PATCH /api/vendor/orders/:id/status   (vendor-side)
 *                      PATCH /api/orders/:id/status          (admin/owner)
 *   Restaurant list:   GET  /api/vendor/orders               (vendor-side)
 *
 * POST / remains as a backward-compatibility entry point. It now
 * delegates to order.service.createOrder so all restaurant orders
 * flow through the unified service pipeline (price recalc, revenue,
 * notifications).
 *
 * Why this file is being deleted piecemeal rather than in one shot:
 * the unification happens in staged phases so production order flow
 * is never broken. The PATCH/GET routes below return 410 Gone with
 * an explanatory message and a pointer to the new endpoint.
 */

const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

const { createCashOrder, createPaidOrder } = require("../services/order.service");
const { validate, createOrderSchema } = require("../utils/joiSchemas");

// Lightweight inline auth (mirrors food-orders.js pre-refactor so legacy
// clients can still POST). Uses the same JWT secret + payload shape as
// the shared middleware/auth.js so behavior matches.
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
      req.user = {
        userId: decoded.userId,
        id: decoded.userId,
        _id: decoded.userId,
        isAdmin: decoded.isAdmin,
        isVendor: decoded.isVendor,
        isRider: decoded.isRider,
      };
      next();
    } catch (err) {
      return res.status(401).json({ error: "Invalid token" });
    }
  } catch (err) {
    res.status(500).json({ error: "Authentication failed" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/food-orders
// Compatibility entry point — delegates to the unified order service so
// restaurant orders go through the same pipeline (price recalc, payment,
// revenue, notifications) as marketplace orders.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  try {
    const { error, value } = validate(req.body, createOrderSchema);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Force orderType: "food" so the unified service routes correctly.
    const orderInput = { ...value, orderType: "food", userId: req.userId };

    // The unified service auto-fires notifyOrderCreated internally.
    const order = orderInput.paymentMethod === "paystack"
      ? await createPaidOrder(orderInput)
      : await createCashOrder(orderInput);

    res.status(201).json(order);
  } catch (err) {
    console.error("[food-orders POST] Error:", err.message);
    res.status(500).json({ error: err.message || "Failed to create order" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Removed endpoints — 410 Gone with pointer to new endpoint.
// These responses are honest: the route no longer exists, but the client
// gets the new URL so it can self-heal on the next request.
// ─────────────────────────────────────────────────────────────────────────────
const gone = (newEndpoint) => (req, res) => {
  res.status(410).json({
    error: "This endpoint has been retired as part of the restaurant order unification.",
    use: newEndpoint,
    see: "https://docs.siishop.com/orders/unified",
  });
};

router.get("/my",                  gone("GET /api/orders/my?orderType=food"));
router.get("/restaurant/:rid",     gone("GET /api/vendor/orders"));
router.get("/:id",                 gone("GET /api/orders/:id"));
router.patch("/:id/status",        gone("PATCH /api/vendor/orders/:id/status"));
router.post("/:id/initialize-payment", gone("POST /api/orders/initialize-payment"));
router.post("/:id/verify-payment",     gone("POST /api/orders/verify-payment"));

module.exports = router;