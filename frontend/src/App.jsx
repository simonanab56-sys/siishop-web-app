// App.jsx — v8: product detail page with gallery
import { useState, Component, useEffect, useCallback } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import Navbar from "./components/Navbar";
import AuthModal from "./components/auth/AuthModal";
import { useToast, ToastContainer } from "./components/Toast";
import HomePage from "./pages/HomePage";
import CartPage from "./pages/CartPage";
import OrdersPage from "./pages/OrdersPage";
import SettingsPage from "./pages/SettingsPage";
import StoresPage from "./pages/StoresPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import VendorDashboard from "./pages/vendor/VendorDashboard";
import AdminDashboard from "./pages/admin/AdminDashboard";
import ProductDetailPage from "./pages/ProductDetailPage";
import AboutPage from "./pages/AboutPage";
import ContactPage from "./pages/ContactPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsPage from "./pages/TermsPage";
import RefundPolicyPage from "./pages/RefundPolicyPage";
import FAQPage from "./pages/FAQPage";

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
// ── Main App inner ────────────────────────────────────────────────────────────
function AppInner() {
  const [page, setPage] = useState(() => {
    return localStorage.getItem("app_page") || "home";
  });

  useEffect(() => {
    localStorage.setItem("app_page", page);
  }, [page]);

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
    addToast(`Welcome, ${user?.name || "there"}! 🎉`, "success");
    setAuthModalOpen(false);
    if (user?.isAdmin) {
      setPage("admin");
    } else if (user?.isVendor && user?.vendorStatus === "approved") {
      setPage("vendor");
    } else {
      setPage("home");
    }
  }

  // Handle view product detail (from HomePage)
  function handleViewProduct(product) {
    setPreviousPage("home");
    handleSetSelectedProduct(product);
    setPage("product");
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

  function handleBackFromProduct() {
    handleSetSelectedProduct(null);
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
        return <HomePage onAddToCart={addToCart} onViewProduct={handleViewProduct} />;
      case "product":
        return (
          <ProductDetailPage
            product={selectedProduct}
            productId={selectedProduct?._id}
            onBack={handleBackFromProduct}
            onAddToCart={addToCart}
          />
        );
      case "vendors": return <StoresPage onNavigate={handleStoresPageNavigate} onAddToCart={addToCart} />;
      case "cart": return <CartPage cart={cart} onIncrease={increaseQty} onDecrease={decreaseQty} onRemove={removeFromCart} onClearCart={clearCart} onNavigate={setPage} addToast={addToast} onRequireAuth={onRequireAuth} />;
      case "orders": return <OrdersPage addToast={addToast} onRequireAuth={onRequireAuth} />;
      case "settings": return <SettingsPage addToast={addToast} />;
      case "reset-password": return <ResetPasswordPage addToast={addToast} onNavigate={setPage} />;
      case "vendor": return <VendorDashboard addToast={addToast} onRequireAuth={onRequireAuth} />;
      case "admin": return <AdminDashboard addToast={addToast} onRequireAuth={onRequireAuth} />;
      case "about": return <AboutPage onNavigate={setPage} />;
      case "contact": return <ContactPage />;
      case "privacy": return <PrivacyPolicyPage />;
      case "terms": return <TermsPage />;
      case "refund": return <RefundPolicyPage />;
      case "faq": return <FAQPage />;
      default: return <HomePage onAddToCart={addToCart} onViewProduct={handleViewProduct} />;
    }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Navbar cartCount={cartCount} currentPage={page} onNavigate={setPage} onOpenAuth={() => onRequireAuth("login")} />
      <ErrorBoundary key={page}>
        <main style={{ flex: 1, minHeight: 0, width: "100%" }}>{renderPage()}</main>
      </ErrorBoundary>
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
          <AuthGuard>
            <AppInner />
          </AuthGuard>
        </AuthProvider>
      </CurrencyProvider>
    </ErrorBoundary>
  );
}
