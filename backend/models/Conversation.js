// models/Conversation.js - Chat conversation model
const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        role: {
          type: String,
          enum: ["customer", "vendor", "admin", "rider"],
          required: true,
        },
      },
    ],
    conversationType: {
      type: String,
      enum: ["direct", "order", "product", "support", "delivery"],
      default: "direct",
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    lastMessage: {
      text: String,
      senderId: mongoose.Schema.Types.ObjectId,
      messageType: {
        type: String,
        enum: ["text", "image", "file", "system"],
        default: "text",
      },
      createdAt: Date,
    },
    unreadCounts: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        count: {
          type: Number,
          default: 0,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    blockReason: String,
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
conversationSchema.index({ participants: 1 });
conversationSchema.index({ orderId: 1 });
conversationSchema.index({ productId: 1 });
conversationSchema.index({ "participants.userId": 1 });
conversationSchema.index({ updatedAt: -1 });
conversationSchema.index({ isActive: 1, isBlocked: 1 });

// Virtual for getting participant IDs
conversationSchema.virtual("participantIds").get(function () {
  return this.participants.map((p) => p.userId.toString());
});

// Method to get other participant
conversationSchema.methods.getOtherParticipant = function (userId) {
  return this.participants.find(
    (p) => p.userId.toString() !== userId.toString()
  );
};

// Method to reset unread count for user
conversationSchema.methods.resetUnreadFor = function (userId) {
  const unreadEntry = this.unreadCounts.find(
    (u) => u.userId.toString() === userId.toString()
  );
  if (unreadEntry) {
    unreadEntry.count = 0;
  }
  return this;
};

// Static to find or create conversation
conversationSchema.statics.findOrCreate = async function (participants, options = {}) {
  const { conversationType = "direct", orderId, productId } = options;

  // Sort participants to ensure consistent lookup
  const sortedParticipants = [...participants].sort(
    (a, b) => a.userId.toString().localeCompare(b.userId.toString())
  );

  // Build query
  const query = {
    participants: {
      $all: sortedParticipants.map((p) => ({
        userId: p.userId,
        role: p.role,
      })),
    },
    conversationType,
  };

  if (orderId) query.orderId = orderId;
  if (productId) query.productId = productId;

  let conversation = await this.findOne(query);

  if (!conversation) {
    conversation = await this.create({
      participants: sortedParticipants,
      conversationType,
      orderId,
      productId,
      unreadCounts: sortedParticipants.map((p) => ({
        userId: p.userId,
        count: 0,
      })),
    });
  }

  return conversation;
};

module.exports = mongoose.model("Conversation", conversationSchema);