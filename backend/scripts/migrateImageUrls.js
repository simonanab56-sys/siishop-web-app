/**
 * Image URL Migration Script
 *
 * Purpose: Fixes corrupted image URLs in MongoDB that contain localhost URLs.
 *
 * Run with: node scripts/migrateImageUrls.js
 *
 * What it does:
 * 1. Finds all documents with localhost URLs in image fields
 * 2. Converts them to relative paths
 * 3. Logs all changes for review
 * 4. Reports summary statistics
 *
 * Safe to run multiple times - only updates records that need fixing.
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose = require("mongoose");

// MongoDB connection URI
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/siishop";

// Models to check (add more as needed)
const COLLECTIONS = [
  { name: "products", fields: ["image", "images"] },
  { name: "users", fields: ["storeLogo", "avatar", "image"] },
  { name: "promos", fields: ["image", "bannerImage"] },
  { name: "categories", fields: ["image", "icon"] },
];

// Regex patterns for localhost URLs
const LOCALHOST_PATTERNS = [
  /http:\/\/localhost:\d+\/uploads\//g,
  /http:\/\/127\.0\.0\.1:\d+\/uploads\//g,
  /https:\/\/localhost:\d+\/uploads\//g,
];

// Convert localhost URL to relative path
function convertToRelativePath(url) {
  if (!url || typeof url !== "string") return url;

  for (const pattern of LOCALHOST_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;

    if (pattern.test(url)) {
      // Extract the path after /uploads/
      const match = url.match(/\/uploads\/.+$/);
      if (match) {
        console.log(`  Converting: ${url} -> ${match[0]}`);
        return match[0];
      }
    }
  }

  return url;
}

// Process a single document
async function processDocument(collection, doc, fields) {
  let updateNeeded = false;
  const updates = {};
  const logEntry = { _id: doc._id, changes: [] };

  for (const field of fields) {
    // Handle direct string fields
    if (doc[field] && typeof doc[field] === "string") {
      const oldValue = doc[field];
      const newValue = convertToRelativePath(oldValue);

      if (oldValue !== newValue) {
        updates[field] = newValue;
        logEntry.changes.push({ field, from: oldValue, to: newValue });
        updateNeeded = true;
      }
    }

    // Handle array of objects with url field (like product.images)
    if (doc[field] && Array.isArray(doc[field])) {
      const newArray = doc[field].map(item => {
        if (item && typeof item === "object") {
          if (item.url && typeof item.url === "string") {
            const oldUrl = item.url;
            const newUrl = convertToRelativePath(oldUrl);
            if (oldUrl !== newUrl) {
              logEntry.changes.push({ field: `${field}[].url`, from: oldUrl, to: newUrl });
              updateNeeded = true;
              return { ...item, url: newUrl };
            }
          }
          if (item.image && typeof item.image === "string") {
            const oldImage = item.image;
            const newImage = convertToRelativePath(oldImage);
            if (oldImage !== newImage) {
              logEntry.changes.push({ field: `${field}[].image`, from: oldImage, to: newImage });
              updateNeeded = true;
              return { ...item, image: newImage };
            }
          }
        }
        return item;
      });

      if (updateNeeded) {
        updates[field] = newArray;
      }
    }
  }

  if (updateNeeded) {
    await collection.updateOne({ _id: doc._id }, { $set: updates });
    return logEntry;
  }

  return null;
}

// Main migration function
async function migrate() {
  console.log("\n🛠️  Image URL Migration Script");
  console.log("==============================\n");
  console.log(`Connecting to MongoDB: ${MONGODB_URI.replace(/\/\/.*:.*@/, "//****:****@")}`);

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected successfully\n");

    const totalStats = { scanned: 0, updated: 0, changes: 0 };
    const allChanges = [];

    for (const collectionConfig of COLLECTIONS) {
      const collectionName = collectionConfig.name;
      const fields = collectionConfig.fields;

      console.log(`\n📦 Processing collection: ${collectionName}`);
      console.log(`   Fields to check: ${fields.join(", ")}`);

      const collection = mongoose.connection.collection(collectionName);

      // Find all documents
      const docs = await collection.find({}).toArray();
      console.log(`   Found ${docs.length} documents`);

      let collectionUpdated = 0;

      for (const doc of docs) {
        totalStats.scanned++;

        const result = await processDocument(collection, doc, fields);

        if (result) {
          collectionUpdated++;
          totalStats.updated++;
          totalStats.changes += result.changes.length;
          allChanges.push({ collection: collectionName, ...result });

          // Log first few changes for review
          if (allChanges.length <= 10) {
            console.log(`   - ${collectionName} ${doc._id}:`);
            for (const change of result.changes) {
              console.log(`     ${change.field}: ${change.from?.substring(0, 50)}... -> ${change.to}`);
            }
          }
        }
      }

      console.log(`   ✅ Updated ${collectionUpdated} documents in ${collectionName}`);
    }

    // Summary
    console.log("\n\n📊 Migration Summary");
    console.log("====================");
    console.log(`Total documents scanned: ${totalStats.scanned}`);
    console.log(`Documents updated: ${totalStats.updated}`);
    console.log(`Total field changes: ${totalStats.changes}`);

    if (totalStats.updated > 10) {
      console.log(`\n... and ${totalStats.updated - 10} more documents (not shown)`);
    }

    if (totalStats.updated === 0) {
      console.log("\n✅ No changes needed - all image URLs are already correct!");
    } else {
      console.log("\n⚠️  Please verify the changes and restart your application.");
    }

    console.log("\n🛑 Migration complete. Disconnecting from MongoDB...");

  } catch (error) {
    console.error("\n❌ Migration failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("✅ Disconnected.\n");
    process.exit(0);
  }
}

// Run migration
migrate();