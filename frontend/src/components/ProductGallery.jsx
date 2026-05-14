// ProductGallery.jsx — Professional product gallery with thumbnails
import { useState, useCallback } from "react";
import styles from "./ProductGallery.module.css";
import { API_BASE } from "../config/api";

// Helper to get full image URL
function getFullImageUrl(url) {
  if (!url) return "";
  // Handle Base64 data URLs - return as-is
  if (url.startsWith("data:image")) return url;
  // Handle full URLs
  if (url.startsWith("http")) return url;
  // Handle relative paths
  if (url.startsWith("/uploads")) {
    return API_BASE.replace("/api", "") + url;
  }
  if (url.startsWith("/")) {
    return API_BASE.replace("/api", "") + url;
  }
  return url;
}

// Helper to get images array from product (supports both new and legacy formats)
function getImagesArray(product) {
  if (product.images && product.images.length > 0) {
    return product.images.map(img => getFullImageUrl(img.url));
  }
  if (product.image) {
    return [getFullImageUrl(product.image)];
  }
  return [];
}

export default function ProductGallery({ product, onOpenFullscreen }) {
  const images = getImagesArray(product);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const handleThumbnailClick = useCallback((index) => {
    setSelectedIndex(index);
    setIsLoading(true);
  }, []);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleMainImageClick = useCallback(() => {
    onOpenFullscreen?.(selectedIndex);
  }, [onOpenFullscreen, selectedIndex]);

  // Don't render if no images
  if (images.length === 0) {
    return (
      <div className={styles.gallery}>
        <div className={styles.mainImageContainer}>
          <div className={styles.noImage}>🛍️</div>
        </div>
      </div>
    );
  }

  const currentImage = images[selectedIndex];
  const showCounter = images.length > 1;

  return (
    <div className={styles.gallery}>
      {/* Main image */}
      <div
        className={styles.mainImageContainer}
        onClick={handleMainImageClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && handleMainImageClick()}
        aria-label="Click to view fullscreen"
      >
        {isLoading && <div className={styles.skeleton} />}
        <img
          src={currentImage}
          alt={`${product.name || "Product"} - Image ${selectedIndex + 1}`}
          className={styles.mainImage}
          onLoad={handleImageLoad}
          style={{ opacity: isLoading ? 0 : 1 }}
        />

        {showCounter && (
          <span className={styles.imageCounter}>
            {selectedIndex + 1} / {images.length}
          </span>
        )}

        {images.length > 1 && (
          <button
            className={styles.fullscreenBtn}
            onClick={(e) => {
              e.stopPropagation();
              onOpenFullscreen?.(selectedIndex);
            }}
            aria-label="Open fullscreen"
          >
            ⛶
          </button>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className={styles.thumbnails}>
          {images.map((img, index) => (
            <button
              key={index}
              className={`${styles.thumbnail} ${index === selectedIndex ? styles.thumbnailActive : ""}`}
              onClick={() => handleThumbnailClick(index)}
              aria-label={`View image ${index + 1}`}
            >
              <img
                src={img}
                alt={`Thumbnail ${index + 1}`}
                className={styles.thumbnailImage}
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}