"use strict";
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const userSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true, sparse: true },
    password: { type: String, select: false },
    isAdmin: { type: Boolean, default: false },
    isVendor: { type: Boolean, default: false },
    storeName: String,
    storeDescription: String,
    storeLogo: String,
    vendorStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "pending",
    },
    /* ── Vendor Approval Fields ── */
    vendorRejectedReason: {
      type: String,
      default: "",
    },
    approvedAt: Date,
    
    /* ── KYC Fields (Only for vendors) ── */
    phoneNumber: String,
    idType: {
      type: String,
      enum: ["passport", "driver_license", "national_id"],
    },
    idFrontImage: String,
    idBackImage: String,
    kycStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
    },
    tokenVersion: { type: Number, default: 0 },
    resetToken: String,
    resetExpires: Date,
    
    /* ── OAuth Fields ── */
    googleId: String,
    appleId: String,
    
    /* ── Vendor Revenue Tracking ── */
    revenue: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastRevenueUpdate: Date,
  },
  { timestamps: true }
);

/* ── Indexes for performance ── */
// Note: email index is already defined via unique: true, sparse: true
// ✅ ADDED: Vendor status index for admin queries
userSchema.index({ isVendor: 1, vendorStatus: 1 });
// ✅ ADDED: Admin flag index
userSchema.index({ isAdmin: 1 });
// ✅ ADDED: Created date index for sorting
userSchema.index({ createdAt: -1 });
// ✅ ADDED: Revenue index for vendor earnings queries
userSchema.index({ isVendor: 1, revenue: -1 });

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function (pwd) {
  return bcrypt.compare(pwd, this.password);
};

/* ── Helper: Check if vendor has completed KYC ── */
userSchema.methods.hasCompletedKYC = function () {
  if (!this.isVendor) return true; // Non-vendors don't need KYC
  return (
    this.phoneNumber &&
    this.idType &&
    this.idFrontImage &&
    this.idBackImage &&
    this.kycStatus === "verified"
  );
};

/* ── Helper: Get KYC completion percentage ── */
userSchema.methods.getKYCProgress = function () {
  if (!this.isVendor) return 100;
  const fields = [
    this.phoneNumber,
    this.idType,
    this.idFrontImage,
    this.idBackImage,
  ];
  const completed = fields.filter(Boolean).length;
  return Math.round((completed / fields.length) * 100);
};

/* ── Helper: Check if vendor is approved ── */
userSchema.methods.isApprovedVendor = function () {
  return this.isVendor && this.vendorStatus === "approved";
};

module.exports = mongoose.model("User", userSchema);
