// components/skeletons/RestaurantPageSkeleton.jsx
//
// First-paint placeholder for /restaurant/:slug. Renders the full page chrome
// — banner, header (logo + name + meta), category tab strip, menu-item-card
// skeletons, sidebar placeholder — so the user sees structure immediately.

import styles from "./Skeleton.module.css";
import local from "./RestaurantPageSkeleton.module.css";

export default function RestaurantPageSkeleton({ count = 6 }) {
  return (
    <div className={local.page} aria-busy="true" aria-live="polite">
      {/* Cover banner */}
      <div className={`${styles.box} ${local.coverBanner}`} />

      {/* Header (logo + name + meta) */}
      <div className={local.header}>
        <div className={`${styles.box} ${local.logo}`} />
        <div className={local.headerInfo}>
          <div className={`${styles.box} ${local.title}`} />
          <div className={`${styles.box} ${local.cuisineChip}`} />
          <div className={`${styles.box} ${local.metaLine}`} />
          <div className={`${styles.box} ${local.metaLineShort}`} />
        </div>
      </div>

      {/* Category tab strip */}
      <div className={local.tabs}>
        <div className={`${styles.box} ${local.tab}`} />
        <div className={`${styles.box} ${local.tab}`} />
        <div className={`${styles.box} ${local.tab}`} />
        <div className={`${styles.box} ${local.tab}`} />
      </div>

      {/* Menu items section */}
      <div className={local.menuSection}>
        <div className={`${styles.box} ${local.sectionTitle}`} />
        <div className={local.menuGrid}>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className={local.menuItem}>
              <div className={`${styles.box} ${local.itemImage}`} />
              <div className={local.itemInfo}>
                <div className={`${styles.box} ${local.itemTitle}`} />
                <div className={`${styles.box} ${local.itemDesc}`} />
                <div className={local.itemMeta}>
                  <div className={`${styles.box} ${local.itemPrice}`} />
                  <div className={`${styles.box} ${local.itemTime}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
