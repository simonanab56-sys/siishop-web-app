"use strict";

const express = require("express");
const router = express.Router();

const Order = require("../models/Order");
const Product = require("../models/Product");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const { validate, createOrderSchema, initializePaymentSchema, verifyPaymentSchema, updateOrderStatusSchema } = require("../utils/joiSchemas");
const logger = require("../utils/logger");

const {
  createCashOrder,
  createPaidOrder,
} = require("../services/order.service");
const { notifyOrderStatusUpdate, notifyOrderDelivered, buildPendingReviewItems } = require("../services/notification.service");

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

    // ✅ NEW (Task 7): When an order transitions to "delivered", increment salesCount
    // on each affected marketplace product. This powers the "Best Sellers" and
    // "Most Purchased" automatic homepage sections. Fire-and-forget — if it fails,
    // the section will just be slightly stale until the next order is delivered.
    if (orderStatus === "delivered" && oldStatus !== "delivered") {
      try {
        const incOps = (order.items || [])
          .filter((it) => it && it.productId && it.itemType !== "food")
          .map((it) => ({
            updateOne: {
              filter: { _id: it.productId, productType: { $ne: "food" } },
              update: { $inc: { salesCount: Number(it.quantity) || 1 } },
            },
          }));
        if (incOps.length > 0) {
          await Product.bulkWrite(incOps, { ordered: false });
        }
      } catch (err) {
        console.error("[Order] Failed to increment salesCount:", err.message);
      }
    }

    // Send status update notification to customer (async, don't block response)
    notifyOrderStatusUpdate(order._id, oldStatus, orderStatus).catch((err) => {
      console.error(`[Order] Failed to send status notification:`, err.message);
    });

    // ✅ Review-flow: when an order transitions to "delivered" we also
    // create in-app "leave a review" notifications for the customer —
    // one per unique product (or restaurant) in the order. See
    // services/notification.service.js#notifyOrderDelivered.
    // Fired async + best-effort so notification failures never block
    // the status response.
    if (orderStatus === "delivered" && oldStatus !== "delivered") {
      notifyOrderDelivered(order, req.app.get("io")).catch((err) => {
        console.error(`[Order] Failed to send review notification:`, err.message);
      });
    }

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

/* ─── PENDING REVIEWS FOR AN ORDER ─────────────────────────────────
 * GET /api/orders/:id/pending-reviews
 *
 * Returns the list of items in this order that the current customer
 * can still review. The list is consumed by the review page so it can
 * pre-render the form for every product/food in the order. The
 * backend is the source of truth for eligibility (order owner +
 * delivered status + no prior review), the frontend just renders.
 *
 * Response shape:
 *   { orderId, orderStatus, items: [PendingReviewItem] }
 *
 * Returns 404 if the order does not exist OR does not belong to the
 * caller. We collapse the "not yours" case into the same response as
 * "doesn't exist" so an unauthorized caller cannot probe other
 * customers' order ids.
 */
router.get(
  "/:id/pending-reviews",
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).lean();
    if (!order || String(order.userId) !== String(req.user.userId)) {
      return res.status(404).json({ error: "This order is no longer available." });
    }

    // Look up the customer's existing reviews for this order so we can
    // mark each item alreadyReviewed. The buildPendingReviewItems
    // helper is shared with notifyOrderDelivered so the server-side
    // and client-side definitions of "pending" stay in lockstep.
    const ProductReview = require("../models/ProductReview");
    const RestaurantReview = require("../models/RestaurantReview");
    const [productReviews, restaurantReviews] = await Promise.all([
      ProductReview.find({ orderId: order._id }).select("productId").lean(),
      RestaurantReview.find({ orderId: order._id }).select("restaurantId").lean(),
    ]);
    const existingReviews = {
      product: new Set(productReviews.map((r) => `${String(r.productId)}:${String(order._id)}`)),
      food: new Set(restaurantReviews.map((r) => `${String(r.restaurantId)}:${String(order._id)}`)),
    };

    const items = buildPendingReviewItems(order, existingReviews);

    res.json({
      orderId: String(order._id),
      orderStatus: order.orderStatus,
      items,
    });
  })
);

module.exports = router;
