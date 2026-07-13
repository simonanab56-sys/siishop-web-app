"use strict";

const jwt = require("jsonwebtoken");
const User = require("../models/User");

function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);

  if (req.cookies?.token) return req.cookies.token;

  return null;
}

async function requireAuth(req, res, next) {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Server misconfigured" });
    }

    const token = extractToken(req);
    console.log("[AUTH] Token extracted:", token ? `present (${token.substring(0, 30)}...)` : "MISSING");
    console.log("[AUTH] Authorization header:", req.headers.authorization?.substring(0, 50));

    if (!token) {
      console.log("[AUTH] ❌ No token found");
      return res.status(401).json({ message: "Auth required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log("[AUTH] ✅ Token verified successfully, userId:", decoded.userId);
    } catch (err) {
      console.log("[AUTH] ❌ Token verification failed:", err.message);
      console.log("[AUTH] Token payload (if readable):", token.split('.')[1]);
      return res.status(401).json({ message: "Invalid token" });
    }

    const user = await User.findById(decoded.userId).lean();
    console.log("[AUTH] User found:", user ? user.name : "NOT FOUND");
    if (!user) return res.status(401).json({ message: "User not found" });

    // Distinguish Mongoose default-hydrated restaurantDetails from a
    // user-populated subdoc. Marketplace vendors registered before
    // vendorType was added may have a `restaurantDetails` subdoc with
    // only default keys; we must NOT treat that as proof of being a
    // restaurant vendor. See backend/utils/vendorType.js.
    const {
      isRestaurantVendor,
      classifyVendorType,
    } = require("../utils/vendorType");
    const details = user.restaurantDetails || {};
    const effectiveIsRestaurantVendor = isRestaurantVendor(
      user.vendorType,
      details
    );

    // NOTE: Setting BOTH id AND userId for compatibility with different middleware versions
    req.user = {
      id: String(user._id),      // For menu/food-orders middleware compatibility
      _id: String(user._id),     // Alternative reference
      userId: String(user._id),  // For JWT payload reference
      isAdmin: !!user.isAdmin,
      isVendor: !!user.isVendor,
      vendorStatus: user.vendorStatus || "pending",
      vendorType: classifyVendorType(user.vendorType, details),
      restaurantDetails: effectiveIsRestaurantVendor ? details : null,
    };

    console.log("[AUTH] req.user populated:", {
      userId: req.user.userId,
      vendorType: req.user.vendorType,
      hasRestaurantDetails: !!req.user.restaurantDetails
    });

    next();
  } catch (err) {
    console.error(err);
    res.status(401).json({ message: "Auth failed" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
}

function requireVendor(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Auth required" });

  if (req.user.isAdmin) return next();

  if (!req.user.isVendor) {
    return res.status(403).json({ message: "Vendor only" });
  }

  if (req.user.vendorStatus !== "approved") {
    return res.status(403).json({ message: "Vendor not approved" });
  }

  next();
}

/**
 * Sibling of requireVendor for restaurant vendors specifically. Must run
 * AFTER requireAuth (uses `req.user` populated by it).
 *
 * Accepts the user as a restaurant vendor when:
 *  - `req.user.isAdmin` is true (admins can act as any vendor), OR
 *  - `req.user.isVendor` is true AND
 *      - the user is restaurant-vendor typed via `vendorType === "restaurant"`,
 *        OR
 *      - the user has a non-empty `restaurantDetails` sub-document
 *        (legacy vendors created before the `vendorType` field existed).
 *
 * If the user is an approved restaurant vendor we also stash
 * `req.restaurant = req.user` so existing route handlers can keep using
 * `req.restaurant._id` the same way they did when the auth middleware was
 * inlined in each route file.
 */
function requireRestaurantVendor(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Auth required" });

  if (req.user.isAdmin) {
    req.restaurant = req.user;
    return next();
  }

  if (!req.user.isVendor) {
    return res.status(403).json({ message: "Restaurant vendor only" });
  }

  if (req.user.vendorStatus && req.user.vendorStatus !== "approved") {
    return res.status(403).json({ message: "Restaurant not approved yet" });
  }

  const details = req.user.restaurantDetails;
  // Same guard the frontend uses. See backend/utils/vendorType.js.
  // A user is a restaurant vendor only when `vendorType === "restaurant"`,
  // or (legacy) when `vendorType` is unset AND the restaurantDetails
  // subdoc has user-populated fields (not just Mongoose default keys).
  const { isRestaurantVendor } = require("../utils/vendorType");
  const isRestaurantVendorLocal = isRestaurantVendor(
    req.user.vendorType,
    details
  );

  if (!isRestaurantVendorLocal) {
    return res.status(403).json({ message: "Restaurant vendor access required" });
  }

  req.restaurant = req.user;
  next();
}

module.exports = { requireAuth, requireAdmin, requireVendor, requireRestaurantVendor };