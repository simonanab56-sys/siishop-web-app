import React from "react";
import ReactDOM from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App.jsx";
import "./styles/global.css";

// Read Google Client ID from environment
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const isGoogleConfigured = googleClientId.trim().length > 0;

function RootApp() {
  // Only render GoogleOAuthProvider when properly configured
  if (!isGoogleConfigured) {
    return (
      <HelmetProvider>
        <App />
      </HelmetProvider>
    );
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId.trim()}>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </GoogleOAuthProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
 // <React.StrictMode>
    <RootApp />
 // </React.StrictMode>
);
