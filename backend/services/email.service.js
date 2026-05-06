"use strict";

const nodemailer = require("nodemailer");

/**
 * Email Service using Nodemailer
 * Supports Gmail SMTP and generic SMTP
 */

let transporter = null;

function initTransporter() {
  if (transporter) return transporter;

  // Check if Gmail credentials are provided
  if (process.env.GMAIL_USER && process.env.GMAIL_PASSWORD) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASSWORD, // Use App Password for Gmail
      },
    });
    console.log("✅ Email service initialized with Gmail SMTP");
  } else if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
    // Generic SMTP fallback
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER && process.env.SMTP_PASSWORD ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      } : undefined,
    });
    console.log("✅ Email service initialized with generic SMTP");
  } else {
    console.warn("⚠️  Email credentials not configured. Emails will be logged only.");
    // Dev mode: log emails instead of sending
    transporter = {
      sendMail: async (options) => {
        console.log("[DEV MODE] Email would be sent:", {
          to: options.to,
          subject: options.subject,
          html: options.html,
        });
        return { messageId: "dev-mode-" + Date.now() };
      },
    };
  }

  return transporter;
}

/**
 * Send a password reset email
 * @param {string} email - Recipient email
 * @param {string} resetToken - Reset token
 * @param {string} resetLink - Full reset link URL
 */
async function sendPasswordResetEmail(email, resetToken, resetLink) {
  try {
    const trans = initTransporter();

    const mailOptions = {
      from: process.env.GMAIL_USER || process.env.SMTP_FROM || "noreply@foodapp.com",
      to: email,
      subject: "Password Reset Request - SiiShop",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hello,</p>
          <p>We received a request to reset your password. Click the link below to proceed:</p>
          <p style="margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </p>
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #666; font-size: 12px;">${resetLink}</p>
          <p style="color: #999; font-size: 12px;">This link will expire in 15 minutes.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #999; font-size: 12px;">If you didn't request this, please ignore this email.</p>
        </div>
      `,
      text: `Password Reset Request\n\nClick here to reset your password: ${resetLink}\n\nThis link will expire in 15 minutes.`,
    };

    const result = await trans.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to ${email}`);
    return result;
  } catch (err) {
    console.error(`❌ Failed to send password reset email to ${email}:`, err.message);
    throw new Error("Failed to send reset email");
  }
}

/**
 * Send a generic email
 */
async function sendEmail(to, subject, html, text) {
  try {
    const trans = initTransporter();

    const result = await trans.sendMail({
      from: process.env.GMAIL_USER || process.env.SMTP_FROM || "noreply@foodapp.com",
      to,
      subject,
      html,
      text,
    });

    console.log(`✅ Email sent to ${to}`);
    return result;
  } catch (err) {
    console.error(`❌ Failed to send email to ${to}:`, err.message);
    throw err;
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendEmail,
  initTransporter,
};
