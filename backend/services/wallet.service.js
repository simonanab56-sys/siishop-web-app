/**
 * Wallet Service - Business Logic for Vendor Wallet System
 *
 * CRITICAL ACCOUNTING RULES:
 * - ONLINE PAYMENTS: Credit vendor wallet with (order amount - commission)
 * - CASH ON DELIVERY: DO NOT credit wallet - track commission owed instead
 *
 * Handles:
 * - Order earnings (with commission calculation)
 * - Holding period management
 * - Withdrawal processing
 * - Transaction ledger
 * - COD commission tracking
 */

const mongoose = require("mongoose");
const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const Withdrawal = require("../models/Withdrawal");
const Settings = require("../models/Settings");
const Order = require("../models/Order");
const User = require("../models/User");
const paystackService = require("./paystack.service");

// Convert GHS to pesewas (minor units)
const toMinor = (amount) => Math.round(amount * 100);
// Convert pesewas to GHS
const toMajor = (amount) => amount / 100;

/**
 * Get or create settings (singleton)
 */
async function getSettings() {
  let settings = await Settings.findOne({ key: "global" });
  if (!settings) {
    settings = await Settings.create({ key: "global" });
  }
  return settings;
}

/**
 * Get or create wallet for a vendor
 */
async function getOrCreateWallet(vendorId) {
  let wallet = await Wallet.findOne({ vendorId });
  if (!wallet) {
    wallet = await Wallet.create({
      vendorId,
      availableBalance: 0,
      pendingBalance: 0,
      totalOnlineEarnings: 0,
      totalWithdrawn: 0,
      totalCommissionPaid: 0,
      totalCODSales: 0,
      commissionOwed: 0,
      commissionPaid: 0,
    });
  }
  return wallet;
}

/**
 * Get commission rate for an order item (global, category, or vendor-specific)
 */
async function getCommissionRate(vendorId, categoryId = null) {
  const settings = await getSettings();

  // Check vendor-specific rate first
  const vendorRate = settings.commission.vendorRates.get(String(vendorId));
  if (vendorRate !== undefined) {
    return vendorRate;
  }

  // Check category-specific rate
  if (categoryId) {
    const categoryRate = settings.commission.categoryRates.get(String(categoryId));
    if (categoryRate !== undefined) {
      return categoryRate;
    }
  }

  // Default to global rate
  return settings.commission.globalRate;
}

/**
 * Get holding period in days for an order item
 */
async function getHoldingPeriodDays(vendorId, categoryId = null) {
  const settings = await getSettings();

  // Check category-specific days
  if (categoryId) {
    const categoryDays = settings.holdingPeriod.categoryDays.get(String(categoryId));
    if (categoryDays !== undefined) {
      return categoryDays;
    }
  }

  // Default to global setting
  return settings.holdingPeriod.defaultDays;
}

/**
 * Calculate commission and net earnings for an amount
 */
function calculateCommission(amount, rate) {
  const commission = Math.round(amount * (rate / 100));
  const netEarnings = amount - commission;
  return { commission, netEarnings };
}

/**
 * Process order earnings - called when order is delivered
 *
 * CRITICAL LOGIC:
 * - If paymentMethod === "cash" (COD): DO NOT credit wallet, track commission owed
 * - If paymentMethod !== "cash" (Online): Credit wallet with net earnings
 */
async function processOrderEarnings(orderId) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const order = await Order.findById(orderId).session(session);
    if (!order) {
      throw new Error("Order not found");
    }

    // Check if earnings already processed
    if (order._walletEarningsProcessed) {
      await session.abortTransaction();
      return { success: false, message: "Earnings already processed" };
    }

    // CRITICAL: Check if this is a COD order. The order-creation flow leaves
    // paymentStatus="pending" for COD (see services/order.service.js#createOrder)
    // and nothing ever flips it to "paid" — the vendor collects cash at
    // delivery. We therefore admit both online-paid orders AND COD orders
    // here; the orderStatus="delivered" transition (set by the caller) is the
    // proof of payment for COD. Without this, every COD order would short-
    // circuit out of wallet processing and totalCODSales / commissionOwed
    // would stay at 0 forever.
    const isCOD = order.paymentMethod === "cash";

    const settings = await getSettings();
    const holdingDays = settings.holdingPeriod.defaultDays;

    // Process each vendor's items in the order
    const vendorItems = {};
    for (const item of order.items) {
      if (!item.vendorId) continue;
      const vendorIdStr = String(item.vendorId);
      if (!vendorItems[vendorIdStr]) {
        vendorItems[vendorIdStr] = [];
      }
      vendorItems[vendorIdStr].push(item);
    }

    const results = [];

    for (const [vendorIdStr, items] of Object.entries(vendorItems)) {
      const vendorId = new mongoose.Types.ObjectId(vendorIdStr);
      const itemTotal = items.reduce((sum, item) => {
        return sum + (item.price || 0) * (item.quantity || 1);
      }, 0);

      const itemTotalMinor = toMinor(itemTotal);

      // Get commission rate
      const commissionRate = await getCommissionRate(vendorIdStr);
      const { commission, netEarnings } = calculateCommission(itemTotalMinor, commissionRate);

      // Get or create wallet
      const wallet = await getOrCreateWallet(vendorId);

      if (isCOD) {
        // ============ COD HANDLING ============
        // DO NOT credit wallet - vendor already has the money
        // Instead, track commission owed to SiiShop
        wallet.totalCODSales += itemTotalMinor;
        wallet.commissionOwed += commission;
        await wallet.save();

        // Create COD transaction record
        await WalletTransaction.create([{
          walletId: wallet._id,
          vendorId,
          type: "cod_sale_recorded",
          amount: itemTotalMinor,
          balanceAfter: wallet.availableBalance + wallet.pendingBalance,
          orderId: order._id,
          status: "completed",
          description: `COD sale recorded - Order ${order._id}`,
          metadata: { paymentMethod: "cash" },
        }], { session });

        // Create commission due record
        await WalletTransaction.create([{
          walletId: wallet._id,
          vendorId,
          type: "commission_due",
          amount: commission,
          balanceAfter: wallet.availableBalance + wallet.pendingBalance,
          orderId: order._id,
          status: "pending",
          description: `Commission owed for COD order ${order._id}`,
          metadata: { paymentMethod: "cash", commissionRate },
        }], { session });

        results.push({
          vendorId: vendorIdStr,
          orderType: "COD",
          grossAmount: itemTotalMinor,
          commission,
          netEarnings: 0,
          walletCredited: false,
          commissionOwed: commission,
        });

      } else {
        // ============ ONLINE PAYMENT HANDLING ============
        // Credit vendor wallet with net earnings (after commission)

        // Calculate holding period
        const holdingPeriodDays = await getHoldingPeriodDays(vendorIdStr);
        const heldUntil = holdingPeriodDays > 0
          ? new Date(Date.now() + holdingPeriodDays * 24 * 60 * 60 * 1000)
          : null;

        // Update wallet based on holding period
        if (holdingPeriodDays === 0) {
          // No holding period - funds go directly to available
          wallet.availableBalance += netEarnings;
        } else {
          // Funds are held
          wallet.pendingBalance += netEarnings;
        }

        wallet.totalOnlineEarnings += netEarnings;
        wallet.totalCommissionPaid += commission;
        await wallet.save();

        // Create transaction records
        // 1. Commission transaction (goes to platform)
        await WalletTransaction.create([{
          walletId: wallet._id,
          vendorId,
          type: "commission",
          amount: commission,
          balanceAfter: wallet.availableBalance + wallet.pendingBalance,
          orderId: order._id,
          status: "completed",
          description: `Commission from online order ${order._id}`,
          metadata: { paymentMethod: order.paymentMethod },
        }], { session });

        // 2. Earning transaction
        const earningType = holdingPeriodDays === 0 ? "order_earning" : "held";
        await WalletTransaction.create([{
          walletId: wallet._id,
          vendorId,
          type: earningType,
          amount: netEarnings,
          balanceAfter: wallet.availableBalance + wallet.pendingBalance,
          orderId: order._id,
          status: "completed",
          description: `Earnings from online order ${order._id}`,
          heldUntil,
          metadata: { paymentMethod: order.paymentMethod },
        }], { session });

        // 3. If was held, create pending release record
        if (holdingPeriodDays > 0) {
          await WalletTransaction.create([{
            walletId: wallet._id,
            vendorId,
            type: "pending_release",
            amount: netEarnings,
            balanceAfter: wallet.availableBalance + wallet.pendingBalance,
            orderId: order._id,
            status: "pending",
            description: `Held funds pending release - Order ${order._id}`,
            heldUntil,
          }], { session });
        }

        results.push({
          vendorId: vendorIdStr,
          orderType: "ONLINE",
          grossAmount: itemTotalMinor,
          commission,
          netEarnings,
          holdingPeriodDays,
          walletCredited: true,
          commissionOwed: 0,
        });
      }
    }

    // Mark order as wallet-processed
    await Order.findByIdAndUpdate(
      orderId,
      { $set: { _walletEarningsProcessed: true } },
      { session }
    );

    await session.commitTransaction();

    return {
      success: true,
      message: `Processed earnings for ${results.length} vendor(s)`,
      codCount: results.filter(r => r.orderType === "COD").length,
      onlineCount: results.filter(r => r.orderType === "ONLINE").length,
      results,
    };
  } catch (error) {
    await session.abortTransaction();
    console.error("[WALLET] Error processing earnings:", error.message);
    return { success: false, message: error.message };
  } finally {
    await session.endSession();
  }
}

/**
 * Release held funds when holding period expires
 * Should be called by a scheduled job
 */
async function releaseHeldFunds() {
  try {
    const now = new Date();

    // Find held transactions that have expired
    const heldTransactions = await WalletTransaction.find({
      type: { $in: ["held", "pending_release"] },
      status: "completed",
      heldUntil: { $lte: now },
    });

    let released = 0;
    for (const txn of heldTransactions) {
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        const wallet = await Wallet.findById(txn.walletId).session(session);
        if (wallet && wallet.pendingBalance >= txn.amount) {
          wallet.pendingBalance -= txn.amount;
          wallet.availableBalance += txn.amount;
          await wallet.save();

          // Update transaction status
          txn.status = "released";
          await txn.save();

          // Create release transaction
          await WalletTransaction.create([{
            walletId: wallet._id,
            vendorId: txn.vendorId,
            type: "released",
            amount: txn.amount,
            balanceAfter: wallet.availableBalance + wallet.pendingBalance,
            orderId: txn.orderId,
            status: "completed",
            description: `Held funds released from order ${txn.orderId}`,
          }], { session });

          released++;
        }

        await session.commitTransaction();
      } catch (err) {
        await session.abortTransaction();
        console.error("[WALLET] Error releasing funds:", err.message);
      } finally {
        await session.endSession();
      }
    }

    return { success: true, released };
  } catch (error) {
    console.error("[WALLET] Error in releaseHeldFunds:", error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Process a withdrawal request
 */
async function processWithdrawal(vendorId, withdrawalData) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const settings = await getSettings();
    const amountMinor = toMinor(withdrawalData.amount);

    // Validate minimum amount
    if (amountMinor < toMinor(settings.withdrawal.minAmount)) {
      throw new Error(`Minimum withdrawal is GHS ${settings.withdrawal.minAmount}`);
    }

    // Validate maximum amount
    if (amountMinor > toMinor(settings.withdrawal.maxAmount)) {
      throw new Error(`Maximum withdrawal is GHS ${settings.withdrawal.maxAmount}`);
    }

    // Get wallet
    const wallet = await Wallet.findOne({ vendorId }).session(session);
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    // Check available balance (ONLY from online earnings - COD not withdrawable)
    if (wallet.availableBalance < amountMinor) {
      throw new Error("Insufficient available balance. Note: COD earnings cannot be withdrawn through the wallet system.");
    }

    // Calculate fee
    const feeMinor = Math.round(amountMinor * (settings.withdrawal.feePercentage / 100));
    const netAmountMinor = amountMinor - feeMinor;

    // Create withdrawal record
    const withdrawal = await Withdrawal.create([{
      vendorId,
      walletId: wallet._id,
      amount: amountMinor,
      method: withdrawalData.method,
      bankDetails: withdrawalData.bankDetails,
      mobileMoneyDetails: withdrawalData.mobileMoneyDetails,
      fee: feeMinor,
      netAmount: netAmountMinor,
      status: "pending",
    }], { session });

    // Deduct from available balance
    wallet.availableBalance -= amountMinor;
    await wallet.save();

    // Create transaction record
    await WalletTransaction.create([{
      walletId: wallet._id,
      vendorId,
      type: "withdrawal",
      amount: amountMinor,
      balanceAfter: wallet.availableBalance + wallet.pendingBalance,
      withdrawalId: withdrawal[0]._id,
      status: "pending",
      description: `Withdrawal request #${withdrawal[0]._id}`,
    }], { session });

    await session.commitTransaction();

    return {
      success: true,
      withdrawal: withdrawal[0],
    };
  } catch (error) {
    await session.abortTransaction();
    console.error("[WALLET] Error processing withdrawal:", error.message);
    return { success: false, message: error.message };
  } finally {
    await session.endSession();
  }
}

/**
 * Initialize a Paystack transaction for paying commission owed.
 *
 * This is step 1 of 2 in the commission payment flow. It only
 * calls Paystack to mint a reference + authorization URL — it does
 * NOT debit `commissionOwed` or create any WalletTransaction. The
 * real money movement + ledger entry happens in `payCommission`
 * after the vendor completes the popup and the server verifies the
 * reference.
 *
 * @param {String|ObjectId} vendorId  - the vendor's user _id
 * @param {Number} amount            - amount in GHS (major units)
 * @returns {Promise<{authorization_url, access_code, reference}>}
 */
async function initializeCommissionPayment(vendorId, amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number");
  }

  // Pre-check (without writing) so we don't call Paystack for a
  // request the server already knows is invalid.
  const wallet = await Wallet.findOne({ vendorId });
  if (!wallet) {
    throw new Error("Wallet not found");
  }
  const amountMinor = toMinor(amount);
  if (amountMinor > wallet.commissionOwed) {
    throw new Error(
      `Amount exceeds commission owed (${toMajor(wallet.commissionOwed)} GHS)`
    );
  }
  if (wallet.commissionOwed <= 0) {
    throw new Error("No commission owed");
  }

  const user = await User.findById(vendorId).select("email").lean();
  if (!user || !user.email) {
    throw new Error("Vendor email is not available for Paystack");
  }

  // Paystack amount is in the smallest currency unit. GHS uses pesewas,
  // so 1 GHS = 100. The order flow does the same conversion in
  // routes/orders.js#initialize-payment.
  return paystackService.initializeTransaction({
    email: user.email,
    amount: amountMinor,
    metadata: {
      purpose: "commission_payment",
      vendorId: String(vendorId),
    },
  });
}

/**
 * Pay commission owed (for COD orders) — Paystack-verified.
 *
 * This is step 2 of 2. It must be called ONLY after
 * `paystackService.verifyPaystackPayment(reference)` has returned
 * a success payload. The caller (the route) is responsible for
 * that verification; `payCommission` re-asserts the amount match
 * before writing the ledger.
 *
 * Idempotent: if a `commission_payment` WalletTransaction with the
 * same `paymentRef` already exists, the existing record is returned
 * without re-debiting. This makes duplicate verify calls safe.
 *
 * @param {String|ObjectId} vendorId     - the vendor's user _id
 * @param {Number} amount               - amount in GHS (major units)
 * @param {String} paymentRef           - the Paystack reference
 * @param {Object} paystackData         - the verified Paystack payload
 * @returns {Promise<{success, amountPaid, remainingOwed, paymentRef, alreadyProcessed?}>}
 */
async function payCommission(vendorId, amount, paymentRef, paystackData) {
  if (!paymentRef || typeof paymentRef !== "string") {
    throw new Error("paymentRef is required (Paystack must verify the payment first)");
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number");
  }
  if (!paystackData || paystackData.status !== "success") {
    throw new Error("Paystack data is not a successful payment");
  }

  // Idempotency: a second verify call with the same reference
  // returns the original record instead of double-debiting.
  const existing = await WalletTransaction.findOne({
    type: "commission_payment",
    paymentRef,
  }).lean();
  if (existing) {
    const wallet = await Wallet.findOne({ vendorId }).lean();
    return {
      success: true,
      alreadyProcessed: true,
      amountPaid: toMajor(existing.amount),
      remainingOwed: toMajor(wallet ? wallet.commissionOwed : 0),
      paymentRef,
    };
  }

  const amountMinor = toMinor(amount);

  // Re-assert the Paystack amount matches what the client claimed.
  // Paystack reports `amount` in kobo/pesewas, and the init step
  // already passed `amount: amountMinor`, so they must be equal.
  if (typeof paystackData.amount === "number" && paystackData.amount !== amountMinor) {
    throw new Error(
      `Amount mismatch: client sent ${amountMinor} but Paystack recorded ${paystackData.amount}`
    );
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const wallet = await Wallet.findOne({ vendorId }).session(session);
    if (!wallet) {
      throw new Error("Wallet not found");
    }
    if (amountMinor > wallet.commissionOwed) {
      throw new Error(
        `Amount exceeds commission owed (${toMajor(wallet.commissionOwed)} GHS)`
      );
    }

    // Update wallet balances.
    wallet.commissionOwed -= amountMinor;
    wallet.commissionPaid += amountMinor;
    await wallet.save();

    // Create the ledger entry. paymentRef is indexed on the model so
    // the idempotency check above stays O(log n) even after many
    // commission payments have been recorded.
    const txn = await WalletTransaction.create([{
      walletId: wallet._id,
      vendorId,
      type: "commission_payment",
      amount: amountMinor,
      balanceAfter: wallet.availableBalance + wallet.pendingBalance,
      paymentRef,
      status: "completed",
      description: `Commission payment via Paystack (ref: ${paymentRef})`,
      metadata: {
        paymentRef,
        customerEmail: paystackData.customerEmail,
        gatewayResponse: paystackData.gateway_response,
      },
    }], { session });

    await session.commitTransaction();

    return {
      success: true,
      amountPaid: amount,
      remainingOwed: toMajor(wallet.commissionOwed),
      paymentRef,
      transactionId: txn[0]._id,
    };
  } catch (error) {
    await session.abortTransaction();
    console.error("[WALLET] Error paying commission:", error.message);
    return { success: false, message: error.message };
  } finally {
    await session.endSession();
  }
}

/**
 * Approve a withdrawal request
 */
async function approveWithdrawal(withdrawalId, adminId) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const withdrawal = await Withdrawal.findById(withdrawalId).session(session);
    if (!withdrawal) {
      throw new Error("Withdrawal not found");
    }

    if (withdrawal.status !== "pending") {
      throw new Error("Withdrawal is not pending");
    }

    // In production, this would trigger Paystack transfer
    // For now, we'll simulate approval
    withdrawal.status = "approved";
    withdrawal.reviewedBy = adminId;
    withdrawal.reviewedAt = new Date();
    await withdrawal.save();

    // Update transaction
    await WalletTransaction.updateMany(
      { withdrawalId },
      { status: "completed" },
      { session }
    );

    // Update wallet total withdrawn
    const wallet = await Wallet.findById(withdrawal.walletId).session(session);
    if (wallet) {
      wallet.totalWithdrawn += withdrawal.netAmount;
      await wallet.save();
    }

    await session.commitTransaction();

    return { success: true, withdrawal };
  } catch (error) {
    await session.abortTransaction();
    console.error("[WALLET] Error approving withdrawal:", error.message);
    return { success: false, message: error.message };
  } finally {
    await session.endSession();
  }
}

/**
 * Reject a withdrawal request
 */
async function rejectWithdrawal(withdrawalId, adminId, reason) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const withdrawal = await Withdrawal.findById(withdrawalId).session(session);
    if (!withdrawal) {
      throw new Error("Withdrawal not found");
    }

    if (withdrawal.status !== "pending") {
      throw new Error("Withdrawal is not pending");
    }

    // Reject the withdrawal
    withdrawal.status = "rejected";
    withdrawal.reviewedBy = adminId;
    withdrawal.reviewedAt = new Date();
    withdrawal.rejectionReason = reason;
    await withdrawal.save();

    // Refund the amount to wallet
    const wallet = await Wallet.findById(withdrawal.walletId).session(session);
    if (wallet) {
      wallet.availableBalance += withdrawal.amount;
      await wallet.save();

      // Update transaction
      await WalletTransaction.updateMany(
        { withdrawalId },
        { status: "cancelled" },
        { session }
      );

      // Create refund transaction
      await WalletTransaction.create([{
        walletId: wallet._id,
        vendorId: withdrawal.vendorId,
        type: "refund",
        amount: withdrawal.amount,
        balanceAfter: wallet.availableBalance + wallet.pendingBalance,
        withdrawalId: withdrawal._id,
        status: "completed",
        description: `Withdrawal rejected: ${reason}`,
      }], { session });
    }

    await session.commitTransaction();

    return { success: true, withdrawal };
  } catch (error) {
    await session.abortTransaction();
    console.error("[WALLET] Error rejecting withdrawal:", error.message);
    return { success: false, message: error.message };
  } finally {
    await session.endSession();
  }
}

/**
 * Get wallet summary for a vendor
 */
async function getWalletSummary(vendorId) {
  const wallet = await getOrCreateWallet(vendorId);
  const settings = await getSettings();

  return {
    // Online payment wallet
    availableBalance: toMajor(wallet.availableBalance),
    pendingBalance: toMajor(wallet.pendingBalance),
    totalOnlineEarnings: toMajor(wallet.totalOnlineEarnings),
    totalWithdrawn: toMajor(wallet.totalWithdrawn),
    totalCommissionPaid: toMajor(wallet.totalCommissionPaid),

    // COD tracking
    totalCODSales: toMajor(wallet.totalCODSales),
    commissionOwed: toMajor(wallet.commissionOwed),
    commissionPaid: toMajor(wallet.commissionPaid),

    // Calculated fields
    withdrawableBalance: toMajor(wallet.availableBalance),
    outstandingCommission: toMajor(wallet.commissionOwed),

    currency: wallet.currency,
    isActive: wallet.isActive,
    bankDetails: wallet.bankDetails,
    mobileMoneyDetails: wallet.mobileMoneyDetails,
    settings: {
      minWithdrawal: settings.withdrawal.minAmount,
      maxWithdrawal: settings.withdrawal.maxAmount,
      withdrawalFee: settings.withdrawal.feePercentage,
      holdingPeriod: settings.holdingPeriod.defaultDays,
      commissionRate: settings.commission.globalRate,
    },
  };
}

/**
 * Get transaction history for a vendor
 */
async function getTransactionHistory(vendorId, options = {}) {
  const { page = 1, limit = 20, type } = options;
  const skip = (page - 1) * limit;

  const filter = { vendorId };
  if (type) {
    filter.type = type;
  }

  const [transactions, total] = await Promise.all([
    WalletTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    WalletTransaction.countDocuments(filter),
  ]);

  return {
    transactions: transactions.map(t => ({
      ...t,
      amount: toMajor(t.amount),
      balanceAfter: toMajor(t.balanceAfter),
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get withdrawal history for a vendor
 */
async function getWithdrawalHistory(vendorId, options = {}) {
  const { page = 1, limit = 20, status } = options;
  const skip = (page - 1) * limit;

  const filter = { vendorId };
  if (status) {
    filter.status = status;
  }

  const [withdrawals, total] = await Promise.all([
    Withdrawal.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Withdrawal.countDocuments(filter),
  ]);

  return {
    withdrawals: withdrawals.map(w => ({
      ...w,
      amount: toMajor(w.amount),
      netAmount: toMajor(w.netAmount),
      fee: toMajor(w.fee),
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

/**
 * Update bank details
 */
async function updateBankDetails(vendorId, bankDetails) {
  const wallet = await getOrCreateWallet(vendorId);
  wallet.bankDetails = bankDetails;
  await wallet.save();
  return { success: true, bankDetails: wallet.bankDetails };
}

/**
 * Update mobile money details
 */
async function updateMobileMoneyDetails(vendorId, mobileMoneyDetails) {
  const wallet = await getOrCreateWallet(vendorId);
  wallet.mobileMoneyDetails = mobileMoneyDetails;
  await wallet.save();
  return { success: true, mobileMoneyDetails: wallet.mobileMoneyDetails };
}

/**
 * Get admin analytics
 */
async function getAdminAnalytics() {
  const settings = await getSettings();

  const [totalVendors, walletStats, withdrawalStats] = await Promise.all([
    User.countDocuments({ isVendor: true, vendorStatus: "approved" }),
    Wallet.aggregate([
      {
        $group: {
          _id: null,
          totalAvailable: { $sum: "$availableBalance" },
          totalPending: { $sum: "$pendingBalance" },
          totalOnlineEarnings: { $sum: "$totalOnlineEarnings" },
          totalWithdrawn: { $sum: "$totalWithdrawn" },
          totalCommissionPaid: { $sum: "$totalCommissionPaid" },
          totalCODSales: { $sum: "$totalCODSales" },
          totalCommissionOwed: { $sum: "$commissionOwed" },
          totalCommissionPaidByVendors: { $sum: "$commissionPaid" },
        },
      },
    ]),
    Withdrawal.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]),
  ]);

  const pendingWithdrawals = withdrawalStats.find(s => s._id === "pending");
  const stats = walletStats[0] || {};

  return {
    totalVendors,
    // Online wallet stats
    totalAvailableBalance: toMajor(stats.totalAvailable || 0),
    totalPendingBalance: toMajor(stats.totalPending || 0),
    totalOnlineEarnings: toMajor(stats.totalOnlineEarnings || 0),
    totalWithdrawn: toMajor(stats.totalWithdrawn || 0),
    totalCommissionPaid: toMajor(stats.totalCommissionPaid || 0),

    // COD stats
    totalCODSales: toMajor(stats.totalCODSales || 0),
    totalCommissionOwed: toMajor(stats.totalCommissionOwed || 0),
    totalCommissionPaidByVendors: toMajor(stats.totalCommissionPaidByVendors || 0),

    // Withdrawals
    pendingWithdrawals: pendingWithdrawals?.count || 0,
    pendingWithdrawalAmount: toMajor(pendingWithdrawals?.totalAmount || 0),

    settings: {
      globalCommission: settings.commission.globalRate,
      defaultHoldingPeriod: settings.holdingPeriod.defaultDays,
      minWithdrawal: settings.withdrawal.minAmount,
      maxWithdrawal: settings.withdrawal.maxAmount,
      withdrawalFee: settings.withdrawal.feePercentage,
    },
  };
}

module.exports = {
  getSettings,
  getOrCreateWallet,
  getCommissionRate,
  getHoldingPeriodDays,
  calculateCommission,
  processOrderEarnings,
  releaseHeldFunds,
  processWithdrawal,
  initializeCommissionPayment,
  payCommission,
  approveWithdrawal,
  rejectWithdrawal,
  getWalletSummary,
  getTransactionHistory,
  getWithdrawalHistory,
  updateBankDetails,
  updateMobileMoneyDetails,
  getAdminAnalytics,
  toMinor,
  toMajor,
};