// components/Navbar.jsx — v4: currency switcher, fully responsive
import { useState, useRef, useEffect } from "react";
import { useAuth }     from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import UserDropdown    from "./auth/UserDropdown";
import styles          from "./Navbar.module.css";

export default function Navbar({ cartCount, currentPage, onNavigate, onOpenAuth }) {
  const { isLoggedIn, isAdmin, isApprovedVendor } = useAuth();
  const { currency, setCurrency, currencies }      = useCurrency();
  const [menuOpen, setMenuOpen]       = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const currencyRef = useRef(null);

  // Close currency dropdown on outside click
  useEffect(() => {
    function handle(e) { if (currencyRef.current && !currencyRef.current.contains(e.target)) setCurrencyOpen(false); }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function nav(page) { onNavigate(page); setMenuOpen(false); }

  const NAV_LINKS = [
    ["home",    "Shop"],
    ["vendors", "Stores"],
  ];

  return (
    <nav className={styles.nav}>
      <div className={`container ${styles.inner}`}>
        {/* Logo */}
        <button className={styles.logo} onClick={() => nav("home")}>
          <span className={styles.logoIcon}>🛍️</span>
          <span>Sii<strong>Shop</strong></span>
        </button>

        {/* Desktop nav links */}
        <div className={styles.links}>
          {NAV_LINKS.map(([page, label]) => (
            <button key={page}
              className={`${styles.link} ${currentPage === page ? styles.active : ""}`}
              onClick={() => nav(page)}>
              {label}
            </button>
          ))}
        </div>

        {/* Right actions */}
        <div className={styles.actions}>
          {/* Currency switcher */}
          <div className={styles.currencyWrap} ref={currencyRef}>
            <button className={styles.currencyBtn} onClick={() => setCurrencyOpen(v => !v)} title="Change currency">
              <span>{currencies[currency]?.symbol || "GH₵"}</span>
              <span className={styles.currencyCode}>{currency}</span>
            </button>
            {currencyOpen && (
              <div className={styles.currencyDropdown}>
                {Object.values(currencies).map(c => (
                  <button key={c.code}
                    className={`${styles.currencyOption} ${currency === c.code ? styles.currencyActive : ""}`}
                    onClick={() => { setCurrency(c.code); setCurrencyOpen(false); }}>
                    <span className={styles.currencySymbol}>{c.symbol}</span>
                    <span className={styles.currencyName}>{c.code} — {c.name}</span>
                    {currency === c.code && <span className={styles.currencyCheck}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cart */}
          <button className={styles.cartBtn} onClick={() => nav("cart")}>
            <span>🛒</span>
            {cartCount > 0 && <span className={styles.cartBadge}>{cartCount > 99 ? "99+" : cartCount}</span>}
            <span className={styles.cartLabel}>Cart</span>
          </button>

          {/* Auth */}
          {isLoggedIn
            ? <UserDropdown onNavigate={nav} />
            : <button className={styles.signInBtn} onClick={onOpenAuth}>Sign In</button>
          }
        </div>

        {/* Hamburger — mobile only */}
        <button className={styles.hamburger} onClick={() => setMenuOpen(v => !v)} aria-label="Toggle menu" aria-expanded={menuOpen}>
          <span className={`${styles.hbar} ${menuOpen ? styles.hbar1Open : ""}`} />
          <span className={`${styles.hbar} ${menuOpen ? styles.hbar2Open : ""}`} />
          <span className={`${styles.hbar} ${menuOpen ? styles.hbar3Open : ""}`} />
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className={styles.mobileMenu}>
          {NAV_LINKS.map(([page, label]) => (
            <button key={page} className={`${styles.mobileLink} ${currentPage===page ? styles.mobileLinkActive : ""}`}
              onClick={() => nav(page)}>
              {page === "home" ? "🛍️" : page === "vendors" ? "🏪" : "📦"} {label}
            </button>
          ))}
          <button className={styles.mobileLink} onClick={() => nav("cart")}>
            🛒 Cart {cartCount > 0 && `(${cartCount})`}
          </button>
          {isApprovedVendor && (
            <button className={styles.mobileLink} onClick={() => nav("vendor")}>🏪 Vendor Dashboard</button>
          )}
          {isAdmin && (
            <button className={styles.mobileLink} onClick={() => nav("admin")}>🛠️ Admin</button>
          )}
          {/* Currency in mobile menu */}
          <div className={styles.mobileCurrencyRow}>
            <span className={styles.mobileCurrencyLabel}>Currency:</span>
            {Object.values(currencies).map(c => (
              <button key={c.code}
                className={`${styles.mobileCurrencyChip} ${currency === c.code ? styles.mobileCurrencyChipActive : ""}`}
                onClick={() => { setCurrency(c.code); setMenuOpen(false); }}>
                {c.symbol} {c.code}
              </button>
            ))}
          </div>
          {!isLoggedIn && (
            <button className={`${styles.mobileLink} ${styles.mobileLinkPrimary}`}
              onClick={() => { onOpenAuth(); setMenuOpen(false); }}>
              👤 Sign In / Register
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
