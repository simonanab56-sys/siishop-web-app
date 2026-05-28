// routes/chat.js - Chat API routes
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");
const Order = require("../models/Order");
const { requireAuth } = require("../middleware/auth");
const { cloudinary } = require("../config/cloudinary");

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif|pdf|doc|docx/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname || mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only images and documents are allowed"));
  },
});

// ============================================================
// CONVERSATION APIs
// ============================================================

// GET /api/chat/conversations - Get all conversations for user
router.get("/conversations", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log("[Chat] GET conversations - userId:", userId, "req.user:", req.user);
    const { type, limit = 20, skip = 0 } = req.query;

    // Build query based on user role and filters
    let query = {
      "participants.userId": userId,
      isActive: true,
    };

    // Filter by conversation type
    if (type) {
      query.conversationType = type;
    }

    // Vendor isolation: vendors only see their own conversations
    const user = await User.findById(userId);
    if (user.isVendor && !user.isAdmin) {
      // Vendor can only see conversations where they are a participant
      query = {
        "participants.userId": userId,
        isActive: true,
      };
      if (type) {
        query.conversationType = type;
      }
    }

    const conversations = await Conversation.find(query)
      .sort({ updatedAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .populate("participants.userId", "name email phone avatar storeName isOnline lastSeen")
      .populate("orderId", "orderNumber status totalAmount")
      .populate("productId", "name images price")
      .lean();

    // Get unread counts for each conversation
    const enrichedConversations = conversations.map((conv) => {
      const unreadEntry = conv.unreadCounts?.find(
        (u) => u.userId._id.toString() === userId.toString()
      );
      const otherParticipant = conv.participants.find(
        (p) => p.userId._id.toString() !== userId.toString()
      );
      return {
        ...conv,
        unreadCount: unreadEntry?.count || 0,
        otherParticipant: otherParticipant ? otherParticipant.userId : null,
        otherParticipantRole: otherParticipant?.role,
      };
    });

    res.json({
      success: true,
      conversations: enrichedConversations,
      pagination: {
        limit: parseInt(limit),
        skip: parseInt(skip),
      },
    });
  } catch (error) {
    console.error("[Chat] Get conversations error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch conversations" });
  }
});

// GET /api/chat/conversations/:id - Get single conversation
router.get("/conversations/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const conversation = await Conversation.findById(id)
      .populate("participants.userId", "name email phone avatar storeName isOnline lastSeen")
      .populate("orderId")
      .populate("productId", "name images price")
      .lean();

    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    // Check if user is participant
    const isParticipant = conversation.participants.some(
      (p) => p.userId._id.toString() === userId.toString()
    );

    if (!isParticipant) {
      // Check if admin (can view all)
      const user = await User.findById(userId);
      if (!user.isAdmin) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
    }

    // Get unread count
    const unreadEntry = conversation.unreadCounts?.find(
      (u) => u.userId.toString() === userId.toString()
    );

    res.json({
      success: true,
      conversation: {
        ...conversation,
        unreadCount: unreadEntry?.count || 0,
      },
    });
  } catch (error) {
    console.error("[Chat] Get conversation error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch conversation" });
  }
});

// POST /api/chat/conversations - Create new conversation
router.post("/conversations", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log("[Chat] POST create conversation - userId:", userId, "req.user:", req.user);
    const { participantId, conversationType = "direct", orderId, productId } = req.body;

    console.log("[Chat] Creating conversation:", { userId, participantId, conversationType, orderId, productId });

    if (!participantId) {
      return res.status(400).json({ success: false, message: "Participant ID required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    console.log("[Chat] Current user:", user.name, "isVendor:", user.isVendor, "isAdmin:", user.isAdmin);

    // Determine roles - ensure we always have a valid role
    const currentUserRole = user.isVendor ? "vendor" : user.isAdmin ? "admin" : user.isRider ? "rider" : "customer";

    // Get participant details
    const otherUser = await User.findById(participantId);
    if (!otherUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const otherUserRole = otherUser.isVendor ? "vendor" : otherUser.isAdmin ? "admin" : otherUser.isRider ? "rider" : "customer";

    console.log("[Chat] Other user:", otherUser.name, "role:", otherUserRole);

    const participants = [
      { userId: user._id, role: currentUserRole },
      { userId: otherUser._id, role: otherUserRole },
    ];

    // If order-based, verify access
    if (orderId) {
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }

      // Verify user has access to this order
      const isCustomer = order.user.toString() === userId.toString();
      const isVendor = order.vendor.toString() === userId.toString();
      const isAdmin = user.isAdmin;

      if (!isCustomer && !isVendor && !isAdmin) {
        return res.status(403).json({ success: false, message: "Access denied to order" });
      }

      // Vendor isolation: vendor can only chat about their own orders
      if (user.isVendor && !user.isAdmin && !isVendor) {
        return res.status(403).json({ success: false, message: "Can only chat about your own orders" });
      }
    }

    // Create or find conversation
    const conversation = await Conversation.findOrCreate(participants, {
      conversationType,
      orderId,
      productId,
    });

    console.log("[Chat] Conversation created:", conversation._id);

    // Populate for response
    await conversation.populate("participants.userId", "name email phone avatar storeName isOnline lastSeen");
    await conversation.populate("orderId", "orderNumber status totalAmount");
    await conversation.populate("productId", "name images price");

    res.json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error("[Chat] Create conversation error:", error);
    res.status(500).json({ success: false, message: "Failed to create conversation" });
  }
});

// POST /api/chat/conversations/order/:orderId - Create conversation for order
router.post("/conversations/order/:orderId", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const user = await User.findById(userId);

    // Determine access
    const isCustomer = order.user.toString() === userId.toString();
    const isVendor = order.vendor.toString() === userId.toString();
    const isAdmin = user.isAdmin;

    if (!isCustomer && !isVendor && !isAdmin) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Determine participants
    const participants = [];
    const vendor = await User.findById(order.vendor);

    if (isCustomer) {
      // Customer chatting with vendor
      participants.push({ userId, role: "customer" });
      participants.push({ userId: order.vendor, role: "vendor" });
    } else if (isVendor) {
      // Vendor chatting with customer
      participants.push({ userId, role: "vendor" });
      participants.push({ userId: order.user, role: "customer" });
    } else if (isAdmin) {
      // Admin can chat with either
      participants.push({ userId, role: "admin" });
      const targetId = req.body.targetId || order.vendor;
      const targetUser = await User.findById(targetId);
      participants.push({
        userId: targetId,
        role: targetUser?.isVendor ? "vendor" : "customer",
      });
    }

    const conversation = await Conversation.findOrCreate(participants, {
      conversationType: "order",
      orderId,
    });

    await conversation.populate("participants.userId", "name email phone avatar storeName isOnline lastSeen");
    await conversation.populate("orderId", "orderNumber status totalAmount deliveryAddress");

    res.json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error("[Chat] Create order conversation error:", error);
    res.status(500).json({ success: false, message: "Failed to create conversation" });
  }
});

// ============================================================
// MESSAGE APIs
// ============================================================

// GET /api/chat/messages/:conversationId - Get messages in conversation
router.get("/messages/:conversationId", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.params;
    const { limit = 50, before, after, beforeId } = req.query;

    // Verify user has access to conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    // Check if user is participant
    const isParticipant = conversation.participants.some(
      (p) => p.userId.toString() === userId.toString()
    );

    const user = await User.findById(userId);
    if (!isParticipant && !user.isAdmin) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Vendor isolation: vendors can't see other vendors' conversations
    if (user.isVendor && !user.isAdmin) {
      const userParticipant = conversation.participants.find(
        (p) => p.userId.toString() === userId.toString()
      );
      const otherParticipant = conversation.participants.find(
        (p) => p.userId.toString() !== userId.toString()
      );

      // Vendor can only chat with customers (not other vendors)
      if (otherParticipant?.role === "vendor") {
        return res.status(403).json({ success: false, message: "Vendors cannot chat with each other" });
      }
    }

    // Get messages with pagination
    const { messages, hasMore } = await Message.getMessages(conversationId, {
      limit: parseInt(limit),
      before,
      after,
    });

    // Mark messages as delivered
    for (const msg of messages) {
      if (!msg.deliveredStatus.some((d) => d.userId.toString() === userId.toString())) {
        msg.deliveredStatus.push({ userId });
        await msg.save();
      }
    }

    res.json({
      success: true,
      messages,
      hasMore,
    });
  } catch (error) {
    console.error("[Chat] Get messages error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch messages" });
  }
});

// POST /api/chat/send - Send a message
router.post("/send", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId, text, messageType = "text", metadata } = req.body;

    if (!conversationId) {
      return res.status(400).json({ success: false, message: "Conversation ID required" });
    }

    if (!text && messageType === "text") {
      return res.status(400).json({ success: false, message: "Message text required" });
    }

    // Verify conversation exists
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    // Check if user is participant
    const user = await User.findById(userId);
    const isParticipant = conversation.participants.some(
      (p) => p.userId.toString() === userId.toString()
    );

    if (!isParticipant && !user.isAdmin) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Vendor isolation check
    if (user.isVendor && !user.isAdmin) {
      const userParticipant = conversation.participants.find(
        (p) => p.userId.toString() === userId.toString()
      );
      const otherParticipant = conversation.participants.find(
        (p) => p.userId.toString() !== userId.toString()
      );

      if (otherParticipant?.role === "vendor") {
        return res.status(403).json({ success: false, message: "Vendors cannot chat with each other" });
      }
    }

    // Check if blocked
    if (conversation.isBlocked) {
      return res.status(403).json({ success: false, message: "Conversation is blocked" });
    }

    // Create message
    const message = await Message.create({
      conversationId,
      senderId: userId,
      senderRole: user.isVendor ? "vendor" : user.isAdmin ? "admin" : user.isRider ? "rider" : "customer",
      messageType,
      text: text || "",
      metadata,
      deliveredStatus: conversation.participants.map((p) => ({
        userId: p.userId,
        deliveredAt: new Date(),
      })),
    });

    // Populate sender info
    await message.populate("senderId", "name email avatar");

    // Update conversation's last message
    conversation.lastMessage = {
      text: text?.substring(0, 100) || "[Media]",
      senderId: userId,
      messageType,
      createdAt: message.createdAt,
    };

    // Increment unread counts for other participants
    for (const participant of conversation.participants) {
      if (participant.userId.toString() !== userId.toString()) {
        const unreadEntry = conversation.unreadCounts.find(
          (u) => u.userId.toString() === participant.userId.toString()
        );
        if (unreadEntry) {
          unreadEntry.count += 1;
        }
      }
    }

    await conversation.save();

    // Emit socket event
    if (req.io) {
      const otherParticipants = conversation.participants.filter(
        (p) => p.userId.toString() !== userId.toString()
      );

      for (const participant of otherParticipants) {
        req.io.to(`user:${participant.userId}`).emit("new-message", {
          conversationId,
          message: message.toObject(),
        });
      }
    }

    res.json({
      success: true,
      message,
    });
  } catch (error) {
    console.error("[Chat] Send message error:", error);
    res.status(500).json({ success: false, message: "Failed to send message" });
  }
});

// POST /api/chat/upload - Upload file/image
router.post("/upload", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ success: false, message: "Conversation ID required" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    // Verify conversation access
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    const isParticipant = conversation.participants.some(
      (p) => p.userId.toString() === userId.toString()
    );

    const user = await User.findById(userId);
    if (!isParticipant && !user.isAdmin) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Determine if image or file
    const isImage = req.file.mimetype.startsWith("image/");

    // Upload to Cloudinary
    const uploadOptions = {
      folder: `siishop/chat/${conversationId}`,
      resource_type: isImage ? "image" : "raw",
    };

    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    // Create message
    const messageData = {
      conversationId,
      senderId: userId,
      senderRole: user.isVendor ? "vendor" : user.isAdmin ? "admin" : user.isRider ? "rider" : "customer",
      messageType: isImage ? "image" : "file",
      deliveredStatus: conversation.participants.map((p) => ({
        userId: p.userId,
        deliveredAt: new Date(),
      })),
    };

    if (isImage) {
      messageData.image = {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
      };
    } else {
      messageData.file = {
        url: result.secure_url,
        publicId: result.public_id,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      };
    }

    const message = await Message.create(messageData);

    // Update conversation
    conversation.lastMessage = {
      text: isImage ? "[Image]" : `[File: ${req.file.originalname}]`,
      senderId,
      messageType: messageData.messageType,
      createdAt: message.createdAt,
    };

    for (const participant of conversation.participants) {
      if (participant.userId.toString() !== userId.toString()) {
        const unreadEntry = conversation.unreadCounts.find(
          (u) => u.userId.toString() === participant.userId.toString()
        );
        if (unreadEntry) {
          unreadEntry.count += 1;
        }
      }
    }

    await conversation.save();

    // Emit socket event
    if (req.io) {
      const otherParticipants = conversation.participants.filter(
        (p) => p.userId.toString() !== userId.toString()
      );

      for (const participant of otherParticipants) {
        req.io.to(`user:${participant.userId}`).emit("new-message", {
          conversationId,
          message: message.toObject(),
        });
      }
    }

    res.json({
      success: true,
      message,
    });
  } catch (error) {
    console.error("[Chat] Upload error:", error);
    res.status(500).json({ success: false, message: "Failed to upload file" });
  }
});

// POST /api/chat/read - Mark messages as read
router.post("/read", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ success: false, message: "Conversation ID required" });
    }

    // Verify access
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    const isParticipant = conversation.participants.some(
      (p) => p.userId.toString() === userId.toString()
    );

    const user = await User.findById(userId);
    if (!isParticipant && !user.isAdmin) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Mark messages as read
    const readCount = await Message.markAsRead(conversationId, userId);

    // Reset unread count
    const unreadEntry = conversation.unreadCounts.find(
      (u) => u.userId.toString() === userId.toString()
    );
    if (unreadEntry) {
      unreadEntry.count = 0;
    }
    await conversation.save();

    // Emit read receipt
    if (req.io) {
      const otherParticipants = conversation.participants.filter(
        (p) => p.userId.toString() !== userId.toString()
      );

      for (const participant of otherParticipants) {
        req.io.to(`user:${participant.userId}`).emit("messages-read", {
          conversationId,
          readBy: userId,
        });
      }
    }

    res.json({
      success: true,
      readCount,
    });
  } catch (error) {
    console.error("[Chat] Mark read error:", error);
    res.status(500).json({ success: false, message: "Failed to mark as read" });
  }
});

// GET /api/chat/unread-count - Get total unread count
router.get("/unread-count", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const conversations = await Conversation.find({
      "participants.userId": userId,
      isActive: true,
    });

    let totalUnread = 0;
    for (const conv of conversations) {
      const unreadEntry = conv.unreadCounts?.find(
        (u) => u.userId.toString() === userId.toString()
      );
      totalUnread += unreadEntry?.count || 0;
    }

    res.json({
      success: true,
      unreadCount: totalUnread,
    });
  } catch (error) {
    console.error("[Chat] Unread count error:", error);
    res.status(500).json({ success: false, message: "Failed to get unread count" });
  }
});

// POST /api/chat/block - Block conversation
router.post("/block", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId, reason } = req.body;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    const isParticipant = conversation.participants.some(
      (p) => p.userId.toString() === userId.toString()
    );

    const user = await User.findById(userId);
    if (!isParticipant && !user.isAdmin) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    conversation.isBlocked = true;
    conversation.blockedBy = userId;
    conversation.blockReason = reason || "Blocked by user";
    await conversation.save();

    res.json({
      success: true,
      message: "Conversation blocked",
    });
  } catch (error) {
    console.error("[Chat] Block error:", error);
    res.status(500).json({ success: false, message: "Failed to block conversation" });
  }
});

// DELETE /api/chat/conversations/:id - Delete/archive conversation
router.delete("/conversations/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    const isParticipant = conversation.participants.some(
      (p) => p.userId.toString() === userId.toString()
    );

    const user = await User.findById(userId);
    if (!isParticipant && !user.isAdmin) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Soft delete
    conversation.isActive = false;
    await conversation.save();

    res.json({
      success: true,
      message: "Conversation deleted",
    });
  } catch (error) {
    console.error("[Chat] Delete conversation error:", error);
    res.status(500).json({ success: false, message: "Failed to delete conversation" });
  }
});

// ============================================================
// ADMIN APIs
// ============================================================

// GET /api/chat/admin/conversations - Admin view all conversations
router.get("/admin/conversations", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user.isAdmin) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const { type, search, limit = 50, skip = 0 } = req.query;

    let query = { isActive: true };

    if (type) {
      query.conversationType = type;
    }

    // Search by participant name or store name
    if (search) {
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { storeName: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      const userIds = users.map((u) => u._id);
      query["participants.userId"] = { $in: userIds };
    }

    const conversations = await Conversation.find(query)
      .sort({ updatedAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .populate("participants.userId", "name email phone storeName isVendor isAdmin")
      .populate("orderId", "orderNumber status")
      .populate("productId", "name images price")
      .lean();

    // Get total count
    const total = await Conversation.countDocuments(query);

    res.json({
      success: true,
      conversations,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
      },
    });
  } catch (error) {
    console.error("[Chat] Admin conversations error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch conversations" });
  }
});

// GET /api/chat/admin/conversations/:id - Admin view single conversation with messages
router.get("/admin/conversations/:id", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user.isAdmin) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const { id } = req.params;

    const conversation = await Conversation.findById(id)
      .populate("participants.userId", "name email phone avatar storeName isVendor isAdmin isOnline lastSeen")
      .populate("orderId")
      .populate("productId", "name images price")
      .lean();

    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    // Get messages for this conversation
    const messages = await Message.find({ conversationId: id })
      .sort({ createdAt: 1 })
      .populate("senderId", "name email phone avatar storeName isVendor")
      .lean();

    res.json({
      success: true,
      conversation,
      messages,
    });
  } catch (error) {
    console.error("[Chat] Admin conversation detail error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch conversation" });
  }
});

// GET /api/chat/admin/messages/:conversationId - Admin view messages in a conversation
router.get("/admin/messages/:conversationId", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user.isAdmin) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const { conversationId } = req.params;
    const { limit = 100, skip = 0 } = req.query;

    const messages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .populate("senderId", "name email phone storeName isVendor")
      .lean();

    // Reverse to show chronological order
    messages.reverse();

    res.json({
      success: true,
      messages,
    });
  } catch (error) {
    console.error("[Chat] Admin messages error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch messages" });
  }
});

// GET /api/chat/admin/stats - Admin chat statistics
router.get("/admin/stats", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user.isAdmin) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    // Get total conversations
    const totalConversations = await Conversation.countDocuments({ isActive: true });

    // Get total messages
    const totalMessages = await Message.countDocuments();

    // Get messages today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const messagesToday = await Message.countDocuments({ createdAt: { $gte: today } });

    // Get conversations today
    const conversationsToday = await Conversation.countDocuments({
      createdAt: { $gte: today },
      isActive: true,
    });

    // Get active users (sent messages in last 24h)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const activeUsers = await Message.distinct("senderId", { createdAt: { $gte: yesterday } });

    res.json({
      success: true,
      stats: {
        totalConversations,
        totalMessages,
        messagesToday,
        conversationsToday,
        activeUsers: activeUsers.length,
      },
    });
  } catch (error) {
    console.error("[Chat] Admin stats error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch stats" });
  }
});

module.exports = router;