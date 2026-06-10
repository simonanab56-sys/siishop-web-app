"use strict";

const express = require("express");
const router = express.Router();

const Order = require("../models/Order");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const { validate, createOrderSchema, initializePaymentSchema, verifyPaymentSchema, updateOrderStatusSchema } = require("../utils/joiSchemas");
const logger = require("../utils/logger");

const {
  createCashOrder,
  createPaidOrder,
} = require("../services/order.service");
const { notifyOrderStatusUpdate } = require("../services/notification.service");

/* ─── INITIALIZE PAYMENT ────────────────────────────────────────── */
/* POST /api/orders/initialize-payment
 * Body: { email, amount }
 */
router.post(
  "/initialize-payment",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { error, value } = validate(req.body, initializePaymentSchema);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, amount } = value;
    const { initializeTransaction } = require("../services/paystack.service");

    // Paystack expects amount in kobo
    const amountInKobo = Math.round(amount * 100);

    const data = await initializeTransaction({
      email,
      amount: amountInKobo,
      metadata: {
        userId: req.user.userId,
      },
    });

    res.json(data);
  })
);

/* ─── PAYMENT VERIFICATION (FIXED) ───────────────────────────────── */
/* POST /api/orders/verify-payment
 * Body: { paymentRef, orderId }
 */
router.post(
  "/verify-payment",
  requireAuth,
  asyncHandler(async (req, res) => {
    // ✅ FIXED: Validate input
    const { error, value } = validate(req.body, verifyPaymentSchema);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { paymentRef, orderId } = value;

    // ✅ Get order from DB
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const { verifyPaystackPayment } = require("../services/paystack.service");
    const paystackData = await verifyPaystackPayment(paymentRef);

    // ✅ Convert DB amount to kobo
    const expectedInKobo = Math.round(order.totalAmount * 100);

    logger.log("[VERIFY PAYMENT]");
    logger.log("DB amount:", expectedInKobo);
    logger.log("Paystack amount:", paystackData.amount);

    // ✅ Strict check
    if (paystackData.amount !== expectedInKobo) {
      return res.status(402).json({
        error: "Amount mismatch",
        detail: {
          expected: expectedInKobo,
          received: paystackData.amount,
        },
      });
    }

    if (paystackData.status !== "success") {
      return res.status(402).json({ error: "Payment not successful" });
    }

    // ✅ Update order
    order.paymentStatus = "paid";
    order.paymentRef = paymentRef;
    await order.save();

    res.json({
      verified: true,
      reference: paystackData.reference,
      amount: paystackData.amount,
    });
  })
);

/* ─── GET ALL (ADMIN) ───────────────────────────────────────── */
router.get(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .lean();

    res.json(orders);
  })
);

/* ─── MY ORDERS ─────────────────────────────────────────────── */
router.get(
  "/my",
  requireAuth,
  asyncHandler(async (req, res) => {
    const orders = await Order.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .lean();

    res.json(orders);
  })
);

/* ─── CREATE ORDER ──────────────────────────────────────────── */
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    // ✅ FIXED: Validate input
    const { error, value } = validate(req.body, createOrderSchema);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { paymentMethod = "paystack", paymentRef, ...data } = value;

    const payload = {
      ...data,
      userId: req.user.userId,
    };

    const order =
      paymentMethod === "cash"
        ? await createCashOrder(payload)
        : await createPaidOrder({ ...payload, paymentRef });

    res.status(201).json(order);
  })
);

/* ─── SINGLE ORDER ─────────────────────────────────────────── */
router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).lean();

    if (!order) return res.status(404).json({ error: "Order not found" });

    if (!req.user.isAdmin && String(order.userId) !== req.user.userId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    res.json(order);
  })
);

/* ─── UPDATE ORDER STATUS ───────────────────────────────────── */
router.patch(
  "/:id/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    // ✅ FIXED: Validate input
    const { error, value } = validate(req.body, updateOrderStatusSchema);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { orderStatus } = value;

    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ error: "Order not found" });

    if (!req.user.isAdmin && String(order.userId) !== req.user.userId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const oldStatus = order.orderStatus;
    order.orderStatus = orderStatus;

    // Set deliveredAt timestamp when order is delivered
    if (orderStatus === "delivered" && !order.deliveredAt) {
      order.deliveredAt = new Date();
    }

    await order.save();

    // Send status update notification to customer (async, don't block response)
    notifyOrderStatusUpdate(order._id, oldStatus, orderStatus).catch((err) => {
      console.error(`[Order] Failed to send status notification:`, err.message);
    });

    res.json(order);
  })
);

/* ─── DELETE ORDER (ADMIN) ─────────────────────────────────── */
router.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const order = await Order.findByIdAndDelete(req.params.id);

    if (!order) return res.status(404).json({ error: "Order not found" });

    res.json({ message: "Order deleted" });
  })
);

module.exports = router;
