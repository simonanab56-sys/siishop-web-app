// services/socket.js - Socket.IO client for delivery tracking
import { io } from "socket.io-client";
import { API_BASE } from "../config/api";
import logger from "../utils/logger";

const SOCKET_URL = API_BASE.replace(/\/api$/, "");

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect(token) {
    if (this.socket?.connected) {
      return Promise.resolve(this.socket);
    }

    return new Promise((resolve, reject) => {
      try {
        this.socket = io(SOCKET_URL, {
          auth: { token },
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
        });

        this.socket.on("connect", () => {
          logger.log("[Socket] Connected:", this.socket.id);
          resolve(this.socket);
        });

        this.socket.on("connect_error", (error) => {
          logger.error("[Socket] Connection error:", error.message);
          reject(error);
        });

        this.socket.on("disconnect", (reason) => {
          logger.log("[Socket] Disconnected:", reason);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Rider authentication
  authenticateRider(riderId, orderId = null) {
    if (this.socket?.connected) {
      this.socket.emit("rider-auth", { riderId, orderId });
    }
  }

  // Update rider location
  updateLocation(orderId, latitude, longitude, speed = 0, heading = 0) {
    if (this.socket?.connected) {
      this.socket.emit("rider-location-update", {
        orderId,
        latitude,
        longitude,
        speed,
        heading,
      });
    }
  }

  // Join order tracking room
  joinOrderTracking(orderId, userType, userId) {
    if (this.socket?.connected) {
      this.socket.emit("join-order-tracking", { orderId, userType, userId });
    }
  }

  // Leave order tracking room
  leaveOrderTracking(orderId) {
    if (this.socket?.connected) {
      this.socket.emit("leave-order-tracking", { orderId });
    }
  }

  // ─────────────────────────────────────────────────────────
  // CHAT METHODS
  // ─────────────────────────────────────────────────────────

  // Join chat conversation
  chatJoin(userId, conversationId) {
    if (this.socket?.connected) {
      this.socket.emit("chat-join", { userId, conversationId });
    }
  }

  // Leave chat conversation
  chatLeave(userId, conversationId) {
    if (this.socket?.connected) {
      this.socket.emit("chat-leave", { userId, conversationId });
    }
  }

  // Send chat message
  chatSend(data) {
    if (this.socket?.connected) {
      this.socket.emit("chat-message", data);
    }
  }

  // Send typing indicator
  chatTyping(conversationId, userId, userName) {
    if (this.socket?.connected) {
      this.socket.emit("chat-typing", { conversationId, userId, userName });
    }
  }

  // Stop typing indicator
  chatTypingStop(conversationId, userId) {
    if (this.socket?.connected) {
      this.socket.emit("chat-typing-stop", { conversationId, userId });
    }
  }

  // ─────────────────────────────────────────────────────────
  // ADMIN LIVE-NOTIFY
  // ─────────────────────────────────────────────────────────

  // Join admin-notify-room. The admin frontend (AdminDashboard.jsx)
  // calls this on mount. The room is used for live pushes of
  // commission-paid (and any future admin-only) events. The server
  // does NOT verify the user is admin at the socket layer — the
  // route mount that triggers this is itself admin-only, so the
  // trust model matches the existing chat-join.
  adminNotifyJoin() {
    if (this.socket?.connected) {
      this.socket.emit("admin-notify-join");
    }
  }

  adminNotifyLeave() {
    if (this.socket?.connected) {
      this.socket.emit("admin-notify-leave");
    }
  }

  // Mark messages as read
  chatRead(conversationId, userId) {
    if (this.socket?.connected) {
      this.socket.emit("chat-read", { conversationId, userId });
    }
  }

  // Listen to events
  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
      // Store listener for cleanup
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event).push(callback);
    }
  }

  // Remove listener
  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
      if (callback && this.listeners.has(event)) {
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    }
  }

  // Remove all listeners for an event
  removeAllListeners(event) {
    if (this.socket) {
      if (event) {
        this.socket.off(event);
        this.listeners.delete(event);
      } else {
        // Remove all listeners
        this.listeners.forEach((callbacks, eventName) => {
          this.socket.off(eventName);
        });
        this.listeners.clear();
      }
    }
  }

  // Get connection status
  isConnected() {
    return this.socket?.connected || false;
  }

  getSocketId() {
    return this.socket?.id || null;
  }
}

// Export singleton instance
export const socketService = new SocketService();
export default socketService;