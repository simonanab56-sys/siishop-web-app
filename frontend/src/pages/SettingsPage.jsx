// pages/SettingsPage.jsx — v3: currency display, responsive, phone in vendor profile
import { useState } from "react";
import { authAPI }      from "../services/api";
import { useAuth }      from "../context/AuthContext";
import { useCurrency }  from "../context/CurrencyContext";
import ImageUpload      from "../components/ImageUpload";
import styles           from "./SettingsPage.module.css";

function getInitials(name) {
  const s = String(name||"U").trim();
  if (!s) return "U";
  return s.split(/\s+/).map(w=>w[0]||"").join("").slice(0,2).toUpperCase()||"U";
}

export default function SettingsPage({ addToast }) {
  const { user, login, isVendor }    = useAuth();
  const { currency, setCurrency, currencies } = useCurrency();
  const [tab, setTab]                = useState("profile");

  // Profile
  const [name,          setName]          = useState(user?.name  || "");
  const [email,         setEmail]         = useState(user?.email || "");
  const [profileSaving, setProfileSaving] = useState(false);

  // Password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving,  setPwSaving]  = useState(false);

  // Vendor store
  const [storeName,        setStoreName]        = useState(user?.storeName        || "");
  const [storeDescription, setStoreDescription] = useState(user?.storeDescription || "");
  const [storeLogo,        setStoreLogo]        = useState(user?.storeLogo        || "");
  const [storeSaving,      setStoreSaving]      = useState(false);

  async function handleProfileSave(e) {
    e.preventDefault();
    if (profileSaving) return;
    setProfileSaving(true);
    try {
      const res = await authAPI.updateMe({ name: name.trim(), email: email.trim() });
      if (res?.token && res?.user) login(res.token, res.user);
      addToast?.("Profile updated!", "success");
    } catch (err) { addToast?.(err.message || "Failed to update profile", "error"); }
    finally { setProfileSaving(false); }
  }

  async function handlePasswordSave(e) {
    e.preventDefault();
    if (pwSaving) return;
    if (newPw !== confirmPw) { addToast?.("Passwords do not match", "error"); return; }
    if (newPw.length < 6)    { addToast?.("Password must be at least 6 characters", "error"); return; }
    if (!currentPw)          { addToast?.("Current password is required", "error"); return; }
    setPwSaving(true);
    try {
      await authAPI.changePassword({ currentPassword: currentPw, newPassword: newPw });
      addToast?.("Password changed!", "success");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err) { addToast?.(err.message || "Failed to change password", "error"); }
    finally { setPwSaving(false); }
  }

  async function handleStoreSave(e) {
    e.preventDefault();
    if (storeSaving) return;
    setStoreSaving(true);
    try {
      const res = await authAPI.updateMe({
        storeName:        storeName.trim(),
        storeDescription: storeDescription.trim(),
        storeLogo:        storeLogo || "",
      });
      if (res?.token && res?.user) login(res.token, res.user);
      addToast?.("Store profile updated!", "success");
    } catch (err) { addToast?.(err.message || "Failed to update store", "error"); }
    finally { setStoreSaving(false); }
  }

  const initials = getInitials(user?.name);

  const TABS = [
    ["profile",  "👤 Profile"],
    ["password", "🔒 Password"],
    ["currency", "💱 Currency"],
    ...(isVendor ? [["store","🏪 Store"]] : []),
  ];

  return (
    <div className={`container page-enter ${styles.page}`}>
      <h1 className={styles.title}>Account Settings</h1>

      <div className={styles.tabs}>
        {TABS.map(([key,label]) => (
          <button key={key}
            className={`${styles.tab} ${tab===key?styles.tabActive:""}`}
            onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      <div className={styles.card}>

        {/* ── Profile ── */}
        {tab === "profile" && (
          <>
            <div className={styles.avatarSection}>
              <div className={styles.bigAvatar}>{initials}</div>
              <div>
                <p className={styles.avatarName}>{user?.name || "—"}</p>
                <p className={styles.avatarEmail}>{user?.email || "—"}</p>
                {user?.isAdmin  && <span className="role-badge role-admin"  style={{marginTop:4}}>Admin</span>}
                {user?.isVendor && <span className="role-badge role-vendor" style={{marginTop:4}}>
                  {user?.vendorStatus==="approved"?"Vendor ✓":`Vendor (${user?.vendorStatus||"pending"})`}
                </span>}
              </div>
            </div>
            <div className={styles.divider} />
            <form onSubmit={handleProfileSave} className={styles.form}>
              <div className={styles.field}>
                <label>Full Name</label>
                <input type="text" value={name} onChange={e=>setName(e.target.value)} disabled={profileSaving}/>
              </div>
              <div className={styles.field}>
                <label>Email</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} disabled={profileSaving}/>
              </div>
              <button className="btn btn-primary" disabled={profileSaving}>
                {profileSaving ? "Saving…" : "Save Changes"}
              </button>
            </form>
          </>
        )}

        {/* ── Password ── */}
        {tab === "password" && (
          <form onSubmit={handlePasswordSave} className={styles.form}>
            <div className={styles.field}>
              <label>Current Password</label>
              <input type="password" placeholder="Your current password" value={currentPw}
                onChange={e=>setCurrentPw(e.target.value)} required disabled={pwSaving} autoComplete="current-password"/>
            </div>
            <div className={styles.field}>
              <label>New Password</label>
              <input type="password" placeholder="Min. 6 characters" value={newPw}
                onChange={e=>setNewPw(e.target.value)} required disabled={pwSaving} autoComplete="new-password"/>
            </div>
            <div className={styles.field}>
              <label>Confirm New Password</label>
              <input type="password" placeholder="Re-enter new password" value={confirmPw}
                onChange={e=>setConfirmPw(e.target.value)} required disabled={pwSaving} autoComplete="new-password"/>
            </div>
            <button className="btn btn-primary" disabled={pwSaving}>
              {pwSaving ? "Changing…" : "Change Password"}
            </button>
          </form>
        )}

        {/* ── Currency ── */}
        {tab === "currency" && (
          <div className={styles.currencyTab}>
            <p className={styles.currencyDesc}>
              Choose how prices are displayed across the app. All prices are stored in GHS — other currencies use indicative exchange rates.
            </p>
            <div className={styles.currencyOptions}>
              {Object.values(currencies).map(c => (
                <button key={c.code}
                  className={`${styles.currencyOption} ${currency===c.code?styles.currencyOptionActive:""}`}
                  onClick={() => setCurrency(c.code)}>
                  <span className={styles.currencySymbol}>{c.symbol}</span>
                  <div className={styles.currencyInfo}>
                    <span className={styles.currencyCode}>{c.code}</span>
                    <span className={styles.currencyName}>{c.name}</span>
                  </div>
                  {currency===c.code && <span className={styles.currencyCheck}>✓</span>}
                </button>
              ))}
            </div>
            <p className={styles.currencyNote}>
              ℹ️ Rates are indicative and may not reflect real-time market rates.
            </p>
          </div>
        )}

        {/* ── Store (vendors only) ── */}
        {tab === "store" && isVendor && (
          <form onSubmit={handleStoreSave} className={styles.form}>
            <p className={styles.storeNote}>
              Status: <strong>{user?.vendorStatus||"unknown"}</strong>
              {user?.vendorStatus==="pending" && " — An admin will review your account soon."}
            </p>
            <div className={styles.field}>
              <label>Store Name</label>
              <input type="text" value={storeName} onChange={e=>setStoreName(e.target.value)} disabled={storeSaving}/>
            </div>
            <div className={styles.field}>
              <label>Store Description</label>
              <textarea rows={3} value={storeDescription} onChange={e=>setStoreDescription(e.target.value)}
                disabled={storeSaving} style={{resize:"vertical"}}/>
            </div>
            <div className={styles.field}>
              <label>Store Logo</label>
              <ImageUpload value={storeLogo||""} onChange={val=>setStoreLogo(val||"")}/>
            </div>
            <button className="btn btn-primary" disabled={storeSaving}>
              {storeSaving ? "Saving…" : "Update Store"}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
