"use strict";
const mongoose = require("mongoose");

const foodOrderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    items: [
      {
        menuItemId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MenuItem",
          required: true,
        },
        name: String,
        price: Number,
        quantity: { type: Number, default: 1, min: 1 },
        image: String,
        preparationTime: Number,
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    deliveryAddress: {
      type: String,
      required: true,
    },
    deliveryPhone: {
      type: String,
      required: true,
    },
    deliveryName: String,
    paymentMethod: {
      type: String,
      enum: ["paystack", "cash"],
      default: "cash",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    paymentRef: String,
    orderStatus: {
      type: String,
      enum: ["pending", "received", "preparing", "ready", "rider_assigned", "on_the_way", "delivered", "cancelled"],
      default: "pending",
    },
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    estimatedDeliveryTime: {
      type: Number,
      default: 30, // minutes
    },
    deliveryCode: String,
    specialInstructions: String,
    customerNote: String,
  },
  { timestamps: true }
);

/* ── Indexes for performance ── */
foodOrderSchema.index({ userId: 1, createdAt: -1 });
foodOrderSchema.index({ restaurantId: 1, createdAt: -1 });
foodOrderSchema.index({ restaurantId: 1, orderStatus: 1 });
foodOrderSchema.index({ riderId: 1, orderStatus: 1 });

/* ── Generate delivery code ── */
foodOrderSchema.methods.generateDeliveryCode = function () {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  this.deliveryCode = code;
  return code;
};

module.exports = mongoose.model("FoodOrder", foodOrderSchema);