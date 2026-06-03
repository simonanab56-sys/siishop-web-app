// pages/WishlistPage.jsx — Complete wishlist page
import { useState, useEffect, useCallback } from "react";
import { Heart, ShoppingCart, Trash2, Share2, ArrowRight, Package, TrendingDown, X } from "lucide-react";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import { wishlistAPI } from "../services/api";
import { getImageUrl, PLACEHOLDER_IMAGE } from "../utils/image";
import WishlistButton from "../components/WishlistButton";
import SEO from "../components/SEO";
import styles from "./WishlistPage.module.css";

export default function WishlistPage({ onNavigate, addToast, onRequireAuth, onAddToCart }) {
  const { fmt } = useCurrency();
  const { isLoggedIn } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [addingToCart, setAddingToCart] = useState(null);

  // Fetch wishlist
  const fetchWishlist = useCallback(async () => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }

    try {
      const data = await wishlistAPI.getWishlist(1, 50);
      setItems(data.wishlist || []);
    } catch (err) {
      console.error("Failed to fetch wishlist:", err);
      addToast?.("Failed to load wishlist", "error");
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, addToast]);

  // Fetch recommendations
  const fetchRecommendations = useCallback(async () => {
    if (!isLoggedIn) return;

    try {
      setRecommendationsLoading(true);
      const data = await wishlistAPI.getRecommendations();
      setRecommendations(data.recommendations || []);
    } catch (err) {
      console.error("Failed to fetch recommendations:", err);
    } finally {
      setRecommendationsLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    fetchWishlist();
    fetchRecommendations();
  }, [fetchWishlist, fetchRecommendations]);

  // Handle add to cart
  const handleAddToCart = async (item) => {
    if (!isLoggedIn) {
      onRequireAuth?.("login");
      return;
    }

    setAddingToCart(item._id);

    try {
      const product = item.productId;
      // Use the onAddToCart callback from parent (App.jsx)
      if (onAddToCart) {
        onAddToCart(product);
        addToast?.("Added to cart", "success");
      } else {
        addToast?.("Cannot add to cart", "error");
      }
    } catch (err) {
      addToast?.(err.message || "Failed to add to cart", "error");
    } finally {
      setAddingToCart(null);
    }
  };

  // Handle remove from wishlist
  const handleRemove = async (item) => {
    try {
      await wishlistAPI.remove(item.productId._id);
      setItems(prev => prev.filter(i => i._id !== item._id));
      addToast?.("Removed from wishlist", "success");
    } catch (err) {
      addToast?.(err.message || "Failed to remove", "error");
    }
  };

  // Handle share product
  const handleShare = async (item) => {
    const product = item.productId;
    const shareUrl = `${window.location.origin}/product/${product._id}`;
    const shareText = `Check out ${product.name} on SiiShop!`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: product.name,
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          copyToClipboard(shareUrl);
        }
      }
    } else {
      copyToClipboard(shareUrl);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast?.("Link copied to clipboard", "success");
    } catch (err) {
      addToast?.("Failed to copy link", "error");
    }
  };

  // Calculate price difference
  const getPriceDiff = (item) => {
    const product = item.productId;
    if (!product || !item.priceWhenSaved) return null;
    const currentPrice = product.price;
    const savedPrice = item.priceWhenSaved;
    if (currentPrice >= savedPrice) return null;
    const diff = savedPrice - currentPrice;
    const percent = Math.round((diff / savedPrice) * 100);
    return { amount: diff, percent };
  };

  // Format date
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // Handle auth required
  const handleAuthRequired = () => {
    onRequireAuth?.("login");
  };

  if (loading) {
    return (
      <div className="page">
        <div className="container">
          <div className={styles.loading}>
            <div className="spinner" />
            <p>Loading wishlist...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="page">
        <SEO title="Sign In to View Wishlist | SiiShop" />
        <div className="container">
          <div className={styles.authPrompt}>
            <Heart size={64} className={styles.authIcon} />
            <h2>Sign in to view your wishlist</h2>
            <p>Save your favorite products and never miss a deal!</p>
            <button className="btn btn-primary" onClick={() => onRequireAuth?.("login")}>
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <SEO title="My Wishlist | SiiShop" description="View and manage your saved products on SiiShop" />

      <div className="container">
        <div className={styles.header}>
          <h1>
            <Heart fill="#ef4444" className={styles.titleIcon} /> My Wishlist
          </h1>
          {items.length > 0 && (
            <span className={styles.count}>{items.length} {items.length === 1 ? "item" : "items"}</span>
          )}
        </div>

        {items.length === 0 ? (
          <div className={styles.empty}>
            <Heart size={80} className={styles.emptyIcon} />
            <h2>You haven't saved any products yet.</h2>
            <p>Browse our catalog and save products you love for later!</p>
            <button className="btn btn-primary btn-lg" onClick={() => onNavigate?.("home")}>
              Continue Shopping
            </button>
          </div>
        ) : (
          <>
            <div className={styles.grid}>
              {items.map((item) => {
                const product = item.productId;
                if (!product) return null;

                const priceDiff = getPriceDiff(item);
                const isOutOfStock = !product.available || product.stock === 0;

                return (
                  <div key={item._id} className={styles.card}>
                    <div
                      className={styles.imageWrapper}
                      onClick={() => onNavigate?.("product", product._id)}
                    >
                      <img
                        src={product.images?.[0]?.url ? getImageUrl(product.images[0].url) : product.image || PLACEHOLDER_IMAGE}
                        alt={product.name}
                        className={styles.image}
                      />
                      {priceDiff && (
                        <div className={styles.priceDropBadge}>
                          <TrendingDown size={12} />
                          <span>Price Drop {priceDiff.percent}%</span>
                        </div>
                      )}
                      {isOutOfStock && (
                        <div className={styles.outOfStockBadge}>Out of Stock</div>
                      )}
                    </div>

                    <div className={styles.cardBody}>
                      <div className={styles.vendor}>
                        {product.vendorId?.storeName || product.vendorId?.businessName || "Unknown Store"}
                      </div>

                      <h3
                        className={styles.productName}
                        onClick={() => onNavigate?.("product", product._id)}
                      >
                        {product.name}
                      </h3>

                      <div className={styles.pricing}>
                        <span className={styles.currentPrice}>{fmt(product.price)}</span>
                        {item.priceWhenSaved !== product.price && (
                          <span className={styles.savedPrice}>
                            Was {fmt(item.priceWhenSaved)}
                          </span>
                        )}
                      </div>

                      {priceDiff && (
                        <div className={styles.savings}>
                          You save {fmt(priceDiff.amount)} ({priceDiff.percent}% off)
                        </div>
                      )}

                      <div className={styles.dateAdded}>
                        Saved on {formatDate(item.createdAt)}
                      </div>

                      <div className={styles.actions}>
                        <button
                          className={`btn btn-primary ${styles.addToCartBtn}`}
                          onClick={() => handleAddToCart(item)}
                          disabled={isOutOfStock || addingToCart === item._id}
                        >
                          {addingToCart === item._id ? (
                            <span className="spinner" style={{ width: 16, height: 16 }} />
                          ) : (
                            <>
                              <ShoppingCart size={16} />
                              {isOutOfStock ? "Out of Stock" : "Add to Cart"}
                            </>
                          )}
                        </button>

                        <button
                          className={styles.iconBtn}
                          onClick={() => handleShare(item)}
                          title="Share"
                        >
                          <Share2 size={18} />
                        </button>

                        <button
                          className={`${styles.iconBtn} ${styles.removeBtn}`}
                          onClick={() => handleRemove(item)}
                          title="Remove"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <div className={styles.recommendations}>
                <h2>
                  <Package size={24} />
                  You May Also Like
                </h2>
                <p>Based on your wishlist</p>

                <div className={styles.recGrid}>
                  {recommendations.map((product) => (
                    <div
                      key={product._id}
                      className={styles.recCard}
                      onClick={() => onNavigate?.("product", product._id)}
                    >
                      <img
                        src={product.images?.[0]?.url ? getImageUrl(product.images[0].url) : product.image || PLACEHOLDER_IMAGE}
                        alt={product.name}
                        className={styles.recImage}
                      />
                      <div className={styles.recBody}>
                        <h4>{product.name}</h4>
                        <span className={styles.recPrice}>{fmt(product.price)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}