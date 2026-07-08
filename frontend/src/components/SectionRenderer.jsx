// components/SectionRenderer.jsx — Renders one HomepageSection.
//
// Owns its own per-section data fetch (parallel across siblings), supports
// grid / carousel / featured / mixed layouts, optional countdown, and the
// "See All" deep-link. Skeleton + error + empty states are handled here so
// the parent only deals with the loop.
//
// Props: { section, onAddToCart, onViewProduct, onRequireAuth }
//
// Layouts:
//   grid      — uses global .grid-4 utility
//   carousel  — horizontal scroll with snap (mobile + desktop, no library)
//   featured  — one large card + 2-col grid of remaining products
//   mixed     — best-of-3 carousel on top + grid of next 8 below
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { homepageSectionAPI } from "../services/api";
import ProductCard from "./ProductCard";
import { useCountdown } from "../utils/useCountdown";
import { getImageUrl, PLACEHOLDER_IMAGE } from "../utils/image";
import styles from "./SectionRenderer.module.css";

const SKELETON_COUNT = 6;

export default function SectionRenderer({
  section,
  onAddToCart,
  onViewProduct,
  onRequireAuth,
  onNavigate,
}) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!section?._id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    homepageSectionAPI
      .getProducts(section._id)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setProducts(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (cancelled || !mountedRef.current) return;
        setError(err?.message || "Failed to load products");
        setProducts([]);
      })
      .finally(() => {
        if (cancelled || !mountedRef.current) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section?._id]);

  if (!section) return null;

  // Only show countdown if the section is currently visible (i.e. not expired)
  const countdown = useOptionalCountdown(section.endDate);

  const handleSeeAll = () => {
    if (onNavigate) onNavigate("see-all", { sectionId: section._id });
  };

  return (
    <section className={styles.section} aria-label={section.title}>
      {/* Banner image (optional) */}
      {section.bannerImage?.url && (
        <div className={styles.banner}>
          <img
            src={getImageUrl(section.bannerImage.url) || PLACEHOLDER_IMAGE}
            alt=""
            loading="lazy"
          />
        </div>
      )}

      {/* Header row */}
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          {section.icon && <span className={styles.icon}>{section.icon}</span>}
          <h2 className={styles.title}>{section.title}</h2>
        </div>
        <div className={styles.headerRight}>
          {countdown && !countdown.expired && (
            <span className={styles.countdown} aria-label="Section ends in">
              <span className={styles.countdownLabel}>Ends in</span>
              <span className={styles.countdownTime}>
                {formatCountdown(countdown)}
              </span>
            </span>
          )}
          {section.showSeeAll && (
            <button
              type="button"
              className={styles.seeAllBtn}
              onClick={handleSeeAll}
            >
              See all →
            </button>
          )}
        </div>
      </div>
      {section.subtitle && <p className={styles.subtitle}>{section.subtitle}</p>}

      {/* Body */}
      {loading ? (
        <SkeletonGrid count={SKELETON_COUNT} layout={section.layout} />
      ) : error ? (
        <ErrorBox message={error} onRetry={() => setError(null)} />
      ) : products.length === 0 ? (
        <div className={styles.empty}>
          <p>No products in this section yet.</p>
        </div>
      ) : (
        <Body
          layout={section.layout}
          products={products}
          onAddToCart={onAddToCart}
          onViewProduct={onViewProduct}
          onRequireAuth={onRequireAuth}
        />
      )}
    </section>
  );
}

/* ── Sub-components ────────────────────────────────────────────────────── */

function Body({ layout, products, onAddToCart, onViewProduct, onRequireAuth }) {
  const renderCard = (product) => (
    <ProductCard
      key={product._id}
      product={product}
      onAddToCart={onAddToCart}
      onClick={onViewProduct}
      onAuthRequired={onRequireAuth}
    />
  );

  switch (layout) {
    case "carousel":
      return <Carousel products={products} renderCard={renderCard} />;
    case "featured":
      return <FeaturedLayout products={products} renderCard={renderCard} />;
    case "mixed":
      return <MixedLayout products={products} renderCard={renderCard} />;
    case "grid":
    default:
      return <div className={styles.grid}>{products.map(renderCard)}</div>;
  }
}

function Carousel({ products, renderCard }) {
  return (
    <div className={styles.carouselWrap}>
      <div className={styles.carousel}>
        {products.map((p) => (
          <div className={styles.carouselCell} key={p._id}>
            {renderCard(p)}
          </div>
        ))}
      </div>
    </div>
  );
}

function FeaturedLayout({ products, renderCard }) {
  if (products.length === 0) return null;
  const [hero, ...rest] = products;
  return (
    <div className={styles.featured}>
      <div className={styles.featuredHero}>{renderCard(hero)}</div>
      {rest.length > 0 && (
        <div className={styles.featuredGrid}>
          {rest.map((p) => (
            <div className={styles.featuredCell} key={p._id}>
              {renderCard(p)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MixedLayout({ products, renderCard }) {
  const top = products.slice(0, 3);
  const bottom = products.slice(3, 11);
  return (
    <div className={styles.mixed}>
      {top.length > 0 && (
        <Carousel products={top} renderCard={renderCard} />
      )}
      {bottom.length > 0 && (
        <div className={styles.grid}>
          {bottom.map((p) => renderCard(p))}
        </div>
      )}
    </div>
  );
}

function SkeletonGrid({ count, layout }) {
  const cells = Array.from({ length: count }, (_, i) => i);
  if (layout === "carousel") {
    return (
      <div className={styles.carouselWrap}>
        <div className={styles.carousel}>
          {cells.map((i) => (
            <div className={styles.carouselCell} key={i}>
              <div className={styles.skeletonCard} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className={styles.grid}>
      {cells.map((i) => (
        <div className={styles.skeletonCard} key={i} />
      ))}
    </div>
  );
}

function ErrorBox({ message, onRetry }) {
  return (
    <div className={styles.errorBox}>
      <span>{message}</span>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

/* ── Hook: only run countdown when an endDate is set ──────────────────── */
function useOptionalCountdown(endDate) {
  const [val, setVal] = useState(null);
  useEffect(() => {
    if (!endDate) {
      setVal(null);
      return;
    }
    // Compute immediately so the chip is correct on first render.
    const diff = computeDiff(endDate);
    setVal(diff);
    const t = setInterval(() => setVal(computeDiff(endDate)), 1000);
    return () => clearInterval(t);
  }, [endDate]);
  return val;
}

function computeDiff(end) {
  const ms = new Date(end).getTime() - Date.now();
  if (ms <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true, totalMs: ms };
  }
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    seconds: Math.floor((ms % 60_000) / 1_000),
    expired: false,
    totalMs: ms,
  };
}

function formatCountdown(c) {
  if (c.days > 0) return `${c.days}d ${c.hours}h ${c.minutes}m`;
  if (c.hours > 0) return `${c.hours}h ${c.minutes}m ${c.seconds}s`;
  return `${c.minutes}m ${c.seconds}s`;
}
