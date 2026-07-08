import { useEffect, useRef, useState } from "react";

/**
 * Tiny IntersectionObserver hook. Returns a [ref, isIntersecting] pair.
 *
 *   const [ref, visible] = useIntersectionObserver({ threshold: 0.1 });
 *   return <div ref={ref}>{visible && <HeavyContent />}</div>;
 *
 * Options:
 *   - root        — the scroll container (default: viewport)
 *   - rootMargin  — like CSS margin on the root (default: "0px")
 *   - threshold   — 0..1 (default: 0)
 *   - once        — disconnect after first intersection (default: true)
 *
 * If the browser doesn't support IntersectionObserver, we short-circuit to
 * `isIntersecting = true` so the consumer never blocks on a missing feature.
 */
export function useIntersectionObserver({
  root = null,
  rootMargin = "0px",
  threshold = 0,
  once = true,
} = {}) {
  const ref = useRef(null);
  const [isIntersecting, setIntersecting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      // Feature missing → behave as if always visible.
      setIntersecting(true);
      return;
    }
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIntersecting(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setIntersecting(false);
        }
      },
      { root, rootMargin, threshold }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [root, rootMargin, threshold, once]);

  return [ref, isIntersecting];
}
