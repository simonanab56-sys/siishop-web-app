/**
 * MIGRATION: Fix Restaurant Product Types
 *
 * This script:
 * 1. Finds all products where vendor has vendorType="restaurant" but productType is missing/incorrect
 * 2. Sets productType="food" for those products
 * 3. Also migrates any MenuItems to Products collection
 *
 * Run this ONCE:
 *   node backend/migrations/fixRestaurantProductTypes.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://simonanab:oheneba@cluster0.pkpyxdo.mongodb.net/shopflow";

async function migrate() {
  console.log("🔄 Starting Restaurant Product Type Fix...\n");

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const Product = require("../models/Product");
    const MenuItem = require("../models/MenuItem");
    const MenuCategory = require("../models/MenuCategory");
    const User = require("../models/User");

    // ============================================
    // STEP 1: Get all restaurant vendors
    // ============================================
    console.log("\n📦 Step 1: Finding restaurant vendors...");

    const restaurantVendors = await User.find({
      isVendor: true,
      vendorType: "restaurant"
    }).select("_id storeName");

    console.log(`   Found ${restaurantVendors.length} restaurant vendors`);
    restaurantVendors.forEach(v => console.log(`   - ${v.storeName} (${v._id})`));

    const restaurantVendorIds = restaurantVendors.map(v => v._id);

    // ============================================
    // STEP 2: Migrate MenuItems to Products (if any exist)
    // ============================================
    console.log("\n📦 Step 2: Checking for legacy MenuItems...");

    const menuItems = await MenuItem.find({ isDeleted: { $ne: true } });
    console.log(`   Found ${menuItems.length} legacy menu items`);

    let migrated = 0;
    for (const item of menuItems) {
      // Check if already exists in Product collection
      const existing = await Product.findOne({
        vendorId: item.vendorId,
        name: item.name,
        productType: "food"
      });

      if (!existing) {
        await Product.create({
          name: item.name,
          description: item.description,
          price: item.price,
          category: item.category,
          vendorId: item.vendorId,
          stock: 0,
          available: item.available,
          image: item.image,
          images: item.image ? [{ url: item.image, public_id: "" }] : [],
          productType: "food",
          preparationTime: item.preparationTime,
          isDeleted: false
        });
        migrated++;
      }
    }
    console.log(`   ✅ Migrated ${migrated} menu items to Products collection`);

    // ============================================
    // STEP 3: Fix products with missing/incorrect productType
    // ============================================
    console.log("\n📦 Step 3: Fixing productType for restaurant vendor products...");

    // Find products from restaurant vendors that have wrong/missing productType
    const incorrectProducts = await Product.find({
      vendorId: { $in: restaurantVendorIds },
      $or: [
        { productType: { $exists: false } },
        { productType: null },
        { productType: "" },
        { productType: "product" }
      ]
    });

    console.log(`   Found ${incorrectProducts.length} products with incorrect productType`);
    incorrectProducts.forEach(p => console.log(`   - ${p.name} (current: ${p.productType || 'MISSING'})`));

    // Update them to "food"
    if (incorrectProducts.length > 0) {
      const result = await Product.updateMany(
        {
          vendorId: { $in: restaurantVendorIds },
          $or: [
            { productType: { $exists: false } },
            { productType: null },
            { productType: "" },
            { productType: "product" }
          ]
        },
        { $set: { productType: "food" } }
      );
      console.log(`   ✅ Updated ${result.modifiedCount} products to productType: "food"`);
    }

    // ============================================
    // STEP 4: Verify the fix
    // ============================================
    console.log("\n📦 Step 4: Verifying results...");

    const foodProducts = await Product.find({
      vendorId: { $in: restaurantVendorIds },
      productType: "food",
      isDeleted: { $ne: true }
    });

    console.log(`   ✅ Total food products for restaurant vendors: ${foodProducts.length}`);
    foodProducts.forEach(p => console.log(`   - ${p.name} (category: ${p.category})`));

    // ============================================
    // STEP 5: Summary
    // ============================================
    console.log("\n📋 Summary:");
    console.log("================");
    console.log(`   Restaurant vendors: ${restaurantVendors.length}`);
    console.log(`   Menu items migrated: ${migrated}`);
    console.log(`   Products fixed: ${incorrectProducts.length}`);
    console.log(`   Food products total: ${foodProducts.length}`);

    console.log("\n✅ Restaurant Product Type Fix complete!");
    console.log("\n📝 Next steps:");
    console.log("   - Open /restaurant/eat-de-best in your browser");
    console.log("   - You should now see menu items!");

  } catch (err) {
    console.error("❌ Migration failed:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
    process.exit(0);
  }
}

migrate();