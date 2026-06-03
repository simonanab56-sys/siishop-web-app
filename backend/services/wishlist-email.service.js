"use strict";

const nodemailer = require("nodemailer");

let transporter = null;

function initTransporter() {
  if (transporter) return transporter;

  if (process.env.GMAIL_USER && process.env.GMAIL_PASSWORD) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASSWORD,
      },
    });
  } else if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER && process.env.SMTP_PASSWORD ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      } : undefined,
    });
  } else {
    transporter = {
      sendMail: async (options) => {
        console.log("[DEV MODE] Wishlist email would be sent:", {
          to: options.to,
          subject: options.subject,
        });
        return { messageId: "dev-mode-" + Date.now() };
      },
    };
  }

  return transporter;
}

// Price Drop Email Template
async function sendWishlistPriceDropEmail(email, data) {
  const { productName, oldPrice, newPrice, savings, productUrl } = data;
  const trans = initTransporter();

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 30px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🔥 Price Drop Alert!</h1>
        </div>

        <!-- Content -->
        <div style="padding: 30px;">
          <p style="color: #333333; font-size: 16px; margin-bottom: 20px;">Hello,</p>

          <p style="color: #333333; font-size: 16px;">
            Great news! A product on your wishlist has dropped in price.
          </p>

          <!-- Product Card -->
          <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
            <h3 style="color: #1c1917; margin: 0 0 15px 0; font-size: 18px;">${productName}</h3>

            <div style="display: flex; align-items: center; justify-content: center; gap: 15px;">
              <div style="text-align: center;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0 0 5px 0;">Previous Price</p>
                <p style="color: #9ca3af; font-size: 16px; margin: 0; text-decoration: line-through;">₵${oldPrice.toFixed(2)}</p>
              </div>

              <div style="color: #22c55e; font-size: 24px;">→</div>

              <div style="text-align: center;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0 0 5px 0;">Current Price</p>
                <p style="color: #16a34a; font-size: 20px; margin: 0; font-weight: bold;">₵${newPrice.toFixed(2)}</p>
              </div>
            </div>

            <div style="background-color: #22c55e; color: white; text-align: center; padding: 10px; border-radius: 8px; margin-top: 15px;">
              <strong>You save ₵${savings.toFixed(2)}!</strong>
            </div>
          </div>

          <!-- CTA Button -->
          <div style="text-align: center; margin-top: 25px;">
            <a href="${productUrl}" style="display: inline-block; background-color: #f97316; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
              Shop Now
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            You're receiving this email because you have price drop notifications enabled for your wishlist.
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0 0;">
            © ${new Date().getFullYear()} SiiShop. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: process.env.GMAIL_USER || process.env.SMTP_FROM || "noreply@siishop.com",
    to: email,
    subject: `🔥 Price Drop Alert: ${productName} is now cheaper!`,
    html,
  };

  return trans.sendMail(mailOptions);
}

// Back In Stock Email Template
async function sendBackInStockEmail(email, data) {
  const { productName, productUrl } = data;
  const trans = initTransporter();

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 30px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🎉 Back In Stock!</h1>
        </div>

        <!-- Content -->
        <div style="padding: 30px;">
          <p style="color: #333333; font-size: 16px; margin-bottom: 20px;">Hello,</p>

          <p style="color: #333333; font-size: 16px;">
            Good news! A product on your wishlist is now available again.
          </p>

          <!-- Product Card -->
          <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb; text-align: center;">
            <h3 style="color: #1c1917; margin: 0 0 10px 0; font-size: 18px;">${productName}</h3>
            <p style="color: #22c55e; font-size: 14px; margin: 0; font-weight: bold;">✓ Available Now</p>
          </div>

          <!-- CTA Button -->
          <div style="text-align: center; margin-top: 25px;">
            <a href="${productUrl}" style="display: inline-block; background-color: #22c55e; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
              Shop Now
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            You're receiving this email because you have back-in-stock notifications enabled for your wishlist.
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0 0;">
            © ${new Date().getFullYear()} SiiShop. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: process.env.GMAIL_USER || process.env.SMTP_FROM || "noreply@siishop.com",
    to: email,
    subject: `🎉 ${productName} is back in stock!`,
    html,
  };

  return trans.sendMail(mailOptions);
}

module.exports = {
  sendWishlistPriceDropEmail,
  sendBackInStockEmail,
};