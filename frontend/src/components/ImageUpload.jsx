// components/ImageUpload.jsx
// Drag-and-drop image uploader that converts the image to a base64 data URL.
// The base64 string is passed back via the onChange prop.

import { useState, useRef } from "react";
import styles from "./ImageUpload.module.css";

export default function ImageUpload({ value, onChange }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  // Convert File → base64 string and call onChange
  function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      alert("Please upload a valid image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => onChange(e.target.result); // base64 data URL
    reader.readAsDataURL(file);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onInputChange(e) {
    const file = e.target.files[0];
    if (file) handleFile(file);
  }

  return (
    <div
      className={`${styles.zone} ${dragging ? styles.dragging : ""} ${value ? styles.hasImage : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        onChange={onInputChange}
      />

      {value ? (
        /* Preview */
        <div className={styles.preview}>
          <img src={value} alt="Preview" className={styles.previewImg} />
          <div className={styles.previewOverlay}>
            <span>🔄 Click or drag to replace</span>
          </div>
        </div>
      ) : (
        /* Upload prompt */
        <div className={styles.prompt}>
          <div className={styles.uploadIcon}>📸</div>
          <p className={styles.primaryText}>
            {dragging ? "Drop it here!" : "Drag & drop your image"}
          </p>
          <p className={styles.secondaryText}>or click to browse · PNG, JPG, WEBP · max 5 MB</p>
        </div>
      )}
    </div>
  );
}
