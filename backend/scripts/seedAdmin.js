"use strict";

// scripts/seedAdmin.js
// Run: node scripts/seedAdmin.js

const mongoose = require("mongoose");
const User = require("../models/User");
require("dotenv").config({ path: "./.env" });

const NODE_ENV = process.env.NODE_ENV || "development";

const SEEDS = [
  {
    name: "Admin",
    email: "admin@shopflow.com",
    password: "admin123",
    isAdmin: true,
    label: "Admin",
  },
  {
    name: "Demo Vendor",
    email: "vendor@shopflow.com",
    password: "vendor123",
    isVendor: true,
    vendorStatus: "approved",
    storeName: "Demo Electronics Store",
    storeDescription: "Quality electronics at great prices",
    label: "Demo Vendor",
  },
];

async function connectDB() {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI missing in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  console.log("✅ MongoDB connected\n");
}

async function upsertUser(data) {
  const { label, ...userData } = data;

  const existing = await User.findOne({ email: userData.email });

  if (existing) {
    console.log(`🔄 Updating existing ${label}: ${userData.email}`);

    // Only update safe fields (never overwrite password blindly in prod)
    existing.name = userData.name || existing.name;
    existing.isAdmin = userData.isAdmin ?? existing.isAdmin;
    existing.isVendor = userData.isVendor ?? existing.isVendor;
    existing.vendorStatus = userData.vendorStatus || existing.vendorStatus;
    existing.storeName = userData.storeName || existing.storeName;
    existing.storeDescription =
      userData.storeDescription || existing.storeDescription;

    // Only reset password in development
    if (NODE_ENV !== "production") {
      existing.password = userData.password;
      console.log("   🔐 Password reset (dev only)");
    }

    await existing.save();

    console.log(`✅ ${label} updated`);
    return;
  }

  const user = new User(userData);
  await user.save();

  console.log(`✅ ${label} created:`);
  console.log(`   Email:    ${userData.email}`);
  console.log(`   Password: ${userData.password}`);
}

async function seed() {
  try {
    await connectDB();

    for (const seedData of SEEDS) {
      await upsertUser(seedData);
    }

    console.log("\n⚠️  IMPORTANT:");
    console.log("   Change default passwords after first login.");
    console.log("   Disable seed script in production environments.\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  }
}

seed();