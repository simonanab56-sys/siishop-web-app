// components/chat/TypingIndicator.jsx - Typing animation
import styles from "./Chat.module.css";

export default function TypingIndicator({ userName }) {
  return (
    <div className={styles.typingIndicator}>
      <div className={styles.typingDots}>
        <span></span>
        <span></span>
        <span></span>
      </div>
      {userName && (
        <span className={styles.typingText}>{userName} is typing...</span>
      )}
    </div>
  );
}