// components/Toast.jsx
// Lightweight toast notification system.
// Usage: import { useToast, ToastContainer } from "./Toast"
//   const { toasts, addToast } = useToast();
//   addToast("Saved!", "success");
//   <ToastContainer toasts={toasts} />

import { useState, useCallback } from "react";

let _id = 0;

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "info", duration = 3000) => {
    const id = ++_id;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return { toasts, addToast };
}

const ICONS = { success: "✓", error: "✕", info: "ℹ" };

export function ToastContainer({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span style={{ marginRight: 8 }}>{ICONS[t.type]}</span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
