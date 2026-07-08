"use strict";
const express = require("express");
const router = express.Router();
const RestaurantReview = require("../models/RestaurantReview");
const Order = require("../models/Order"); // ✅ UNIFIED: Use Order model
const User = require("../models/User");

// Middleware to check authentication
const requireAuth = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    req.userId = userId;
    next();
  } catch (err) {
    res.status(500).json({ error: "Authentication failed" });
  }
};

/* ────────────────────────────────────────────────────────────────
  GET /api/restaurant-reviews/:restaurantId - Get restaurant reviews
────────────────────────────────────────────────────────────────── */
router.get("/:restaurantId", async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { limit = 20, skip = 0 } = req.query;

    const reviews = await RestaurantReview.find({
      restaurantId: restaurantId,
      isDeleted: { $ne: true },
    })
      .populate("userId", "name")
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));

    // Get average rating
    const stats = await RestaurantReview.aggregate([
      { $match: { restaurantId: require("mongoose").Types.ObjectId.createFromHexString(restaurantId), isDeleted: { $ne: true } } },
      {
        $group: {
          _id: "$restaurantId",
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      reviews: reviews,
      averageRating: stats[0]?.avgRating || 0,
      totalReviews: stats[0]?.count || 0,
    });
  } catch (err) {
    console.error("[restaurant-reviews] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

/* ────────────────────────────────────────────────────────────────
  POST /api/restaurant-reviews - Create review (after order delivered)
────────────────────────────────────────────────────────────────── */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { restaurantId, orderId, rating, review } = req.body;

    if (!restaurantId || !orderId || !rating) {
      return res.status(400).json({
        error: "Restaurant, order, and rating are required",
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    // ✅ UNIFIED: Verify order exists in Order collection
    const order = await Order.findOne({
      _id: orderId,
      userId: req.userId,
      $or: [{ restaurantId: restaurantId }, { vendorId: restaurantId }],
      orderStatus: "delivered",
    });

    if (!order) {
      return res.status(404).json({
        error: "Order not found or not delivered yet",
      });
    }

    // Check if review already exists
    const existing = await RestaurantReview.findOne({
      userId: req.userId,
      orderId: orderId,
    });

    if (existing) {
      return res.status(400).json({ error: "You have already reviewed this order" });
    }

    // Create review
    const newReview = await RestaurantReview.create({
      userId: req.userId,
      restaurantId: restaurantId,
      orderId: orderId,
      rating,
      review: review || "",
    });

    const populated = await RestaurantReview.findById(newReview._id).populate(
      "userId",
      "name"
    );

    res.status(201).json(populated);
  } catch (err) {
    console.error("[restaurant-reviews] Error:", err.message);
    res.status(500).json({ error: "Failed to create review" });
  }
});

/* ────────────────────────────────────────────────────────────────
  GET /api/restaurant-reviews/order/:orderId - Get review for order
────────────────────────────────────────────────────────────────── */
router.get("/order/:orderId", requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;

    const review = await RestaurantReview.findOne({
      orderId: orderId,
      userId: req.userId,
    });

    res.json(review || null);
  } catch (err) {
    console.error("[restaurant-reviews/order] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch review" });
  }
});

/* ────────────────────────────────────────────────────────────────
  PATCH /api/restaurant-reviews/:id - Update review
────────────────────────────────────────────────────────────────── */
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, review } = req.body;

    const existing = await RestaurantReview.findOne({
      _id: id,
      userId: req.userId,
    });

    if (!existing) {
      return res.status(404).json({ error: "Review not found" });
    }

    if (rating !== undefined) {
      if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5" });
      }
      existing.rating = rating;
    }

    if (review !== undefined) {
      existing.review = review;
    }

    await existing.save();
    res.json(existing);
  } catch (err) {
    console.error("[restaurant-reviews/:id] Error:", err.message);
    res.status(500).json({ error: "Failed to update review" });
  }
});

module.exports = router;