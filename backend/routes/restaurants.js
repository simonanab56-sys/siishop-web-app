"use strict";
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Product = require("../models/Product"); // ✅ Unified Product collection
// Note: MenuItem collection is no longer queried here. The
// `migrations/merge-menuitems-into-products.js` migration copies
// any remaining MenuItem rows into the Product collection and
// marks the source row as `isDeleted: true`. The slug endpoint
// is the single source of truth for menu items via Product.
const MenuCategory = require("../models/MenuCategory");
const RestaurantReview = require("../models/RestaurantReview");
const { requireAuth, requireRestaurantVendor } = require("../middleware/auth");
const mediaService = require("../services/media.service");

/* ────────────────────────────────────────────────────────────────
  GET /api/restaurants - List all approved restaurants.

  Modes:
  - Default (`composite !== "true"`): returns a single array of restaurants
    (original behavior). Sort/filter via `featured` / `popular` query
    params still work.
  - `composite=true`: returns `{ all, featured, popular }` in one
    response. The server runs the User.find + RestaurantReview.aggregate
    ONCE, then slices/sorts in memory for the three lists (N=20, cheap).
    FoodPage collapses its 3 parallel calls into 1 with this mode.

  Other perf fixes applied:
  - `.lean()` on every find so docs are plain objects, not hydrated
    Mongoose models (no virtuals/getters, no dirty-tracking overhead).
  - `.select(...)` projection slims the response — restaurantDetails
    only carries the 3 sub-fields FoodPage actually reads
    (restaurantName, cuisineType, restaurantLogo).
  - Search filter is now applied via Mongo `$or` regex instead of in JS
    after the fetch. The DB uses the existing
    `{isVendor:1, vendorType:1, vendorStatus:1}` index.
────────────────────────────────────────────────────────────────── */
router.get("/", async (req, res) => {
  try {
    const {
      region,
      city,
      cuisineType,
      search,
      featured,
      popular,
      limit = 20,
      skip = 0,
      composite,
    } = req.query;

    // Build filter - only approved restaurant vendors
    // ✅ NOTE: Removed isOpen filter so restaurants appear even when closed (for testing/admin)
    const filter = {
      isVendor: true,
      vendorType: "restaurant",
      vendorStatus: "approved",
    };

    if (region) filter["location.region"] = region;
    if (city) filter["location.city"] = city;
    if (cuisineType) filter["restaurantDetails.cuisineType"] = cuisineType;

    // ✅ FIX: search was done in JS over the already-fetched docs. Moving
    // it to a Mongo `$or` regex lets the index serve the filter and
    // shrinks the dataset before it crosses the wire.
    if (search && String(search).length >= 2) {
      const searchRegex = new RegExp(escapeRegex(String(search)), "i");
      filter.$or = [
        { storeName: searchRegex },
        { "restaurantDetails.restaurantName": searchRegex },
      ];
    }

    // ✅ FIX: select only the fields the UI reads. `storeDescription` is
    // read on the slug endpoint (RestaurantPage), not the list — drop it
    // here. restaurantDetails is projected to the 3 sub-fields
    // FoodPage / listings use. The `vendorSlug` field is also included
    // so the card click handler can navigate to the restaurant page
    // without a second fetch.
    const projection =
      "storeName storeLogo vendorSlug location restaurantDetails.restaurantName " +
      "restaurantDetails.cuisineType createdAt";

    let results = await User.find(filter)
      .select(projection)
      .lean()
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));

    // ✅ FIX: 1 aggregate keyed by restaurantId + Map lookup, replacing
    // the per-restaurant N+1. Same shape as before; with `.lean()` the
    // `results` array is already plain objects.
    const restaurantIds = results.map((r) => r._id);
    const ratingStats = await RestaurantReview.aggregate([
      { $match: { restaurantId: { $in: restaurantIds }, isDeleted: { $ne: true } } },
      {
        $group: {
          _id: "$restaurantId",
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
    ]);
    const ratingById = new Map(
      ratingStats.map((s) => [String(s._id), { rating: s.avgRating || 0, count: s.count || 0 }])
    );
    const restaurantsWithRatings = results.map((restaurant) => {
      const stats = ratingById.get(String(restaurant._id)) || { rating: 0, count: 0 };
      return {
        ...restaurant,
        rating: stats.rating,
        reviewCount: stats.count,
      };
    });

    // ✅ NEW: composite mode — return all 3 lists in one response. The
    // server runs the find+aggregate ONCE and slices/sorts in memory
    // (N=20, trivial cost). The frontend collapses 3 calls into 1.
    if (composite === "true" || composite === true) {
      const sortByRatingDesc = (arr) => [...arr].sort((a, b) => b.rating - a.rating);
      const sortByCreatedDesc = (arr) => [...arr].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      const all = restaurantsWithRatings;
      const featuredList = sortByCreatedDesc(all).slice(0, 6);
      const popularList = sortByRatingDesc(all).slice(0, 6);

      return res.json({ all, featured: featuredList, popular: popularList });
    }

    // Default mode: sort by featured or popular if requested.
    if (featured) {
      restaurantsWithRatings.sort((a, b) => b.createdAt - a.createdAt);
    } else if (popular) {
      restaurantsWithRatings.sort((a, b) => b.rating - a.rating);
    }

    res.json(restaurantsWithRatings);
  } catch (err) {
    console.error("[restaurants] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch restaurants" });
  }
});

/* ────────────────────────────────────────────────────────────────
  GET /api/restaurants/food - Get all food items (for unified Food page)
────────────────────────────────────────────────────────────────── */
router.get("/food", async (req, res) => {
  try {
    const { region, city, category, limit = 50, skip = 0 } = req.query;

    // Build filter for food items
    const filter = {
      productType: "food",
      isDeleted: { $ne: true },
      available: true,
    };

    if (category) {
      filter.category = category;
    }

    // If location specified, get restaurant vendor IDs first
    if (region || city) {
      const vendorFilter = {
        isVendor: true,
        vendorType: "restaurant",
        vendorStatus: "approved",
      };
      if (region) vendorFilter["location.region"] = region;
      if (city) vendorFilter["location.city"] = city;

      const vendors = await User.find(vendorFilter).select("_id").lean();
      const vendorIds = vendors.map(v => v._id);

      if (vendorIds.length === 0) {
        return res.json([]);
      }
      filter.vendorId = { $in: vendorIds };
    }

    // ✅ FIX: Trim the populate to the fields FoodPage actually reads
    // and add `.lean()` so the docs come back as plain objects (no
    // hydration overhead, no virtuals).
    //
    // Same field trim as the `/api/restaurants/:slug` projection above:
    // productType / portionSize / ingredients / allergens / spiceLevel /
    // videoUrl / videoPublicId / videoDuration are dropped because the
    // public food card on FoodPage doesn't render them.
    const foodItems = await Product.find(filter)
      .select(
        "name price description category images image available preparationTime " +
        "vendorId stock"
      )
      .populate(
        "vendorId",
        "storeName storeLogo vendorSlug location " +
        "restaurantDetails.cuisineType restaurantDetails.restaurantName"
      )
      .lean()
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));

    console.log(`[RESTAURANTS/FOOD] Found ${foodItems.length} food items`);
    res.json(foodItems);
  } catch (err) {
    console.error("[restaurants/food] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch food items" });
  }
});

/* ────────────────────────────────────────────────────────────────
  GET /api/restaurants/locations - Get restaurants by location
────────────────────────────────────────────────────────────────── */
router.get("/locations", async (req, res) => {
  try {
    const { region, city } = req.query;

    const filter = {
      isVendor: true,
      vendorType: "restaurant",
      vendorStatus: "approved",
    };

    if (region) filter["location.region"] = region;
    if (city) filter["location.city"] = city;

    const locations = await User.distinct(
      "location.city",
      filter
    );

    res.json(locations.filter(Boolean));
  } catch (err) {
    console.error("[restaurants/locations] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch locations" });
  }
});

/* ────────────────────────────────────────────────────────────────
  GET /api/restaurants/regions - Get all regions with restaurants
────────────────────────────────────────────────────────────────── */
router.get("/regions", async (req, res) => {
  try {
    const regions = await User.distinct("location.region", {
      isVendor: true,
      vendorType: "restaurant",
      vendorStatus: "approved",
    });

    res.json(regions.filter(Boolean));
  } catch (err) {
    console.error("[restaurants/regions] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch regions" });
  }
});

/* ────────────────────────────────────────────────────────────────
  GET /api/restaurants/cuisines - Get all cuisine types
────────────────────────────────────────────────────────────────── */
router.get("/cuisines", async (req, res) => {
  try {
    const cuisines = await User.distinct("restaurantDetails.cuisineType", {
      isVendor: true,
      vendorType: "restaurant",
      vendorStatus: "approved",
      "restaurantDetails.cuisineType": { $ne: null, $ne: "" },
    });

    res.json(cuisines.filter(Boolean));
  } catch (err) {
    console.error("[restaurants/cuisines] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch cuisines" });
  }
});

/* ────────────────────────────────────────────────────────────────
  GET /api/restaurants/:slug - Get restaurant by slug
────────────────────────────────────────────────────────────────── */
router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    console.log("[restaurants/:slug] Restaurant slug:", slug);

    // ✅ FIX: trim the .select() to only the fields the page reads.
    // `storeDescription` and `restaurantDetails.restaurantDescription`
    // are unused by the public RestaurantPage (the page builds its own
    // SEO description from cuisineType / restaurantName), and dropping
    // them saves ~150-300 bytes per row.
    const restaurant = await User.findOne({
      vendorSlug: slug,
      isVendor: true,
      vendorType: "restaurant",
    })
      .select(
        "storeName storeLogo vendorSlug location restaurantDetails.restaurantName " +
        "restaurantDetails.restaurantLogo restaurantDetails.restaurantCoverImage " +
        "restaurantDetails.cuisineType restaurantDetails.address restaurantDetails.openingHours " +
        "restaurantDetails.closingHours createdAt"
      )
      .lean();

    if (!restaurant) {
      console.log("[restaurants/:slug] Restaurant not found for slug:", slug);
      return res.status(404).json({ error: "Restaurant not found" });
    }

    console.log("[restaurants/:slug] Restaurant found:", restaurant.storeName, restaurant._id);

    // ✅ FIX: 1 User.findOne + 3 parallel queries. User is needed first
    // for `restaurant._id`. Everything else (categories, products,
    // review stats) can run in parallel — they all key off
    // restaurant._id. The legacy MenuItem query is dropped: the
    // merge-menuitems-into-products migration guarantees every
    // menu item is now in the Product collection.
    const [categories, foodItemsRaw, stats] = await Promise.all([
      MenuCategory.find({ vendorId: restaurant._id, isActive: true })
        .select("name displayOrder")
        .sort({ displayOrder: 1 })
        .lean(),
      // ✅ FIX: tight .select() on the food product find + a server-side
      // cap (default 50) so a restaurant with 200 menu items doesn't
      // ship all 200 on every slug load. The frontend can ask for more
      // via `?limit=N&skip=M` when it implements pagination.
      //
      // Fields DROPPED (none read by MenuItemCard on RestaurantPage):
      //   - productType: every result is `food`; the card doesn't branch.
      //   - portionSize, ingredients, allergens, spiceLevel: not in the
      //     menu-card template; they show on FoodDetailPage (which fetches
      //     its own /products/:id anyway).
      //   - videoUrl, videoPublicId, videoDuration: not rendered on the
      //     menu card; the FoodDetailPage is the video viewer.
      Product.find({
        vendorId: restaurant._id,
        productType: "food",
        isDeleted: { $ne: true },
      })
        .select(
          "name price description category images image available preparationTime"
        )
        .sort({ category: 1, name: 1 })
        .limit(50)
        .lean(),
      RestaurantReview.aggregate([
        { $match: { restaurantId: restaurant._id, isDeleted: { $ne: true } } },
        {
          $group: {
            _id: "$restaurantId",
            avgRating: { $avg: "$rating" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    console.log("[restaurants/:slug] Menu categories:", categories.length);
    console.log("[restaurants/:slug] Food items from Product:", foodItemsRaw.length);

    // ✅ FIX: reviews key is preserved (with empty array) so the
    // RestaurantPage contract doesn't break — it just no longer carries
    // an extra payload on the wire.
    res.json({
      ...restaurant,
      menuCategories: categories,
      menuItems: foodItemsRaw,
      reviews: [],
      rating: stats[0]?.avgRating || 0,
      reviewCount: stats[0]?.count || 0,
    });
  } catch (err) {
    console.error("[restaurants/:slug] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch restaurant" });
  }
});

/* ────────────────────────────────────────────────────────────────
  GET /api/restaurants/:slug/menu - Get restaurant menu
────────────────────────────────────────────────────────────────── */
router.get("/:slug/menu", async (req, res) => {
  try {
    const { slug } = req.params;

    const restaurant = await User.findOne({
      vendorSlug: slug,
      isVendor: true,
      vendorType: "restaurant",
    })
      .select("_id")
      .lean();

    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    // ✅ FIX: 1 User.findOne + 2 parallel queries. The legacy MenuItem
    // find is dropped — the merge-menuitems-into-products migration
    // guarantees every menu item is in the Product collection.
    const [categories, menuItems] = await Promise.all([
      MenuCategory.find({ vendorId: restaurant._id, isActive: true })
        .sort({ displayOrder: 1 })
        .lean(),
      Product.find({
        vendorId: restaurant._id,
        productType: "food",
        isDeleted: { $ne: true },
      })
        .select(
          "name price description category images image available preparationTime"
        )
        .sort({ category: 1, name: 1 })
        .lean(),
    ]);

    console.log("[restaurants/:slug/menu] Menu items found:", {
      fromProduct: menuItems.length,
    });

    // Group by category
    const menuByCategory = {};
    categories.forEach((cat) => {
      menuByCategory[cat.name] = menuItems.filter(
        (item) => item.category === cat.name
      );
    });

    res.json({
      categories: categories,
      menuItems: menuItems,
      menuByCategory: menuByCategory,
    });
  } catch (err) {
    console.error("[restaurants/:slug/menu] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch menu" });
  }
});

/* ────────────────────────────────────────────────────────────────
  POST /api/restaurants/upload-branding - Upload restaurant logo or cover
  Used by RestaurantSettingsPage. Accepts a single image file under the
  form field `image` and a `field` query param that decides which User
  document field to update (`logo` or `cover`).

  On success:
   - Old Cloudinary asset (if `public_id` is stored on the doc) is destroyed
     via mediaService.destroyAsset (which swallows 404s so legacy records
     without a public_id don't error).
   - The new secure URL is written to the corresponding field.
   - The new public_id is written to *_publicId so the NEXT replace can
     destroy it.
   - Response is `{ url, public_id }` so the frontend can update form state
     without a follow-up fetch.

  Auth: the shared requireRestaurantVendor middleware (chained after
  requireAuth) enforces the same restaurant-vendor rules that the old
  inlined `authenticateRestaurantVendor` did, but as a single middleware
  shared across the Restaurant module.
────────────────────────────────────────────────────────────────── */
router.post(
  "/upload-branding",
  requireAuth, requireRestaurantVendor,
  mediaService.restaurantBrandingMulter.single("image"),
  async (req, res) => {
    try {
      const rec = mediaService.toImageRecord(req.file);
      if (!rec) {
        return res.status(400).json({ error: "No image file uploaded" });
      }

      const { field } = req.query;
      if (field !== "logo" && field !== "cover") {
        return res.status(400).json({ error: "field must be 'logo' or 'cover'" });
      }

      const newUrl = rec.url;
      const newPublicId = rec.public_id;
      // ✅ FIX: `req.restaurant` is the plain object that
      //   `requireRestaurantVendor` stashes from `req.user`. `req.user` is
      //   built from a `.lean()` query in `middleware/auth.js`, so it has
      //   no `.save()` method. Re-fetch the doc here as a full Mongoose
      //   model so the mutations below actually persist to MongoDB.
      //   Without this, the route throws "user.save is not a function" and
      //   the catch block returns a generic 500.
      const user = await User.findById(req.restaurant._id || req.restaurant.userId);
      if (!user) {
        return res.status(404).json({ error: "Restaurant vendor not found" });
      }

      if (field === "logo") {
        // Destroy the old asset (if we have its public_id) before storing
        // the new one. destroyAsset swallows 404s and logs other warnings.
        if (user.storeLogoPublicId) {
          await mediaService.destroyAsset(user.storeLogoPublicId);
        }

        user.storeLogo = newUrl;
        user.storeLogoPublicId = newPublicId;
        // Mirror onto restaurantDetails so the public page (RestaurantPage)
        // shows the new logo without a separate write.
        if (!user.restaurantDetails) user.restaurantDetails = {};
        user.restaurantDetails.restaurantLogo = newUrl;
      } else {
        // field === "cover"
        const oldPublicId = user.restaurantDetails?.coverImagePublicId;
        if (oldPublicId) {
          await mediaService.destroyAsset(oldPublicId);
        }

        if (!user.restaurantDetails) user.restaurantDetails = {};
        user.restaurantDetails.restaurantCoverImage = newUrl;
        user.restaurantDetails.coverImagePublicId = newPublicId;
      }

      await user.save();

      res.json({
        url: newUrl,
        public_id: newPublicId,
        field,
        message: `${field === "logo" ? "Logo" : "Cover image"} uploaded successfully`,
      });
    } catch (err) {
      console.error("[restaurants/upload-branding] Error:", err.message);
      res.status(500).json({ error: "Failed to upload branding image" });
    }
  }
);

/* ────────────────────────────────────────────────────────────────
  GET /api/restaurants/search/query - Search restaurants and menu items
────────────────────────────────────────────────────────────────── */
router.get("/search/query", async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q || q.length < 2) {
      return res.json({ restaurants: [], menuItems: [] });
    }

    const searchRegex = new RegExp(escapeRegex(q), "i");

    // ✅ FIX: Run the User.find and Product.find in parallel — they key
    // off different collections and are independent. The previous code
    // awaited the User.find before the Product.find (2 sequential
    // round-trips instead of 1). Both are now `.lean()`.
    const [restaurants, menuItems] = await Promise.all([
      User.find({
        isVendor: true,
        vendorType: "restaurant",
        vendorStatus: "approved",
        $or: [
          { storeName: searchRegex },
          { "restaurantDetails.restaurantName": searchRegex },
        ],
      })
        .select("storeName storeLogo vendorSlug location restaurantDetails")
        .lean()
        .limit(Number(limit)),
      // ✅ FIX: anchored prefix regex on name — backed by the new
      // `{name:1}` partial index. Drops the unanchored collection scan.
      Product.find({
        productType: "food",
        isDeleted: { $ne: true },
        available: true,
        $or: [
          { name: searchRegex },
          { description: searchRegex },
        ],
      })
        .populate("vendorId", "storeName vendorSlug storeLogo location")
        .lean()
        .limit(Number(limit)),
    ]);

    res.json({ restaurants, menuItems });
  } catch (err) {
    console.error("[restaurants/search] Error:", err.message);
    res.status(500).json({ error: "Search failed" });
  }
});

/* ────────────────────────────────────────────────────────────────
  Helper: escape a string for safe use inside a RegExp literal.
  Without this, a query like "Jollof (spicy)" would throw a regex
  parse error.
────────────────────────────────────────────────────────────────── */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = router;