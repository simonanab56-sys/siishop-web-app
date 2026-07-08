"use strict";

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Promo = require("../models/Promo");
const Product = require("../models/Product");
const { requireAuth, requireAdmin } = require("../middleware/auth");

/* ACTIVE PROMOS */
router.get("/active", async (req, res) => {
  try {
    const now = new Date();

    const promos = await Promo.find({
      active: true,
      startDate: { $lte: now },
      endDate: { $gt: now },
    })
      .populate("productId")
      // ✅ Marketplace-style sort: featured first, then by priority desc,
      // then by manual displayOrder, then by soonest expiring.
      .sort({ featured: -1, priority: -1, displayOrder: 1, endDate: 1 })
      .lean();

    const live = (promos || []).filter(
      (p) =>
        p.productId &&
        p.productId.isDeleted === false &&
        p.productId.available !== false
    );

    res.json(live);
  } catch (err) {
    console.error("[promos/active]", err.message);
    res.status(500).json({ error: "Failed to fetch promos" });
  }
});

/* SEARCH PROMOS */
router.get("/search", async (req, res) => {
  try {
    const { search } = req.query;
    const now = new Date();

    const filter = {
      active: true,
      startDate: { $lte: now },
      endDate: { $gt: now },
    };

    // Search by promo title
    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { title: { $regex: searchRegex } },
      ];
    }

    const promos = await Promo.find(filter)
      .populate("productId")
      .sort({ featured: -1, priority: -1, displayOrder: 1, endDate: 1 })
      .lean();

    const live = (promos || []).filter(
      (p) =>
        p.productId &&
        p.productId.isDeleted === false &&
        p.productId.available !== false
    );

    res.json(live);
  } catch (err) {
    console.error("[promos/search]", err.message);
    res.status(500).json({ error: "Failed to search promos" });
  }
});

/* ADMIN PROMOS */
router.get("/admin", requireAuth, requireAdmin, async (req, res) => {
  try {
    const promos = await Promo.find()
      .populate("productId")
      .sort({ createdAt: -1 })
      .lean();

    res.json(promos || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch promos" });
  }
});

/* CREATE PROMO */
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      productId, discountPercent, startDate, endDate, title, active = true,
      badge, featured, priority, displayOrder,
    } = req.body;

    if (!productId || !discountPercent || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const promo = await Promo.create({
      productId,
      discountPercent: Number(discountPercent),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      title,
      active,
      // ✅ ADDED: persist marketplace-level configurability fields when supplied.
      // All optional — defaults from the schema kick in for omitted keys.
      ...(badge !== undefined ? { badge: badge || null } : {}),
      ...(featured !== undefined ? { featured: Boolean(featured) } : {}),
      ...(priority !== undefined ? { priority: Number(priority) || 0 } : {}),
      ...(displayOrder !== undefined ? { displayOrder: Number(displayOrder) || 0 } : {}),
    });

    const populated = await Promo.findById(promo._id).populate("productId").lean();
    res.status(201).json(populated);
  } catch (err) {
    console.error("[promos/create]", err.message);
    res.status(500).json({ error: "Failed to create promo" });
  }
});

/* UPDATE PROMO */
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { discountPercent, startDate, endDate, title, active, badge, featured, priority, displayOrder } = req.body;
    const updates = {};
    if (discountPercent !== undefined) updates.discountPercent = Number(discountPercent);
    if (startDate !== undefined) updates.startDate = new Date(startDate);
    if (endDate !== undefined) updates.endDate = new Date(endDate);
    if (title !== undefined) updates.title = title;
    if (active !== undefined) updates.active = active;
    // ✅ ADDED: allow toggling marketplace-level fields post-creation.
    if (badge !== undefined) updates.badge = badge || null;
    if (featured !== undefined) updates.featured = Boolean(featured);
    if (priority !== undefined) updates.priority = Number(priority) || 0;
    if (displayOrder !== undefined) updates.displayOrder = Number(displayOrder) || 0;

    const promo = await Promo.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).populate("productId").lean();

    if (!promo) return res.status(404).json({ error: "Promo not found" });
    res.json(promo);
  } catch (err) {
    res.status(500).json({ error: "Failed to update promo" });
  }
});

/* DELETE PROMO */
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const promo = await Promo.findByIdAndDelete(req.params.id);
    if (!promo) return res.status(404).json({ error: "Promo not found" });
    res.json({ message: "Promo deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete promo" });
  }
});

module.exports = router;
