// ImageModal.jsx — Simple modal for viewing images fullscreen
import { useEffect, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL_PROD || import.meta.env.VITE_API_URL || "http://localhost:10000/api";

function getFullImageUrl(url) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  if (url.startsWith("/uploads")) {
    return API_BASE.replace("/api", "") + url;
  }
  if (url.startsWith("/")) {
    return API_BASE.replace("/api", "") + url;
  }
  // Handle filename only
  return `${API_BASE.replace("/api", "")}/uploads/products/${url}`;
}

export default function ImageModal({ src, alt = "Image", onClose }) {
  const fullSrc = getFullImageUrl(src);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Escape") onClose?.();
  }, [onClose]);

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) onClose?.();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  if (!fullSrc) return null;

  return (
    <div className="image-modal-backdrop" onClick={handleBackdropClick} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
    }}>
      <button onClick={onClose} style={{
        position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.2)",
        border: "none", color: "white", fontSize: 24, width: 40, height: 40, borderRadius: "50%",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
      }} aria-label="Close">✕</button>
      <img src={fullSrc} alt={alt} style={{
        maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8
      }} />
    </div>
  );
}