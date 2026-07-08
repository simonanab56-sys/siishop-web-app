// pages/SeeAllPage.jsx
//
// Dedicated "See All" page for a single HomepageSection. Reads `?section=<id>`
// from the URL, fetches the section config + paginated products, and renders a
// search/sort/pagination bar over a grid of ProductCards. URL query state is
// kept in sync via history.replaceState so the view is sharable.

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { productAPI, homepageSectionAPI } from "../services/api";
import { useCurrency } from "../context/CurrencyContext";
import { useDebounce } from "../hooks/useDebounce";
import ProductCard from "../components/ProductCard";
import styles from "./SeeAllPage.module.css";

const PAGE_SIZE = 20;
const SORT_OPTIONS = [
  { value: "newest",  label: "Newest" },
  { value: "popular", label: "Most popular" },
  { value: "price-asc",  label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
];

// Tiny hook that mirrors react-router-dom's useSearchParams for our
// in-memory router. Reads ?section=&q=&sort=&page=&category= from window.location
// and pushes updates via history.replaceState so the URL bar stays in sync
// without triggering a navigation.
//
// Like react-router-dom, the setter accepts either:
//   - a URLSearchParams instance (replace wholesale), or
//   - a mutator function (prevParams => void) for partial updates.
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
        // Wholesale replace — copy keys from the provided instance.
        // (URLSearchParams.copyFrom doesn't exist on the spec, so iterate.)
        for (const key of Array.from(next.keys())) next.delete(key);
        for (const [k, v] of input.entries()) next.set(k, v);
      } else if (input && typeof input === "object") {
        // Plain object: { q: "x", page: "2" }
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

export default function SeeAllPage({
  onAddToCart,
  onViewProduct,
  onRequireAuth,
  onNavigate,
}) {
  const { fmt } = useCurrency();
  const [searchParams, setSearchParams] = useUrlState();
  const sectionId = searchParams.get("section") || "";

  const [section, setSection] = useState(null);
  const [sectionLoading, setSectionLoading] = useState(true);
  const [sectionError, setSectionError] = useState(null);

  // URL-driven controls
  const initialQuery = searchParams.get("q") || "";
  const initialSort = searchParams.get("sort") || "newest";
  const initialPage = Math.max(1, Number(searchParams.get("page")) || 1);
  const initialCategory = searchParams.get("category") || "";

  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(initialPage);
  const [category, setCategory] = useState(initialCategory);

  const debouncedQuery = useDebounce(query, 250);

  // Section config fetch
  useEffect(() => {
    if (!sectionId) {
      setSectionLoading(false);
      setSectionError("Missing section id in URL");
      return;
    }
    let cancelled = false;
    setSectionLoading(true);
    setSectionError(null);
    homepageSectionAPI
      .getOne(sectionId)
      .then((data) => {
        if (cancelled) return;
        setSection(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setSectionError(err.message || "Failed to load section");
      })
      .finally(() => {
        if (cancelled) return;
        setSectionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sectionId]);

  // Derived: build the product query that mirrors what the resolver does.
  const productParams = useBuildParams(section, {
    search: debouncedQuery,
    sort,
    page,
  });

  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch products when section config or filters change.
  useEffect(() => {
    if (!section || !productParams) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    productAPI
      .getAll(productParams)
      .then((rows) => {
        if (cancelled || !mountedRef.current) return;
        const list = Array.isArray(rows) ? rows : [];
        setProducts(list);
        setTotal(list.length);
      })
      .catch((err) => {
        if (cancelled || !mountedRef.current) return;
        setError(err.message || "Failed to load products");
        setProducts([]);
        setTotal(0);
      })
      .finally(() => {
        if (cancelled || !mountedRef.current) return;
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [section?._id, productParams]);

  // Push state to URL when filters change.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("section", sectionId);
    if (debouncedQuery) next.set("q", debouncedQuery); else next.delete("q");
    next.set("sort", sort);
    next.set("page", String(page));
    if (category) next.set("category", category); else next.delete("category");
    setSearchParams(next, { replace: true });
    // We deliberately don't depend on `searchParams` itself — would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, debouncedQuery, sort, page, category]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safeProducts = Array.isArray(products) ? products : [];

  const categories = useSectionCategories(section);

  const goHome = () => {
    if (onNavigate) onNavigate("home");
  };

  return (
    <div className={`container page-enter ${styles.page}`}>
      <Helmet>
        <title>{section ? `${section.title} — SiiShop` : "See all — SiiShop"}</title>
        <meta
          name="description"
          content={section?.subtitle || `Browse all products in ${section?.title || "this section"}.`}
        />
      </Helmet>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.crumbs}>
          <button type="button" onClick={goHome} className={styles.crumbLink}>
            ← Back to home
          </button>
        </div>
        {sectionLoading ? (
          <h1 className={styles.title}>Loading…</h1>
        ) : sectionError ? (
          <h1 className={styles.title}>Section unavailable</h1>
        ) : section ? (
          <>
            <h1 className={styles.title}>
              {section.icon ? <span className={styles.icon}>{section.icon}</span> : null}
              {section.title}
            </h1>
            {section.subtitle && <p className={styles.subtitle}>{section.subtitle}</p>}
          </>
        ) : null}
      </div>

      {/* Controls */}
      {section && (
        <div className={styles.controls}>
          <input
            type="text"
            placeholder="Search within this section…"
            className={styles.searchInput}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          />
          {categories.length > 1 && (
            <select
              className={styles.select}
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            >
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select
            className={styles.select}
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
          >
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}

      {/* Body */}
      {sectionError ? (
        <div className={styles.errorBox}>
          ⚠️ {sectionError}
          <br />
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={goHome}>Go home</button>
        </div>
      ) : loading ? (
        <div className="loading-center">
          <div className="spinner" />
          <p>Loading products…</p>
        </div>
      ) : safeProducts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔎</div>
          <h3>No products match these filters.</h3>
          <p>Try clearing the search or picking a different sort.</p>
          {(query || category || sort !== "newest") && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 14 }}
              onClick={() => { setQuery(""); setCategory(""); setSort("newest"); setPage(1); }}
            >
              Reset filters
            </button>
          )}
        </div>
      ) : (
        <>
          <p className={styles.resultCount}>
            {safeProducts.length} product{safeProducts.length !== 1 ? "s" : ""}
            {query && ` for "${query}"`}
            {category && ` in ${category}`}
          </p>
          <div className={styles.grid}>
            {safeProducts.map((product) =>
              product?._id ? (
                <ProductCard
                  key={product._id}
                  product={product}
                  onAddToCart={onAddToCart}
                  onClick={onViewProduct}
                  onAuthRequired={onRequireAuth}
                />
              ) : null
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.pager}>
              <button
                type="button"
                className={styles.pagerBtn}
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Previous
              </button>
              <span className={styles.pagerLabel}>Page {page} of {totalPages}</span>
              <button
                type="button"
                className={styles.pagerBtn}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Hook: build the product query that mirrors the resolver ─────────────── */
function useBuildParams(section, { search, sort, page }) {
  const build = useCallback(() => {
    if (!section) return null;
    const params = {
      limit: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    };
    if (search) params.search = search;

    const src = section.source || {};
    const skip = String(src.type) === "manual" || String(src.type) === "vendor";
    // For manual/vendor we fetch via ids (the API filter accepts ids[]).
    if (String(src.type) === "manual") {
      const ids = (src.manualProductIds || []).filter(Boolean);
      if (ids.length === 0) return { ...params, limit: 0 };
      // No CSV-of-ids supported by the current list endpoint; we'll filter
      // client-side below by setting a search wildcard + client filter.
      params._manualIds = ids.map(String);
    }
    if (String(src.type) === "vendor") {
      if ((src.vendorIds || []).length > 0) {
        params.vendorIds = (src.vendorIds || []).filter(Boolean).join(",");
      }
    }
    if (String(src.type) === "category") {
      const cats = (src.categories || []).filter(Boolean);
      if (cats.length > 0) {
        params.categories = cats.join(",");
      }
    }
    if (String(src.type) === "featured") {
      params.isFeatured = "true";
    }
    if (String(src.type) === "automatic") {
      switch (src.automaticType) {
        case "best_sellers":
        case "most_purchased":
          params.sortBy = "salesCount"; params.sortOrder = "desc"; break;
        case "new_arrivals":
        case "recently_added":
          params.sortBy = "createdAt"; params.sortOrder = "desc"; break;
        case "most_viewed":
          params.sortBy = "views"; params.sortOrder = "desc"; break;
        case "trending":
          params.sortBy = "views"; params.sortOrder = "desc"; break;
        case "discounted":
          params.isOnSale = "true"; params.sortBy = "createdAt"; params.sortOrder = "desc"; break;
        case "featured":
          params.isFeatured = "true"; params.sortBy = "createdAt"; params.sortOrder = "desc"; break;
        case "highest_rated":
          params.sortBy = "createdAt"; params.sortOrder = "desc"; break;
        default:
          params.sortBy = "createdAt"; params.sortOrder = "desc";
      }
    }

    // User sort overrides the auto sort unless manual.
    if (sort === "price-asc")  { params.sortBy = "price"; params.sortOrder = "asc"; }
    if (sort === "price-desc") { params.sortBy = "price"; params.sortOrder = "desc"; }
    if (sort === "popular")    { params.sortBy = "views"; params.sortOrder = "desc"; }
    // "newest" leaves default sortBy (createdAt desc).

    return params;
  }, [section?._id, section?.source?.type, section?.source?.automaticType,
      section?.source?.manualProductIds, section?.source?.vendorIds,
      section?.source?.categories, search, sort, page]);

  // Return a stable object per dependency set.
  const key = JSON.stringify(build());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memo = useMemo(build, [key]);
  return memo;
}

function useSectionCategories(section) {
  // For category-source sections, pre-populate the categories dropdown.
  if (!section) return [];
  const src = section.source || {};
  if (String(src.type) === "category" && Array.isArray(src.categories)) {
    return src.categories.filter(Boolean);
  }
  return [];
}