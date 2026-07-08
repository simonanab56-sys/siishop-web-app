/**
 * MIGRATION SCRIPT: Migrate to Unified Product System
 *
 * This script:
 * 1. Migrates MenuItems to Product collection
 * 2. Adds productType field to existing products
 * 3. Sets vendorType on products based on their vendor's vendorType
 * 4. Creates unified product system
 *
 * Run this ONCE:
 *   node backend/migrations/migrateToUnifiedProducts.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/siishop";

async function migrate() {
  console.log("🔄 Starting Unified Product Migration...\n");

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const Product = require("../models/Product");
    const MenuItem = require("../models/MenuItem");
    const MenuCategory = require("../models/MenuCategory");
    const User = require("../models/User");

    // ============================================
    // STEP 1: Migrate MenuItems to Products
    // ============================================
    console.log("\n📦 Step 1: Migrating MenuItems to Products...");

    const menuItems = await MenuItem.find({ isDeleted: { $ne: true } });
    console.log(`   Found ${menuItems.length} menu items to migrate`);

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
    // STEP 2: Add productType to existing products
    // ============================================
    console.log("\n📦 Step 2: Adding productType to existing products...");

    const productResult = await Product.updateMany(
      {
        $or: [
          { productType: { $exists: false } },
          { productType: null },
          { productType: "" }
        ]
      },
      { $set: { productType: "product" } }
    );
    console.log(`   ✅ Updated ${productResult.modifiedCount} products with productType`);

    // ============================================
    // STEP 3: Set productType based on vendor's vendorType
    // ============================================
    console.log("\n📦 Step 3: Syncing productType with vendor type...");

    // Get all restaurant vendors
    const restaurantVendors = await User.find({
      isVendor: true,
      vendorType: "restaurant"
    }).select("_id");

    const restaurantVendorIds = restaurantVendors.map(v => v._id);

    // Update products from restaurant vendors to be "food"
    const foodResult = await Product.updateMany(
      {
        vendorId: { $in: restaurantVendorIds },
        productType: "product"
      },
      { $set: { productType: "food" } }
    );
    console.log(`   ✅ Updated ${foodResult.modifiedCount} products to food type (from restaurant vendors)`);

    // Get marketplace vendors
    const marketplaceVendors = await User.find({
      isVendor: true,
      vendorType: "marketplace"
    }).select("_id");

    const marketplaceVendorIds = marketplaceVendors.map(v => v._id);

    // Update products from marketplace vendors to be "product"
    const productResult2 = await Product.updateMany(
      {
        vendorId: { $in: marketplaceVendorIds },
        productType: "food"
      },
      { $set: { productType: "product" } }
    );
    console.log(`   ✅ Updated ${productResult2.modifiedCount} products to product type (from marketplace vendors)`);

    // ============================================
    // STEP 4: Summary
    // ============================================
    console.log("\n📋 Final Counts:");
    console.log("================");

    const totalProducts = await Product.countDocuments({ isDeleted: { $ne: true } });
    const marketplaceProducts = await Product.countDocuments({
      isDeleted: { $ne: true },
      productType: "product"
    });
    const foodProducts = await Product.countDocuments({
      isDeleted: { $ne: true },
      productType: "food"
    });
    const menuItemsCount = await MenuItem.countDocuments({ isDeleted: { $ne: true } });

    console.log(`   Total Products: ${totalProducts}`);
    console.log(`   - Marketplace Products: ${marketplaceProducts}`);
    console.log(`   - Food Items: ${foodProducts}`);
    console.log(`   Remaining MenuItems: ${menuItemsCount}`);

    const totalVendors = await User.countDocuments({ isVendor: true });
    const marketplaceVendorsCount = await User.countDocuments({
      isVendor: true,
      vendorType: "marketplace"
    });
    const restaurantVendorsCount = await User.countDocuments({
      isVendor: true,
      vendorType: "restaurant"
    });

    console.log(`\n   Total Vendors: ${totalVendors}`);
    console.log(`   - Marketplace Vendors: ${marketplaceVendorsCount}`);
    console.log(`   - Restaurant Vendors: ${restaurantVendorsCount}`);

    console.log("\n✅ Unified Product Migration complete!");
    console.log("\n📝 Summary:");
    console.log("   - Products now have productType field");
    console.log("   - Restaurant menu items are in Product collection");
    console.log("   - Food page will now show productType: 'food'");
    console.log("   - Homepage will show productType: 'product'");

  } catch (err) {
    console.error("❌ Migration failed:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
    process.exit(0);
  }
}

migrate();