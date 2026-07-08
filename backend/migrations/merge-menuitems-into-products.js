/**
 * MIGRATION: merge-menuitems-into-products
 *
 * One-time idempotent script that finishes the MenuItem → Product merge
 * the older `migrateToUnifiedProducts.js` started. The older script
 * *copied* MenuItem rows into Product but did not mark the source
 * MenuItem as deleted, so the slug endpoint still had to query BOTH
 * collections to avoid dropping live data. The slug endpoint is about
 * to drop its MenuItem query (see routes/restaurants.js optimization),
 * so this script:
 *
 *   1. Finds every MenuItem that has NO matching Product row (matched
 *      on `(vendorId, name, productType: "food")`).
 *   2. Copies it into Product with all image/video fields normalized.
 *   3. Marks the source MenuItem as `isDeleted: true` (does NOT drop it
 *      — preserved for audit and rollback).
 *
 * Idempotent: re-running this script is a no-op once every MenuItem is
 * either matched by an existing Product or marked deleted.
 *
 * Run ONCE before deploying the slug-endpoint MenuItem removal:
 *   cd backend
 *   node migrations/merge-menuitems-into-products.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/siishop";

async function migrate() {
  console.log("🔄 Starting MenuItem → Product merge (idempotent)...\n");

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const Product = require("../models/Product");
    const MenuItem = require("../models/MenuItem");

    // Step 1: enumerate MenuItems that are still live. We process both
    // `isDeleted: false` and missing/true (so a re-run of this script
    // can finish anything the older script missed). The "live" filter
    // is `{ isDeleted: { $ne: true } }` to match the app's contract.
    const liveMenuItems = await MenuItem.find({ isDeleted: { $ne: true } });
    console.log(`📦 Live MenuItems to consider: ${liveMenuItems.length}`);

    let created = 0;
    let alreadyMerged = 0;
    let markedDeleted = 0;

    for (const item of liveMenuItems) {
      // Match by (vendorId, name, productType: "food"). Case-insensitive
      // name match because vendors sometimes rename items with whitespace
      // changes ("Jollof  Rice" vs "Jollof Rice"). The productType
      // guard prevents matching a marketplace item with the same name.
      const existing = await Product.findOne({
        vendorId: item.vendorId,
        productType: "food",
        name: { $regex: `^${escapeRegex(item.name)}$`, $options: "i" },
      }).lean();

      if (existing) {
        alreadyMerged++;
      } else {
        // Copy fields. The Product schema has slightly different
        // field names (`videoUrl` vs `video`, `videoPublicId` vs
        // `videoPublicId`, `image` legacy string + `images` array)
        // so we normalize them here.
        const images = Array.isArray(item.images) && item.images.length > 0
          ? item.images.map((img) => ({
              url: img.url,
              public_id: img.public_id || "",
            }))
          : item.image
            ? [{ url: item.image, public_id: "" }]
            : [];

        await Product.create({
          name: item.name,
          description: item.description || "",
          price: item.price,
          category: item.category,
          vendorId: item.vendorId,
          stock: 0,
          available: item.available !== false,
          image: item.image || images[0]?.url || "",
          images,
          videoUrl: item.video || "",
          videoPublicId: item.videoPublicId || "",
          preparationTime: item.preparationTime || 15,
          portionSize: item.portionSize || "",
          ingredients: item.ingredients || "",
          allergens: item.allergens || "",
          spiceLevel: item.spiceLevel || "normal",
          productType: "food",
          isDeleted: false,
        });
        created++;
      }

      // Mark the source MenuItem as deleted — preserves the row for
      // audit / rollback but hides it from app queries.
      await MenuItem.updateOne(
        { _id: item._id },
        { $set: { isDeleted: true } }
      );
      markedDeleted++;
    }

    console.log(`\n📋 Merge results:`);
    console.log(`   Already merged (Product existed): ${alreadyMerged}`);
    console.log(`   Newly created in Product:         ${created}`);
    console.log(`   MenuItems marked isDeleted:       ${markedDeleted}`);

    // Final sanity counts.
    const remainingLiveMenuItems = await MenuItem.countDocuments({
      isDeleted: { $ne: true },
    });
    const totalFoodProducts = await Product.countDocuments({
      isDeleted: { $ne: true },
      productType: "food",
    });

    console.log(`\n📊 Final state:`);
    console.log(`   Live MenuItems:  ${remainingLiveMenuItems}`);
    console.log(`   Food Products:   ${totalFoodProducts}`);

    if (remainingLiveMenuItems > 0) {
      console.warn(
        `\n⚠️  ${remainingLiveMenuItems} MenuItems are still live. ` +
        "The slug endpoint still needs the legacy MenuItem.find until they are merged."
      );
    } else {
      console.log(
        "\n✅ All MenuItems merged. The slug endpoint can safely drop its MenuItem.find query."
      );
    }

    console.log("\n✅ Merge migration complete.");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
  }
}

// Escape user-supplied strings for use inside a regex literal. Without
// this, an item named "Jollof (spicy)" would crash the regex compiler.
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

migrate();
