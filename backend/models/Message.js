// models/Message.js - Chat message model
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    senderRole: {
      type: String,
      enum: ["customer", "vendor", "admin", "rider"],
      required: true,
    },
    messageType: {
      type: String,
      enum: ["text", "image", "file", "system"],
      default: "text",
    },
    text: {
      type: String,
      maxlength: 5000,
    },
    image: {
      url: String,
      publicId: String,
      width: Number,
      height: Number,
    },
    file: {
      url: String,
      publicId: String,
      fileName: String,
      fileSize: Number,
      mimeType: String,
    },
    readStatus: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    deliveredStatus: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        deliveredAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    metadata: {
      orderId: mongoose.Schema.Types.ObjectId,
      productId: mongoose.Schema.Types.ObjectId,
      relatedVendorId: mongoose.Schema.Types.ObjectId,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isReported: {
      type: Boolean,
      default: false,
    },
    reportReason: String,
    reportedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });
messageSchema.index({ "readStatus.userId": 1 });
messageSchema.index({ conversationId: 1, isDeleted: 1 });

// Text index for search
messageSchema.index({ text: "text" });

// Virtual for checking if message is read by user
messageSchema.methods.isReadBy = function (userId) {
  return this.readStatus.some(
    (r) => r.userId.toString() === userId.toString()
  );
};

// Virtual for checking if message is delivered to user
messageSchema.methods.isDeliveredTo = function (userId) {
  return this.deliveredStatus.some(
    (d) => d.userId.toString() === userId.toString()
  );
};

// Pre-save middleware to set delivered status
messageSchema.pre("save", function (next) {
  if (this.isNew && !this.deliveredStatus.length) {
    // Will be populated after sending
  }
  next();
});

// Static method to get messages with pagination
messageSchema.statics.getMessages = async function (
  conversationId,
  options = {}
) {
  const { limit = 50, before, after } = options;

  const query = { conversationId, isDeleted: false };

  if (before) {
    query.createdAt = { $lt: new Date(before) };
  }

  if (after) {
    query.createdAt = { $gt: new Date(after) };
  }

  const messages = await this.find(query)
    .sort({ createdAt: after ? 1 : -1 })
    .limit(limit + 1)
    .populate("senderId", "name email phone avatar")
    .lean();

  const hasMore = messages.length > limit;
  if (hasMore) {
    messages.pop();
  }

  return {
    messages: after ? messages : messages.reverse(),
    hasMore,
  };
};

// Static to mark messages as read
messageSchema.statics.markAsRead = async function (conversationId, userId) {
  // Find unread messages in conversation
  const unreadMessages = await this.find({
    conversationId,
    "readStatus.userId": { $ne: userId },
    senderId: { $ne: userId },
    isDeleted: false,
  });

  // Mark each as read
  const updatePromises = unreadMessages.map((msg) => {
    msg.readStatus.push({ userId });
    return msg.save();
  });

  await Promise.all(updatePromises);

  return unreadMessages.length;
};

module.exports = mongoose.model("Message", messageSchema);