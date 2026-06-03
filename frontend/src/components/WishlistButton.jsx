// components/WishlistButton.jsx - Heart wishlist button
import { useState, useEffect, useCallback } from "react";
import { Heart } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { wishlistAPI } from "../services/api";
import styles from "./WishlistButton.module.css";

export default function WishlistButton({
  productId,
  size = "medium",
  showLabel = false,
  onAuthRequired,
  className = "",
}) {
  const { isLoggedIn } = useAuth();
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check if product is in wishlist on mount
  useEffect(() => {
    if (!isLoggedIn || !productId) {
      setIsInWishlist(false);
      return;
    }

    const checkWishlist = async () => {
      try {
        const { isInWishlist } = await wishlistAPI.checkProduct(productId);
        setIsInWishlist(isInWishlist);
      } catch (err) {
        console.error("Failed to check wishlist:", err);
      }
    };

    checkWishlist();
  }, [isLoggedIn, productId]);

  const handleToggle = useCallback(async (e) => {
    e.stopPropagation();

    if (!isLoggedIn) {
      onAuthRequired?.();
      return;
    }

    setLoading(true);

    try {
      if (isInWishlist) {
        await wishlistAPI.remove(productId);
        setIsInWishlist(false);
      } else {
        await wishlistAPI.add(productId);
        setIsInWishlist(true);
      }
    } catch (err) {
      console.error("Failed to toggle wishlist:", err);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, isInWishlist, productId, onAuthRequired]);

  const sizeClass = styles[size] || styles.medium;

  return (
    <button
      className={`${styles.wishlistBtn} ${sizeClass} ${isInWishlist ? styles.active : ""} ${className}`}
      onClick={handleToggle}
      disabled={loading}
      aria-label={isInWishlist ? "Remove from wishlist" : "Add to wishlist"}
      title={isInWishlist ? "Remove from wishlist" : "Add to wishlist"}
    >
      <Heart
        size={size === "small" ? 16 : size === "large" ? 28 : 22}
        className={`${styles.heartIcon} ${isInWishlist ? styles.filled : styles.outline}`}
        fill={isInWishlist ? "currentColor" : "none"}
      />
      {showLabel && (
        <span className={styles.label}>
          {isInWishlist ? "Saved" : "Save"}
        </span>
      )}
    </button>
  );
}