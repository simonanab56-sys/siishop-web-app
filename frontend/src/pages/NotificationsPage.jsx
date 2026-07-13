// pages/NotificationsPage.jsx
// Phase 2: full in-app notification inbox. Lists the user's
// notifications, paginated + filterable + searchable. Replaces the
// bell dropdown's "show 10 most recent" behaviour for users who want
// to actually triage their inbox. The dropdown still works; this page
// is for the rest of the workflow (search, delete, mark all read, etc.).
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Bell, Trash2, Search, Check, CheckCheck, X, Filter, Inbox,
} from "lucide-react";
import { notificationAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import SEO from "../components/SEO";
import logger from "../utils/logger";
import styles from "./NotificationsPage.module.css";

const TYPE_FILTERS = [
  { value: "all",                  label: "All" },
  { value: "order_",               label: "Orders" },
  { value: "withdrawal_",          label: "Wallet / Withdrawals" },
  { value: "commission_",          label: "Commissions" },
  { value: "review_request",       label: "Reviews" },
  { value: "product_",             label: "Products" },
  { value: "store_",               label: "Store" },
  { value: "restaurant_",          label: "Restaurant" },
  { value: "wishlist_",            label: "Wishlist" },
  { value: "support_reply",        label: "Support" },
  { value: "system_announcement",  label: "Announcements" },
];

/**
 * Deep-link dispatch. Mirrors the bell's DEEP_LINKS table. A small
 * subset of "type → page + payload" mappings — types that don't
 * resolve just close the inbox and stay on this page.
 */
const DEEP_LINKS = {
  review_request:          (n) => ({ page: "review",            payload: { orderId: n.metadata?.orderId || n.referenceId } }),
  withdrawal_submitted:    (n) => ({ page: "vendor",            payload: { tab: "wallet" } }),
  withdrawal_approved:     (n) => ({ page: "vendor",            payload: { tab: "wallet" } }),
  withdrawal_processing:   (n) => ({ page: "vendor",            payload: { tab: "wallet" } }),
  withdrawal_completed:    (n) => ({ page: "vendor",            payload: { tab: "wallet" } }),
  withdrawal_rejected:     (n) => ({ page: "vendor",            payload: { tab: "wallet" } }),
  commission_paid:         (n) => ({ page: "vendor",            payload: { tab: "wallet" } }),
  commission_due:          (n) => ({ page: "vendor",            payload: { tab: "wallet" } }),
  commission_overdue:      (n) => ({ page: "vendor",            payload: { tab: "wallet" } }),
  order_new:               (n) => ({ page: "vendor",            payload: { tab: "orders" } }),
  order_placed:            (n) => ({ page: "orders",            payload: { orderId: n.metadata?.orderId || n.referenceId } }),
  order_accepted:          (n) => ({ page: "orders",            payload: { orderId: n.metadata?.orderId || n.referenceId } }),
  order_preparing:         (n) => ({ page: "orders",            payload: { orderId: n.metadata?.orderId || n.referenceId } }),
  order_packed:            (n) => ({ page: "orders",            payload: { orderId: n.metadata?.orderId || n.referenceId } }),
  rider_assigned:          (n) => ({ page: "delivery-tracking", payload: { orderId: n.metadata?.orderId || n.referenceId } }),
  out_for_delivery:        (n) => ({ page: "delivery-tracking", payload: { orderId: n.metadata?.orderId || n.referenceId } }),
  payment_succeeded:       (n) => ({ page: "orders",            payload: { orderId: n.metadata?.orderId || n.referenceId } }),
  payment_failed:          (n) => ({ page: "orders",            payload: { orderId: n.metadata?.orderId || n.referenceId } }),
  refund_processed:        (n) => ({ page: "orders",            payload: { orderId: n.metadata?.orderId || n.referenceId } }),
  cancellation_approved:   (n) => ({ page: "orders",            payload: { orderId: n.metadata?.orderId || n.referenceId } }),
  product_approved:        (n) => ({ page: "vendor",            payload: { tab: "products" } }),
  product_rejected:        (n) => ({ page: "vendor",            payload: { tab: "products" } }),
  product_hidden:          (n) => ({ page: "vendor",            payload: { tab: "products" } }),
  product_low_stock:       (n) => ({ page: "vendor",            payload: { tab: "products" } }),
  product_out_of_stock:    (n) => ({ page: "vendor",            payload: { tab: "products" } }),
  new_review:              (n) => ({ page: "vendor",            payload: { tab: "reviews" } }),
  kyc_approved:            (n) => ({ page: "vendor",            payload: { tab: "settings" } }),
  kyc_rejected:            (n) => ({ page: "vendor",            payload: { tab: "settings" } }),
  store_approved:          ()  => ({ page: "vendor",            payload: {} }),
  store_suspended:         ()  => ({ page: "vendor",            payload: {} }),
  restaurant_approved:     ()  => ({ page: "restaurant-dashboard", payload: {} }),
  restaurant_rejected:     ()  => ({ page: "restaurant-dashboard", payload: {} }),
  restaurant_suspended:    ()  => ({ page: "restaurant-dashboard", payload: {} }),
  coupon_received:         ()  => ({ page: "deals",             payload: {} }),
  promo_available:         ()  => ({ page: "deals",             payload: {} }),
  flash_sale:              ()  => ({ page: "deals",             payload: {} }),
  wishlist_price_drop:     ()  => ({ page: "wishlist",          payload: {} }),
  wishlist_stock_available:()  => ({ page: "wishlist",          payload: {} }),
  support_reply:           (n) => ({ page: "chat",              payload: { conversationId: n.metadata?.conversationId } }),
  account_suspended:       ()  => ({ page: "settings",          payload: {} }),
  account_restored:        ()  => ({ page: "settings",          payload: {} }),
};

function formatRelativeTime(dateString) {
  const now = Date.now();
  const t = new Date(dateString).getTime();
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateString).toLocaleDateString();
}

export default function NotificationsPage({ addToast, onNavigate, onRequireAuth }) {
  const { user, isLoggedIn } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const sentinelRef = useRef(null);

  // Debounce the search box by 250ms so we don't hammer the API on
  // every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  const fetchPage = useCallback(
    async (pageNum = 1, append = false) => {
      if (!isLoggedIn) {
        setLoading(false);
        return;
      }
      try {
        setLoading(pageNum === 1);
        setError("");
        const params = { page: pageNum, limit: 20 };
        if (unreadOnly) params.unreadOnly = "true";
        if (debouncedSearch) params.q = debouncedSearch;
        if (filter && filter !== "all") {
          // `filter` may be a prefix like "order_" or a single type.
          params.typePrefix = filter;
        }
        const data = await notificationAPI.getNotifications(params);
        const list = data.notifications || [];
        setItems((prev) => (append ? [...prev, ...list] : list));
        setTotal(data.total ?? list.length);
        setUnreadCount(data.unreadCount || 0);
        setHasMore(Boolean(data.hasMore));
        setPage(pageNum);
      } catch (err) {
        logger.log("[NotificationsPage] fetch failed:", err.message);
        setError(err.message || "Failed to load notifications");
      } finally {
        setLoading(false);
      }
    },
    [isLoggedIn, unreadOnly, debouncedSearch, filter]
  );

  // Reset to page 1 whenever a filter/search/unread-only flips.
  useEffect(() => {
    if (isLoggedIn) fetchPage(1, false);
  }, [fetchPage, isLoggedIn]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e.isIntersecting && hasMore && !loading) {
          fetchPage(page + 1, true);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, page, fetchPage]);

  if (!isLoggedIn) {
    return (
      <div className={styles.emptyState}>
        <Bell size={48} />
        <h2>Sign in to see your notifications</h2>
        <button
          className={styles.primaryBtn}
          onClick={() => onRequireAuth?.("login", { page: "notifications" })}
        >
          Sign in
        </button>
      </div>
    );
  }

  const handleClick = async (n) => {
    if (!n.isRead) {
      try {
        await notificationAPI.markAsRead(n._id);
        setItems((prev) =>
          prev.map((x) => (x._id === n._id ? { ...x, isRead: true } : x))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch (e) {
        /* best-effort */
      }
    }
    const dest = DEEP_LINKS[n.type]?.(n, user);
    if (dest && onNavigate) onNavigate(dest.page, dest.payload || {});
  };

  const handleDelete = async (n) => {
    if (busy) return;
    setBusy(true);
    try {
      await notificationAPI.delete(n._id);
      setItems((prev) => prev.filter((x) => x._id !== n._id));
      if (!n.isRead) setUnreadCount((c) => Math.max(0, c - 1));
      addToast?.("Notification deleted", "success");
    } catch (err) {
      addToast?.("Failed to delete notification", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleClearRead = async () => {
    if (busy) return;
    if (!window.confirm("Clear all read notifications? This cannot be undone.")) return;
    setBusy(true);
    try {
      await notificationAPI.clearAll();
      setItems((prev) => prev.filter((x) => !x.isRead));
      addToast?.("Read notifications cleared", "success");
    } catch (err) {
      addToast?.("Failed to clear notifications", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleMarkAllRead = async () => {
    if (busy || unreadCount === 0) return;
    setBusy(true);
    try {
      await notificationAPI.markAllAsRead();
      setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
      setUnreadCount(0);
      addToast?.("All notifications marked as read", "success");
    } catch (err) {
      addToast?.("Failed to mark all read", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <SEO title="Notifications | SiiShop" description="Your notification inbox" />

      <header className={styles.header}>
        <div className={styles.titleRow}>
          <Bell size={24} />
          <h1>Notifications</h1>
          {unreadCount > 0 && (
            <span className={styles.unreadBadge}>{unreadCount} unread</span>
          )}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleMarkAllRead}
            disabled={busy || unreadCount === 0}
          >
            <CheckCheck size={16} /> Mark all read
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleClearRead}
            disabled={busy}
          >
            <Trash2 size={16} /> Clear read
          </button>
        </div>
      </header>

      <div className={styles.controls}>
        <div className={styles.searchBox}>
          <Search size={16} />
          <input
            type="search"
            placeholder="Search notifications…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className={styles.clearSearch}
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <label className={styles.unreadToggle}>
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
          />
          <span>Unread only</span>
        </label>
      </div>

      <div className={styles.filterRow}>
        <Filter size={14} />
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`${styles.chip} ${filter === f.value ? styles.chipActive : ""}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading && items.length === 0 ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p>Loading notifications…</p>
        </div>
      ) : items.length === 0 ? (
        <div className={styles.emptyState}>
          <Inbox size={48} />
          <h2>No notifications</h2>
          <p>You're all caught up. We'll let you know when something new arrives.</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {items.map((n) => (
            <li
              key={n._id}
              className={`${styles.item} ${!n.isRead ? styles.itemUnread : ""}`}
            >
              <button
                type="button"
                className={styles.itemBody}
                onClick={() => handleClick(n)}
              >
                <div className={styles.itemIcon}>
                  {!n.isRead && <span className={styles.unreadDot} />}
                </div>
                <div className={styles.itemContent}>
                  <div className={styles.itemTitleRow}>
                    <span className={styles.itemTitle}>{n.title || n.type}</span>
                    <span className={styles.itemTime}>{formatRelativeTime(n.createdAt)}</span>
                  </div>
                  <p className={styles.itemMessage}>{n.message}</p>
                  <div className={styles.itemMeta}>
                    <span className={styles.typeChip}>{n.type}</span>
                    {n.priority === "high" && (
                      <span className={styles.priorityChip}>High priority</span>
                    )}
                  </div>
                </div>
              </button>
              <button
                type="button"
                className={styles.deleteBtn}
                onClick={() => handleDelete(n)}
                disabled={busy}
                aria-label="Delete notification"
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div ref={sentinelRef} className={styles.sentinel}>
        {hasMore && !loading && <span>Loading more…</span>}
      </div>

      <footer className={styles.footer}>
        Showing {items.length} of {total} notifications
      </footer>
    </div>
  );
}
