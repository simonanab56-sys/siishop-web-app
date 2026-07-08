/**
 * Migration: Restaurant Order Status → Canonical 6-Status Enum
 *
 * Run: node migrations/migrateRestaurantOrderStatuses.js
 *
 * Single source of truth migration. Maps legacy restaurant-only statuses
 * to the canonical enum shared by marketplace and restaurant vendors:
 *
 *   received        → confirmed
 *   ready           → preparing
 *   rider_assigned  → out_for_delivery
 *   on_the_way      → out_for_delivery
 *
 * This script is IDEMPOTENT — running it twice is a no-op (only legacy
 * statuses are touched; canonical statuses are left untouched).
 *
 * WHY: Stage 5 of the restaurant-order unification plan tightens the
 * Order.orderStatus enum to drop the 4 restaurant-only values. Any
 * historical Order docs still using those values would fail validation
 * when next saved. This script normalizes the data BEFORE the enum
 * tightening ships, so the cutover is safe.
 *
 * Scope: only Order docs with orderType: "food" are touched. Marketplace
 * orders never used the legacy statuses, so they're left alone.
 */

require("dotenv").config();
const mongoose = require("mongoose");

const LEGACY_TO_CANONICAL = {
  received: "confirmed",
  ready: "preparing",
  rider_assigned: "out_for_delivery",
  on_the_way: "out_for_delivery",
};

async function migrate() {
  try {
    await mongoose.connect(
      process.env.MONGO_URI || "mongodb://localhost:27017/siishop"
    );
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;
    const ordersCollection = db.collection("orders");

    // Dry-run summary first so the operator sees counts before any writes.
    console.log("\n— Pre-migration counts —");
    for (const [from, to] of Object.entries(LEGACY_TO_CANONICAL)) {
      const count = await ordersCollection.countDocuments({
        orderType: "food",
        orderStatus: from,
      });
      console.log(`  ${from.padEnd(16)} → ${to.padEnd(20)} : ${count} orders`);
    }

    // Run migrations one legacy value at a time and log per-step results.
    console.log("\n— Running migrations —");
    for (const [from, to] of Object.entries(LEGACY_TO_CANONICAL)) {
      const result = await ordersCollection.updateMany(
        { orderType: "food", orderStatus: from },
        { $set: { orderStatus: to, updatedAt: new Date() } }
      );
      console.log(
        `  ${from} → ${to}: matched ${result.matchedCount}, modified ${result.modifiedCount}`
      );
    }

    // Verify: ensure no food orders still carry a legacy status.
    console.log("\n— Post-migration verification —");
    const remaining = await ordersCollection.countDocuments({
      orderType: "food",
      orderStatus: { $in: Object.keys(LEGACY_TO_CANONICAL) },
    });
    console.log(`  Legacy-status food orders remaining: ${remaining}`);

    if (remaining > 0) {
      console.warn(
        "⚠️  Some legacy-status orders are still present. Re-run this script."
      );
    } else {
      console.log("✅ All restaurant orders are on the canonical enum.");
    }

    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  }
}

migrate();