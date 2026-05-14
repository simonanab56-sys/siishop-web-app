// components/MultiImageUpload.jsx
// Multiple image uploader with file previews - supports up to 10 images

import { useState, useRef, useCallback } from "react";
import styles from "./ImageUpload.module.css";
import { API_BASE } from "../config/api";

const MAX_IMAGES = 10;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

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

export default function MultiImageUpload({ images = [], onImagesChange }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  // Get current images as array
  const imageList = Array.isArray(images) ? images : images ? [images] : [];

  // Validate and add new files
  const handleFiles = useCallback((files) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const currentCount = imageList.filter(img => !img.file).length; // Count non-file images
    const fileCount = imageList.filter(img => img.file).length;

    // Validate each file
    const validFiles = fileArray.filter(file => {
      if (!file.type.startsWith("image/")) {
        console.warn("Invalid file type:", file.type);
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        console.warn("File too large:", file.name);
        return false;
      }
      return true;
    });

    // Check max limit
    const totalImages = currentCount + fileCount + validFiles.length;
    if (totalImages > MAX_IMAGES) {
      alert(`Maximum ${MAX_IMAGES} images allowed`);
      return;
    }

    // Create preview URLs for new files
    const newImages = validFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      name: file.name,
    }));

    // Add to existing images
    onImagesChange?.([...imageList, ...newImages]);
  }, [imageList, onImagesChange]);

  // Handle file input change
  function onInputChange(e) {
    handleFiles(e.target.files);
    e.target.value = ""; // Reset input to allow same file selection
  }

  // Handle drag and drop
  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  // Remove an image
  function removeImage(index) {
    const newImages = imageList.filter((_, i) => i !== index);
    onImagesChange?.(newImages);
  }

  // Get display URL for an image (either preview or existing URL)
  function getImageUrl(img) {
    if (img.preview) return img.preview;
    if (img.url) return getFullImageUrl(img.url);
    if (typeof img === "string") return getFullImageUrl(img);
    return "";
  }

  const canAddMore = imageList.length < MAX_IMAGES;

  return (
    <div className={styles.multiUpload}>
      {/* Upload zone */}
      {canAddMore && (
        <div
          className={`${styles.zone} ${dragging ? styles.dragging : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className={styles.hiddenInput}
            onChange={onInputChange}
          />

          <div className={styles.prompt}>
            <div className={styles.uploadIcon}>📸</div>
            <p className={styles.primaryText}>
              {dragging ? "Drop images here!" : "Drag & drop images"}
            </p>
            <p className={styles.secondaryText}>
              or click to browse · PNG, JPG, WEBP · max {MAX_IMAGES} images
            </p>
          </div>
        </div>
      )}

      {/* Image previews */}
      {imageList.length > 0 && (
        <div className={styles.previewGrid}>
          {imageList.map((img, index) => {
            const url = getImageUrl(img);
            if (!url) return null;

            return (
              <div key={index} className={styles.previewItem}>
                <img src={url} alt={`Image ${index + 1}`} className={styles.previewImg} />
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => removeImage(index)}
                  aria-label="Remove image"
                >
                  ✕
                </button>
                {index === 0 && <span className={styles.primaryBadge}>Primary</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Image count */}
      {imageList.length > 0 && (
        <p className={styles.imageCount}>
          {imageList.length} of {MAX_IMAGES} images
        </p>
      )}
    </div>
  );
}