// services/paystack.js — v2: supports channels (card, mobile_money)
// ─────────────────────────────────────────────────────────────────────────────
// openPaystackPopup({ email, amountInMajorUnits, channels?, onSuccess, onClose })
//
// channels examples:
//   undefined           → show all payment options (card + mobile money)
//   ["card"]            → card only
//   ["mobile_money"]    → mobile money only
// ─────────────────────────────────────────────────────────────────────────────

function loadPaystackScript() {
  return new Promise((resolve, reject) => {
    if (window.PaystackPop) { resolve(); return; }
    const existing = document.getElementById("paystack-inline-script");
    if (existing) {
      existing.addEventListener("load", resolve);
      existing.addEventListener("error", () => reject(new Error("Failed to load Paystack script")));
      return;
    }
    const script = document.createElement("script");
    script.id      = "paystack-inline-script";
    script.src     = "https://js.paystack.co/v1/inline.js";
    script.onload  = resolve;
    script.onerror = () => reject(new Error("Could not load Paystack inline script. Check your internet connection."));
    document.body.appendChild(script);
  });
}

export async function openPaystackPopup({
  email,
  amountInMajorUnits,
  reference,         // ✅ NEW: Reference from backend
  channels,          // optional: ["card"] | ["mobile_money"] | undefined (all)
  onSuccess,
  onClose,
}) {
  const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;

  if (!publicKey || publicKey.startsWith("pk_test_xxx")) {
    throw new Error(
      "Paystack public key is not set. " +
      "Create frontend/.env with: VITE_PAYSTACK_PUBLIC_KEY=pk_test_your_key_here"
    );
  }

  await loadPaystackScript();

  const amountInMinorUnits = Math.round(amountInMajorUnits * 100);

  const config = {
    key:      publicKey,
    email,
    amount:   amountInMinorUnits,
    currency: "GHS",   // change to "NGN", "USD", "KES" etc. as needed
    ref: reference,    // ✅ Use the reference from backend
    callback(response) { onSuccess(response.reference); },
    onClose() { onClose(); },
  };

  // Only add channels if explicitly specified
  if (channels && channels.length > 0) {
    config.channels = channels;
  }

  const handler = window.PaystackPop.setup(config);
  handler.openIframe();
}
