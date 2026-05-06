// components/ProductCard.jsx — v3: currency-aware pricing, promo support
import { useCurrency } from "../context/CurrencyContext";
import styles from "./ProductCard.module.css";

export default function ProductCard({ product, onAddToCart }) {
  const { fmt } = useCurrency();
  if (!product) return null;

  const vendorName   = product.vendorId?.storeName || product.vendorId?.name || null;
  const price        = typeof product.price === "number" ? product.price : 0;
  // Promo support: if cart added a promo price, show it
  const originalPrice = typeof product._originalPrice === "number" ? product._originalPrice : null;
  const stock        = typeof product.stock === "number" ? product.stock : 999;
  const outOfStock   = stock === 0;

  return (
    <div className={`card ${styles.card}`}>
      <div className={styles.imageWrapper}>
        {product.image
          ? <img src={product.image} alt={product.name || "Product"} className={styles.image} loading="lazy" />
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
            onClick={() => onAddToCart?.(product)}
            disabled={outOfStock}
          >
            {outOfStock ? "Sold Out" : "+ Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
