// components/Navbar.jsx — v5: with search bar
import { useState, useRef, useEffect } from "react";
import { useAuth }     from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { productAPI, vendorAPI } from "../services/api";
import { getImageUrl } from "../utils/image";
import UserDropdown    from "./auth/UserDropdown";
import styles          from "./Navbar.module.css";

const DEBOUNCE_MS = 300;

export default function Navbar({ cartCount, currentPage, onNavigate, onOpenAuth }) {
  const { isLoggedIn, isAdmin, isApprovedVendor } = useAuth();
  const { currency, setCurrency, currencies }      = useCurrency();
  const [menuOpen, setMenuOpen]       = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState({ products: [], vendors: [] });
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);

  // Close currency dropdown on outside click
  useEffect(() => {
    function handle(e) {
      if (currencyRef.current && !currencyRef.current.contains(e.target)) {
        setCurrencyOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults({ products: [], vendors: [] });
      setSearchOpen(false);
      return;
    }

    setSearchLoading(true);
    setSearchOpen(true);

    const timer = setTimeout(async () => {
      try {
        // Search products (by name, description, category)
        const products = await productAPI.getAll({ search: searchQuery, limit: 5 });
        // Search vendors (by store name, name, description)
        const vendors = await vendorAPI.search(searchQuery);

        setSearchResults({
          products: Array.isArray(products) ? products.slice(0, 5) : [],
          vendors: Array.isArray(vendors) ? vendors.slice(0, 3) : [],
        });
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setSearchLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  function nav(page, data) {
    setSearchOpen(false);
    setSearchQuery("");
    if (data) {
      onNavigate(page, data);
    } else {
      onNavigate(page);
    }
    setMenuOpen(false);
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    // Navigate to home with search query
    onNavigate("home", { search: searchQuery });
    setSearchOpen(false);
  }

  const NAV_LINKS = [
    ["home",    "Shop"],
    ["vendors", "Stores"],
  ];

  const totalResults = searchResults.products.length + searchResults.vendors.length;

  return (
    <nav className={styles.nav}>
      <div className={`container ${styles.inner}`}>
        {/* Logo */}
        <button className={styles.logo} onClick={() => nav("home")}>
          <span className={styles.logoIcon}>🛍️</span>
          <span>Sii<strong>Shop</strong></span>
        </button>

        {/* Search Bar */}
        <div className={styles.searchWrap} ref={searchRef}>
          <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              type="text"
              placeholder="Search products, stores, categories..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={styles.searchInput}
              onFocus={() => searchQuery.trim() && setSearchOpen(true)}
            />
            {searchQuery && (
              <button type="button" className={styles.searchClear} onClick={() => { setSearchQuery(""); setSearchOpen(false); }}>
                ✕
              </button>
            )}
          </form>

          {/* Search Results Dropdown */}
          {searchOpen && searchQuery.trim() && (
            <div className={styles.searchDropdown}>
              {searchLoading ? (
                <div className={styles.searchLoading}>Searching...</div>
              ) : totalResults === 0 ? (
                <div className={styles.searchEmpty}>No results found for "{searchQuery}"</div>
              ) : (
                <>
                  {/* Products */}
                  {searchResults.products.length > 0 && (
                    <div className={styles.searchSection}>
                      <div className={styles.searchSectionTitle}>Products</div>
                      {searchResults.products.map(p => (
                        <button key={p._id} className={styles.searchResult} onClick={() => nav("product", p)}>
                          <img
                            src={getImageUrl(p.images?.[0]?.url || p.image)}
                            alt={p.name}
                            className={styles.searchResultImg}
                          />
                          <div className={styles.searchResultInfo}>
                            <div className={styles.searchResultName}>{p.name}</div>
                            <div className={styles.searchResultMeta}>{p.category} • ₵{p.price}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Vendors */}
                  {searchResults.vendors.length > 0 && (
                    <div className={styles.searchSection}>
                      <div className={styles.searchSectionTitle}>Stores</div>
                      {searchResults.vendors.map(v => (
                        <button key={v._id} className={styles.searchResult} onClick={() => nav("vendors", { vendor: v })}>
                          <div className={styles.searchResultVendorImg}>
                            {v.storeLogo
                              ? <img src={getImageUrl(v.storeLogo)} alt={v.storeName} />
                              : <span>🏪</span>
                            }
                          </div>
                          <div className={styles.searchResultInfo}>
                            <div className={styles.searchResultName}>{v.storeName}</div>
                            <div className={styles.searchResultMeta}>{v.storeDescription?.slice(0, 50)}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* View All Link */}
                  <button className={styles.searchViewAll} onClick={() => nav("home", { search: searchQuery })}>
                    View all results for "{searchQuery}" →
                  </button>
                </>
              )}
            </div>
          )}
        </div>

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
          {/* Mobile Search */}
          <div className={styles.mobileSearch}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              type="text"
              placeholder="Search products, stores..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={styles.mobileSearchInput}
            />
          </div>

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