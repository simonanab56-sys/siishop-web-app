// utils/pricing.js
//
// Single source of truth for product discount math, display, and form
// derivation. Used by:
//   - ProductCard        (badge + strikethrough)
//   - ProductDetailPage  (badge + strikethrough)
//   - AdminDashboard     (product form preview + payload construction)
//   - VendorDashboard    (product form preview + payload construction)
//   - DealsPage          (sort + label rendering)
//   - OrdersPage / OrderDetailPage (optional, line item strikethrough)
//
// Backward-compatible: the PromoSection component still injects `_originalPrice`
// as a transient field; discountInfo() checks both `originalPrice` (schema) and
// `_originalPrice` (legacy transient) so existing promo-only surfaces continue
// to show the badge.

export const DISCOUNT_TYPES = [
  { value: "",          label: "No discount" },
  { value: "percentage", label: "Percentage (%)" },
  { value: "fixed",     label: "Fixed Amount (GH₵)" },
];

/**
 * Coerce a value to a finite number, or null.
 * Empty strings, null, undefined, NaN → null.
 */
function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Inspect a product and return a normalized discount view.
 *
 * @param {Object} product
 * @returns {{hasDiscount: boolean, price: number|null, originalPrice: number|null, saved: number, percent: number}}
 */
export function discountInfo(product) {
  if (!product) return { hasDiscount: false, price: null, originalPrice: null, saved: 0, percent: 0 };

  const price = toNum(product.price);
  // Prefer schema `originalPrice`; fall back to legacy `_originalPrice`
  // injected by PromoSection.
  const originalPrice = toNum(product.originalPrice ?? product._originalPrice);

  if (originalPrice == null || price == null || originalPrice <= price) {
    return { hasDiscount: false, price, originalPrice: null, saved: 0, percent: 0 };
  }

  const saved    = round2(originalPrice - price);
  const percent  = Math.round((saved / originalPrice) * 100);
  return {
    hasDiscount: true,
    price,
    originalPrice,
    saved,
    percent,
  };
}

/**
 * Compute a selling price from a discount configuration.
 * Mirrors the backend's server-side math (services/product.service.js).
 *
 * Returns null when inputs are insufficient (no Original, no Discount, etc.).
 * Returns null when validation rules fail (percent > 100, fixed > original).
 */
export function deriveSellingPrice({ originalPrice, discountType, discountValue }) {
  const op = toNum(originalPrice);
  const dv = toNum(discountValue);
  if (op == null || op <= 0) return null;
  if (!discountType) return null;
  if (dv == null || dv < 0) return null;
  if (discountType === "percentage") {
    if (dv > 100) return null;
    return round2(Math.max(0, op - (op * dv) / 100));
  }
  if (discountType === "fixed") {
    if (dv > op) return null;
    return round2(Math.max(0, op - dv));
  }
  return null;
}

/**
 * Reverse-solve: given a desired selling price and discount type/value,
 * derive the implied original price. Useful when the merchant edits the
 * selling price directly in the form.
 *
 * Returns null when the inputs are incomplete or the equation is undefined
 * (e.g. percentage = 100 means free, cannot back-solve).
 */
export function deriveOriginalFromSelling({ sellingPrice, discountType, discountValue }) {
  const sp = toNum(sellingPrice);
  const dv = toNum(discountValue);
  if (sp == null || sp < 0) return null;
  if (!discountType || dv == null || dv < 0) return null;
  if (discountType === "percentage") {
    if (dv >= 100) return null;
    // sp = op * (1 - dv/100)  ⇒  op = sp / (1 - dv/100)
    return round2(sp / (1 - dv / 100));
  }
  if (discountType === "fixed") {
    return round2(sp + dv);
  }
  return null;
}

/**
 * Build a normalized product-payload body for create/update.
 * Pure: returns a new object with the right shape for the backend.
 *
 * The backend's `prepareProductForSave` is the source of truth for
 * validation + isOnSale derivation; this helper just makes sure null/undefined
 * discount inputs are normalized so Joi and `prepareProductForSave` see them.
 */
export function buildProductPayload(form) {
  const out = { ...form };
  out.price = toNum(form.price) ?? 0;
  out.originalPrice = toNum(form.originalPrice);
  out.discountValue = toNum(form.discountValue);
  // discountType: keep as-is (string or "")
  if (!form.discountType) out.discountType = null;
  return out;
}

/**
 * Format the savings label for a product. Returns "" when no discount.
 * Example: { saved: 30, percent: 15 } + fmt → "Save GH₵30 (-15%)".
 */
export function formatSavings(product, fmt) {
  const d = discountInfo(product);
  if (!d.hasDiscount) return "";
  return `Save ${fmt(d.saved)} (-${d.percent}%)`;
}
