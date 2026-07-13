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
    isRider: { type: Boolean, default: false },
    riderStatus: {
      type: String,
      enum: ["inactive", "active", "busy"],
      default: "inactive",
    },
    storeName: String,
    storeDescription: String,
    storeLogo: String,
    // ✅ NEW: Cloudinary public_id for storeLogo — used to delete the old asset
    // on branding re-upload. Optional with default "" so legacy docs (no
    // public_id stored) still work — the upload endpoint simply skips the
    // destroy step when this is empty.
    storeLogoPublicId: { type: String, default: "" },
    vendorSlug: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    vendorStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "pending",
    },
    // ✅ NEW: Vendor Type for dual marketplace (marketplace vs restaurant)
    vendorType: {
      type: String,
      enum: ["marketplace", "restaurant"],
      default: "marketplace",
    },
    // ✅ NEW: Restaurant-specific fields (only for restaurant vendors)
    restaurantDetails: {
      restaurantName: String,
      restaurantLogo: String,
      restaurantCoverImage: String,
      // ✅ NEW: Cloudinary public_id for the cover image. Same skip-deletion-
      // when-empty contract as storeLogoPublicId.
      coverImagePublicId: { type: String, default: "" },
      restaurantDescription: String,
      address: String,
      area: String,
      whatsapp: String,
      deliveryRadius: { type: Number, default: 5 }, // in km
      deliveryFee: { type: Number, default: 0 },
      estimatedDeliveryTime: { type: Number, default: 30 }, // minutes
      openingHours: String, // e.g., "08:00"
      closingHours: String, // e.g., "22:00"
      cuisineType: String,
      isOpen: { type: Boolean, default: false },
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

    /* ── Chat Status ── */
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: null },
    chatSettings: {
      notificationsEnabled: { type: Boolean, default: true },
      soundEnabled: { type: Boolean, default: true },
    },

    /* ── Vendor Revenue Tracking ── */
    revenue: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastRevenueUpdate: Date,

    /* ── Vendor Location (Ghana-focused) ── */
    location: {
      country: { type: String, default: "Ghana" },
      region: { type: String, default: "" },
      city: { type: String, default: "" },
    },

    /* ── Notification preferences + device tokens (Phase 8) ────────
       These are appended to the existing User schema. Default values
       mean "all channels on, marketing off, no DND" — a sensible
       starting point that matches the existing opt-in model. */
    notificationPrefs: {
      push:           { type: Boolean, default: true },
      email:          { type: Boolean, default: true },
      inApp:          { type: Boolean, default: true },
      promotional:    { type: Boolean, default: true },
      orderUpdates:   { type: Boolean, default: true },
      walletUpdates:  { type: Boolean, default: true },
      reviewReminders:{ type: Boolean, default: true },
      marketing:      { type: Boolean, default: false },
      dndStart:       { type: String, default: "" },   // "22:00" 24h
      dndEnd:         { type: String, default: "" },   // "07:00"
    },
    deviceTokens: [{
      token: { type: String, required: true },
      platform: { type: String, enum: ["web", "android", "ios"], default: "web" },
      userAgent: { type: String, default: "" },
      createdAt: { type: Date, default: Date.now },
    }],
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
// ✅ ADDED: Revenue index for vendor earnings
userSchema.index({ isVendor: 1, revenue: -1 });
// ✅ ADDED: Location indexes for filtering
userSchema.index({ "location.region": 1 });
userSchema.index({ "location.city": 1 });
userSchema.index({ "location.region": 1, "location.city": 1 });
// ✅ NEW: Vendor type indexes for dual marketplace filtering
userSchema.index({ isVendor: 1, vendorType: 1, vendorStatus: 1 });
userSchema.index({ vendorType: 1, "location.region": 1 });
userSchema.index({ vendorType: 1, "location.city": 1 });
// ✅ NEW: Restaurant-specific indexes
userSchema.index({ vendorType: 1, "restaurantDetails.cuisineType": 1 });
userSchema.index({ vendorType: 1, "restaurantDetails.isOpen": 1 });

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

/* ── Helper: Get formatted location string ── */
userSchema.methods.getFormattedLocation = function () {
  if (!this.location || !this.location.region || !this.location.city) {
    return "Location not specified";
  }
  return `${this.location.city}, ${this.location.region}`;
};

/* ── Helper: Check if vendor has location ── */
userSchema.methods.hasLocation = function () {
  return !!(this.location && this.location.region && this.location.city);
};

module.exports = mongoose.model("User", userSchema);
