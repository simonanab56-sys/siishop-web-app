// ProductDetailPage.jsx — Product detail page with gallery
import { useState, useEffect, useCallback } from "react";
import { productAPI } from "../services/api";
import { useCurrency } from "../context/CurrencyContext";
import ProductGallery from "../components/ProductGallery";
import GalleryModal from "../components/GalleryModal";
import styles from "./ProductDetailPage.module.css";

export default function ProductDetailPage({ product: initialProduct, productId, onBack, onAddToCart }) {
  const { fmt } = useCurrency();
  const [product, setProduct] = useState(initialProduct);
  const [loading, setLoading] = useState(!initialProduct);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [modalInitialIndex, setModalInitialIndex] = useState(0);

  // Fetch product if not provided
  useEffect(() => {
    if (product || !productId) return;

    const fetchProduct = async () => {
      try {
        setLoading(true);
        const data = await productAPI.getById(productId);
        setProduct(data);
        setError(null);
      } catch (err) {
        setError(err.message || "Failed to load product");
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [product, productId]);

  // Get stock info
  const stock = typeof product?.stock === "number" ? product.stock : 0;
  const isOutOfStock = stock === 0;
  const isLowStock = stock > 0 && stock <= 5;

  // Get vendor name
  const vendorName = product?.vendorId?.storeName || product?.vendorId?.name || null;

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

  return (
    <div className={`container ${styles.page}`}>
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

          {product.category && (
            <span className={styles.category}>{product.category}</span>
          )}

          <h1 className={styles.name}>{product.name}</h1>

          <div className={styles.priceRow}>
            {/* Show promo price if product is from a promo */}
            {product._originalPrice ? (
              <>
                <span className={styles.price}>{fmt(product.price)}</span>
                <span className={styles.originalPrice}>{fmt(product._originalPrice)}</span>
                <span className={styles.discountBadge}>
                  -{Math.round(((product._originalPrice - product.price) / product._originalPrice) * 100)}%
                </span>
              </>
            ) : (
              <span className={styles.price}>{fmt(product.price)}</span>
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
    </div>
  );
}