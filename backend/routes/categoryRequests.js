"use strict";

/*
 * Category request router — vendors ask to add a new marketplace category;
 * admins approve or reject. Approved names are merged with
 * `Product.distinct("category")` by GET /api/products/categories so the new
 * category is immediately selectable in the vendor dropdown.
 *
 * Endpoints:
 *   POST  /api/category-requests       — any authenticated vendor submits
 *   GET   /api/category-requests       — admin only; list with ?status filter
 *   PATCH /api/category-requests/:id   — admin only; approve | reject
 *
 * No deletion endpoint — a rejected request is the natural "deny" state. The
 * unique index on the model also prevents the same name from being
 * (pending|approved) twice, which keeps the live list clean.
 */

const express = require("express");
const router = express.Router();
const CategoryRequest = require("../models/CategoryRequest");
const Product = require("../models/Product");
const { requireAuth, requireAdmin } = require("../middleware/auth");

/* ── VENDOR: SUBMIT A NEW CATEGORY REQUEST ──────────────────────────────── */
router.post("/", requireAuth, async (req, res) => {
  try {
    const rawName = (req.body?.name || "").toString().trim();
    const note = (req.body?.note || "").toString().trim();

    if (!rawName) {
      return res.status(400).json({ error: "Category name is required" });
    }
    if (rawName.length > 50) {
      return res.status(400).json({ error: "Category name is too long (max 50 chars)" });
    }

    // Normalize for the live-list check: case-insensitive equality.
    const normalized = rawName.toLowerCase();

    // 1) Reject if a product already uses this category (live list).
    const liveMatch = await Product.findOne({
      isDeleted: { $ne: true },
      category: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, "i") },
    })
      .select("category")
      .lean();
    if (liveMatch) {
      return res.status(409).json({
        error: `"${liveMatch.category}" already exists. Please use the existing category.`,
      });
    }

    // 2) The partial-unique index will catch duplicate (pending|approved)
    //    requests — but we also do an explicit lookup so we can return a
    //    friendly 409 message.
    const existing = await CategoryRequest.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, "i") },
      status: { $in: ["pending", "approved"] },
    }).lean();
    if (existing) {
      const msg =
        existing.status === "approved"
          ? "This category was already approved and is available in the list."
          : "A request for this category is already pending review.";
      return res.status(409).json({ error: msg });
    }

    // 3) Reject if the same vendor already has a pending request for the
    //    same name (a re-submit is fine after a rejection).
    const myPending = await CategoryRequest.findOne({
      requestedBy: req.user.userId,
      name: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, "i") },
      status: "pending",
    }).lean();
    if (myPending) {
      return res.status(409).json({
        error: "You already have a pending request for this category.",
      });
    }

    // Persist with the *normalized* name (lowercased) — the live list and
    // the index both key off this canonical form, so we keep one casing.
    const created = await CategoryRequest.create({
      name: normalized,
      note: note || undefined,
      requestedBy: req.user.userId,
      status: "pending",
    });
    res.status(201).json(created);
  } catch (err) {
    // Duplicate-key (race: two requests at the same time) → friendly 409.
    if (err?.code === 11000) {
      return res
        .status(409)
        .json({ error: "A request for this category is already pending review." });
    }
    console.error("[category-requests/create]", err.message);
    res.status(500).json({ error: "Failed to submit category request" });
  }
});

/* ── VENDOR: LIST MY OWN REQUESTS ──────────────────────────────────────── */
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const rows = await CategoryRequest.find({ requestedBy: req.user.userId })
      .sort({ createdAt: -1 })
      .lean();
    res.json(rows);
  } catch (err) {
    console.error("[category-requests/mine]", err.message);
    res.status(500).json({ error: "Failed to list your requests" });
  }
});

/* ── ADMIN: LIST ALL REQUESTS (optionally filtered) ────────────────────── */
router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status && ["pending", "approved", "rejected"].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    const rows = await CategoryRequest.find(filter)
      .populate("requestedBy", "name email")
      .populate("reviewedBy", "name email")
      .sort({ createdAt: -1 })
      .lean();
    res.json(rows);
  } catch (err) {
    console.error("[category-requests/list]", err.message);
    res.status(500).json({ error: "Failed to list category requests" });
  }
});

/* ── ADMIN: APPROVE OR REJECT ──────────────────────────────────────────── */
router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { action } = req.body || {};
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "action must be 'approve' or 'reject'" });
    }
    const nextStatus = action === "approve" ? "approved" : "rejected";
    const updated = await CategoryRequest.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: nextStatus,
          reviewedBy: req.user.userId,
          reviewedAt: new Date(),
        },
      },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: "Request not found" });
    res.json(updated);
  } catch (err) {
    console.error("[category-requests/patch]", err.message);
    res.status(500).json({ error: "Failed to update request" });
  }
});

// Escape user-supplied text before splicing into a RegExp source.
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = router;