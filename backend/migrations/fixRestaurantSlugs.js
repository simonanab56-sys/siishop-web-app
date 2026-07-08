/**
 * MIGRATION: Auto-generate slugs for restaurants
 * Run: node backend/migrations/fixRestaurantSlugs.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/siishop";

async function migrate() {
  console.log("🔄 Fixing restaurant slugs...\n");

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const User = require("../models/User");

    // Find all restaurant vendors without vendorSlug
    const restaurants = await User.find({
      isVendor: true,
      vendorType: "restaurant",
      $or: [
        { vendorSlug: { $exists: false } },
        { vendorSlug: null },
        { vendorSlug: "" }
      ]
    });

    console.log(`Found ${restaurants.length} restaurants without slugs`);

    for (const r of restaurants) {
      const slug = r.storeName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      r.vendorSlug = slug;
      await r.save();
      console.log(`   ✅ Set slug to "${slug}" for ${r.storeName}`);
    }

    // Also verify marketplace vendors have slugs
    const marketplaceVendors = await User.find({
      isVendor: true,
      vendorType: "marketplace",
      $or: [
        { vendorSlug: { $exists: false } },
        { vendorSlug: null },
        { vendorSlug: "" }
      ]
    });

    console.log(`\nFound ${marketplaceVendors.length} marketplace vendors without slugs`);

    for (const v of marketplaceVendors) {
      const slug = v.storeName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      v.vendorSlug = slug;
      await v.save();
      console.log(`   ✅ Set slug to "${slug}" for ${v.storeName}`);
    }

    console.log("\n✅ Slug migration complete!");
    console.log("\n📝 Now restart the backend server and test the Food page");

  } catch (err) {
    console.error("❌ Migration failed:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected");
    process.exit(0);
  }
}

migrate();