// components/auth/AuthModal.jsx — FIXED HOOKS ORDER
// Fix: Removed early return that violated React hooks rules
// Fix: All hooks now called at top level BEFORE any conditional logic
import { useState, useEffect } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { authAPI } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import styles from "./AuthModal.module.css";

export default function AuthModal({ isOpen, onClose, onSuccess, initialView = "login" }) {
  // ── ALL HOOKS AT TOP LEVEL (BEFORE ANY CONDITIONAL LOGIC) ──
  const { login } = useAuth();
  
  const [view,    setView]    = useState(initialView);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");

  const [name,             setName]             = useState("");
  const [email,            setEmail]            = useState("");
  const [password,         setPassword]         = useState("");
  const [confirm,          setConfirm]          = useState("");
  const [asVendor,         setAsVendor]         = useState(false);
  const [storeName,        setStoreName]        = useState("");
  const [storeDescription, setStoreDescription] = useState("");
  
  const [phoneNumber,      setPhoneNumber]      = useState("");
  const [idType,           setIdType]           = useState("national_id");
  const [idFrontImage,     setIdFrontImage]     = useState(null);
  const [idBackImage,      setIdBackImage]      = useState(null);
  const [idFrontPreview,   setIdFrontPreview]   = useState("");
  const [idBackPreview,    setIdBackPreview]    = useState("");
  const [oauthLoading,     setOauthLoading]     = useState(false);

  // ── EFFECTS AT TOP LEVEL ──
  useEffect(() => {
    setView(initialView);
    setError(""); setSuccess("");
    setName(""); setEmail(""); setPassword(""); setConfirm("");
    setAsVendor(false); setStoreName(""); setStoreDescription("");
    setPhoneNumber(""); setIdType("national_id"); setIdFrontImage(null); setIdBackImage(null);
    setIdFrontPreview(""); setIdBackPreview("");
    setLoading(false); setOauthLoading(false);
  }, [isOpen, initialView]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !loading) onClose?.(); };
    if (isOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, loading]);

  // ── GOOGLE LOGIN (GOOGLE IDENTITY SERVICES CREDENTIAL/JWT FLOW) ──
  const hasGoogleClientId = !!import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  
  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      setOauthLoading(true);
      setError("");
      const res = await authAPI.googleLogin(credentialResponse.credential); // ✅ FIXED: Pass credential directly
      if (!res?.token || !res?.user) throw new Error("Invalid response from server");
      login(res.token, res.user);
      onSuccess?.(res.user);
    } catch (err) {
      console.error("[AuthModal] Google login error:", err.message);
      setError(err.message || "Google login failed. Please try again.");
    } finally {
      setOauthLoading(false);
    }
  };

  // ── APPLE SIGN-IN HANDLER ──
  const hasAppleClientId = !!import.meta.env.VITE_APPLE_CLIENT_ID;
  
  const handleAppleSuccess = async (credentialResponse) => {
    try {
      setOauthLoading(true);
      setError("");
      const res = await authAPI.appleLogin({ token: credentialResponse.credential });
      if (!res?.token || !res?.user) throw new Error("Invalid response from server");
      login(res.token, res.user);
      onSuccess?.(res.user);
    } catch (err) {
      console.error("[AuthModal] Apple login error:", err.message);
      setError(err.message || "Apple login failed. Please try again.");
    } finally {
      setOauthLoading(false);
    }
  };

  const handleAppleLogin = () => {
    if (!hasAppleClientId) {
      setError("Apple Sign-In is not configured.");
      return;
    }
    if (window.AppleID) {
      window.AppleID.auth.init({
        clientId: import.meta.env.VITE_APPLE_CLIENT_ID || "",
        teamId: import.meta.env.VITE_APPLE_TEAM_ID || "",
        keyId: import.meta.env.VITE_APPLE_KEY_ID || "",
        redirectURI: window.location.origin,
        usePopup: true,
      });
      window.AppleID.auth.signIn().then(handleAppleSuccess).catch((err) => {
        console.error("Apple login error:", err);
        setError("Apple login failed. Please try again.");
      });
    } else {
      setError("Apple Sign-In is not available on this device.");
    }
  };

  // ── FORM HANDLERS ──
  async function handleLogin(e) {
    e.preventDefault();
    if (loading) return;
    setError(""); setLoading(true);
    try {
      const res = await authAPI.login(email.trim(), password);
      if (!res?.token || !res?.user) throw new Error("Invalid response from server");
      login(res.token, res.user);
      onSuccess?.(res.user);
    } catch (err) {
      console.error("[AuthModal] login error:", err.message);
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    if (loading) return;
    setError("");
    if (password !== confirm)  { setError("Passwords do not match"); return; }
    if (password.length < 6)   { setError("Password must be at least 6 characters"); return; }
    if (asVendor && !storeName.trim()) { setError("Store name is required"); return; }
    
    if (asVendor) {
      if (!phoneNumber.trim()) { setError("Phone number is required for vendors"); return; }
      if (!idType) { setError("ID type is required for vendors"); return; }
      if (!idFrontImage) { setError("ID front image is required for vendors"); return; }
      if (!idBackImage) { setError("ID back image is required for vendors"); return; }
    }
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("email", email.trim());
      formData.append("password", password);
      
      if (asVendor) {
        formData.append("isVendor", "true");
        formData.append("storeName", storeName.trim());
        formData.append("storeDescription", storeDescription.trim());
        formData.append("phoneNumber", phoneNumber.trim());
        formData.append("idType", idType);
        formData.append("idFrontImage", idFrontImage);
        formData.append("idBackImage", idBackImage);
      }
      
      const res = await authAPI.register(formData);
      if (!res?.token || !res?.user) throw new Error("Invalid response from server");
      login(res.token, res.user);
      onSuccess?.(res.user);
    } catch (err) {
      console.error("[AuthModal] register error:", err.message);
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }
  
  function handleImageChange(e, setImage, setPreview) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be smaller than 2MB");
      return;
    }
    
    setImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);
  }

  async function handleForgot(e) {
    e.preventDefault();
    if (loading) return;
    setError(""); setLoading(true);
    try {
      await authAPI.forgotPassword(email.trim());
      setSuccess("Check your email (or server console in dev) for the reset link.");
    } catch (err) {
      console.error("[AuthModal] forgot error:", err.message);
      setError(err.message || "Failed to send reset link. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function sw(v) { 
    if (!loading) { 
      setView(v); 
      setError(""); 
      setSuccess(""); 
      if (v !== "register") {
        setPhoneNumber(""); setIdType("national_id"); setIdFrontImage(null); setIdBackImage(null);
        setIdFrontPreview(""); setIdBackPreview("");
      }
    } 
  }

  // ── RENDER: Only check isOpen in JSX, NOT before hooks ──
  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={() => !loading && onClose?.()}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.logo}>🛍️ SiiShop</div>
          <button className={styles.closeBtn} onClick={() => !loading && onClose?.()} disabled={loading}>✕</button>
        </div>

        {view !== "forgot" && (
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${view==="login"    ? styles.tabActive : ""}`} onClick={() => sw("login")}>Sign In</button>
            <button className={`${styles.tab} ${view==="register" ? styles.tabActive : ""}`} onClick={() => sw("register")}>Create Account</button>
          </div>
        )}

        {error   && <div className={styles.errorBanner} role="alert">{error}</div>}
        {success && <div className={styles.successBanner}>{success}</div>}

        {/* ── LOGIN ── */}
        {view === "login" && (
          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.field}><label>Email</label>
              <input type="email" placeholder="you@example.com" value={email}
                onChange={e => setEmail(e.target.value)} required disabled={loading} autoComplete="email" />
            </div>
            <div className={styles.field}><label>Password</label>
              <input type="password" placeholder="••••••••" value={password}
                onChange={e => setPassword(e.target.value)} required disabled={loading} autoComplete="current-password" />
            </div>
            <button className={`btn btn-primary ${styles.submitBtn}`} disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
            <button type="button" className={styles.textLink} onClick={() => sw("forgot")} disabled={loading}>
              Forgot password?
            </button>
            <div className={styles.divider}><span>or</span></div>
            <div className={styles.googleBtn}>
              {hasGoogleClientId ? (
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setError("Google login failed. Please try again.")}
                  useOneTap={false}
                  theme="outline"
                  size="large"
                  text="continue_with"
                  width={320}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setError("Google Sign-In not configured. Please contact support.")}
                  disabled={oauthLoading}
                >
                  Google Sign-In not configured
                </button>
              )}
            </div>
            {hasAppleClientId && (
              <button type="button" className={styles.appleBtn} onClick={handleAppleLogin} disabled={oauthLoading}>
                {oauthLoading ? "Signing in..." : "🍎 Continue with Apple"}
              </button>
            )}
          </form>
        )}

        {/* ── REGISTER ── */}
        {view === "register" && (
          <form onSubmit={handleRegister} className={styles.form}>
            <div className={styles.field}><label>Full Name</label>
              <input type="text" placeholder="Jane Doe" value={name}
                onChange={e => setName(e.target.value)} required disabled={loading} autoComplete="name" />
            </div>
            <div className={styles.field}><label>Email</label>
              <input type="email" placeholder="you@example.com" value={email}
                onChange={e => setEmail(e.target.value)} required disabled={loading} autoComplete="email" />
            </div>
            <div className={styles.field}><label>Password</label>
              <input type="password" placeholder="Min. 6 characters" value={password}
                onChange={e => setPassword(e.target.value)} required disabled={loading} autoComplete="new-password" />
            </div>
            <div className={styles.field}><label>Confirm Password</label>
              <input type="password" placeholder="Re-enter password" value={confirm}
                onChange={e => setConfirm(e.target.value)} required disabled={loading} autoComplete="new-password" />
            </div>

            <label className={styles.vendorToggle}>
              <input type="checkbox" checked={asVendor} onChange={e => setAsVendor(e.target.checked)} disabled={loading} />
              <span>Register as a Vendor (sell on SiiShop)</span>
            </label>

            {asVendor && (
              <div className={styles.vendorFields}>
                <div className={styles.field}><label>Store Name *</label>
                  <input type="text" placeholder="e.g. Jane's Electronics" value={storeName}
                    onChange={e => setStoreName(e.target.value)} required disabled={loading} />
                </div>
                <div className={styles.field}><label>Store Description</label>
                  <textarea rows={2} placeholder="What do you sell?" value={storeDescription}
                    onChange={e => setStoreDescription(e.target.value)} disabled={loading} />
                </div>
                
                <div className={styles.kycSection}>
                  <h4 className={styles.kycTitle}>📄 Verification Documents (Required)</h4>
                  
                  <div className={styles.field}><label>Phone Number *</label>
                    <input type="tel" placeholder="+233 XX XXX XXXX" value={phoneNumber}
                      onChange={e => setPhoneNumber(e.target.value)} required disabled={loading} />
                  </div>
                  
                  <div className={styles.field}><label>ID Type *</label>
                    <select value={idType} onChange={e => setIdType(e.target.value)} required disabled={loading}>
                      <option value="national_id">National ID</option>
                      <option value="passport">Passport</option>
                      <option value="driver_license">Driver's License</option>
                    </select>
                  </div>
                  
                  <div className={styles.field}><label>ID Front Image * (JPG/PNG, max 2MB)</label>
                    <input type="file" accept="image/jpeg,image/png,image/jpg" 
                      onChange={e => handleImageChange(e, setIdFrontImage, setIdFrontPreview)} 
                      required disabled={loading} />
                    {idFrontPreview && <img src={idFrontPreview} alt="ID Front" className={styles.imagePreview} />}
                  </div>
                  
                  <div className={styles.field}><label>ID Back Image * (JPG/PNG, max 2MB)</label>
                    <input type="file" accept="image/jpeg,image/png,image/jpg" 
                      onChange={e => handleImageChange(e, setIdBackImage, setIdBackPreview)} 
                      required disabled={loading} />
                    {idBackPreview && <img src={idBackPreview} alt="ID Back" className={styles.imagePreview} />}
                  </div>
                </div>
                
                <p className={styles.vendorNote}>⛳ Your vendor account will be reviewed by an admin before you can list products.</p>
              </div>
            )}

            <button className={`btn btn-primary ${styles.submitBtn}`} disabled={loading}>
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>
        )}

        {/* ── FORGOT ── */}
        {view === "forgot" && (
          <form onSubmit={handleForgot} className={styles.form}>
            <p className={styles.forgotHint}>Enter your email and we'll send you a reset link.</p>
            <div className={styles.field}><label>Email</label>
              <input type="email" placeholder="you@example.com" value={email}
                onChange={e => setEmail(e.target.value)} required disabled={loading} autoComplete="email" />
            </div>
            <button className={`btn btn-primary ${styles.submitBtn}`} disabled={loading || !!success}>
              {loading ? "Sending…" : "Send Reset Link"}
            </button>
            <button type="button" className={styles.textLink} onClick={() => sw("login")} disabled={loading}>
              ← Back to Sign In
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
