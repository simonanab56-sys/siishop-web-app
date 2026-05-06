// components/CartItem.jsx — v3: currency-aware pricing
import { useCurrency } from "../context/CurrencyContext";
import styles from "./CartItem.module.css";

export default function CartItem({ item, onIncrease, onDecrease, onRemove }) {
  const { fmt } = useCurrency();
  if (!item || !item._id) return null;

  const price    = typeof item.price    === "number" ? item.price    : 0;
  const quantity = typeof item.quantity === "number" ? item.quantity : 1;
  const name     = item.name || "Unknown item";

  return (
    <div className={styles.item}>
      {item.image
        ? <img src={item.image} alt={name} className={styles.image} />
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
