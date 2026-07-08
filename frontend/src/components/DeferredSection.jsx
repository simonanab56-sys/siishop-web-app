// components/DeferredSection.jsx
//
// Lightweight wrapper that uses IntersectionObserver to defer mounting of
// non-critical content until the user scrolls (within `rootMargin` of) the
// placeholder. Used to lazy-load below-the-fold sections (reviews, recommended
// restaurants) so the initial restaurant slug page paints the chrome first.
//
// Usage:
//   <DeferredSection
//     fallback={<SectionSkeleton />}
//     onVisible={() => fetchReviews()}
//   >
//     {reviews.map(...)}
//   </DeferredSection>
//
// The observer is set up once on mount via ref. When the placeholder enters
// the viewport, `isVisible` flips to true and the children mount. The
// observer is disconnected after first hit — these are one-shot triggers.

import { useEffect, useRef, useState } from "react";

export default function DeferredSection({
  children,
  fallback = null,
  onVisible,
  rootMargin = "200px",
  // ✅ Height reservation prevents layout shift when the real content swaps
  // in. Callers can pass `minHeight` (e.g. "300px") to hold the space.
  minHeight,
  className,
  style,
}) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") {
      // SSR / non-browser — render children immediately so we don't strand
      // the user with an empty placeholder.
      setIsVisible(true);
      return;
    }

    const node = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true);
            // Trigger any side effect (data fetch) once.
            if (typeof onVisible === "function") onVisible();
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
    // We intentionally don't include onVisible in deps — it's expected to be
    // a stable function (or undefined). Re-running the effect on every
    // identity change would tear down + re-create the observer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootMargin]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ minHeight, ...style }}
    >
      {isVisible ? children : fallback}
    </div>
  );
}
