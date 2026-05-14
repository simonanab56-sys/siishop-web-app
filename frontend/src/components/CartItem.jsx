// components/CartItem.jsx — v5: Fixed image URLs
import { useCurrency } from "../context/CurrencyContext";
import styles from "./CartItem.module.css";

const API_BASE = import.meta.env.VITE_API_URL_PROD || import.meta.env.VITE_API_URL || "http://localhost:10000/api";

// Helper to get full image URL
function getFullImageUrl(url) {
  if (!url) return "";
  // Handle Base64 data URLs - return as-is
  if (url.startsWith("data:image")) return url;
  // Handle full URLs
  if (url.startsWith("http")) return url;
  // Handle relative paths
  if (url.startsWith("/uploads")) {
    return API_BASE.replace("/api", "") + url;
  }
  if (url.startsWith("/")) {
    return API_BASE.replace("/api", "") + url;
  }
  // Handle filename only
  return `${API_BASE.replace("/api", "")}/uploads/products/${url}`;
}

// Helper to get cart image (supports multiple images and product references)
function getCartImage(item) {
  if (!item) return null;
  let img = null;

  // Check for direct image fields
  if (item.image) {
    img = item.image;
  } else if (item.images && item.images.length > 0) {
    const firstImg = item.images[0];
    img = typeof firstImg === "string" ? firstImg : firstImg?.url;
  }

  // Check product reference (for promos and older orders)
  if (!img && item.productId) {
    const productRef = typeof item.productId === "object" ? item.productId : null;
    if (productRef) {
      if (productRef.image) {
        img = productRef.image;
      } else if (productRef.images && productRef.images.length > 0) {
        const firstImg = productRef.images[0];
        img = typeof firstImg === "string" ? firstImg : firstImg?.url;
      }
    }
  }

  // Check product object
  if (!img && item.product) {
    if (item.product.image) {
      img = item.product.image;
    } else if (item.product.images && item.product.images.length > 0) {
      const firstImg = item.product.images[0];
      img = typeof firstImg === "string" ? firstImg : firstImg?.url;
    }
  }

  if (!img) return null;
  return getFullImageUrl(img);
}

export default function CartItem({ item, onIncrease, onDecrease, onRemove }) {
  const { fmt } = useCurrency();
  if (!item || !item._id) return null;

  const price    = typeof item.price    === "number" ? item.price    : 0;
  const quantity = typeof item.quantity === "number" ? item.quantity : 1;
  const name     = item.name || "Unknown item";
  const cartImage = getCartImage(item);

  return (
    <div className={styles.item}>
      {cartImage
        ? <img src={cartImage} alt={name} className={styles.image} />
        : <div className={styles.imagePlaceholder}>🛍️</div>
      }

      <div className={styles.info}>
        <h4 className={styles.name}>{name}</h4>
        <span className={styles.price}>{fmt(price)} each</span>
      </div>

      <div className={styles.controls}>
        <button className={styles.qtyBtn} onClick={() => onDecrease?.(item._id)} aria-label="Decrease quantity">−</button>
        <span className={styles.qty}>{quantity}</span>
        <button className={styles.qtyBtn} onClick={() => onIncrease?.(item._id)} aria-label="Increase quantity">+</button>
      </div>

      <span className={styles.lineTotal}>{fmt(price * quantity)}</span>

      <button className={styles.removeBtn} onClick={() => onRemove?.(item._id)} title="Remove item" aria-label="Remove item">
        ✕
      </button>
    </div>
  );
}
