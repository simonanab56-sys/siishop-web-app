// pages/restaurant/MenuItemsPage.jsx — v3
//
// Changes from v2:
// - Now accepts `initialMenuItems` and `onRefresh` props so the parent
//   `RestaurantDashboard` (which already fetched the same data on mount)
//   can pass its in-memory list straight through, avoiding a redundant
//   `GET /api/menu/items` round-trip every time the user opens the
//   "Menu" tab. If the parent has no data yet (e.g. deep-link to /menu
//   tab) the page falls back to a fresh fetch.

import { useState, useEffect, useRef } from "react";
import { menuAPI } from "../../services/api";
import { useCurrency } from "../../context/CurrencyContext";
import { useToast } from "../../components/Toast";
import { menuCategories } from "../../config/cuisineTypes";
import { getImageUrl, getImageSrcSet } from "../../utils/image";
import MultiImageUpload from "../../components/MultiImageUpload";
import styles from "./MenuItemsPage.module.css";

const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB

export default function MenuItemsPage({
  onBack,
  addToast,
  // ✅ FIX: optional props from the parent dashboard. If the parent
  // already has the data, we skip the redundant fetch.
  initialMenuItems = null,
  onRefresh = null,
}) {
  const { fmt } = useCurrency() || {};
  const { addToast: showToast } = useToast();
  // Seed state with the parent's data when provided so the first paint
  // already has the list — no spinner required.
  const [menuItems, setMenuItems] = useState(() =>
    Array.isArray(initialMenuItems) ? initialMenuItems : []
  );
  const [loading, setLoading] = useState(
    !Array.isArray(initialMenuItems) || initialMenuItems.length === 0
  );
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [filterCategory, setFilterCategory] = useState("all");

  // Track whether the parent has provided data — if it later passes a
  // non-empty list, we adopt it without re-fetching.
  useEffect(() => {
    if (Array.isArray(initialMenuItems) && initialMenuItems.length > 0 && menuItems.length === 0) {
      setMenuItems(initialMenuItems);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMenuItems]);

  // ✅ FIX: skip the fetch on mount when the parent already has data. The
  // first render takes the data from props; the parent's onRefresh is
  // the source of truth after any save (it already calls fetchData()).
  useEffect(() => {
    if (Array.isArray(initialMenuItems) && initialMenuItems.length > 0) {
      return; // parent already has it
    }
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper used by all 3 mutation handlers below.
  const refreshAfterMutation = () => {
    if (typeof onRefresh === "function") {
      onRefresh();
    } else {
      fetchItems();
    }
  };

  async function fetchItems() {
    setLoading(true);
    try {
      const items = await menuAPI.getItems();
      setMenuItems(items || []);
    } catch (err) {
      showToast?.("Failed to load menu items", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveItem(itemData) {
    try {
      if (editingItem) {
        await menuAPI.updateItem(editingItem._id, itemData);
        showToast?.("Item updated successfully", "success");
      } else {
        await menuAPI.createItem(itemData);
        showToast?.("Item created successfully", "success");
      }
      setShowModal(false);
      setEditingItem(null);
      refreshAfterMutation();
    } catch (err) {
      showToast?.(err.message || "Failed to save item", "error");
    }
  }

  async function handleDeleteItem(itemId) {
    if (!confirm("Are you sure you want to delete this menu item?")) return;
    try {
      await menuAPI.deleteItem(itemId);
      showToast?.("Item deleted", "success");
      refreshAfterMutation();
    } catch (err) {
      showToast?.("Failed to delete item", "error");
    }
  }

  async function handleToggleAvailability(item) {
    try {
      await menuAPI.toggleAvailability(item._id, !item.available);
      refreshAfterMutation();
    } catch (err) {
      showToast?.("Failed to update availability", "error");
    }
  }

  // DEFENSIVE: ensure menuItems is an array
  const safeMenuItems = Array.isArray(menuItems) ? menuItems : [];

  const filteredItems = filterCategory === "all"
    ? safeMenuItems
    : safeMenuItems.filter((item) => item.category === filterCategory);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <button onClick={onBack} className={styles.backBtn}>← Back to Dashboard</button>
        <h2>🍽️ Menu Items</h2>
        <button className="btn btn-primary" onClick={() => { setEditingItem(null); setShowModal(true); }}>
          + Add Menu Item
        </button>
      </div>

      {/* Filter */}
      <div className={styles.filterBar}>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="all">All Categories</option>
          {menuCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        <span className={styles.itemCount}>{filteredItems.length} items</span>
      </div>

      {loading ? (
        // Skeleton chrome — same visual rhythm as the real grid so the layout
        // doesn't shift when the API responds.
        <div className={styles.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.card}>
              <div className={styles.itemImage} style={{ background: "#f3f4f6" }} />
              <div className={styles.itemDetails}>
                <div style={{ height: 16, width: "70%", background: "#f3f4f6", borderRadius: 4, marginBottom: 8 }} />
                <div style={{ height: 12, width: "40%", background: "#f3f4f6", borderRadius: 4, marginBottom: 8 }} />
                <div style={{ height: 12, width: "90%", background: "#f3f4f6", borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      ) : safeMenuItems.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No menu items yet</p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            Add Your First Item
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredItems.map((item) => {
            const image = item.images?.[0]?.url || item.image || "";
            const optimizedImage = image ? getImageUrl(image, { width: 400 }) : "";
            const srcSet = image ? getImageSrcSet(image, [240, 400, 600]) : "";
            return (
              <div key={item._id} className={`${styles.card} ${!item.available ? styles.unavailable : ""}`}>
                <div className={styles.itemImage}>
                  {image ? (
                    <img
                      src={optimizedImage}
                      srcSet={srcSet}
                      sizes="(max-width: 600px) 240px, 400px"
                      alt={item.name}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className={styles.noImage}>🍽️</div>
                  )}
                  {!item.available && <div className={styles.unavailableOverlay}>Unavailable</div>}
                </div>
                <div className={styles.itemDetails}>
                  <h4>{item.name}</h4>
                  <span className={styles.categoryBadge}>{item.category}</span>
                  <p className={styles.description}>{item.description}</p>
                  <div className={styles.itemMeta}>
                    <span className={styles.price}>{fmt ? fmt(item.price) : `GH₵ ${item.price}`}</span>
                    <span className={styles.prepTime}>⏱️ {item.preparationTime} min</span>
                  </div>
                </div>
                <div className={styles.itemActions}>
                  <button onClick={() => handleToggleAvailability(item)}>
                    {item.available ? "⏸️ Disable" : "▶️ Enable"}
                  </button>
                  <button onClick={() => { setEditingItem(item); setShowModal(true); }}>
                    ✏️ Edit
                  </button>
                  <button className={styles.delete} onClick={() => handleDeleteItem(item._id)}>
                    🗑️ Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Menu Item Modal */}
      {showModal && (
        <MenuItemModal
          item={editingItem}
          onSave={handleSaveItem}
          onClose={() => { setShowModal(false); setEditingItem(null); }}
        />
      )}
    </div>
  );
}

/* ── Menu Item Form Modal ──────────────────────────────────────────────── */
function MenuItemModal({ item, onSave, onClose }) {
  const [form, setForm] = useState({
    name: item?.name || "",
    description: item?.description || "",
    price: item?.price || "",
    category: item?.category || "lunch",
    image: item?.image || "",
    images: item?.images || [],
    videoUrl: item?.videoUrl || "",
    videoPublicId: item?.videoPublicId || "",
    preparationTime: item?.preparationTime || 15,
    available: item?.available !== false,
    portionSize: item?.portionSize || "",
    ingredients: item?.ingredients || "",
    allergens: item?.allergens || "",
    spiceLevel: item?.spiceLevel || "normal",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoError, setVideoError] = useState("");
  const xhrRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);

    try {
      // ✅ Parallel image uploads — was a `for...of await` in v1.
      const filesToUpload = form.images.filter((img) => img.file);
      let finalImages = [...form.images];

      if (filesToUpload.length > 0) {
        setUploading(true);
        const existingUrls = form.images
          .filter((img) => !img.file && img.url)
          .map((img) => ({ url: img.url, public_id: img.public_id || "" }));

        const results = await Promise.all(
          filesToUpload.map(async (img) => {
            try {
              const result = await menuAPI.uploadSingleImage(img.file);
              return { url: result.url, public_id: result.public_id || "" };
            } catch (uploadErr) {
              console.error("[MenuItemModal] Upload error:", uploadErr.message);
              // Fall back to the local preview URL so the vendor can keep
              // working without a Cloudinary round-trip.
              return { url: img.preview, public_id: "" };
            }
          })
        );

        finalImages = [...existingUrls, ...results];
        setUploading(false);
      }

      const saveData = {
        ...form,
        images: finalImages,
        image: finalImages[0]?.url || "",
        price: Number(form.price),
        preparationTime: Number(form.preparationTime),
      };

      await onSave(saveData);
    } catch (err) {
      console.error("[MenuItemModal] Save error:", err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleVideoSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_VIDEO_SIZE) {
      setVideoError("Video must be 50 MB or smaller");
      return;
    }
    if (!file.type.startsWith("video/")) {
      setVideoError("Please choose a video file");
      return;
    }
    setVideoError("");
    setVideoUploading(true);
    setVideoProgress(0);

    const formData = new FormData();
    formData.append("video", file);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", `${import.meta.env.VITE_API_BASE || "http://localhost:5000/api"}/menu/upload-video`);
    const token = localStorage.getItem("token");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        setVideoProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    };
    xhr.onload = () => {
      setVideoUploading(false);
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          setForm((f) => ({
            ...f,
            videoUrl: data.url,
            videoPublicId: data.public_id || "",
          }));
        } else {
          setVideoError(data.error || "Video upload failed");
        }
      } catch (err) {
        setVideoError("Video upload failed");
      }
    };
    xhr.onerror = () => {
      setVideoUploading(false);
      setVideoError("Network error during upload");
    };
    xhr.send(formData);
  }

  function handleCancelVideo() {
    if (xhrRef.current) xhrRef.current.abort();
    setVideoUploading(false);
    setVideoProgress(0);
    setVideoError("");
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h3>{item ? "Edit Menu Item" : "Add Menu Item"}</h3>
        <form onSubmit={handleSubmit}>
          {/* Basic Info */}
          <div className={styles.formSection}>
            <h4>Basic Information</h4>
            <div className={styles.field}>
              <label>Food Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Jollof Rice with Chicken"
                required
              />
            </div>
            <div className={styles.field}>
              <label>Description</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the dish..."
              />
            </div>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label>Price (GHS) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  required
                />
              </div>
              <div className={styles.field}>
                <label>Category *</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  required
                >
                  {menuCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Timing */}
          <div className={styles.formSection}>
            <h4>Timing & Status</h4>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label>Prep Time (minutes)</label>
                <input
                  type="number"
                  min="1"
                  value={form.preparationTime}
                  onChange={(e) => setForm({ ...form, preparationTime: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>Spice Level</label>
                <select
                  value={form.spiceLevel}
                  onChange={(e) => setForm({ ...form, spiceLevel: e.target.value })}
                >
                  <option value="mild">🌶️ Mild</option>
                  <option value="normal">🌶️ Normal</option>
                  <option value="medium">🌶️🌶️ Medium</option>
                  <option value="hot">🌶️🌶️🌶️ Hot</option>
                  <option value="extra_hot">🌶️🌶️🌶️🌶️ Extra Hot</option>
                </select>
              </div>
            </div>
          </div>

          {/* Additional Details */}
          <div className={styles.formSection}>
            <h4>Additional Details</h4>
            <div className={styles.field}>
              <label>Portion Size</label>
              <input
                type="text"
                value={form.portionSize}
                onChange={(e) => setForm({ ...form, portionSize: e.target.value })}
                placeholder="e.g., Full Plate, Half Plate, Small Bowl"
              />
            </div>
            <div className={styles.field}>
              <label>Ingredients</label>
              <textarea
                rows={2}
                value={form.ingredients}
                onChange={(e) => setForm({ ...form, ingredients: e.target.value })}
                placeholder="List main ingredients..."
              />
            </div>
            <div className={styles.field}>
              <label>Allergens</label>
              <input
                type="text"
                value={form.allergens}
                onChange={(e) => setForm({ ...form, allergens: e.target.value })}
                placeholder="e.g., Nuts, Dairy, Gluten"
              />
            </div>
          </div>

          {/* Images Upload */}
          <div className={styles.formSection}>
            <h4>Images</h4>
            <MultiImageUpload
              images={form.images}
              onImagesChange={(newImages) => {
                setForm({ ...form, images: newImages, image: newImages[0]?.url || "" });
              }}
            />
          </div>

          {/* Video Upload */}
          <div className={styles.formSection}>
            <h4>Video (optional)</h4>
            <div className={styles.videoUpload}>
              <label className={styles.videoUploadLabel}>
                🎬 Choose Video
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={handleVideoSelect}
                  disabled={videoUploading}
                />
              </label>
              {videoUploading && (
                <>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${videoProgress}%` }} />
                  </div>
                  <button type="button" className={styles.backBtn} onClick={handleCancelVideo}>Cancel</button>
                </>
              )}
              {!videoUploading && form.videoUrl && (
                <span className={`${styles.videoStatus} ${styles.success}`}>✓ Video uploaded</span>
              )}
              {videoError && <span className={`${styles.videoStatus} ${styles.error}`}>{videoError}</span>}
            </div>
            {form.videoUrl && (
              <video src={form.videoUrl} controls className={styles.videoPreview} />
            )}
          </div>

          {/* Availability */}
          <div className={styles.formSection}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={form.available}
                onChange={(e) => setForm({ ...form, available: e.target.checked })}
              />
              Available for ordering
            </label>
          </div>

          <div className={styles.modalActions}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save Item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
