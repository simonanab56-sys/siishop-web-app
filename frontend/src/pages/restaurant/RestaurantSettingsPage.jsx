// pages/restaurant/RestaurantSettingsPage.jsx — v2
//
// Changes from v1:
// - Logo and cover image fields were plain <input type="text"> URL fields.
//   Replaced with a Cloudinary-backed file uploader (POSTs to
//   /api/restaurants/upload-branding?field=logo or ?field=cover).
//   Uses XHR for upload progress (URLs returned by Cloudinary come back
//   without progress events on fetch, so XHR is the only way to show a
//   progress bar for big files).
// - Inline <style> block extracted to RestaurantSettingsPage.module.css.

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { authAPI, getApiBaseUrl, getToken } from "../../services/api";
import { useToast } from "../../components/Toast";
import { ghanaRegions } from "../../config/cuisineTypes";
import { getImageUrl } from "../../utils/image";
import styles from "./RestaurantSettingsPage.module.css";

const MAX_BRANDING_SIZE = 2 * 1024 * 1024; // 2 MB

export default function RestaurantSettingsPage({ onBack, addToast }) {
  const { user, refreshUser } = useAuth();
  const { addToast: showToast } = useToast();
  const [saving, setSaving] = useState(false);
  // ✅ FIX: Persistent save status banner.
  //   `saveStatus` is one of: null (idle), "saving", "success", "error".
  //   The banner stays on screen until the user starts editing again or
  //   initiates a new save. Toasts alone are too easy to miss (they
  //   auto-dismiss in 3 s) and the user reported "when it saved it should
  //   indicate it" — the inline banner provides durable, in-context
  //   feedback that doesn't disappear.
  const [saveStatus, setSaveStatus]   = useState(null); // "saving" | "success" | "error"
  const [saveMessage, setSaveMessage] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoProgress, setLogoProgress] = useState(0);
  const [logoError, setLogoError] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverProgress, setCoverProgress] = useState(0);
  const [coverError, setCoverError] = useState("");
  const logoXhrRef = useRef(null);
  const coverXhrRef = useRef(null);
  const [form, setForm] = useState({
    restaurantName: user?.restaurantDetails?.restaurantName || user?.storeName || "",
    restaurantDescription: user?.restaurantDetails?.restaurantDescription || "",
    storeLogo: user?.restaurantDetails?.storeLogo || user?.storeLogo || "",
    restaurantCoverImage: user?.restaurantDetails?.restaurantCoverImage || "",
    cuisineType: user?.restaurantDetails?.cuisineType || "",
    phone: user?.restaurantDetails?.phone || user?.phone || "",
    whatsapp: user?.restaurantDetails?.whatsapp || "",
    address: user?.restaurantDetails?.address || "",
    region: user?.location?.region || "",
    city: user?.location?.city || "",
    area: user?.restaurantDetails?.area || "",
    deliveryRadius: user?.restaurantDetails?.deliveryRadius || 5,
    deliveryFee: user?.restaurantDetails?.deliveryFee || 0,
    estimatedDeliveryTime: user?.restaurantDetails?.estimatedDeliveryTime || 30,
    openingHours: user?.restaurantDetails?.openingHours || "08:00",
    closingHours: user?.restaurantDetails?.closingHours || "22:00",
    isOpen: user?.restaurantDetails?.isOpen || false,
  });

  const [cities, setCities] = useState([]);

  useEffect(() => {
    if (form.region) {
      const region = ghanaRegions.find((r) => r.name === form.region);
      setCities(region?.cities || []);
    }
  }, [form.region]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setSaveStatus("saving");
    setSaveMessage("Saving your settings…");
    try {
      const updateData = {
        name: user.name,
        storeName: form.restaurantName,
        storeLogo: form.storeLogo,
        restaurantDetails: {
          restaurantName: form.restaurantName,
          restaurantDescription: form.restaurantDescription,
          storeLogo: form.storeLogo,
          restaurantCoverImage: form.restaurantCoverImage,
          cuisineType: form.cuisineType,
          phone: form.phone,
          whatsapp: form.whatsapp,
          address: form.address,
          area: form.area,
          deliveryRadius: form.deliveryRadius,
          deliveryFee: form.deliveryFee,
          estimatedDeliveryTime: form.estimatedDeliveryTime,
          openingHours: form.openingHours,
          closingHours: form.closingHours,
          isOpen: form.isOpen,
        },
        location: {
          country: "Ghana",
          region: form.region,
          city: form.city,
        },
      };

      // 1. Persist to backend
      const res = await authAPI.updateMe(updateData);
      if (!res || res.error) {
        throw new Error(res?.error || "Server returned an error");
      }
      // 2. Refresh the auth context so the rest of the app sees the
      //    new restaurantDetails / location / storeName / etc.
      await refreshUser();
      // 3. ✅ FIX: Set the persistent success banner. The toast alone
      //    was easy to miss — this banner stays on screen until the
      //    user starts editing or saves again, giving clear durable
      //    feedback that the save succeeded.
      const now = new Date();
      setSaveStatus("success");
      setSaveMessage("✅ Settings saved successfully");
      setLastSavedAt(now);
      showToast?.("Settings saved successfully", "success");
    } catch (err) {
      // ✅ FIX: Set the persistent error banner with the actual server
      //   error message, not just a 3-second toast. Toasts were being
      //   missed and the user reported "when it fails it should indicate
      //   it" — the inline banner keeps the failure reason on screen
      //   until the user retries.
      const message = err?.message || "Failed to save settings";
      setSaveStatus("error");
      setSaveMessage(`❌ Save failed: ${message}`);
      showToast?.(message, "error");
    } finally {
      setSaving(false);
    }
  }

  // Clear the persistent save banner as soon as the user edits a field
  // — stale "Saved 2 minutes ago" banners would be misleading once the
  // form is dirty again.
  function clearSaveStatus() {
    if (saveStatus === "success") {
      setSaveStatus(null);
      setSaveMessage("");
    }
  }

  // Single-field setter — also clears the persistent "Saved" banner so
  // a stale success indicator doesn't linger after the user starts
  // editing again. Error banners are kept (the user may want to retry
  // the same save without re-reading the error first).
  function setField(key, value) {
    clearSaveStatus();
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Multi-field setter — same as setField but updates several keys in
  // a single setForm call (used by the region selector, which also
  // resets the dependent city selection).
  function setFields(patch) {
    clearSaveStatus();
    setForm((f) => ({ ...f, ...patch }));
  }

  function uploadBrandingFile(file, field, setProgress, setUploading, setError, xhrRef, onSuccess) {
    if (!file) return;
    if (file.size > MAX_BRANDING_SIZE) {
      setError("Image must be 2 MB or smaller");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file");
      return;
    }
    setError("");
    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append("image", file);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    const baseURL = getApiBaseUrl();
    xhr.open("POST", `${baseURL}/restaurants/upload-branding?field=${field}`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        setProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    };
    xhr.onload = () => {
      setUploading(false);
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          onSuccess(data);
        } else {
          setError(data.error || "Upload failed");
        }
      } catch (err) {
        setError("Upload failed");
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      setError("Network error during upload");
    };
    xhr.send(formData);
  }

  function handleLogoSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    uploadBrandingFile(
      file,
      "logo",
      setLogoProgress,
      setLogoUploading,
      setLogoError,
      logoXhrRef,
      (data) => {
        clearSaveStatus();
        setForm((f) => ({ ...f, storeLogo: data.url }));
        showToast?.("Logo uploaded", "success");
      }
    );
  }

  function handleCoverSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    uploadBrandingFile(
      file,
      "cover",
      setCoverProgress,
      setCoverUploading,
      setCoverError,
      coverXhrRef,
      (data) => {
        clearSaveStatus();
        setForm((f) => ({ ...f, restaurantCoverImage: data.url }));
        showToast?.("Cover image uploaded", "success");
      }
    );
  }

  function cancelUpload(which) {
    const ref = which === "logo" ? logoXhrRef : coverXhrRef;
    if (ref.current) ref.current.abort();
    if (which === "logo") {
      setLogoUploading(false);
      setLogoProgress(0);
      setLogoError("");
    } else {
      setCoverUploading(false);
      setCoverProgress(0);
      setCoverError("");
    }
  }

  // Pre-render the optimized logo / cover URLs for previews.
  const logoPreviewUrl = form.storeLogo ? getImageUrl(form.storeLogo, { width: 200 }) : "";
  const coverPreviewUrl = form.restaurantCoverImage ? getImageUrl(form.restaurantCoverImage, { width: 800 }) : "";

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <button onClick={onBack} className={styles.backBtn}>← Back to Dashboard</button>
        <h2>⚙️ Restaurant Settings</h2>
      </div>

      {/* ✅ FIX: Persistent save status banner. The user reported that
          toasts alone were not enough — they wanted clear, durable
          feedback for both success and failure. The banner stays on
          screen until the user edits a field or saves again, so they
          can always see the most recent save outcome without having
          to catch a 3-second toast. */}
      {saveStatus && (
        <div
          className={
            saveStatus === "success"
              ? `${styles.saveBanner} ${styles.saveBannerSuccess}`
              : saveStatus === "error"
              ? `${styles.saveBanner} ${styles.saveBannerError}`
              : `${styles.saveBanner} ${styles.saveBannerSaving}`
          }
          role="status"
          aria-live="polite"
        >
          <span>{saveMessage}</span>
          {saveStatus === "success" && lastSavedAt && (
            <span className={styles.saveBannerMeta}>
              Last saved at {lastSavedAt.toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Basic Info */}
        <div className={styles.section}>
          <h3>📋 Basic Information</h3>
          <div className={styles.field}>
            <label>Restaurant Name *</label>
            <input
              type="text"
              value={form.restaurantName}
              onChange={(e) => setField("restaurantName", e.target.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <label>Description</label>
            <textarea
              rows={3}
              value={form.restaurantDescription}
              onChange={(e) => setField("restaurantDescription", e.target.value)}
              placeholder="Tell customers about your restaurant..."
            />
          </div>
          <div className={styles.field}>
            <label>Cuisine Type</label>
            <select
              value={form.cuisineType}
              onChange={(e) => setField("cuisineType", e.target.value)}
            >
              <option value="">Select cuisine</option>
              <option value="African">African</option>
              <option value="Chinese">Chinese</option>
              <option value="Fast Food">Fast Food</option>
              <option value="Fusion">Fusion</option>
              <option value="Ghanaian">Ghanaian</option>
              <option value="Indian">Indian</option>
              <option value="Italian">Italian</option>
              <option value="Japanese">Japanese</option>
              <option value="Lebanese">Lebanese</option>
              <option value="Mexican">Mexican</option>
              <option value="Nigerian">Nigerian</option>
              <option value="Pizza">Pizza</option>
              <option value="Seafood">Seafood</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        {/* Images — Cloudinary-backed uploader */}
        <div className={styles.section}>
          <h3>🖼️ Branding</h3>

          <div className={styles.field}>
            <label>Logo</label>
            <div className={styles.imageUpload}>
              <label className={styles.imageUploadLabel}>
                📷 Choose Logo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleLogoSelect}
                  disabled={logoUploading}
                />
              </label>
              {logoUploading && (
                <>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${logoProgress}%` }} />
                  </div>
                  <button type="button" className={styles.backBtn} onClick={() => cancelUpload("logo")}>Cancel</button>
                </>
              )}
              {!logoUploading && form.storeLogo && (
                <span className={`${styles.imageStatus} ${styles.success}`}>✓ Uploaded</span>
              )}
              {logoError && <span className={`${styles.imageStatus} ${styles.error}`}>{logoError}</span>}
            </div>
            {logoPreviewUrl && (
              <img src={logoPreviewUrl} alt="Logo preview" className={styles.imagePreview} loading="lazy" />
            )}
          </div>

          <div className={styles.field}>
            <label>Cover / Banner Image</label>
            <div className={styles.imageUpload}>
              <label className={styles.imageUploadLabel}>
                🖼️ Choose Cover
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleCoverSelect}
                  disabled={coverUploading}
                />
              </label>
              {coverUploading && (
                <>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${coverProgress}%` }} />
                  </div>
                  <button type="button" className={styles.backBtn} onClick={() => cancelUpload("cover")}>Cancel</button>
                </>
              )}
              {!coverUploading && form.restaurantCoverImage && (
                <span className={`${styles.imageStatus} ${styles.success}`}>✓ Uploaded</span>
              )}
              {coverError && <span className={`${styles.imageStatus} ${styles.error}`}>{coverError}</span>}
            </div>
            {coverPreviewUrl && (
              <img src={coverPreviewUrl} alt="Cover preview" className={styles.coverPreview} loading="lazy" />
            )}
          </div>
        </div>

        {/* Contact */}
        <div className={styles.section}>
          <h3>📞 Contact Information</h3>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Phone Number</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                placeholder="+233..."
              />
            </div>
            <div className={styles.field}>
              <label>WhatsApp Number</label>
              <input
                type="tel"
                value={form.whatsapp}
                onChange={(e) => setField("whatsapp", e.target.value)}
                placeholder="+233..."
              />
            </div>
          </div>
          <div className={styles.field}>
            <label>Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setField("address", e.target.value)}
              placeholder="Street address..."
            />
          </div>
        </div>

        {/* Location */}
        <div className={styles.section}>
          <h3>📍 Location</h3>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Region</label>
              <select
                value={form.region}
                onChange={(e) => setFields({ region: e.target.value, city: "" })}
              >
                <option value="">Select region</option>
                {ghanaRegions.map((region) => (
                  <option key={region.name} value={region.name}>{region.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label>City</label>
              <select
                value={form.city}
                onChange={(e) => setField("city", e.target.value)}
                disabled={!form.region}
              >
                <option value="">Select city</option>
                {cities.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.field}>
            <label>Area/Neighborhood</label>
            <input
              type="text"
              value={form.area}
              onChange={(e) => setField("area", e.target.value)}
              placeholder="e.g., Roman Hill, Airport Residential"
            />
          </div>
        </div>

        {/* Delivery */}
        <div className={styles.section}>
          <h3>🚚 Delivery Settings</h3>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Delivery Radius (km)</label>
              <input
                type="number"
                min="0"
                value={form.deliveryRadius}
                onChange={(e) => setField("deliveryRadius", Number(e.target.value))}
              />
            </div>
            <div className={styles.field}>
              <label>Delivery Fee (GHS)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.deliveryFee}
                onChange={(e) => setField("deliveryFee", Number(e.target.value))}
              />
            </div>
            <div className={styles.field}>
              <label>Est. Delivery Time (min)</label>
              <input
                type="number"
                min="0"
                value={form.estimatedDeliveryTime}
                onChange={(e) => setField("estimatedDeliveryTime", Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Hours */}
        <div className={styles.section}>
          <h3>🕐 Opening Hours</h3>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Opening Time</label>
              <input
                type="time"
                value={form.openingHours}
                onChange={(e) => setField("openingHours", e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label>Closing Time</label>
              <input
                type="time"
                value={form.closingHours}
                onChange={(e) => setField("closingHours", e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Status */}
        <div className={styles.section}>
          <h3>📊 Restaurant Status</h3>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={form.isOpen}
              onChange={(e) => setField("isOpen", e.target.checked)}
            />
            <span>Open for orders (customers can see and order from your restaurant)</span>
          </label>
          <p className={styles.helpText}>
            {form.isOpen
              ? "🟢 Your restaurant is visible to customers and accepting orders."
              : "🔴 Your restaurant is hidden from customers."}
          </p>
        </div>

        <div className={styles.formActions}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
