// components/NotificationBell.jsx - Notification bell with dropdown
import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { notificationAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import socketService from "../services/socket";
import styles from "./NotificationBell.module.css";

export default function NotificationBell({ userId, onNavigate, onRequireAuth, onOpenAuth }) {
  const { user } = useAuth();
  const [showPanel, setShowPanel] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  // The notification panel is portaled into document.body so it
  // can't be clipped by the sticky Navbar or any ancestor `overflow:
  // hidden`. `pos` carries the live viewport coordinates computed
  // from the trigger button's bounding rect.
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const isAdmin = !!user?.isAdmin;

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await notificationAPI.getNotifications({ limit: 10 });
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  }, [userId]);

  const fetchUnreadCount = useCallback(async () => {
    if (!userId) return;
    try {
      const { count } = await notificationAPI.getUnreadCount();
      setUnreadCount(count || 0);
    } catch (err) {
      console.error("Failed to fetch unread count:", err);
    }
  }, [userId]);

  useEffect(() => {
    if (userId && showPanel) {
      fetchNotifications();
    }
  }, [userId, showPanel, fetchNotifications]);

  useEffect(() => {
    if (!userId) return;
    fetchUnreadCount();
    // Poll every 30 seconds (minimum recommended)
    const interval = setInterval(fetchUnreadCount, 30000);
    // Refresh on page focus
    const handleFocus = () => fetchUnreadCount();
    window.addEventListener("focus", handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [userId, fetchUnreadCount]);

  // Live update on admin-notification (pushed by AdminDashboard
  // when the socket receives a commission_paid broadcast). The
  // listener is added regardless of role — if a non-admin somehow
  // receives the event the handler is a no-op on the server side,
  // and the bell just refreshes its badge. The 30s poll above
  // remains the source of truth for non-admins.
  useEffect(() => {
    const handleAdminNotification = () => {
      fetchUnreadCount();
      if (showPanel) fetchNotifications();
    };
    window.addEventListener("admin-notification", handleAdminNotification);
    return () => {
      window.removeEventListener("admin-notification", handleAdminNotification);
    };
  }, [fetchUnreadCount, fetchNotifications, showPanel]);

  // Phase 2: per-user real-time channel. When a logged-in user opens
  // the bell, connect the socket (idempotent) and join the user's
  // notification room. The server then pushes "user-notification"
  // events the moment notifyUser() creates a row — the bell badge
  // updates without waiting for the 30s poll. Admins still get
  // their admin-notify-room events (handled in AdminDashboard);
  // admins ALSO join the per-user room so they see their own
  // account-level notifications.
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;
        await socketService.connect(token);
        if (cancelled) return;
        socketService.joinUserRoom(userId);

        const handler = () => {
          // The server's user-notification payload doesn't carry the
          // full row, just a type/title/deepLink. The bell re-fetches
          // the count + the panel list to keep the UI consistent.
          fetchUnreadCount();
          if (showPanel) fetchNotifications();
        };
        socketService.on("user-notification", handler);

        // Stash cleanup on the socket service for the next effect
        // teardown via a local listener-remove closure.
        return () => {
          socketService.off("user-notification", handler);
          socketService.leaveUserRoom(userId);
        };
      } catch (err) {
        // Non-fatal — bell still updates via 30s poll.
        // eslint-disable-next-line no-console
        console.warn("[NotificationBell] per-user socket connect failed:", err.message);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isAdmin]);

  // Close panel when clicking outside (or Escape). The portal moves
  // the panel out of the trigger's DOM tree, so the outside-click
  // test has to check BOTH the trigger ref and the panel ref.
  useEffect(() => {
    function handleClickOutside(event) {
      const t = event.target;
      if (panelRef.current && panelRef.current.contains(t)) return;
      if (triggerRef.current && triggerRef.current.contains(t)) return;
      setShowPanel(false);
    }
    if (showPanel) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPanel]);

  useEffect(() => {
    if (!showPanel) return;
    const fn = (e) => { if (e.key === "Escape") setShowPanel(false); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [showPanel]);

  // Re-anchor the panel on open and on scroll/resize. A sticky
  // Navbar that scrolls (e.g. long admin tables) would otherwise
  // leave the panel floating in stale coordinates.
  useLayoutEffect(() => {
    if (!showPanel) return;
    function place() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({
        top: r.bottom + 8,
        right: Math.max(8, window.innerWidth - r.right),
      });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [showPanel]);

  const handleMarkAsRead = async (id) => {
    try {
      await notificationAPI.markAsRead(id);
      setNotifications(prev =>
        prev.map(n => n._id === id ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationAPI.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  // Phase 2: a single dispatch table that maps notification.type to
  // a {page, payload} destination. The old 4-branch if/else chain
  // only covered 3 notification types; the table below covers 30+
  // so every wire-up in services/notification.service.js actually
  // deep-links somewhere useful.
  //
  // Each entry returns { page, payload } or null. The fallback case
  // (no entry) just closes the panel and stays on the current page.
  //
  // The page key matches the keys used by App.jsx's `case` ladder
  // (home, orders, vendor, admin, settings, etc.).
  const DEEP_LINKS = {
    // Reviews
    review_request: (n) => ({
      page: "review",
      payload: { orderId: n.metadata?.orderId || n.referenceId, source: "notification" },
    }),

    // Wallet — vendors land on the vendor wallet tab
    withdrawal_submitted:    () => ({ page: "vendor", payload: { tab: "wallet" } }),
    withdrawal_approved:     () => ({ page: "vendor", payload: { tab: "wallet" } }),
    withdrawal_processing:   () => ({ page: "vendor", payload: { tab: "wallet" } }),
    withdrawal_completed:    () => ({ page: "vendor", payload: { tab: "wallet" } }),
    withdrawal_rejected:     () => ({ page: "vendor", payload: { tab: "wallet" } }),
    commission_due:          () => ({ page: "vendor", payload: { tab: "wallet" } }),
    commission_overdue:      () => ({ page: "vendor", payload: { tab: "wallet" } }),

    // Commission paid — admins go to the admin commissions tab,
    // vendors to the vendor wallet tab.
    commission_paid: (n, role) => role === "admin"
      ? { page: "admin", payload: { tab: "commissions" } }
      : { page: "vendor", payload: { tab: "wallet" } },

    // New order to vendor
    order_new:               () => ({ page: "vendor", payload: { tab: "orders" } }),
    order_status:            () => ({ page: "vendor", payload: { tab: "orders" } }),

    // Customer-facing order notifications
    order_placed:            (n) => ({ page: "orders", payload: { orderId: n.metadata?.orderId || n.referenceId } }),
    order_accepted:          (n) => ({ page: "orders", payload: { orderId: n.metadata?.orderId || n.referenceId } }),
    order_preparing:         (n) => ({ page: "orders", payload: { orderId: n.metadata?.orderId || n.referenceId } }),
    order_packed:            (n) => ({ page: "orders", payload: { orderId: n.metadata?.orderId || n.referenceId } }),
    rider_assigned:          (n) => ({ page: "delivery-tracking", payload: { orderId: n.metadata?.orderId || n.referenceId } }),
    out_for_delivery:        (n) => ({ page: "delivery-tracking", payload: { orderId: n.metadata?.orderId || n.referenceId } }),
    payment_succeeded:       (n) => ({ page: "orders", payload: { orderId: n.metadata?.orderId || n.referenceId } }),
    payment_failed:          (n) => ({ page: "orders", payload: { orderId: n.metadata?.orderId || n.referenceId } }),
    refund_processed:        (n) => ({ page: "orders", payload: { orderId: n.metadata?.orderId || n.referenceId } }),
    cancellation_approved:   (n) => ({ page: "orders", payload: { orderId: n.metadata?.orderId || n.referenceId } }),

    // Product / vendor / restaurant admin actions
    product_approved:        () => ({ page: "vendor", payload: { tab: "products" } }),
    product_rejected:        () => ({ page: "vendor", payload: { tab: "products" } }),
    product_hidden:          () => ({ page: "vendor", payload: { tab: "products" } }),
    product_low_stock:       () => ({ page: "vendor", payload: { tab: "products" } }),
    product_out_of_stock:    () => ({ page: "vendor", payload: { tab: "products" } }),
    new_review:              () => ({ page: "vendor", payload: { tab: "reviews" } }),
    kyc_approved:            () => ({ page: "vendor", payload: { tab: "settings" } }),
    kyc_rejected:            () => ({ page: "vendor", payload: { tab: "settings" } }),
    store_approved:          () => ({ page: "vendor", payload: {} }),
    store_suspended:         () => ({ page: "vendor", payload: {} }),
    store_restored:          () => ({ page: "vendor", payload: {} }),
    restaurant_approved:     () => ({ page: "restaurant-dashboard", payload: {} }),
    restaurant_rejected:     () => ({ page: "restaurant-dashboard", payload: {} }),
    restaurant_suspended:    () => ({ page: "restaurant-dashboard", payload: {} }),
    restaurant_restored:     () => ({ page: "restaurant-dashboard", payload: {} }),

    // Promotions / wishlist
    coupon_received:         () => ({ page: "deals", payload: {} }),
    promo_available:         () => ({ page: "deals", payload: {} }),
    flash_sale:              () => ({ page: "deals", payload: {} }),
    wishlist_price_drop:     () => ({ page: "wishlist", payload: {} }),
    wishlist_stock_available:() => ({ page: "wishlist", payload: {} }),

    // Account / support
    support_reply:           (n) => ({ page: "chat", payload: { conversationId: n.metadata?.conversationId } }),
    account_suspended:       () => ({ page: "settings", payload: {} }),
    account_restored:        () => ({ page: "settings", payload: {} }),
  };

  // Auth-gated navigation: if the user is logged out, save the
  // destination via the new generic `pendingDestination` slot and
  // prompt them to sign in. The App.jsx#onAuthSuccess handler
  // restores the destination after login. `onRequireAuth` is the
  // App-level prop; fall back to `onOpenAuth` (which Navbar uses)
  // when the bell is mounted in a Navbar context.
  const safeNavigate = (page, payload) => {
    if (!user) {
      const auth = onRequireAuth || onOpenAuth;
      auth?.("login", { page, payload });
      return;
    }
    onNavigate?.(page, payload);
  };

  const handleNotificationClick = (notification) => {
    if (!notification.isRead) {
      handleMarkAsRead(notification._id);
    }
    setShowPanel(false);

    const role = isAdmin ? "admin" : (user?.isVendor ? "vendor" : "customer");
    const dest = DEEP_LINKS[notification.type]?.(notification, role);

    if (dest) {
      safeNavigate(dest.page, dest.payload || {});
    }
    // else: just close the panel — the user can act on it later
    // from the NotificationsPage inbox.
  };

  const getNotificationIcon = (type) => {
    if (type?.includes("withdrawal_submitted")) return "💸";
    if (type?.includes("withdrawal_approved")) return "✅";
    if (type?.includes("withdrawal_processing")) return "🔄";
    if (type?.includes("withdrawal_completed")) return "🎉";
    if (type?.includes("withdrawal_rejected")) return "❌";
    if (type === "commission_paid") return "💰";
    if (type === "review_request") return "⭐";
    if (type?.includes("order")) return "📦";
    return "🔔";
  };

  if (!userId) return null;

  // The dropdown panel itself, portaled into document.body. Live
  // `top`/`right` are passed in via inline style; the CSS rule owns
  // the visual chrome and the z-index (1100, above the sticky
  // Navbar's 200). The bell button stays in normal flow.
  const panelNode = showPanel ? (
    <div
      ref={panelRef}
      className={styles.panel}
      style={{ position: "fixed", top: pos.top, right: pos.right }}
    >
      <div className={styles.panelHeader}>
        <h4>Notifications</h4>
        {unreadCount > 0 && (
          <button className={styles.markAllBtn} onClick={handleMarkAllAsRead}>
            Mark all read
          </button>
        )}
      </div>

      <div className={styles.notificationList}>
        {notifications.length === 0 ? (
          <div className={styles.emptyState}>
            <span>🔔</span>
            <p>No notifications yet</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification._id}
              className={`${styles.notificationItem} ${!notification.isRead ? styles.unread : ""}`}
              onClick={() => handleNotificationClick(notification)}
            >
              <span className={styles.notificationIcon}>
                {getNotificationIcon(notification.type)}
              </span>
              <div className={styles.notificationContent}>
                <span className={styles.notificationTitle}>{notification.title}</span>
                <span className={styles.notificationMessage}>{notification.message}</span>
                <span className={styles.notificationTime}>
                  {new Date(notification.createdAt).toLocaleDateString()}
                </span>
              </div>
              {!notification.isRead && <span className={styles.unreadDot} />}
            </div>
          ))
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className={styles.bellContainer}>
      <button
        ref={triggerRef}
        className={styles.bellButton}
        onClick={() => setShowPanel(!showPanel)}
        aria-label="Notifications"
      >
        <span className={styles.bellIcon}>🔔</span>
        <span className={styles.bellLabel}>Alerts</span>
        {unreadCount > 0 && (
          <span className={styles.badge}>{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {showPanel && createPortal(panelNode, document.body)}
    </div>
  );
}