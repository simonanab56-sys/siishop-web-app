// pages/HomePage.jsx — v8: Dynamic homepage sections (Task 7)
//
// Behaviour:
//   • When the user is SEARCHING or has picked a category, the page renders
//     a single filtered grid (the legacy behaviour). This preserves SEO
//     landing pages and search results UX.
//   • Otherwise, the page renders the admin-curated list of HomepageSection
//     blocks in displayOrder. Each block self-fetches its products in
//     parallel via SectionRenderer (skeleton → populated).
//
// The previous direct <PromoSection> mount and the double `promoAPI.getActive()`
// fetch are GONE — admin creates a "Promos" automatic section instead.
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { productAPI, homepageSectionAPI } from "../services/api";
import { useCurrency } from "../context/CurrencyContext";
import ProductCard     from "../components/ProductCard";
import SectionRenderer from "../components/SectionRenderer";
import { generateCategorySEO, extractCategoryFromURL, updateCategoryURL } from "../utils/seo";
import styles          from "./HomePage.module.css";

const DEBOUNCE_MS = 100;

export default function HomePage({
  onAddToCart,
  onViewProduct,
  globalSearchQuery,
  onClearGlobalSearch,
  onRequireAuth,
  vendorContext,
  onClearVendorContext,
  onNavigate,
}) {
  const { fmt } = useCurrency();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(["All"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchInput, setSearchInput] = useState("");
  const [sections, setSections] = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const mountedRef = useRef(true);
  const isFirstRender = useRef(true);
  const prevGlobalSearchRef = useRef(globalSearchQuery);

  // ── Filtered-grid fetch (search / category / vendor context) ────────────
  const fetchProducts = useCallback(async (q, cat) => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (q) params.search = q;
      if (cat && cat !== "All") params.category = cat;
      if (vendorContext?.vendorId) params.vendorId = vendorContext.vendorId;
      const data = await productAPI.getAll(params);
      if (mountedRef.current) setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || "Failed to load products");
        setProducts([]);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [vendorContext]);

  // ── Init category from URL ───────────────────────────────────────────────
  useEffect(() => {
    const categoryFromURL = extractCategoryFromURL();
    if (categoryFromURL) setActiveCategory(categoryFromURL);
  }, []);

  // ── Fetch category list ──────────────────────────────────────────────────
  useEffect(() => {
    productAPI
      .getCategories()
      .then((cats) => {
        if (mountedRef.current) setCategories(["All", ...(Array.isArray(cats) ? cats : [])]);
      })
      .catch(() => {
        if (mountedRef.current) setCategories(["All"]);
      });
  }, []);

  // ── Fetch homepage section configs ──────────────────────────────────────
  useEffect(() => {
    setSectionsLoading(true);
    homepageSectionAPI
      .getActive()
      .then((data) => {
        if (mountedRef.current) setSections(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (mountedRef.current) setSections([]);
      })
      .finally(() => {
        if (mountedRef.current) setSectionsLoading(false);
      });
  }, []);

  // ── Initial filtered-grid fetch on mount ─────────────────────────────────
  useEffect(() => {
    fetchProducts("", "All");
  }, [fetchProducts]);

  // ── Sync global search query into local state ────────────────────────────
  useEffect(() => {
    const prevQuery = prevGlobalSearchRef.current;
    const currentQuery = globalSearchQuery ? String(globalSearchQuery).trim() : "";
    if (globalSearchQuery !== prevQuery) {
      if (currentQuery) {
        setSearchInput(currentQuery);
        setSearch(currentQuery);
        fetchProducts(currentQuery, activeCategory);
      } else if (prevQuery && !currentQuery) {
        setSearchInput("");
        setSearch("");
        fetchProducts("", activeCategory);
      }
      prevGlobalSearchRef.current = globalSearchQuery;
    }
  }, [globalSearchQuery, activeCategory, fetchProducts]);

  // ── Debounced local search / category ────────────────────────────────────
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      setSearch(searchInput);
      fetchProducts(searchInput, activeCategory);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput, activeCategory, fetchProducts]);

  // ── Cleanup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function handleCategory(cat) {
    setActiveCategory(cat);
    updateCategoryURL(cat);
    fetchProducts(search, cat);
  }

  // ── The legacy "filtered grid" mode is active when the user is searching
  //    or has picked a non-"All" category. Otherwise we render the dynamic
  //    homepage sections.
  const isFilterMode = !!search?.trim() || activeCategory !== "All";

  const safeProducts = Array.isArray(products) ? products : [];
  const seoData = generateCategorySEO(activeCategory !== "All" ? activeCategory : null);

  return (
    <>
      {/* Vendor Context Banner */}
      {vendorContext && (
        <div
          style={{
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <span>🛒 Showing products from vendor store</span>
          <button
            onClick={onClearVendorContext}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "1px solid rgba(255,255,255,0.4)",
              color: "white",
              padding: "6px 14px",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "600",
            }}
          >
            ✕ Clear Filter
          </button>
        </div>
      )}

      {/* SEO */}
      <Helmet>
        <title>{seoData.title}</title>
        <meta name="description" content={seoData.description} />
        <meta name="keywords" content={seoData.keywords} />
        <link rel="canonical" href={seoData.canonical} />
        <meta property="og:title" content={seoData.ogTitle} />
        <meta property="og:description" content={seoData.ogDescription} />
        <meta property="og:type" content={seoData.ogType} />
        <meta property="og:url" content={seoData.ogUrl} />
        <meta property="og:site_name" content="SiiShop" />
        <meta name="twitter:card" content={seoData.twitterCard} />
        <meta name="twitter:title" content={seoData.twitterTitle} />
        <meta name="twitter:description" content={seoData.twitterDescription} />
        <script type="application/ld+json">{JSON.stringify(seoData.structuredData)}</script>
      </Helmet>

      <div className={`container page-enter ${styles.page}`}>
        {/* Hero */}
        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>
            Africa's Marketplace
            <br />
            <span className={styles.heroHighlight}>Shop Everything</span>
          </h1>
          <p className={styles.heroSub}>
            Thousands of products from verified vendors — delivered to your door.
          </p>

          <div className={styles.searchBar}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              type="text"
              placeholder="Search products, brands, categories…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={styles.searchInput}
            />
            {searchInput && (
              <button
                className={styles.clearBtn}
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setProducts([]);
                  fetchProducts("", activeCategory);
                  if (onClearGlobalSearch) onClearGlobalSearch();
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Category pills */}
        {categories.length > 1 && (
          <div className={styles.filterBar}>
            {/* ✅ Discounted pill — surfaces first-class discounts via the Deals page. */}
            <button
              type="button"
              className={`${styles.filterPill} ${styles.discountPill}`}
              onClick={() => onNavigate?.("deals")}
              title="See all discounted products"
            >
              🔥 Discounted
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                className={`${styles.filterPill} ${activeCategory === cat ? styles.filterActive : ""}`}
                onClick={() => handleCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* ── Body ────────────────────────────────────────────────────── */}
        {isFilterMode ? (
          // ── Legacy filtered grid (search results / category page) ──────
          <FilteredGrid
            loading={loading}
            error={error}
            products={safeProducts}
            search={search}
            activeCategory={activeCategory}
            onRetry={() => fetchProducts(search, activeCategory)}
            onClearSearch={() => {
              setSearchInput("");
              setSearch("");
              setProducts([]);
              fetchProducts("", activeCategory);
              if (onClearGlobalSearch) onClearGlobalSearch();
            }}
            onAddToCart={onAddToCart}
            onViewProduct={onViewProduct}
            onRequireAuth={onRequireAuth}
          />
        ) : sectionsLoading ? (
          <div className="loading-center">
            <div className="spinner" />
            <p>Loading homepage…</p>
          </div>
        ) : sections.length === 0 ? (
          // ── Empty state: no sections configured. Show a fallback grid of
          //    latest products so the page is never completely blank. ──
          <FallbackGrid
            onAddToCart={onAddToCart}
            onViewProduct={onViewProduct}
            onRequireAuth={onRequireAuth}
          />
        ) : (
          // ── Dynamic sections loop ────────────────────────────────────
          <div className={styles.sectionsWrap}>
            {sections.map((section) => (
              <SectionRenderer
                key={section._id}
                section={section}
                onAddToCart={onAddToCart}
                onViewProduct={onViewProduct}
                onRequireAuth={onRequireAuth}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ── Sub-components ────────────────────────────────────────────────────── */

function FilteredGrid({
  loading,
  error,
  products,
  search,
  activeCategory,
  onRetry,
  onClearSearch,
  onAddToCart,
  onViewProduct,
  onRequireAuth,
}) {
  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <p>Loading products…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className={styles.errorBox}>
        ⚠️ {error}
        <br />
        <small>Make sure the backend is running.</small>
        <br />
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  if (products.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">{search ? "🔎" : "🛍️"}</div>
        <h3>{search ? `No results for "${search}"` : "No products yet"}</h3>
        <p>
          {search
            ? "Try a different search."
            : "Check back later or ask a vendor to list products."}
        </p>
        {search && (
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 14 }} onClick={onClearSearch}>
            Clear Search
          </button>
        )}
      </div>
    );
  }
  return (
    <>
      <p className={styles.resultCount}>
        {products.length} product{products.length !== 1 ? "s" : ""}
        {search && ` for "${search}"`}
        {activeCategory !== "All" && ` in ${activeCategory}`}
      </p>
      <div className="grid-4">
        {products.map((product) =>
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
    </>
  );
}

function FallbackGrid({ onAddToCart, onViewProduct, onRequireAuth }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    productAPI
      .getRecent(12)
      .then((data) => {
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <p>Loading latest products…</p>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className={styles.emptySections}>
        <div className="empty-state">
          <div className="empty-icon">🧩</div>
          <h3>No homepage sections configured yet</h3>
          <p>Admin can create dynamic sections from the Admin Dashboard → 🧩 Sections tab.</p>
        </div>
      </div>
    );
  }
  return (
    <>
      <p className={styles.resultCount}>Latest products</p>
      <div className="grid-4">
        {rows.map((product) =>
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
    </>
  );
}