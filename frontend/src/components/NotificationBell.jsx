// components/NotificationBell.jsx - Notification bell with dropdown
import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { notificationAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import styles from "./NotificationBell.module.css";

export default function NotificationBell({ userId, onNavigate }) {
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

  const handleNotificationClick = (notification) => {
    if (!notification.isRead) {
      handleMarkAsRead(notification._id);
    }
    setShowPanel(false);
    // Navigate based on notification type
    if (notification.type?.includes("withdrawal")) {
      onNavigate?.("vendor");
    } else if (notification.type === "commission_paid" && isAdmin) {
      // Admins land on the Admin Dashboard wallet tab. Vendor
      // recipients never see this type (admins are the only
      // recipients), but the role gate is here for safety.
      onNavigate?.("admin");
    } else if (notification.type === "review_request") {
      // Review request — the bell's payload already carries the
      // orderId in metadata (or, as a fallback, in referenceId).
      // The ReviewPage resolves that orderId into the list of
      // items the customer can still review.
      const orderId =
        notification.metadata?.orderId || notification.referenceId;
      onNavigate?.("review", { orderId, source: "notification" });
    }
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