// GalleryModal.jsx — Fullscreen gallery modal with keyboard navigation.
//
// ✅ RESTORED: pre-migration behavior. The OLD GalleryModal called
//   `getProductImages(product)` (which goes through `getImageUrl` with no
//   width option) and rendered `<img src={currentImage}>`. The recent
//   migration added inline transforms like `w_1200,c_fill,q_auto,f_auto`
//   via `getImageUrl(url, { width })`, which 404s for products whose
//   Cloudinary asset doesn't have that exact variant cached. We restore
//   the pre-migration call shape: no width, helper returns the secure_url
//   as-is, browser fetches the eager-baked w_1200 variant.
import { useState, useEffect, useCallback, useRef } from "react";
import { getImageUrl, getProductImages } from "../utils/image";
import styles from "./GalleryModal.module.css";

// Helper to get images array - accepts either product object or direct images array
function getImagesArray(productOrImages, name) {
  // If it's an array, use it directly
  if (Array.isArray(productOrImages)) {
    return productOrImages.length > 0 ? productOrImages : [];
  }
  // If it's an object (product), get images from it
  if (productOrImages) {
    return getProductImages(productOrImages);
  }
  return [];
}

export default function GalleryModal({ product, images: directImages, initialIndex = 0, onClose, name = "Product" }) {
  // Support both product object and direct images array
  const images = getImagesArray(product || directImages, name);
  const [currentIndex, setCurrentIndex] = useState(() => {
    // Validate initialIndex is within bounds
    return initialIndex >= 0 && initialIndex < images.length ? initialIndex : 0;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [touchStart, setTouchStart] = useState(null);
  const modalRef = useRef(null);

  const goToPrevious = useCallback(() => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : images.length - 1));
    setIsLoading(true);
  }, [images.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex(prev => (prev < images.length - 1 ? prev + 1 : 0));
    setIsLoading(true);
  }, [images.length]);

  const goToIndex = useCallback((index) => {
    setCurrentIndex(index);
    setIsLoading(true);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      switch (e.key) {
        case "ArrowLeft":
          goToPrevious();
          break;
        case "ArrowRight":
          goToNext();
          break;
        case "Escape":
          onClose?.();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToPrevious, goToNext, onClose]);

  // Touch/swipe support
  const handleTouchStart = (e) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e) => {
    if (!touchStart) return;

    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;

    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        goToNext();
      } else {
        goToPrevious();
      }
    }

    setTouchStart(null);
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Focus modal for accessibility
  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  if (images.length === 0) {
    return null;
  }

  const currentImage = images[currentIndex];
  const showNav = images.length > 1;

  return (
    <div
      className={`${styles.overlay} ${styles.overlayOpen}`}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label="Product image gallery"
      ref={modalRef}
      tabIndex={-1}
    >
      <div className={styles.modal}>
        {/* Close button */}
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close gallery"
        >
          ✕
        </button>

        {/* Navigation arrows */}
        {showNav && (
          <>
            <button
              className={`${styles.navButton} ${styles.navPrev}`}
              onClick={goToPrevious}
              aria-label="Previous image"
            >
              ❮
            </button>
            <button
              className={`${styles.navButton} ${styles.navNext}`}
              onClick={goToNext}
              aria-label="Next image"
            >
              ❯
            </button>
          </>
        )}

        {/* Main image */}
        <div className={styles.imageContainer}>
          {isLoading && <div className={styles.skeleton} />}
          <img
            src={currentImage}
            alt={`${name} - Image ${currentIndex + 1} of ${images.length}`}
            className={`${styles.mainImage} ${!isLoading ? styles.imageLoaded : ""}`}
            onLoad={() => setIsLoading(false)}
          />
        </div>

        {/* Image counter */}
        <div className={styles.counter}>
          {currentIndex + 1} / {images.length}
        </div>

        {/* Thumbnail strip */}
        {showNav && (
          <div className={styles.thumbnailStrip}>
            {images.map((img, index) => (
              <button
                key={index}
                className={`${styles.thumbnail} ${index === currentIndex ? styles.thumbnailActive : ""}`}
                onClick={() => goToIndex(index)}
                aria-label={`Go to image ${index + 1}`}
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

        {/* Mobile swipe hint */}
        {showNav && <div className={styles.swipeHint}>Swipe to navigate</div>}
      </div>
    </div>
  );
}