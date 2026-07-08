// components/PageSkeleton.jsx
//
// Generic Suspense fallback for `React.lazy` route boundaries. Renders a
// muted hero + a 2-column card grid as a "page is loading" placeholder.

import styles from "./skeletons/Skeleton.module.css";
import local from "./PageSkeleton.module.css";

export default function PageSkeleton() {
  return (
    <div className={local.page} aria-busy="true" aria-live="polite">
      <div className={`${styles.box} ${local.hero}`} />
      <div className={local.grid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={local.card}>
            <div className={`${styles.box} ${local.cardImage}`} />
            <div className={local.cardBody}>
              <div className={`${styles.box} ${local.line1}`} />
              <div className={`${styles.box} ${local.line2}`} />
              <div className={`${styles.box} ${local.line3}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
