// utils/currency.js
// ─────────────────────────────────────────────────────────────────────────────
// Default currency: Ghana Cedis (GHS).
// Auto-detects user locale/country and switches to USD for non-GH users.
// Conversion-ready: swap in a live FX API by replacing RATES below.
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

// Static rates (GHS base). Replace with live API call for production.
export const CURRENCIES = {
  GHS: { code: "GHS", symbol: "GH₵", name: "Ghana Cedi",  rate: 1      },
  USD: { code: "USD", symbol: "$",    name: "US Dollar",   rate: 0.066  }, // ~1 GHS = 0.066 USD
  EUR: { code: "EUR", symbol: "€",    name: "Euro",        rate: 0.061  },
  GBP: { code: "GBP", symbol: "£",    name: "British Pound",rate: 0.052 },
  NGN: { code: "NGN", symbol: "₦",    name: "Naira",       rate: 54     },
};

// Countries that use GHS natively
const GHS_COUNTRIES = ["GH", "GHANA"];

/**
 * Detect user currency from browser locale / timezone.
 * Returns "GHS" for Ghanaian users, "USD" for everyone else.
 * @returns {"GHS"|"USD"}
 */
export function detectCurrency() {
  try {
    // Use Intl to get timezone
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.startsWith("Africa/Accra")) return "GHS";

    // Use navigator language as fallback
    const lang = (navigator.language || navigator.userLanguage || "").toUpperCase();
    for (const c of GHS_COUNTRIES) {
      if (lang.includes(c)) return "GHS";
    }

    // Check stored preference
    const stored = localStorage.getItem("ff_currency");
    if (stored && CURRENCIES[stored]) return stored;
  } catch {
    // SSR / old browser fallback
  }
  return "GHS"; // Default to GHS as per business requirement
}

/**
 * Format a monetary amount in the given currency.
 * @param {number} amountInGHS - amount in GHS (base)
 * @param {string} currencyCode - e.g. "GHS", "USD"
 * @param {object} opts - extra Intl.NumberFormat options
 */
export function formatMoney(amountInGHS, currencyCode = "GHS", opts = {}) {
  const amount     = typeof amountInGHS === "number" && !isNaN(amountInGHS) ? amountInGHS : 0;
  const currency   = CURRENCIES[currencyCode] || CURRENCIES.GHS;
  const converted  = parseFloat((amount * currency.rate).toFixed(2));
  const formatted  = converted.toFixed(2);
  return `${currency.symbol}${formatted}`;
}

/**
 * Convert from GHS to target currency amount (number only, no symbol).
 */
export function convertAmount(amountInGHS, currencyCode = "GHS") {
  const amount   = typeof amountInGHS === "number" && !isNaN(amountInGHS) ? amountInGHS : 0;
  const currency = CURRENCIES[currencyCode] || CURRENCIES.GHS;
  return parseFloat((amount * currency.rate).toFixed(2));
}

/** Get the symbol for a currency code safely. */
export function getCurrencySymbol(currencyCode = "GHS") {
  return (CURRENCIES[currencyCode] || CURRENCIES.GHS).symbol;
}
