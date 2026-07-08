// components/skeletons/FoodPageSkeleton.jsx
//
// First-paint placeholder for /food. Renders the full page chrome — hero,
// search bar, filter chips, restaurant-card skeletons, food-card skeletons —
// so the user sees structure immediately while the real data is in flight.

import styles from "./Skeleton.module.css";
import local from "./FoodPageSkeleton.module.css";

export default function FoodPageSkeleton({ count = 6 }) {
  return (
    <div className={local.page} aria-busy="true" aria-live="polite">
      {/* Hero */}
      <div className={local.hero}>
        <div className={`${styles.box} ${local.heroTitle}`} />
        <div className={`${styles.box} ${local.heroSubtitle}`} />
      </div>

      {/* Search bar */}
      <div className={local.searchBar}>
        <div className={`${styles.box} ${local.searchInput}`} />
        <div className={`${styles.box} ${local.searchBtn}`} />
      </div>

      {/* Filter chips */}
      <div className={local.filters}>
        <div className={`${styles.box} ${local.chip}`} />
        <div className={`${styles.box} ${local.chip}`} />
        <div className={`${styles.box} ${local.chip}`} />
      </div>

      {/* Restaurant cards */}
      <section className={local.section}>
        <div className={`${styles.box} ${local.sectionTitle}`} />
        <div className={local.grid}>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className={local.card}>
              <div className={`${styles.box} ${local.cardImage}`} />
              <div className={local.cardBody}>
                <div className={`${styles.box} ${local.cardLine1}`} />
                <div className={`${styles.box} ${local.cardLine2}`} />
                <div className={`${styles.box} ${local.cardLine3}`} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
