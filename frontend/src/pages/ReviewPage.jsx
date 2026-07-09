// pages/ReviewPage.jsx — Customer review flow entry point.
//
// Single page that handles BOTH marketplace product reviews and
// restaurant food reviews for a delivered order. The flow:
//
//   1. Read the `orderId` from the route payload (notification click
//      or in-app navigation) OR from sessionStorage (the email
//      `?review=…` deep link survives a refresh).
//   2. Call orderAPI.getPendingReviews(orderId) — the backend returns
//      the full list of items in that order that the user can still
//      review, with each item's eligibility (alreadyReviewed) already
//      resolved server-side. The customer cannot manipulate this.
//   3. Render a card per item with a 5-star widget and a comment box.
//   4. On submit, dispatch to productReviewAPI (marketplace) or
//      restaurantReviewAPI (food) using the orderId and the relevant
//      id. On success, drop the item from the list. When the list is
//      empty, show the "All caught up" state.
//   5. If the order doesn't exist, doesn't belong to the user, isn't
//      delivered, or has no reviewable items, show the empty state
//      with a "Back to orders" link.
//
// The page is mounted by App.jsx on the "review" route.
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import {
  orderAPI,
  productReviewAPI,
  restaurantReviewAPI,
} from "../services/api";
import styles from "./ReviewPage.module.css";

const PENDING_STORAGE_KEY = "pendingReview";

// ── Read orderId from payload or sessionStorage ──────────────────────────────
// The notification click and the email deep link both funnel here. Payload
// wins (it's the freshest signal), sessionStorage is the refresh-survival
// fallback for the email flow.
function resolveOrderId(payload) {
  if (payload && payload.orderId) return payload.orderId;
  try {
    const raw = sessionStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.orderId || null;
  } catch {
    return null;
  }
}

export default function ReviewPage({
  payload,
  addToast,
  onRequireAuth,
  onNavigate,
}) {
  const { isLoggedIn } = useAuth();
  const orderId = useMemo(() => resolveOrderId(payload), [payload]);

  // ── Data state ──────────────────────────────────────────────────────────
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // ── Per-item form state ─────────────────────────────────────────────────
  // Keyed by the composite `${type}:${id}:${orderId}` so multiple product
  // items in the same order don't trample each other's draft ratings.
  const [drafts, setDrafts] = useState({});
  const [submitting, setSubmitting] = useState({});

  // ── Load the pending-review list when the order id changes ──────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isLoggedIn) {
        // The bell is hidden when logged out, but a manual URL nav
        // (or stale sessionStorage) can still land here. Hand the
        // user off to the auth flow — the App.jsx pendingReview
        // plumbing restores this page after login.
        onRequireAuth?.("login");
        return;
      }
      if (!orderId) {
        setLoading(false);
        setLoadError("missing");
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const res = await orderAPI.getPendingReviews(orderId);
        if (cancelled) return;
        setItems(Array.isArray(res?.items) ? res.items : []);
      } catch (err) {
        if (cancelled) return;
        // The 404 path is the dominant error case here — wrong user,
        // wrong status, missing product. Same user-facing message for
        // all of them so an unauthorized caller can't probe order ids.
        setLoadError("unavailable");
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.error("[ReviewPage] load failed:", err?.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [orderId, isLoggedIn, onRequireAuth]);

  // ── Per-item helpers ────────────────────────────────────────────────────
  function itemKey(item) {
    const id = item.type === "food" ? item.restaurantId : item.productId;
    return `${item.type}:${id}:${item.orderId}`;
  }

  function getDraft(item) {
    return drafts[itemKey(item)] || { rating: 0, review: "" };
  }

  function setDraft(item, patch) {
    setDrafts((prev) => ({
      ...prev,
      [itemKey(item)]: { ...getDraft(item), ...patch },
    }));
  }

  async function handleSubmit(item) {
    const { rating, review } = getDraft(item);
    if (!rating || rating < 1) {
      addToast?.("Please select a star rating before submitting.", "error");
      return;
    }
    const key = itemKey(item);
    setSubmitting((prev) => ({ ...prev, [key]: true }));
    try {
      if (item.type === "food") {
        await restaurantReviewAPI.create(
          item.restaurantId,
          item.orderId,
          rating,
          review || ""
        );
      } else {
        await productReviewAPI.create(item.productId, {
          orderId: item.orderId,
          rating,
          review: review || "",
        });
      }
      addToast?.("Thanks! Your review was submitted.", "success");
      // Remove the just-reviewed item from the local list.
      setItems((prev) => prev.filter((it) => itemKey(it) !== key));
    } catch (err) {
      // The 400 "already reviewed" case is benign — the backend was
      // updated by a different tab/device, or the user double-clicked.
      // Just drop the item locally so the list stays consistent.
      const msg = err?.message || "Failed to submit review";
      if (/already reviewed/i.test(msg)) {
        addToast?.("You have already reviewed this item.", "info");
        setItems((prev) => prev.filter((it) => itemKey(it) !== key));
      } else if (/no longer available/i.test(msg)) {
        addToast?.("This order is no longer available.", "error");
        setLoadError("unavailable");
      } else {
        addToast?.(msg, "error");
      }
    } finally {
      setSubmitting((prev) => ({ ...prev, [key]: false }));
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.loading}>Loading your order…</p>
        </div>
      </div>
    );
  }

  if (loadError === "missing" || !orderId) {
    return (
      <div className={styles.page}>
        <EmptyState
          icon="❓"
          title="No order to review"
          message="We couldn't find a delivered order to review. Open the bell or your orders list to start one."
          onBack={() => onNavigate?.("orders")}
        />
      </div>
    );
  }

  if (loadError === "unavailable") {
    return (
      <div className={styles.page}>
        <EmptyState
          icon="🚫"
          title="This order is no longer available"
          message="Either the order doesn't exist, isn't yours, or hasn't been delivered yet."
          onBack={() => onNavigate?.("orders")}
        />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={styles.page}>
        <EmptyState
          icon="✅"
          title="All caught up!"
          message="You've already reviewed every item in this order. Thank you!"
          onBack={() => onNavigate?.("orders")}
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <h1 className={styles.title}>Leave a review</h1>
          <p className={styles.subtitle}>
            Your feedback helps other shoppers and the {items.some((i) => i.type === "food") ? "vendors" : "sellers"}.
          </p>
        </header>
        <ul className={styles.list}>
          {items.map((item) => {
            const key = itemKey(item);
            const draft = getDraft(item);
            const isSubmitting = !!submitting[key];
            const itemLabel = item.type === "food" ? "Meal" : "Product";
            return (
              <li key={key} className={styles.item}>
                <div className={styles.itemHead}>
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name || itemLabel}
                      className={styles.itemImage}
                      onError={(e) => {
                        // Defensive: if the image URL is broken, drop it
                        // rather than render a broken image icon. The
                        // product/food name is still visible.
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className={styles.itemImagePlaceholder}>
                      {item.type === "food" ? "🍽️" : "🛍️"}
                    </div>
                  )}
                  <div className={styles.itemMeta}>
                    <span className={styles.itemKind}>{itemLabel}</span>
                    <span className={styles.itemName}>{item.name || "Item"}</span>
                  </div>
                </div>

                <StarPicker
                  value={draft.rating}
                  onChange={(rating) => setDraft(item, { rating })}
                  disabled={isSubmitting}
                />

                <textarea
                  className={styles.textarea}
                  placeholder="Tell us about your experience (optional)"
                  maxLength={2000}
                  value={draft.review}
                  onChange={(e) => setDraft(item, { review: e.target.value })}
                  disabled={isSubmitting}
                  rows={3}
                />

                <button
                  type="button"
                  className={styles.submitBtn}
                  onClick={() => handleSubmit(item)}
                  disabled={isSubmitting || !draft.rating}
                >
                  {isSubmitting ? "Submitting…" : "Submit review"}
                </button>
              </li>
            );
          })}
        </ul>
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => onNavigate?.("orders")}
          >
            ← Back to orders
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StarPicker({ value, onChange, disabled }) {
  // Five buttons styled as stars. Hovering previews a value; the click
  // commits it. Keyboard accessible (real <button>s, not divs).
  const [hover, setHover] = useState(0);
  const active = hover || value;
  return (
    <div
      className={styles.stars}
      role="radiogroup"
      aria-label="Star rating"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`${styles.star} ${n <= active ? styles.starOn : ""}`}
          onMouseEnter={() => !disabled && setHover(n)}
          onClick={() => !disabled && onChange(n)}
          disabled={disabled}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          aria-checked={value === n}
          role="radio"
        >
          ★
        </button>
      ))}
    </div>
  );
}

function EmptyState({ icon, title, message, onBack }) {
  return (
    <div className={styles.card}>
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>{icon}</div>
        <h2 className={styles.emptyTitle}>{title}</h2>
        <p className={styles.emptyMessage}>{message}</p>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          Back to orders
        </button>
      </div>
    </div>
  );
}
