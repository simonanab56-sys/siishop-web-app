// components/Navbar.jsx — v6: with notifications
import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth }     from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import UserDropdown    from "./auth/UserDropdown";
import NotificationBell from "./NotificationBell";
import styles          from "./Navbar.module.css";

const DEBOUNCE_MS = 100; // Fast response for instant filtering

export default function Navbar({ cartCount, chatUnreadCount = 0, currentPage, onNavigate, onOpenAuth, onSearch, searchQuery }) {
  const { user, isLoggedIn, isAdmin, isApprovedVendor } = useAuth();
  const { currency, setCurrency, currencies }      = useCurrency();
  const [menuOpen, setMenuOpen]       = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(searchQuery || "");
  const currencyRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Sync with prop
  useEffect(() => {
    if (searchQuery !== undefined) {
      setSearchInput(searchQuery);
    }
  }, [searchQuery]);

  // Instant search on typing
  const handleSearchChange = useCallback((value) => {
    setSearchInput(value);

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Trigger search immediately on typing
    if (onSearch) {
      onSearch(value);
    }

    // Also set debounced search for potential future use
    if (value && onSearch) {
      searchTimeoutRef.current = setTimeout(() => {
        onSearch(value);
      }, DEBOUNCE_MS);
    }
  }, [onSearch]);

  // Handle search submit (Enter key or button click)
  const handleSearchSubmit = useCallback((e) => {
    e?.preventDefault();
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (onSearch) {
      onSearch(searchInput);
    }
  }, [onSearch, searchInput]);

  // Handle clear search
  const handleClearSearch = useCallback(() => {
    setSearchInput("");
    if (onSearch) {
      onSearch("");
    }
  }, [onSearch]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

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

        {/* Desktop Search Bar */}
        <form className={styles.searchForm} onSubmit={handleSearchSubmit}>
          <div className={styles.searchWrapper}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search products, brands..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            {searchInput && (
              <button
                type="button"
                className={styles.clearBtn}
                onClick={handleClearSearch}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
            <button
              type="submit"
              className={styles.searchBtn}
              aria-label="Search"
            >
              🔍
            </button>
          </div>
        </form>

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

          {/* Messages/Chat */}
          {isLoggedIn && (
            <button className={styles.cartBtn} onClick={() => nav("chat")}>
              <span>💬</span>
              {chatUnreadCount > 0 && <span className={styles.cartBadge}>{chatUnreadCount > 99 ? "99+" : chatUnreadCount}</span>}
              <span className={styles.cartLabel}>Messages</span>
            </button>
          )}

          {/* Notifications */}
          {isLoggedIn && (
            <NotificationBell
              userId={user?._id}
              onNavigate={nav}
            />
          )}

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
          {isLoggedIn && (
            <button className={styles.mobileLink} onClick={() => nav("vendor")}>
              🔔 Notifications
            </button>
          )}
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
