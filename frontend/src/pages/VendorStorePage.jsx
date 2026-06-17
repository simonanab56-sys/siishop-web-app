// pages/VendorStorePage.jsx - Public vendor store page
import { useState, useEffect, useCallback } from "react";
import { useCurrency } from "../context/CurrencyContext";
import { vendorAPI } from "../services/api";
import { getImageUrl, PLACEHOLDER_IMAGE } from "../utils/image";
import ProductCard from "../components/ProductCard";
import SEO from "../components/SEO";
import styles from "./VendorStorePage.module.css";
import logger from "../utils/logger";

export default function VendorStorePage({ onAddToCart, onNavigate, onRequireAuth, vendorSlug, onVendorLoaded }) {
  // Get slug from props or sessionStorage (for state-based routing)
  const slug = vendorSlug || sessionStorage.getItem("vendorStoreSlug");
  const { fmt } = useCurrency();

  logger.log("=== VENDOR STORE PAGE DEBUG ===");
  logger.log("vendorSlug prop:", vendorSlug);
  logger.log("sessionStorage slug:", sessionStorage.getItem("vendorStoreSlug"));
  logger.log("Final slug used:", slug);
  logger.log("VendorStorePage props:", { onAddToCart: !!onAddToCart, onNavigate: !!onNavigate, onRequireAuth: !!onRequireAuth });

  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchProducts = useCallback(async (slugToFetch) => {
    if (!slugToFetch) {
      logger.log("ERROR: No slug provided to fetchProducts");
      return;
    }
    logger.log("=== FETCHING PRODUCTS ===");
    logger.log("1. Store slug:", slugToFetch);
    logger.log("2. Current products length BEFORE:", products.length);
    try {
      setProductsLoading(true);
      logger.log("3. Calling vendorAPI.getStoreProducts...");
      const data = await vendorAPI.getStoreProducts(slugToFetch, { limit: 20 });
      logger.log("4. API returned:", data?.length, "products");
      logger.log("5. Products:", data?.map(p => ({ id: p._id, name: p.name, vendor: p.vendorId?.storeName })));
      logger.log("6. Calling setProducts with", data?.length || 0, "items");
      setProducts(data || []);
      logger.log("7. setProducts called, state should now have", data?.length || 0, "products");
    } catch (err) {
      console.error("Failed to load products:", err);
    } finally {
      setProductsLoading(false);
      logger.log("8. productsLoading set to false");
    }
  }, []);

  useEffect(() => {
    if (!slug) return;

    logger.log("Store slug from useEffect:", slug);

    const fetchStore = async () => {
      try {
        setLoading(true);
        setError(null);
        logger.log("Fetching store for:", slug);
        const data = await vendorAPI.getStoreBySlug(slug);
        logger.log("Store data:", data);
        setStore(data.vendor);
        // Set vendor context for other pages
        if (onVendorLoaded && data.vendor?._id) {
          onVendorLoaded(slug, data.vendor._id);
        }
        // Fetch vendor products separately
        fetchProducts(slug);
      } catch (err) {
        console.error("Failed to load store:", err);
        setError(err.message || "Store not found");
      } finally {
        setLoading(false);
      }
    };

    fetchStore();
  }, [slug, fetchProducts]);

  const handleShare = async () => {
    const storeUrl = `${window.location.origin}/store/${slug}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: store?.storeName || "Vendor Store",
          text: `Check out ${store?.storeName} on SiiShop`,
          url: storeUrl,
        });
      } catch (err) {
        // User cancelled or error
        copyToClipboard(storeUrl);
      }
    } else {
      copyToClipboard(storeUrl);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const storeUrl = `${window.location.origin}/store/${slug}`;
  const storeLogo = store?.storeLogo ? getImageUrl(store.storeLogo) : null;

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading store...</div>
      </div>
    );
  }

  if (error || !store) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>
          {error || "Store not found"}
        </div>
      </div>
    );
  }

  // Build breadcrumbs for vendor store
  const breadcrumbs = [
    { name: "Home", url: "https://siishops.com/" },
    { name: "Vendors", url: "https://siishops.com/vendors" },
    { name: store.storeName, url: `https://siishops.com/store/${vendorSlug}` },
  ];

  return (
    <>
      <SEO
        title={`${store.storeName} Store | SiiShop Ghana`}
        description={store.storeDescription || `Shop electronics, accessories and more from ${store.storeName} on SiiShop Ghana. Verified vendor with ${store.stats?.productCount || 0} products.`}
        keywords={`${store.storeName}, vendor store, electronics Ghana, fashion Ghana, verified seller, SiiShop`}
        image={storeLogo || "https://siishops.com/og-image.jpg"}
        url={`https://siishops.com/store/${vendorSlug}`}
        type="website"
        vendor={{
          storeName: store.storeName,
          slug: vendorSlug,
          description: store.storeDescription,
          avatar: storeLogo,
        }}
        breadcrumbs={breadcrumbs}
      />
      <div className={styles.page}>
        {/* Store Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.logoSection}>
              {storeLogo ? (
                <img src={storeLogo} alt={store.storeName} className={styles.logo} />
              ) : (
                <div className={styles.logoPlaceholder}>🏪</div>
              )}
            </div>
            <div className={styles.info}>
              <h1 className={styles.storeName}>
                {store.storeName}
                {store.vendorStatus === "approved" && (
                  <span className={styles.verifiedBadge}>✓</span>
                )}
              </h1>
              {store.storeDescription && (
                <p className={styles.description}>{store.storeDescription}</p>
              )}
              {(store.location?.region || store.location?.city) && (
                <p className={styles.description} style={{ fontSize: '14px', color: '#666' }}>
                  📍 Store Location: {store.formattedLocation || `${store.location.city}, ${store.location.region}`}
                </p>
              )}
              <div className={styles.stats}>
                <span>📦 {store.stats?.productCount || 0} Products</span>
                <span>✅ {store.stats?.ordersCompleted || 0} Orders</span>
                {(store.location?.region || store.location?.city) && (
                  <span>📍 {store.location.city}, {store.location.region}</span>
                )}
              </div>
            </div>
          </div>

          {/* Share Section */}
          <div className={styles.shareSection}>
            <button className={styles.shareBtn} onClick={handleShare}>
              🔗 Share Store
            </button>
            <button
              className={styles.copyBtn}
              onClick={() => copyToClipboard(storeUrl)}
            >
              {copied ? "✓ Copied!" : "📋 Copy Link"}
            </button>
          </div>
        </div>

        {/* Products Grid */}
        <div className={styles.productsSection}>
          <h2 className={styles.sectionTitle}>Products ({products.length})</h2>
          <div style={{fontSize: '12px', color: '#666', marginBottom: '8px'}}>
            {products.map(p => p.vendorId?.storeName).filter(Boolean).slice(0,3).join(', ')}
          </div>
          {productsLoading ? (
            <div className={styles.loading}>Loading products...</div>
          ) : products.length === 0 ? (
            <div className={styles.noProducts}>
              No products available yet
            </div>
          ) : (
            <div className={styles.productsGrid}>
              {products.map((product) => (
                <ProductCard
                  key={product._id}
                  product={product}
                  onAddToCart={(p) => {
                    logger.log("Adding to cart:", p?.name, p?._id);
                    onAddToCart?.(p);
                  }}
                  onClick={(p) => {
                    logger.log("Navigating to product:", p?.name, p?._id);
                    onNavigate?.("product", p);
                  }}
                  onAuthRequired={onRequireAuth}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}