// pages/CategoriesPage.jsx
import { useState, useEffect, useRef } from "react";
import { productAPI } from "../services/api";
import { useCurrency } from "../context/CurrencyContext";
import styles from "./CategoriesPage.module.css";

export default function CategoriesPage({ onAddToCart, onViewProduct, onRequireAuth, vendorContext, onClearVendorContext }) {
  const { fmt } = useCurrency();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoryProducts, setCategoryProducts] = useState({});
  const [expandedCategory, setExpandedCategory] = useState(null);
  const mountedRef = useRef(true);

  // Category icons (emoji-based for simplicity)
  const categoryIcons = {
    "Fashion": "👗",
    "Electronics": "📱",
    "Food": "🍕",
    "Health": "💄",
    "Sports": "⚽",
    "Home": "🏠",
    "Beauty": "✨",
    "Kids": "👶",
    "Pets": "🐾",
    "Books": "📚",
    "Gaming": "🎮",
    "Automotive": "🚗",
    "default": "📦"
  };

  // Fetch categories on mount
  useEffect(() => {
    async function fetchCategories() {
      if (!mountedRef.current) return;
      setLoading(true);
      try {
        const cats = await productAPI.getCategories();
        if (mountedRef.current) {
          setCategories(Array.isArray(cats) ? cats : []);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err.message || "Failed to load categories");
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    }
    fetchCategories();
  }, []);

  // Fetch products for a category when expanded
  const handleCategoryClick = async (category) => {
    if (expandedCategory === category) {
      setExpandedCategory(null);
      return;
    }

    setExpandedCategory(category);

    // If already loaded, don't fetch again
    if (categoryProducts[category]) return;

    setLoading(true);
    try {
      const params = { category };
      // Filter by vendor if in vendor context
      if (vendorContext?.vendorId) {
        params.vendorId = vendorContext.vendorId;
      }
      const products = await productAPI.getAll(params);
      if (mountedRef.current) {
        setCategoryProducts(prev => ({ ...prev, [category]: products }));
      }
    } catch (err) {
      console.error("Failed to load category products:", err);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  // Get icon for category
  const getCategoryIcon = (category) => {
    return categoryIcons[category] || categoryIcons.default;
  };

  if (loading && categories.length === 0) {
    return (
      <div className="container">
        <div className="loading-center">
          <div className="spinner" />
          <p>Loading categories...</p>
        </div>
      </div>
    );
  }

  if (error && categories.length === 0) {
    return (
      <div className="container">
        <div className={styles.errorBox}>
          ⚠️ {error}
        </div>
      </div>
    );
  }

  return (
    <div className={`container page-enter ${styles.page}`}>
      {/* Vendor Context Banner */}
      {vendorContext && (
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: '20px',
          borderRadius: '8px'
        }}>
          <span>🛒 Showing products from vendor store</span>
          <button
            onClick={onClearVendorContext}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.4)',
              color: 'white',
              padding: '6px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            ✕ Clear Filter
          </button>
        </div>
      )}

      <h1 className={styles.title}>Categories</h1>
      <p className={styles.subtitle}>Browse products by category</p>

      <div className={styles.grid}>
        {categories.map((category) => (
          <div key={category} className={styles.categoryCard}>
            <button
              className={styles.categoryBtn}
              onClick={() => handleCategoryClick(category)}
            >
              <span className={styles.icon}>{getCategoryIcon(category)}</span>
              <span className={styles.label}>{category}</span>
              <span className={styles.arrow}>
                {expandedCategory === category ? "−" : "+"}
              </span>
            </button>

            {expandedCategory === category && categoryProducts[category] && (
              <div className={styles.productList}>
                {categoryProducts[category].length > 0 ? (
                  categoryProducts[category].slice(0, 6).map((product) => (
                    <div key={product._id} className={styles.productItem}>
                      <div
                        className={styles.productInfo}
                        onClick={() => onViewProduct?.(product, "categories")}
                      >
                        <img
                          src={product.image || "/placeholder.png"}
                          alt={product.name}
                          className={styles.productImage}
                        />
                        <div className={styles.productDetails}>
                          <span className={styles.productName}>{product.name}</span>
                          <span className={styles.productPrice}>
                            {fmt(product.price)}
                          </span>
                        </div>
                      </div>
                      <button
                        className={styles.addBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToCart?.(product);
                        }}
                      >
                        +
                      </button>
                    </div>
                  ))
                ) : (
                  <p className={styles.noProducts}>No products in this category</p>
                )}
                {categoryProducts[category].length > 6 && (
                  <button
                    className={styles.viewMoreBtn}
                    onClick={() => {
                      // Navigate to home with category filter or vendors page
                      onViewProduct?.({ category });
                    }}
                  >
                    View more →
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}