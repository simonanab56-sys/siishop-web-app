/**
 * Withdrawal Notification Service
 *
 * Handles email, in-app, SMS, and WhatsApp notifications for withdrawal events.
 * Uses existing email service. Future-ready for SMS/WhatsApp integration.
 *
 * NEVER fails withdrawal processing due to notification errors.
 */

const mongoose = require("mongoose");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const Notification = require("../models/Notification");
const NotificationLog = require("../models/NotificationLog");
const { sendEmail } = require("./email.service");

// Large withdrawal threshold (GHS)
const LARGE_WITHDRAWAL_THRESHOLD = 5000;

// Helper: Convert to GHS for display
const toGHS = (minor) => minor / 100;

/**
 * Log notification attempt (for audit)
 */
async function logNotification(data) {
  try {
    await NotificationLog.create({
      type: data.type,
      recipientId: data.recipientId,
      recipientEmail: data.recipientEmail,
      recipientPhone: data.recipientPhone,
      trigger: data.trigger,
      referenceId: data.referenceId,
      referenceType: data.referenceType,
      status: data.status || "pending",
      errorMessage: data.errorMessage,
      emailSubject: data.emailSubject,
      emailTo: data.emailTo,
      messageContent: data.messageContent,
      provider: data.provider,
      externalRef: data.externalRef,
    });
  } catch (err) {
    console.error("[NOTIFICATION] Failed to log:", err.message);
  }
}

/**
 * Send email notification (wrapped in try/catch - never fails)
 */
async function sendWithdrawalEmail(to, subject, html, trigger, referenceId) {
  try {
    await sendEmail(to, subject, html);
    await logNotification({
      type: "email",
      recipientEmail: to,
      trigger,
      referenceId,
      referenceType: "withdrawal",
      status: "sent",
      emailSubject: subject,
      emailTo: to,
    });
    console.log(`[WITHDRAWAL EMAIL] Sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`[WITHDRAWAL EMAIL] Failed to send to ${to}:`, err.message);
    await logNotification({
      type: "email",
      recipientEmail: to,
      trigger,
      referenceId,
      referenceType: "withdrawal",
      status: "failed",
      errorMessage: err.message,
      emailSubject: subject,
      emailTo: to,
    });
  }
}

/**
 * Create in-app notification (wrapped in try/catch)
 */
async function createInAppNotification(userId, type, title, message, referenceId, metadata = {}) {
  try {
    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      referenceId,
      referenceType: "withdrawal",
      metadata,
    });
    await logNotification({
      type: "in_app",
      recipientId: userId,
      trigger: type,
      referenceId,
      referenceType: "withdrawal",
      status: "sent",
    });
    console.log(`[IN-APP NOTIFICATION] Created for user ${userId}: ${title}`);
    return notification;
  } catch (err) {
    console.error(`[IN-APP NOTIFICATION] Failed for user ${userId}:`, err.message);
    await logNotification({
      type: "in_app",
      recipientId: userId,
      trigger: type,
      referenceId,
      referenceType: "withdrawal",
      status: "failed",
      errorMessage: err.message,
    });
    return null;
  }
}

/**
 * Future: Send SMS notification
 * Placeholder for Hubtel, Arkesel, Twilio, etc.
 */
async function sendSMS(phone, message, trigger, referenceId) {
  // TODO: Integrate with SMS provider
  console.log(`[SMS] Would send to ${phone}: ${message}`);
  await logNotification({
    type: "sms",
    recipientPhone: phone,
    trigger,
    referenceId,
    referenceType: "withdrawal",
    status: "pending",
    messageContent: message,
  });
}

/**
 * Future: Send WhatsApp notification
 * Placeholder for Meta Cloud API, Twilio, Hubtel
 */
async function sendWhatsApp(phone, message, trigger, referenceId) {
  // TODO: Integrate with WhatsApp provider
  console.log(`[WhatsApp] Would send to ${phone}: ${message}`);
  await logNotification({
    type: "whatsapp",
    recipientPhone: phone,
    trigger,
    referenceId,
    referenceType: "withdrawal",
    status: "pending",
    messageContent: message,
  });
}

/**
 * Get admin emails
 */
async function getAdminEmails() {
  const admins = await User.find({ isAdmin: true })
    .select("email")
    .lean();
  return admins.map(a => a.email).filter(Boolean);
}

/**
 * Get vendor details
 */
async function getVendorDetails(vendorId) {
  const vendor = await User.findById(vendorId)
    .select("name email storeName phoneNumber")
    .lean();
  return vendor;
}

/**
 * Build withdrawal request email template
 */
function buildWithdrawalRequestEmail(vendor, withdrawal, type = "vendor") {
  const amount = toGHS(withdrawal.amount);
  const methodLabel = withdrawal.method === "mobile_money" ? "Mobile Money" : "Bank Transfer";
  const method = withdrawal.method === "mobile_money" ? withdrawal.mobileMoneyDetails : withdrawal.bankDetails;
  const id = String(withdrawal._id).slice(-8).toUpperCase();
  const date = new Date(withdrawal.createdAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
  });

  if (type === "admin") {
    return {
      subject: `New Withdrawal Request - ₵${amount} from ${vendor.storeName || vendor.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #7c3aed; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">SiiShop</h1>
            <p style="margin: 5px 0 0;">Withdrawal Request</p>
          </div>
          <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
            <h2 style="color: #1f2937; margin-top: 0;">New Withdrawal Request</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Vendor Name</td>
                <td style="padding: 8px 0; font-weight: bold;">${vendor.name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Store Name</td>
                <td style="padding: 8px 0;">${vendor.storeName || "N/A"}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Email</td>
                <td style="padding: 8px 0;">${vendor.email}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Amount</td>
                <td style="padding: 8px 0; font-size: 18px; font-weight: bold; color: #059669;">₵${amount}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Method</td>
                <td style="padding: 8px 0;">${methodLabel}</td>
              </tr>
              ${withdrawal.method === "mobile_money" ? `
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Provider</td>
                <td style="padding: 8px 0; text-transform: uppercase;">${method?.provider}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Phone</td>
                <td style="padding: 8px 0;">${method?.phoneNumber}</td>
              </tr>
              ` : `
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Bank</td>
                <td style="padding: 8px 0;">${method?.bankName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Account</td>
                <td style="padding: 8px 0;">${method?.accountNumber} (${method?.accountName})</td>
              </tr>
              `}
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Request ID</td>
                <td style="padding: 8px 0; font-family: monospace;">WD-${id}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Date</td>
                <td style="padding: 8px 0;">${date}</td>
              </tr>
            </table>
            <p style="margin-top: 20px; color: #6b7280; font-size: 14px;">
              Please review this request in the SiiShop Admin Dashboard.
            </p>
          </div>
          <div style="background: #1f2937; color: #9ca3af; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px;">
            <p style="margin: 0;">SiiShop - Multi-Vendor Marketplace in Ghana</p>
          </div>
        </div>
      `,
    };
  }

  // Vendor email
  return {
    subject: `Withdrawal Request Received - ₵${amount}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #7c3aed; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0;">SiiShop</h1>
          <p style="margin: 5px 0 0;">Withdrawal Request</p>
        </div>
        <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
          <h2 style="color: #1f2937; margin-top: 0;">Your withdrawal request has been received!</h2>
          <p style="color: #4b5563;">Hello ${vendor.name || vendor.storeName},</p>
          <p style="color: #4b5563;">Your withdrawal request is now pending review.</p>
          <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <table style="width: 100%;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Amount</td>
                <td style="padding: 8px 0; font-size: 24px; font-weight: bold; color: #059669; text-align: right;">₵${amount}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Method</td>
                <td style="padding: 8px 0; text-align: right;">${methodLabel}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Request ID</td>
                <td style="padding: 8px 0; text-align: right; font-family: monospace;">WD-${id}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Status</td>
                <td style="padding: 8px 0; text-align: right;"><span style="background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold;">PENDING</span></td>
              </tr>
            </table>
          </div>
          <p style="color: #6b7280; font-size: 14px;">
            We'll notify you once your request is reviewed. You can also check the status in your Vendor Dashboard.
          </p>
        </div>
        <div style="background: #1f2937; color: #9ca3af; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px;">
          <p style="margin: 0;">Need help? Contact us at support@siishops.com</p>
        </div>
      </div>
    `,
  };
}

/**
 * Build withdrawal status update email
 */
function buildStatusEmail(vendor, withdrawal, status, reason = null) {
  const amount = toGHS(withdrawal.amount);
  const id = String(withdrawal._id).slice(-8).toUpperCase();
  const date = new Date(withdrawal.updatedAt || withdrawal.createdAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
  });

  const statusConfig = {
    approved: {
      subject: `Withdrawal Approved - ₵${amount}`,
      title: "Withdrawal Approved!",
      badge: "APPROVED",
      badgeColor: "#059669",
      message: "Your withdrawal request has been approved and will be processed shortly.",
    },
    processing: {
      subject: `Withdrawal Processing - ₵${amount}`,
      title: "Withdrawal Being Processed",
      badge: "PROCESSING",
      badgeColor: "#2563eb",
      message: "Your withdrawal is currently being processed. You will receive payment soon.",
    },
    completed: {
      subject: `Withdrawal Completed - ₵${amount}`,
      title: "Withdrawal Completed!",
      badge: "COMPLETED",
      badgeColor: "#059669",
      message: `Your withdrawal of ₵${amount} has been successfully paid to your account.`,
    },
    rejected: {
      subject: `Withdrawal Rejected - ₵${amount}`,
      title: "Withdrawal Request Rejected",
      badge: "REJECTED",
      badgeColor: "#dc2626",
      message: reason ? `Reason: ${reason}` : "Your withdrawal request has been rejected.",
    },
  };

  const config = statusConfig[status];
  if (!config) return null;

  return {
    subject: config.subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #7c3aed; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0;">SiiShop</h1>
          <p style="margin: 5px 0 0;">Withdrawal Update</p>
        </div>
        <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
          <h2 style="color: #1f2937; margin-top: 0;">${config.title}</h2>
          <p style="color: #4b5563;">Hello ${vendor.name || vendor.storeName},</p>
          <p style="color: #4b5563;">${config.message}</p>
          <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <table style="width: 100%;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Amount</td>
                <td style="padding: 8px 0; font-size: 24px; font-weight: bold; color: #059669; text-align: right;">₵${amount}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Request ID</td>
                <td style="padding: 8px 0; text-align: right; font-family: monospace;">WD-${id}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Status</td>
                <td style="padding: 8px 0; text-align: right;"><span style="background: ${config.badgeColor}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold;">${config.badge}</span></td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Date</td>
                <td style="padding: 8px 0; text-align: right;">${date}</td>
              </tr>
              ${reason ? `
              <tr>
                <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Reason</td>
                <td style="padding: 8px 0; text-align: right; color: #dc2626;">${reason}</td>
              </tr>
              ` : ""}
            </table>
          </div>
          <p style="color: #6b7280; font-size: 14px;">
            You can track all your withdrawals in your Vendor Dashboard.
          </p>
        </div>
        <div style="background: #1f2937; color: #9ca3af; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px;">
          <p style="margin: 0;">Need help? Contact us at support@siishops.com</p>
        </div>
      </div>
    `,
  };
}

/**
 * Notify withdrawal submitted
 */
async function notifyWithdrawalSubmitted(withdrawal) {
  try {
    const vendor = await getVendorDetails(withdrawal.vendorId);
    if (!vendor) return;

    const amount = toGHS(withdrawal.amount);
    const isLarge = amount >= LARGE_WITHDRAWAL_THRESHOLD;
    const id = String(withdrawal._id).slice(-8).toUpperCase();

    // 1. Email to vendor
    const vendorEmail = buildWithdrawalRequestEmail(vendor, withdrawal, "vendor");
    await sendWithdrawalEmail(vendor.email, vendorEmail.subject, vendorEmail.html, "withdrawal_submitted", withdrawal._id);

    // 2. In-app notification to vendor
    await createInAppNotification(
      withdrawal.vendorId,
      "withdrawal_submitted",
      "Withdrawal Request Submitted",
      `Your withdrawal request of ₵${amount} has been submitted and is pending review.`,
      withdrawal._id,
      { amount, method: withdrawal.method }
    );

    // 3. Email to admin(s)
    const adminEmails = await getAdminEmails();
    const adminEmail = buildWithdrawalRequestEmail(vendor, withdrawal, "admin");
    for (const email of adminEmails) {
      await sendWithdrawalEmail(email, adminEmail.subject, adminEmail.html, "withdrawal_submitted", withdrawal._id);
    }

    // 4. In-app notification to admins
    const admins = await User.find({ isAdmin: true }).select("_id").lean();
    for (const admin of admins) {
      await createInAppNotification(
        admin._id,
        "withdrawal_submitted",
        isLarge ? "High Value Withdrawal Request" : "New Withdrawal Request",
        `${vendor.storeName || vendor.name} requested ₵${amount} withdrawal${isLarge ? " (LARGE)" : ""}`,
        withdrawal._id,
        { amount, vendorName: vendor.storeName || vendor.name, isLarge }
      );
    }

    // 5. SMS for large withdrawals (future)
    if (isLarge && vendor.phoneNumber) {
      await sendSMS(
        vendor.phoneNumber,
        `SiiShop: Large withdrawal request of ₵${amount} submitted. Ref: WD-${id}`,
        "withdrawal_submitted",
        withdrawal._id
      );
    }

    console.log(`[WITHDRAWAL NOTIFICATION] Submitted: WD-${id}, Amount: ₵${amount}`);
  } catch (err) {
    console.error("[WITHDRAWAL NOTIFICATION] Error in notifyWithdrawalSubmitted:", err.message);
    // Never throw - don't break withdrawal processing
  }
}

/**
 * Notify withdrawal approved
 */
async function notifyWithdrawalApproved(withdrawal) {
  try {
    const vendor = await getVendorDetails(withdrawal.vendorId);
    if (!vendor) return;

    const emailData = buildStatusEmail(vendor, withdrawal, "approved");
    if (emailData) {
      await sendWithdrawalEmail(vendor.email, emailData.subject, emailData.html, "withdrawal_approved", withdrawal._id);
    }

    await createInAppNotification(
      withdrawal.vendorId,
      "withdrawal_approved",
      "Withdrawal Approved",
      `Your withdrawal of ₵${toGHS(withdrawal.amount)} has been approved.`,
      withdrawal._id,
      { amount: withdrawal.amount }
    );

    console.log(`[WITHDRAWAL NOTIFICATION] Approved: WD-${String(withdrawal._id).slice(-8).toUpperCase()}`);
  } catch (err) {
    console.error("[WITHDRAWAL NOTIFICATION] Error in notifyWithdrawalApproved:", err.message);
  }
}

/**
 * Notify withdrawal processing
 */
async function notifyWithdrawalProcessing(withdrawal) {
  try {
    const vendor = await getVendorDetails(withdrawal.vendorId);
    if (!vendor) return;

    const emailData = buildStatusEmail(vendor, withdrawal, "processing");
    if (emailData) {
      await sendWithdrawalEmail(vendor.email, emailData.subject, emailData.html, "withdrawal_processing", withdrawal._id);
    }

    await createInAppNotification(
      withdrawal.vendorId,
      "withdrawal_processing",
      "Withdrawal Processing",
      `Your withdrawal of ₵${toGHS(withdrawal.amount)} is being processed.`,
      withdrawal._id,
      { amount: withdrawal.amount }
    );

    console.log(`[WITHDRAWAL NOTIFICATION] Processing: WD-${String(withdrawal._id).slice(-8).toUpperCase()}`);
  } catch (err) {
    console.error("[WITHDRAWAL NOTIFICATION] Error in notifyWithdrawalProcessing:", err.message);
  }
}

/**
 * Notify withdrawal completed
 */
async function notifyWithdrawalCompleted(withdrawal) {
  try {
    const vendor = await getVendorDetails(withdrawal.vendorId);
    if (!vendor) return;

    const id = String(withdrawal._id).slice(-8).toUpperCase();
    const emailData = buildStatusEmail(vendor, withdrawal, "completed");
    if (emailData) {
      await sendWithdrawalEmail(vendor.email, emailData.subject, emailData.html, "withdrawal_completed", withdrawal._id);
    }

    await createInAppNotification(
      withdrawal.vendorId,
      "withdrawal_completed",
      "Withdrawal Completed",
      `Your withdrawal of ₵${toGHS(withdrawal.amount)} has been completed successfully.`,
      withdrawal._id,
      { amount: withdrawal.amount }
    );

    // SMS notification (future-ready)
    if (vendor.phoneNumber) {
      await sendSMS(
        vendor.phoneNumber,
        `SiiShop: Your withdrawal of ₵${toGHS(withdrawal.amount)} has been completed. Ref: WD-${id}`,
        "withdrawal_completed",
        withdrawal._id
      );

      await sendWhatsApp(
        vendor.phoneNumber,
        `Hello ${vendor.name},\n\nYour SiiShop withdrawal request of ₵${toGHS(withdrawal.amount)} has been completed successfully.\n\nReference: WD-${id}\n\nThank you for using SiiShop.`,
        "withdrawal_completed",
        withdrawal._id
      );
    }

    console.log(`[WITHDRAWAL NOTIFICATION] Completed: WD-${id}`);
  } catch (err) {
    console.error("[WITHDRAWAL NOTIFICATION] Error in notifyWithdrawalCompleted:", err.message);
  }
}

/**
 * Notify withdrawal rejected
 */
async function notifyWithdrawalRejected(withdrawal, reason) {
  try {
    const vendor = await getVendorDetails(withdrawal.vendorId);
    if (!vendor) return;

    const emailData = buildStatusEmail(vendor, withdrawal, "rejected", reason);
    if (emailData) {
      await sendWithdrawalEmail(vendor.email, emailData.subject, emailData.html, "withdrawal_rejected", withdrawal._id);
    }

    await createInAppNotification(
      withdrawal.vendorId,
      "withdrawal_rejected",
      "Withdrawal Rejected",
      `Your withdrawal of ₵${toGHS(withdrawal.amount)} has been rejected. ${reason ? `Reason: ${reason}` : ""}`,
      withdrawal._id,
      { amount: withdrawal.amount, reason }
    );

    // SMS notification (future-ready)
    if (vendor.phoneNumber) {
      await sendSMS(
        vendor.phoneNumber,
        `SiiShop: Your withdrawal of ₵${toGHS(withdrawal.amount)} has been rejected. Ref: WD-${String(withdrawal._id).slice(-8).toUpperCase()}`,
        "withdrawal_rejected",
        withdrawal._id
      );
    }

    console.log(`[WITHDRAWAL NOTIFICATION] Rejected: WD-${String(withdrawal._id).slice(-8).toUpperCase()}, Reason: ${reason}`);
  } catch (err) {
    console.error("[WITHDRAWAL NOTIFICATION] Error in notifyWithdrawalRejected:", err.message);
  }
}

/**
 * Get user notifications
 */
async function getUserNotifications(userId, options = {}) {
  const { page = 1, limit = 20, unreadOnly = false } = options;
  const skip = (page - 1) * limit;

  const filter = { userId };
  if (unreadOnly) {
    filter.isRead = false;
  }

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId, isRead: false }),
  ]);

  return {
    notifications,
    unreadCount,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

/**
 * Mark notification as read
 */
async function markAsRead(notificationId, userId) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  );
  return notification;
}

/**
 * Mark all notifications as read
 */
async function markAllAsRead(userId) {
  const result = await Notification.updateMany(
    { userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return { modifiedCount: result.modifiedCount };
}

module.exports = {
  notifyWithdrawalSubmitted,
  notifyWithdrawalApproved,
  notifyWithdrawalProcessing,
  notifyWithdrawalCompleted,
  notifyWithdrawalRejected,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  LARGE_WITHDRAWAL_THRESHOLD,
  // Future-ready exports
  sendSMS,
  sendWhatsApp,
};