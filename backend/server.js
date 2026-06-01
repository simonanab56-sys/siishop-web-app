"use strict";

require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors    = require("cors");
const helmet  = require("helmet");
const path    = require("path");
const fs      = require("fs");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const http = require("http");
const { Server } = require("socket.io");

const app  = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

/* ───────────────────────── TRUST PROXY ─────────────────────── */
app.set("trust proxy", 1);

/* ───────────────────────── STATIC UPLOADS (BEFORE CORS) ─────────────────────── */
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
if (fs.existsSync(UPLOAD_DIR)) {
  // ✅ Serve static files WITHOUT credentials header
  app.use("/uploads", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    // ❌ DO NOT set Access-Control-Allow-Credentials with Allow-Origin: *
    next();
  });
  app.use("/uploads", express.static(UPLOAD_DIR));
}
/* ───────────────────────── SECURITY HEADERS (HELMET) ─────────────────────── */

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameguard: { action: "deny" },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));

/* ───────────────────────── CORS (FIXED) ─────────────────────────
 * Supports multiple frontend origins (React + Vite + production)
 */
/* ───────────────────────── CORS (MOBILE + WEB FIXED) ───────────────────────── */

const prodFrontendUrl =
  process.env.FRONTEND_URL_PROD ||
  "https://siishop-web-app.vercel.app";

// Parse extra origins from env if needed
const corsOriginsFromEnv = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : [];

const allowedOrigins = [
  "http://localhost:3001",
  "http://localhost:5173",
   "https://www.siishops.com",
   "https://siishops.com",
  // Capacitor mobile apps
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
  "ionic://localhost",

  // Production frontend
  prodFrontendUrl,

  // Vercel preview deployments
  "https://siishop-web-app-git-main-simonanab56-6856s-projects.vercel.app",

  ...corsOriginsFromEnv,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {

      // Allow requests without origin
      // (mobile apps, Postman, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // Exact match
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow ALL Vercel preview deployments
      if (origin.includes(".vercel.app")) {
        return callback(null, true);
      }

      console.error("❌ CORS blocked:", origin);

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },

    credentials: true,

    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);

// Handle preflight
app.options("*", cors());

/* ───────────────────────── SOCKET.IO SETUP ─────────────────────── */
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Store active rider connections
const activeRiders = new Map();

// Socket.IO connection handler
io.on("connection", (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Rider authentication
  socket.on("rider-auth", (data) => {
    const { riderId, orderId } = data;
    if (riderId) {
      activeRiders.set(riderId, {
        socketId: socket.id,
        orderId: orderId || null,
        connectedAt: new Date(),
      });
      socket.join(`rider:${riderId}`);
      console.log(`[Socket] Rider authenticated: ${riderId}`);
    }
  });

  // Rider location update
  socket.on("rider-location-update", (data) => {
    const { orderId, latitude, longitude, riderId, speed, heading } = data;

    if (orderId && latitude && longitude) {
      if (activeRiders.has(riderId)) {
        const rider = activeRiders.get(riderId);
        rider.lastLocation = { latitude, longitude, timestamp: new Date() };
        activeRiders.set(riderId, rider);
      }

      io.to(`order:${orderId}`).emit("rider-location-update", {
        orderId,
        latitude,
        longitude,
        speed: speed || 0,
        heading: heading || 0,
        timestamp: new Date(),
      });
    }
  });

  // Join order tracking room
  socket.on("join-order-tracking", (data) => {
    const { orderId, userType, userId } = data;
    if (orderId) {
      socket.join(`order:${orderId}`);
      console.log(`[Socket] ${userType || 'user'} joined order tracking: ${orderId}`);
    }
  });

  // Leave order tracking room
  socket.on("leave-order-tracking", (data) => {
    const { orderId } = data;
    if (orderId) {
      socket.leave(`order:${orderId}`);
    }
  });

  // Order status update
  socket.on("order-status-update", (data) => {
    const { orderId, status, riderId, eta } = data;
    if (orderId) {
      io.to(`order:${orderId}`).emit("order-status-update", { orderId, status, riderId, eta, timestamp: new Date() });
    }
  });

  // ETA update
  socket.on("eta-update", (data) => {
    const { orderId, eta, distance, duration } = data;
    if (orderId) {
      io.to(`order:${orderId}`).emit("eta-update", { orderId, eta, distance, duration, timestamp: new Date() });
    }
  });

  // Rider assigned
  socket.on("rider-assigned", (data) => {
    const { orderId, riderId, riderName, riderPhone } = data;
    if (orderId) {
      io.to(`order:${orderId}`).emit("rider-assigned", { orderId, riderId, riderName, riderPhone, timestamp: new Date() });
    }
  });

  // Delivery completed
  socket.on("delivery-completed", (data) => {
    const { orderId, deliveredAt } = data;
    if (orderId) {
      io.to(`order:${orderId}`).emit("delivery-completed", { orderId, deliveredAt: deliveredAt || new Date() });
      for (const [riderId, rider] of activeRiders) {
        if (rider.orderId === orderId) {
          rider.orderId = null;
          activeRiders.set(riderId, rider);
        }
      }
    }
  });

  // ─────────────────────────────────────────────────────────
  // CHAT SOCKET EVENTS
  // ─────────────────────────────────────────────────────────

  // User joins chat (authenticated)
  socket.on("chat-join", async (data) => {
    const { userId, conversationId } = data;
    if (userId && conversationId) {
      // Join user's personal room
      socket.join(`user:${userId}`);

      // Join conversation room
      socket.join(`chat:${conversationId}`);

      // Update user's online status
      await User.findByIdAndUpdate(userId, {
        isOnline: true,
        lastSeen: new Date(),
      });

      // Notify others that user is online
      socket.broadcast.emit("user-online", { userId });

      console.log(`[Chat] User ${userId} joined chat ${conversationId}`);
    }
  });

  // User leaves chat
  socket.on("chat-leave", async (data) => {
    const { userId, conversationId } = data;
    if (userId && conversationId) {
      socket.leave(`chat:${conversationId}`);

      // Update user's online status
      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastSeen: new Date(),
      });

      // Notify others
      socket.broadcast.emit("user-offline", { userId });
    }
  });

  // Send chat message
  socket.on("chat-message", async (data) => {
    const { conversationId, senderId, text, messageType, metadata } = data;
    if (conversationId && senderId && text) {
      const Conversation = require("./models/Conversation");
      const Message = require("./models/Message");

      // Get conversation
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) return;

      // Create message
      const sender = await User.findById(senderId);
      const senderRole = sender.isVendor ? "vendor" : sender.isAdmin ? "admin" : sender.isRider ? "rider" : "customer";

      const message = await Message.create({
        conversationId,
        senderId,
        senderRole,
        messageType: messageType || "text",
        text,
        metadata,
        deliveredStatus: conversation.participants.map((p) => ({
          userId: p.userId,
          deliveredAt: new Date(),
        })),
      });

      await message.populate("senderId", "name email avatar");

      // Update conversation
      conversation.lastMessage = {
        text: text.substring(0, 100),
        senderId,
        messageType: messageType || "text",
        createdAt: message.createdAt,
      };

      for (const participant of conversation.participants) {
        if (participant.userId.toString() !== senderId.toString()) {
          const unreadEntry = conversation.unreadCounts.find(
            (u) => u.userId.toString() === participant.userId.toString()
          );
          if (unreadEntry) {
            unreadEntry.count += 1;
          }
        }
      }

      await conversation.save();

      // Emit to conversation room
      io.to(`chat:${conversationId}`).emit("chat-message", {
        conversationId,
        message: message.toObject(),
      });

      // Also emit personal notification
      for (const participant of conversation.participants) {
        if (participant.userId.toString() !== senderId.toString()) {
          io.to(`user:${participant.userId}`).emit("chat-notification", {
            conversationId,
            message: message.toObject(),
            senderId,
          });
        }
      }
    }
  });

  // Typing indicator
  socket.on("chat-typing", (data) => {
    const { conversationId, userId, userName } = data;
    if (conversationId && userId) {
      socket.to(`chat:${conversationId}`).emit("chat-typing", {
        conversationId,
        userId,
        userName,
        isTyping: true,
      });
    }
  });

  // Stop typing
  socket.on("chat-typing-stop", (data) => {
    const { conversationId, userId } = data;
    if (conversationId && userId) {
      socket.to(`chat:${conversationId}`).emit("chat-typing", {
        conversationId,
        userId,
        isTyping: false,
      });
    }
  });

  // Message read receipt
  socket.on("chat-read", async (data) => {
    const { conversationId, userId } = data;
    if (conversationId && userId) {
      const Message = require("./models/Message");

      // Mark messages as read
      const unreadMessages = await Message.find({
        conversationId,
        "readStatus.userId": { $ne: userId },
        senderId: { $ne: userId },
        isDeleted: false,
      });

      for (const msg of unreadMessages) {
        msg.readStatus.push({ userId });
        await msg.save();
      }

      // Emit read receipt
      socket.to(`chat:${conversationId}`).emit("chat-read", {
        conversationId,
        readBy: userId,
        messageCount: unreadMessages.length,
      });
    }
  });

  // Disconnect
  socket.on("disconnect", async () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);

    // Handle rider disconnect
    for (const [riderId, rider] of activeRiders) {
      if (rider.socketId === socket.id) {
        activeRiders.delete(riderId);
        console.log(`[Socket] Rider disconnected: ${riderId}`);
        break;
      }
    }

    // Handle user chat disconnect - set offline
    // We need to find the user by their socket rooms
    const userRooms = Array.from(socket.rooms);
    for (const room of userRooms) {
      if (room.startsWith("user:")) {
        const userId = room.replace("user:", "");
        try {
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeen: new Date(),
          });
          socket.broadcast.emit("user-offline", { userId });
        } catch (e) {
          // Ignore errors
        }
        break;
      }
    }
  });
});

app.set("io", io);
app.set("activeRiders", activeRiders);
console.log("✅ Socket.IO initialized");

// Middleware to attach io to requests
app.use((req, res, next) => {
  req.io = io;
  next();
});

/* ───────────────────────── COOKIE PARSER ───────────────────────── */
app.use(cookieParser());

/* ───────────────────────── RATE LIMITING ───────────────────────── */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

/* ───────────────────────── BODY PARSERS ───────────────────────── */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));



/* ───────────────────────── WEBHOOK ROUTES (BEFORE JSON) ────────── */
app.use("/api/webhooks", require("./routes/webhook"));

/* ───────────────────────── API ROUTES ─────────────────────────── */
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
// Removed global rate limiter - only auth endpoints are rate limited

app.use("/api/auth",     require("./routes/auth"));
app.use("/api/products", require("./routes/products"));
app.use("/api/orders",   require("./routes/orders"));
app.use("/api/vendor",   require("./routes/vendor"));
app.use("/api/admin",    require("./routes/admin"));
app.use("/api/promos",   require("./routes/promos"));
app.use("/api/contact",  require("./routes/contact"));
app.use("/api/delivery", require("./routes/delivery"));
app.use("/api/chat",     require("./routes/chat"));

/* ───────────────────────── SECURITY HEADERS ───────────────────────── */
app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

/* ───────────────────────── HEALTH CHECK ───────────────────────── */
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

/* ───────────────────────── 404 FALLBACK ───────────────────────── */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

/* ───────────────────────── GLOBAL ERROR HANDLER ───────────────── */
app.use(require("./utils/errorHandler"));

/* ───────────────────────── DB CONNECT ─────────────────────────── */
async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing in .env");
    }

    console.log("⏳ Connecting to MongoDB...");

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log("✅ MongoDB connected successfully");

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Allowed CORS origins:`, allowedOrigins);
    });

  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

/* ───────────────────────── UNHANDLED REJECTIONS ───────────────── */
process.on("unhandledRejection", (reason, promise) => {
  console.error("[UNHANDLED REJECTION] Reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION] Stack:", err.stack);
});

/* ───────────────────────── START ─────────────────────────────── */
startServer();