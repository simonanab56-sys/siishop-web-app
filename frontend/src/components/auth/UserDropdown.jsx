// components/auth/UserDropdown.jsx — v2: vendor dashboard link
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../context/AuthContext";
import styles from "./UserDropdown.module.css";

export default function UserDropdown({ onNavigate }) {
  const { user, logout, isAdmin, isVendor, isApprovedVendor } = useAuth();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  // Live position of the dropdown panel relative to the viewport. The
  // panel is rendered into document.body (see createPortal below) so
  // `position: fixed` against these coordinates is the only way to
  // anchor it to the trigger button without being clipped or pushed
  // around by ancestor stacking contexts.
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    const fn = (e) => {
      const t = e.target;
      if (
        dropdownRef.current && dropdownRef.current.contains(t)
      ) return;
      if (
        triggerRef.current && triggerRef.current.contains(t)
      ) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // Escape to close — same contract as the bell.
  useEffect(() => {
    if (!open) return;
    const fn = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [open]);

  // Re-anchor the panel on open, on scroll, and on resize. Without
  // this, a sticky navbar that scrolls (e.g. long admin tables)
  // would leave the dropdown floating in stale coordinates.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      // 10px gap between trigger and panel — same visual spacing the
      // old `top: calc(100% + 10px)` produced.
      setPos({
        top: r.bottom + 10,
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
  }, [open]);

  function go(page) { onNavigate(page); setOpen(false); }
  function handleLogout() { logout(); setOpen(false); onNavigate("home"); }

  const initials = (user?.name || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  // The dropdown panel is portaled into document.body. This is the
  // only fix that survives any combination of ancestor `overflow:
  // hidden`, sticky / transform / contain, or stacking-context
  // boundaries — the panel now lives in the same rendering tree as
  // the rest of the page, with no clipping or layout reflow. The
  // z-index is set high enough to sit above the sticky Navbar (which
  // is z-index 200) and any in-page modal scrims.
  const dropdownNode = open ? (
    <div
      ref={dropdownRef}
      className={styles.dropdown}
      style={{ position: "fixed", top: pos.top, right: pos.right }}
    >
      <div className={styles.userInfo}>
        <div className={styles.userAvatar}>{initials}</div>
        <div>
          <p className={styles.userName}>{user?.name}</p>
          <p className={styles.userEmail}>{user?.email}</p>
          {isAdmin  && <span className="role-badge role-admin">Admin</span>}
          {isVendor && !isAdmin && (
            <span className="role-badge role-vendor">
              {user?.vendorStatus === "approved" ? "Vendor ✓" : "Vendor (pending)"}
            </span>
          )}
        </div>
      </div>

      <div className={styles.divider} />

      <button className={styles.menuItem} onClick={() => go("orders")}>📦 My Orders</button>
      <button className={styles.menuItem} onClick={() => go("settings")}>⚙️ Settings</button>

      {/* Info links moved from navbar */}
      <button className={styles.menuItem} onClick={() => go("about")}>ℹ️ About</button>
      <button className={styles.menuItem} onClick={() => go("faq")}>❓ FAQ</button>
      <button className={styles.menuItem} onClick={() => go("contact")}>📞 Contact</button>
      <button className={styles.menuItem} onClick={() => go("terms")}>📄 Terms</button>
      <button className={styles.menuItem} onClick={() => go("refund")}>💰 Refund</button>

      {/* Vendor dashboard — shown only to approved vendors */}
      {isApprovedVendor && !isAdmin && (
        <button className={`${styles.menuItem} ${styles.vendorItem}`} onClick={() => go("vendor")}>
          🏪 Vendor Dashboard
        </button>
      )}

      {/* Admin dashboard */}
      {isAdmin && (
        <button className={`${styles.menuItem} ${styles.adminItem}`} onClick={() => go("admin")}>
          🛠️ Admin Dashboard
        </button>
      )}

      <div className={styles.divider} />
      <button className={`${styles.menuItem} ${styles.logoutItem}`} onClick={handleLogout}>🚪 Sign Out</button>
    </div>
  ) : null;

  return (
    <div className={styles.wrapper} ref={triggerRef}>
      <button className={styles.avatar} onClick={() => setOpen(v => !v)} aria-label="User menu" title={user?.name}>
        {initials}
        {isAdmin  && <span className={styles.adminDot} title="Admin" />}
        {isVendor && !isAdmin && <span className={styles.vendorDot} title="Vendor" />}
      </button>

      {open && createPortal(dropdownNode, document.body)}
    </div>
  );
}
