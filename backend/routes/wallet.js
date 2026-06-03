"use strict";

const express = require("express");
const router = express.Router();
const { requireAuth, requireVendor } = require("../middleware/auth");
const walletService = require("../services/wallet.service");
const withdrawalNotifications = require("../services/withdrawal-notification.service");

// Apply auth to all routes
router.use(requireAuth);
router.use(requireVendor);

/**
 * GET /api/wallet/summary
 * Get wallet summary
 */
router.get("/summary", async (req, res) => {
  try {
    const summary = await walletService.getWalletSummary(req.user.userId);
    res.json(summary);
  } catch (error) {
    console.error("[WALLET] Error getting summary:", error.message);
    res.status(500).json({ error: "Failed to get wallet summary" });
  }
});

/**
 * GET /api/wallet/transactions
 * Get transaction history
 */
router.get("/transactions", async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const transactions = await walletService.getTransactionHistory(req.user.userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      type,
    });
    res.json(transactions);
  } catch (error) {
    console.error("[WALLET] Error getting transactions:", error.message);
    res.status(500).json({ error: "Failed to get transactions" });
  }
});

/**
 * GET /api/wallet/withdrawals
 * Get withdrawal history
 */
router.get("/withdrawals", async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const withdrawals = await walletService.getWithdrawalHistory(req.user.userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
    });
    res.json(withdrawals);
  } catch (error) {
    console.error("[WALLET] Error getting withdrawals:", error.message);
    res.status(500).json({ error: "Failed to get withdrawals" });
  }
});

/**
 * POST /api/wallet/withdraw
 * Request a withdrawal
 */
router.post("/withdraw", async (req, res) => {
  try {
    const { amount, method, bankDetails, mobileMoneyDetails } = req.body;

    // Validate required fields
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    if (!method || !["bank_transfer", "mobile_money"].includes(method)) {
      return res.status(400).json({ error: "Valid withdrawal method is required" });
    }

    if (method === "bank_transfer") {
      if (!bankDetails?.bankName || !bankDetails?.accountNumber || !bankDetails?.accountName) {
        return res.status(400).json({ error: "Bank details are required" });
      }
    }

    if (method === "mobile_money") {
      if (!mobileMoneyDetails?.provider || !mobileMoneyDetails?.phoneNumber) {
        return res.status(400).json({ error: "Mobile money details are required" });
      }
    }

    const result = await walletService.processWithdrawal(req.user.userId, {
      amount,
      method,
      bankDetails,
      mobileMoneyDetails,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Send notifications (async, don't block response)
    if (result.withdrawal) {
      withdrawalNotifications.notifyWithdrawalSubmitted(result.withdrawal).catch(err => {
        console.error("[WALLET] Notification error:", err.message);
      });
    }

    res.status(201).json(result);
  } catch (error) {
    console.error("[WALLET] Error processing withdrawal:", error.message);
    res.status(500).json({ error: "Failed to process withdrawal" });
  }
});

/**
 * PUT /api/wallet/bank-details
 * Update bank details
 */
router.put("/bank-details", async (req, res) => {
  try {
    const { bankName, accountNumber, accountName, branchCode } = req.body;

    if (!bankName || !accountNumber || !accountName) {
      return res.status(400).json({ error: "Bank name, account number, and account name are required" });
    }

    const result = await walletService.updateBankDetails(req.user.userId, {
      bankName,
      accountNumber,
      accountName,
      branchCode,
    });

    res.json(result);
  } catch (error) {
    console.error("[WALLET] Error updating bank details:", error.message);
    res.status(500).json({ error: "Failed to update bank details" });
  }
});

/**
 * PUT /api/wallet/mobile-money
 * Update mobile money details
 */
router.put("/mobile-money", async (req, res) => {
  try {
    const { provider, phoneNumber, accountName } = req.body;

    if (!provider || !phoneNumber) {
      return res.status(400).json({ error: "Provider and phone number are required" });
    }

    if (!["mtn", "telecel", "airteltigo"].includes(provider)) {
      return res.status(400).json({ error: "Invalid provider" });
    }

    const result = await walletService.updateMobileMoneyDetails(req.user.userId, {
      provider,
      phoneNumber,
      accountName,
    });

    res.json(result);
  } catch (error) {
    console.error("[WALLET] Error updating mobile money:", error.message);
    res.status(500).json({ error: "Failed to update mobile money details" });
  }
});

/**
 * POST /api/wallet/pay-commission
 * Pay outstanding commission for COD orders
 */
router.post("/pay-commission", async (req, res) => {
  try {
    const { amount, paymentMethod, paymentDetails } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    if (!paymentMethod || !["paystack", "mobile_money", "bank_transfer"].includes(paymentMethod)) {
      return res.status(400).json({ error: "Valid payment method is required" });
    }

    const result = await walletService.payCommission(req.user.userId, amount, paymentMethod, paymentDetails);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.status(201).json(result);
  } catch (error) {
    console.error("[WALLET] Error paying commission:", error.message);
    res.status(500).json({ error: "Failed to pay commission" });
  }
});

module.exports = router;