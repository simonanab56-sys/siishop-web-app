// components/auth/UserDropdown.jsx — v2: vendor dashboard link
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import styles from "./UserDropdown.module.css";

export default function UserDropdown({ onNavigate }) {
  const { user, logout, isAdmin, isVendor, isApprovedVendor } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  function go(page) { onNavigate(page); setOpen(false); }
  function handleLogout() { logout(); setOpen(false); onNavigate("home"); }

  const initials = (user?.name || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className={styles.wrapper} ref={ref}>
      <button className={styles.avatar} onClick={() => setOpen(v => !v)} aria-label="User menu" title={user?.name}>
        {initials}
        {isAdmin  && <span className={styles.adminDot} title="Admin" />}
        {isVendor && !isAdmin && <span className={styles.vendorDot} title="Vendor" />}
      </button>

      {open && (
        <div className={styles.dropdown}>
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
      )}
    </div>
  );
}
