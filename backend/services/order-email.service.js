"use strict";

const nodemailer = require("nodemailer");
const { Resend } = require("resend");

/**
 * Order Email Service using Resend API or Gmail SMTP
 */

// URL Helper - Get the correct app URL for emails
function getAppUrl() {
  // Use production URL if set, otherwise use dev URL, otherwise fallback
  return (
    process.env.FRONTEND_URL_PROD ||
    process.env.FRONTEND_URL ||
    "https://siishop-web-app.vercel.app"
  );
}

// Generate customer order tracking URL
function getOrderTrackingUrl(orderId) {
  return `${getAppUrl()}?page=orders&orderId=${orderId}`;
}

// Generate customer orders list URL
function getCustomerOrdersUrl() {
  return `${getAppUrl()}?page=orders`;
}

// Generate vendor dashboard URL
function getVendorDashboardUrl() {
  return `${getAppUrl()}?page=vendor`;
}

// Generate vendor orders URL
function getVendorOrdersUrl() {
  return `${getAppUrl()}?page=vendor&section=orders`;
}

// Generate admin dashboard URL
function getAdminDashboardUrl() {
  return `${getAppUrl()}?page=admin`;
}

// Generate admin orders URL
function getAdminOrdersUrl() {
  return `${getAppUrl()}?page=admin&section=orders`;
}

let transporter = null;
let resendClient = null;

function initTransporter() {
  if (transporter) return transporter;

  // Debug: Log email config status
  console.log("[Email] Checking email configuration...");
  console.log("[Email] RESEND_API_KEY set:", !!process.env.RESEND_API_KEY);
  console.log("[Email] GMAIL_USER set:", !!process.env.GMAIL_USER);
  console.log("[Email] GMAIL_PASSWORD set:", !!process.env.GMAIL_PASSWORD);
  console.log("[Email] EMAIL_FROM:", process.env.EMAIL_FROM);

  // Check for Resend API first (preferred for production)
  if (process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
    transporter = {
      sendMail: async (options) => {
        try {
          const result = await resendClient.emails.send({
            from: process.env.EMAIL_FROM || "SiiShop <noreply@siishop.com>",
            to: options.to,
            subject: options.subject,
            html: options.html,
          });

          // Safe response handling - validate actual Resend response structure
          let emailId = null;

          // Check various possible response structures
          if (result?.data?.id) {
            emailId = result.data.id;
          } else if (result?.data?.object?.id) {
            emailId = result.data.object.id;
          } else if (result?.id) {
            emailId = result.id;
          } else if (typeof result === "object" && result !== null) {
            // Log full response for debugging
            console.log("[Resend] Raw response:", JSON.stringify(result, null, 2));
          }

          // Log success with available ID or generic message
          if (emailId) {
            console.log(`[Resend] Email sent to ${options.to}: ${emailId}`);
          } else {
            console.log(`[Resend] Email sent successfully to ${options.to}`);
          }

          return { messageId: emailId || "sent" };
        } catch (err) {
          // Enhanced error logging
          console.error(`[Resend] Failed to send email to ${options.to}:`, err.message);
          if (err.response?.data) {
            console.error("[Resend] Error details:", JSON.stringify(err.response.data, null, 2));
          }
          throw err;
        }
      },
    };
    console.log("✅ Order email service initialized with Resend API");
  }
  // Check if Gmail credentials are provided
  else if (process.env.GMAIL_USER && process.env.GMAIL_PASSWORD) {
    console.log("[Email] Initializing Gmail SMTP with user:", process.env.GMAIL_USER);
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASSWORD,
      },
    });
    console.log("✅ Order email service initialized with Gmail SMTP");
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
    console.log("✅ Order email service initialized with generic SMTP");
  } else {
    console.warn("⚠️  Order email credentials not configured. Emails will be logged only.");
    transporter = {
      sendMail: async (options) => {
        console.log("[DEV MODE] Order email would be sent:", {
          to: options.to,
          subject: options.subject,
        });
        return { messageId: "dev-mode-" + Date.now() };
      },
    };
  }

  return transporter;
}

/**
 * Safe currency formatter
 */
function fmt(amount) {
  if (amount == null || isNaN(amount)) return "0.00";
  return parseFloat(amount).toFixed(2);
}

/**
 * Safe currency for items
 */
function fmtItem(item) {
  const price = item?.price != null ? parseFloat(item.price) : 0;
  const qty = item?.quantity != null ? parseInt(item.quantity) : 0;
  return {
    price: isNaN(price) ? "0.00" : price.toFixed(2),
    total: isNaN(price * qty) ? "0.00" : (price * qty).toFixed(2),
    qty: qty,
    name: item?.name || "Product",
    image: item?.image || "",
  };
}

/**
 * Send order confirmation email to customer
 */
async function sendOrderConfirmationEmail(email, order, customer) {
  try {
    const trans = initTransporter();

    const totalAmount = fmt(order?.totalAmount);

    const itemsList = (order?.items || [])
      .map((item) => {
        const safe = fmtItem(item);
        return `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">
            <img src="${safe.image}" alt="${safe.name}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px;" />
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">
            <strong>${safe.name}</strong><br>
            <small style="color: #666;">Qty: ${safe.qty} × ₵${safe.price}</small>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
            <strong>₵${safe.total}</strong>
          </td>
        </tr>
        `;
      })
      .join("");

    const mailOptions = {
      from: process.env.EMAIL_FROM || "SiiShop <noreply@siishop.com>",
      to: email,
      subject: `Order Confirmed! - #${order?._id || "N/A"}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                  <tr>
                    <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px;">SiiShop</h1>
                      <p style="color: #ffffff; margin: 5px 0 0 0; opacity: 0.9;">Order Confirmation</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px;">
                      <h2 style="color: #333; margin: 0 0 20px 0;">Thank you for your order, ${customer?.name || "Customer"}!</h2>
                      <p style="color: #666; line-height: 1.6;">Your order has been confirmed and is being processed. We'll notify you when there's an update.</p>

                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                        <tr>
                          <td colspan="2" style="padding: 15px; background: #f9f9f9; border-bottom: 1px solid #eee;">
                            <strong style="color: #333;">Order #${order?._id || "N/A"}</strong>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">Payment Method</td>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${order?.paymentMethod === "paystack" ? "Online Payment (Paystack)" : "Cash on Delivery"}</td>
                        </tr>
                        <tr>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">Payment Status</td>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
                            <span style="background: ${order?.paymentStatus === "paid" ? "#d4edda" : "#fff3cd"}; color: ${order?.paymentStatus === "paid" ? "#155724" : "#856404"}; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">${(order?.paymentStatus || "pending").toUpperCase()}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">Order Status</td>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
                            <span style="background: #e7f3ff; color: #0066cc; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">${(order?.orderStatus || "pending").toUpperCase()}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">Delivery Address</td>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${order?.deliveryAddress || "Not provided"}</td>
                        </tr>
                        <tr>
                          <td style="padding: 15px; background: #f9f9f9;"><strong>Total</strong></td>
                          <td style="padding: 15px; text-align: right; background: #f9f9f9; font-size: 18px; color: #667eea;"><strong>₵${totalAmount}</strong></td>
                        </tr>
                      </table>

                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0;">
                        <tr>
                          <td align="center">
                            <a href="${getCustomerOrdersUrl()}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; padding: 14px 30px; text-decoration: none; border-radius: 25px; font-weight: 600; display: inline-block;">Track Your Order</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="background: #f5f5f5; padding: 20px; text-align: center;">
                      <p style="color: #999; margin: 0; font-size: 12px;">Need help? Contact us at <a href="mailto:support@siishop.com" style="color: #667eea;">support@siishop.com</a></p>
                      <p style="color: #999; margin: 10px 0 0 0; font-size: 11px;">© 2024 SiiShop. All rights reserved.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `Order Confirmed!\n\nOrder #${order?._id}\nTotal: ₵${totalAmount}\n\nThank you for your order! Track it at: ${getCustomerOrdersUrl()}`,
    };

    const result = await trans.sendMail(mailOptions);
    console.log(`[Email] Order confirmation sent to ${email}`);
    return result;
  } catch (err) {
    console.error(`[Email] Failed to send order confirmation to ${email}:`, err.message);
    throw err;
  }
}

/**
 * Send new order notification to vendor
 */
async function sendVendorOrderNotificationEmail(email, order, vendor) {
  try {
    const trans = initTransporter();

    // Debug: Log vendor ID and items vendor IDs for comparison
    console.log(`[Email] Comparing vendor._id: ${vendor?._id} (type: ${typeof vendor?._id})`);
    console.log(`[Email] Order has ${order?.items?.length} items`);

    const vendorItems = (order?.items || []).filter((item) => {
      const itemVendorId = String(item?.vendorId);
      const vendorId = String(vendor?._id);
      const matches = itemVendorId === vendorId;
      console.log(`[Email] Item vendorId: ${itemVendorId} === ${vendorId} ? ${matches}`);
      return matches;
    });

    console.log(`[Email] Filtered ${vendorItems.length} items for vendor`);

    if (vendorItems.length === 0) {
      console.log(`[Email] No items for vendor ${vendor?._id}, skipping notification`);
      return null;
    }

    let vendorTotal = 0;
    vendorItems.forEach((item) => {
      const rawPrice = item?.price;
      const rawQty = item?.quantity;
      const qty = parseInt(rawQty, 10) || 0;
      const price = parseFloat(rawPrice) || 0;
      vendorTotal += qty * price;
      console.log(`[Email] Raw price: ${rawPrice} (type: ${typeof rawPrice}), parsed: ${price}, qty: ${qty}, subtotal: ${qty * price}`);
    });

    console.log(`[Email] Vendor total for ${vendor?.storeName}: ₵${vendorTotal.toFixed(2)}`);

    const itemsList = vendorItems
      .map((item) => {
        const safe = fmtItem(item);
        return `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">
            <img src="${safe.image}" alt="${safe.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;" />
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">
            <strong>${safe.name}</strong><br>
            <small style="color: #666;">Qty: ${safe.qty} × ₵${safe.price}</small>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
            <strong>₵${safe.total}</strong>
          </td>
        </tr>
        `;
      })
      .join("");

    const mailOptions = {
      from: process.env.EMAIL_FROM || "SiiShop <noreply@siishop.com>",
      to: email,
      subject: `New Order Received! - #${order?._id || "N/A"}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                  <tr>
                    <td style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">New Order!</h1>
                      <p style="color: #ffffff; margin: 5px 0 0 0; opacity: 0.9;">SiiShop Vendor Portal</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px;">
                      <h2 style="color: #333; margin: 0 0 10px 0;">Hello ${vendor?.storeName || "Vendor"}!</h2>
                      <p style="color: #666; line-height: 1.6;">You have received a new order. Please process it as soon as possible.</p>

                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                        <tr>
                          <td colspan="2" style="padding: 15px; background: #f9f9f9; border-bottom: 1px solid #eee;">
                            <strong style="color: #333;">Order #${order?._id || "N/A"}</strong>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">Customer</td>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${order?.customerName || "N/A"}</td>
                        </tr>
                        <tr>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">Phone</td>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${order?.customerPhone || "N/A"}</td>
                        </tr>
                        <tr>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">Delivery Address</td>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${order?.deliveryAddress || "N/A"}</td>
                        </tr>
                        <tr>
                          <td style="padding: 15px; background: #f9f9f9;"><strong>Your Total</strong></td>
                          <td style="padding: 15px; text-align: right; background: #f9f9f9; font-size: 18px; color: #11998e;"><strong>₵${vendorTotal.toFixed(2)}</strong></td>
                        </tr>
                      </table>

                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0;">
                        <tr>
                          <td align="center">
                            <a href="${getVendorOrdersUrl()}" style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: #ffffff; padding: 14px 30px; text-decoration: none; border-radius: 25px; font-weight: 600; display: inline-block;">View Orders</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `New Order Received!\n\nOrder #${order?._id}\nYour Items Total: ₵${vendorTotal.toFixed(2)}\n\nCustomer: ${order?.customerName}\nPhone: ${order?.customerPhone}\n\nView in vendor portal: ${getVendorOrdersUrl()}`,
    };

    const result = await trans.sendMail(mailOptions);
    console.log(`[Email] Vendor order notification sent to ${email}`);
    return result;
  } catch (err) {
    console.error(`[Email] Failed to send vendor order notification to ${email}:`, err.message);
    throw err;
  }
}

/**
 * Send new order alert to admin
 */
async function sendAdminOrderNotificationEmail(email, order, admin) {
  try {
    const trans = initTransporter();
    const totalAmount = fmt(order?.totalAmount);

    const itemsList = (order?.items || [])
      .map((item) => {
        const safe = fmtItem(item);
        return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">
            <img src="${safe.image}" alt="${safe.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;" />
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">
            <strong>${safe.name}</strong>
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${safe.qty}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₵${safe.price}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₵${safe.total}</td>
        </tr>
        `;
      })
      .join("");

    const vendorCount = new Set((order?.items || []).map((i) => String(i?.vendorId))).size;

    const mailOptions = {
      from: process.env.EMAIL_FROM || "SiiShop <noreply@siishop.com>",
      to: email,
      subject: `New Order #${order?._id || "N/A"} - ₵${totalAmount}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                  <tr>
                    <td style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); padding: 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">New Order Alert</h1>
                      <p style="color: #ffffff; margin: 5px 0 0 0; opacity: 0.9;">SiiShop Admin Dashboard</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px;">
                      <h2 style="color: #333; margin: 0 0 10px 0;">New order received!</h2>
                      <p style="color: #666; line-height: 1.6;">A new order has been placed and requires attention.</p>

                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                        <tr>
                          <td style="padding: 15px; background: #f9f9f9; border-bottom: 1px solid #eee;" colspan="2">
                            <strong style="color: #333;">Order #${order?._id || "N/A"}</strong>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">Customer</td>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${order?.customerName || "N/A"} (${order?.customerEmail || "N/A"})</td>
                        </tr>
                        <tr>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">Phone</td>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${order?.customerPhone || "N/A"}</td>
                        </tr>
                        <tr>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">Payment Method</td>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${order?.paymentMethod === "paystack" ? "Online (Paystack)" : "Cash on Delivery"}</td>
                        </tr>
                        <tr>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">Payment Status</td>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
                            <span style="background: ${order?.paymentStatus === "paid" ? "#d4edda" : "#fff3cd"}; color: ${order?.paymentStatus === "paid" ? "#155724" : "#856404"}; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">${(order?.paymentStatus || "pending").toUpperCase()}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">Vendors</td>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${vendorCount} vendor(s)</td>
                        </tr>
                        <tr>
                          <td style="padding: 15px; background: #f9f9f9; color: #333;"><strong>Total Amount</strong></td>
                          <td style="padding: 15px; background: #f9f9f9; text-align: right; font-size: 20px; color: #dc3545;"><strong>₵${totalAmount}</strong></td>
                        </tr>
                      </table>

                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0;">
                        <tr>
                          <td align="center">
                            <a href="${getAdminOrdersUrl()}" style="background: #dc3545; color: #ffffff; padding: 14px 30px; text-decoration: none; border-radius: 25px; font-weight: 600; display: inline-block;">View All Orders</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `New Order Alert!\n\nOrder #${order?._id}\nTotal: ₵${totalAmount}\nCustomer: ${order?.customerName}\nPhone: ${order?.customerPhone}\nPayment: ${order?.paymentMethod === "paystack" ? "Paid" : "COD"} - ${order?.paymentStatus}\n\nView in admin: ${getAdminOrdersUrl()}`,
    };

    const result = await trans.sendMail(mailOptions);
    console.log(`[Email] Admin order notification sent to ${email}`);
    return result;
  } catch (err) {
    console.error(`[Email] Failed to send admin order notification to ${email}:`, err.message);
    throw err;
  }
}

/**
 * Send order status update email to customer
 */
async function sendOrderStatusUpdateEmail(email, order, oldStatus, newStatus) {
  try {
    const trans = initTransporter();
    const totalAmount = fmt(order?.totalAmount);

    const statusColors = {
      pending: { bg: "#fff3cd", color: "#856404" },
      confirmed: { bg: "#d1ecf1", color: "#0c5460" },
      preparing: { bg: "#e7f3ff", color: "#0066cc" },
      out_for_delivery: { bg: "#d4edda", color: "#155724" },
      delivered: { bg: "#d4edda", color: "#155724" },
    };

    const statusLabels = {
      pending: "Pending",
      confirmed: "Confirmed",
      preparing: "Preparing",
      out_for_delivery: "Out for Delivery",
      delivered: "Delivered",
    };

    const statusMeta = statusColors[newStatus] || { bg: "#f8f9fa", color: "#333" };
    const statusLabel = statusLabels[newStatus] || newStatus;
    const oldLabel = statusLabels[oldStatus] || oldStatus;

    const mailOptions = {
      from: process.env.EMAIL_FROM || "SiiShop <noreply@siishop.com>",
      to: email,
      subject: `Order Status Update - #${order?._id || "N/A"} is now ${statusLabel}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                  <tr>
                    <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Order Update</h1>
                      <p style="color: #ffffff; margin: 5px 0 0 0; opacity: 0.9;">SiiShop</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px;">
                      <h2 style="color: #333; margin: 0 0 20px 0;">Your order status has been updated!</h2>

                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                        <tr>
                          <td style="padding: 20px; text-align: center; background: #fff3cd;">
                            <span style="font-size: 14px; color: #856404;">Previous Status</span><br>
                            <strong style="font-size: 18px; color: #856404;">${oldLabel}</strong>
                          </td>
                          <td style="padding: 20px; text-align: center; background: #fff;">
                            <span style="font-size: 20px;">➜</span>
                          </td>
                          <td style="padding: 20px; text-align: center; background: ${statusMeta.bg};">
                            <span style="font-size: 14px; color: ${statusMeta.color};">Current Status</span><br>
                            <strong style="font-size: 18px; color: ${statusMeta.color};">${statusLabel}</strong>
                          </td>
                        </tr>
                      </table>

                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                        <tr>
                          <td style="padding: 15px; background: #f9f9f9; border-bottom: 1px solid #eee;" colspan="2">
                            <strong style="color: #333;">Order #${order?._id || "N/A"}</strong>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">Order Total</td>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; color: #333;"><strong>₵${totalAmount}</strong></td>
                        </tr>
                      </table>

                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0;">
                        <tr>
                          <td align="center">
                            <a href="${getCustomerOrdersUrl()}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; padding: 14px 30px; text-decoration: none; border-radius: 25px; font-weight: 600; display: inline-block;">Track Order</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `Order Status Update!\n\nOrder #${order?._id}\nStatus changed from ${oldLabel} to ${statusLabel}\n\nTrack your order: ${getCustomerOrdersUrl()}`,
    };

    const result = await trans.sendMail(mailOptions);
    console.log(`[Email] Status update sent to ${email}`);
    return result;
  } catch (err) {
    console.error(`[Email] Failed to send status update to ${email}:`, err.message);
    throw err;
  }
}

/**
 * Send order delivered confirmation email to customer
 */
async function sendOrderDeliveredEmail(email, order) {
  try {
    const trans = initTransporter();
    const totalAmount = fmt(order?.totalAmount);

    const mailOptions = {
      from: process.env.EMAIL_FROM || "SiiShop <noreply@siishop.com>",
      to: email,
      subject: `Order Delivered! - #${order?._id || "N/A"}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                  <tr>
                    <td style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 30px; text-align: center;">
                      <div style="font-size: 48px;">✓</div>
                      <h1 style="color: #ffffff; margin: 10px 0 0 0; font-size: 28px;">Order Delivered!</h1>
                      <p style="color: #ffffff; margin: 5px 0 0 0; opacity: 0.9;">SiiShop</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px;">
                      <h2 style="color: #333; margin: 0 0 20px 0;">Thank you for shopping with us!</h2>
                      <p style="color: #666; line-height: 1.6;">Your order has been successfully delivered. We hope you enjoy your purchase!</p>

                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                        <tr>
                          <td style="padding: 15px; background: #f9f9f9; border-bottom: 1px solid #eee;" colspan="2">
                            <strong style="color: #333;">Order #${order?._id || "N/A"}</strong>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">Total Amount</td>
                          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; color: #333;"><strong>₵${totalAmount}</strong></td>
                        </tr>
                      </table>

                      <div style="text-align: center; margin: 25px 0;">
                        <p style="color: #666; margin-bottom: 15px;">How was your experience?</p>
                        <a href="${getCustomerOrdersUrl()}" style="background: #11998e; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 25px; font-weight: 600; display: inline-block;">Leave a Review</a>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `Order Delivered! ✓\n\nOrder #${order?._id}\nTotal: ₵${totalAmount}\n\nThank you for shopping with SiiShop!\nLeave a review: ${getCustomerOrdersUrl()}`,
    };

    const result = await trans.sendMail(mailOptions);
    console.log(`[Email] Delivered confirmation sent to ${email}`);
    return result;
  } catch (err) {
    console.error(`[Email] Failed to send delivered confirmation to ${email}:`, err.message);
    throw err;
  }
}

module.exports = {
  sendOrderConfirmationEmail,
  sendVendorOrderNotificationEmail,
  sendAdminOrderNotificationEmail,
  sendOrderStatusUpdateEmail,
  sendOrderDeliveredEmail,
  initTransporter,
};