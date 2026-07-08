"use strict";
const Joi = require("joi");
/**
 * ✅ INPUT VALIDATION SCHEMAS using Joi
 * 
 * Prevents:
 * - NoSQL injection
 * - XSS attacks
 * - Invalid data types
 * - Missing required fields
 * - Data corruption
 */
// ─────────────────────────────────────────────────────────────────────────────
// AUTH SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────
const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).max(50).required(),
  isVendor: Joi.boolean().optional(),
  storeName: Joi.string().trim().max(100).optional(),
  storeDescription: Joi.string().trim().max(500).optional(),
  storeLogo: Joi.string().uri().optional(),
  phoneNumber: Joi.string().trim().optional(),
  idType: Joi.string().trim().optional(),
  idFrontImage: Joi.any().optional(),
  idBackImage: Joi.any().optional(),
}).unknown(true);
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
}).unknown(false);
const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
}).unknown(false);
const resetPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
  token: Joi.string().required(),
  newPassword: Joi.string().min(6).max(50).required(),
}).unknown(false);
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).max(50).required(),
}).unknown(false);
// ✅ FIX: Added `location` and `restaurantDetails` to the profile update schema
//   so restaurant vendors can save their settings through PUT /auth/me (which
//   the route handler at backend/routes/auth.js already destructures from
//   `value`). The sub-schemas mirror the Mongoose fields in models/User.js
//   (restaurantDetails: restaurantName, restaurantDescription, storeLogo,
//   restaurantCoverImage, cuisineType, phone, whatsapp, address, area,
//   deliveryRadius, deliveryFee, estimatedDeliveryTime, openingHours,
//   closingHours, isOpen). The previous schema used `.unknown(false)`, so
//   these fields were rejected before the route could reach the
//   `if (location !== undefined && req.user.isVendor) {…}` branch.
//   All existing customer fields (name/email/storeName/storeDescription/
//   storeLogo) keep the same shape and validation rules — non-vendor
//   customers are unaffected. `unknown(false)` is preserved so any genuinely
//   unknown field is still rejected.
const updateProfileSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional(),
  email: Joi.string().email().optional(),
  storeName: Joi.string().trim().max(100).optional(),
  storeDescription: Joi.string().trim().max(500).optional(),
  // ✅ FIX: Top-level `storeLogo` must allow empty strings. The
  //   restaurant settings page initializes `form.storeLogo = ""` for
  //   vendors who haven't uploaded a logo yet, and that empty string
  //   is sent up to PUT /auth/me on every save. The previous schema
  //   was `Joi.string().uri().optional()` — `.uri()` rejects `""` with
  //   "is not allowed to be empty" (string.empty), so the entire
  //   update was rejected with HTTP 400. The user then saw a brief
  //   toast like '"storeLogo" is not allowed to be empty' that
  //   auto-dismissed in 3s and reported "the save is still not
  //   working". This matches the matching sub-schema entry on line
  //   77 below, which already has `.allow("")` — the top-level field
  //   was simply missed when the schema was extended for restaurants.
  storeLogo: Joi.string().uri().optional().allow("", null),
  // ✅ NEW: Vendor location (already consumed by the route handler).
  location: Joi.object({
    country: Joi.string().trim().max(60).optional(),
    region:  Joi.string().trim().max(80).optional().allow(""),
    city:    Joi.string().trim().max(80).optional().allow(""),
  }).unknown(true).optional(),
  // ✅ NEW: Restaurant details (sub-schema mirrors models/User.js
  //   `restaurantDetails`). All fields are optional and permissive — the
  //   route handler only writes this object when the user is a vendor.
  restaurantDetails: Joi.object({
    restaurantName:         Joi.string().trim().max(100).optional().allow(""),
    restaurantDescription:  Joi.string().trim().max(1000).optional().allow(""),
    storeLogo:              Joi.string().uri().optional().allow(""),
    restaurantCoverImage:   Joi.string().uri().optional().allow(""),
    cuisineType:            Joi.string().trim().max(60).optional().allow(""),
    phone:                  Joi.string().trim().max(30).optional().allow(""),
    whatsapp:               Joi.string().trim().max(30).optional().allow(""),
    address:                Joi.string().trim().max(200).optional().allow(""),
    area:                   Joi.string().trim().max(80).optional().allow(""),
    deliveryRadius:         Joi.number().min(0).max(200).optional(),
    deliveryFee:            Joi.number().min(0).optional(),
    estimatedDeliveryTime:  Joi.number().min(0).max(600).optional(),
    openingHours:           Joi.string().trim().max(20).optional().allow(""),
    closingHours:           Joi.string().trim().max(20).optional().allow(""),
    isOpen:                 Joi.boolean().optional(),
  }).unknown(true).optional(),
}).unknown(false);
// ─────────────────────────────────────────────────────────────────────────────
// ORDER SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────
const orderItemSchema = Joi.object({
  productId: Joi.string().required(),
  name: Joi.string().trim().required(),
  price: Joi.number().positive().optional(),  // ✅ OPTIONAL - backend calculates from DB
  originalPrice: Joi.number().min(0).optional(), // ✅ NEW - snapshot of pre-sale price when product was discounted
  quantity: Joi.number().integer().min(1).max(1000).required(),
  image: Joi.string().optional(),
  fromPromo: Joi.boolean().optional(),  // ✅ NEW - tells backend if from promo section
  // ✅ Restaurant/Food order fields
  itemType: Joi.string().valid("food", "product").optional(),
  restaurantId: Joi.string().optional(),
  restaurantName: Joi.string().optional(),
  menuItemId: Joi.string().optional(),
});
const createOrderSchema = Joi.object({
  customerName: Joi.string().trim().min(2).max(100).required(),
  customerEmail: Joi.string().email().required(),
  customerPhone: Joi.string().pattern(/^[+\d][\d\s\-().]{6,19}$/).required(),
  deliveryAddress: Joi.string().trim().min(5).max(200).required(),
  items: Joi.array().items(orderItemSchema).min(1).max(100).required(),
  totalAmount: Joi.number().positive().required(),
  paymentMethod: Joi.string().valid("paystack", "cash").required(),
  paymentRef: Joi.string().optional(),
  // ✅ Restaurant/Food order fields
  orderType: Joi.string().valid("food", "product").optional(),
  restaurantId: Joi.string().optional(),
  restaurantName: Joi.string().optional(),
});
const initializePaymentSchema = Joi.object({
  email: Joi.string().email().required(),
  amount: Joi.number().positive().required(),
}).unknown(false);

const verifyPaymentSchema = Joi.object({
  paymentRef: Joi.string().required(),
  orderId: Joi.string().required(),
}).unknown(false);
const updateOrderStatusSchema = Joi.object({
  // Canonical 6-status enum — single source of truth across marketplace + restaurant.
  // Legacy restaurant-only values were removed as part of the order system unification.
  orderStatus: Joi.string()
    .valid(
      "pending",
      "confirmed",
      "preparing",
      "out_for_delivery",
      "delivered",
      "cancelled"
    )
    .required(),
}).unknown(false);
// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────
// Shared discount sub-schema — applied to all 4 product schemas below so the
// discount fields (originalPrice, discountType, discountValue, isOnSale) stay
// in sync. The values are normalized/validated in services/product.service.js
// `prepareProductForSave` — Joi's role here is only to whitelist and parse.
//
// NOTE: this is a *plain shape object* describing each field's Joi schema,
// NOT a compiled Joi.object(...) instance.
//
// We must not spread a compiled Joi schema into another Joi.object({...})
// because compiled Joi schemas expose enumerable internal properties
// (e.g. $_terms, _preferences, _rules). Spreading those into a Joi.object
// literal causes Joi's compiler to see those internals as user-supplied
// schema descriptions and throw:
//   "AssertError: Schema can only contain plain objects"
//   at path: '$_root._types'.
// By keeping the shape as a plain JS object, the spread is purely a JS
// operation that copies the user-defined keys only, and each receiving
// Joi.object({...}) call sees a normal map of { fieldName: JoiSchema }.
const productDiscountSchema = {
  originalPrice: Joi.number().min(0).optional().allow(null, ""),
  discountType:  Joi.string().valid("percentage", "fixed").optional().allow(null, ""),
  discountValue: Joi.number().min(0).optional().allow(null, ""),
  isOnSale:      Joi.boolean().optional(),
};

const createProductSchema = Joi.object({
  name: Joi.string().trim().min(3).max(100).required(),
  description: Joi.string().trim().max(1000).optional(),
  price: Joi.number().min(0).required(),
  category: Joi.string().trim().max(50).required(),
  stock: Joi.number().integer().min(0).required(),
  image: Joi.string().optional(),
  available: Joi.boolean().optional(),
  ...productDiscountSchema,
}).unknown(true);
const updateProductSchema = Joi.object({
  name: Joi.string().trim().min(3).max(100).optional(),
  description: Joi.string().trim().max(1000).optional(),
  price: Joi.number().min(0).optional(),
  category: Joi.string().trim().max(50).optional(),
  stock: Joi.number().integer().min(0).optional(),
  image: Joi.string().optional(),
  available: Joi.boolean().optional(),
  ...productDiscountSchema,
}).unknown(true);
// ─────────────────────────────────────────────────────────────────────────────
// VENDOR SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────
const vendorProductSchema = Joi.object({
  name: Joi.string().trim().min(3).max(100).required(),
  description: Joi.string().trim().max(1000).optional(),
  price: Joi.number().min(0).required(),
  category: Joi.string().trim().max(50).required(),
  stock: Joi.number().integer().min(0).required(),
  image: Joi.string().optional(),
  ...productDiscountSchema,
}).unknown(true);
const updateVendorProductSchema = Joi.object({
  name: Joi.string().trim().min(3).max(100).optional(),
  description: Joi.string().trim().max(1000).optional(),
  price: Joi.number().min(0).optional(),
  category: Joi.string().trim().max(50).optional(),
  stock: Joi.number().integer().min(0).optional(),
  image: Joi.string().optional(),
  ...productDiscountSchema,
}).unknown(true);
const vendorUpdateOrderStatusSchema = Joi.object({
  // Canonical 6-status enum (single source of truth across marketplace + restaurant vendors).
  orderStatus: Joi.string()
    .valid("pending", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled")
    .required(),
}).unknown(false);
// ─────────────────────────────────────────────────────────────────────────────
// ADMIN SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────
const adminUpdateUserSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional(),
  email: Joi.string().email().optional(),
  isAdmin: Joi.boolean().optional(),
  isVendor: Joi.boolean().optional(),
}).unknown(false);
const adminRejectVendorSchema = Joi.object({
  reason: Joi.string().trim().max(500).optional(),
}).unknown(false);
// ─────────────────────────────────────────────────────────────────────────────
// PROMO SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────
const createPromoSchema = Joi.object({
  productId: Joi.string().required(),
  discountPercent: Joi.number().integer().min(1).max(100).required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().required(),
  title: Joi.string().trim().max(100).optional(),
  active: Joi.boolean().optional(),
}).unknown(false);
const updatePromoSchema = Joi.object({
  discountPercent: Joi.number().integer().min(1).max(100).optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  title: Joi.string().trim().max(100).optional(),
  active: Joi.boolean().optional(),
}).unknown(false);
// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTION
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Validate request body against schema
 * Returns { error, value } object
 */
function validate(data, schema) {
  return schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });
}
module.exports = {
  // Auth
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
  // Orders
  createOrderSchema,
  initializePaymentSchema,
  verifyPaymentSchema,
  updateOrderStatusSchema,
  // Products
  createProductSchema,
  updateProductSchema,
  // Vendor
  vendorProductSchema,
  updateVendorProductSchema,
  vendorUpdateOrderStatusSchema,
  // Admin
  adminUpdateUserSchema,
  adminRejectVendorSchema,
  // Promos
  createPromoSchema,
  updatePromoSchema,
  // Helper
  validate,
};
