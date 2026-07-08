
const router = require("express").Router();
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { OAuth2Client } = require("google-auth-library"); // ✅ ADDED: For secure Google token verification

// ✅ FIX: Widen google-auth-library's clock-skew tolerance so a host with even
//   a few minutes of forward clock drift (e.g. mis-set TZ / NTP on the Render
//   dyno) no longer rejects otherwise-valid Google ID tokens with
//   "Token used too late". The library hard-codes `now = Date.now()/1000` and
//   compares it to `exp + OAuth2Client.CLOCK_SKEW_SECS_` (default 300s).
//   The actual production drift observed is ~2h (server_time - exp ≈ 7180s).
//   3 hours of tolerance fully absorbs a 2h drift and gives a safety margin,
//   while still rejecting tokens that are multiple hours past their Google
//   1h lifetime — Google itself never issues a token with such skew.
OAuth2Client.CLOCK_SKEW_SECS_ = 3 * 60 * 60; // 10800 seconds = 3 hours
// Runtime-visible log so the deploy can be confirmed to have taken effect.
console.log(
  "[auth] OAuth2Client.CLOCK_SKEW_SECS_ =",
  OAuth2Client.CLOCK_SKEW_SECS_,
  "seconds"
);
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const { sendPasswordResetEmail } = require("../services/email.service");
const { validate, registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema, updateProfileSchema } = require("../utils/joiSchemas");
const { vendorKYCUpload } = require("../config/multer");
const logger = require("../utils/logger");

// ── LOCATION CONFIG ─────────────────────────────────────────────────────────────
// Load Ghana locations configuration safely
let ghanaLocations = null;
try {
  ghanaLocations = require("../config/ghanaLocations");
} catch (err) {
  console.error("[AUTH] Failed to load ghanaLocations:", err.message);
}

/**
 * Helper: Sign a JWT token
 */
function sign(user) {
  return jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

/**
 * Helper: Return a clean user object (no password)
 */
function cleanUser(user) {
  // Force vendorType to "restaurant" if restaurantDetails exists (backwards compatibility)
  const hasRestaurantDetails = user.restaurantDetails && Object.keys(user.restaurantDetails).length > 0;
  const forceRestaurant = hasRestaurantDetails ? "restaurant" : null;

  return {
    _id: String(user._id),
    name: user.name,
    email: user.email,
    isAdmin: !!user.isAdmin,
    isVendor: !!user.isVendor,
    vendorStatus: user.vendorStatus || "pending",
    /* ✅ NEW: Vendor Type for dual marketplace */
    vendorType: user.vendorType || forceRestaurant || "marketplace",
    storeName: user.storeName,
    storeDescription: user.storeDescription,
    storeLogo: user.storeLogo,
    /* ── Location Fields (if vendor) ── */
    ...(user.isVendor && {
      location: user.location || { country: "Ghana", region: "", city: "" },
    }),
    /* ✅ NEW: Restaurant Details (if restaurant vendor) ── */
    ...((user.isVendor && user.vendorType === "restaurant") || hasRestaurantDetails ? {
      restaurantDetails: user.restaurantDetails || {},
    } : {}),
    /* ── KYC Fields (if vendor) ── */
    ...(user.isVendor && {
      phoneNumber: user.phoneNumber,
      idType: user.idType,
      kycStatus: user.kycStatus || "pending",
      kycProgress: user.getKYCProgress?.() || 0,
    }),
  };
}

/* ───────────────────────── PUBLIC ROUTES ───────────────────────── */

// Register (with optional KYC for vendors)
router.post(
  "/register",
  vendorKYCUpload.fields([
    { name: "idFrontImage", maxCount: 1 },
    { name: "idBackImage", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      // ✅ FIXED: Validate input
      const { error, value } = validate(req.body, registerSchema);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const isVendor = value.isVendor === true || value.isVendor === "true";
      // ✅ NEW: Handle vendorType (marketplace or restaurant)
      const vendorType = isVendor ? (value.vendorType === "restaurant" ? "restaurant" : "marketplace") : "marketplace";
      const isRestaurantVendor = vendorType === "restaurant";

      // ✅ Validate KYC fields for vendors
      if (isVendor) {
        if (!value.phoneNumber) {
          return res.status(400).json({ error: "Phone number is required for vendors" });
        }
        if (!value.idType) {
          return res.status(400).json({ error: "ID type is required for vendors" });
        }
        if (!req.files?.idFrontImage?.[0]) {
          return res.status(400).json({ error: "ID front image is required for vendors" });
        }
        if (!req.files?.idBackImage?.[0]) {
          return res.status(400).json({ error: "ID back image is required for vendors" });
        }

        // ✅ Validate location fields for vendors (Ghana-focused)
        // Accept predefined OR custom input (user typed)
        // Defensive: Check ghanaLocations is properly loaded
        const locationConfig = ghanaLocations && typeof ghanaLocations.isValidRegion === 'function'
          ? ghanaLocations
          : null;

        if (!value.region || value.region.trim() === "") {
          return res.status(400).json({ error: "Region is required for vendors" });
        }
        // Only validate against predefined list if it's a predefined region (and config is available)
        const isPredefinedRegion = locationConfig ? locationConfig.isValidRegion(value.region) : false;
        if (!isPredefinedRegion && value.region.trim().length < 2) {
          return res.status(400).json({ error: "Region must be at least 2 characters" });
        }
        if (!value.city || value.city.trim() === "") {
          return res.status(400).json({ error: "City is required for vendors" });
        }
        // Only validate against predefined cities if region is predefined (and config is available)
        const isPredefinedCity = isPredefinedRegion && locationConfig
          ? locationConfig.isValidCity(value.region, value.city)
          : false;
        if (!isPredefinedCity && value.city.trim().length < 2) {
          return res.status(400).json({ error: "City must be at least 2 characters" });
        }

        // ✅ Process uploaded ID documents
        const frontFile = req.files.idFrontImage[0];
        const backFile = req.files.idBackImage[0];

        // Check if this is a Cloudinary upload (has secure_url or path is a URL)
        const isCloudinaryUpload = (file) => {
          return file.secure_url || (file.path && file.path.startsWith("http"));
        };

        // Get Cloudinary config status
        const { isKYCCloudinaryConfigured } = require("../config/multer");
        const useCloudinary = isKYCCloudinaryConfigured();
      }

      // ✅ Prepare user data
      const userData = {
        ...value,
        isVendor,
        vendorType, // ✅ NEW: marketplace or restaurant
      };

      // ✅ Add restaurant details if restaurant vendor
      if (isRestaurantVendor) {
        userData.restaurantDetails = {
          restaurantName: value.restaurantName || value.storeName || "",
          restaurantDescription: value.restaurantDescription || value.storeDescription || "",
          address: value.address || "",
          deliveryRadius: value.deliveryRadius || 5,
          openingHours: value.openingHours || "08:00",
          closingHours: value.closingHours || "22:00",
          cuisineType: value.cuisineType || "",
          isOpen: false, // Restaurants start closed until approved
        };
      }

      // ✅ Add location data if vendor (Ghana-focused)
      if (isVendor) {
        userData.location = {
          country: value.country || "Ghana",
          region: value.region || "",
          city: value.city || "",
        };
      }

      // ✅ Add KYC data if vendor
      if (isVendor) {
        userData.phoneNumber = value.phoneNumber;
        userData.idType = value.idType;

        // Handle both Cloudinary and local storage
        const frontFile = req.files.idFrontImage[0];
        const backFile = req.files.idBackImage[0];

        // Check if using Cloudinary
        const { isKYCCloudinaryConfigured } = require("../config/multer");
        const useCloudinary = isKYCCloudinaryConfigured();
        const isCloudinaryUpload = (file) => {
          return useCloudinary && (file.secure_url || (file.path && file.path.startsWith("http")));
        };

        if (isCloudinaryUpload(frontFile)) {
          // Cloudinary - use secure URL
          userData.idFrontImage = frontFile.secure_url || frontFile.path;
          userData.idBackImage = backFile.secure_url || backFile.path;
          logger.log("[KYC] Cloudinary upload:", { front: userData.idFrontImage, back: userData.idBackImage });
        } else {
          // Local storage fallback
          userData.idFrontImage = `/uploads/vendor-docs/${frontFile.filename}`;
          userData.idBackImage = `/uploads/vendor-docs/${backFile.filename}`;
          logger.log("[KYC] Local upload:", { front: userData.idFrontImage, back: userData.idBackImage });
        }

        userData.kycStatus = "pending"; // Admin will verify
      }

      const user = await User.create(userData);
      const token = sign(user);
      res.status(201).json({ user: cleanUser(user), token });
    } catch (err) {
      // ✅ Clean up uploaded local files on error (Cloudinary files are already in cloud)
      if (req.files) {
        try {
          // Only cleanup local files - not Cloudinary URLs
          const { isKYCCloudinaryConfigured } = require("../config/multer");
          if (!isKYCCloudinaryConfigured()) {
            if (req.files.idFrontImage?.[0]?.path && fs.existsSync(req.files.idFrontImage[0].path)) {
              fs.unlinkSync(req.files.idFrontImage[0].path);
            }
            if (req.files.idBackImage?.[0]?.path && fs.existsSync(req.files.idBackImage[0].path)) {
              fs.unlinkSync(req.files.idBackImage[0].path);
            }
          }
        } catch (cleanupErr) {
          console.warn("[KYC] Cleanup warning:", cleanupErr.message);
        }
      }
      res.status(400).json({ error: err.message });
    }
  }
);

// Login
router.post("/login", async (req, res) => {
  try {
    // ✅ FIXED: Validate input
    const { error, value } = validate(req.body, loginSchema);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const user = await User.findOne({ email: value.email }).select("+password");

    if (!user || !(await user.comparePassword(value.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // DEBUG: Log vendorType before sending response
    console.log("[AUTH LOGIN] ================= FULL DEBUG =================");
    const userObjRaw = user.toObject ? user.toObject() : user;
    console.log("[AUTH LOGIN] FULL DB DOC:", JSON.stringify(userObjRaw));
    console.log("[AUTH LOGIN] DB vendorType VALUE:", userObjRaw.vendorType);
    console.log("[AUTH LOGIN] DB vendorType TYPE:", typeof userObjRaw.vendorType);
    console.log("[AUTH LOGIN] DB hasVendorType:", "vendorType" in userObjRaw);
    console.log("[AUTH LOGIN] DB vendorStatus:", userObjRaw.vendorStatus);
    console.log("[AUTH LOGIN] DB isVendor:", userObjRaw.isVendor);
    console.log("[AUTH LOGIN] DB restaurantDetails:", userObjRaw.restaurantDetails);

    const userObj = cleanUser(user);
    console.log("[AUTH LOGIN] cleanUser output FULL:", JSON.stringify(userObj));
    console.log("[AUTH LOGIN] cleanUser vendorType:", userObj.vendorType);
    console.log("[AUTH LOGIN] cleanUser restaurantDetails:", userObj.restaurantDetails);
    console.log("[AUTH LOGIN] ===============================================");

    res.json({ user: userObj, token: sign(user) });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

// Forgot password
router.post("/forgot-password", async (req, res) => {
  try {
    // ✅ FIXED: Validate input
    const { error, value } = validate(req.body, forgotPasswordSchema);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const user = await User.findOne({ email: value.email });
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetToken = resetToken;
    user.resetExpires = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour
    await user.save();

    // Send email
    await sendPasswordResetEmail(user.email, resetToken);

    res.json({ message: "Password reset link sent to your email" });
  } catch (err) {
    console.error("Forgot password error:", err.message);
    res.status(500).json({ error: "Failed to send reset email" });
  }
});

// Get current user
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    // EXTREME DEBUG: Log EVERY field in the document
    console.log("[AUTH /me] ================ RAW DB DOC ================");
    console.log("[AUTH /me] ALL KEYS:", Object.keys(user));
    console.log("[AUTH /me] FULL DOC:", JSON.stringify(user, null, 2));
    console.log("[AUTH /me] ===============================================");

    const cleaned = cleanUser(user);
    console.log("[AUTH /me] CLEANED USER:", JSON.stringify(cleaned, null, 2));

    res.json({ user: cleaned });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Update own profile
router.put("/me", requireAuth, async (req, res) => {
  try {
    // ✅ FIXED: Validate input
    const { error, value } = validate(req.body, updateProfileSchema);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, email, storeName, storeDescription, storeLogo, location, restaurantDetails } = value;
    const updates = {};

    // Update fields
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (storeName !== undefined) updates.storeName = storeName;
    if (storeDescription !== undefined) updates.storeDescription = storeDescription;
    if (storeLogo !== undefined) updates.storeLogo = storeLogo;

    // ✅ Update location (for vendors)
    if (location !== undefined && req.user.isVendor) {
      // Validate location if provided (accept both predefined and custom)
      if (location && (location.region || location.city)) {
        // Defensive: Check ghanaLocations is properly loaded
        const locationConfig = ghanaLocations && typeof ghanaLocations.isValidRegion === 'function'
          ? ghanaLocations
          : null;

        const isPredefinedRegion = locationConfig ? locationConfig.isValidRegion(location.region) : false;
        // Allow custom regions with min 2 chars
        if (!isPredefinedRegion && location.region && location.region.trim().length < 2) {
          return res.status(400).json({ error: "Region must be at least 2 characters" });
        }
        // Allow custom cities with min 2 chars
        const isPredefinedCity = isPredefinedRegion && locationConfig
          ? locationConfig.isValidCity(location.region, location.city)
          : false;
        if (!isPredefinedCity && location.city && location.city.trim().length < 2) {
          return res.status(400).json({ error: "City must be at least 2 characters" });
        }
      }

      updates.location = {
        country: location?.country || "Ghana",
        region: location?.region || "",
        city: location?.city || "",
      };
    }

    // ✅ FIX: Persist `restaurantDetails` for restaurant vendors.
    //   Joi (`updateProfileSchema` in backend/utils/joiSchemas.js) now
    //   accepts and type-checks the `restaurantDetails` sub-object, so by
    //   the time we reach this line `value.restaurantDetails` is either
    //   undefined (no field in the request body) or a plain object with
    //   all sub-fields already validated. The previous version of this
    //   handler destructured only {name,email,storeName,storeDescription,
    //   storeLogo,location} and silently dropped `restaurantDetails` on
    //   the floor — so PUT /auth/me returned HTTP 200 with "Settings
    //   saved" but the database was never updated for the restaurant
    //   sub-document. RestaurantSettingsPage then re-read the unchanged
    //   docs on next mount and re-rendered the original values, making
    //   the page look like everything had "reverted to defaults".
    //
    //   Guards:
    //   1. Only vendors can write `restaurantDetails` — matches the
    //      `location` guard above. Customers/marketplace-vendors ignore
    //      the field (it is stripped/ignored on non-vendor docs anyway
    //      by the Mongoose sub-schema).
    //   2. `restaurantDetails` must be a plain object — not an array,
    //      string, etc. Joi's `Joi.object(...).unknown(true)` already
    //      enforces this, so this check is a belt-and-suspenders defense
    //      against future schema drift.
    if (
      restaurantDetails !== undefined &&
      req.user.isVendor &&
      restaurantDetails !== null &&
      typeof restaurantDetails === "object" &&
      !Array.isArray(restaurantDetails)
    ) {
      updates.restaurantDetails = restaurantDetails;
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: updates },
      { new: true }
    ).lean();

    if (!user) return res.status(404).json({ message: "User not found" });

    // Return user and fresh token for frontend context
    const token = sign(user);
    res.json({ user: cleanUser(user), token });
  } catch (err) {
    console.error("Profile update error:", err.message);
    res.status(500).json({ error: "Update failed" });
  }
});

// Reset password (public route, requires valid token)
router.post("/reset-password", async (req, res) => {
  try {
    // ✅ FIXED: Validate input
    const { error, value } = validate(req.body, resetPasswordSchema);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, token, newPassword } = value;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "Invalid reset link" });
    }

    // Validate token and expiry
    if (!user.resetToken || user.resetToken !== token) {
      return res.status(400).json({ error: "Invalid reset link" });
    }

    if (!user.resetExpires || user.resetExpires < new Date()) {
      return res.status(400).json({ error: "Reset link has expired" });
    }

    // Update password (will be hashed by pre-save hook)
    user.password = newPassword;
    user.resetToken = null;
    user.resetExpires = null;
    await user.save();

    res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    console.error("Reset password error:", err.message);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// Change password
router.put("/change-password", requireAuth, async (req, res) => {
  try {
    // ✅ FIXED: Validate input
    const { error, value } = validate(req.body, changePasswordSchema);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { currentPassword, newPassword } = value;
    const user = await User.findById(req.user.userId).select("+password");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ error: "Password change failed" });
  }
});

// ── GOOGLE OAUTH ──────────────────────────────────────────────────────────────
// ✅ FIXED: Using google-auth-library for secure token verification
router.post("/google", async (req, res) => {
  try {
    const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!googleClientId) {
      return res.status(500).json({ error: "Google Sign-In is not configured" });
    }

    const credential = req.body?.credential; // Google Identity Services sends an ID token in "credential"
    if (!credential || typeof credential !== "string") {
      return res.status(400).json({ error: "Google credential required" });
    }

    // ✅ CRITICAL: Verify token with Google's servers (not just decode)
    const client = new OAuth2Client(googleClientId);

    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: credential,
        audience: googleClientId,
      });
    } catch (verifyErr) {
      console.error("Token verification failed:", verifyErr.message);
      return res.status(401).json({ error: "Invalid or expired Google token" });
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ error: "Invalid Google token payload" });
    }

    const { email, name, picture, sub: googleId } = payload;
    if (!googleId || !payload.email_verified) {
      return res.status(401).json({ error: "Invalid Google token" });
    }

    // Find or create user
    let user = await User.findOne({ $or: [{ googleId }, { email }] });
    if (!user) {
      user = await User.create({
        name: name || email.split("@")[0],
        email,
        password: crypto.randomBytes(16).toString("hex"), // Random password
        googleId, // ✅ Store Google's unique ID
        isVendor: false,
        isAdmin: false,
      });
    } else if (user.googleId && user.googleId !== googleId) {
      return res.status(401).json({ error: "Google account does not match this user" });
    } else if (!user.googleId) {
      // ✅ Update existing user with googleId if missing
      user.googleId = googleId;
      await user.save();
    }

    // Generate JWT token (matches existing auth system)
    const jwtToken = sign(user);
    res.json({ token: jwtToken, user: cleanUser(user) });
  } catch (err) {
    console.error("Google OAuth error:", err.message);
    res.status(500).json({ error: "Google authentication failed" });
  }
});

// ── APPLE SIGN-IN ─────────────────────────────────────────────────────────────
router.post("/apple", async (req, res) => {
  try {
    const { token, identityToken } = req.body;
    if (!token && !identityToken) {
      return res.status(400).json({ error: "Apple token required" });
    }

    // Verify token with Apple (in production, verify with Apple's API)
    // For now, we'll decode the token (NOTE: In production, verify with Apple)
    const decoded = jwt.decode(token || identityToken);
    if (!decoded || !decoded.email) {
      return res.status(400).json({ error: "Invalid Apple token" });
    }

    const { email, sub: appleId } = decoded;
    const name = req.body.user?.name?.firstName || email.split("@")[0];

    // Find or create user
    let user = await User.findOne({ $or: [{ email }, { appleId }] });
    if (!user) {
      user = await User.create({
        name,
        email,
        password: crypto.randomBytes(16).toString("hex"), // Random password
        appleId, // Apple's unique ID
        isVendor: false,
        isAdmin: false,
      });
    }

    // Generate JWT token
    const jwtToken = sign(user);
    res.json({ token: jwtToken, user: cleanUser(user) });
  } catch (err) {
    console.error("Apple Sign-In error:", err.message);
    res.status(500).json({ error: "Apple authentication failed" });
  }
});

/* ───────────────────────── MULTER ERROR HANDLER ───────────────────────── */
// Must be after all routes to catch multer errors
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large (max 2MB)' });
  }
  if (err && err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Too many files' });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'File upload failed' });
  }
  next();
});

module.exports = router;
