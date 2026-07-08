"use strict";
const express = require("express");
const router = express.Router();
const MenuItem = require("../models/MenuItem");
const MenuCategory = require("../models/MenuCategory");
const Product = require("../models/Product");
const { requireAuth, requireRestaurantVendor } = require("../middleware/auth");
const mediaService = require("../services/media.service");

/* ────────────────────────────────────────────────────────────────
  GET /api/menu/categories - Get menu categories for restaurant
────────────────────────────────────────────────────────────────── */
router.get("/categories", requireAuth, requireRestaurantVendor, async (req, res) => {
  try {
    const categories = await MenuCategory.find({
      vendorId: req.restaurant._id,
    }).sort({ displayOrder: 1 });

    res.json(categories);
  } catch (err) {
    console.error("[menu/categories] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

/* ────────────────────────────────────────────────────────────────
  POST /api/menu/categories - Create menu category
────────────────────────────────────────────────────────────────── */
router.post("/categories", requireAuth, requireRestaurantVendor, async (req, res) => {
  try {
    const { name, displayOrder } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Category name is required" });
    }

    // Check if category already exists
    const existing = await MenuCategory.findOne({
      vendorId: req.restaurant._id,
      name: name,
    });

    if (existing) {
      return res.status(400).json({ error: "Category already exists" });
    }

    const category = await MenuCategory.create({
      vendorId: req.restaurant._id,
      name: name,
      displayOrder: displayOrder || 0,
    });

    res.status(201).json(category);
  } catch (err) {
    console.error("[menu/categories] Error:", err.message);
    res.status(500).json({ error: "Failed to create category" });
  }
});

/* ────────────────────────────────────────────────────────────────
  PATCH /api/menu/categories/:id - Update category
────────────────────────────────────────────────────────────────── */
router.patch("/categories/:id", requireAuth, requireRestaurantVendor, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, displayOrder, isActive } = req.body;

    const category = await MenuCategory.findOne({
      _id: id,
      vendorId: req.restaurant._id,
    });

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    if (name) category.name = name;
    if (displayOrder !== undefined) category.displayOrder = displayOrder;
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();
    res.json(category);
  } catch (err) {
    console.error("[menu/categories/:id] Error:", err.message);
    res.status(500).json({ error: "Failed to update category" });
  }
});

/* ────────────────────────────────────────────────────────────────
  DELETE /api/menu/categories/:id - Delete category
────────────────────────────────────────────────────────────────── */
router.delete("/categories/:id", requireAuth, requireRestaurantVendor, async (req, res) => {
  try {
    const { id } = req.params;

    const category = await MenuCategory.findOne({
      _id: id,
      vendorId: req.restaurant._id,
    });

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Delete all menu items in this category
    await MenuItem.deleteMany({
      vendorId: req.restaurant._id,
      category: category.name,
    });

    await category.deleteOne();
    res.json({ message: "Category deleted" });
  } catch (err) {
    console.error("[menu/categories/:id] Error:", err.message);
    res.status(500).json({ error: "Failed to delete category" });
  }
});

/* ────────────────────────────────────────────────────────────────
  GET /api/menu/items - Get all menu items for restaurant
  ✅ FIX: Now queries BOTH MenuItem and Product collections
────────────────────────────────────────────────────────────────── */
router.get("/items", requireAuth, requireRestaurantVendor, async (req, res) => {
  try {
    const { category } = req.query;

    console.log("[menu/items] Fetching for vendor:", req.restaurant._id);

    // Build both filters up front so we can run the two collection queries
    // in parallel. ✅ FIX: previously MenuItem.find then Product.find ran
    // sequentially — 2 round-trips. Now 1 parallel round-trip.
    const menuItemFilter = {
      vendorId: req.restaurant._id,
      isDeleted: false,
    };
    if (category) menuItemFilter.category = category;

    const productFilter = {
      vendorId: req.restaurant._id,
      productType: "food",
      isDeleted: { $ne: true },
    };
    if (category) productFilter.category = category;

    const [menuItems, productItems] = await Promise.all([
      MenuItem.find(menuItemFilter).sort({ category: 1, name: 1 }),
      Product.find(productFilter).sort({ category: 1, name: 1 }),
    ]);

    console.log("[menu/items] From MenuItem:", menuItems.length);
    console.log("[menu/items] From Product:", productItems.length);

    // Merge both, avoiding duplicates by name.
    const existingNames = new Set(menuItems.map((i) => i.name.toLowerCase()));
    productItems.forEach((item) => {
      if (!existingNames.has(item.name.toLowerCase())) {
        menuItems.push({
          _id: item._id,
          name: item.name,
          description: item.description,
          price: item.price,
          category: item.category,
          image: item.image,
          images: item.images || [],
          available: item.available !== false,
          preparationTime: item.preparationTime || 15,
          // Mark as coming from Product
          source: "product",
        });
      }
    });

    console.log("[menu/items] Total merged:", menuItems.length);

    res.json(menuItems);
  } catch (err) {
    console.error("[menu/items] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch menu items" });
  }
});

/* ────────────────────────────────────────────────────────────────
  GET /api/menu/items/:id - Get single menu item
────────────────────────────────────────────────────────────────── */
router.get("/items/:id", requireAuth, requireRestaurantVendor, async (req, res) => {
  try {
    const { id } = req.params;

    const item = await MenuItem.findOne({
      _id: id,
      vendorId: req.restaurant._id,
      isDeleted: false,
    });

    if (!item) {
      return res.status(404).json({ error: "Menu item not found" });
    }

    res.json(item);
  } catch (err) {
    console.error("[menu/items/:id] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch menu item" });
  }
});

/* ────────────────────────────────────────────────────────────────
  POST /api/menu/items - Create menu item
  ✅ FIX: Also sync to Product collection for public restaurant page
────────────────────────────────────────────────────────────────── */
router.post("/items", requireAuth, requireRestaurantVendor, async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      category,
      image,
      images,
      video,
      preparationTime,
      available,
      portionSize,
      ingredients,
      allergens,
      spiceLevel,
    } = req.body;

    if (!name || !price || !category) {
      return res.status(400).json({
        error: "Name, price, and category are required",
      });
    }

    // Normalize images array - ensure it's an array of objects with url/public_id
    let normalizedImages = [];
    if (Array.isArray(images)) {
      normalizedImages = images.filter(img => img && img.url);
    }

    console.log("[menu/items] Creating menu item:", name, "category:", category);

    // 1. Create in MenuItem collection (for restaurant dashboard)
    const item = await MenuItem.create({
      vendorId: req.restaurant._id,
      name,
      description: description || "",
      price,
      category,
      image: image || normalizedImages[0]?.url || "",
      images: normalizedImages,
      video: video || "",
      preparationTime: preparationTime || 15,
      available: available !== false,
      portionSize: portionSize || "",
      ingredients: ingredients || "",
      allergens: allergens || "",
      spiceLevel: spiceLevel || "normal",
    });

    // 2. ALSO create in Product collection (for public restaurant page)
    // This ensures menu items appear on the public restaurant page
    try {
      const product = await Product.create({
        name,
        description: description || "",
        price,
        category,
        vendorId: req.restaurant._id,
        stock: 999, // Food items don't track stock like marketplace products
        available: available !== false,
        images: normalizedImages,
        image: normalizedImages[0]?.url || "",
        productType: "food", // ✅ CRITICAL: This makes it appear on restaurant page
        preparationTime: preparationTime || 15,
        // Food-specific fields
        portionSize: portionSize || "",
        ingredients: ingredients || "",
        allergens: allergens || "",
        spiceLevel: spiceLevel || "normal",
      });
      console.log("[menu/items] ✅ Synced to Product collection:", product._id);
    } catch (productErr) {
      console.error("[menu/items] ⚠️ Failed to sync to Product:", productErr.message);
      // Don't fail the whole request - menu item was created successfully
    }

    res.status(201).json(item);
  } catch (err) {
    console.error("[menu/items] Error:", err.message);
    res.status(500).json({ error: "Failed to create menu item" });
  }
});

/* ────────────────────────────────────────────────────────────────
  PATCH /api/menu/items/:id - Update menu item
  ✅ FIX: Also sync to Product collection
────────────────────────────────────────────────────────────────── */
router.patch("/items/:id", requireAuth, requireRestaurantVendor, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const item = await MenuItem.findOne({
      _id: id,
      vendorId: req.restaurant._id,
    });

    if (!item) {
      return res.status(404).json({ error: "Menu item not found" });
    }

    // Update allowed fields
    const allowedFields = [
      "name",
      "description",
      "price",
      "category",
      "image",
      "images",
      "video",
      "preparationTime",
      "available",
      "portionSize",
      "ingredients",
      "allergens",
      "spiceLevel",
    ];

    let normalizedImages = [];
    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        // Handle images array specially
        if (field === "images" && Array.isArray(updateData[field])) {
          normalizedImages = updateData[field].filter(img => img && img.url);
          item[field] = normalizedImages;
          // Also update the single image field with first image
          if (normalizedImages.length > 0) {
            item.image = normalizedImages[0].url;
          }
        } else {
          item[field] = updateData[field];
        }
      }
    });

    await item.save();

    // 2. ALSO update in Product collection (for public restaurant page)
    try {
      const productUpdate = {};
      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          if (field === "images") {
            productUpdate[field] = normalizedImages;
            productUpdate.image = normalizedImages[0]?.url || "";
          } else if (field !== "image") { // Don't duplicate image field
            productUpdate[field] = updateData[field];
          }
        }
      });

      // Also map some field names
      if (updateData.name) productUpdate.name = updateData.name;
      if (updateData.description) productUpdate.description = updateData.description;
      if (updateData.price) productUpdate.price = updateData.price;
      if (updateData.category) productUpdate.category = updateData.category;
      if (updateData.available !== undefined) productUpdate.available = updateData.available;
      if (updateData.preparationTime) productUpdate.preparationTime = updateData.preparationTime;
      if (updateData.portionSize) productUpdate.portionSize = updateData.portionSize;
      if (updateData.ingredients) productUpdate.ingredients = updateData.ingredients;
      if (updateData.allergens) productUpdate.allergens = updateData.allergens;
      if (updateData.spiceLevel) productUpdate.spiceLevel = updateData.spiceLevel;

      await Product.findOneAndUpdate(
        { vendorId: req.restaurant._id, name: item.name, productType: "food" },
        productUpdate,
        { new: true }
      );
      console.log("[menu/items/:id] ✅ Synced update to Product collection");
    } catch (productErr) {
      console.error("[menu/items/:id] ⚠️ Failed to sync to Product:", productErr.message);
    }

    res.json(item);
  } catch (err) {
    console.error("[menu/items/:id] Error:", err.message);
    res.status(500).json({ error: "Failed to update menu item" });
  }
});

/* ────────────────────────────────────────────────────────────────
  DELETE /api/menu/items/:id - Soft delete menu item
  ✅ FIX: Also sync to Product collection
────────────────────────────────────────────────────────────────── */
router.delete("/items/:id", requireAuth, requireRestaurantVendor, async (req, res) => {
  try {
    const { id } = req.params;

    const item = await MenuItem.findOne({
      _id: id,
      vendorId: req.restaurant._id,
    });

    if (!item) {
      return res.status(404).json({ error: "Menu item not found" });
    }

    const itemName = item.name; // Save name for Product lookup
    item.isDeleted = true;
    await item.save();

    // 2. ALSO soft-delete in Product collection (for public restaurant page)
    try {
      await Product.findOneAndUpdate(
        { vendorId: req.restaurant._id, name: itemName, productType: "food" },
        { isDeleted: true },
        { new: true }
      );
      console.log("[menu/items/:id] ✅ Synced delete to Product collection");
    } catch (productErr) {
      console.error("[menu/items/:id] ⚠️ Failed to sync to Product:", productErr.message);
    }

    res.json({ message: "Menu item deleted" });
  } catch (err) {
    console.error("[menu/items/:id] Error:", err.message);
    res.status(500).json({ error: "Failed to delete menu item" });
  }
});

/* ────────────────────────────────────────────────────────────────
  PATCH /api/menu/items/:id/availability - Toggle availability
  ✅ FIX: Also sync to Product collection
────────────────────────────────────────────────────────────────── */
router.patch(
  "/items/:id/availability",
  requireAuth, requireRestaurantVendor,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { available } = req.body;

      const item = await MenuItem.findOne({
        _id: id,
        vendorId: req.restaurant._id,
      });

      if (!item) {
        return res.status(404).json({ error: "Menu item not found" });
      }

      const itemName = item.name;
      item.available = available !== false;
      await item.save();

      // ALSO update in Product collection
      try {
        await Product.findOneAndUpdate(
          { vendorId: req.restaurant._id, name: itemName, productType: "food" },
          { available: item.available },
          { new: true }
        );
        console.log("[menu/items/:id/availability] ✅ Synced to Product collection");
      } catch (productErr) {
        console.error("[menu/items/:id/availability] ⚠️ Failed to sync:", productErr.message);
      }

      res.json(item);
    } catch (err) {
      console.error("[menu/items/:id/availability] Error:", err.message);
      res.status(500).json({ error: "Failed to update availability" });
    }
  }
);

/* ────────────────────────────────────────────────────────────────
  POST /api/menu/items/bulk - Bulk create menu items
────────────────────────────────────────────────────────────────── */
router.post("/items/bulk", requireAuth, requireRestaurantVendor, async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Items array is required" });
    }

    const menuItems = items.map((item) => ({
      vendorId: req.restaurant._id,
      name: item.name,
      description: item.description || "",
      price: item.price,
      category: item.category,
      image: item.image || "",
      preparationTime: item.preparationTime || 15,
      available: item.available !== false,
    }));

    const created = await MenuItem.insertMany(menuItems);
    res.status(201).json(created);
  } catch (err) {
    console.error("[menu/items/bulk] Error:", err.message);
    res.status(500).json({ error: "Failed to create menu items" });
  }
});

/* ────────────────────────────────────────────────────────────────
  POST /api/menu/upload - Upload multiple menu item images
  The shared mediaService handles Cloudinary-or-local-disk transparently and
  produces the canonical `{ url, public_id }` shape. The `message` field is
  preserved for the existing frontend `MenuItemsPage` / `MultiImageUpload`
  consumer. Legacy /uploads/menu/ URLs already in the DB continue to
  render — getImageUrl treats them as local /uploads/ paths.
────────────────────────────────────────────────────────────────── */

// Single image upload
router.post(
  "/upload-single",
  requireAuth, requireRestaurantVendor,
  mediaService.restaurantMenuMulter.single("image"),
  async (req, res) => {
    try {
      const rec = mediaService.toImageRecord(req.file);
      if (!rec) {
        return res.status(400).json({ error: "No image file uploaded" });
      }
      res.json({ ...rec, message: "Image uploaded successfully" });
    } catch (err) {
      console.error("[menu/upload-single] Error:", err.message);
      res.status(500).json({ error: "Failed to upload image" });
    }
  }
);

// Multiple images upload
router.post(
  "/upload",
  requireAuth, requireRestaurantVendor,
  mediaService.restaurantMenuMulter.array("images", 10),
  async (req, res) => {
    try {
      const images = mediaService.toImageRecords(req.files);
      if (images.length === 0) {
        return res.status(400).json({ error: "No image files uploaded" });
      }
      res.json({
        images,
        message: `${images.length} images uploaded successfully`,
      });
    } catch (err) {
      console.error("[menu/upload] Error:", err.message);
      res.status(500).json({ error: "Failed to upload images" });
    }
  }
);

// Single video upload (Cloudinary resource_type=video). The frontend stores
// the returned { url, public_id, duration } on the menu item record so
// FoodDetailPage can render a <video> element.
router.post(
  "/upload-video",
  requireAuth, requireRestaurantVendor,
  mediaService.restaurantVideoMulter.single("video"),
  async (req, res) => {
    try {
      const rec = mediaService.toVideoRecord(req.file);
      if (!rec) {
        return res.status(400).json({ error: "No video file uploaded" });
      }
      res.json({ ...rec, message: "Video uploaded successfully" });
    } catch (err) {
      console.error("[menu/upload-video] Error:", err.message);
      res.status(500).json({ error: "Failed to upload video" });
    }
  }
);

module.exports = router;