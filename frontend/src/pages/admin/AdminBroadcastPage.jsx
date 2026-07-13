// pages/admin/AdminBroadcastPage.jsx
// Phase 2: admin broadcast composer + history. Sends a notification
// to a user segment (all / customers / vendors / restaurants /
// admins / selected) and shows the last 20 broadcasts with matched/
// sent counts.
import { useState, useEffect, useCallback } from "react";
import {
  Megaphone, Send, Clock, Users, History, CheckCircle, XCircle, AlertCircle,
} from "lucide-react";
import { notificationAPI } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import SEO from "../../components/SEO";
import logger from "../../utils/logger";
import styles from "./AdminBroadcastPage.module.css";

const AUDIENCE_OPTIONS = [
  { value: "all",         label: "Everyone" },
  { value: "customers",   label: "Customers" },
  { value: "vendors",     label: "Marketplace Vendors" },
  { value: "restaurants", label: "Restaurants" },
  { value: "admins",      label: "Admins" },
  { value: "selected",    label: "Selected users" },
];

const VENDOR_STATUSES = [
  { value: "",           label: "Any" },
  { value: "approved",   label: "Approved" },
  { value: "pending",    label: "Pending" },
  { value: "suspended",  label: "Suspended" },
  { value: "rejected",   label: "Rejected" },
];

const PRIORITY_OPTIONS = [
  { value: "low",    label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high",   label: "High" },
];

function statusBadge(status) {
  switch (status) {
    case "sent":      return <span className={`${styles.badge} ${styles.badgeOk}`}><CheckCircle size={12} /> Sent</span>;
    case "scheduled": return <span className={`${styles.badge} ${styles.badgeInfo}`}><Clock size={12} /> Scheduled</span>;
    case "failed":    return <span className={`${styles.badge} ${styles.badgeErr}`}><XCircle size={12} /> Failed</span>;
    case "sending":   return <span className={`${styles.badge} ${styles.badgeWarn}`}><AlertCircle size={12} /> Sending</span>;
    default:          return <span className={styles.badge}>{status}</span>;
  }
}

export default function AdminBroadcastPage({ addToast }) {
  const { user, isLoggedIn } = useAuth();

  // Composer state
  const [audience, setAudience] = useState("all");
  const [vendorStatus, setVendorStatus] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [image, setImage] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [priority, setPriority] = useState("medium");
  const [sendEmail, setSendEmail] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // History state
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const data = await notificationAPI.listBroadcasts(20);
      setHistory(data.broadcasts || data || []);
    } catch (err) {
      logger.log("[AdminBroadcast] history load failed:", err.message);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn && user?.isAdmin) loadHistory();
  }, [isLoggedIn, user, loadHistory]);

  if (!isLoggedIn || !user?.isAdmin) {
    return (
      <div className={styles.page}>
        <SEO title="Admin Broadcast | SiiShop" />
        <div className={styles.empty}>
          <Megaphone size={48} />
          <h2>Admin only</h2>
          <p>You need administrator access to send broadcasts.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (submitting) return;
    if (!title.trim() || !message.trim()) {
      addToast?.("Title and message are required", "error");
      return;
    }
    if (audience === "selected") {
      const ids = selectedUserIds.split(/[\s,]+/).filter(Boolean);
      if (ids.length === 0) {
        addToast?.("Provide at least one user id for audience=selected", "error");
        return;
      }
    }

    const payload = {
      audience,
      filters: {
        ...(vendorStatus ? { vendorStatus } : {}),
        ...(country ? { country } : {}),
        ...(city ? { city } : {}),
      },
      selectedUserIds:
        audience === "selected"
          ? selectedUserIds.split(/[\s,]+/).filter(Boolean)
          : undefined,
      title: title.trim(),
      message: message.trim(),
      image: image.trim() || undefined,
      deepLink: deepLink.trim() || undefined,
      priority,
      sendEmail,
      scheduledFor: scheduledFor || undefined,
      expiresAt: expiresAt || undefined,
    };

    setSubmitting(true);
    try {
      const data = await notificationAPI.sendBroadcast(payload);
      if (data.status === "scheduled") {
        addToast?.(`Scheduled for ${new Date(scheduledFor).toLocaleString()}`, "success");
      } else {
        addToast?.(`Sent to ${data.sent || data.matched || 0} users`, "success");
      }
      // Reset composer
      setTitle("");
      setMessage("");
      setImage("");
      setDeepLink("");
      setPriority("medium");
      setSendEmail(false);
      setScheduledFor("");
      setExpiresAt("");
      loadHistory();
    } catch (err) {
      addToast?.(err.message || "Failed to send broadcast", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <SEO title="Admin Broadcast | SiiShop" />

      <header className={styles.header}>
        <div className={styles.titleRow}>
          <Megaphone size={24} />
          <div>
            <h1>Send a Broadcast</h1>
            <p className={styles.subtitle}>
              Reach all users or a specific segment with a single notification.
            </p>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit} className={styles.form}>
        <section className={styles.section}>
          <h2><Users size={18} /> Audience</h2>
          <div className={styles.audienceRow}>
            {AUDIENCE_OPTIONS.map((o) => (
              <label key={o.value} className={styles.radioCard}>
                <input
                  type="radio"
                  name="audience"
                  value={o.value}
                  checked={audience === o.value}
                  onChange={() => setAudience(o.value)}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>

          {(audience === "vendors" || audience === "restaurants") && (
            <div className={styles.filterRow}>
              <label>
                <span>Vendor status</span>
                <select
                  value={vendorStatus}
                  onChange={(e) => setVendorStatus(e.target.value)}
                >
                  {VENDOR_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {(audience === "all" || audience === "customers" || audience === "vendors" || audience === "restaurants") && (
            <div className={styles.filterRow}>
              <label>
                <span>Country (optional)</span>
                <input
                  type="text"
                  placeholder="e.g. GH"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </label>
              <label>
                <span>City (optional)</span>
                <input
                  type="text"
                  placeholder="e.g. Accra"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </label>
            </div>
          )}

          {audience === "selected" && (
            <div className={styles.filterRow}>
              <label className={styles.fullWidth}>
                <span>User IDs (comma or whitespace separated)</span>
                <textarea
                  rows={3}
                  placeholder="e.g. 64f1a2b3c4d5e6f7a8b9c0d1 64f1a2b3c4d5e6f7a8b9c0d2"
                  value={selectedUserIds}
                  onChange={(e) => setSelectedUserIds(e.target.value)}
                />
              </label>
            </div>
          )}
        </section>

        <section className={styles.section}>
          <h2>Content</h2>
          <label className={styles.field}>
            <span>Title *</span>
            <input
              type="text"
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement headline"
              required
            />
            <small>{title.length}/200</small>
          </label>

          <label className={styles.field}>
            <span>Message *</span>
            <textarea
              rows={4}
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Body of the notification…"
              required
            />
            <small>{message.length}/2000</small>
          </label>

          <div className={styles.row}>
            <label className={styles.field}>
              <span>Image URL (optional)</span>
              <input
                type="url"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="https://…"
              />
            </label>
            <label className={styles.field}>
              <span>Deep link (optional)</span>
              <input
                type="text"
                value={deepLink}
                onChange={(e) => setDeepLink(e.target.value)}
                placeholder="/deals"
              />
            </label>
          </div>

          <div className={styles.row}>
            <label className={styles.field}>
              <span>Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Expires at (optional)</span>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </label>
          </div>

          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
            />
            <span>Also send by email (when the user has email enabled)</span>
          </label>

          <label className={styles.field}>
            <span>Schedule for (optional — leave empty to send now)</span>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
            />
          </label>
        </section>

        <div className={styles.submitRow}>
          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={submitting || !title.trim() || !message.trim()}
          >
            <Send size={16} />
            {submitting
              ? (scheduledFor ? "Scheduling…" : "Sending…")
              : (scheduledFor ? "Schedule broadcast" : "Send broadcast")}
          </button>
        </div>
      </form>

      <section className={styles.section}>
        <h2><History size={18} /> Recent broadcasts</h2>
        {historyLoading ? (
          <div className={styles.loading}>Loading history…</div>
        ) : history.length === 0 ? (
          <div className={styles.empty}>No broadcasts yet. Send your first one above.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Audience</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Recipients</th>
                </tr>
              </thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b._id}>
                    <td>
                      {b.sentAt
                        ? new Date(b.sentAt).toLocaleString()
                        : (b.scheduledFor
                          ? `Scheduled ${new Date(b.scheduledFor).toLocaleString()}`
                          : "—")}
                    </td>
                    <td>{b.audience}</td>
                    <td className={styles.titleCell}>{b.title}</td>
                    <td>{statusBadge(b.status)}</td>
                    <td>
                      {b.matchedCount !== undefined && (
                        <>
                          <strong>{b.sentCount || 0}</strong> / {b.matchedCount}
                        </>
                      )}
                      {b.failureReason && (
                        <div className={styles.failureReason}>{b.failureReason}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
