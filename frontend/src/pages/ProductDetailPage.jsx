// ProductDetailPage.jsx — Product detail page with gallery and recommendations
import { useState, useEffect, useCallback, useRef } from "react";
import { productAPI, wishlistAPI } from "../services/api";
import WishlistButton from "../components/WishlistButton";
import { chatAPIConversations } from "../services/chatApi";
import { useCurrency } from "../context/CurrencyContext";
import ProductGallery from "../components/ProductGallery";
import GalleryModal from "../components/GalleryModal";
import ProductCard from "../components/ProductCard";
import SEO from "../components/SEO";
import { getImageUrl, PLACEHOLDER_IMAGE } from "../utils/image";
import { addRecentlyViewed } from "../utils/recentlyViewed";
import { discountInfo } from "../utils/pricing";
import styles from "./ProductDetailPage.module.css";

export default function ProductDetailPage({ product: initialProduct, productId, onBack, onAddToCart, onNavigate, onRequireAuth }) {
  const { fmt } = useCurrency();
  const [product, setProduct] = useState(initialProduct);
  const [loading, setLoading] = useState(!initialProduct);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [modalInitialIndex, setModalInitialIndex] = useState(0);

  // Sync product when initialProduct changes (e.g., when clicking recommended product)
  useEffect(() => {
    if (initialProduct) {
      setProduct(initialProduct);
      setLoading(false);
    }
  }, [initialProduct?._id]);
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch product if not provided
  useEffect(() => {
    // If we already have product, don't fetch
    if (product) return;
    // If no productId, can't fetch
    if (!productId) return;

    const fetchProduct = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await productAPI.getById(productId);
        if (mountedRef.current) {
          setProduct(data);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err.message || "Failed to load product");
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    fetchProduct();
  }, [productId]); // Only depend on productId, not product

  // Track product views and add to recently viewed
  useEffect(() => {
    if (!product?._id) return;

    // Add to recently viewed
    addRecentlyViewed(product);

    // Increment view count (fire and forget, no need to wait)
    productAPI.incrementView(product._id).catch(() => {});
  }, [product?._id]);

  // Fetch recommendations based on product category
  useEffect(() => {
    if (!product?.category) return;

    const fetchRecommendations = async () => {
      try {
        setRecommendationsLoading(true);
        // Get products from same category, excluding current product
        const data = await productAPI.getAll({ category: product.category, limit: 10 });
        const filtered = (data || []).filter(p => p._id !== product._id);
        setRecommendations(filtered.slice(0, 6));
      } catch (err) {
        console.error("Failed to fetch recommendations:", err);
      } finally {
        setRecommendationsLoading(false);
      }
    };

    fetchRecommendations();
  }, [product?.category, product?._id]);

  // Get stock info
  const stock = typeof product?.stock === "number" ? product.stock : 0;
  const isOutOfStock = stock === 0;
  const isLowStock = stock > 0 && stock <= 5;

  // Get vendor name
  const vendorName = product?.vendorId?.storeName || product?.vendorId?.name || null;

  // Discount view (handles BOTH schema originalPrice AND legacy _originalPrice)
  const d = discountInfo(product);

  // Check for video
  const hasVideo = product?.videoUrl && product.videoUrl.length > 0;

  // Handle quantity change
  const decreaseQty = useCallback(() => {
    setQuantity(prev => Math.max(1, prev - 1));
  }, []);

  const increaseQty = useCallback(() => {
    setQuantity(prev => Math.min(stock, prev + 1));
  }, [stock]);

  // Handle add to cart
  const handleAddToCart = useCallback(() => {
    if (isOutOfStock) return;

    const productWithQty = { ...product, quantity };
    onAddToCart?.(productWithQty);
  }, [product, quantity, isOutOfStock, onAddToCart]);

  // Open fullscreen modal
  const handleOpenFullscreen = useCallback((initialIndex) => {
    setModalInitialIndex(initialIndex);
    setShowModal(true);
  }, []);

  // Close modal
  const handleCloseModal = useCallback(() => {
    setShowModal(false);
  }, []);

  // Handle message vendor - require authentication
  const handleMessageVendor = useCallback(async () => {
    if (!onRequireAuth) {
      // Fallback: require auth directly
      onRequireAuth?.();
      return;
    }

    // Try to start chat - backend will return 401 if not logged in
    try {
      const res = await chatAPIConversations.create({
        participantId: product.vendorId?._id || product.vendorId,
        productId: product._id,
      });
      if (res.data.success) {
        onNavigate?.("chat");
      }
    } catch (err) {
      // If unauthorized or any error, prompt login
      if (err.response?.status === 401 || err.response?.status === 403 || err.message?.includes("authorized")) {
        onRequireAuth?.();
      } else {
        console.error("Failed to start chat:", err);
      }
    }
  }, [product, onNavigate, onRequireAuth]);

  // Loading state
  if (loading) {
    return (
      <div className={`container ${styles.page}`}>
        <div className={styles.loading}>
          <div className={styles.loadingSkeleton} />
          <div className="spinner" />
          <p>Loading product...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !product) {
    return (
      <div className={`container ${styles.page}`}>
        <div className={styles.error}>
          <div className={styles.errorIcon}>⚠️</div>
          <p className={styles.errorMessage}>{error || "Product not found"}</p>
          <button className="btn btn-primary" onClick={onBack}>
            Back to Shop
          </button>
        </div>
      </div>
    );
  }

  // Get product image for SEO
  const productImage = product?.images?.[0] || product?.image || "https://siishops.com/og-image.jpg";

  // Build breadcrumbs for product page
  const breadcrumbs = [
    { name: "Home", url: "https://siishops.com/" },
    { name: product?.category || "Products", url: `https://siishops.com/categories?category=${encodeURIComponent(product?.category || "")}` },
    { name: product?.name, url: `https://siishops.com/product/${product?._id}` },
  ];

  return (
    <div className={`container ${styles.page}`}>
      <SEO
        title={`${product?.name} | ${vendorName || "SiiShop"}`}
        description={`Buy ${product?.name} from ${vendorName || "SiiShop"} on SiiShop Ghana. Secure payments, trusted vendors, and convenient delivery. Price: GHS ${product?.price}.`}
        keywords={`${product?.name}, ${product?.category}, buy online, SiiShop Ghana, ${vendorName || ""}`}
        image={productImage}
        url={`https://siishops.com/product/${product?._id}`}
        type="product"
        product={{
          name: product?.name,
          description: product?.description,
          images: product?.images,
          price: product?.price,
          stock: product?.stock,
          vendorName: product?.vendorId?.storeName,
          vendorId: product?.vendorId,
        }}
        breadcrumbs={breadcrumbs}
      />
      {/* Back button */}
      <button className={styles.backBtn} onClick={onBack}>
        ← Back
      </button>

      {/* Content */}
      <div className={styles.content}>
        {/* Gallery */}
        <div className={styles.gallerySection}>
          <ProductGallery
            product={product}
            onOpenFullscreen={handleOpenFullscreen}
          />
        </div>

        {/* Details */}
        <div className={styles.detailsSection}>
          {vendorName && (
            <p className={styles.vendor}>🏪 {vendorName}</p>
          )}

          {/* Display vendor location */}
          {(product.vendorLocation?.region || product.vendorLocation?.city) && (
            <p className={styles.vendor} style={{ fontSize: '13px', color: '#666' }}>
              📍 Sold from: {product.vendorLocation.city}, {product.vendorLocation.region}
            </p>
          )}

          {product.category && (
            <span className={styles.category}>{product.category}</span>
          )}

          <h1 className={styles.name}>{product.name}</h1>

          <div className={styles.wishlistRow}>
            <WishlistButton
              productId={product._id}
              size="large"
              onAuthRequired={onRequireAuth}
            />
          </div>

          <div className={styles.priceRow}>
            <span className={styles.price}>{fmt(product.price)}</span>
            {d.hasDiscount && (
              <>
                <span className={styles.originalPrice}>{fmt(d.originalPrice)}</span>
                <span className={styles.discountBadge} title={`Save ${fmt(d.saved)}`}>
                  -{d.percent}%
                </span>
                <span className={styles.savingBadge} title={`Save ${fmt(d.saved)}`}>
                  Save {fmt(d.saved)}
                </span>
              </>
            )}
          </div>

          <div className={styles.stock}>
            {isOutOfStock ? (
              <span className={styles.stockOut}>✕ Out of Stock</span>
            ) : isLowStock ? (
              <span className={styles.stockLow}>⚠ Only {stock} left</span>
            ) : (
              <span className={styles.stockAvailable}>✓ In Stock ({stock} available)</span>
            )}
          </div>

          {product.description && (
            <p className={styles.description}>{product.description}</p>
          )}

          {/* Add to cart */}
          <div className={styles.cartSection}>
            <div className={styles.quantityControl}>
              <button
                className={styles.qtyBtn}
                onClick={decreaseQty}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className={styles.qtyValue}>{quantity}</span>
              <button
                className={styles.qtyBtn}
                onClick={increaseQty}
                disabled={quantity >= stock}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>

            <button
              className={`btn btn-primary ${styles.addToCartBtn}`}
              onClick={handleAddToCart}
              disabled={isOutOfStock}
            >
              {isOutOfStock ? "Out of Stock" : "Add to Cart"}
            </button>

            <button
              className={`btn btn-outline ${styles.addToCartBtn}`}
              onClick={handleMessageVendor}
            >
              💬 Ask Vendor
            </button>
          </div>
        </div>
      </div>

      {/* Fullscreen modal */}
      {showModal && (
        <GalleryModal
          product={product}
          initialIndex={modalInitialIndex}
          onClose={handleCloseModal}
        />
      )}

      {/* Recommendations - Similar Products */}
      {recommendations.length > 0 && (
        <div className={styles.recommendations}>
          <h3 className={styles.sectionTitle}>You May Also Like</h3>
          <p className={styles.sectionSubtitle}>Similar products from the same category</p>
          <div className={styles.recommendationsGrid}>
            {recommendations.map((recProduct) => (
              <ProductCard
                key={recProduct._id}
                product={recProduct}
                onAddToCart={onAddToCart}
                onClick={(p) => onNavigate?.("product", p)}
                onAuthRequired={onRequireAuth}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}