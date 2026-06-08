"use strict";

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const Order = require("../models/Order");
const { updateRevenueForPaidOrder } = require("../services/revenue");
const { notifyOrderCreated } = require("../services/notification.service");
const logger = require("../utils/logger");

/* ─── PAYSTACK WEBHOOK ────────────────────────────────────────────────────────
 * Paystack calls this when a transaction is completed.
 * IMPORTANT: This route must be registered BEFORE express.json() in server.js
 * so it receives the raw, un-parsed buffer body for signature verification.
 *
 * Expected headers:
 *   x-paystack-signature — HMAC-SHA512 signature of the raw request body
 *
 * Body format (raw JSON):
 *   { event: "charge.success", data: { reference: "...", status: "success" } }
 */
router.post(
  "/paystack",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;

    if (!secret) {
      console.error("[Webhook] PAYSTACK_SECRET_KEY not set");
      return res.status(500).json({ error: "Server misconfigured" });
    }

    const signature = req.headers["x-paystack-signature"];
    if (!signature) {
      console.warn("[Webhook] Missing x-paystack-signature header");
      return res.status(400).json({ error: "Missing signature" });
    }

    // Compute expected signature
    const rawBody = req.body; // Buffer (raw body middleware)
    const expectedSig = crypto
      .createHmac("sha512", secret)
      .update(rawBody)
      .digest("hex");

    if (signature !== expectedSig) {
      console.warn("[Webhook] Signature mismatch — rejecting request");
      return res.status(401).json({ error: "Invalid signature" });
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString());
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }

    logger.log(`[Webhook] Received event: ${event.event}`, JSON.stringify(event.data || {}));

    if (event.event === "charge.success") {
      const tx = event.data;
      const ref = tx.reference;

      if (!ref) {
        console.warn("[Webhook] No reference in charge.success event");
        return res.json({ received: true });
      }

      const existingOrder = await Order.findOne({ paymentRef: ref });

      if (existingOrder) {
        if (existingOrder.paymentStatus !== "paid") {
          existingOrder.paymentStatus = "paid";
          existingOrder.orderStatus = "confirmed";
          await existingOrder.save();
          logger.log(`[Webhook] Order ${existingOrder._id} marked PAID via webhook for ref ${ref}`);

          // ✅ ADDED: Update vendor revenue when order is paid
          const revenueResult = await updateRevenueForPaidOrder(existingOrder._id);
          if (revenueResult.success) {
            logger.log(`[Webhook] Revenue updated for order ${existingOrder._id}`);
          } else {
            console.warn(`[Webhook] Revenue update failed: ${revenueResult.message}`);
          }

          // Send email notifications (async, don't block)
          notifyOrderCreated(existingOrder).catch((err) => {
            console.error(`[Webhook] Failed to send notifications:`, err.message);
          });
        } else {
          logger.log(`[Webhook] Order ${existingOrder._id} already paid, skipping`);
        }
      } else {
        // Order not found — could be a duplicate webhook or the order was created
        // through a different flow. Log but don't fail.
        console.warn(`[Webhook] No order found for paymentRef: ${ref}`);
      }
    }

    // Always acknowledge receipt quickly
    res.json({ received: true });
  }
);

module.exports = router;