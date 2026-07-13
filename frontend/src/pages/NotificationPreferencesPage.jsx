// pages/NotificationPreferencesPage.jsx
// Phase 2: per-user notification preferences. Toggles for each
// delivery channel (push, email, in-app) and each category
// (promotional, order updates, wallet, review reminders, marketing),
// plus do-not-disturb hours. Saves via PUT /api/notifications/preferences.
import { useState, useEffect, useCallback } from "react";
import {
  Bell, Mail, Smartphone, Megaphone, ShoppingBag, Wallet,
  Star, Sparkles, Moon, Save, RefreshCw,
} from "lucide-react";
import { notificationAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import SEO from "../components/SEO";
import logger from "../utils/logger";
import styles from "./NotificationPreferencesPage.module.css";

const DEFAULTS = {
  push: true,
  email: true,
  inApp: true,
  promotional: true,
  orderUpdates: true,
  walletUpdates: true,
  reviewReminders: true,
  marketing: false,
  dndStart: "",
  dndEnd: "",
};

function Toggle({ checked, onChange, disabled, label }) {
  return (
    <label className={`${styles.toggle} ${disabled ? styles.toggleDisabled : ""}`}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
      />
      <span className={styles.toggleTrack}>
        <span className={styles.toggleThumb} />
      </span>
      {label && <span className={styles.toggleLabel}>{label}</span>}
    </label>
  );
}

export default function NotificationPreferencesPage({ addToast }) {
  const { isLoggedIn } = useAuth();
  const [prefs, setPrefs] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!isLoggedIn) {
      setLoaded(true);
      return;
    }
    try {
      const data = await notificationAPI.getPreferences();
      const incoming = (data && data.preferences) || data || {};
      setPrefs({ ...DEFAULTS, ...incoming });
    } catch (err) {
      logger.log("[Prefs] load failed:", err.message);
      // fall through with defaults — the page is still usable
    } finally {
      setLoaded(false);
      setLoaded(true);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    load();
  }, [load]);

  const updateField = (key, value) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await notificationAPI.updatePreferences(prefs);
      setDirty(false);
      addToast?.("Preferences saved", "success");
    } catch (err) {
      addToast?.(err.message || "Failed to save preferences", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className={styles.page}>
        <SEO title="Notification Preferences | SiiShop" />
        <div className={styles.empty}>
          <Bell size={48} />
          <h2>Sign in to manage notification preferences</h2>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className={styles.page}>
        <SEO title="Notification Preferences | SiiShop" />
        <div className={styles.loading}>Loading preferences…</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <SEO title="Notification Preferences | SiiShop" />

      <header className={styles.header}>
        <div className={styles.titleRow}>
          <Bell size={24} />
          <div>
            <h1>Notification Preferences</h1>
            <p className={styles.subtitle}>
              Choose how and when SiiShop notifies you.
            </p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => {
              setPrefs(DEFAULTS);
              setDirty(true);
            }}
          >
            <RefreshCw size={14} /> Reset to defaults
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            <Save size={14} /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      <section className={styles.section}>
        <h2>Delivery channels</h2>
        <p className={styles.sectionHint}>
          The ways SiiShop can reach you. Turning a channel off suppresses
          ALL notifications of every type via that channel.
        </p>
        <div className={styles.toggleGrid}>
          <div className={styles.toggleRow}>
            <div className={styles.toggleRowText}>
              <Smartphone size={20} />
              <div>
                <div className={styles.toggleRowTitle}>Push notifications</div>
                <div className={styles.toggleRowDesc}>
                  Browser & mobile push. Web Push requires your browser to
                  be open. (Wired as a service-account-ready logger stub
                  for now; flipping the switch needs VAPID keys.)
                </div>
              </div>
            </div>
            <Toggle
              checked={prefs.push}
              onChange={(v) => updateField("push", v)}
            />
          </div>

          <div className={styles.toggleRow}>
            <div className={styles.toggleRowText}>
              <Mail size={20} />
              <div>
                <div className={styles.toggleRowTitle}>Email</div>
                <div className={styles.toggleRowDesc}>
                  Receipts, status updates, and the existing per-type
                  notification emails.
                </div>
              </div>
            </div>
            <Toggle
              checked={prefs.email}
              onChange={(v) => updateField("email", v)}
            />
          </div>

          <div className={styles.toggleRow}>
            <div className={styles.toggleRowText}>
              <Bell size={20} />
              <div>
                <div className={styles.toggleRowTitle}>In-app</div>
                <div className={styles.toggleRowDesc}>
                  The bell badge, the inbox page, and the live dropdown
                  panel.
                </div>
              </div>
            </div>
            <Toggle
              checked={prefs.inApp}
              onChange={(v) => updateField("inApp", v)}
            />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Categories</h2>
        <p className={styles.sectionHint}>
          Disable categories you don't care about. You can still receive
          urgent system messages regardless of these settings.
        </p>
        <div className={styles.toggleGrid}>
          <div className={styles.toggleRow}>
            <div className={styles.toggleRowText}>
              <ShoppingBag size={20} />
              <div>
                <div className={styles.toggleRowTitle}>Order updates</div>
                <div className={styles.toggleRowDesc}>
                  Order accepted, preparing, packed, rider assigned,
                  out for delivery, delivered.
                </div>
              </div>
            </div>
            <Toggle
              checked={prefs.orderUpdates}
              onChange={(v) => updateField("orderUpdates", v)}
            />
          </div>

          <div className={styles.toggleRow}>
            <div className={styles.toggleRowText}>
              <Wallet size={20} />
              <div>
                <div className={styles.toggleRowTitle}>Wallet updates</div>
                <div className={styles.toggleRowDesc}>
                  Withdrawal submitted / approved / processing / completed /
                  rejected, commission paid / due / overdue, refunds.
                </div>
              </div>
            </div>
            <Toggle
              checked={prefs.walletUpdates}
              onChange={(v) => updateField("walletUpdates", v)}
            />
          </div>

          <div className={styles.toggleRow}>
            <div className={styles.toggleRowText}>
              <Star size={20} />
              <div>
                <div className={styles.toggleRowTitle}>Review reminders</div>
                <div className={styles.toggleRowDesc}>
                  "Leave a review" nudges after a delivered order.
                </div>
              </div>
            </div>
            <Toggle
              checked={prefs.reviewReminders}
              onChange={(v) => updateField("reviewReminders", v)}
            />
          </div>

          <div className={styles.toggleRow}>
            <div className={styles.toggleRowText}>
              <Sparkles size={20} />
              <div>
                <div className={styles.toggleRowTitle}>Promotional</div>
                <div className={styles.toggleRowDesc}>
                  Coupons, promos, flash sales, wishlist price drops and
                  back-in-stock alerts.
                </div>
              </div>
            </div>
            <Toggle
              checked={prefs.promotional}
              onChange={(v) => updateField("promotional", v)}
            />
          </div>

          <div className={styles.toggleRow}>
            <div className={styles.toggleRowText}>
              <Megaphone size={20} />
              <div>
                <div className={styles.toggleRowTitle}>Marketing</div>
                <div className={styles.toggleRowDesc}>
                  Off by default. Opt in to receive occasional product
                  recommendations and platform news.
                </div>
              </div>
            </div>
            <Toggle
              checked={prefs.marketing}
              onChange={(v) => updateField("marketing", v)}
            />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>
          <Moon size={18} /> Do not disturb
        </h2>
        <p className={styles.sectionHint}>
          Optional. If set, non-urgent notifications are suppressed during
          this window. Set both fields, or leave both empty to disable.
        </p>
        <div className={styles.dndRow}>
          <label className={styles.timeField}>
            <span>From</span>
            <input
              type="time"
              value={prefs.dndStart || ""}
              onChange={(e) => updateField("dndStart", e.target.value)}
            />
          </label>
          <label className={styles.timeField}>
            <span>Until</span>
            <input
              type="time"
              value={prefs.dndEnd || ""}
              onChange={(e) => updateField("dndEnd", e.target.value)}
            />
          </label>
        </div>
      </section>

      {dirty && (
        <div className={styles.saveBar}>
          <span>You have unsaved changes.</span>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleSave}
            disabled={saving}
          >
            <Save size={14} /> {saving ? "Saving…" : "Save now"}
          </button>
        </div>
      )}
    </div>
  );
}
