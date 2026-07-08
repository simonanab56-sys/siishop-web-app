"use strict";

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const walletService = require("../services/wallet.service");
const withdrawalNotifications = require("../services/withdrawal-notification.service");
const Withdrawal = require("../models/Withdrawal");
const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const User = require("../models/User");
const Order = require("../models/Order");
const Settings = require("../models/Settings");

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

/* ════════════════════════════════════════════════════════════════════════════
 * ADMIN COMMISSIONS & PAYOUTS — per-vendor financial control center.
 *
 * Three new GET endpoints (analytics, list, detail) sit alongside the
 * existing /admin/wallet/* routes. They are read-only and additive:
 * the existing /admin/wallet/analytics, /withdrawals, and
 * /vendor/:id endpoints are unchanged. The new page consumes these.
 *
 * Why a new shape instead of extending the existing analytics endpoint:
 * the existing /admin/wallet/analytics is platform-wide totals, and
 * the new Admin Commissions page is a per-vendor rollup. Conflating
 * them would change the response shape of an endpoint the existing
 * AdminWallet tab already consumes.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * GET /api/admin/wallet/commissions/analytics
 *
 * Platform-wide summary for the 9 stat cards. All amounts in GHS (major
 * units). Distinct from the existing /admin/wallet/analytics — that one
 * returns wallet/withdrawal totals only, this one returns the
 * per-vendor rollup totals needed by the new Commissions page.
 */
router.get("/commissions/analytics", async (req, res) => {
  try {
    const settings = await Settings.findOne().lean();
    const globalRate = settings?.commission?.globalRate ?? 0;

    const [
      totalVendors,
      walletAgg,
      pendingWithdrawalsAgg,
      paidWithdrawalsAgg,
      commissionPaymentsAgg,
    ] = await Promise.all([
      User.countDocuments({ isVendor: true, vendorStatus: "approved" }),
      // All wallet fields summed across every vendor with a wallet.
      // (Vendors with no wallet are excluded here; the count
      // `totalVendors` covers the "no wallet" case separately.)
      Wallet.aggregate([
        {
          $group: {
            _id: null,
            totalAvailable: { $sum: "$availableBalance" },
            totalPending: { $sum: "$pendingBalance" },
            totalOnlineEarnings: { $sum: "$totalOnlineEarnings" },
            totalWithdrawn: { $sum: "$totalWithdrawn" },
            totalCommissionPaid: { $sum: "$totalCommissionPaid" },
            totalCommissionOwed: { $sum: "$commissionOwed" },
            totalCommissionPaidByVendors: { $sum: "$commissionPaid" },
            totalCODSales: { $sum: "$totalCODSales" },
            // Count of vendors that owe commission — this is the
            // "Vendors Owing Commission" stat card. We can't just
            // `count(wallet.commissionOwed > 0)` from the aggregate
            // (Mongo's $cond on $sum works but $count inside $group
            // is awkward), so we use a separate field that's the
            // count-per-wallet and sum it.
            vendorsOwingCommission: {
              $sum: { $cond: [{ $gt: ["$commissionOwed", 0] }, 1, 0] },
            },
          },
        },
      ]),
      Withdrawal.aggregate([
        { $match: { status: "pending" } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
      ]),
      Withdrawal.aggregate([
        { $match: { status: { $in: ["approved", "completed"] } } },
        { $group: { _id: null, totalNet: { $sum: "$netAmount" } } },
      ]),
      WalletTransaction.aggregate([
        { $match: { type: "commission_payment" } },
        { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
      ]),
    ]);

    const w = walletAgg[0] || {};
    const pending = pendingWithdrawalsAgg[0] || { count: 0, totalAmount: 0 };
    const paid = paidWithdrawalsAgg[0] || { totalNet: 0 };
    const codSettled = commissionPaymentsAgg[0]?.totalAmount || 0;

    // "Platform Revenue" = lifetime commission SiiShop has earned,
    // from BOTH online orders (wallet.totalCommissionPaid) AND COD
    // orders that the vendor has settled (the sum of every
    // commission_payment WalletTransaction). The two halves come from
    // different code paths (online commission is auto-credited at
    // order delivery; COD commission is settled by the vendor via
    // Paystack later), so we sum both.
    const platformRevenueMinor =
      (w.totalCommissionPaid || 0) + codSettled;
    const totalCommissionCollectedMinor =
      (w.totalCommissionPaid || 0) + codSettled;

    return res.json({
      totalVendors,
      vendorsOwingCommission: w.vendorsOwingCommission || 0,
      totalOutstandingCommission: walletService.toMajor(
        w.totalCommissionOwed || 0
      ),
      totalVendorEarnings: walletService.toMajor(
        w.totalOnlineEarnings || 0
      ),
      pendingWithdrawalRequests: pending.count,
      totalPendingPayouts: walletService.toMajor(pending.totalAmount || 0),
      totalPaidOut: walletService.toMajor(paid.totalNet || 0),
      totalCommissionCollected: walletService.toMajor(
        totalCommissionCollectedMinor
      ),
      platformRevenue: walletService.toMajor(platformRevenueMinor),
      settings: {
        globalCommissionRate: globalRate,
      },
    });
  } catch (error) {
    console.error("[ADMIN COMMISSIONS] analytics error:", error.message);
    res.status(500).json({ error: "Failed to load commissions analytics" });
  }
});

/**
 * GET /api/admin/wallet/commissions/vendors
 *
 * Paginated, filterable list of every approved vendor with the 16
 * per-vendor columns the Commissions page renders. All amounts in GHS
 * (major units).
 *
 * Query params:
 *   - vendorType   "marketplace" | "restaurant" | "all"  (default "all")
 *   - status       "outstanding" | "withdrawal" | "paid" | "pending" | "suspended"
 *   - search       case-insensitive substring of name/storeName/restaurantName
 *   - page         1-based (default 1)
 *   - limit        default 100
 *   - dateFrom     ISO date; filters vendors whose lastWithdrawalDate >= dateFrom
 *   - dateTo       ISO date; filters vendors whose lastWithdrawalDate <= dateTo
 *
 * Implementation: 4 parallel queries (User, Order-aggregate per vendor,
 * all Withdrawals for the filtered set, all commission_payment
 * WalletTransactions for the filtered set) merged in JS. The four
 * queries are independent so they run in parallel. The per-vendor
 * merge is O(N) where N is the number of approved vendors (typically
 * <500).
 */
router.get("/commissions/vendors", async (req, res) => {
  try {
    const {
      vendorType = "all",
      status = "all",
      search = "",
      page = 1,
      limit = 100,
      dateFrom,
      dateTo,
    } = req.query;

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit) || 100, 1), 500);

    // 1) Build the User filter. We include vendors in ANY vendorStatus
    // (approved, suspended, pending) so the "Suspended" status
    // filter can surface suspended vendors with historical wallet
    // data — the admin still needs to audit them. The `search` and
    // `vendorType` filters narrow further.
    const userFilter = { isVendor: true };
    if (vendorType === "marketplace" || vendorType === "restaurant") {
      userFilter.vendorType = vendorType;
    }
    if (search && String(search).trim()) {
      const re = new RegExp(
        String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i"
      );
      // Match against the User's name/storeName OR the embedded
      // restaurant name. Mongoose's $or + $regex supports dotted
      // paths for subdocument fields directly.
      userFilter.$or = [
        { name: re },
        { storeName: re },
        { "restaurantDetails.restaurantName": re },
      ];
    }

    // 2) Pull all matching users (paginated AFTER the JS merge so the
    // date filter, status filter, and restaurant-name match can run
    // first). We cap at 2000 to keep the per-request payload sane;
    // most platforms have well under 500 approved vendors.
    //
    // `createdAt` is included so the table can show the registration
    // date and the "By age" sort, and `idType`/`idFrontImage`/
    // `idBackImage` are excluded here because the per-row table has
    // no use for them (they're surfaced in the detail drawer only).
    const allUsers = await User.find(userFilter)
      .select(
        "name email phoneNumber username storeName vendorType vendorStatus kycStatus approvedAt createdAt restaurantDetails"
      )
      .lean();

    // Pre-derive businessName once per vendor (no repeated ternaries
    // downstream). Restaurant vendors get their restaurant name,
    // marketplace vendors get their store name, both fall back to
    // the User's name.
    const userRows = allUsers.map((u) => ({
      ...u,
      businessName:
        u.vendorType === "restaurant"
          ? u.restaurantDetails?.restaurantName || u.storeName || u.name
          : u.storeName || u.name,
    }));

    const vendorIds = userRows.map((u) => u._id);

    if (vendorIds.length === 0) {
      return res.json({
        vendors: [],
        pagination: { page: pageNum, limit: limitNum, total: 0, pages: 0 },
      });
    }

    // 3) Per-vendor sales + order count. Match the same vendor-scope
    // rule as restaurantStats.service.js (vendorId OR items.vendorId)
    // so a multi-vendor order contributes to BOTH vendors' counts.
    const orderAgg = await Order.aggregate([
      {
        $match: {
          $or: [
            { vendorId: { $in: vendorIds.map((id) => new mongoose.Types.ObjectId(String(id))) } },
            { "items.vendorId": { $in: vendorIds.map((id) => new mongoose.Types.ObjectId(String(id))) } },
          ],
        },
      },
      // Resolve to a single vendorKey per row. We pick vendorId if
      // present, else the first items[].vendorId. This matches the
      // approach used elsewhere in the codebase (restaurantStats
      // service groups by the top-level vendorId).
      {
        $project: {
          resolvedVendorId: {
            $cond: [
              { $ne: ["$vendorId", null] },
              "$vendorId",
              { $arrayElemAt: ["$items.vendorId", 0] },
            ],
          },
          totalAmount: 1,
        },
      },
      {
        $group: {
          _id: "$resolvedVendorId",
          orderCount: { $sum: 1 },
          totalSales: { $sum: "$totalAmount" },
        },
      },
    ]);
    const orderByVendor = new Map(
      orderAgg.map((o) => [String(o._id), o])
    );

    // 4) All Withdrawals for this vendor set, most-recent first.
    const withdrawals = await Withdrawal.find({
      vendorId: { $in: vendorIds },
    })
      .sort({ createdAt: -1 })
      .lean();
    // Group by vendorId, preserving desc order.
    const withdrawalsByVendor = new Map();
    for (const w of withdrawals) {
      const key = String(w.vendorId);
      if (!withdrawalsByVendor.has(key)) withdrawalsByVendor.set(key, []);
      withdrawalsByVendor.get(key).push(w);
    }

    // 5) All commission_payment WalletTransactions for this vendor
    // set, most-recent first. We need both the latest (for the
    // "Last Commission Payment" column) and the count.
    const commissionTxns = await WalletTransaction.find({
      vendorId: { $in: vendorIds },
      type: "commission_payment",
    })
      .sort({ createdAt: -1 })
      .lean();
    const commissionByVendor = new Map();
    for (const t of commissionTxns) {
      const key = String(t.vendorId);
      if (!commissionByVendor.has(key)) commissionByVendor.set(key, t);
    }

    // 6) Wallets — one per vendor, fetched in bulk.
    const wallets = await Wallet.find({
      vendorId: { $in: vendorIds },
    }).lean();
    const walletByVendor = new Map(
      wallets.map((w) => [String(w.vendorId), w])
    );

    // 7) Merge. Helper for status derivation — same rule the
    // frontend will use so the column matches the badge. (Inlined
    // here so the server can also filter by status without a
    // second round-trip.)
    const WITHDRAWAL_STATUS_PRIORITY = (v) => {
      if (v.vendorStatus === "suspended") return "Suspended";
      const w = v.wallet;
      if (!w || !w.isActive) return "Blocked";
      if (v.outstandingCommission > 0) return "Outstanding Commission";
      if (v.pendingWithdrawalCount > 0) {
        return v.lastWithdrawalStatus === "pending"
          ? "Withdrawal Requested"
          : "Awaiting Approval";
      }
      if (
        v.lastWithdrawalStatus === "completed" ||
        v.lastWithdrawalStatus === "approved"
      )
        return "Paid Out";
      if (
        v.lastWithdrawalStatus === "rejected" ||
        v.lastWithdrawalStatus === "failed"
      )
        return "Commission Paid";
      return "Commission Paid";
    };

    let rows = userRows.map((u) => {
      const key = String(u._id);
      const w = walletByVendor.get(key);
      const wdList = withdrawalsByVendor.get(key) || [];
      const lastWd = wdList[0];
      const pendingWd = wdList.filter((x) => x.status === "pending");
      const lastCommissionTxn = commissionByVendor.get(key);
      const orderInfo = orderByVendor.get(key) || {
        orderCount: 0,
        totalSales: 0,
      };

      // "Commission Earned" = sum of `commission` (online realized) +
      // `commission_due` (COD realized at delivery) WalletTransaction
      // amounts. We compute the per-vendor total by summing both
      // types in a second aggregate per vendor. For perf, we batch
      // this — see step 8 below.
      // (commissionEarned is filled in by the second aggregate.)
      const baseRow = {
        vendorId: u._id,
        name: u.name,
        username: u.username || null,
        storeName: u.storeName || "",
        businessName: u.businessName,
        email: u.email,
        phone: u.phoneNumber || "",
        vendorType: u.vendorType,
        vendorStatus: u.vendorStatus,
        kycStatus: u.kycStatus,
        isSuspended: u.vendorStatus === "suspended",
        approvedAt: u.approvedAt,
        createdAt: u.createdAt,
        orderCount: orderInfo.orderCount,
        totalSales: orderInfo.totalSales, // already in GHS
        commissionRate: null, // filled below from settings
        commissionEarned: 0, // filled below from aggregate
        commissionPaidByVendor: w
          ? walletService.toMajor(w.commissionPaid || 0)
          : 0,
        outstandingCommission: w
          ? walletService.toMajor(w.commissionOwed || 0)
          : 0,
        totalOnlineEarnings: w
          ? walletService.toMajor(w.totalOnlineEarnings || 0)
          : 0,
        totalWithdrawn: w ? walletService.toMajor(w.totalWithdrawn || 0) : 0,
        availableBalance: w
          ? walletService.toMajor(w.availableBalance || 0)
          : 0,
        pendingBalance: w
          ? walletService.toMajor(w.pendingBalance || 0)
          : 0,
        lastWithdrawalDate: lastWd ? lastWd.createdAt : null,
        lastWithdrawalStatus: lastWd ? lastWd.status : null,
        lastWithdrawalAmount: lastWd
          ? walletService.toMajor(lastWd.amount)
          : 0,
        pendingWithdrawalCount: pendingWd.length,
        pendingWithdrawalAmount: walletService.toMajor(
          pendingWd.reduce((sum, x) => sum + (x.amount || 0), 0)
        ),
        lastCommissionPaymentDate: lastCommissionTxn
          ? lastCommissionTxn.createdAt
          : null,
        lastCommissionPaymentRef: lastCommissionTxn
          ? lastCommissionTxn.paymentRef || null
          : null,
        totalCommissionPayments: 0, // filled below
        walletStatus: !w
          ? "none"
          : w.isActive === false
          ? "inactive"
          : "active",
        withdrawalStatusLabel: null, // filled below
      };

      baseRow.withdrawalStatusLabel = WITHDRAWAL_STATUS_PRIORITY({
        vendorStatus: baseRow.vendorStatus,
        wallet: w,
        outstandingCommission: baseRow.outstandingCommission,
        pendingWithdrawalCount: baseRow.pendingWithdrawalCount,
        lastWithdrawalStatus: baseRow.lastWithdrawalStatus,
      });
      return baseRow;
    });

    // 8) Batch aggregate: per-vendor "Commission Earned" and
    // "totalCommissionPayments" — one query for the whole set.
    const commissionEarnedAgg = await WalletTransaction.aggregate([
      {
        $match: {
          vendorId: { $in: vendorIds.map((id) => new mongoose.Types.ObjectId(String(id))) },
          type: { $in: ["commission", "commission_due"] },
        },
      },
      {
        $group: {
          _id: { vendorId: "$vendorId", type: "$type" },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);
    const earnedMap = new Map();
    const countMap = new Map();
    for (const e of commissionEarnedAgg) {
      const key = String(e._id.vendorId);
      earnedMap.set(
        key,
        (earnedMap.get(key) || 0) + (e.total || 0)
      );
    }
    const paymentCountAgg = await WalletTransaction.aggregate([
      {
        $match: {
          vendorId: { $in: vendorIds.map((id) => new mongoose.Types.ObjectId(String(id))) },
          type: "commission_payment",
        },
      },
      { $group: { _id: "$vendorId", count: { $sum: 1 } } },
    ]);
    for (const p of paymentCountAgg) {
      countMap.set(String(p._id), p.count);
    }
    // Settings — single doc, one query.
    const settings = await Settings.findOne().lean();
    const globalRate = settings?.commission?.globalRate ?? 0;

    rows = rows.map((r) => ({
      ...r,
      commissionRate: globalRate,
      commissionEarned: walletService.toMajor(earnedMap.get(String(r.vendorId)) || 0),
      totalCommissionPayments: countMap.get(String(r.vendorId)) || 0,
    }));

    // 9) Apply server-side status filter (the JS-derived
    // withdrawalStatusLabel), the date range filter, then paginate.
    if (status && status !== "all") {
      const want = {
        outstanding: "Outstanding Commission",
        withdrawal: "Withdrawal Requested",
        paid: "Paid Out",
        pending: "Awaiting Approval",
        suspended: "Suspended",
      }[status];
      if (want) {
        rows = rows.filter((r) => r.withdrawalStatusLabel === want);
      }
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      rows = rows.filter(
        (r) => r.lastWithdrawalDate && new Date(r.lastWithdrawalDate) >= from
      );
    }
    if (dateTo) {
      const to = new Date(dateTo);
      rows = rows.filter(
        (r) => r.lastWithdrawalDate && new Date(r.lastWithdrawalDate) <= to
      );
    }

    // Re-sort by lastWithdrawalDate desc, with vendors who have
    // never withdrawn pushed to the bottom (preserves "recent
    // activity" prioritization).
    rows.sort((a, b) => {
      if (!a.lastWithdrawalDate && !b.lastWithdrawalDate) return 0;
      if (!a.lastWithdrawalDate) return 1;
      if (!b.lastWithdrawalDate) return -1;
      return new Date(b.lastWithdrawalDate) - new Date(a.lastWithdrawalDate);
    });

    const total = rows.length;
    const startIdx = (pageNum - 1) * limitNum;
    const paged = rows.slice(startIdx, startIdx + limitNum);

    return res.json({
      vendors: paged,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("[ADMIN COMMISSIONS] vendors list error:", error.message, error.stack);
    res.status(500).json({ error: "Failed to load vendor list" });
  }
});

/**
 * GET /api/admin/wallet/commissions/vendors/:vendorId
 *
 * Full detail payload for the per-vendor drawer. Combines:
 *   - business info from User
 *   - wallet summary (reuses walletService.getWalletSummary)
 *   - last 50 transactions (reuses walletService.getTransactionHistory)
 *   - all withdrawals (reuses walletService.getWithdrawalHistory)
 *   - all commission_payment transactions (sorted desc)
 *   - last 20 orders (new aggregate)
 *   - all Paystack references (merged: commission + withdrawal externalRef)
 */
router.get("/commissions/vendors/:vendorId", async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ error: "Invalid vendor id" });
    }
    const oid = new mongoose.Types.ObjectId(String(vendorId));

    // Business info — select every field the drawer's "Business" +
    // "KYC" tabs need. `createdAt` is the registration date
    // (timestamps:true on the User schema), `updatedAt` is the last
    // profile change. `idType`, `idFrontImage`, `idBackImage` are the
    // KYC documents the admin needs to audit. We deliberately
    // exclude `password` (select:false on schema) so the response
    // shape is clean.
    const vendor = await User.findById(oid)
      .select(
        "name email phoneNumber username storeName vendorType vendorStatus kycStatus approvedAt createdAt updatedAt restaurantDetails idType idFrontImage idBackImage vendorRejectedReason location"
      )
      .lean();
    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    // Wallet summary (reuses the existing service so the response
    // shape matches what the vendor sees on their own wallet page).
    const walletSummary = await walletService.getWalletSummary(oid);

    // Per-vendor order statistics (Total / Completed / Cancelled) —
    // one grouped count so the drawer's "Business" tab can show
    // accurate numbers without an N+1 fetch.
    const orderStatsAgg = await Order.aggregate([
      {
        $match: {
          $or: [
            { vendorId: oid },
            { "items.vendorId": oid },
          ],
        },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          completedOrders: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, 1, 0] },
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 1, 0] },
          },
          revenue: { $sum: "$totalAmount" },
        },
      },
    ]);
    const orderStats = orderStatsAgg[0] || {
      totalOrders: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      revenue: 0,
    };

    // Transaction history (full paginated). The `withdrawals` query
    // is wrapped in `lean()` + a manual populate of `reviewedBy`
    // because `lean()` skips auto-populate — we need the admin's
    // display name in the audit column.
    const [txnHistory, withdrawalsRaw, commissionTxns, recentOrders] =
      await Promise.all([
        walletService.getTransactionHistory(oid, { page: 1, limit: 50 }),
        Withdrawal.find({ vendorId: oid })
          .sort({ createdAt: -1 })
          .populate("reviewedBy", "name email")
          .lean(),
        WalletTransaction.find({
          vendorId: oid,
          type: "commission_payment",
        })
          .sort({ createdAt: -1 })
          .lean(),
        // Last 20 orders for this vendor.
        Order.aggregate([
          {
            $match: {
              $or: [
                { vendorId: oid },
                { "items.vendorId": oid },
              ],
            },
          },
          { $sort: { createdAt: -1 } },
          { $limit: 20 },
          {
            $project: {
              _id: 1,
              orderNumber: 1,
              totalAmount: 1,
              orderStatus: 1,
              paymentStatus: 1,
              paymentMethod: 1,
              createdAt: 1,
              paymentRef: 1,
            },
          },
        ]),
      ]);

    // Normalize the raw withdrawal list to the same shape the
    // service produces (amount/netAmount/fee in major units) and
    // surface the reviewer's name as a top-level `reviewedByName`
    // field for the table to render without traversing populate.
    const withdrawals = withdrawalsRaw.map((w) => ({
      ...w,
      amount: walletService.toMajor(w.amount),
      netAmount: walletService.toMajor(w.netAmount),
      fee: walletService.toMajor(w.fee),
      reviewedByName: w.reviewedBy?.name || null,
    }));

    // Paystack references — merge commission payments (have
    // paymentRef) and withdrawals (have externalRef) into one flat
    // list sorted desc by date.
    const paystackRefs = [
      ...commissionTxns.map((t) => ({
        reference: t.paymentRef,
        type: "commission",
        amount: walletService.toMajor(t.amount),
        date: t.createdAt,
        status: t.status,
        gatewayResponse: t.metadata?.gatewayResponse || null,
      })),
      ...withdrawals
        .filter((w) => w.externalRef)
        .map((w) => ({
          reference: w.externalRef,
          type: "withdrawal",
          amount: w.amount,
          date: w.createdAt,
          status: w.status,
          gatewayResponse: null,
        })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    return res.json({
      vendor: {
        id: vendor._id,
        name: vendor.name,
        // `username` is optional on the User schema (no `required`).
        // Many vendors registered via the original email-only flow
        // never set one — that's an "absent value", not a "bug",
        // and the UI will render "Not set" rather than "—".
        username: vendor.username || null,
        email: vendor.email,
        phone: vendor.phoneNumber,
        storeName: vendor.storeName,
        businessName:
          vendor.vendorType === "restaurant"
            ? vendor.restaurantDetails?.restaurantName ||
              vendor.storeName ||
              vendor.name
            : vendor.storeName || vendor.name,
        vendorType: vendor.vendorType,
        vendorStatus: vendor.vendorStatus,
        kycStatus: vendor.kycStatus,
        approvedAt: vendor.approvedAt,
        createdAt: vendor.createdAt,
        updatedAt: vendor.updatedAt,
        vendorRejectedReason: vendor.vendorRejectedReason,
        location: vendor.location || null,
        restaurantDetails: vendor.restaurantDetails || null,
        // KYC documents — exposed as an object so the UI can render
        // a "Submitted Documents" section without traversing
        // individual fields.
        kyc: {
          status: vendor.kycStatus,
          idType: vendor.idType || null,
          idFrontImage: vendor.idFrontImage || null,
          idBackImage: vendor.idBackImage || null,
        },
      },
      wallet: walletSummary,
      statistics: {
        totalOrders: orderStats.totalOrders || 0,
        completedOrders: orderStats.completedOrders || 0,
        cancelledOrders: orderStats.cancelledOrders || 0,
        revenue: orderStats.revenue || 0,
        commissionPaid: walletSummary.commissionPaid || 0,
        commissionOwing: walletSummary.commissionOwed || 0,
      },
      recentTransactions: txnHistory.transactions,
      recentTransactionsPagination: txnHistory.pagination,
      withdrawals,
      withdrawalsPagination: { page: 1, limit: 50, total: withdrawals.length, pages: 1 },
      commissionPayments: commissionTxns.map((t) => ({
        ...t,
        amount: walletService.toMajor(t.amount),
        balanceAfter: walletService.toMajor(t.balanceAfter),
      })),
      recentOrders,
      paystackReferences: paystackRefs,
    });
  } catch (error) {
    console.error("[ADMIN COMMISSIONS] vendor detail error:", error.message);
    res.status(500).json({ error: "Failed to load vendor detail" });
  }
});

module.exports = router;