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

const app  = express();
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
const prodFrontendUrl = process.env.FRONTEND_URL_PROD || "https://siishop-web-app.vercel.app";

// Parse CORS_ORIGIN env variable if set (comma-separated URLs)
const corsOriginsFromEnv = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : [];

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  prodFrontendUrl,
  "https://siishop-web-app-git-main-simonanab56-6856s-projects.vercel.app", // Vercel preview branch
  ...corsOriginsFromEnv,
].filter(Boolean);

// Also allow any vercel.app subdomain for flexibility
const vercelPatterns = [
  /\.vercel\.app$/,
  /\.vercel\.app\/.*$/,
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (Postman, mobile apps)
      if (!origin) return callback(null, true);

      // Check exact match
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Check vercel.app pattern match
      if (origin.endsWith(".vercel.app") || origin.includes(".vercel.app")) {
        return callback(null, true);
      }

      console.error("❌ CORS blocked:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ✅ Handle preflight requests properly
app.options("*", cors());

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

    app.listen(PORT, () => {
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