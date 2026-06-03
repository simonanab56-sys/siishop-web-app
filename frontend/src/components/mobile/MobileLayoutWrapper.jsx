import { useState, useEffect, useCallback, useRef } from "react";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { useAuth } from "../../context/AuthContext";
import { notificationAPI } from "../../services/api";
import Navbar from "../Navbar";
import MobileTopHeader from "./MobileTopHeader";
import MobileBottomNav from "./MobileBottomNav";

const DEBOUNCE_MS = 100; // Fast response for mobile

export default function MobileLayoutWrapper({
  children,
  cartCount,
  currentPage,
  onNavigate,
  onOpenAuth,
  isLoggedIn,
  isAdmin,
  isApprovedVendor,
  onSearch,
  searchQuery,
  chatUnreadCount = 0,
}) {
  const isMobile = useIsMobile();
  const { logout, user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery || "");
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const searchTimeoutRef = useRef(null);

  // Sync with prop
  useEffect(() => {
    if (searchQuery !== undefined) {
      setLocalSearchQuery(searchQuery);
    }
  }, [searchQuery]);

  // Toggle mobile menu
  const handleToggleMenu = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  // Close mobile menu
  const handleCloseMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  // Handle search input change (mobile) - instant search
  const handleSearchChange = useCallback((value) => {
    setLocalSearchQuery(value);

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Trigger search immediately on typing
    if (onSearch) {
      onSearch(value);
    }
  }, [onSearch]);

  // Handle search submit
  const handleSearchSubmit = useCallback((query) => {
    if (query && query.trim()) {
      const searchTerm = query.trim().toLowerCase();
      // Check if searching for stores/vendors
      const isStoreSearch = /^(store|vendor|shop|business|seller)/i.test(searchTerm) ||
        searchTerm.includes(" store") || searchTerm.includes(" vendor") ||
        searchTerm.includes(" shop") || searchTerm.includes(" seller");

      // Store search query in localStorage
      localStorage.setItem("mobile_search", query.trim());

      // Trigger search callback
      if (onSearch) {
        onSearch(query.trim());
      }

      // Navigate to vendors page for store searches, home for products
      if (isStoreSearch) {
        onNavigate("vendors");
      } else {
        onNavigate("home");
      }
    }
  }, [onNavigate, onSearch]);

  // Handle desktop navbar search
  const handleNavbarSearch = useCallback((query) => {
    const trimmed = query?.trim() || "";
    setLocalSearchQuery(trimmed);

    // Clear storage first
    localStorage.removeItem("mobile_search");
    localStorage.removeItem("global_search");

    if (trimmed) {
      const searchTerm = trimmed.toLowerCase();
      const isStoreSearch = /^(store|vendor|shop|business|seller)/i.test(searchTerm) ||
        searchTerm.includes(" store") || searchTerm.includes(" vendor") ||
        searchTerm.includes(" shop") || searchTerm.includes(" seller");

      localStorage.setItem("mobile_search", trimmed);

      if (onSearch) {
        onSearch(trimmed);
      }

      if (isStoreSearch) {
        onNavigate("vendors");
      } else {
        onNavigate("home");
      }
    } else {
      // Clear search - navigate to home without search
      if (onSearch) {
        onSearch("");
      }
      // Navigate to home to show all products
      onNavigate("home");
    }
  }, [onNavigate, onSearch]);

  // Handle logout
  const handleLogout = useCallback(() => {
    logout();
    onNavigate("home");
  }, [logout, onNavigate]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Fetch notification count when logged in
  const fetchNotificationCount = useCallback(async () => {
    if (!isLoggedIn || !user?._id) {
      setNotificationUnreadCount(0);
      return;
    }
    try {
      const { count } = await notificationAPI.getUnreadCount();
      setNotificationUnreadCount(count || 0);
    } catch (err) {
      console.error("Failed to fetch notification count:", err);
    }
  }, [isLoggedIn, user?._id]);

  useEffect(() => {
    fetchNotificationCount();
    // Poll every 30 seconds (minimum recommended)
    const interval = setInterval(fetchNotificationCount, 30000);
    // Refresh on page focus
    const handleFocus = () => fetchNotificationCount();
    window.addEventListener("focus", handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchNotificationCount]);

  // Mobile layout
  if (isMobile) {
    return (
      <>
        <MobileTopHeader
          onNavigate={onNavigate}
          onToggleMenu={handleToggleMenu}
          onCloseMenu={handleCloseMenu}
          menuOpen={mobileMenuOpen}
          searchQuery={localSearchQuery}
          onSearchChange={handleSearchChange}
          onSearchSubmit={handleSearchSubmit}
        />
        <main className="mobile-main-content">
          {children}
        </main>
        <MobileBottomNav
          currentPage={currentPage}
          onNavigate={onNavigate}
          cartCount={cartCount}
          isLoggedIn={isLoggedIn}
          isAdmin={isAdmin}
          isApprovedVendor={isApprovedVendor}
          onOpenAuth={onOpenAuth}
          onLogout={handleLogout}
          notificationUnreadCount={notificationUnreadCount}
        />
        {/* Add CSS class for mobile content padding */}
        <style>{`
          .mobile-main-content {
            margin-top: 60px;
            margin-bottom: 64px;
            min-height: calc(100vh - 124px);
            width: 100%;
          }
          @supports (padding-top: env(safe-area-inset-top)) {
            .mobile-main-content {
              margin-top: calc(60px + env(safe-area-inset-top));
            }
          }
          @supports (padding-bottom: env(safe-area-inset-bottom)) {
            .mobile-main-content {
              margin-bottom: calc(64px + env(safe-area-inset-bottom));
            }
          }
        `}</style>
      </>
    );
  }

  // Desktop layout - use existing Navbar with search
  return (
    <>
      <Navbar
        cartCount={cartCount}
        chatUnreadCount={chatUnreadCount}
        currentPage={currentPage}
        onNavigate={onNavigate}
        onOpenAuth={onOpenAuth}
        onSearch={handleNavbarSearch}
        searchQuery={localSearchQuery}
      />
      <main style={{ flex: 1, minHeight: 0, width: "100%" }}>
        {children}
      </main>
    </>
  );
}