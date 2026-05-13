// components/CartItem.jsx — v4: handle multiple images
import { useCurrency } from "../context/CurrencyContext";
import styles from "./CartItem.module.css";

const API_BASE = import.meta.env.VITE_API_URL_PROD || import.meta.env.VITE_API_URL || "http://localhost:10000/api";

// Helper to get full image URL
function getFullImageUrl(url) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  if (url.startsWith("/uploads")) {
    return API_BASE.replace("/api", "") + url;
  }
  return url;
}

// Helper to get cart image (supports multiple images)
function getCartImage(item) {
  // Check for single image
  if (item.image) return getFullImageUrl(item.image);
  // Check for multiple images array - use first one
  if (item.images && item.images.length > 0) {
    const firstImg = item.images[0];
    // Handle both string and object formats
    return getFullImageUrl(typeof firstImg === "string" ? firstImg : firstImg.url);
  }
  return null;
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
