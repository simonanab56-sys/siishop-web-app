import { useState, useRef, useEffect } from "react";
import { Search, Menu, X, Info, Mail, FileText, RefreshCw, HelpCircle } from "lucide-react";
import styles from "./MobileTopHeader.module.css";

const MENU_ITEMS = [
  { id: "about", label: "About", icon: Info, route: "about" },
  { id: "contact", label: "Contact", icon: Mail, route: "contact" },
  { id: "terms", label: "Terms", icon: FileText, route: "terms" },
  { id: "refund", label: "Refund Policy", icon: RefreshCw, route: "refund" },
  { id: "faq", label: "FAQ", icon: HelpCircle, route: "faq" },
];

export default function MobileTopHeader({
  onNavigate,
  onToggleMenu,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  menuOpen,
  onCloseMenu
}) {
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const searchInputRef = useRef(null);

  // Handle scroll shadow
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Handle search submit on Enter key
  const handleSearchSubmit = (e) => {
    e?.preventDefault();
    if (onSearchSubmit && searchQuery && searchQuery.trim()) {
      onSearchSubmit(searchQuery);
    }
  };

  const handleMenuItemClick = (route) => {
    onNavigate(route);
    if (onCloseMenu) onCloseMenu();
  };

  return (
    <>
      <header className={`${styles.header} ${isScrolled ? styles.scrolled : ""}`}>
        <div className={styles.container}>
          {/* Logo */}
          <button className={styles.logo} onClick={() => onNavigate("home")} aria-label="Go to home">
            <span className={styles.logoIcon}>🛍️</span>
            <span className={styles.logoText}>Sii<span className={styles.logoStrong}>Shop</span></span>
          </button>

          {/* Search Bar */}
          <form className={styles.searchForm} onSubmit={handleSearchSubmit}>
            <div className={`${styles.searchWrapper} ${isSearchFocused ? styles.focused : ""}`}>
              <Search className={styles.searchIcon} size={18} />
              <input
                ref={searchInputRef}
                type="text"
                className={styles.searchInput}
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (onSearchSubmit && searchQuery && searchQuery.trim()) {
                      onSearchSubmit(searchQuery);
                    }
                  }
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={() => {
                    if (onSearchChange) onSearchChange("");
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </form>

          {/* Menu Button */}
          <button className={styles.menuBtn} onClick={onToggleMenu} aria-label="Open menu" aria-expanded={menuOpen}>
            <Menu size={24} />
          </button>
        </div>
      </header>

      {/* Menu Overlay */}
      {menuOpen && (
        <div className={styles.menuOverlay} onClick={onCloseMenu}>
          <div className={styles.menuDrawer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.menuHeader}>
              <span className={styles.menuTitle}>Menu</span>
              <button className={styles.menuClose} onClick={onCloseMenu} aria-label="Close menu">
                <X size={20} />
              </button>
            </div>

            <div className={styles.menuItems}>
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    className={styles.menuItem}
                    onClick={() => handleMenuItemClick(item.route)}
                  >
                    <Icon size={20} className={styles.menuItemIcon} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}