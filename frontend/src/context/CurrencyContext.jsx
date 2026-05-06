// context/CurrencyContext.jsx
// Provides { currency, setCurrency, fmt, symbol } to the whole app.
import { createContext, useContext, useState, useCallback } from "react";
import { detectCurrency, formatMoney, getCurrencySymbol, CURRENCIES } from "../utils/currency";

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(() => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("ff_currency") : null;
    return (stored && CURRENCIES[stored]) ? stored : detectCurrency();
  });

  const setCurrency = useCallback((code) => {
    if (!CURRENCIES[code]) return;
    setCurrencyState(code);
    try { localStorage.setItem("ff_currency", code); } catch {}
  }, []);

  /** Format a GHS amount in the current currency */
  const fmt    = useCallback((ghsAmount) => formatMoney(ghsAmount, currency), [currency]);
  const symbol = getCurrencySymbol(currency);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, fmt, symbol, currencies: CURRENCIES }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used inside <CurrencyProvider>");
  return ctx;
}
