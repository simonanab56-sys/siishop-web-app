// pages/DealsPage.jsx
//
// Dedicated "Deals" page listing all discounted products. URL query keeps
// the selected sort tab in sync (`?sort=biggest|smallest|price`) so the
// view is sharable. The product fetch reuses productAPI.getAll() with the
// new first-class discount fields:
//   - `isOnSale=true` filters to products where the seller opted in.
//   - `sortBy=discountAmount` sorts by the Mongoose virtual computed from
//     (originalPrice - price). Virtuals serialize via toJSON so this works
//     end-to-end through productAPI.getAll().
//
// Three modes:
//   - "biggest": largest savings first (sortBy=discountAmount, sortOrder=desc)
//   - "smallest": smallest savings first (sortBy=discountAmount, sortOrder=asc)
//   - "price": lowest selling price first (sortBy=price, sortOrder=asc)

import { useState, useEffect, useRef, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { productAPI } from "../services/api";
import { useCurrency } from "../context/CurrencyContext";
import ProductCard from "../components/ProductCard";
import styles from "./DealsPage.module.css";

const PAGE_SIZE = 60;

// Match the SeeAllPage contract — accept a mutator function, a URLSearchParams
// instance, or a plain object, and keep window.location in sync via
// history.replaceState so refreshes preserve the active tab.
function useUrlState() {
  const read = useCallback(() => {
    try {
      return new URLSearchParams(window.location.search || "");
    } catch {
      return new URLSearchParams();
    }
  }, []);

  const [params, setParamsState] = useState(read);

  useEffect(() => {
    const onPop = () => setParamsState(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [read]);

  const setParams = useCallback((input) => {
    setParamsState((prev) => {
      const next = new URLSearchParams(prev);
      if (typeof input === "function") {
        input(next);
      } else if (input instanceof URLSearchParams) {
        for (const key of Array.from(next.keys())) next.delete(key);
        for (const [k, v] of input.entries()) next.set(k, v);
      } else if (input && typeof input === "object") {
        for (const [k, v] of Object.entries(input)) {
          if (v == null) next.delete(k);
          else next.set(k, String(v));
        }
      }
      const qs = next.toString();
      const url = qs
        ? `${window.location.pathname}?${qs}`
        : window.location.pathname;
      try {
        window.history.replaceState({}, document.title, url);
      } catch {
        /* noop — non-browser env */
      }
      return next;
    });
  }, []);

  return [params, setParams];
}

const SORT_TABS = [
  { value: "biggest",  label: "🔥 Biggest Discount" },
  { value: "smallest", label: "↘ Smallest Discount" },
  { value: "price",    label: "💰 Lowest Price" },
];

function validSort(s) {
  return ["biggest", "smallest", "price"].includes(s) ? s : "biggest";
}

export default function DealsPage({
  onAddToCart,
  onViewProduct,
  onRequireAuth,
  onNavigate,
}) {
  const { fmt } = useCurrency();
  const [searchParams, setSearchParams] = useUrlState();
  const sort = validSort(searchParams.get("sort"));

  const setSort = useCallback((next) => {
    setSearchParams((p) => {
      if (next === "biggest") p.delete("sort");
      else p.set("sort", next);
    });
  }, [setSearchParams]);

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Re-fetch when sort changes. Reuses productAPI.getAll with the new
  // first-class discount fields — no new endpoint.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = { isOnSale: "true", limit: String(PAGE_SIZE) };
    if (sort === "biggest") {
      params.sortBy = "discountAmount";
      params.sortOrder = "desc";
    } else if (sort === "smallest") {
      params.sortBy = "discountAmount";
      params.sortOrder = "asc";
    } else {
      params.sortBy = "price";
      params.sortOrder = "asc";
    }

    productAPI
      .getAll(params)
      .then((rows) => {
        if (cancelled || !mountedRef.current) return;
        setProducts(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        if (cancelled || !mountedRef.current) return;
        setError(err.message || "Failed to load deals");
        setProducts([]);
      })
      .finally(() => {
        if (cancelled || !mountedRef.current) return;
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [sort]);

  const goHome = () => onNavigate?.("home");

  return (
    <div className={`container page-enter ${styles.page}`}>
      <Helmet>
        <title>Today's Deals — SiiShop</title>
        <meta
          name="description"
          content="Browse all discounted products on SiiShop — biggest savings, smallest discounts, or lowest selling price."
        />
      </Helmet>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.crumbs}>
          <button type="button" onClick={goHome} className={styles.crumbLink}>
            ← Back to home
          </button>
        </div>
        <h1 className={styles.title}>🔥 Today's Deals</h1>
        <p className={styles.subtitle}>
          All discounted products on SiiShop. Find the biggest savings, the smallest discount, or the lowest price — your call.
        </p>
      </div>

      {/* Sort tabs */}
      <div className={styles.tabs} role="tablist" aria-label="Sort deals">
        {SORT_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={sort === tab.value}
            className={`${styles.tabBtn} ${sort === tab.value ? styles.tabBtnActive : ""}`}
            onClick={() => setSort(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Body */}
      {error ? (
        <div className={styles.errorBox}>
          ⚠️ {error}
          <br />
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={goHome}>
            Go home
          </button>
        </div>
      ) : loading ? (
        <div className="loading-center">
          <div className="spinner" />
          <p>Loading deals…</p>
        </div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🛍️</div>
          <h3>No discounted products right now.</h3>
          <p>Check back later — vendors mark new products on sale every day.</p>
        </div>
      ) : (
        <>
          <p className={styles.count}>{products.length} deal{products.length === 1 ? "" : "s"} found.</p>
          <div className={`grid-4 ${styles.productGrid}`}>
            {products.map((p) => (
              <ProductCard
                key={p._id}
                product={p}
                onAddToCart={onAddToCart}
                onClick={onViewProduct}
                onAuthRequired={onRequireAuth}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
