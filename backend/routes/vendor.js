"use strict";

const express = require("express");
const router  = express.Router();
const mongoose = require("mongoose");

const User    = require("../models/User");
const Product = require("../models/Product");
const requireApprovedVendor = require("../middleware/requireApprovedVendor");
const Order   = require("../models/Order");
const { requireAuth, requireVendor } = require("../middleware/auth");
const uploader = require("../utils/upload");

function toObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

/* PUBLIC — list approved vendors (for StoresPage) */
router.get("/list", async (req, res) => {
  try {
    const vendors = await User.find({
      isVendor: true,
      vendorStatus: "approved",
    })
      .select("name storeName storeDescription storeLogo email")
      .sort({ createdAt: -1 })
      .lean();

    res.json(vendors || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

/* PUBLIC — vendor profile by ID */
router.get("/profile/:id", async (req, res) => {
  try {
    const vendor = await User.findOne({
      _id: req.params.id,
      isVendor: true,
      vendorStatus: "approved",
    })
      .select("name storeName storeDescription storeLogo email")
      .lean();

    if (!vendor) return res.status(404).json({ error: "Vendor not found" });
    res.json(vendor);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch vendor profile" });
  }
});

/* DASHBOARD */
router.get("/dashboard", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const vendorId = toObjectId(req.user.userId);

    const [productsCount, ordersCount, recentOrders] = await Promise.all([
      Product.countDocuments({ vendorId, isDeleted: { $ne: true } }),
      Order.countDocuments({ "items.vendorId": vendorId }),
      Order.find({ "items.vendorId": vendorId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    // ✅ CRITICAL FIX: Use top-level vendorId for aggregation (much simpler and faster)
    const revenueAgg = await Order.aggregate([
      { $match: { vendorId: vendorId, $or: [{ paymentStatus: "paid" }, { orderStatus: "delivered" }] } },
      {
        $group: {
          _id: null,
          total: { $sum: "$totalAmount" },
        },
      },
    ]);

    res.json({
      totalProducts: productsCount,
      totalOrders: ordersCount,
      totalRevenue: revenueAgg?.[0]?.total || 0,
      recentOrders,
    });
  } catch (err) {
    res.status(500).json({ error: "Dashboard error" });
  }
});

/* MY ORDERS — vendor sees orders containing their products */
router.get("/orders", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const vendorId = toObjectId(req.user.userId);

    const orders = await Order.find({ "items.vendorId": vendorId })
      .sort({ createdAt: -1 })
      .lean();

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

/* UPDATE ORDER STATUS — vendor updates their own orders */
router.patch(
  "/orders/:id/status",
  requireAuth,
  requireVendor,
  async (req, res) => {
    try {
      const { orderStatus } = req.body;
      const vendorId = toObjectId(req.user.userId);

      const order = await Order.findById(req.params.id);

      if (!order) return res.status(404).json({ error: "Order not found" });

      // Ensure this vendor owns at least one item in this order
      const vendorItem = order.items?.find(
        (item) => String(item.vendorId) === String(vendorId)
      );
      if (!vendorItem) {
        return res.status(403).json({ error: "Not authorized for this order" });
      }

      order.orderStatus = orderStatus;
      await order.save();

      res.json(order);
    } catch (err) {
      res.status(500).json({ error: "Failed to update order status" });
    }
  }
);

/* MY PRODUCTS */
router.get("/products", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const products = await Product.find({ 
      vendorId: req.user.userId,
      isDeleted: { $ne: true } 
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json(products);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

/* CREATE PRODUCT — handles multipart/form-data (image file upload) */
router.post("/products", requireAuth, requireApprovedVendor, uploader.single("image"), async (req, res) => {
  try {
    const imageUrl = req.file
      ? `/uploads/${req.file.filename}`
      : (req.body.image || "");

    const product = await Product.create({
      name:        req.body.name        || "",
      description: req.body.description || "",
      price:       parseFloat(req.body.price)    || 0,
      category:    req.body.category   || "",
      stock:       parseInt(req.body.stock, 10)  || 0,
      available:   req.body.available === "true" || req.body.available === true,
      image:       imageUrl,
      vendorId:    req.user.userId,
    });
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: "Failed to create product" });
  }
});

/* UPDATE PRODUCT — ownership-gated */
router.put("/products/:id", requireAuth, requireApprovedVendor, uploader.single("image"), async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Admin → full access. Vendor → own products only.
    if (!req.user.isAdmin && String(product.vendorId) !== String(req.user.userId)) {
      return res.status(403).json({ error: "Not authorized to update this product" });
    }

    if (req.file) {
      product.image = `/uploads/${req.file.filename}`;
    } else if (req.body.image !== undefined) {
      product.image = req.body.image;
    }

    const fields = ["name","description","category","available"];
    fields.forEach((k) => {
      if (req.body[k] !== undefined) {
        if (k === "available") product[k] = req.body[k] === "true" || req.body[k] === true;
        else product[k] = req.body[k];
      }
    });

    if (req.body.price  !== undefined) product.price  = parseFloat(req.body.price)  || 0;
    if (req.body.stock   !== undefined) product.stock   = Math.max(0, parseInt(req.body.stock, 10) || 0);

    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: "Failed to update product" });
  }
});

/* DELETE PRODUCT — ownership-gated */
router.delete("/products/:id", requireAuth, requireApprovedVendor, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Admin → full access. Vendor → own products only.
    if (!req.user.isAdmin && String(product.vendorId) !== String(req.user.userId)) {
      return res.status(403).json({ error: "Not authorized to delete this product" });
    }

    product.isDeleted = true;
    product.available = false;
    product.stock     = 0;
    await product.save();

    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete product" });
  }
});

module.exports = router;
