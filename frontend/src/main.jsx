import React from "react";
import ReactDOM from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App.jsx";
import "./styles/global.css";

// Read Google Client ID from environment and validate
const googleClientIdRaw = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const googleClientId = googleClientIdRaw.trim();
const isGoogleConfigured = googleClientId.length > 0;

// Error boundary for Google OAuth
class GoogleOAuthErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[GoogleOAuth] Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Fallback message when Google OAuth fails
function GoogleOAuthFallback() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      padding: "20px",
      textAlign: "center",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{ fontSize: "3rem", marginBottom: "16px" }}>🔐</div>
      <h2 style={{ marginBottom: "12px", color: "#1c1917" }}>Sign-In Temporarily Unavailable</h2>
      <p style={{ color: "#78716c", maxWidth: "420px", lineHeight: "1.6" }}>
        Google Sign-In is currently unavailable. Please sign in with your email and password instead.
      </p>
    </div>
  );
}

// Render the app with optional Google OAuth
function RootApp() {
  if (!isGoogleConfigured) {
    return (
      <HelmetProvider>
        <App />
      </HelmetProvider>
    );
  }

  return (
    <GoogleOAuthErrorBoundary fallback={<GoogleOAuthFallback />}>
      <GoogleOAuthProvider clientId={googleClientId}>
        <HelmetProvider>
          <App />
        </HelmetProvider>
      </GoogleOAuthProvider>
    </GoogleOAuthErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
);
