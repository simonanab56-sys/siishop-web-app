// components/PromoSection.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Displays active promotions with countdown timer and discounted prices.
// Used on HomePage below the hero.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import { promoAPI } from "../services/api";
import { useCurrency } from "../context/CurrencyContext";
import styles from "./PromoSection.module.css";

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

// Countdown hook — returns { days, hours, minutes, seconds } until endDate
function useCountdown(endDate) {
  const [timeLeft, setTimeLeft] = useState(calcDiff(endDate));
  const timerRef = useRef(null);

  function calcDiff(end) {
    const ms = new Date(end).getTime() - Date.now();
    if (ms <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
    return {
      days:    Math.floor(ms / 86_400_000),
      hours:   Math.floor((ms % 86_400_000) / 3_600_000),
      minutes: Math.floor((ms % 3_600_000)  / 60_000),
      seconds: Math.floor((ms % 60_000)     / 1_000),
      expired: false,
    };
  }

  useEffect(() => {
    timerRef.current = setInterval(() => setTimeLeft(calcDiff(endDate)), 1000);
    return () => clearInterval(timerRef.current);
  }, [endDate]);

  return timeLeft;
}

// Single promo card
function PromoCard({ promo, onAddToCart, onViewProduct }) {
  const { fmt } = useCurrency();
  const product  = promo.productId;
  const discount = promo.discountPercent || 0;
  const original = typeof product?.price === "number" ? product.price : 0;
  const sale     = parseFloat((original * (1 - discount / 100)).toFixed(2));
  const countdown = useCountdown(promo.endDate);

  if (!product) return null;

  const handleCardClick = (e) => {
    // Don't trigger click when clicking the add to cart button
    if (e.target.closest("button")) return;
    // Pass product with promo pricing applied
    const productWithPromo = {
      ...product,
      price: sale,
      _originalPrice: original,
    };
    onViewProduct?.(productWithPromo);
  };

  return (
    <div className={styles.promoCard} onClick={handleCardClick}>
      {/* Discount badge */}
      <div className={styles.discountBadge}>-{discount}%</div>

      {/* Image */}
      <div className={styles.promoImg}>
        {product.images && product.images.length > 0
          ? <img src={getFullImageUrl(product.images[0].url)} alt={product.name || "Product"} loading="lazy" />
          : product.image
            ? <img src={getFullImageUrl(product.image)} alt={product.name || "Product"} loading="lazy" />
            : <div className={styles.imgPlaceholder}>🛍️</div>
        }
      </div>

      <div className={styles.promoBody}>
        {/* Title */}
        {promo.title && <p className={styles.promoTitle}>{promo.title}</p>}
        <h3 className={styles.productName}>{product.name || "Product"}</h3>

        {/* Pricing */}
        <div className={styles.pricing}>
          <span className={styles.salePrice}>{fmt(sale)}</span>
          <span className={styles.originalPrice}>{fmt(original)}</span>
        </div>

        {/* Countdown */}
        {!countdown.expired && (
          <div className={styles.countdown}>
            <span className={styles.countdownLabel}>Ends in:</span>
            <div className={styles.countdownBoxes}>
              {countdown.days > 0 && <CountBox value={countdown.days}   unit="d" />}
              <CountBox value={countdown.hours}   unit="h" />
              <CountBox value={countdown.minutes} unit="m" />
              <CountBox value={countdown.seconds} unit="s" />
            </div>
          </div>
        )}
        {countdown.expired && <p className={styles.expiredTag}>Promo Ended</p>}

        <button
          className={`btn btn-primary ${styles.addBtn}`}
          onClick={() => onAddToCart?.({ ...product, price: sale, _originalPrice: original, fromPromo: true })}
          disabled={countdown.expired || product.available === false}>
          {countdown.expired ? "Ended" : product.available === false ? "Sold Out" : "+ Add to Cart"}
        </button>
      </div>
    </div>
  );
}

function CountBox({ value, unit }) {
  return (
    <div className={styles.countBox}>
      <span className={styles.countNum}>{String(value).padStart(2, "0")}</span>
      <span className={styles.countUnit}>{unit}</span>
    </div>
  );
}

export default function PromoSection({ onAddToCart, onViewProduct }) {
  const [promos,  setPromos]  = useState([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    promoAPI.getActive()
      .then(data => { if (mountedRef.current) setPromos(Array.isArray(data) ? data : []); })
      .catch(() => { if (mountedRef.current) setPromos([]); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, []);

  // Don't render the section at all if there are no promos
  if (loading || promos.length === 0) return null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitleGroup}>
          <span className={styles.flashIcon}>⚡</span>
          <h2 className={styles.sectionTitle}>Flash Deals</h2>
        </div>
        <p className={styles.sectionSub}>Limited-time offers — grab them before they expire!</p>
      </div>

      <div className={styles.promoGrid}>
        {promos.map(promo => (
          <PromoCard key={promo._id} promo={promo} onAddToCart={onAddToCart} onViewProduct={onViewProduct} />
        ))}
      </div>
    </section>
  );
}
