"use strict";

const https = require("https");

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Invalid response from Paystack"));
        }
      });
    });

    req.on("error", reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function initializeTransaction({ email, amount, metadata = {} }) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured on the server");
  }

  console.log(`[Paystack] Initializing transaction for: ${email}, amount: ${amount}`);

  let result;
  try {
    result = await request(
      {
        hostname: "api.paystack.co",
        path: "/transaction/initialize",
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
      },
      { email, amount, metadata }
    );
  } catch (err) {
    console.error(`[Paystack] Network error during initialization: ${err.message}`);
    throw new Error("Failed to reach Paystack API. Please try again.");
  }

  if (!result.status) {
    console.error(`[Paystack] Initialization failed: ${result.message}`);
    throw new Error(result.message || "Payment initialization failed");
  }

  return result.data; // { authorization_url, access_code, reference }
}

async function verifyPaystackPayment(reference) {
  if (!reference || typeof reference !== "string") {
    throw new Error("Invalid payment reference");
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured on the server");
  }

  console.log(`[Paystack] Verifying reference: ${reference}`);

  let result;
  try {
    result = await request({
      hostname: "api.paystack.co",
      path: `/transaction/verify/${encodeURIComponent(reference)}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error(`[Paystack] Network error during verification: ${err.message}`);
    throw new Error("Failed to reach Paystack API. Please try again.");
  }

  console.log(`[Paystack] Raw response:`, JSON.stringify(result));

  // Paystack returns { status: true/false, message: "...", data: {...} }
  if (!result.status) {
    console.error(`[Paystack] Verification failed: ${result.message}`);
    throw new Error(result.message || "Payment verification failed");
  }

  const tx = result.data;

  // Log transaction status for debugging
  console.log(`[Paystack] Transaction status: ${tx.status}, amount: ${tx.amount}, ref: ${tx.reference}`);

  // Only "success" means the payment actually went through
  if (tx.status !== "success") {
    console.error(`[Paystack] Transaction not successful. Status: ${tx.status}`);
    throw new Error(`Payment not successful. Status: ${tx.status} — ${tx.gateway_response || 'Transaction was not completed'}`);
  }

  return {
    status: tx.status,
    amount: tx.amount,       // in kobo (minor units)
    currency: tx.currency,
    reference: tx.reference,
    customerEmail: tx.customer?.email,
    // Harmonize field names so callers don't have to dig deeper
    gateway_response: tx.gateway_response,
  };
}

module.exports = { initializeTransaction, verifyPaystackPayment };
