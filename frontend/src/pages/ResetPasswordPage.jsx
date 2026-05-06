// pages/ResetPasswordPage.jsx — Password reset page with token validation
import { useState, useEffect } from "react";
import { authAPI } from "../services/api";
import styles from "./ResetPasswordPage.module.css";

export default function ResetPasswordPage({ addToast, onNavigate }) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("reset"); // "reset" or "success"

  // Extract token and email from URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    const urlEmail = params.get("email");

    if (urlToken) setToken(urlToken);
    if (urlEmail) setEmail(decodeURIComponent(urlEmail));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!email || !token) {
      addToast?.("Invalid reset link. Please request a new one.", "error");
      return;
    }

    if (!newPassword || !confirmPassword) {
      addToast?.("Please enter and confirm your new password", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      addToast?.("Passwords do not match", "error");
      return;
    }

    if (newPassword.length < 6) {
      addToast?.("Password must be at least 6 characters", "error");
      return;
    }

    setLoading(true);
    try {
      await authAPI.resetPassword(email, token, newPassword);
      addToast?.("Password reset successfully! You can now log in.", "success");
      setStep("success");

      // Redirect to home after 2 seconds
      setTimeout(() => {
        onNavigate?.("home");
      }, 2000);
    } catch (err) {
      addToast?.(err.message || "Failed to reset password", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`container page-enter ${styles.page}`}>
      <div className={styles.card}>
        <h1 className={styles.title}>Reset Your Password</h1>

        {step === "reset" ? (
          <>
            <p className={styles.description}>
              Enter your new password below. Make sure it's at least 6 characters long.
            </p>

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.field}>
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className={styles.disabledInput}
                />
              </div>

              <div className={styles.field}>
                <label>New Password</label>
                <input
                  type="password"
                  placeholder="Min. 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className={styles.field}>
                <label>Confirm Password</label>
                <input
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                  required
                />
              </div>

              <button className="btn btn-primary" disabled={loading}>
                {loading ? "Resetting…" : "Reset Password"}
              </button>
            </form>

            <p className={styles.backLink}>
              Remember your password?{" "}
              <button
                type="button"
                onClick={() => onNavigate?.("home")}
                className={styles.link}
              >
                Back to login
              </button>
            </p>
          </>
        ) : (
          <div className={styles.success}>
            <div className={styles.successIcon}>✓</div>
            <h2 className={styles.successTitle}>Password Reset Successful!</h2>
            <p className={styles.successMessage}>
              Your password has been changed. You'll be redirected to log in shortly.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
