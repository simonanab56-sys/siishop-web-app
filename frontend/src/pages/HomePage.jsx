// pages/HomePage.jsx — v4: SEO generation, category URL routing, structured data
import { useState, useEffect, useCallback, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { productAPI } from "../services/api";
import { useCurrency } from "../context/CurrencyContext";
import ProductCard   from "../components/ProductCard";
import PromoSection  from "../components/PromoSection";
import { generateCategorySEO, extractCategoryFromURL, updateCategoryURL } from "../utils/seo";
import styles        from "./HomePage.module.css";

const DEBOUNCE_MS = 350;

export default function HomePage({ onAddToCart }) {
  const { fmt } = useCurrency();
  const [products,       setProducts]       = useState([]);
  const [categories,     setCategories]     = useState(["All"]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [search,         setSearch]         = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchInput,    setSearchInput]    = useState("");
  const isFirstRender = useRef(true);

  // ── Initialize category from URL on mount ──────────────────────────────────
  useEffect(() => {
    const categoryFromURL = extractCategoryFromURL();
    if (categoryFromURL) {
      setActiveCategory(categoryFromURL);
    }
  }, []);

  useEffect(() => {
    productAPI.getCategories()
      .then(cats => setCategories(["All", ...(Array.isArray(cats) ? cats : [])]))
      .catch(() => setCategories(["All"]));
  }, []);

  const fetchProducts = useCallback(async (q, cat) => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (q)               params.search   = q;
      if (cat && cat !== "All") params.category = cat;
      const data = await productAPI.getAll(params);
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load products");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProducts("", "All"); }, [fetchProducts]);

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const t = setTimeout(() => { setSearch(searchInput); fetchProducts(searchInput, activeCategory); }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput, activeCategory, fetchProducts]);

  function handleCategory(cat) {
    setActiveCategory(cat);
    // ── Update URL when category changes ──────────────────────────────────
    updateCategoryURL(cat);
    fetchProducts(search, cat);
  }

  const safeProducts = Array.isArray(products) ? products : [];

  // ── Generate SEO data for current category ────────────────────────────────
  const seoData = generateCategorySEO(activeCategory !== "All" ? activeCategory : null);

  return (
    <>
      {/* ── Helmet: Dynamic SEO tags ─────────────────────────────────────── */}
      <Helmet>
        <title>{seoData.title}</title>
        <meta name="description" content={seoData.description} />
        <meta name="keywords" content={seoData.keywords} />
        <link rel="canonical" href={seoData.canonical} />
        
        {/* Open Graph tags */}
        <meta property="og:title" content={seoData.ogTitle} />
        <meta property="og:description" content={seoData.ogDescription} />
        <meta property="og:type" content={seoData.ogType} />
        <meta property="og:url" content={seoData.ogUrl} />
        <meta property="og:site_name" content="SiiShop" />
        
        {/* Twitter Card tags */}
        <meta name="twitter:card" content={seoData.twitterCard} />
        <meta name="twitter:title" content={seoData.twitterTitle} />
        <meta name="twitter:description" content={seoData.twitterDescription} />
        
        {/* Structured Data (JSON-LD) */}
        <script type="application/ld+json">
          {JSON.stringify(seoData.structuredData)}
        </script>
      </Helmet>

      <div className={`container page-enter ${styles.page}`}>
        {/* Hero */}
        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>
            Africa's Marketplace<br />
            <span className={styles.heroHighlight}>Shop Everything</span>
          </h1>
          <p className={styles.heroSub}>Thousands of products from verified vendors — delivered to your door.</p>

          <div className={styles.searchBar}>
            <span className={styles.searchIcon}>🔍</span>
            <input type="text" placeholder="Search products, brands, categories…"
              value={searchInput} onChange={e => setSearchInput(e.target.value)}
              className={styles.searchInput} />
            {searchInput && (
              <button className={styles.clearBtn}
                onClick={() => { setSearchInput(""); setSearch(""); fetchProducts("", activeCategory); }}>✕</button>
            )}
          </div>
        </div>

        {/* PART 10: Flash Deals promo section */}
        <PromoSection onAddToCart={onAddToCart} />

        {/* Category pills */}
        {categories.length > 1 && (
          <div className={styles.filterBar}>
            {categories.map(cat => (
              <button key={cat}
                className={`${styles.filterPill} ${activeCategory === cat ? styles.filterActive : ""}`}
                onClick={() => handleCategory(cat)}>
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        {loading ? (
          <div className="loading-center"><div className="spinner" /><p>Loading products…</p></div>
        ) : error ? (
          <div className={styles.errorBox}>
            ⚠️ {error}<br /><small>Make sure the backend is running.</small>
            <br />
            <button className="btn btn-secondary btn-sm" style={{marginTop:10}}
              onClick={() => fetchProducts(search, activeCategory)}>Retry</button>
          </div>
        ) : safeProducts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">{search ? "🔎" : "🛍️"}</div>
            <h3>{search ? `No results for "${search}"` : "No products yet"}</h3>
            <p>{search ? "Try a different search." : "Check back later or ask a vendor to list products."}</p>
            {search && <button className="btn btn-secondary btn-sm" style={{marginTop:14}} onClick={() => { setSearchInput(""); setSearch(""); fetchProducts("", activeCategory); }}>Clear Search</button>}
          </div>
        ) : (
          <>
            <p className={styles.resultCount}>
              {safeProducts.length} product{safeProducts.length !== 1 ? "s" : ""}
              {search && ` for "${search}"`}
              {activeCategory !== "All" && ` in ${activeCategory}`}
            </p>
            <div className="grid-4">
              {safeProducts.map(product => product?._id && (
                <ProductCard key={product._id} product={product} onAddToCart={onAddToCart} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
