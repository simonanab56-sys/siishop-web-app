// pages/ChatPage.jsx - Chat page
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../components/chat/ChatContext";
import { ChatWindow, ConversationList } from "../components/chat";
import styles from "../components/chat/Chat.module.css";

export default function ChatPage({ onNavigate }) {
  const { user, isLoggedIn } = useAuth();
  const {
    conversations,
    loading: chatLoading,
    fetchConversations,
    createOrderConversation,
    fetchUnreadCount,
  } = useChat();

  const [selectedConversation, setSelectedConversation] = useState(null);
  const [conversationsList, setConversationsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMobileList, setIsMobileList] = useState(true);

  // Sync conversations
  useEffect(() => {
    setConversationsList(conversations);
  }, [conversations]);

  // Load conversations on mount
  useEffect(() => {
    if (isLoggedIn) {
      fetchConversations().finally(() => setLoading(false));
    }
  }, [isLoggedIn, fetchConversations]);

  const handleSelectConversation = useCallback((id) => {
    const conv = conversationsList.find((c) => c._id === id);
    setSelectedConversation(conv);
    setIsMobileList(false);
  }, [conversationsList]);

  const handleBackToList = useCallback(() => {
    setSelectedConversation(null);
    setIsMobileList(true);
  }, []);

  const handleConversationUpdate = useCallback(() => {
    fetchConversations();
    fetchUnreadCount();
  }, [fetchConversations, fetchUnreadCount]);

  // Determine if mobile view
  const isMobile = window.innerWidth <= 768;

  return (
    <div className={styles.chatPage}>
      <div className={styles.chatPageHeader}>
        <h1>Messages</h1>
      </div>

      <div className={styles.chatContainer}>
        {/* Sidebar - Conversation List */}
        {(!isMobile || isMobileList) && (
          <div className={styles.chatSidebar}>
            <div className={styles.sidebarHeader}>
              <h2>Chats</h2>
            </div>
            <ConversationList
              conversations={conversationsList}
              selectedId={selectedConversation?._id}
              onSelect={handleSelectConversation}
              loading={loading || chatLoading}
            />
          </div>
        )}

        {/* Main Chat Window */}
        {(!isMobile || !isMobileList) && (
          <ChatWindow
            conversation={selectedConversation}
            onBack={isMobile ? handleBackToList : null}
            onConversationUpdate={handleConversationUpdate}
          />
        )}
      </div>
    </div>
  );
}