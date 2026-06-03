"use strict";

const router = require("express").Router();
const Wishlist = require("../models/Wishlist");
const Product = require("../models/Product");
const Notification = require("../models/Notification");
const { requireAuth } = require("../middleware/auth");
const { sendWishlistPriceDropEmail, sendBackInStockEmail } = require("../services/wishlist-email.service");

// Middleware: Get current user ID
const getUserId = (req) => {
  // Auth middleware sets req.user.userId
  if (req.user && req.user.userId) return req.user.userId;
  if (req.user && req.user.id) return req.user.id;
  if (req.user && req.user._id) return req.user._id;
  return null;
};

// ── GET USER'S WISHLIST ───────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get wishlist items with product details
    const items = await Wishlist.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "productId",
        match: { isDeleted: { $ne: true } },
      })
      .lean();

    // Filter out items where product was deleted
    const validItems = items.filter(item => item.productId !== null);

    // Get total count
    const total = await Wishlist.countDocuments({ userId });

    res.json({
      wishlist: validItems,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching wishlist:", err);
    res.status(500).json({ error: "Failed to fetch wishlist" });
  }
});

// ── GET WISHLIST COUNT ─────────────────────────────────────────────────────────
router.get("/count", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const count = await Wishlist.getWishlistCount(userId);
    res.json({ count });
  } catch (err) {
    console.error("Error fetching wishlist count:", err);
    res.status(500).json({ error: "Failed to fetch wishlist count" });
  }
});

// ── CHECK IF PRODUCT IS IN WISHLIST ─────────────────────────────────────────────
router.get("/check/:productId", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { productId } = req.params;
    const isInWishlist = await Wishlist.isInWishlist(userId, productId);
    res.json({ isInWishlist });
  } catch (err) {
    console.error("Error checking wishlist:", err);
    res.status(500).json({ error: "Failed to check wishlist" });
  }
});

// ── ADD TO WISHLIST ───────────────────────────────────────────────────────────
router.post("/add", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { productId, notifyPriceDrop = true, notifyBackInStock = true } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "Product ID is required" });
    }

    // Check if product exists
    const product = await Product.findOne({ _id: productId, isDeleted: { $ne: true } });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Check if already in wishlist
    const existing = await Wishlist.findOne({ userId, productId });
    if (existing) {
      return res.status(200).json({ wishlist: existing, message: "Already in wishlist" });
    }

    // Create wishlist item
    const wishlistItem = await Wishlist.create({
      userId,
      productId,
      priceWhenSaved: product.price,
      notifyPriceDrop,
      notifyBackInStock,
    });

    res.status(201).json({ wishlist: wishlistItem, message: "Added to wishlist" });
  } catch (err) {
    console.error("Error adding to wishlist:", err);
    res.status(500).json({ error: "Failed to add to wishlist" });
  }
});

// ── REMOVE FROM WISHLIST ───────────────────────────────────────────────────────
router.delete("/remove/:productId", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { productId } = req.params;

    const result = await Wishlist.findOneAndDelete({ userId, productId });
    if (!result) {
      return res.status(404).json({ error: "Item not found in wishlist" });
    }

    res.json({ message: "Removed from wishlist" });
  } catch (err) {
    console.error("Error removing from wishlist:", err);
    res.status(500).json({ error: "Failed to remove from wishlist" });
  }
});

// ── UPDATE NOTIFICATION PREFERENCES ──────────────────────────────────────────
router.put("/preferences/:productId", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { productId } = req.params;
    const { notifyPriceDrop, notifyBackInStock } = req.body;

    const item = await Wishlist.findOneAndUpdate(
      { userId, productId },
      { notifyPriceDrop, notifyBackInStock },
      { new: true }
    );

    if (!item) {
      return res.status(404).json({ error: "Item not found in wishlist" });
    }

    res.json({ wishlist: item });
  } catch (err) {
    console.error("Error updating preferences:", err);
    res.status(500).json({ error: "Failed to update preferences" });
  }
});

// ── CLEAR ENTIRE WISHLIST ─────────────────────────────────────────────────────
router.delete("/clear", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await Wishlist.deleteMany({ userId });
    res.json({ message: "Wishlist cleared" });
  } catch (err) {
    console.error("Error clearing wishlist:", err);
    res.status(500).json({ error: "Failed to clear wishlist" });
  }
});

// ── MOVE TO CART (Mark as ready for cart) ───────────────────────────────────
router.post("/move-to-cart/:productId", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { productId } = req.params;

    const item = await Wishlist.findOne({ userId, productId }).populate("productId");
    if (!item) {
      return res.status(404).json({ error: "Item not found in wishlist" });
    }

    // Return product info for adding to cart
    res.json({
      product: item.productId,
      priceWhenSaved: item.priceWhenSaved,
    });
  } catch (err) {
    console.error("Error moving to cart:", err);
    res.status(500).json({ error: "Failed to move to cart" });
  }
});

// ── GET RECOMMENDATIONS ───────────────────────────────────────────────────────
router.get("/recommendations", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get user's wishlist items
    const wishlistItems = await Wishlist.find({ userId })
      .populate({ path: "productId", select: "category vendorId" })
      .lean();

    if (wishlistItems.length === 0) {
      return res.json({ recommendations: [] });
    }

    // Extract categories and vendors from wishlist
    const categories = [...new Set(
      wishlistItems
        .filter(item => item.productId?.category)
        .map(item => item.productId.category)
    )];

    const vendorIds = [...new Set(
      wishlistItems
        .filter(item => item.productId?.vendorId)
        .map(item => item.productId.vendorId.toString())
    )];

    // Find products in same categories or from same vendors, excluding already wishlisted
    const wishlistedProductIds = wishlistItems
      .filter(item => item.productId?._id)
      .map(item => item.productId._id.toString());

    const recommendations = await Product.find({
      _id: { $nin: wishlistedProductIds },
      isDeleted: { $ne: true },
      available: true,
      $or: [
        { category: { $in: categories } },
        { vendorId: { $in: vendorIds } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("vendorId", "businessName");

    res.json({ recommendations });
  } catch (err) {
    console.error("Error fetching recommendations:", err);
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
});

// ── ADMIN: GET WISHLIST ANALYTICS ─────────────────────────────────────────────
router.get("/admin/analytics", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Check if admin (we'll rely on requireAuth for now, can add requireAdmin later)
    const User = require("../models/User");
    const user = await User.findById(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Total wishlist items
    const totalWishlistItems = await Wishlist.countDocuments();

    // Total unique users with wishlists
    const totalWishlistUsers = await Wishlist.distinct("userId");
    const totalUsersWithWishlist = totalWishlistUsers.length;

    // Most wishlisted products (top 10)
    const mostWishlisted = await Wishlist.aggregate([
      { $group: { _id: "$productId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $project: {
          productId: "$_id",
          name: "$product.name",
          image: { $arrayElemAt: ["$product.images.url", 0] },
          price: "$product.price",
          count: 1,
        },
      },
    ]);

    // Most saved categories
    const productIds = await Wishlist.distinct("productId");
    const products = await Product.find({ _id: { $in: productIds } }).select("category").lean();
    const categoryMap = {};
    products.forEach(p => {
      if (p.category) {
        categoryMap[p.category] = (categoryMap[p.category] || 0) + 1;
      }
    });
    const mostSavedCategories = Object.entries(categoryMap)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Top vendors by wishlist count
    const vendorWishlistCounts = await Wishlist.aggregate([
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      { $group: { _id: "$product.vendorId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "vendor",
        },
      },
      { $unwind: "$vendor" },
      {
        $project: {
          vendorId: "$_id",
          businessName: "$vendor.businessName",
          count: 1,
        },
      },
    ]);

    res.json({
      totalWishlistItems,
      totalUsersWithWishlist,
      mostWishlisted,
      mostSavedCategories,
      topVendors: vendorWishlistCounts,
    });
  } catch (err) {
    console.error("Error fetching admin analytics:", err);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// ── VENDOR: GET WISHLIST ANALYTICS ────────────────────────────────────────────
router.get("/vendor/analytics", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Check if vendor
    const User = require("../models/User");
    const user = await User.findById(userId);
    if (!user || user.role !== "vendor" || !user.isApprovedVendor) {
      return res.status(403).json({ error: "Vendor access required" });
    }

    // Get vendor's products
    const vendorProducts = await Product.find({ vendorId: userId, isDeleted: { $ne: true } }).select("_id").lean();
    const vendorProductIds = vendorProducts.map(p => p._id);

    // Products saved by customers
    const totalSaved = await Wishlist.countDocuments({ productId: { $in: vendorProductIds } });

    // Unique customers who saved vendor products
    const uniqueCustomers = await Wishlist.distinct("userId", { productId: { $in: vendorProductIds } });
    const uniqueCustomerCount = uniqueCustomers.length;

    // Products with most wishlist saves
    const productWishlistCounts = await Wishlist.aggregate([
      { $match: { productId: { $in: vendorProductIds } } },
      { $group: { _id: "$productId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $project: {
          productId: "$_id",
          name: "$product.name",
          price: "$product.price",
          count: 1,
        },
      },
    ]);

    res.json({
      totalSaved,
      uniqueCustomerCount,
      products: productWishlistCounts,
    });
  } catch (err) {
    console.error("Error fetching vendor analytics:", err);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// ── INTERNAL: CHECK PRICE CHANGES (called by cron job or product update) ──────
router.post("/internal/check-prices", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (apiKey !== process.env.INTERNAL_API_KEY) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Get all wishlist items
    const wishlistItems = await Wishlist.find({ notifyPriceDrop: true })
      .populate("productId")
      .populate("userId", "email");

    let priceDropNotifications = 0;
    let backInStockNotifications = 0;

    for (const item of wishlistItems) {
      if (!item.productId || item.productId.isDeleted) continue;

      const product = item.productId;
      const currentPrice = product.price;
      const savedPrice = item.priceWhenSaved;

      // Check for price drop
      if (currentPrice < savedPrice && !item.priceDropNotified) {
        // Create in-app notification
        try {
          await Notification.create({
            userId: item.userId._id,
            type: "wishlist_price_drop",
            title: "Price Drop Alert!",
            message: `Great news! ${product.name} price dropped from ₵${savedPrice} to ₵${currentPrice}. You save ₵${(savedPrice - currentPrice).toFixed(2)}!`,
            referenceId: product._id,
            referenceType: "product",
            metadata: {
              productName: product.name,
              oldPrice: savedPrice,
              newPrice: currentPrice,
              savings: savedPrice - currentPrice,
            },
          });
        } catch (e) {
          console.error("Failed to create price drop notification:", e);
        }

        // Send email
        try {
          await sendWishlistPriceDropEmail(item.userId.email, {
            productName: product.name,
            oldPrice: savedPrice,
            newPrice: currentPrice,
            savings: savedPrice - currentPrice,
            productUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/product/${product._id}`,
          });
        } catch (e) {
          console.error("Failed to send price drop email:", e);
        }

        // Update flag
        item.priceDropNotified = true;
        await item.save();
        priceDropNotifications++;
      }

      // Check for back in stock
      if (product.stock > 0 && !item.stockNotified && item.notifyBackInStock) {
        // Create in-app notification
        try {
          await Notification.create({
            userId: item.userId._id,
            type: "wishlist_stock_available",
            title: "Back In Stock!",
            message: `Good news! ${product.name} is now back in stock.`,
            referenceId: product._id,
            referenceType: "product",
            metadata: {
              productName: product.name,
              stock: product.stock,
            },
          });
        } catch (e) {
          console.error("Failed to create stock notification:", e);
        }

        // Send email
        try {
          await sendBackInStockEmail(item.userId.email, {
            productName: product.name,
            productUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/product/${product._id}`,
          });
        } catch (e) {
          console.error("Failed to send back in stock email:", e);
        }

        // Update flag
        item.stockNotified = true;
        await item.save();
        backInStockNotifications++;
      }

      // Update last price checked
      item.lastPriceChecked = new Date();
      await item.save();
    }

    res.json({
      message: "Price check completed",
      priceDropNotifications,
      backInStockNotifications,
    });
  } catch (err) {
    console.error("Error checking prices:", err);
    res.status(500).json({ error: "Failed to check prices" });
  }
});

module.exports = router;