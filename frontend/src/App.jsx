// App.jsx — v11: code splitting via React.lazy for heavy pages
import { useState, Component, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import logger from "./utils/logger";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import Navbar from "./components/Navbar";
import MobileLayoutWrapper from "./components/mobile/MobileLayoutWrapper";
import AuthModal from "./components/auth/AuthModal";
import { useToast, ToastContainer } from "./components/Toast";
import { productAPI } from "./services/api";
import HomePage from "./pages/HomePage";
import SeeAllPage from "./pages/SeeAllPage";
import DealsPage from "./pages/DealsPage";
import CategoriesPage from "./pages/CategoriesPage";
import CartPage from "./pages/CartPage";
import OrdersPage from "./pages/OrdersPage";
import SettingsPage from "./pages/SettingsPage";
import WishlistPage from "./pages/WishlistPage";
import StoresPage from "./pages/StoresPage";
import VendorStorePage from "./pages/VendorStorePage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ProductDetailPage from "./pages/ProductDetailPage";
import AboutPage from "./pages/AboutPage";
import ContactPage from "./pages/ContactPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsPage from "./pages/TermsPage";
import RefundPolicyPage from "./pages/RefundPolicyPage";
import FAQPage from "./pages/FAQPage";
import { ChatProvider, useChat } from "./components/chat/ChatContext";
import SEO from "./components/SEO";
import PageSkeleton from "./components/PageSkeleton";

// ✅ Code-split the heaviest pages. Each becomes a separate chunk that the
// browser only fetches when the user actually navigates to it. The Suspense
// fallback paints the page chrome immediately.
const VendorDashboard = lazy(() => import("./pages/vendor/VendorDashboard"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminChatPage = lazy(() => import("./pages/admin/AdminChatPage"));
const FoodPage = lazy(() => import("./pages/FoodPage"));
const RestaurantPage = lazy(() => import("./pages/RestaurantPage"));
const RestaurantDashboard = lazy(() => import("./pages/restaurant/RestaurantDashboard"));
const FoodCartPage = lazy(() => import("./pages/FoodCartPage"));
const FoodDetailPage = lazy(() => import("./pages/FoodDetailPage"));
const FoodOrdersPage = lazy(() => import("./pages/FoodOrdersPage"));
const DeliveryTrackingPage = lazy(() => import("./pages/DeliveryTrackingPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));

// ── Global Error Boundary ─────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || "An unexpected error occurred" };
  }
  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Caught render error:", error?.message);
    console.error("[ErrorBoundary] Component stack:", info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "60vh", padding: "40px 24px",
          textAlign: "center", fontFamily: "system-ui, sans-serif",
        }}>
          <div style={{ fontSize: "3rem", marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: "1.4rem", marginBottom: 10, color: "#1c1917" }}>Something went wrong</h2>
          <p style={{ color: "#78716c", maxWidth: 420, marginBottom: 24, lineHeight: 1.6 }}>{this.state.errorMessage}</p>
          <button style={{ background: "#f97316", color: "white", border: "none", padding: "10px 24px", borderRadius: 8, fontSize: "0.9rem", fontWeight: 600, cursor: "pointer" }}
            onClick={() => { this.setState({ hasError: false, errorMessage: "" }); }}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
// ── Auth loading guard ─────────────────────────────────────────────────────────
function AuthGuard({ children }) {
  const { authChecked, isLoggedIn } = useAuth();
  if (!authChecked) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <div className="spinner" />
      </div>
    );
  }
  return children;
}

// ── Page SEO Configuration ───────────────────────────────────────────────────
const PAGE_SEO = {
  home: {
    title: "SiiShop - Your Trusted Multi-Vendor Marketplace",
    description: "Discover amazing products from verified vendors. Shop electronics, fashion, home & garden, beauty, sports and more. Secure payments, fast delivery.",
    keywords: "online shopping, multi-vendor marketplace, electronics, fashion, home decor, beauty products, sports equipment, buy online",
  },
  categories: {
    title: "Browse Categories | SiiShop Marketplace",
    description: "Shop by category on SiiShop. Find electronics, fashion, home & garden, beauty, sports and more from verified vendors.",
    keywords: "shop by category, electronics, fashion, home decor, beauty products, sports equipment",
  },
  vendors: {
    title: "Our Vendors | SiiShop Marketplace",
    description: "Discover trusted vendors and sellers on SiiShop. Browse stores, shop products, secure checkout.",
    keywords: "vendor stores, seller marketplace, verified vendors, online shopping",
  },
  product: {
    title: "Product Details | SiiShop",
    description: "View product details, pricing, and reviews. Buy with confidence on SiiShop marketplace.",
    keywords: "product details, buy online, secure shopping",
  },
  cart: {
    title: "Shopping Cart | SiiShop",
    description: "Review your cart items and proceed to secure checkout on SiiShop marketplace.",
    keywords: "shopping cart, checkout, online payment",
  },
  orders: {
    title: "My Orders | SiiShop",
    description: "Track your orders, view order history, and manage returns on SiiShop.",
    keywords: "order tracking, order history, delivery status",
  },
  chat: {
    title: "Messages | SiiShop",
    description: "Chat with vendors on SiiShop. Get product questions answered.",
    keywords: "vendor chat, customer service, messaging",
  },
  about: {
    title: "About Us | SiiShop Marketplace",
    description: "Learn about SiiShop - Ghana's leading multi-vendor marketplace connecting buyers with verified sellers.",
    keywords: "about siishop, marketplace, e-commerce Ghana",
  },
  contact: {
    title: "Contact Us | SiiShop",
    description: "Get in touch with SiiShop. We're here to help with any questions or concerns.",
    keywords: "contact siishop, customer support, help",
  },
  faq: {
    title: "FAQ | SiiShop Marketplace",
    description: "Frequently asked questions about shopping on SiiShop marketplace.",
    keywords: "FAQ, frequently asked questions, shopping help",
  },
  privacy: {
    title: "Privacy Policy | SiiShop",
    description: "SiiShop privacy policy - how we protect your personal data and ensure secure shopping.",
    keywords: "privacy policy, data protection, secure shopping",
  },
  terms: {
    title: "Terms of Service | SiiShop",
    description: "SiiShop terms of service. Learn the rules and guidelines for using our marketplace.",
    keywords: "terms of service, marketplace rules, user agreement",
  },
  refund: {
    title: "Refund Policy | SiiShop",
    description: "SiiShop refund policy. Learn about returns, refunds, and buyer protection.",
    keywords: "refund policy, returns, buyer protection",
  },
  vendor: {
    title: "Vendor Dashboard | SiiShop",
    description: "Manage your store, products, and orders on SiiShop vendor portal.",
    keywords: "vendor dashboard, store management, seller tools",
  },
  admin: {
    title: "Admin Dashboard | SiiShop",
    description: "SiiShop marketplace administration panel. Manage vendors, orders, and platform settings.",
    keywords: "admin dashboard, marketplace management, platform admin",
  },
  // ✅ NEW: Food/Restaurant pages
  food: {
    title: "🍔 Food Delivery | SiiShop",
    description: "Order food online from the best restaurants in Ghana. Fast delivery, great prices.",
    keywords: "food delivery, restaurant, online food order, Ghana food, fast food, pizza, local food",
  },
  restaurant: {
    title: "Restaurant | SiiShop Food",
    description: "Order food from your favorite restaurants. Browse menu, reviews, and place your order.",
    keywords: "restaurant, food delivery, order food, menu",
  },
};

// ── Main App inner ────────────────────────────────────────────────────────────
function AppInner() {
  const { user, token, isLoggedIn, isAdmin, isApprovedVendor, authChecked } = useAuth();
  const { unreadCount: chatUnreadCount } = useChat();
  const [page, setPage] = useState(() => {
    try {
      // Check URL first for store/food pages
      if (typeof window !== "undefined") {
        const path = window.location.pathname || "";
        // Match /store/:slug pattern
        const storeMatch = path.match(/^\/store\/(.+?)\/?$/);
        if (storeMatch && storeMatch[1]) {
          const slug = storeMatch[1];
          sessionStorage.setItem("vendorStoreSlug", slug);
          return "vendor-store";
        }
        // Match /restaurant/:slug pattern
        const restaurantMatch = path.match(/^\/restaurant\/(.+?)\/?$/);
        if (restaurantMatch && restaurantMatch[1]) {
          const slug = restaurantMatch[1];
          sessionStorage.setItem("restaurantSlug", slug);
          return "restaurant";
        }
        // Match /food - food marketplace
        if (path === "/food" || path.startsWith("/food")) {
          return "food";
        }
      }
    } catch (e) {
      // Ignore errors during initialization
    }
    return localStorage.getItem("app_page") || "home";
  });

  // Get current page SEO
  const currentPageSEO = PAGE_SEO[page] || PAGE_SEO.home;

  // Handle URL path for vendor stores (e.g., /store/dzifa-fashion) and restaurants
  // Runs on mount AND when URL changes (via popstate or history.pushState)
  useEffect(() => {
    function handleRouteChange() {
      try {
        const path = window.location.pathname;
        logger.log("[App] Checking URL:", path);

        // Match /store/:slug pattern (handle optional trailing slash)
        const storeMatch = path.match(/^\/store\/(.+?)\/?$/);
        if (storeMatch) {
          const storeSlug = storeMatch[1];
          logger.log("[App] Detected store URL, slug:", storeSlug);
          // Store the slug and navigate to vendor-store page
          sessionStorage.setItem("vendorStoreSlug", storeSlug);
          setPage("vendor-store");
          return;
        }

        // Match /restaurant/:slug pattern
        const restaurantMatch = path.match(/^\/restaurant\/(.+?)\/?$/);
        if (restaurantMatch) {
          const restaurantSlug = restaurantMatch[1];
          logger.log("[App] Detected restaurant URL, slug:", restaurantSlug);
          sessionStorage.setItem("restaurantSlug", restaurantSlug);
          setPage("restaurant");
          return;
        }

        // Match /food - food marketplace
        if (path === "/food" || path.startsWith("/food")) {
          setPage("food");
        }
      } catch (e) {
        logger.log("[App] Error parsing store URL:", e.message);
      }
    }

    // Run on mount
    handleRouteChange();

    // Listen for popstate events (triggered by browser back/forward and our pushState)
    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle URL query parameters from email links (e.g., ?page=orders)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlPage = params.get("page");
      const orderId = params.get("orderId");
      const section = params.get("section");

      // If URL has a page parameter, navigate to it
      if (urlPage && urlPage !== page) {
        // Validate the page is valid before navigating
        const validPages = ["home", "see-all", "deals", "product", "vendors", "cart", "orders", "settings", "reset-password", "vendor", "admin", "about", "contact", "privacy", "terms", "refund", "faq"];
        if (validPages.includes(urlPage)) {
          // For protected pages, we still set the page - auth guard will handle protection
          setPage(urlPage);
          // Store in localStorage
          localStorage.setItem("app_page", urlPage);

          // If there's an orderId, store it for the orders page
          if (orderId) {
            sessionStorage.setItem("emailOrderId", orderId);
          }

          // If there's a section (for vendor/admin dashboards), store it
          if (section) {
            sessionStorage.setItem("emailSection", section);
          }

          // Clear URL params to clean up the address bar
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    } catch (e) {
      logger.log("[App] Error parsing URL params:", e.message);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("app_page", page);
  }, [page]);

  // ✅ FIX: Correct dashboard routing on page refresh/load
  // This runs when auth is fully checked and ensures restaurant vendors
  // always land on RestaurantDashboard, never on Marketplace VendorDashboard
  useEffect(() => {
    // Only run when auth is fully checked
    if (!authChecked) return;

    logger.log("[App] Dashboard routing check:", {
      page,
      isLoggedIn: !!token && !!user,
      vendorType: user?.vendorType,
      vendorStatus: user?.vendorStatus,
      hasRestaurantDetails: !!(user?.restaurantDetails && Object.keys(user?.restaurantDetails).length > 0)
    });

    // Check if current page is vendor but user is a restaurant vendor
    if (page === "vendor" && user?.isVendor && user?.vendorStatus === "approved") {
      const isRestaurantVendor = user?.vendorType === "restaurant" ||
        (user?.restaurantDetails && Object.keys(user?.restaurantDetails).length > 0);

      if (isRestaurantVendor) {
        logger.log("[App] 🚨 Wrong dashboard detected! Redirecting to RestaurantDashboard");
        setPage("restaurant-dashboard");
        return;
      }
    }

    // Check if current page is restaurant-dashboard but user is NOT a restaurant vendor
    if (page === "restaurant-dashboard" && user?.isVendor) {
      const isRestaurantVendor = user?.vendorType === "restaurant" ||
        (user?.restaurantDetails && Object.keys(user?.restaurantDetails).length > 0);

      if (!isRestaurantVendor) {
        logger.log("[App] 🚨 Wrong dashboard detected! Redirecting to VendorDashboard");
        setPage("vendor");
        return;
      }
    }
  }, [authChecked, user, page, token]);

  // Initialize cart from localStorage for persistence across refreshes
  const [cart, setCart] = useState(() => {
    try {
      const stored = localStorage.getItem("cart");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  // Persist cart to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem("cart", JSON.stringify(cart));
    } catch (e) { /* ignore storage errors */ }
  }, [cart]);
  const { toasts, addToast } = useToast();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalView, setAuthModalView] = useState("login");
  // Initialize selectedProduct from sessionStorage for refresh persistence
  const [selectedProduct, setSelectedProduct] = useState(() => {
    try {
      const stored = sessionStorage.getItem("selectedProduct");
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  // Track previous page for back navigation from product detail
  const [previousPage, setPreviousPage] = useState("home");

  // Global search state - persists across page changes
  const [searchQuery, setSearchQuery] = useState("");

  // Vendor context - when browsing a vendor store, this tracks the vendor
  const [vendorContext, setVendorContext] = useState(() => {
    const stored = sessionStorage.getItem("vendorContext");
    return stored ? JSON.parse(stored) : null;
  });

  // Persist vendor context to sessionStorage
  useEffect(() => {
    if (vendorContext) {
      sessionStorage.setItem("vendorContext", JSON.stringify(vendorContext));
    } else {
      sessionStorage.removeItem("vendorContext");
    }
  }, [vendorContext]);

  // Function to set vendor context
  const setVendorContextForStore = useCallback((vendorSlug, vendorId) => {
    setVendorContext({ slug: vendorSlug, vendorId });
  }, []);

  // Function to clear vendor context
  const clearVendorContext = useCallback(() => {
    setVendorContext(null);
  }, []);

  // Handle global search from navbar
  const handleGlobalSearch = useCallback((query) => {
    const trimmed = query?.trim() || "";
    setSearchQuery(trimmed);
    // Store in localStorage for page persistence
    if (trimmed) {
      localStorage.setItem("global_search", trimmed);
    } else {
      localStorage.removeItem("global_search");
    }
  }, []);

  // Load search from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("global_search");
    if (stored) {
      setSearchQuery(stored);
    }
  }, []);

  // Persist selectedProduct to sessionStorage
  const handleSetSelectedProduct = useCallback((product) => {
    setSelectedProduct(product);
    try {
      if (product) {
        sessionStorage.setItem("selectedProduct", JSON.stringify(product));
      } else {
        sessionStorage.removeItem("selectedProduct");
      }
    } catch {}
  }, []);

  function onRequireAuth(view = "login") { setAuthModalView(view); setAuthModalOpen(true); }

  // ── Login redirect: go to correct dashboard based on role ─────────────────
  function onAuthSuccess(user) {
    // ✅ Dev-only — same pattern as above. Full user object (PII)
    // stays out of the production console.
    logger.log("[onAuthSuccess] FULL USER:", JSON.stringify(user, null, 2));
    logger.log("[onAuthSuccess] vendorType:", user?.vendorType);
    logger.log("[onAuthSuccess] vendorStatus:", user?.vendorStatus);
    logger.log("[onAuthSuccess] restaurantDetails:", user?.restaurantDetails);
    addToast(`Welcome, ${user?.name || "there"}! 🎉`, "success");
    setAuthModalOpen(false);
    if (user?.isAdmin) {
      setPage("admin");
    } else if (user?.isVendor && user?.vendorStatus === "approved") {
      // ✅ Route based on vendorType OR restaurantDetails: restaurant vendors get restaurant dashboard
      const isRestaurantVendor = user?.vendorType === "restaurant" ||
        (user?.restaurantDetails && Object.keys(user.restaurantDetails).length > 0);

      logger.log("[onAuthSuccess] isRestaurantVendor:", isRestaurantVendor);

      if (isRestaurantVendor) {
        setPage("restaurant-dashboard");
      } else {
        setPage("vendor");
      }
    } else {
      setPage("home");
    }
  }

  // Handle view product detail (from any page)
  function handleViewProduct(product, source = "home") {
    setPreviousPage(source);
    handleSetSelectedProduct(product);
    setPage("product");
  }

  // Handle navigation from ProductDetailPage recommendations, Wishlist, etc.
  // When on product page and click a recommended product, fetch and display it
  async function handleProductNavigate(pageName, productIdOrProduct) {
    logger.log("Navigating to:", pageName, "product:", productIdOrProduct?._id || productIdOrProduct);
    logger.log("Current page before navigation:", page);
    if (pageName === "product") {
      // Save current page (page state) as previous BEFORE changing to product
      setPreviousPage(page);
      logger.log("Setting previousPage to:", page);
      // Update browser URL to /product/:id
      const productId = productIdOrProduct?._id || productIdOrProduct;
      if (productId && typeof productId === "string") {
        window.history.pushState({}, document.title, `/product/${productId}`);
      }
      try {
        // If it's a product object, use it directly
        if (productIdOrProduct && productIdOrProduct._id) {
          handleSetSelectedProduct(productIdOrProduct);
        }
        // If it's a product ID, fetch the product
        else if (productIdOrProduct && typeof productIdOrProduct === "string") {
          const product = await productAPI.getById(productIdOrProduct);
          if (product) {
            handleSetSelectedProduct(product);
          }
        }
        setPage("product");
      } catch (err) {
        console.error("Failed to load product:", err);
      }
    } else {
      setPage(pageName);
    }
  }

  // Handle navigation from StoresPage (supports passing product for detail view)
  function handleStoresPageNavigate(page, product) {
    if (page === "product" && product) {
      setPreviousPage("vendors"); // Track where we came from
      handleSetSelectedProduct(product);
      setPage("product");
    } else {
      setPage(page);
    }
  }

  // Navigate to "see-all" with a section id (mirrors the URL-param effect that
  // writes ?section=… to the address bar so a refresh deep-links correctly).
  function handleSeeAllNavigate(pageName, ctx) {
    if (pageName === "see-all" && ctx?.sectionId) {
      try {
        window.history.pushState({}, document.title, `/see-all?section=${ctx.sectionId}`);
        sessionStorage.setItem("emailSection", ctx.sectionId);
      } catch {
        /* noop in non-browser env */
      }
    }
    setPage(pageName);
  }

  // Navigate to the Deals page, optionally with ?sort=biggest|smallest|price
  // — mirrors the see-all pattern so the URL is preserved on refresh.
  function handleDealsNavigate(pageName, ctx) {
    if (pageName === "deals") {
      const sort = ctx?.sort;
      try {
        const qs = sort && ["biggest", "smallest", "price"].includes(sort)
          ? `?sort=${sort}`
          : "";
        window.history.pushState({}, document.title, `/deals${qs}`);
      } catch {
        /* noop in non-browser env */
      }
    }
    setPage(pageName);
  }

  // Handle vendor store navigation
  function handleStoreNavigate(slug) {
    sessionStorage.setItem("vendorStoreSlug", slug);
    setPreviousPage("vendors");
    setPage("vendor-store");
  }

  function handleBackFromProduct() {
    logger.log("Going back from product, previousPage:", previousPage);
    handleSetSelectedProduct(null);
    // Restore URL based on previous page
    if (previousPage === "vendor-store") {
      const storeSlug = sessionStorage.getItem("vendorStoreSlug");
      window.history.pushState({}, document.title, `/store/${storeSlug}`);
    }
    setPage(previousPage || "home");
  }

  function addToCart(product) {
    if (!product?._id) return;
    setCart(prev => {
      const ex = prev.find(i => i._id === product._id);
      if (ex) {
        return prev.map(i => i._id === product._id ? { ...product, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    addToast(`🛌 ${product.name || "Item"} added to cart`, "success", 2000);
  }
  function increaseQty(id) { if (!id) return; setCart(prev => prev.map(i => i._id === id ? { ...i, quantity: i.quantity + 1 } : i)); }
  function decreaseQty(id) { if (!id) return; setCart(prev => prev.map(i => i._id === id ? { ...i, quantity: i.quantity - 1 } : i).filter(i => i.quantity > 0)); }
  function removeFromCart(id) { if (!id) return; setCart(prev => prev.filter(i => i._id !== id)); }
  function clearCart() { setCart([]); }
  const cartCount = (Array.isArray(cart) ? cart : []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);

  function renderPage() {
    switch (page) {
      case "home":
        return <HomePage onAddToCart={addToCart} onViewProduct={handleViewProduct} globalSearchQuery={searchQuery} onClearGlobalSearch={() => setSearchQuery("")} onRequireAuth={onRequireAuth} vendorContext={vendorContext} onClearVendorContext={clearVendorContext} onNavigate={handleSeeAllNavigate} />;
      case "see-all":
        return <SeeAllPage onAddToCart={addToCart} onViewProduct={handleViewProduct} onRequireAuth={onRequireAuth} onNavigate={handleSeeAllNavigate} />;
      case "deals":
        return <DealsPage onAddToCart={addToCart} onViewProduct={handleViewProduct} onRequireAuth={onRequireAuth} onNavigate={handleDealsNavigate} />;
      case "categories":
        return <CategoriesPage onAddToCart={addToCart} onViewProduct={handleViewProduct} onRequireAuth={onRequireAuth} vendorContext={vendorContext} onClearVendorContext={clearVendorContext} />;
      case "product":
        return (
          <ProductDetailPage
            product={selectedProduct}
            productId={selectedProduct?._id}
            onBack={handleBackFromProduct}
            onAddToCart={addToCart}
            onNavigate={handleProductNavigate}
            onRequireAuth={onRequireAuth}
          />
        );
      case "vendors": return <StoresPage onNavigate={handleStoresPageNavigate} onAddToCart={addToCart} onRequireAuth={onRequireAuth} vendorContext={vendorContext} onClearVendorContext={clearVendorContext} />;
      // ✅ NEW: Restaurant/Food pages
      case "food": return <FoodPage onNavigate={setPage} />;
      case "restaurant": {
        // Get slug from sessionStorage or URL
        let restaurantSlug = null;
        try {
          restaurantSlug = sessionStorage.getItem("restaurantSlug");
          if (!restaurantSlug && window.location.pathname) {
            const path = window.location.pathname;
            const match = path.match(/^\/restaurant\/(.+?)\/?$/);
            restaurantSlug = match ? match[1] : null;
            if (restaurantSlug) sessionStorage.setItem("restaurantSlug", restaurantSlug);
          }
        } catch (e) {
          logger.log("Error getting restaurant slug:", e);
        }
        if (!restaurantSlug) {
          return (
            <div className="container" style={{ padding: "60px 20px", textAlign: "center" }}>
              <h2>Restaurant not found</h2>
              <p style={{ color: "#666" }}>Invalid restaurant URL.</p>
              <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => setPage("home")}>
                Go to Food
              </button>
            </div>
          );
        }
        return (
          <RestaurantPage
            onNavigate={setPage}
            // Unified cart props
            cart={cart}
            onAddToCart={addToCart}
            onIncreaseQty={increaseQty}
            onDecreaseQty={decreaseQty}
            onRemoveFromCart={removeFromCart}
            onClearCart={clearCart}
            addToast={addToast}
          />
        );
      }
      // ✅ NEW: Food Cart & Orders
      case "food-cart": return <FoodCartPage onNavigate={setPage} onRequireAuth={onRequireAuth} addToast={addToast} />;
      case "food-orders": return <FoodOrdersPage onNavigate={setPage} onRequireAuth={onRequireAuth} />;
      case "food-detail": {
        // Get food item from sessionStorage
        let foodItem = null;
        let restaurantInfo = null;
        try {
          const stored = sessionStorage.getItem("foodDetailItem");
          const storedRestaurant = sessionStorage.getItem("foodDetailRestaurant");
          if (stored) foodItem = JSON.parse(stored);
          if (storedRestaurant) restaurantInfo = JSON.parse(storedRestaurant);
        } catch (e) {}
        return (
          <FoodDetailPage
            item={foodItem}
            restaurant={restaurantInfo}
            onBack={() => {
              sessionStorage.removeItem("foodDetailItem");
              sessionStorage.removeItem("foodDetailRestaurant");
              setPage("restaurant");
            }}
            onAddToCart={addToCart}
            addToast={addToast}
          />
        );
      }
      case "vendor-store": {
        // Get slug from sessionStorage or URL
        let storeSlug = null;
        try {
          storeSlug = sessionStorage.getItem("vendorStoreSlug");
          if (!storeSlug && window.location.pathname) {
            const path = window.location.pathname;
            const match = path.match(/^\/store\/(.+?)\/?$/);
            storeSlug = match ? match[1] : null;
            if (storeSlug) sessionStorage.setItem("vendorStoreSlug", storeSlug);
          }
        } catch (e) {
          logger.log("Error getting store slug:", e);
        }
        logger.log("Rendering VendorStorePage with slug:", storeSlug);
        // If no slug, show error
        if (!storeSlug) {
          return (
            <div className="container" style={{ padding: "60px 20px", textAlign: "center" }}>
              <h2>Store not found</h2>
              <p style={{ color: "#666" }}>Invalid store URL. Please check the link.</p>
              <button
                className="btn btn-primary"
                style={{ marginTop: 20 }}
                onClick={() => setPage("home")}
              >
                Go to Home
              </button>
            </div>
          );
        }
        return <VendorStorePage key={`vendor-${storeSlug}`} onAddToCart={addToCart} onNavigate={handleProductNavigate} onRequireAuth={onRequireAuth} vendorSlug={storeSlug} onVendorLoaded={setVendorContextForStore} />;
      }
      case "cart": return <CartPage cart={cart} onIncrease={increaseQty} onDecrease={decreaseQty} onRemove={removeFromCart} onClearCart={clearCart} onNavigate={setPage} addToast={addToast} onRequireAuth={onRequireAuth} />;
      case "orders": return <OrdersPage addToast={addToast} onRequireAuth={onRequireAuth} onNavigate={setPage} />;
      case "wishlist": return <WishlistPage onNavigate={handleProductNavigate} addToast={addToast} onRequireAuth={onRequireAuth} onAddToCart={addToCart} />;
      case "settings": return <SettingsPage addToast={addToast} />;
      case "reset-password": return <ResetPasswordPage addToast={addToast} onNavigate={setPage} />;
      case "vendor": return <VendorDashboard addToast={addToast} onRequireAuth={onRequireAuth} />;
      // ✅ NEW: Restaurant Dashboard (same route, checks vendorType internally)
      case "restaurant-dashboard": return <RestaurantDashboard addToast={addToast} onRequireAuth={onRequireAuth} onNavigate={setPage} />;
      case "admin": return <AdminDashboard addToast={addToast} onRequireAuth={onRequireAuth} />;
      case "about": return <AboutPage onNavigate={setPage} />;
      case "contact": return <ContactPage />;
      case "privacy": return <PrivacyPolicyPage />;
      case "terms": return <TermsPage />;
      case "refund": return <RefundPolicyPage />;
      case "faq": return <FAQPage />;
      case "delivery-tracking": return <DeliveryTrackingPage onNavigate={setPage} />;
      case "chat": return <ChatPage onNavigate={setPage} />;
      case "admin-chat": return <AdminChatPage onNavigate={setPage} addToast={addToast} />;
      default: return <HomePage onAddToCart={addToCart} onViewProduct={handleViewProduct} onRequireAuth={onRequireAuth} />;
    }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <MobileLayoutWrapper
        cartCount={cartCount}
        chatUnreadCount={chatUnreadCount}
        currentPage={page}
        onNavigate={setPage}
        onOpenAuth={() => onRequireAuth("login")}
        isLoggedIn={isLoggedIn}
        isAdmin={isAdmin}
        isApprovedVendor={isApprovedVendor}
        onSearch={handleGlobalSearch}
        searchQuery={searchQuery}
      >
        <ErrorBoundary>
          <SEO title={currentPageSEO.title} description={currentPageSEO.description} />
          <Suspense fallback={<PageSkeleton />}>{renderPage()}</Suspense>
        </ErrorBoundary>
      </MobileLayoutWrapper>
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} onSuccess={onAuthSuccess} initialView={authModalView} />
      <ToastContainer toasts={toasts} />
    </div>
  );
}
// Root export — CurrencyProvider + AuthProvider + outer ErrorBoundary + AuthGuard
export default function App() {
  return (
    <ErrorBoundary>
      <CurrencyProvider>
        <AuthProvider>
          <ChatProvider>
            <AuthGuard>
              <AppInner />
            </AuthGuard>
          </ChatProvider>
        </AuthProvider>
      </CurrencyProvider>
    </ErrorBoundary>
  );
}
