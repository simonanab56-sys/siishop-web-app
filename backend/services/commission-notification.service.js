"use strict";

/**
 * Commission Notification Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Fires the full admin + vendor notification fan-out for a successful
 * commission payment. Called from routes/wallet.js#POST /commission/verify
 * AFTER walletService.payCommission has returned `success: true &&
 * !alreadyProcessed`. This service NEVER throws — notification failures
 * must not affect the wallet payment.
 *
 * The flow is exactly the one the user specified:
 *   1. Vendor pays via Paystack.
 *   2. Backend verifies the Paystack transaction.            (route)
 *   3. Verify the reference has not already been processed.  (route + payCommission)
 *   4. Save WalletTransaction.                              (payCommission)
 *   5. Mark commission as Paid.                             (payCommission)
 *   6. Update wallet balances.                              (payCommission)
 *   7. Save commission history.                             (= step 4)
 *   8. Create admin in-app notification.                    (this service, step 1)
 *   9. Emit Socket.IO notification.                         (this service, step 2)
 *   10. Send admin email.                                   (this service, step 3)
 *   11. Send vendor confirmation email.                     (this service, step 4)
 *
 * Idempotency — three layers of defense:
 *   1. Service-level gate: the route only calls notifyCommissionPaid
 *      when payCommission returns `!alreadyProcessed`.
 *   2. Application-level guard: notifyCommissionPaid does its own
 *      `Notification.findOne({ metadata.paymentRef, type })` check
 *      before any write.
 *   3. Database-level guarantee: a partial unique index on
 *      Notification (and on WalletTransaction) rejects E11000 on
 *      a duplicate. The service catches it and treats it as
 *      "already created" (log + return null).
 *
 * Reuse:
 *   - `sendEmail` from services/email.service.js (Nodemailer / SMTP).
 *   - `Notification` and `NotificationLog` models (same as
 *     withdrawal-notification.service.js).
 *   - `getIO` from services/socket-helper.js (new — exposes the
 *     Socket.IO `io` instance to non-route code).
 *
 * Non-reuse:
 *   - We do NOT reuse `createInAppNotification` or
 *     `sendWithdrawalEmail` from withdrawal-notification.service.js
 *     because those hardcode `referenceType: "withdrawal"`. Building
 *     parallel helpers here is cleaner than refactoring the existing
 *     service (the rule is "do not refactor unrelated modules").
 */

const User = require("../models/User");
const Notification = require("../models/Notification");
const NotificationLog = require("../models/NotificationLog");
const { sendEmail } = require("./email.service");
const { getIO } = require("./socket-helper");

/**
 * Convert pesewas (minor units) → GHS string for display.
 * @param {Number} minor
 * @returns {String} e.g. "120.00"
 */
function toGHS(minor) {
  if (typeof minor !== "number" || !Number.isFinite(minor)) return "0.00";
  return (minor / 100).toFixed(2);
}

/**
 * Map a vendorType string to a human-readable label for the email
 * body and the in-app notification message.
 * @param {String} vendorType
 * @returns {String}
 */
function formatVendorType(vendorType) {
  if (vendorType === "restaurant") return "Restaurant";
  if (vendorType === "marketplace") return "Marketplace Vendor";
  return "Vendor";
}

/**
 * Resolve the business name for a vendor, regardless of vendorType.
 * Restaurants use `restaurantDetails.restaurantName`; marketplace
 * vendors use `storeName`. `name` is the final fallback so the
 * notification is never blank.
 * @param {Object} vendor  — User doc (lean or hydrated)
 * @returns {String}
 */
function resolveBusinessName(vendor) {
  if (!vendor) return "Unknown Vendor";
  if (vendor.vendorType === "restaurant" && vendor.restaurantDetails?.restaurantName) {
    return vendor.restaurantDetails.restaurantName;
  }
  return vendor.storeName || vendor.name || "Unknown Vendor";
}

/* ─── Email & in-app helpers (private, mirrors withdrawal service) ───────── */

/**
 * Log a notification attempt to NotificationLog. Never throws.
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
      referenceType: data.referenceType || "commission",
      status: data.status || "pending",
      errorMessage: data.errorMessage,
      emailSubject: data.emailSubject,
      emailTo: data.emailTo,
      messageContent: data.messageContent,
      provider: data.provider,
      externalRef: data.externalRef,
    });
  } catch (err) {
    console.error("[COMMISSION NOTIFICATION] Failed to log:", err.message);
  }
}

/**
 * Send a commission-related email. Wraps sendEmail in try/catch and
 * logs every attempt to NotificationLog so the audit trail is queryable.
 * Never throws.
 */
async function sendCommissionEmail({ to, subject, html, trigger, referenceId, recipientUserId }) {
  try {
    await sendEmail(to, subject, html);
    await logNotification({
      type: "email",
      recipientEmail: to,
      recipientId: recipientUserId,
      trigger,
      referenceId,
      referenceType: "commission",
      status: "sent",
      emailSubject: subject,
      emailTo: to,
    });
    console.log(`[COMMISSION EMAIL] Sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`[COMMISSION EMAIL] Failed to send to ${to}:`, err.message);
    await logNotification({
      type: "email",
      recipientEmail: to,
      recipientId: recipientUserId,
      trigger,
      referenceId,
      referenceType: "commission",
      status: "failed",
      errorMessage: err.message,
      emailSubject: subject,
      emailTo: to,
    });
  }
}

/**
 * Create an in-app notification for a single recipient. Catches the
 * E11000 from the partial unique index and treats it as "already
 * created" (idempotency at the DB level).
 * Never throws.
 */
async function createCommissionInAppNotification({ userId, type, title, message, referenceId, metadata }) {
  try {
    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      referenceId,
      referenceType: "commission",
      isRead: false,
      metadata: metadata || {},
    });
    await logNotification({
      type: "in_app",
      recipientId: userId,
      trigger: type,
      referenceId,
      referenceType: "commission",
      status: "sent",
    });
    return notification;
  } catch (err) {
    // Mongo duplicate-key error — the partial unique index rejected
    // a second commission_paid notification for the same paymentRef.
    // This is the third (and final) layer of idempotency. We log
    // it and return null; the caller treats null as "already done".
    if (err && err.code === 11000) {
      console.log(`[COMMISSION NOTIFICATION] Duplicate (E11000) suppressed for user ${userId}, ref ${metadata?.paymentRef}`);
      await logNotification({
        type: "in_app",
        recipientId: userId,
        trigger: type,
        referenceId,
        referenceType: "commission",
        status: "skipped_duplicate",
        errorMessage: "E11000: partial unique index rejected duplicate paymentRef",
      });
      return null;
    }
    console.error(`[COMMISSION NOTIFICATION] Failed for user ${userId}:`, err.message);
    await logNotification({
      type: "in_app",
      recipientId: userId,
      trigger: type,
      referenceId,
      referenceType: "commission",
      status: "failed",
      errorMessage: err.message,
    });
    return null;
  }
}

/* ─── Email templates ────────────────────────────────────────────────────── */

const ADMIN_DASHBOARD_URL = process.env.ADMIN_DASHBOARD_URL || "https://siishops.com";

/**
 * Build the admin notification email. Mirrors the user-supplied example:
 * subject "New Commission Payment Received" + a clean table layout with
 * vendor name, business name, vendor type, amount paid, payment method,
 * Paystack reference, payment time, and a link to the admin dashboard.
 */
function buildAdminEmail({ vendor, businessName, vendorType, amountGHS, paymentRef, paymentDate }) {
  const vendorName = vendor?.name || "Vendor";
  const vendorTypeLabel = formatVendorType(vendorType);
  const subject = `New Commission Payment Received - ${businessName} (${vendorTypeLabel}) - GH₵${amountGHS}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #059669; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0;">SiiShop</h1>
        <p style="margin: 5px 0 0;">Commission Payment Received</p>
      </div>
      <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
        <h2 style="color: #1f2937; margin-top: 0;">New Commission Payment Received</h2>
        <p style="color: #4b5563;">Hello Admin,</p>
        <p style="color: #4b5563;">A vendor has successfully paid their commission.</p>
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; width: 40%;">Vendor</td>
              <td style="padding: 8px 0; font-weight: bold;">${escapeHtml(vendorName)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Business</td>
              <td style="padding: 8px 0;">${escapeHtml(businessName)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Vendor Type</td>
              <td style="padding: 8px 0;">${escapeHtml(vendorTypeLabel)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Commission Paid</td>
              <td style="padding: 8px 0; font-size: 18px; font-weight: bold; color: #059669;">GH₵${amountGHS}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Payment Method</td>
              <td style="padding: 8px 0;">Paystack</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Reference</td>
              <td style="padding: 8px 0; font-family: monospace; word-break: break-all;">${escapeHtml(paymentRef)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Payment Time</td>
              <td style="padding: 8px 0;">${escapeHtml(paymentDate)}</td>
            </tr>
          </table>
        </div>
        <p style="margin-top: 20px;">
          <a href="${ADMIN_DASHBOARD_URL}/admin?tab=wallets"
             style="background: #7c3aed; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Open Admin Dashboard
          </a>
        </p>
        <p style="color: #6b7280; font-size: 14px;">
          You can review this payment from the Admin Dashboard.
        </p>
      </div>
      <div style="background: #1f2937; color: #9ca3af; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px;">
        <p style="margin: 0;">SiiShop - Multi-Vendor Marketplace in Ghana</p>
      </div>
    </div>
  `;
  return { subject, html };
}

/**
 * Build the vendor confirmation email. Mirrors the user-supplied example:
 * subject "Commission Payment Successful" + a receipt summary with
 * amount, payment method, reference, and a thank-you message.
 */
function buildVendorEmail({ vendor, businessName, amountGHS, paymentRef, paymentDate }) {
  const vendorName = vendor?.name || "Vendor";
  const subject = "Commission Payment Successful";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #059669; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0;">SiiShop</h1>
        <p style="margin: 5px 0 0;">Payment Confirmation</p>
      </div>
      <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
        <h2 style="color: #1f2937; margin-top: 0;">Commission Payment Successful</h2>
        <p style="color: #4b5563;">Hello ${escapeHtml(vendorName)},</p>
        <p style="color: #4b5563;">Your commission payment has been received successfully.</p>
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #6b7280; margin-top: 0; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">Receipt Summary</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Business</td>
              <td style="padding: 8px 0; text-align: right;">${escapeHtml(businessName)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Amount</td>
              <td style="padding: 8px 0; font-size: 24px; font-weight: bold; color: #059669; text-align: right;">GH₵${amountGHS}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Payment Method</td>
              <td style="padding: 8px 0; text-align: right;">Paystack</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Reference</td>
              <td style="padding: 8px 0; text-align: right; font-family: monospace; word-break: break-all;">${escapeHtml(paymentRef)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Payment Date</td>
              <td style="padding: 8px 0; text-align: right;">${escapeHtml(paymentDate)}</td>
            </tr>
          </table>
        </div>
        <p style="color: #4b5563;">
          Thank you for keeping your account in good standing.
        </p>
        <p style="color: #6b7280; font-size: 14px;">
          You can review all your wallet activity in your Vendor Dashboard.
        </p>
      </div>
      <div style="background: #1f2937; color: #9ca3af; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px;">
        <p style="margin: 0;">Need help? Contact us at support@siishops.com</p>
      </div>
    </div>
  `;
  return { subject, html };
}

/**
 * Minimal HTML escape for user-supplied strings interpolated into
 * email templates. Protects against stored XSS via business/store
 * names. (name, storeName, restaurantDetails.restaurantName are
 * all user-editable.)
 */
function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ─── Admin / vendor lookups (private) ───────────────────────────────────── */

async function getAdminUsers() {
  return User.find({ isAdmin: true }).select("_id email name").lean();
}

async function getVendorForNotification(vendorId) {
  // Project the fields we need: name + email for emails,
  // storeName / restaurantDetails for business name, vendorType
  // for the email/notification label.
  return User.findById(vendorId)
    .select("name email storeName vendorType restaurantDetails")
    .lean();
}

/* ─── Public entry point ─────────────────────────────────────────────────── */

/**
 * Fire the full commission-paid notification fan-out.
 *
 * Called from routes/wallet.js#POST /commission/verify, AFTER
 * `payCommission` has returned `success: true && !alreadyProcessed`.
 * This function is fire-and-forget at the call site and never throws.
 *
 * Side effects (in order):
 *   1. Application-level idempotency check on Notification.paymentRef.
 *   2. Create in-app Notification per admin.
 *   3. Emit Socket.IO `admin-notify-room-broadcast` to the room.
 *   4. Send admin email per admin.
 *   5. Send vendor confirmation email.
 *
 * @param {Object} params
 * @param {String|ObjectId} params.vendorId
 * @param {Number} params.amount            — GHS (major units)
 * @param {String} params.paymentRef        — Paystack reference
 * @param {String|ObjectId} params.transactionId — WalletTransaction _id (for referenceId)
 */
async function notifyCommissionPaid({ vendorId, amount, paymentRef, transactionId }) {
  try {
    if (!paymentRef) {
      console.warn("[COMMISSION NOTIFICATION] Missing paymentRef — skipping fan-out");
      return;
    }
    if (!vendorId) {
      console.warn("[COMMISSION NOTIFICATION] Missing vendorId — skipping fan-out");
      return;
    }

    // Layer 2 of idempotency: short-circuit if a commission_paid
    // notification for this paymentRef already exists. The route's
    // alreadyProcessed gate (layer 1) should have caught this, but
    // a race could slip through. The DB partial unique index
    // (layer 3) is the ultimate guarantee.
    const existing = await Notification.findOne({
      type: "commission_paid",
      "metadata.paymentRef": paymentRef,
    }).select("_id").lean();
    if (existing) {
      console.log(`[COMMISSION NOTIFICATION] Skipping (already exists for ref ${paymentRef})`);
      return;
    }

    // Look up vendor + admins in parallel.
    const [vendor, admins] = await Promise.all([
      getVendorForNotification(vendorId),
      getAdminUsers(),
    ]);

    if (!vendor) {
      console.warn(`[COMMISSION NOTIFICATION] Vendor ${vendorId} not found — skipping fan-out`);
      return;
    }
    if (!admins || admins.length === 0) {
      console.warn("[COMMISSION NOTIFICATION] No admin users found — skipping email fan-out but DB notification may still be created");
    }

    const businessName = resolveBusinessName(vendor);
    const vendorType = vendor.vendorType || "marketplace";
    const amountGHS = typeof amount === "number" ? amount.toFixed(2) : "0.00";
    const paymentDate = new Date().toLocaleString("en-GB", {
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

    // The metadata blob is stored on the Notification AND sent in
    // the Socket.IO payload — the bell uses it to render the row
    // without an extra API call.
    const metadata = {
      paymentRef,
      paymentMethod: "paystack",
      vendorId: String(vendorId),
      vendorName: vendor.name || "",
      businessName,
      vendorType,
      amount: amountGHS,
      amountNumber: typeof amount === "number" ? amount : 0,
      paymentDate,
    };

    // Step 1: in-app notification per admin.
    // We do this in parallel — the createCommissionInAppNotification
    // helper is wrapped in try/catch and returns null on failure.
    const inAppResults = await Promise.all(
      admins.map((admin) =>
        createCommissionInAppNotification({
          userId: admin._id,
          type: "commission_paid",
          title: "Commission Payment Received",
          message: `${businessName} (${formatVendorType(vendorType)}) paid GH₵${amountGHS} via Paystack`,
          referenceId: transactionId,
          metadata,
        })
      )
    );
    const inAppCreated = inAppResults.filter(Boolean).length;
    console.log(`[COMMISSION NOTIFICATION] Created ${inAppCreated}/${admins.length} in-app notifications for ref ${paymentRef}`);

    // Step 2: live Socket.IO push. The admin frontend listens for
    // this event and refreshes the bell badge immediately (see
    // NotificationBell.jsx and AdminDashboard.jsx).
    try {
      const io = getIO();
      if (io) {
        io.to("admin-notify-room").emit("admin-notify-room-broadcast", {
          type: "commission_paid",
          payload: metadata,
          emittedAt: new Date().toISOString(),
        });
        console.log(`[COMMISSION NOTIFICATION] Socket.IO push emitted to admin-notify-room`);
      } else {
        // Non-fatal — DB notifications + emails are still sent.
        // This branch is hit only when the server hasn't bootstrapped
        // socket-helper (e.g. in unit tests).
        console.log(`[COMMISSION NOTIFICATION] Socket.IO not available (no io instance) — skipping live push`);
      }
    } catch (ioErr) {
      console.error(`[COMMISSION NOTIFICATION] Socket.IO emit failed:`, ioErr.message);
    }

    // Step 3: admin email fan-out. Built once, sent to each admin.
    if (admins.length > 0) {
      const adminEmail = buildAdminEmail({
        vendor,
        businessName,
        vendorType,
        amountGHS,
        paymentRef,
        paymentDate,
      });
      await Promise.all(
        admins.map((admin) =>
          sendCommissionEmail({
            to: admin.email,
            subject: adminEmail.subject,
            html: adminEmail.html,
            trigger: "commission_paid",
            referenceId: transactionId,
            recipientUserId: admin._id,
          })
        )
      );
    }

    // Step 4: vendor confirmation email. The user spec asks for an
    // email only (not an in-app notification) for the vendor.
    if (vendor.email) {
      const vendorEmail = buildVendorEmail({
        vendor,
        businessName,
        amountGHS,
        paymentRef,
        paymentDate,
      });
      await sendCommissionEmail({
        to: vendor.email,
        subject: vendorEmail.subject,
        html: vendorEmail.html,
        trigger: "commission_paid",
        referenceId: transactionId,
        recipientUserId: vendor._id,
      });
    } else {
      console.warn(`[COMMISSION NOTIFICATION] Vendor ${vendorId} has no email — vendor confirmation skipped`);
    }

    console.log(
      `[COMMISSION NOTIFICATION] Fan-out complete for ref ${paymentRef}: ` +
      `${inAppCreated} in-app, ${admins.length} admin emails, ` +
      `vendor email: ${vendor.email ? "yes" : "no"}`
    );
  } catch (err) {
    // Outer catch — never throw. Notification failures must not
    // affect the wallet payment (which has already been committed).
    console.error("[COMMISSION NOTIFICATION] Unexpected error in notifyCommissionPaid:", err.message);
    console.error(err.stack);
  }
}

module.exports = {
  notifyCommissionPaid,
  // Exported for unit tests (buildAdminEmail / buildVendorEmail are
  // pure functions of their inputs).
  buildAdminEmail,
  buildVendorEmail,
  formatVendorType,
  resolveBusinessName,
};
