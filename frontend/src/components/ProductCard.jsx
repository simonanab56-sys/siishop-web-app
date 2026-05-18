// components/ProductCard.jsx — v4: multi-image support, hover effect
import { useState } from "react";
import { useCurrency } from "../context/CurrencyContext";
import styles from "./ProductCard.module.css";
import { getImageUrl, getProductImage, PLACEHOLDER_IMAGE } from "../utils/image";

// Helper to get the primary image (supports both new images array and legacy image field)
function getPrimaryImage(product) {
  if (product.images && product.images.length > 0) {
    return getImageUrl(product.images[0].url);
  }
  return getImageUrl(product.image) || PLACEHOLDER_IMAGE;
}

// Helper to get the secondary image for hover effect
function getSecondaryImage(product) {
  if (product.images && product.images.length > 1) {
    return getImageUrl(product.images[1].url);
  }
  return null;
}

export default function ProductCard({ product, onAddToCart, onClick }) {
  const { fmt } = useCurrency();
  if (!product) return null;

  const [isHovered, setIsHovered] = useState(false);

  const vendorName   = product.vendorId?.storeName || product.vendorId?.name || null;
  const price        = typeof product.price === "number" ? product.price : 0;
  // Promo support: if cart added a promo price, show it
  const originalPrice = typeof product._originalPrice === "number" ? product._originalPrice : null;
  const stock        = typeof product.stock === "number" ? product.stock : 999;
  const outOfStock   = stock === 0;

  // Get images for hover effect
  const primaryImage = getPrimaryImage(product);
  const secondaryImage = getSecondaryImage(product);
  const showHoverImage = isHovered && secondaryImage;

  const handleClick = (e) => {
    // Don't trigger click when clicking the add to cart button
    if (e.target.closest("button")) return;
    onClick?.(product);
  };

  return (
    <div
      className={`card ${styles.card}`}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={styles.imageWrapper}>
        {primaryImage
          ? (
            <img
              src={showHoverImage ? secondaryImage : primaryImage}
              alt={product.name || "Product"}
              className={styles.image}
              loading="lazy"
            />
          )
          : <div className={styles.noImage}>🛍️</div>
        }
        {product.category && <span className={styles.category}>{product.category}</span>}
        {outOfStock && <span className={styles.outOfStock}>Out of Stock</span>}
        {originalPrice && <span className={styles.saleBadge}>SALE</span>}
      </div>

      <div className={styles.body}>
        {vendorName && <p className={styles.vendor}>🏪 {vendorName}</p>}
        <h3 className={styles.name}>{product.name || "Unnamed Product"}</h3>
        <p className={styles.description}>{product.description || ""}</p>

        <div className={styles.footer}>
          <div className={styles.priceGroup}>
            <span className={styles.price}>{fmt(price)}</span>
            {originalPrice && (
              <span className={styles.originalPrice}>{fmt(originalPrice)}</span>
            )}
          </div>
          <button
            className={`btn btn-primary btn-sm ${styles.addBtn}`}
            onClick={(e) => { e.stopPropagation(); onAddToCart?.(product); }}
            disabled={outOfStock}
          >
            {outOfStock ? "Sold Out" : "+ Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
