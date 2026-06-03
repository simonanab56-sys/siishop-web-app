// pages/admin/AdminChatPage.jsx - Admin chat monitoring page
import { useState, useEffect, useCallback } from "react";
import { chatAPIAdmin } from "../../services/chatApi";
import styles from "./AdminChatPage.module.css";

export default function AdminChatPage({ onNavigate, addToast }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (search) params.search = search;
      if (filter) params.type = filter;

      const res = await chatAPIAdmin.getAllConversations(params);
      if (res.data.success) {
        setConversations(res.data.conversations || []);
      }
    } catch (err) {
      console.error("[AdminChat] Fetch conversations error:", err);
      addToast?.("Failed to load conversations", "error");
    } finally {
      setLoading(false);
    }
  }, [search, filter, addToast]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await chatAPIAdmin.getStats();
      if (res.data.success) {
        setStats(res.data.stats);
      }
    } catch (err) {
      console.error("[AdminChat] Fetch stats error:", err);
    }
  }, [addToast]);

  // Fetch on mount
  useEffect(() => {
    fetchConversations();
    fetchStats();
  }, [fetchConversations, fetchStats]);

  // Handle search
  const handleSearch = (e) => {
    e.preventDefault();
    fetchConversations();
  };

  // Select conversation
  const handleSelectConversation = async (conv) => {
    try {
      setLoadingMessages(true);
      setSelectedConversation(conv);

      const res = await chatAPIAdmin.getConversation(conv._id);
      if (res.data.success) {
        setMessages(res.data.messages || []);
      }
    } catch (err) {
      console.error("[AdminChat] Fetch messages error:", err);
      addToast?.("Failed to load messages", "error");
    } finally {
      setLoadingMessages(false);
    }
  };

  // Back to list
  const handleBackToList = () => {
    setSelectedConversation(null);
    setMessages([]);
  };

  // Get other participant info
  const getOtherParticipant = (conv) => {
    if (!conv.participants) return null;
    // Find participant that is not the current user (but we don't know who is current)
    // Show first participant as reference
    return conv.participants[0]?.userId;
  };

  // Format time
  const formatTime = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleString();
  };

  return (
    <div className={styles.adminChatPage}>
      <div className={styles.header}>
        <h1>💬 Chat Monitoring</h1>
        <button className="btn btn-outline" onClick={() => onNavigate?.("admin")}>
          ← Back to Dashboard
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.totalConversations}</div>
            <div className={styles.statLabel}>Total Conversations</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.totalMessages}</div>
            <div className={styles.statLabel}>Total Messages</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.messagesToday}</div>
            <div className={styles.statLabel}>Messages Today</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.activeUsers}</div>
            <div className={styles.statLabel}>Active Users (24h)</div>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className={styles.controls}>
        <form onSubmit={handleSearch} className={styles.searchForm}>
          <input
            type="text"
            placeholder="Search by name or store..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
          <button type="submit" className="btn btn-primary">Search</button>
        </form>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">All Types</option>
          <option value="direct">Direct</option>
          <option value="order">Order Chat</option>
          <option value="product">Product Chat</option>
        </select>
      </div>

      <div className={styles.content}>
        {/* Conversations List */}
        {!selectedConversation ? (
          <div className={styles.conversationsList}>
            <h2>All Conversations ({conversations.length})</h2>

            {loading ? (
              <div className={styles.loading}>
                <div className="spinner" />
                <p>Loading conversations...</p>
              </div>
            ) : conversations.length === 0 ? (
              <div className={styles.empty}>
                <p>No conversations found</p>
              </div>
            ) : (
              <div className={styles.conversationItems}>
                {conversations.map((conv) => {
                  const participant = getOtherParticipant(conv);
                  return (
                    <div
                      key={conv._id}
                      className={styles.conversationItem}
                      onClick={() => handleSelectConversation(conv)}
                    >
                      <div className={styles.convAvatar}>
                        {participant?.storeName?.[0] || participant?.name?.[0] || "?"}
                      </div>
                      <div className={styles.convInfo}>
                        <div className={styles.convTitle}>
                          {participant?.storeName || participant?.name || "Unknown User"}
                        </div>
                        <div className={styles.convMeta}>
                          <span className={styles.convType}>{conv.conversationType}</span>
                          {conv.orderId && (
                            <span className={styles.orderRef}>
                              Order: #{typeof conv.orderId === 'object' ? conv.orderId.orderNumber || conv.orderId._id : conv.orderId}
                            </span>
                          )}
                        </div>
                        <div className={styles.convTime}>
                          {formatTime(conv.updatedAt)}
                        </div>
                      </div>
                      <div className={styles.unreadBadge}>
                        {typeof conv.unreadCount === 'number' && conv.unreadCount > 0 && conv.unreadCount}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Messages View */
          <div className={styles.chatView}>
            <div className={styles.chatHeader}>
              <button className="btn btn-outline" onClick={handleBackToList}>
                ← Back
              </button>
              <div className={styles.chatHeaderInfo}>
                <h3>
                  {selectedConversation.participants
                    ?.map((p) => p.userId?.storeName || p.userId?.name)
                    .join(", ")}
                </h3>
                <span>{selectedConversation.conversationType}</span>
              </div>
            </div>

            <div className={styles.messagesContainer}>
              {loadingMessages ? (
                <div className={styles.loading}>
                  <div className="spinner" />
                  <p>Loading messages...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className={styles.empty}>
                  <p>No messages in this conversation</p>
                </div>
              ) : (
                messages.map((msg, index) => (
                  <div
                    key={msg._id || index}
                    className={`${styles.messageBubble} ${
                      msg.senderId?._id === selectedConversation.participants?.[0]?.userId?._id
                        ? styles.own
                        : styles.other
                    }`}
                  >
                    <div className={styles.senderName}>
                      {msg.senderId?.storeName || msg.senderId?.name || "Unknown"}
                    </div>
                    {msg.messageType === "image" && msg.attachments?.[0]?.url && (
                      <img
                        src={msg.attachments[0].url}
                        alt="Shared"
                        className={styles.messageImage}
                      />
                    )}
                    {msg.messageType === "file" && msg.attachments?.[0]?.url && (
                      <a
                        href={msg.attachments[0].url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.messageFile}
                      >
                        📎 {msg.attachments[0].fileName || "File"}
                      </a>
                    )}
                    {msg.text && <div className={styles.messageText}>{msg.text}</div>}
                    <div className={styles.messageTime}>{formatTime(msg.createdAt)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}