// services/chatApi.js - Chat API service
import axios from "axios";
import { API_BASE } from "../config/api";
import { getToken } from "./api";

const chatAPI = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add auth token
chatAPI.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Conversations API
export const chatAPIConversations = {
  getAll: (params = {}) => chatAPI.get("/chat/conversations", { params }),
  getById: (id) => chatAPI.get(`/chat/conversations/${id}`),
  create: (data) => chatAPI.post("/chat/conversations", data),
  createForOrder: (orderId, targetId) =>
    chatAPI.post(`/chat/conversations/order/${orderId}`, { targetId }),
  delete: (id) => chatAPI.delete(`/chat/conversations/${id}`),
  block: (conversationId, reason) =>
    chatAPI.post("/chat/block", { conversationId, reason }),
};

// Messages API
export const chatAPIMessages = {
  getMessages: (conversationId, params = {}) =>
    chatAPI.get(`/chat/messages/${conversationId}`, { params }),
  send: (data) => chatAPI.post("/chat/send", data),
  upload: (formData) => {
    // Get token and set it manually to preserve auth
    const token = getToken();
    return chatAPI.post("/chat/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        Authorization: token ? `Bearer ${token}` : "",
      },
    });
  },
  markRead: (conversationId) =>
    chatAPI.post("/chat/read", { conversationId }),
};

// Unread count
export const chatAPIUnread = {
  getCount: () => chatAPI.get("/chat/unread-count"),
};

// Admin API
export const chatAPIAdmin = {
  getAllConversations: (params = {}) =>
    chatAPI.get("/chat/admin/conversations", { params }),
  getConversation: (id) =>
    chatAPI.get(`/chat/admin/conversations/${id}`),
  getMessages: (conversationId, params = {}) =>
    chatAPI.get(`/chat/admin/messages/${conversationId}`, { params }),
  getStats: () => chatAPI.get("/chat/admin/stats"),
};

export default chatAPI;