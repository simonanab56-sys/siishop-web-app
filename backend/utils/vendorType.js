// Pure helper: classify a user as a restaurant vendor without being
// fooled by Mongoose's default-hydrated `restaurantDetails` subdoc.
//
// Background: every user has a `restaurantDetails` subdocument with
// default values (`deliveryRadius: 5`, `deliveryFee: 0`,
// `estimatedDeliveryTime: 30`, `isOpen: false`, `coverImagePublicId: ""`).
// Mongoose hydrates these defaults the moment the user is loaded,
// so a marketplace vendor who never touched restaurant fields will
// have a non-empty `restaurantDetails` object. Calling
// `Object.keys(restaurantDetails).length > 0` would incorrectly
// classify that vendor as a restaurant vendor.
//
// This module exports two pure functions used by the auth middleware,
// the login response (`cleanUser`), and the frontend routing code:
//
//   isRestaurantVendor(vendorType, restaurantDetails)
//     → the canonical classification (matches the frontend rule).
//
//   classifyVendorType(vendorType, restaurantDetails)
//     → returns the effective vendorType ("restaurant" or
//       "marketplace"), used to fill in `req.user.vendorType` and
//       the login response when the stored `vendorType` is missing.

const RESTAURANT_DEFAULT_KEYS = new Set([
  "deliveryRadius",
  "deliveryFee",
  "estimatedDeliveryTime",
  "isOpen",
  "coverImagePublicId",
]);

function hasUserSetRestaurantFields(restaurantDetails) {
  if (!restaurantDetails || typeof restaurantDetails !== "object") return false;
  return Object.keys(restaurantDetails).some(
    (k) => !RESTAURANT_DEFAULT_KEYS.has(k)
  );
}

function isRestaurantVendor(vendorType, restaurantDetails) {
  if (vendorType === "restaurant") return true;
  if (vendorType == null) return hasUserSetRestaurantFields(restaurantDetails);
  return false; // explicitly "marketplace" or any other stored value
}

function classifyVendorType(vendorType, restaurantDetails) {
  if (vendorType === "marketplace" || vendorType === "restaurant") {
    return vendorType;
  }
  // legacy: vendorType unset → infer from restaurantDetails
  return hasUserSetRestaurantFields(restaurantDetails) ? "restaurant" : "marketplace";
}

module.exports = {
  isRestaurantVendor,
  classifyVendorType,
  hasUserSetRestaurantFields,
  RESTAURANT_DEFAULT_KEYS,
};
