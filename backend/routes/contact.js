"use strict";

const router = require("express").Router();
const nodemailer = require("nodemailer");

// Contact form submission
router.post("/", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ error: "Name, email, and message are required" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    // Log the contact form submission (in production, you'd send an email)
    console.log("[CONTACT FORM] New message from:", name, email);
    console.log("[CONTACT FORM] Message:", message);

    // If email is configured, send notification
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT || 587,
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: process.env.SMTP_USER, // Send to admin
          subject: `New Contact Form: ${name}`,
          text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
        });
        console.log("[CONTACT FORM] Email sent successfully");
      } catch (emailErr) {
        console.error("[CONTACT FORM] Email error:", emailErr.message);
        // Don't fail the request if email fails
      }
    }

    res.json({ success: true, message: "Message received. We'll get back to you soon!" });
  } catch (err) {
    console.error("[CONTACT FORM] Error:", err.message);
    res.status(500).json({ error: "Failed to send message" });
  }
});

module.exports = router;