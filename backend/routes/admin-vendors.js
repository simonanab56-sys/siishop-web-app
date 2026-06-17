/**
 * Admin Vendor Management Routes
 * 
 * Endpoints:
 * - GET /api/admin/vendors/pending - List pending vendor requests
 * - PATCH /api/admin/vendors/:id/approve - Approve a vendor
 * - PATCH /api/admin/vendors/:id/reject - Reject a vendor
 */

"use strict";
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const logger = require("../utils/logger");

/**
 * GET /api/admin/vendors/pending
 * Returns all vendors with vendorStatus = "pending"
 * Admin only
 */
router.get("/pending", requireAuth, requireAdmin, async (req, res) => {
  try {
    const pendingVendors = await User.find({
      isVendor: true,
      vendorStatus: "pending",
    })
      .select(
        "name email phoneNumber idType idFrontImage idBackImage storeName storeDescription createdAt kycStatus location"
      )
      .sort({ createdAt: -1 })
      .lean();

    res.json(pendingVendors || []);
  } catch (err) {
    console.error("[Admin] Error fetching pending vendors:", err.message);
    res.status(500).json({ error: "Failed to fetch pending vendors" });
  }
});

/**
 * PATCH /api/admin/vendors/:id/approve
 * Approve a vendor account
 * Sets: vendorStatus = "approved", approvedAt = now
 * Admin only
 */
router.patch("/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Validate vendor exists
    const vendor = await User.findById(id);
    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    // ✅ Validate is actually a vendor
    if (!vendor.isVendor) {
      return res.status(400).json({ error: "User is not a vendor" });
    }

    // ✅ Update vendor status
    vendor.vendorStatus = "approved";
    vendor.approvedAt = new Date();
    vendor.vendorRejectedReason = ""; // Clear any previous rejection reason
    await vendor.save();

    logger.log(`[Admin] Vendor ${id} approved by admin`);

    res.json({
      message: "Vendor approved successfully",
      vendor: {
        _id: vendor._id,
        name: vendor.name,
        email: vendor.email,
        vendorStatus: vendor.vendorStatus,
        approvedAt: vendor.approvedAt,
      },
    });
  } catch (err) {
    console.error("[Admin] Error approving vendor:", err.message);
    res.status(500).json({ error: "Failed to approve vendor" });
  }
});

/**
 * PATCH /api/admin/vendors/:id/reject
 * Reject a vendor account
 * Sets: vendorStatus = "rejected", vendorRejectedReason = req.body.reason
 * Admin only
 */
router.patch("/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // ✅ Validate reason provided
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Rejection reason is required" });
    }

    // ✅ Validate vendor exists
    const vendor = await User.findById(id);
    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    // ✅ Validate is actually a vendor
    if (!vendor.isVendor) {
      return res.status(400).json({ error: "User is not a vendor" });
    }

    // ✅ Update vendor status
    vendor.vendorStatus = "rejected";
    vendor.vendorRejectedReason = reason.trim();
    vendor.approvedAt = null; // Clear approval date
    await vendor.save();

    logger.log(`[Admin] Vendor ${id} rejected by admin: ${reason}`);

    res.json({
      message: "Vendor rejected successfully",
      vendor: {
        _id: vendor._id,
        name: vendor.name,
        email: vendor.email,
        vendorStatus: vendor.vendorStatus,
        vendorRejectedReason: vendor.vendorRejectedReason,
      },
    });
  } catch (err) {
    console.error("[Admin] Error rejecting vendor:", err.message);
    res.status(500).json({ error: "Failed to reject vendor" });
  }
});

/**
 * GET /api/admin/vendors/all
 * Returns all vendors with their status
 * Admin only
 */
router.get("/all", requireAuth, requireAdmin, async (req, res) => {
  try {
    const filter = { isVendor: true };

    // ── FILTER BY REGION ───────────────────────────────────────────────
    if (req.query.region) {
      filter["location.region"] = req.query.region;
    }

    // ── FILTER BY CITY ───────────────────────────────────────────────
    if (req.query.city) {
      filter["location.city"] = req.query.city;
    }

    const vendors = await User.find(filter)
      .select(
        "name email phoneNumber idType idFrontImage idBackImage storeName storeDescription createdAt kycStatus vendorStatus approvedAt vendorRejectedReason location"
      )
      .sort({ createdAt: -1 })
      .lean();

    // Add formatted location to each vendor
    const vendorsWithLocation = (vendors || []).map(v => ({
      ...v,
      formattedLocation: (v.location?.region && v.location?.city)
        ? `${v.location.city}, ${v.location.region}`
        : "Location not specified"
    }));

    res.json(vendorsWithLocation);
  } catch (err) {
    console.error("[Admin] Error fetching all vendors:", err.message);
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

module.exports = router;
