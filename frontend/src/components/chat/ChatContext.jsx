// components/chat/ChatContext.jsx - Chat context provider
import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { socketService } from "../../services/socket";
import { chatAPIConversations, chatAPIMessages, chatAPIUnread } from "../../services/chatApi";

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const { user, isLoggedIn } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const socketConnected = useRef(false);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      setLoading(true);
      const res = await chatAPIConversations.getAll();
      if (res.data.success) {
        setConversations(res.data.conversations || []);
      }
    } catch (err) {
      console.error("[Chat] Fetch conversations error:", err);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const res = await chatAPIUnread.getCount();
      if (res.data.success) {
        setUnreadCount(res.data.unreadCount || 0);
      }
    } catch (err) {
      console.error("[Chat] Fetch unread count error:", err);
    }
  }, [isLoggedIn]);

  // Initialize chat on login
  useEffect(() => {
    if (isLoggedIn) {
      fetchConversations();
      fetchUnreadCount();
    } else {
      setConversations([]);
      setUnreadCount(0);
    }
  }, [isLoggedIn, fetchConversations, fetchUnreadCount]);

  // Connect to socket for chat
  useEffect(() => {
    if (!isLoggedIn || !user?._id) return;

    const connectSocket = async () => {
      if (socketConnected.current) return;

      try {
        const token = localStorage.getItem("token");
        if (token) {
          await socketService.connect(token);
          socketConnected.current = true;

          // Listen for new messages
          socketService.on("new-message", (data) => {
            fetchUnreadCount();
          });

          // Listen for chat notifications
          socketService.on("chat-notification", (data) => {
            fetchUnreadCount();
          });

          // Listen for user online/offline
          socketService.on("user-online", (data) => {
            setConversations((prev) =>
              prev.map((conv) => {
                if (conv.otherParticipant?._id === data.userId) {
                  return {
                    ...conv,
                    otherParticipant: {
                      ...conv.otherParticipant,
                      isOnline: true,
                    },
                  };
                }
                return conv;
              })
            );
          });

          socketService.on("user-offline", (data) => {
            setConversations((prev) =>
              prev.map((conv) => {
                if (conv.otherParticipant?._id === data.userId) {
                  return {
                    ...conv,
                    otherParticipant: {
                      ...conv.otherParticipant,
                      isOnline: false,
                      lastSeen: new Date(),
                    },
                  };
                }
                return conv;
              })
            );
          });
        }
      } catch (err) {
        console.error("[Chat] Socket connection error:", err);
      }
    };

    connectSocket();

    return () => {
      // Cleanup listeners on unmount
      socketService.removeAllListeners("new-message");
      socketService.removeAllListeners("chat-notification");
      socketService.removeAllListeners("user-online");
      socketService.removeAllListeners("user-offline");
    };
  }, [isLoggedIn, user?._id, fetchUnreadCount]);

  // Create new conversation
  const createConversation = async (participantId, options = {}) => {
    try {
      const res = await chatAPIConversations.create({
        participantId,
        ...options,
      });
      if (res.data.success) {
        await fetchConversations();
        return res.data.conversation;
      }
    } catch (err) {
      console.error("[Chat] Create conversation error:", err);
      throw err;
    }
  };

  // Create order conversation
  const createOrderConversation = async (orderId, targetId) => {
    try {
      const res = await chatAPIConversations.createForOrder(orderId, targetId);
      if (res.data.success) {
        await fetchConversations();
        return res.data.conversation;
      }
    } catch (err) {
      console.error("[Chat] Create order conversation error:", err);
      throw err;
    }
  };

  const value = {
    conversations,
    unreadCount,
    loading,
    fetchConversations,
    fetchUnreadCount,
    createConversation,
    createOrderConversation,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}

export default ChatContext;