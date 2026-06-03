"use strict";

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const walletService = require("../services/wallet.service");
const withdrawalNotifications = require("../services/withdrawal-notification.service");
const Withdrawal = require("../models/Withdrawal");
const Wallet = require("../models/Wallet");
const User = require("../models/User");

// Apply auth to all routes
router.use(requireAuth);
router.use(requireAdmin);

/**
 * GET /api/admin/wallet/analytics
 * Get admin analytics
 */
router.get("/analytics", async (req, res) => {
  try {
    const analytics = await walletService.getAdminAnalytics();
    res.json(analytics);
  } catch (error) {
    console.error("[ADMIN WALLET] Error getting analytics:", error.message);
    res.status(500).json({ error: "Failed to get analytics" });
  }
});

/**
 * GET /api/admin/wallet/withdrawals
 * List all withdrawal requests
 */
router.get("/withdrawals", async (req, res) => {
  try {
    const { page = 1, limit = 20, status, sort = "-createdAt" } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};
    if (status) {
      filter.status = status;
    }

    const [withdrawals, total] = await Promise.all([
      Withdrawal.find(filter)
        .populate("vendorId", "name storeName email")
        .populate("reviewedBy", "name")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Withdrawal.countDocuments(filter),
    ]);

    res.json({
      withdrawals: withdrawals.map(w => ({
        ...w,
        amount: walletService.toMajor(w.amount),
        netAmount: walletService.toMajor(w.netAmount),
        fee: walletService.toMajor(w.fee),
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[ADMIN WALLET] Error getting withdrawals:", error.message);
    res.status(500).json({ error: "Failed to get withdrawals" });
  }
});

/**
 * GET /api/admin/wallet/withdrawal/:id
 * Get withdrawal details
 */
router.get("/withdrawal/:id", async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id)
      .populate("vendorId", "name storeName email phoneNumber")
      .populate("reviewedBy", "name")
      .lean();

    if (!withdrawal) {
      return res.status(404).json({ error: "Withdrawal not found" });
    }

    res.json({
      ...withdrawal,
      amount: walletService.toMajor(withdrawal.amount),
      netAmount: walletService.toMajor(withdrawal.netAmount),
      fee: walletService.toMajor(withdrawal.fee),
    });
  } catch (error) {
    console.error("[ADMIN WALLET] Error getting withdrawal:", error.message);
    res.status(500).json({ error: "Failed to get withdrawal" });
  }
});

/**
 * POST /api/admin/wallet/withdrawal/:id/approve
 * Approve a withdrawal request
 */
router.post("/withdrawal/:id/approve", async (req, res) => {
  try {
    const result = await walletService.approveWithdrawal(
      req.params.id,
      req.user.userId
    );

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Send notifications (async, don't wait - don't block response)
    withdrawalNotifications.notifyWithdrawalApproved(result.withdrawal).catch(err => {
      console.error("[ADMIN WALLET] Notification error:", err.message);
    });

    // TODO: Trigger Paystack transfer here

    res.json(result);
  } catch (error) {
    console.error("[ADMIN WALLET] Error approving withdrawal:", error.message);
    res.status(500).json({ error: "Failed to approve withdrawal" });
  }
});

/**
 * POST /api/admin/wallet/withdrawal/:id/reject
 * Reject a withdrawal request
 */
router.post("/withdrawal/:id/reject", async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: "Rejection reason is required" });
    }

    const result = await walletService.rejectWithdrawal(
      req.params.id,
      req.user.userId,
      reason
    );

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Send notifications (async, don't wait)
    withdrawalNotifications.notifyWithdrawalRejected(result.withdrawal, reason).catch(err => {
      console.error("[ADMIN WALLET] Notification error:", err.message);
    });

    res.json(result);
  } catch (error) {
    console.error("[ADMIN WALLET] Error rejecting withdrawal:", error.message);
    res.status(500).json({ error: "Failed to reject withdrawal" });
  }
});

/**
 * GET /api/admin/wallet/vendor/:vendorId
 * Get vendor wallet details
 */
router.get("/vendor/:vendorId", async (req, res) => {
  try {
    const vendorId = req.params.vendorId;

    // Check vendor exists
    const vendor = await User.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    const [summary, transactions] = await Promise.all([
      walletService.getWalletSummary(vendorId),
      walletService.getTransactionHistory(vendorId, { page: 1, limit: 50 }),
    ]);

    res.json({
      vendor: {
        id: vendor._id,
        name: vendor.name,
        storeName: vendor.storeName,
        email: vendor.email,
      },
      wallet: summary,
      recentTransactions: transactions.transactions,
    });
  } catch (error) {
    console.error("[ADMIN WALLET] Error getting vendor wallet:", error.message);
    res.status(500).json({ error: "Failed to get vendor wallet" });
  }
});

/**
 * GET /api/admin/wallet/settings
 * Get wallet settings
 */
router.get("/settings", async (req, res) => {
  try {
    const settings = await walletService.getSettings();
    res.json(settings);
  } catch (error) {
    console.error("[ADMIN WALLET] Error getting settings:", error.message);
    res.status(500).json({ error: "Failed to get settings" });
  }
});

/**
 * PUT /api/admin/wallet/settings
 * Update wallet settings
 */
router.put("/settings", async (req, res) => {
  try {
    const settings = await walletService.getSettings();

    // Update commission settings
    if (req.body.commission) {
      if (req.body.commission.globalRate !== undefined) {
        settings.commission.globalRate = req.body.commission.globalRate;
      }
    }

    // Update holding period
    if (req.body.holdingPeriod) {
      if (req.body.holdingPeriod.defaultDays !== undefined) {
        settings.holdingPeriod.defaultDays = req.body.holdingPeriod.defaultDays;
      }
    }

    // Update withdrawal settings
    if (req.body.withdrawal) {
      if (req.body.withdrawal.minAmount !== undefined) {
        settings.withdrawal.minAmount = req.body.withdrawal.minAmount;
      }
      if (req.body.withdrawal.maxAmount !== undefined) {
        settings.withdrawal.maxAmount = req.body.withdrawal.maxAmount;
      }
      if (req.body.withdrawal.feePercentage !== undefined) {
        settings.withdrawal.feePercentage = req.body.withdrawal.feePercentage;
      }
    }

    await settings.save();
    res.json(settings);
  } catch (error) {
    console.error("[ADMIN WALLET] Error updating settings:", error.message);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

/**
 * POST /api/admin/wallet/release-held
 * Manually trigger release of held funds
 */
router.post("/release-held", async (req, res) => {
  try {
    const result = await walletService.releaseHeldFunds();
    res.json(result);
  } catch (error) {
    console.error("[ADMIN WALLET] Error releasing held funds:", error.message);
    res.status(500).json({ error: "Failed to release held funds" });
  }
});

module.exports = router;