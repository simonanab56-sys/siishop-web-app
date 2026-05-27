// components/chat/ChatWindow.jsx - Main chat window
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { socketService } from "../../services/socket";
import { chatAPIMessages, chatAPIConversations } from "../../services/chatApi";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import TypingIndicator from "./TypingIndicator";
import styles from "./Chat.module.css";

export default function ChatWindow({
  conversation,
  onBack,
  onConversationUpdate,
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [hasMore, setHasMore] = useState(true);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const conversationId = conversation?._id;

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;

    try {
      setLoading(true);
      const res = await chatAPIMessages.getMessages(conversationId, { limit: 50 });
      if (res.data.success) {
        setMessages(res.data.messages || []);
        setHasMore(res.data.hasMore || false);

        // Mark as read
        await chatAPIMessages.markRead(conversationId);
      }
    } catch (err) {
      console.error("[Chat] Fetch messages error:", err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // Join chat room on mount
  useEffect(() => {
    if (!conversationId || !user?._id) return;

    fetchMessages();

    // Join socket room
    socketService.chatJoin(user._id, conversationId);

    // Listen for new messages
    const handleNewMessage = (data) => {
      if (data.conversationId === conversationId) {
        setMessages((prev) => [...prev, data.message]);
        // Mark as read
        chatAPIMessages.markRead(conversationId);
      }
    };

    // Listen for typing
    const handleTyping = (data) => {
      if (data.conversationId === conversationId && data.userId !== user._id) {
        setTypingUsers((prev) => ({
          ...prev,
          [data.userId]: data.isTyping ? data.userName : null,
        }));
      }
    };

    // Listen for read receipts
    const handleRead = (data) => {
      if (data.conversationId === conversationId) {
        setMessages((prev) =>
          prev.map((msg) => ({
            ...msg,
            readStatus: [
              ...(msg.readStatus || []),
              { userId: data.readBy, readAt: new Date() },
            ],
          }))
        );
      }
    };

    socketService.on("new-message", handleNewMessage);
    socketService.on("chat-message", handleNewMessage);
    socketService.on("chat-typing", handleTyping);
    socketService.on("chat-read", handleRead);

    return () => {
      socketService.chatLeave(user._id, conversationId);
      socketService.removeAllListeners("new-message");
      socketService.removeAllListeners("chat-message");
      socketService.removeAllListeners("chat-typing");
      socketService.removeAllListeners("chat-read");
    };
  }, [conversationId, user?._id, fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle sending messages
  const handleSend = async (textOrFile, file = null) => {
    if (!conversationId || sending) return;

    setSending(true);
    try {
      if (file) {
        // Upload file
        const formData = new FormData();
        formData.append("file", file);
        formData.append("conversationId", conversationId);

        const res = await chatAPIMessages.upload(formData);
        if (res.data.success) {
          setMessages((prev) => [...prev, res.data.message]);
        }
      } else if (textOrFile) {
        // Send text message via API
        const res = await chatAPIMessages.send({
          conversationId,
          text: textOrFile,
          messageType: "text",
        });

        if (res.data.success) {
          setMessages((prev) => [...prev, res.data.message]);

          // Also emit via socket for real-time
          socketService.chatSend({
            conversationId,
            senderId: user._id,
            text: textOrFile,
            messageType: "text",
          });
        }
      }

      // Notify parent of update
      onConversationUpdate?.();
    } catch (err) {
      console.error("[Chat] Send error:", err);
    } finally {
      setSending(false);
    }
  };

  // Handle typing indicator
  const handleTyping = (isTyping) => {
    if (!user?._id || !conversationId) return;

    if (isTyping) {
      socketService.chatTyping(
        conversationId,
        user._id,
        user.name || user.storeName || "User"
      );
    } else {
      socketService.chatTypingStop(conversationId, user._id);
    }
  };

  const getOtherParticipant = () => {
    if (!conversation?.participants) return null;
    return conversation.participants.find(
      (p) => p.userId?._id !== user?._id
    );
  };

  const other = getOtherParticipant();

  if (!conversation) {
    return (
      <div className={styles.chatWindow}>
        <div className={styles.noChat}>
          <span>💬</span>
          <p>Select a conversation</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.chatWindow}>
      {/* Chat Header */}
      <div className={styles.chatHeader}>
        {onBack && (
          <button className={styles.backButton} onClick={onBack}>
            ←
          </button>
        )}
        <div className={styles.headerInfo}>
          <div className={styles.headerAvatar}>
            {other?.userId?.storeName ? "🏪" : other?.userId?.name?.[0] || "👤"}
          </div>
          <div className={styles.headerText}>
            <h3>{other?.userId?.storeName || other?.userId?.name || "Chat"}</h3>
            {other?.userId?.isOnline && (
              <span className={styles.onlineStatus}>Online</span>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className={styles.messagesContainer}>
        {loading ? (
          <div className={styles.loading}>
            <div className="spinner" />
            <p>Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className={styles.emptyMessages}>
            <span>💬</span>
            <p>No messages yet</p>
            <small>Start the conversation!</small>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => (
              <MessageBubble
                key={msg._id || index}
                message={msg}
                isOwn={msg.senderId?._id === user?._id}
                sender={msg.senderId}
              />
            ))}
            {Object.values(typingUsers).some(Boolean) && (
              <TypingIndicator userName={Object.values(typingUsers).find(Boolean)} />
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onTyping={handleTyping}
        disabled={sending}
        placeholder="Type a message..."
      />
    </div>
  );
}