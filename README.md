# 🍔 SiiShop — Food Delivery App with Paystack Payments

React (Vite) + Node.js + Express + MongoDB + Paystack inline payments.

---

## 🔐 How the Payment Flow Works

```
User clicks "Pay Now"
        │
        ▼
[Frontend] Opens Paystack popup (Paystack's secure iframe)
        │  User enters card details — we never see them
        │
        ▼  Paystack calls our onSuccess callback
[Frontend] Receives { reference: "abc123" }
        │
        ▼
[Frontend] POST /api/orders { ...orderData, paymentRef: "abc123" }
        │
        ▼
[Backend] GET https://api.paystack.co/transaction/verify/abc123
        │  Uses SECRET KEY — only the backend knows it
        │
        ▼
[Backend] Confirms status === "success" AND amount matches
        │
        ▼
[Backend] Saves order → paymentStatus: "paid"
        │
        ▼
[Frontend] Shows success screen ✅
```

**Why verify on the backend?**
The frontend callback could be faked. Backend verification with the secret key
is the only trustworthy confirmation. An order is **never saved unless Paystack's
own API confirms the payment succeeded**.

---

## 📁 Files Changed / Added

```
backend/
  models/Order.js          ← added paymentRef + paymentStatus fields
  routes/orders.js         ← POST now calls Paystack verify before saving
  .env.example             ← added PAYSTACK_SECRET_KEY

frontend/
  src/services/paystack.js ← NEW: loads Paystack SDK, opens popup
  src/pages/CartPage.jsx   ← full payment flow + success/failure screens
  src/pages/CartPage.module.css  ← new styles for result screens
  src/pages/OrdersPage.jsx ← shows paymentRef & paymentStatus
  src/pages/AdminPage.jsx  ← shows payment info in orders table
  .env.example             ← added VITE_PAYSTACK_PUBLIC_KEY
```

---

## 🚀 Setup

### 1 — Get Paystack API keys

1. Sign up at [dashboard.paystack.com](https://dashboard.paystack.com) (free)
2. Go to **Settings → API Keys & Webhooks**
3. Copy **Test Secret Key** (`sk_test_...`) and **Test Public Key** (`pk_test_...`)

---

### 2 — Backend

```bash
cd backend
cp .env.example .env
# Edit .env:
#   PAYSTACK_SECRET_KEY=sk_test_your_key_here
#   MONGODB_URI=mongodb://localhost:27017/fooddelivery

npm install
npm run dev     # http://localhost:5000
```

> ⚠️ Never commit `.env` or expose the secret key to the frontend.

---

### 3 — Frontend

```bash
cd frontend
cp .env.example .env
# Edit .env:
#   VITE_PAYSTACK_PUBLIC_KEY=pk_test_your_key_here

npm install
npm run dev     # http://localhost:3000
```

---

### 4 — Test a payment

Use Paystack's test card:
- **Card:** `4084 0840 8408 4081`
- **Expiry:** `01/25`  |  **CVV:** `408`
- **OTP:** `123456`

---

## 🌐 API — POST /api/orders

Request body:
```json
{
  "customerName":    "Jane Doe",
  "customerEmail":   "jane@example.com",
  "deliveryAddress": "12 Ring Road, Accra",
  "items": [{ "productId": "...", "name": "Burger", "price": 12.99, "quantity": 2 }],
  "totalAmount": 28.97,
  "paymentRef":  "7PVGX8MEk85tgeEaYHH1"
}
```

Backend security checks performed:
1. All required fields present
2. `paymentRef` not already used (duplicate guard)
3. Paystack verify API confirms `status === "success"`
4. `amount` from Paystack matches `totalAmount × 100` (minor unit check)
5. Save order with `paymentStatus: "paid"`

---

## 🗄️ New Order Model Fields

```js
paymentRef: {
  type: String,
  required: true,
  unique: true,      // same reference can never create two orders
}

paymentStatus: {
  type: String,
  enum: ["paid", "failed", "pending"],
  default: "pending",
}
```

---

## 💱 Changing the Currency

Edit `frontend/src/services/paystack.js`:
```js
currency: "NGN",   // or "GHS", "USD", "KES", "ZAR", "XOF" ...
```
The `× 100` minor-unit conversion works the same for all currencies.

---

## 💳 Paystack Test Cards

| Card | Expiry | CVV | Result |
|------|--------|-----|--------|
| `4084 0840 8408 4081` | 01/25 | 408 | ✅ Success |
| `0000 0000 0000 0000` | any | any | ❌ Declined |

OTP for all test transactions: **123456**

---

## 📝 Production Checklist

- [ ] Swap `sk_test_` / `pk_test_` for `sk_live_` / `pk_live_`
- [ ] Add auth middleware to admin routes
- [ ] Set up Paystack webhooks for reliable payment confirmations
- [ ] Enable HTTPS (required by Paystack in production)
- [ ] Add rate limiting to `/api/orders`
