// context/AuthContext.jsx — FIXED: unified storage keys (token/user), no null bug
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { authAPI } from "../services/api";

const AuthContext = createContext(null);

function loadFromStorage() {
  try {
    const token = localStorage.getItem("token");
    const user  = JSON.parse(localStorage.getItem("user") || "null");
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

export function AuthProvider({ children }) {
  const saved = loadFromStorage();
  const [token, setToken] = useState(saved.token);
  const [user,  setUser]  = useState(saved.user);
  const [authChecked, setAuthChecked] = useState(false);

  // ── Auto-login on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (!saved.token) {
      setAuthChecked(true);
      return;
    }

    authAPI.getMe()
      .then((res) => {
        if (res?.user) {
          console.log("[AuthContext] getMe response:", res.user);
          console.log("[AuthContext] vendorType:", res.user.vendorType);
          console.log("[AuthContext] restaurantDetails:", res.user.restaurantDetails);

          // ✅ ALWAYS update user with FRESH data from server - this fixes stale cached data
          setUser(res.user);
          setToken(res.token || saved.token);

          // Persist fresh data to localStorage
          localStorage.setItem("user", JSON.stringify(res.user));
          if (res.token) localStorage.setItem("token", res.token);

          console.log("[AuthContext] ✅ Fresh user data saved to localStorage");
        }
      })
      .catch(() => {
        setToken(null);
        setUser(null);
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      })
      .finally(() => {
        setAuthChecked(true);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── LOGIN ───────────────────────────────────────────────────────────
  const login = useCallback((newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);

    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
  }, []);

  // ── REFRESH USER ────────────────────────────────────────────────────
  // Re-fetches the current user's profile from the server and updates
  // both React state and localStorage. Used after settings updates
  // (e.g. RestaurantSettingsPage) so the rest of the app sees the new
  // `restaurantDetails` / `location` / `storeName` / etc. without
  // requiring a full re-login.
  //
  // Returns the fresh user object on success, throws on failure
  // (caller can show an error toast).
  const refreshUser = useCallback(async () => {
    const res = await authAPI.getMe();
    if (res?.user) {
      setUser(res.user);
      localStorage.setItem("user", JSON.stringify(res.user));
      if (res.token) {
        setToken(res.token);
        localStorage.setItem("token", res.token);
      }
      return res.user;
    }
    return null;
  }, []);

  // ── LOGOUT ──────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);

    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("lastOrderId");
  }, []);

  // ── ROLE FLAGS ──────────────────────────────────────────────────────
  const isAdmin = user?.isAdmin === true;
  const isVendor = user?.isVendor === true;
  const isApprovedVendor = isVendor && user?.vendorStatus === "approved";
  const isLoggedIn = !!token && !!user;

  // ── LOGIN REDIRECT ──────────────────────────────────────────────────
  const getLoginRedirect = useCallback(() => {
    if (isAdmin) return "admin";
    if (isApprovedVendor) return "vendor";
    return "home";
  }, [isAdmin, isApprovedVendor]);

  const value = {
    user,
    token,
    login,
    logout,
    refreshUser,
    isLoggedIn,
    isAdmin,
    isVendor,
    isApprovedVendor,
    authChecked,
    getLoginRedirect,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}