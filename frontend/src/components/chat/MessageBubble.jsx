// components/chat/MessageBubble.jsx - Chat message bubble
import styles from "./Chat.module.css";

export default function MessageBubble({ message, isOwn, sender }) {
  const { text, messageType, image, file, readStatus, createdAt } = message;

  const formatTime = (date) => {
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const isRead = readStatus?.length > 1;

  const renderContent = () => {
    if (messageType === "image" && image?.url) {
      return (
        <div className={styles.imageMessage}>
          <img src={image.url} alt="Shared" loading="lazy" />
        </div>
      );
    }

    if (messageType === "file" && file?.url) {
      return (
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.fileMessage}
        >
          <span className={styles.fileIcon}>📎</span>
          <div className={styles.fileInfo}>
            <span className={styles.fileName}>{file.fileName}</span>
            <span className={styles.fileSize}>
              {Math.round(file.fileSize / 1024)} KB
            </span>
          </div>
        </a>
      );
    }

    return <p className={styles.messageText}>{text}</p>;
  };

  return (
    <div className={`${styles.messageBubble} ${isOwn ? styles.own : styles.other}`}>
      {!isOwn && (
        <div className={styles.senderInfo}>
          <span className={styles.senderName}>
            {sender?.name || sender?.storeName || "Unknown"}
          </span>
        </div>
      )}

      <div className={styles.bubbleContent}>
        {renderContent()}
      </div>

      <div className={styles.messageMeta}>
        <span className={styles.timestamp}>{formatTime(createdAt)}</span>
        {isOwn && (
          <span className={`${styles.readStatus} ${isRead ? styles.read : ""}`}>
            {isRead ? "✓✓" : "✓"}
          </span>
        )}
      </div>
    </div>
  );
}