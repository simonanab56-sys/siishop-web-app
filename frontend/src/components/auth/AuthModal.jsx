// components/auth/AuthModal.jsx — FIXED HOOKS ORDER
// Fix: Removed early return that violated React hooks rules
// Fix: All hooks now called at top level BEFORE any conditional logic
import { useState, useEffect } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { authAPI } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { regions, getCitiesByRegion } from "../../config/ghanaLocations";
import { cuisineTypes } from "../../config/cuisineTypes";
import logger from "../../utils/logger";
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
  const [vendorType, setVendorType] = useState("marketplace"); // marketplace or restaurant
  const [storeName,        setStoreName]        = useState("");
  const [storeDescription, setStoreDescription] = useState("");

  // ✅ NEW: Restaurant-specific fields
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantDescription, setRestaurantDescription] = useState("");
  const [cuisineType, setCuisineType] = useState("");
  const [address, setAddress] = useState("");
  const [deliveryRadius, setDeliveryRadius] = useState(5);
  const [openingHours, setOpeningHours] = useState("08:00");
  const [closingHours, setClosingHours] = useState("22:00");

  const [phoneNumber,      setPhoneNumber]      = useState("");
  const [idType,           setIdType]           = useState("national_id");
  const [idFrontImage,     setIdFrontImage]     = useState(null);
  const [idBackImage,      setIdBackImage]      = useState(null);
  const [idFrontPreview,   setIdFrontPreview]   = useState("");
  const [idBackPreview,    setIdBackPreview]    = useState("");
  const [oauthLoading,     setOauthLoading]     = useState(false);

  // ── LOCATION FIELDS FOR VENDORS ──
  const [country, setCountry] = useState("Ghana");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [availableCities, setAvailableCities] = useState([]);
  const [customRegion, setCustomRegion] = useState("");
  const [customCity, setCustomCity] = useState("");
  const [useCustomRegion, setUseCustomRegion] = useState(false);
  const [useCustomCity, setUseCustomCity] = useState(false);

  // ── EFFECTS AT TOP LEVEL ──
  useEffect(() => {
    setView(initialView);
    setError(""); setSuccess("");
    setName(""); setEmail(""); setPassword(""); setConfirm("");
    setAsVendor(false); setStoreName(""); setStoreDescription("");
    setVendorType("marketplace");
    setPhoneNumber(""); setIdType("national_id"); setIdFrontImage(null); setIdBackImage(null);
    setIdFrontPreview(""); setIdBackPreview("");
    setLoading(false); setOauthLoading(false);
    // Reset location fields
    setCountry("Ghana"); setRegion(""); setCity(""); setAvailableCities([]);
    setCustomRegion(""); setCustomCity(""); setUseCustomRegion(false); setUseCustomCity(false);
    // ✅ Reset restaurant fields
    setRestaurantName(""); setRestaurantDescription(""); setCuisineType("");
    setAddress(""); setDeliveryRadius(5); setOpeningHours("08:00"); setClosingHours("22:00");
  }, [isOpen, initialView]);

  // ── UPDATE AVAILABLE CITIES WHEN REGION CHANGES ──
  useEffect(() => {
    if (region && !useCustomRegion) {
      setAvailableCities(getCitiesByRegion(region));
      setCity("");
      setUseCustomCity(false);
    } else if (!region) {
      setAvailableCities([]);
      setCity("");
    }
  }, [region, useCustomRegion]);

  // Handle region change - switch between dropdown and custom
  const handleRegionChange = (value) => {
    if (value === "other") {
      setUseCustomRegion(true);
      setRegion("");
      setAvailableCities([]);
    } else {
      setUseCustomRegion(false);
      setRegion(value);
      setCustomRegion("");
    }
    setUseCustomCity(false);
    setCity("");
    setCustomCity("");
  };

  // Handle city change - switch between dropdown and custom
  const handleCityChange = (value) => {
    if (value === "other") {
      setUseCustomCity(true);
      setCity("");
    } else {
      setUseCustomCity(false);
      setCity(value);
      setCustomCity("");
    }
  };

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
      // ✅ Dev-only — these dump the full user object (PII) to the
      // console. In production they short-circuit to `false && ...`
      // and Vite strips them from the bundle entirely. Real
      // "signed in" feedback for the user is shown via the `success`
      // toast + AuthContext login.
      logger.log("[AuthModal] ============ FRONTEND DEBUG ============");
      logger.log("[AuthModal] Full response keys:", Object.keys(res));
      logger.log("[AuthModal] Full user keys:", res.user ? Object.keys(res.user) : "NO USER");
      logger.log("[AuthModal] Full user object:", JSON.stringify(res.user, null, 2));
      logger.log("[AuthModal] vendorType from response:", res.user?.vendorType);
      logger.log("[AuthModal] restaurantDetails from response:", res.user?.restaurantDetails);
      logger.log("[AuthModal] vendorStatus from response:", res.user?.vendorStatus);
      logger.log("[AuthModal] ===========================================");
      if (!res?.token || !res?.user) throw new Error("Invalid response from server");
      login(res.token, res.user);
      onSuccess?.(res.user);
    } catch (err) {
      // ✅ Genuine error — keep in production. Visible to Sentry-style
      // error reporters and to the support team.
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
    // Only require storeName for marketplace vendors (restaurants use restaurantName)
    if (asVendor && vendorType !== "restaurant" && !storeName.trim()) { setError("Store name is required"); return; }

    if (asVendor) {
      if (!phoneNumber.trim()) { setError("Phone number is required for vendors"); return; }
      if (!idType) { setError("ID type is required for vendors"); return; }
      if (!idFrontImage) { setError("ID front image is required for vendors"); return; }
      if (!idBackImage) { setError("ID back image is required for vendors"); return; }

      // Validate location fields (either dropdown or custom input)
      const finalRegion = useCustomRegion ? customRegion.trim() : region;
      const finalCity = useCustomCity ? customCity.trim() : city;

      if (!finalRegion) { setError("Region is required for vendors"); return; }
      if (!finalCity) { setError("City is required for vendors"); return; }

      // ✅ NEW: Validate restaurant-specific fields
      if (vendorType === "restaurant") {
        if (!restaurantName.trim() && !storeName.trim()) { setError("Restaurant name is required"); return; }
        if (!cuisineType) { setError("Cuisine type is required for restaurants"); return; }
        if (!address.trim()) { setError("Restaurant address is required"); return; }
      }
    }
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("email", email.trim());
      formData.append("password", password);
      
      if (asVendor) {
        formData.append("isVendor", "true");
        formData.append("vendorType", vendorType); // ✅ NEW: marketplace or restaurant
        // For restaurants, use restaurantName as storeName; for marketplace, use storeName
        const finalStoreName = vendorType === "restaurant"
          ? (restaurantName.trim() || storeName.trim())
          : storeName.trim();
        formData.append("storeName", finalStoreName);
        formData.append("storeDescription", vendorType === "restaurant"
          ? (restaurantDescription.trim() || storeDescription.trim())
          : storeDescription.trim());
        formData.append("phoneNumber", phoneNumber.trim());
        formData.append("idType", idType);
        formData.append("idFrontImage", idFrontImage);
        formData.append("idBackImage", idBackImage);
        // Location fields (Ghana-focused) - use dropdown or custom input
        const finalRegion = useCustomRegion ? customRegion.trim() : region;
        const finalCity = useCustomCity ? customCity.trim() : city;
        formData.append("country", country);
        formData.append("region", finalRegion);
        formData.append("city", finalCity);

        // ✅ NEW: Restaurant-specific fields
        if (vendorType === "restaurant") {
          formData.append("restaurantName", restaurantName.trim() || storeName.trim());
          formData.append("restaurantDescription", restaurantDescription.trim() || storeDescription.trim());
          formData.append("cuisineType", cuisineType);
          formData.append("address", address.trim());
          formData.append("deliveryRadius", deliveryRadius);
          formData.append("openingHours", openingHours);
          formData.append("closingHours", closingHours);
        }
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
        // Reset location fields
        setRegion(""); setCity(""); setAvailableCities([]);
        setCustomRegion(""); setCustomCity(""); setUseCustomRegion(false); setUseCustomCity(false);
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

            {/* ✅ NEW: Vendor Type Selection */}
            {asVendor && (
              <div className={styles.vendorFields}>
                <div className={styles.kycSection}>
                  <h4 className={styles.kycTitle}>Choose Business Type</h4>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="vendorType"
                      value="marketplace"
                      checked={vendorType === "marketplace"}
                      onChange={e => setVendorType(e.target.value)}
                      disabled={loading}
                    />
                    <span>🛒 <strong>Marketplace Vendor</strong> <small>(Electronics, Fashion, etc.)</small></span>
                  </label>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="vendorType"
                      value="restaurant"
                      checked={vendorType === "restaurant"}
                      onChange={e => setVendorType(e.target.value)}
                      disabled={loading}
                    />
                    <span>🍔 <strong>Restaurant / Food Vendor</strong> <small>(Food delivery, meals, etc.)</small></span>
                  </label>
                </div>

                {/* ✅ Restaurant-specific fields */}
                {vendorType === "restaurant" ? (
                  <div className={styles.kycSection}>
                    <h4 className={styles.kycTitle}>🍽️ Restaurant Details</h4>
                    <div className={styles.field}><label>Restaurant Name *</label>
                      <input type="text" placeholder="e.g. Mama's Kitchen" value={restaurantName}
                        onChange={e => setRestaurantName(e.target.value)} required disabled={loading} />
                    </div>
                    <div className={styles.field}><label>Restaurant Description</label>
                      <textarea rows={2} placeholder="Describe your restaurant and cuisine..." value={restaurantDescription}
                        onChange={e => setRestaurantDescription(e.target.value)} disabled={loading} />
                    </div>
                    <div className={styles.field}><label>Cuisine Type *</label>
                      <select value={cuisineType} onChange={e => setCuisineType(e.target.value)} required disabled={loading}>
                        <option value="">Select Cuisine Type</option>
                        {cuisineTypes.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.field}><label>Address *</label>
                      <input type="text" placeholder="Restaurant address" value={address}
                        onChange={e => setAddress(e.target.value)} required disabled={loading} />
                    </div>
                    <div className={styles.field}><label>Delivery Radius (km)</label>
                      <input type="number" min="1" max="50" value={deliveryRadius}
                        onChange={e => setDeliveryRadius(e.target.value)} disabled={loading} />
                    </div>
                    <div className={styles.field}><label>Opening Hours</label>
                      <input type="time" value={openingHours}
                        onChange={e => setOpeningHours(e.target.value)} disabled={loading} />
                    </div>
                    <div className={styles.field}><label>Closing Hours</label>
                      <input type="time" value={closingHours}
                        onChange={e => setClosingHours(e.target.value)} disabled={loading} />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.field}><label>Store Name *</label>
                      <input type="text" placeholder="e.g. Jane's Electronics" value={storeName}
                        onChange={e => setStoreName(e.target.value)} required disabled={loading} />
                    </div>
                    <div className={styles.field}><label>Store Description</label>
                      <textarea rows={2} placeholder="What do you sell?" value={storeDescription}
                        onChange={e => setStoreDescription(e.target.value)} disabled={loading} />
                    </div>
                  </>
                )}

                <div className={styles.kycSection}>
                  <h4 className={styles.kycTitle}>📍 Store Location (Required)</h4>

                  <div className={styles.field}><label>Country *</label>
                    <select value={country} onChange={e => setCountry(e.target.value)} required disabled={loading}>
                      <option value="Ghana">Ghana</option>
                    </select>
                  </div>

                  <div className={styles.field}><label>Region *</label>
                    {useCustomRegion ? (
                      <input
                        type="text"
                        placeholder="Enter your region"
                        value={customRegion}
                        onChange={e => setCustomRegion(e.target.value)}
                        required
                        disabled={loading}
                      />
                    ) : (
                      <select value={region} onChange={e => handleRegionChange(e.target.value)} required disabled={loading}>
                        <option value="">Select Region</option>
                        {regions.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                        <option value="other">Other (type manually)</option>
                      </select>
                    )}
                  </div>

                  <div className={styles.field}><label>City/Town *</label>
                    {useCustomCity ? (
                      <input
                        type="text"
                        placeholder="Enter your city/town"
                        value={customCity}
                        onChange={e => setCustomCity(e.target.value)}
                        required
                        disabled={loading}
                      />
                    ) : (
                      <select value={city} onChange={e => handleCityChange(e.target.value)} required disabled={loading || (!region && !useCustomRegion)}>
                        <option value="">{(region || useCustomRegion) ? "Select City" : "Select Region first"}</option>
                        {availableCities.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                        <option value="other">Other (type manually)</option>
                      </select>
                    )}
                  </div>
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
                
                <p className={styles.vendorNote}>⛳ Your vendor account will be reviewed by  siishop before you can list products.</p>
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
