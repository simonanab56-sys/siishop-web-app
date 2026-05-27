// components/chat/ConversationList.jsx - List of conversations
import styles from "./Chat.module.css";

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  loading,
}) {
  const formatTime = (date) => {
    if (!date) return "";
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (days === 1) {
      return "Yesterday";
    } else if (days < 7) {
      return d.toLocaleDateString([], { weekday: "short" });
    } else {
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  const getConversationTitle = (conv) => {
    if (conv.otherParticipant) {
      return conv.otherParticipant.storeName || conv.otherParticipant.name;
    }
    if (conv.conversationType === "order" && conv.orderId) {
      return `Order #${conv.orderId.orderNumber?.slice(-4)}`;
    }
    return "Chat";
  };

  const getConversationSubtitle = (conv) => {
    if (conv.lastMessage?.text) {
      return conv.lastMessage.text;
    }
    if (conv.conversationType === "order") {
      return "Order discussion";
    }
    if (conv.conversationType === "product") {
      return "Product inquiry";
    }
    return "Start a conversation";
  };

  const getAvatar = (conv) => {
    if (conv.otherParticipant?.avatar) {
      return conv.otherParticipant.avatar;
    }
    if (conv.otherParticipantRole === "vendor") {
      return "🏪";
    }
    if (conv.otherParticipantRole === "admin") {
      return "⚙️";
    }
    if (conv.otherParticipantRole === "rider") {
      return "🏃";
    }
    return "👤";
  };

  if (loading) {
    return (
      <div className={styles.conversationList}>
        <div className={styles.listLoading}>
          <div className="spinner" />
          <p>Loading conversations...</p>
        </div>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className={styles.conversationList}>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>💬</span>
          <p>No conversations yet</p>
          <small>Start a chat from an order or product page</small>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.conversationList}>
      {conversations.map((conv) => (
        <div
          key={conv._id}
          className={`${styles.conversationItem} ${
            selectedId === conv._id ? styles.selected : ""
          }`}
          onClick={() => onSelect(conv._id)}
        >
          <div className={styles.avatarContainer}>
            <div className={styles.avatar}>{getAvatar(conv)}</div>
            {conv.otherParticipant?.isOnline && (
              <span className={styles.onlineBadge}></span>
            )}
          </div>

          <div className={styles.conversationContent}>
            <div className={styles.conversationHeader}>
              <span className={styles.conversationTitle}>
                {getConversationTitle(conv)}
              </span>
              <span className={styles.conversationTime}>
                {formatTime(conv.updatedAt)}
              </span>
            </div>

            <div className={styles.conversationPreview}>
              <p className={styles.previewText}>
                {getConversationSubtitle(conv)}
              </p>
              {conv.unreadCount > 0 && (
                <span className={styles.unreadBadge}>{conv.unreadCount}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}