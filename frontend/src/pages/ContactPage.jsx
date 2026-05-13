// ContactPage.jsx — Contact SiiShop
import { useState } from "react";
import { apiRequest } from "../services/api";
import styles from "./ContactPage.module.css";

function getToken() {
  return localStorage.getItem("token");
}

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError("");
    setSent(false);

    try {
      const token = getToken();
      await apiRequest("/contact", {
        method: "POST",
        body: JSON.stringify(form),
        headers: token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
      });
      setSent(true);
      setForm({ name: "", email: "", message: "" });
    } catch (err) {
      setError(err.message || "Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <h1 className={styles.pageTitle}>Contact Us</h1>
        <p className={styles.pageSubtitle}>We'd love to hear from you. Reach out through any of the channels below.</p>

        <div className={styles.grid}>
          {/* Contact Form */}
          <div className={styles.formCard}>
            <h2 className={styles.cardTitle}>Send us a Message</h2>

            {sent && (
              <div className={styles.successBox}>
                ✓ Message sent successfully! We'll get back to you soon.
              </div>
            )}

            {error && <div className={styles.errorBox}>{error}</div>}

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="name">Name</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  placeholder="Your name"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                  placeholder="your@email.com"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="message">Message</label>
                <textarea
                  id="message"
                  name="message"
                  value={form.message}
                  onChange={handleChange}
                  required
                  rows={5}
                  placeholder="How can we help you?"
                />
              </div>

              <button type="submit" className={`btn btn-primary ${styles.submitBtn}`} disabled={sending}>
                {sending ? "Sending..." : "Send Message"}
              </button>
            </form>
          </div>

          {/* Contact Info */}
          <div className={styles.infoSection}>
            <div className={styles.infoCard}>
              <div className={styles.infoIcon}>📧</div>
              <h3>Email Support</h3>
              <p>support@siishop.com</p>
              <p className={styles.infoNote}>We respond within 24 hours</p>
            </div>

            <div className={styles.infoCard}>
              <div className={styles.infoIcon}>💬</div>
              <h3>WhatsApp</h3>
              <p>+233 50 123 4567</p>
              <p className={styles.infoNote}>Available 8am - 8pm daily</p>
            </div>

            <div className={styles.infoCard}>
              <div className={styles.infoIcon}>🕐</div>
              <h3>Support Hours</h3>
              <p>Monday - Friday: 8am - 6pm</p>
              <p>Saturday: 9am - 4pm</p>
              <p className={styles.infoNote}>Sunday: Closed</p>
            </div>

            <div className={styles.infoCard}>
              <div className={styles.infoIcon}>❓</div>
              <h3>FAQ</h3>
              <p>Check our <a href="/faq" className={styles.link}>FAQ page</a> for answers to common questions.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}