"use strict";

const express = require("express");
const router = express.Router();
const { requireAuth, requireVendor } = require("../middleware/auth");
const walletService = require("../services/wallet.service");
const paystackService = require("../services/paystack.service");
const withdrawalNotifications = require("../services/withdrawal-notification.service");
const commissionNotifications = require("../services/commission-notification.service");

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
 * Commission payment via Paystack — two-step flow.
 *
 * Step 1 — POST /api/wallet/commission/initialize { amount }
 *   Calls Paystack's initialize endpoint, returns
 *   { authorization_url, access_code, reference }. Does NOT debit
 *   `commissionOwed` or write any ledger entry. The vendor opens
 *   `authorization_url` in the Paystack popup.
 *
 * Step 2 — POST /api/wallet/commission/verify { paymentRef, amount }
 *   Re-verifies `paymentRef` with Paystack BEFORE touching the
 *   wallet. If Paystack says "success" AND the amount matches, the
 *   commission is debited and a `commission_payment`
 *   WalletTransaction is recorded. On any failure the wallet is
 *   left untouched and a 4xx/5xx error is returned.
 *
 * Why two endpoints instead of one: a single endpoint that
 * "trusts the client" defeats the whole point of Paystack. Splitting
 * the flow keeps the verification step explicit and audit-able.
 */

/**
 * POST /api/wallet/commission/initialize
 * Initialize a Paystack transaction for paying commission owed.
 */
router.post("/commission/initialize", async (req, res) => {
  try {
    const { amount } = req.body;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "A positive amount (GHS) is required" });
    }

    const init = await walletService.initializeCommissionPayment(
      req.user.userId,
      amount
    );
    res.json(init);
  } catch (error) {
    // Pre-check / Paystack errors land here. The Paystack service
    // throws "Failed to reach Paystack API…" for network failures,
    // which we surface as 502 to make upstream alerting easy.
    const msg = error.message || "Failed to initialize commission payment";
    const isNetwork = msg.includes("Failed to reach Paystack");
    console.error("[WALLET] Commission init error:", msg);
    res.status(isNetwork ? 502 : 400).json({ error: msg });
  }
});

/**
 * POST /api/wallet/commission/verify
 * Verify the Paystack reference and record the commission payment.
 */
router.post("/commission/verify", async (req, res) => {
  try {
    const { paymentRef, amount } = req.body;
    if (!paymentRef || typeof paymentRef !== "string") {
      return res.status(400).json({ error: "paymentRef is required" });
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "A positive amount (GHS) is required" });
    }

    // Re-verify with Paystack before touching the wallet. This is
    // the single source of truth for whether the payment actually
    // happened. Throws on failure (network, status !== "success",
    // etc.) — we surface those as 402 to make the client UX clearer.
    let paystackData;
    try {
      paystackData = await paystackService.verifyPaystackPayment(paymentRef);
    } catch (err) {
      const msg = err.message || "Paystack verification failed";
      const isNetwork = msg.includes("Failed to reach Paystack");
      const isStatus = msg.includes("Payment not successful");
      console.error("[WALLET] Paystack verify error:", msg);
      return res
        .status(isNetwork ? 502 : isStatus ? 402 : 400)
        .json({ error: msg });
    }

    // paystackData.amount is in kobo/pesewas. The init step passed
    // `amount` as pesewas, so they must match if the popup wasn't
    // tampered with. The service re-asserts this too — we pass the
    // Paystack payload through so the service can compare.
    const result = await walletService.payCommission(
      req.user.userId,
      amount,
      paymentRef,
      paystackData
    );

    if (!result.success) {
      // The service may also throw — those land in the catch below.
      // This branch covers returns with success=false (e.g. wallet
      // amount > commissionOwed detected during the session).
      return res.status(400).json({ error: result.message });
    }

    // Send the 201 first so the vendor's UI updates immediately,
    // then fire the admin + vendor notification fan-out as a
    // fire-and-forget promise. The notification service NEVER
    // throws (its outer try/catch swallows all errors and logs them)
    // so this `.catch()` is a belt-and-braces final guard.
    //
    // Idempotency gate: we only fan out when the payment is
    // genuinely new (`!alreadyProcessed`). A duplicate verify call
    // (e.g. the user reloads the success page and the client retries
    // the request, or Paystack is verified twice for some reason)
    // returns the same result with `alreadyProcessed: true`, and we
    // skip the entire notification path. The notification service
    // also has its own findOne guard and a partial unique index on
    // Notification.metadata.paymentRef — three layers, see
    // commission-notification.service.js for the full defense.
    res.status(201).json(result);

    if (!result.alreadyProcessed) {
      commissionNotifications
        .notifyCommissionPaid({
          vendorId: req.user.userId,
          amount: result.amountPaid,
          paymentRef: result.paymentRef,
          transactionId: result.transactionId,
        })
        .catch((err) => {
          // The notification service already logs internally, but
          // log here too so a thrown error in a future refactor
          // doesn't go silently missing.
          console.error("[WALLET] Commission notification fan-out error:", err.message);
        });
    }
  } catch (error) {
    const msg = error.message || "Failed to verify commission payment";
    console.error("[WALLET] Commission verify error:", msg);
    res.status(500).json({ error: msg });
  }
});

module.exports = router;