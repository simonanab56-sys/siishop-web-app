/**
 * Migration: Fix restaurant vendors missing vendorType
 *
 * Run: node migrations/fix-restaurant-vendors.js
 *
 * This script finds users with restaurantDetails but missing vendorType
 * and sets vendorType to "restaurant"
 */

require("dotenv").config();
const mongoose = require("mongoose");

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/siishop");
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;
    const usersCollection = db.collection("users");

    // Find users with restaurantDetails but no vendorType (or vendorType is marketplace)
    const result = await usersCollection.updateMany(
      {
        isVendor: true,
        $or: [
          { vendorType: { $exists: false } },
          { vendorType: { $eq: "marketplace" } },
          { vendorType: { $eq: null } },
          { vendorType: { $exists: true, $ne: "restaurant", restaurantDetails: { $exists: true, $ne: null } } }
        ]
      },
      {
        $set: {
          vendorType: "restaurant",
          "restaurantDetails.isOpen": false
        }
      }
    );

    console.log(`Updated ${result.modifiedCount} users`);

    // Also update vendorStatus to "approved" if it's missing/null for restaurant vendors
    const statusResult = await usersCollection.updateMany(
      {
        isVendor: true,
        vendorType: "restaurant",
        $or: [
          { vendorStatus: { $exists: false } },
          { vendorStatus: { $eq: null } },
          { vendorStatus: { $eq: "pending" } }
        ]
      },
      {
        $set: {
          vendorStatus: "approved",
          approvedAt: new Date()
        }
      }
    );

    console.log(`Updated ${statusResult.modifiedCount} users with vendorStatus`);

    // Verify: Show some updated users
    const updatedUsers = await usersCollection.find(
      { vendorType: "restaurant" }
    ).limit(5).toArray();

    console.log("\nSample updated users:");
    updatedUsers.forEach(u => {
      console.log(`- ${u.name} (${u.email}):`, {
        isVendor: u.isVendor,
        vendorType: u.vendorType,
        vendorStatus: u.vendorStatus,
        hasRestaurantDetails: !!(u.restaurantDetails && Object.keys(u.restaurantDetails).length > 0)
      });
    });

    console.log("\n✅ Migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  }
}

migrate();