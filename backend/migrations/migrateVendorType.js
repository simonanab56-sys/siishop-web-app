/**
 * MIGRATION SCRIPT: Add vendorType to existing records
 *
 * This script ensures backward compatibility by setting:
 * - All existing vendors to vendorType = "marketplace"
 * - All existing products will be associated with marketplace vendors
 *
 * Only actual restaurant vendors should have vendorType = "restaurant"
 *
 * Run this ONCE to migrate existing data:
 *   node backend/migrations/migrateVendorType.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/siishop";

async function migrate() {
  console.log("🔄 Starting vendorType migration...\n");

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const User = require("../models/User");
    const Product = require("../models/Product");

    // ============================================
    // STEP 1: Migrate existing vendors
    // ============================================
    console.log("\n📊 Step 1: Migrating vendors...");

    // Find all vendors without vendorType or with null/empty vendorType
    const vendorResult = await User.updateMany(
      {
        isVendor: true,
        $or: [
          { vendorType: { $exists: false } },
          { vendorType: null },
          { vendorType: "" }
        ]
      },
      { $set: { vendorType: "marketplace" } }
    );
    console.log(`   ✅ Updated ${vendorResult.modifiedCount} vendors to marketplace`);

    // Count total vendors
    const totalVendors = await User.countDocuments({ isVendor: true });
    console.log(`   📈 Total vendors in database: ${totalVendors}`);

    // Count by vendorType
    const marketplaceVendors = await User.countDocuments({
      isVendor: true,
      vendorType: "marketplace"
    });
    const restaurantVendors = await User.countDocuments({
      isVendor: true,
      vendorType: "restaurant"
    });
    console.log(`   🏪 Marketplace vendors: ${marketplaceVendors}`);
    console.log(`   🍔 Restaurant vendors: ${restaurantVendors}`);

    // ============================================
    // STEP 2: Verify products
    // ============================================
    console.log("\n📦 Step 2: Checking products...");

    const totalProducts = await Product.countDocuments({ isDeleted: { $ne: true } });
    console.log(`   📈 Total products in database: ${totalProducts}`);

    // Get marketplace vendor IDs
    const marketplaceVendorIds = await User.find({
      isVendor: true,
      vendorType: "marketplace",
      vendorStatus: "approved"
    }).select("_id");

    const productVendorIds = marketplaceVendorIds.map(v => v._id);

    // Count products from marketplace vendors
    const marketplaceProducts = await Product.countDocuments({
      vendorId: { $in: productVendorIds },
      isDeleted: { $ne: true }
    });
    console.log(`   🛍️ Products from marketplace vendors: ${marketplaceProducts}`);

    // ============================================
    // STEP 3: Summary
    // ============================================
    console.log("\n📋 Migration Summary:");
    console.log("=====================");
    console.log(`Total Vendors: ${totalVendors}`);
    console.log(`  - Marketplace: ${marketplaceVendors}`);
    console.log(`  - Restaurant: ${restaurantVendors}`);
    console.log(`Total Products: ${totalProducts}`);
    console.log(`  - Visible on Marketplace: ${marketplaceProducts}`);
    console.log("\n✅ Migration complete!");
    console.log("\n📝 Note: Products don't need vendorType directly.");
    console.log("   Products are filtered by their vendor's vendorType.");

  } catch (err) {
    console.error("❌ Migration failed:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
    process.exit(err ? 1 : 0);
  }
}

migrate();