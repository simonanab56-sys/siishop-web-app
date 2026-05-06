"use strict";

const jwt = require("jsonwebtoken");
const User = require("../models/User");

function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);

  if (req.cookies?.token) return req.cookies.token;

  return null;
}

async function requireAuth(req, res, next) {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Server misconfigured" });
    }

    const token = extractToken(req);
    if (!token) return res.status(401).json({ message: "Auth required" });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: "Invalid token" });
    }

    const user = await User.findById(decoded.userId).lean();
    if (!user) return res.status(401).json({ message: "User not found" });

    req.user = {
      userId: String(user._id),
      isAdmin: !!user.isAdmin,
      isVendor: !!user.isVendor,
      vendorStatus: user.vendorStatus || "pending",
    };

    next();
  } catch (err) {
    console.error(err);
    res.status(401).json({ message: "Auth failed" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
}

function requireVendor(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Auth required" });

  if (req.user.isAdmin) return next();

  if (!req.user.isVendor) {
    return res.status(403).json({ message: "Vendor only" });
  }

  if (req.user.vendorStatus !== "approved") {
    return res.status(403).json({ message: "Vendor not approved" });
  }

  next();
}

module.exports = { requireAuth, requireAdmin, requireVendor };