/**
 * Database Audit Script
 * Run: node backend/debug/auditDatabase.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/siishop";

async function audit() {
  console.log("=== DATABASE AUDIT ===\n");

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    const User = require("../models/User");
    const Product = require("../models/Product");
    const MenuItem = require("../models/MenuItem");

    // ALL VENDORS
    console.log("📊 ALL VENDORS:");
    const allVendors = await User.find({ isVendor: true });
    console.log("   Total: " + allVendors.length);
    for (const v of allVendors) {
      console.log("   - " + (v.storeName || v.name));
      console.log("     vendorType: " + (v.vendorType || "MISSING"));
      console.log("     vendorStatus: " + v.vendorStatus);
      console.log("     isOpen: " + v.restaurantDetails?.isOpen);
    }

    // RESTAURANT VENDORS
    console.log("\n🍔 RESTAURANT VENDORS:");
    const restaurants = await User.find({
      isVendor: true,
      vendorType: "restaurant",
      vendorStatus: "approved"
    });
    console.log("   Total approved: " + restaurants.length);
    for (const r of restaurants) {
      console.log("   - " + r.storeName);
      console.log("     isOpen: " + r.restaurantDetails?.isOpen);
    }

    // ALL PRODUCTS
    console.log("\n📦 ALL PRODUCTS:");
    const allProducts = await Product.find({ isDeleted: { $ne: true } });
    console.log("   Total: " + allProducts.length);
    for (const p of allProducts) {
      const vendor = await User.findById(p.vendorId);
      console.log("   - " + p.name);
      console.log("     productType: " + (p.productType || "MISSING"));
      console.log("     vendorType: " + (vendor?.vendorType || "UNKNOWN"));
      console.log("     vendorName: " + (vendor?.storeName || "UNKNOWN"));
    }

    // FOOD PRODUCTS
    console.log("\n🍔 FOOD PRODUCTS (productType: food):");
    const foodProducts = await Product.find({ productType: "food", isDeleted: { $ne: true } });
    console.log("   Total: " + foodProducts.length);

    // MARKETPLACE PRODUCTS
    console.log("\n🛒 MARKETPLACE PRODUCTS (productType: product):");
    const productProducts = await Product.find({ productType: "product", isDeleted: { $ne: true } });
    console.log("   Total: " + productProducts.length);

    // LEGACY MENU ITEMS
    console.log("\n📋 LEGACY MENU ITEMS:");
    const menuItems = await MenuItem.find({ isDeleted: { $ne: true } });
    console.log("   Total: " + menuItems.length);

    // SUMMARY
    console.log("\n========================================");
    console.log("📋 SUMMARY:");
    console.log("   Total Vendors: " + allVendors.length);
    console.log("   Restaurant Vendors: " + restaurants.length);
    console.log("   Total Products: " + allProducts.length);
    console.log("   Food Items: " + foodProducts.length);
    console.log("   Marketplace Products: " + productProducts.length);
    console.log("   Legacy Menu Items: " + menuItems.length);

  } catch (err) {
    console.error("❌ Audit failed:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected");
    process.exit(0);
  }
}

audit();