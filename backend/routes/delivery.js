"use strict";

const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const User = require("../models/User");
const { requireAuth, requireAdmin, requireVendor } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const walletService = require("../services/wallet.service");

/* ───────────────────────── HELPER FUNCTIONS ───────────────────────── */

// Calculate ETA using simple distance estimation (can be enhanced with Google Maps API)
function calculateETA(origin, destination) {
  // Simple calculation - in production, use Google Distance Matrix API
  // This is a basic estimation based on average speed of 30 km/h in city
  const R = 6371; // Earth's radius in km
  const dLat = (destination.lat - origin.lat) * Math.PI / 180;
  const dLon = (destination.lng - origin.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(origin.lat * Math.PI / 180) * Math.cos(destination.lat * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in km

  const avgSpeed = 30; // km/h
  const duration = (distance / avgSpeed) * 60; // minutes

  return {
    distance: distance.toFixed(1),
    duration: Math.round(duration),
    eta: new Date(Date.now() + duration * 60 * 1000),
  };
}

// Validate coordinates
function isValidCoordinate(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  );
}

/* ───────────────────────── CUSTOMER: TRACK ORDER ───────────────────────── */
router.get(
  "/track/:orderId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user.userId;

    const order = await Order.findById(orderId)
      .populate("userId", "name email phone")
      .populate("vendorId", "storeName phoneNumber")
      .lean();

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Verify ownership - customer can only track their own orders
    const isCustomer = String(order.userId?._id || order.userId) === String(userId);
    const isVendor = String(order.vendorId?._id || order.vendorId) === String(userId);
    const isAdmin = req.user.isAdmin;

    if (!isCustomer && !isVendor && !isAdmin) {
      return res.status(403).json({ error: "Not authorized to track this order" });
    }

    // Get rider info if assigned
    let riderInfo = null;
    if (order.riderId) {
      riderInfo = await User.findById(order.riderId)
        .select("name phoneNumber")
        .lean();
    }

    // Calculate current ETA if rider is en route
    let etaInfo = null;
    if (
      order.orderStatus === "out_for_delivery" &&
      order.riderLocation &&
      order.deliveryAddressCoords
    ) {
      etaInfo = calculateETA(
        order.riderLocation,
        order.deliveryAddressCoords
      );
    }

    res.json({
      orderId: order._id,
      status: order.orderStatus,
      paymentStatus: order.paymentStatus,
      totalAmount: order.totalAmount,
      items: order.items,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryAddress: order.deliveryAddress,
      vendorName: order.vendorId?.storeName,
      riderId: order.riderId,
      riderName: riderInfo?.name,
      riderPhone: riderInfo?.phoneNumber,
      riderLocation: order.riderLocation,
      estimatedArrival: order.estimatedArrival || etaInfo?.eta,
      deliveryStartedAt: order.deliveryStartedAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      eta: etaInfo,
    });
  })
);

/* ───────────────────────── RIDER: UPDATE LOCATION ───────────────────────── */
router.post(
  "/update-location",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { orderId, latitude, longitude, speed, heading } = req.body;
    const riderId = req.user.userId;

    // Validate coordinates
    if (!isValidCoordinate(latitude, longitude)) {
      return res.status(400).json({ error: "Invalid coordinates" });
    }

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Verify rider is assigned to this order
    if (String(order.riderId) !== String(riderId)) {
      return res.status(403).json({ error: "Not assigned to this order" });
    }

    // Update rider location
    order.riderLocation = {
      lat: latitude,
      lng: longitude,
      speed: speed || 0,
      heading: heading || 0,
      updatedAt: new Date(),
    };
    await order.save();

    // Get customer location for ETA
    let etaInfo = null;
    if (order.deliveryAddressCoords) {
      etaInfo = calculateETA(
        { lat: latitude, lng: longitude },
        order.deliveryAddressCoords
      );
      order.estimatedArrival = etaInfo.eta;
      await order.save();
    }

    // Emit socket event for real-time tracking
    const io = req.app.get("io");
    if (io) {
      io.to(`order:${orderId}`).emit("rider-location-update", {
        orderId,
        latitude,
        longitude,
        speed: speed || 0,
        heading: heading || 0,
        timestamp: new Date(),
      });

      if (etaInfo) {
        io.to(`order:${orderId}`).emit("eta-update", {
          orderId,
          eta: etaInfo.eta,
          distance: etaInfo.distance,
          duration: etaInfo.duration,
          timestamp: new Date(),
        });
      }
    }

    res.json({
      success: true,
      orderId,
      location: order.riderLocation,
      eta: etaInfo,
    });
  })
);

/* ───────────────────────── RIDER: GET MY DELIVERIES ───────────────────────── */
router.get(
  "/rider/orders",
  requireAuth,
  asyncHandler(async (req, res) => {
    const riderId = req.user.userId;
    const { status } = req.query;

    const filter = { riderId };
    if (status) {
      filter.orderStatus = status;
    }

    const orders = await Order.find(filter)
      .populate("userId", "name phone")
      .populate("vendorId", "storeName")
      .sort({ createdAt: -1 })
      .lean();

    res.json(orders || []);
  })
);

/* ───────────────────────── RIDER: START DELIVERY ───────────────────────── */
router.post(
  "/rider/start-delivery",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { orderId } = req.body;
    const riderId = req.user.userId;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Verify rider is assigned
    if (String(order.riderId) !== String(riderId)) {
      return res.status(403).json({ error: "Not assigned to this order" });
    }

    // Update status
    order.orderStatus = "out_for_delivery";
    order.deliveryStartedAt = new Date();
    order.liveTrackingEnabled = true;
    await order.save();

    // Emit status update
    const io = req.app.get("io");
    if (io) {
      io.to(`order:${orderId}`).emit("order-status-update", {
        orderId,
        status: "out_for_delivery",
        riderId,
        timestamp: new Date(),
      });
    }

    res.json({
      success: true,
      order: {
        _id: order._id,
        orderStatus: order.orderStatus,
        deliveryStartedAt: order.deliveryStartedAt,
      },
    });
  })
);

/* ───────────────────────── RIDER: COMPLETE DELIVERY ───────────────────────── */
router.post(
  "/rider/complete-delivery",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { orderId, deliveryCode } = req.body;
    const riderId = req.user.userId;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Verify rider is assigned
    if (String(order.riderId) !== String(riderId)) {
      return res.status(403).json({ error: "Not assigned to this order" });
    }

    // For COD orders, verify delivery code if provided
    if (order.paymentMethod === "cash" && !deliveryCode) {
      return res.status(400).json({ error: "Delivery code required for COD orders" });
    }

    // Update status
    order.orderStatus = "delivered";
    order.deliveredAt = new Date();
    order.liveTrackingEnabled = false;
    await order.save();

    // Process wallet earnings for vendors (async, don't block response)
    walletService.processOrderEarnings(orderId).catch(err => {
      console.error("[DELIVERY] Failed to process wallet earnings:", err.message);
    });

    // Emit delivery completed
    const io = req.app.get("io");
    if (io) {
      io.to(`order:${orderId}`).emit("delivery-completed", {
        orderId,
        deliveredAt: order.deliveredAt,
        timestamp: new Date(),
      });
    }

    res.json({
      success: true,
      order: {
        _id: order._id,
        orderStatus: order.orderStatus,
        deliveredAt: order.deliveredAt,
      },
    });
  })
);

/* ───────────────────────── ADMIN: ASSIGN RIDER ───────────────────────── */
router.post(
  "/assign-rider",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { orderId, riderId } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Verify rider exists and is a rider
    const rider = await User.findById(riderId);
    if (!rider || !rider.isRider) {
      return res.status(400).json({ error: "Invalid rider" });
    }

    // Update order with rider
    order.riderId = riderId;
    order.orderStatus = "confirmed";
    await order.save();

    // Get rider info for notification
    const riderInfo = await User.findById(riderId).select("name phoneNumber").lean();

    // Emit rider assigned event
    const io = req.app.get("io");
    if (io) {
      io.to(`order:${orderId}`).emit("rider-assigned", {
        orderId,
        riderId,
        riderName: riderInfo?.name,
        riderPhone: riderInfo?.phoneNumber,
        timestamp: new Date(),
      });
    }

    res.json({
      success: true,
      order: {
        _id: order._id,
        riderId: order.riderId,
        orderStatus: order.orderStatus,
      },
      rider: riderInfo,
    });
  })
);

/* ───────────────────────── ADMIN: GET ALL ACTIVE DELIVERIES ───────────────────────── */
router.get(
  "/admin/live",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const activeRiders = req.app.get("activeRiders") || new Map();

    // Get orders that are out for delivery
    const activeDeliveries = await Order.find({
      orderStatus: { $in: ["confirmed", "preparing", "out_for_delivery"] },
    })
      .populate("userId", "name phone")
      .populate("vendorId", "storeName")
      .populate("riderId", "name phoneNumber")
      .lean();

    // Format response with rider locations
    const deliveries = activeDeliveries.map((order) => {
      const riderData = activeRiders.get(String(order.riderId?._id || order.riderId));
      return {
        _id: order._id,
        orderStatus: order.orderStatus,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        deliveryAddress: order.deliveryAddress,
        vendorName: order.vendorId?.storeName,
        riderName: order.riderId?.name,
        riderPhone: order.riderId?.phoneNumber,
        riderLocation: order.riderLocation || riderData?.lastLocation,
        estimatedArrival: order.estimatedArrival,
        createdAt: order.createdAt,
        deliveryStartedAt: order.deliveryStartedAt,
      };
    });

    res.json({
      deliveries,
      activeRidersCount: activeRiders.size,
    });
  })
);

/* ───────────────────────── ADMIN: GET RIDER PERFORMANCE ───────────────────────── */
router.get(
  "/admin/riders",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    // Get all riders
    const riders = await User.find({ isRider: true })
      .select("name email phoneNumber vendorStatus createdAt")
      .lean();

    // Get delivery stats for each rider
    const riderStats = await Promise.all(
      riders.map(async (rider) => {
        const totalDeliveries = await Order.countDocuments({
          riderId: rider._id,
          orderStatus: "delivered",
        });

        const completedDeliveries = await Order.countDocuments({
          riderId: rider._id,
          orderStatus: "delivered",
        });

        const failedDeliveries = await Order.countDocuments({
          riderId: rider._id,
          orderStatus: "failed",
        });

        const totalRevenue = await Order.aggregate([
          {
            $match: {
              riderId: rider._id,
              orderStatus: "delivered",
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$totalAmount" },
            },
          },
        ]);

        return {
          ...rider,
          totalDeliveries,
          completedDeliveries,
          failedDeliveries,
          totalRevenue: totalRevenue[0]?.total || 0,
        };
      })
    );

    res.json(riderStats);
  })
);

/* ───────────────────────── VENDOR: GET MY DELIVERIES ───────────────────────── */
router.get(
  "/vendor/live",
  requireAuth,
  requireVendor,
  asyncHandler(async (req, res) => {
    const vendorId = req.user.userId;

    // Get orders for this vendor
    const deliveries = await Order.find({
      "items.vendorId": vendorId,
      orderStatus: { $in: ["pending", "confirmed", "preparing", "out_for_delivery", "delivered"] },
    })
      .populate("userId", "name phone")
      .populate("riderId", "name phoneNumber")
      .sort({ createdAt: -1 })
      .lean();

    res.json(deliveries || []);
  })
);

/* ───────────────────────── GET ETA FOR ORDER ───────────────────────── */
router.get(
  "/eta/:orderId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user.userId;

    const order = await Order.findById(orderId).lean();
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Verify access
    const isCustomer = String(order.userId) === String(userId);
    const isVendor = String(order.vendorId) === String(userId);
    const isAdmin = req.user.isAdmin;
    const isRider = String(order.riderId) === String(userId);

    if (!isCustomer && !isVendor && !isAdmin && !isRider) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Calculate ETA if rider is en route
    let etaInfo = null;
    if (
      order.orderStatus === "out_for_delivery" &&
      order.riderLocation &&
      order.deliveryAddressCoords
    ) {
      etaInfo = calculateETA(
        order.riderLocation,
        order.deliveryAddressCoords
      );
    } else if (order.orderStatus === "confirmed" || order.orderStatus === "preparing") {
      // Estimate based on average delivery time
      etaInfo = {
        distance: "2.5",
        duration: 25,
        eta: new Date(Date.now() + 25 * 60 * 1000),
      };
    }

    res.json({
      orderId,
      status: order.orderStatus,
      eta: etaInfo,
      riderLocation: order.riderLocation,
    });
  })
);

module.exports = router;