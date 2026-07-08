// ProductGallery.jsx — Professional product gallery with thumbnails and video.
//
// ✅ RESTORED: pre-migration behavior. The OLD ProductGallery called
//   `getProductImages(product)` (which goes through `getImageUrl` with no
//   width option) and rendered `<img src={currentImage}>` / `<img src={img}>`
//   for main + thumbnails. The recent migration added an inline
//   `w_400,c_limit,q_auto,f_auto` transform via `getImageUrl(url, { width })`,
//   which 404s for products whose Cloudinary asset doesn't have that exact
//   variant cached. We restore the pre-migration call shape: no width,
//   helper returns the secure_url as-is, browser fetches the eager-baked
//   w_1200 variant.
import { useState, useCallback, useRef, useEffect } from "react";
import { Play } from "lucide-react";
import styles from "./ProductGallery.module.css";
import { getImageUrl, getProductImages } from "../utils/image";

// Helper to get images array from product (supports both new and legacy formats)
function getImagesArray(product) {
  const images = getProductImages(product);
  return images.length > 0 ? images : [];
}

export default function ProductGallery({ product, onOpenFullscreen }) {
  const images = getImagesArray(product);
  const hasVideo = product?.videoUrl && product.videoUrl.length > 0;
  const [selectedIndex, setSelectedIndex] = useState(hasVideo ? -1 : 0); // -1 means video is selected
  const [isLoading, setIsLoading] = useState(true);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoRef = useRef(null);

  // Get current image to display
  const currentImage = images[selectedIndex] || images[0] || "";

  // Auto-play video when selected
  useEffect(() => {
    if (selectedIndex === -1 && videoRef.current && videoPlaying) {
      videoRef.current.play().catch(() => {});
    }
  }, [selectedIndex, videoPlaying]);

  const handleVideoEnded = useCallback(() => {
    setVideoPlaying(false);
  }, []);

  const handleThumbnailClick = useCallback((index) => {
    setSelectedIndex(index);
    setIsLoading(true);
    setVideoPlaying(false);
  }, []);

  const handleVideoSelect = useCallback(() => {
    setSelectedIndex(-1);
    setVideoPlaying(true);
  }, []);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleMainImageClick = useCallback(() => {
    if (hasVideo && selectedIndex === -1) {
      setVideoPlaying(true);
    } else {
      onOpenFullscreen?.(selectedIndex);
    }
  }, [onOpenFullscreen, selectedIndex, hasVideo]);

  // If no images and no video
  if (images.length === 0 && !hasVideo) {
    // Check if it's a food item (has productType or category)
    const isFood = product?.productType === "food" || product?.category === "food";
    const placeholderIcon = isFood ? "🍔" : "🛍️";
    return (
      <div className={styles.gallery}>
        <div className={styles.mainImageContainer}>
          <div className={styles.noImage}>{placeholderIcon}</div>
        </div>
      </div>
    );
  }

  const showCounter = images.length > 1 || hasVideo;

  return (
    <div className={styles.gallery}>
      {/* Main image or video */}
      <div
        className={styles.mainImageContainer}
        onClick={handleMainImageClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && handleMainImageClick()}
        aria-label="Click to view fullscreen"
      >
        {isLoading && selectedIndex !== -1 && <div className={styles.skeleton} />}

        {/* Video player */}
        {selectedIndex === -1 ? (
          <div className={styles.videoContainer}>
            <video
              ref={videoRef}
              src={product.videoUrl}
              className={styles.videoPlayer}
              onEnded={handleVideoEnded}
              onLoadedData={() => setIsLoading(false)}
              playsInline
              muted={!videoPlaying}
            />
            {!videoPlaying && (
              <button
                className={styles.playButton}
                onClick={(e) => {
                  e.stopPropagation();
                  handleVideoSelect();
                }}
                aria-label="Play video"
              >
                <Play size={48} fill="white" />
              </button>
            )}
          </div>
        ) : (
          // ✅ RESTORED: pre-migration. Raw secure_url, no inline transform,
          // no srcSet. The image Cloudinary serves is the eager-baked w_1200
          // variant that the upload pipeline pre-generated.
          <img
            src={currentImage}
            alt={`${product.name || "Product"} - Image ${selectedIndex + 1}`}
            className={styles.mainImage}
            onLoad={handleImageLoad}
            style={{ opacity: isLoading ? 0 : 1 }}
          />
        )}

        {selectedIndex !== -1 && showCounter && (
          <span className={styles.imageCounter}>
            {selectedIndex + 1} / {images.length}
          </span>
        )}

        {selectedIndex !== -1 && images.length > 1 && (
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

      {/* Thumbnails and video option */}
      <div className={styles.thumbnails}>
        {/* Video thumbnail button */}
        {hasVideo && (
          <button
            className={`${styles.thumbnail} ${styles.thumbnailVideo} ${selectedIndex === -1 ? styles.thumbnailActive : ""}`}
            onClick={handleVideoSelect}
            aria-label="View video"
          >
            <div className={styles.videoThumbnail}>
              <Play size={16} fill="white" />
            </div>
            <span className={styles.videoLabel}>Video</span>
          </button>
        )}
        {/* Image thumbnails */}
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
    </div>
  );
}