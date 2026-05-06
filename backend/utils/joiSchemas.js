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
const updateProfileSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional(),
  email: Joi.string().email().optional(),
  storeName: Joi.string().trim().max(100).optional(),
  storeDescription: Joi.string().trim().max(500).optional(),
  storeLogo: Joi.string().uri().optional(),
}).unknown(false);
// ─────────────────────────────────────────────────────────────────────────────
// ORDER SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────
const orderItemSchema = Joi.object({
  productId: Joi.string().required(),
  name: Joi.string().trim().required(),
  price: Joi.number().positive().optional(),  // ✅ OPTIONAL - backend calculates from DB
  quantity: Joi.number().integer().min(1).max(1000).required(),
  image: Joi.string().optional(),
  fromPromo: Joi.boolean().optional(),  // ✅ NEW - tells backend if from promo section
}).unknown(false);
const createOrderSchema = Joi.object({
  customerName: Joi.string().trim().min(2).max(100).required(),
  customerEmail: Joi.string().email().required(),
  customerPhone: Joi.string().pattern(/^[+\d][\d\s\-().]{6,19}$/).required(),
  deliveryAddress: Joi.string().trim().min(5).max(200).required(),
  items: Joi.array().items(orderItemSchema).min(1).max(100).required(),
  totalAmount: Joi.number().positive().required(),
  paymentMethod: Joi.string().valid("paystack", "cash").required(),
  paymentRef: Joi.string().optional(),
}).unknown(false);
const initializePaymentSchema = Joi.object({
  email: Joi.string().email().required(),
  amount: Joi.number().positive().required(),
}).unknown(false);

const verifyPaymentSchema = Joi.object({
  paymentRef: Joi.string().required(),
  orderId: Joi.string().required(),
}).unknown(false);
const updateOrderStatusSchema = Joi.object({
  orderStatus: Joi.string().valid("pending", "confirmed", "preparing", "out_for_delivery", "delivered").required(),
}).unknown(false);
// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────
const createProductSchema = Joi.object({
  name: Joi.string().trim().min(3).max(100).required(),
  description: Joi.string().trim().max(1000).optional(),
  price: Joi.number().positive().required(),
  category: Joi.string().trim().max(50).required(),
  stock: Joi.number().integer().min(0).required(),
  image: Joi.string().optional(),
  available: Joi.boolean().optional(),
}).unknown(false);
const updateProductSchema = Joi.object({
  name: Joi.string().trim().min(3).max(100).optional(),
  description: Joi.string().trim().max(1000).optional(),
  price: Joi.number().positive().optional(),
  category: Joi.string().trim().max(50).optional(),
  stock: Joi.number().integer().min(0).optional(),
  image: Joi.string().optional(),
  available: Joi.boolean().optional(),
}).unknown(false);
// ─────────────────────────────────────────────────────────────────────────────
// VENDOR SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────
const vendorProductSchema = Joi.object({
  name: Joi.string().trim().min(3).max(100).required(),
  description: Joi.string().trim().max(1000).optional(),
  price: Joi.number().positive().required(),
  category: Joi.string().trim().max(50).required(),
  stock: Joi.number().integer().min(0).required(),
  image: Joi.string().optional(),
}).unknown(false);
const updateVendorProductSchema = Joi.object({
  name: Joi.string().trim().min(3).max(100).optional(),
  description: Joi.string().trim().max(1000).optional(),
  price: Joi.number().positive().optional(),
  category: Joi.string().trim().max(50).optional(),
  stock: Joi.number().integer().min(0).optional(),
  image: Joi.string().optional(),
}).unknown(false);
const vendorUpdateOrderStatusSchema = Joi.object({
  orderStatus: Joi.string().valid("pending", "confirmed", "preparing", "out_for_delivery", "delivered").required(),
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
