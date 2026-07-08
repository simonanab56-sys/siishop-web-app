// components/PromoSection.jsx — v2 (marketplace-level upgrade)
//
// Displays active promotions on the Home page below the hero. Single source of
// truth for promo UI; mounted only by HomePage.jsx. No dedicated route — the
// "See All" affordance toggles an inline expand view within this same section.
//
// Reuses (no duplication):
//   - promoAPI.getActive (api.js) — same endpoint, optional params now accepted
//   - getImageUrl (utils/image.js)
//   - useCurrency (context/CurrencyContext)
//   - useCountdown (utils/useCountdown.js) — extracted from this file's prior
//     inline copy so the header ticker and per-card ticker share one hook
//   - WishlistButton (components/WishlistButton.jsx) — same heart used by
//     ProductCard
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { promoAPI } from "../services/api";
import { useCurrency } from "../context/CurrencyContext";
import { getImageUrl } from "../utils/image";
import { useCountdown } from "../utils/useCountdown";
import WishlistButton from "./WishlistButton";
import styles from "./PromoSection.module.css";

// How many cards to show in collapsed (carousel) mode before "See All".
const CAROUSEL_LIMIT = 8;

// Stock thresholds for the auto-derived "Limited Stock" chip and the colored
// stock bar. Exported for tests / future tuning.
const LOW_STOCK_THRESHOLD = 5;
const STOCK_BAR_REFERENCE = 20;   // stock === 20 ⇒ bar reads 100%

// Pick a colour class for the stock bar fill.
//   stock === 0 → null (no bar; "Sold Out" overlay renders instead)
//   ratio >= 0.5 → ok   (green)
//   ratio >= 0.2 → warn (amber)
//   ratio <  0.2 → low  (red)
function stockBarColorClass(stock) {
  if (!stock || stock <= 0) return null;
  const ratio = stock / STOCK_BAR_REFERENCE;
  if (ratio >= 0.5) return "stockBarFill--ok";
  if (ratio >= 0.2) return "stockBarFill--warn";
  return "stockBarFill--low";
}

function stockBarWidthPct(stock) {
  if (!stock || stock <= 0) return 0;
  return Math.max(5, Math.min(100, (stock / STOCK_BAR_REFERENCE) * 100));
}

// Format a global header countdown as "HHh : MMm : SSs" (compact, no days).
// Falls back to a sensible label when the underlying countdown has expired.
function formatCompact(ms) {
  if (ms <= 0) return "Ended";
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}h : ${m}m : ${s}s`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PromoCard — enhanced compact card.
// ─────────────────────────────────────────────────────────────────────────────
function PromoCard({ promo, onAddToCart, onViewProduct, onAuthRequired }) {
  const { fmt } = useCurrency();
  const product  = promo.productId;
  const discount = promo.discountPercent || 0;
  const original = typeof product?.price === "number" ? product.price : 0;
  const sale     = parseFloat((original * (1 - discount / 100)).toFixed(2));
  const saved    = parseFloat((original - sale).toFixed(2));
  const countdown = useCountdown(promo.endDate);

  if (!product) return null;

  const stock        = typeof product.stock === "number" ? product.stock : null;
  const isSoldOut    = stock === 0 || product.available === false;
  const isExpired    = countdown.expired;
  const isDisabled   = isSoldOut || isExpired;
  const showLimited  = !isSoldOut && stock !== null && stock <= LOW_STOCK_THRESHOLD;
  const showBadge    = !!promo.badge && !isSoldOut;
  const barColorCls  = stockBarColorClass(stock);
  const barWidthPct  = stockBarWidthPct(stock);

  const handleCardClick = (e) => {
    if (e.target.closest("button")) return;
    onViewProduct?.({
      ...product,
      price: sale,
      _originalPrice: original,
    });
  };

  const handleAdd = (e) => {
    e.stopPropagation();
    if (isDisabled) return;
    onAddToCart?.({
      ...product,
      price: sale,
      _originalPrice: original,
      fromPromo: true,
    });
  };

  return (
    <div className={styles.promoCard} onClick={handleCardClick} tabIndex={0}>
      {/* Badges — discount % top-left, custom admin badge top-right. */}
      <div className={styles.discountBadge}>-{discount}%</div>
      {showBadge && <div className={styles.customBadgeChip}>{promo.badge}</div>}

      {/* Sold Out overlay sits over the image when stock is zero. */}
      {isSoldOut && <div className={styles.soldOutOverlay}>SOLD OUT</div>}

      {/* Image */}
      <div className={styles.promoImg}>
        {product.images && product.images.length > 0
          ? <img src={getImageUrl(product.images[0].url)} alt={product.name || "Product"} loading="lazy" />
          : product.image
            ? <img src={getImageUrl(product.image)} alt={product.name || "Product"} loading="lazy" />
            : <div className={styles.imgPlaceholder}>🛍️</div>
        }
        <div className={styles.wishlistWrapper}>
          <WishlistButton productId={product._id} size="small" onAuthRequired={onAuthRequired} />
        </div>
      </div>

      <div className={styles.promoBody}>
        {promo.title && <p className={styles.promoTitle}>{promo.title}</p>}
        <h3 className={styles.productName}>{product.name || "Product"}</h3>

        {/* Pricing */}
        <div className={styles.pricing}>
          <span className={styles.salePrice}>{fmt(sale)}</span>
          {original > 0 && <span className={styles.originalPrice}>{fmt(original)}</span>}
          {saved > 0 && <span className={styles.saveAmount}>Save {fmt(saved)}</span>}
        </div>

        {/* Limited-stock signal (auto-derived). */}
        {showLimited && (
          <span className={styles.limitedStockChip}>⚡ Only {stock} left</span>
        )}

        {/* Stock bar — hidden when sold out. */}
        {barColorCls && (
          <div className={styles.stockBar} aria-hidden="true">
            <div
              className={`${styles.stockBarFill} ${styles[barColorCls]}`}
              style={{ width: `${barWidthPct}%` }}
            />
          </div>
        )}

        {/* Countdown */}
        {!isExpired && (
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
        {isExpired && <p className={styles.expiredTag}>Promo Ended</p>}

        <button
          className={`btn btn-primary ${styles.addBtn}`}
          onClick={handleAdd}
          disabled={isDisabled}
        >
          {isSoldOut ? "Sold Out" : isExpired ? "Ended" : "+ Add to Cart"}
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

// ─────────────────────────────────────────────────────────────────────────────
// PromoSection — default export, mounted by HomePage below the hero.
// ─────────────────────────────────────────────────────────────────────────────
export default function PromoSection({ onAddToCart, onViewProduct, onAuthRequired }) {
  const [promos,        setPromos]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [expanded,      setExpanded]      = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
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

  // Categories from the loaded promos — derived locally, no extra API call.
  const categories = useMemo(() => {
    const set = new Set();
    for (const p of promos) {
      const c = p.productId?.category;
      if (c) set.add(c);
    }
    return ["All", ...Array.from(set)];
  }, [promos]);

  // Filter by active category; original ordering from the backend is preserved.
  const visiblePromos = useMemo(() => {
    if (activeCategory === "All") return promos;
    return promos.filter(p => p.productId?.category === activeCategory);
  }, [promos, activeCategory]);

  // Soonest-expiring endDate across the visible set drives the header ticker.
  const soonestEndDate = useMemo(() => {
    const ends = visiblePromos
      .map(p => (p.endDate ? new Date(p.endDate).getTime() : null))
      .filter(t => t && t > Date.now());
    if (!ends.length) return null;
    return new Date(Math.min(...ends)).toISOString();
  }, [visiblePromos]);

  const headerCountdown = useCountdown(soonestEndDate);

  // Section hides entirely if no promos are active (preserves prior behaviour).
  if (loading || (!loading && visiblePromos.length === 0 && activeCategory === "All")) {
    if (loading) {
      return (
        <section className={styles.section} aria-busy="true">
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitleGroup}>
              <span className={styles.flashIcon}>⚡</span>
              <h2 className={styles.sectionTitle}>Flash Deals</h2>
            </div>
            <p className={styles.sectionSub}>Limited-time offers — grab them before they expire!</p>
          </div>
          <div className={styles.promoScroll}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`${styles.skeleton} ${styles.promoCard}`} />
            ))}
          </div>
        </section>
      );
    }
    return null;
  }

  // Collapsed = carousel of the first N visible; expanded = grid of all visible.
  const list = expanded ? visiblePromos : visiblePromos.slice(0, CAROUSEL_LIMIT);
  const canExpand = visiblePromos.length > CAROUSEL_LIMIT;

  return (
    <section className={styles.section}>
      {/* Header row — title + countdown chip on the left, See All on the right. */}
      <div className={styles.sectionHeader}>
        <div className={styles.headerRow}>
          <div className={styles.sectionTitleGroup}>
            <span className={styles.flashIcon}>⚡</span>
            <h2 className={styles.sectionTitle}>Flash Deals</h2>
          </div>
          {headerCountdown.totalMs > 0 && (
            <div className={styles.globalCountdown} aria-live="polite">
              <span className={styles.globalCountdownLabel}>Ends in</span>
              <span className={styles.globalCountdownTime}>
                {formatCompact(headerCountdown.totalMs)}
              </span>
            </div>
          )}
          {canExpand && (
            <button
              type="button"
              className={styles.seeAllBtn}
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? "Show Less" : "See All"}
            </button>
          )}
        </div>
        <p className={styles.sectionSub}>Limited-time offers — grab them before they expire!</p>
      </div>

      {/* Category chips — only when there are at least two distinct categories. */}
      {categories.length > 2 && (
        <div className={styles.categoryChips} role="tablist">
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={activeCategory === cat}
              className={`${styles.categoryChip} ${activeCategory === cat ? styles.categoryChipActive : ""}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Empty-after-filter guard — keeps the chips responsive without breaking layout. */}
      {list.length === 0 ? (
        <div style={{ color: "rgba(255,255,255,0.7)", textAlign: "center", padding: "24px 8px", fontSize: "0.85rem" }}>
          No promos in this category right now.
        </div>
      ) : expanded ? (
        <div className={styles.promoGrid}>
          {list.map(promo => (
            <PromoCard
              key={promo._id}
              promo={promo}
              onAddToCart={onAddToCart}
              onViewProduct={onViewProduct}
              onAuthRequired={onAuthRequired}
            />
          ))}
        </div>
      ) : (
        <div className={styles.promoScroll}>
          {list.map(promo => (
            <PromoCard
              key={promo._id}
              promo={promo}
              onAddToCart={onAddToCart}
              onViewProduct={onViewProduct}
              onAuthRequired={onAuthRequired}
            />
          ))}
        </div>
      )}
    </section>
  );
}