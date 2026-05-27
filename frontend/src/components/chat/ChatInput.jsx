// components/chat/ChatInput.jsx - Chat input with file upload
import { useState, useRef, useCallback } from "react";
import styles from "./Chat.module.css";

export default function ChatInput({
  onSend,
  onTyping,
  disabled,
  placeholder = "Type a message...",
}) {
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const handleTextChange = (e) => {
    setText(e.target.value);

    // Debounced typing indicator
    if (onTyping) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      onTyping(true);
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 1000);
    }
  };

  const handleSend = useCallback(() => {
    if (!text.trim() || disabled) return;

    onSend(text.trim());
    setText("");

    // Stop typing indicator
    if (onTyping) {
      onTyping(false);
    }
  }, [text, disabled, onSend, onTyping]);

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert("File size must be less than 10MB");
      return;
    }

    setUploading(true);
    try {
      // Emit file through parent handler
      if (onSend) {
        await onSend(null, file);
      }
    } catch (err) {
      console.error("[Chat] File upload error:", err);
      alert("Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleAttachmentClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={styles.inputContainer}>
      <button
        type="button"
        className={styles.attachmentBtn}
        onClick={handleAttachmentClick}
        disabled={disabled || uploading}
        title="Attach file"
      >
        📎
      </button>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*,.pdf,.doc,.docx"
        style={{ display: "none" }}
      />

      <div className={styles.inputWrapper}>
        <textarea
          value={text}
          onChange={handleTextChange}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={styles.textInput}
        />
      </div>

      <button
        type="button"
        className={styles.sendBtn}
        onClick={handleSend}
        disabled={disabled || !text.trim() || uploading}
      >
        {uploading ? "⏳" : "➤"}
      </button>
    </div>
  );
}