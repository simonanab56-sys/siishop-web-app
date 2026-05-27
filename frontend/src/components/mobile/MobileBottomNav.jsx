import { useState } from "react";
import { Home, Grid3X3, Store, ShoppingCart, User, LogOut, Package, Store as StoreIcon, Settings, X, MessageCircle } from "lucide-react";
import styles from "./MobileBottomNav.module.css";

const BASE_NAV_ITEMS = [
  { id: "home", label: "Home", icon: Home, route: "home" },
  { id: "categories", label: "Categories", icon: Grid3X3, route: "categories" },
  { id: "stores", label: "Stores", icon: Store, route: "vendors" },
  { id: "cart", label: "Cart", icon: ShoppingCart, route: "cart" },
];

export default function MobileBottomNav({
  currentPage,
  onNavigate,
  cartCount,
  isLoggedIn,
  isAdmin,
  isApprovedVendor,
  onOpenAuth,
  onLogout
}) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const getPageId = (page) => {
    if (page === "home") return "home";
    if (page === "categories") return "categories";
    if (page === "vendors") return "stores";
    if (page === "cart") return "cart";
    if (page === "settings" || page === "orders" || page === "vendor" || page === "admin") return "profile";
    return page;
  };

  const activeId = getPageId(currentPage);

  const handleProfileClick = () => {
    if (isLoggedIn) {
      setShowProfileMenu(!showProfileMenu);
    } else if (onOpenAuth) {
      onOpenAuth("login");
    }
  };

  const handleNav = (route) => {
    onNavigate(route);
    setShowProfileMenu(false);
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
    setShowProfileMenu(false);
  };

  const getProfileIcon = () => {
    if (!isLoggedIn) return User;
    return isLoggedIn ? User : User;
  };

  const getProfileLabel = () => {
    if (!isLoggedIn) return "Sign In";
    return "Account";
  };

  const ProfileIcon = getProfileIcon();

  return (
    <>
      <nav className={styles.nav}>
        <div className={styles.container}>
          {BASE_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeId === item.id;
            const showBadge = item.id === "cart" && cartCount > 0;

            return (
              <button
                key={item.id}
                className={`${styles.navItem} ${isActive ? styles.active : ""}`}
                onClick={() => handleNav(item.route)}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
              >
                <div className={styles.iconWrapper}>
                  <Icon size={22} className={styles.icon} />
                  {showBadge && (
                    <span className={styles.badge}>
                      {cartCount > 99 ? "99+" : cartCount}
                    </span>
                  )}
                </div>
                <span className={styles.label}>{item.label}</span>
              </button>
            );
          })}

          {/* Profile Tab */}
          <button
            className={`${styles.navItem} ${activeId === "profile" ? styles.active : ""}`}
            onClick={handleProfileClick}
            aria-label={getProfileLabel()}
            aria-expanded={showProfileMenu}
          >
            <div className={styles.iconWrapper}>
              <ProfileIcon size={22} className={styles.icon} />
            </div>
            <span className={styles.label}>{getProfileLabel()}</span>
          </button>
        </div>
      </nav>

      {/* Profile Menu Dropdown */}
      {showProfileMenu && isLoggedIn && (
        <div className={styles.menuOverlay} onClick={() => setShowProfileMenu(false)}>
          <div className={styles.menuDropdown} onClick={(e) => e.stopPropagation()}>
            <div className={styles.menuHeader}>
              <span className={styles.menuTitle}>My Account</span>
              <button className={styles.menuClose} onClick={() => setShowProfileMenu(false)} aria-label="Close menu">
                <X size={20} />
              </button>
            </div>

            <div className={styles.menuItems}>
              <button className={styles.menuItem} onClick={() => handleNav("chat")}>
                <MessageCircle size={20} />
                <span>Messages</span>
              </button>

              <button className={styles.menuItem} onClick={() => handleNav("orders")}>
                <Package size={20} />
                <span>My Orders</span>
              </button>

              <button className={styles.menuItem} onClick={() => handleNav("settings")}>
                <Settings size={20} />
                <span>Settings</span>
              </button>

              {isApprovedVendor && (
                <button className={styles.menuItem} onClick={() => handleNav("vendor")}>
                  <StoreIcon size={20} />
                  <span>Vendor Dashboard</span>
                </button>
              )}

              {isAdmin && (
                <button className={styles.menuItem} onClick={() => handleNav("admin")}>
                  <StoreIcon size={20} />
                  <span>Admin Dashboard</span>
                </button>
              )}

              <div className={styles.menuDivider} />

              <button className={`${styles.menuItem} ${styles.menuItemLogout}`} onClick={handleLogout}>
                <LogOut size={20} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}