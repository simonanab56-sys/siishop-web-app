# Plan: Commission Payment Notification System

## Context

After the recent Paystack-backed `payCommission` rewrite, a vendor paying commission through `/api/wallet/commission/verify` correctly debits `commissionOwed`, creates a `commission_payment` WalletTransaction, and updates the wallet — but produces **zero** side effects outside the wallet:

- No admin notification (in-app, email, or live)
- No vendor confirmation email
- The admin only learns about commission payments when they happen to check the wallet analytics page

The user has asked for a full notification fan-out that fires **only after Paystack verification succeeds**, with **idempotent** behavior so duplicate verify calls never produce duplicate notifications, transactions, or emails.

The required order of side effects, exactly as the user wrote it:
1. Vendor pays via Paystack.
2. Backend verifies the Paystack transaction.
3. Verify the reference has not already been processed.
4. Save WalletTransaction.
5. Mark commission as Paid (debit `commissionOwed`, credit `commissionPaid`).
6. Update wallet balances (already in the session transaction).
7. Save commission history (the WalletTransaction IS the commission history — same write).
8. Create admin in-app notification.
9. Emit Socket.IO notification.
10. Send admin email.
11. Send vendor confirmation email.
12. Return success to the frontend.

**If ANY verification step fails, NONE of the above happens.** This contract is already enforced by the existing `payCommission` service: it aborts the Mongo session and throws on any failure, so no WalletTransaction is created and no wallet balance is touched. The new notification code lives **outside** the service (in the route) and is gated on `success: true && !alreadyProcessed`.

## What already exists (reuse, don't re-build)

| Capability | Existing implementation | What we reuse |
|---|---|---|
| Notification model | `backend/models/Notification.js` (unified for all roles, `userId` is the recipient, `referenceType` enum already includes `"commission"`) | **Add `"commission_paid"` to the `type` enum**; everything else is reusable |
| NotificationLog audit model | `backend/models/NotificationLog.js` (already used by withdrawal service) | Reuse as-is for email/in-app audit |
| Email transport | `backend/services/email.service.js` — `sendEmail(to, subject, html)` primitive | Reuse `sendEmail` |
| Socket.IO instance | `server.js:130` (`new Server(server, ...)`), `app.set("io", io)` (line 437), `app.use((req, res, next) => { req.io = io; next(); })` (lines 442-444) | Use `req.app.get("io")` from the route |
| Admin user lookup | `User.find({ isAdmin: true })` — pattern from `withdrawal-notification.service.js:160` and `:434` | Reuse the same query |
| Notification routes (list, unread count, mark read) | `backend/routes/notifications.js` — already admin-agnostic (scoped by `req.user.userId`) | No changes needed |
| Admin notification UI | `frontend/src/components/NotificationBell.jsx` (HTTP-polled every 30s + on focus) | Extend icon map and click handler |
| Order Paystack flow (the reference for init/verify) | `backend/services/order-email.service.js`, `backend/services/notification.service.js` | Mirror the email + in-app pattern |
| `payCommission` idempotency | `backend/services/wallet.service.js:540-633` already returns `alreadyProcessed: true` on duplicate paymentRef | Use as the gate |

## What does NOT exist yet (must be created)

- A way to access the Socket.IO `io` instance from a service (currently routes use `req.app.get("io")`, services can't). Add a small `backend/services/socket-helper.js` exporting `getIO()`.
- A `commission_paid` socket event handler in `server.js` and a matching client listener.
- A `commission-notification.service.js` (parallel to `withdrawal-notification.service.js`).
- A unique partial index on `WalletTransaction` to make the wallet-level idempotency race-proof (the existing `findOne` check in `payCommission` is fine for sequential calls but a TOCTOU race could write twice).
- A unique partial index on `Notification.metadata.paymentRef` to make the notification-level idempotency race-proof.
- A "live push" wiring on the admin frontend (currently the bell is HTTP-only).

## Implementation Plan

### 1. Add `"commission_paid"` to the Notification type enum
**File:** `backend/models/Notification.js` (line 13-27)

Add `"commission_paid"` to the `type` enum array. `referenceType` already supports `"commission"` (line 44) — no change needed there.

This is the **only** schema change to the Notification model. New types are appended to keep the diff small and let the index file stay readable.

### 2. Make `paymentRef` uniqueness on `WalletTransaction` race-proof
**File:** `backend/models/WalletTransaction.js`

Current `paymentRef` is `index: true, sparse: true` (non-unique). The service-level `findOne` check in `payCommission` is fine for sequential calls but a TOCTOU race between two parallel verify calls could write the same `commission_payment` twice.

Add a **partial unique index** scoped to commission_payment documents only, so other future transaction types that use `paymentRef` aren't constrained:
```js
walletTransactionSchema.index(
  { paymentRef: 1 },
  {
    unique: true,
    partialFilterExpression: { type: "commission_payment" },
    name: "uniq_commission_payment_ref",
  }
);
```

This is the DB-level guarantee. The service-level `findOne` check stays as a fast path that avoids the round-trip and the `E11000` error path.

### 3. Create `backend/services/socket-helper.js`
A tiny helper that exposes the `io` instance to service code without going through `req.app.get("io")` (services don't have `req`).

```js
let _io = null;
function setIO(io) { _io = io; }
function getIO() { return _io; }
module.exports = { setIO, getIO };
```

**Wiring** (one line in `server.js` after `app.set("io", io)` at line 437):
```js
const socketHelper = require("./services/socket-helper");
socketHelper.setIO(io);
```

This is non-invasive — does not change the existing `req.app.get("io")` pattern that `routes/delivery.js` and `routes/chat.js` use.

### 4. Add the `admin-notify-join` socket event in `server.js`
**File:** `backend/server.js` (after the existing socket events, near the chat section)

```js
// Admin joins the global admin-notify room. Used for live
// commission_payment (and future admin-only) push notifications.
// The admin frontend emits this on dashboard mount; the server
// keeps the socket in `admin-notify-room` until disconnect.
socket.on("admin-notify-join", () => {
  socket.join("admin-notify-room");
  logger.log(`[Socket] Socket ${socket.id} joined admin-notify-room`);
});

socket.on("admin-notify-leave", () => {
  socket.leave("admin-notify-room");
});
```

**Why a single room, not per-admin `user:{adminId}`**: the current `user:{userId}` rooms are owned by the chat context (the chat-join handler joins them). Mixing commission-push events into chat rooms would create a confusing coupling. A dedicated `admin-notify-room` keeps the new concern isolated, scales to N admins without DB lookups, and matches the user's "admin dashboard is open" trigger (the dashboard just emits one event on mount).

### 5. Create `backend/services/commission-notification.service.js`
The new service, parallel to `withdrawal-notification.service.js`. Exports:

#### `notifyCommissionPaid({ vendorId, amount, paymentRef, transactionId })`
The single entry point. Called from the route after `payCommission` returns `success: true && !alreadyProcessed`.

Order of side effects, exactly as the user specified:
1. **Idempotency check** — `Notification.findOne({ "metadata.paymentRef": paymentRef, type: "commission_paid" })`. If a matching notification already exists, log and return (defense in depth alongside the `alreadyProcessed` flag from the service).
2. **Look up vendor details** — `User.findById(vendorId).select("name email storeName vendorType restaurantDetails vendorType").lean()`. Get business name: `vendorType === "restaurant" ? restaurantDetails?.restaurantName : storeName`, fallback to `name`.
3. **Look up admins** — `User.find({ isAdmin: true }).select("_id email").lean()`.
4. **Create in-app notification for each admin** — `Notification.create({ userId, type: "commission_paid", title, message, referenceId: transactionId, referenceType: "commission", isRead: false, metadata: { vendorId, vendorName, businessName, vendorType, amount, paymentRef, paymentMethod: "paystack" } })`. If the unique index on `paymentRef` rejects, catch the `E11000` and log — this is the "race-proof" guarantee.
5. **Emit socket broadcast** — `const io = getIO(); if (io) io.to("admin-notify-room").emit("admin-notify-room-broadcast", { type: "commission_paid", payload: { ...metadata } })`. The frontend listener will call `notificationAPI.getUnreadCount()` to refresh the badge immediately.
6. **Send admin email** — for each admin email, build HTML and call `sendEmail(adminEmail, subject, html)`. Wrap in try/catch and log to `NotificationLog` (same pattern as `sendWithdrawalEmail`).
7. **Send vendor confirmation email** — build the vendor HTML and call `sendEmail(vendor.email, subject, html)`. Same try/catch + NotificationLog pattern.

The function is wrapped in an outer `try/catch` and **never throws** — same as `notifyWithdrawalSubmitted` (line 459). Notification failures must NOT break the wallet payment.

#### Helper: `buildAdminEmail(vendor, amount, paymentRef, vendorType)`
Returns `{ subject, html }` matching the user's spec ("New Commission Payment Received" + the table layout from the spec). Includes a link to the admin dashboard (`${ADMIN_DASHBOARD_URL}/admin?tab=wallets` — the URL comes from `process.env.ADMIN_DASHBOARD_URL || "https://siishops.com"`).

#### Helper: `buildVendorEmail(vendor, amount, paymentRef)`
Returns `{ subject, html }` matching the user's spec ("Commission Payment Successful" + the receipt summary).

#### Helper: `formatVendorType(vendorType)`
Returns `"Marketplace Vendor"` for `"marketplace"`, `"Restaurant"` for `"restaurant"`, with a final fallback of `"Vendor"`.

#### Internal: `sendCommissionEmail(to, subject, html, trigger, referenceId, recipientUserId, recipientEmail)`
Same shape as `sendWithdrawalEmail` (try/catch, log to NotificationLog), with `referenceType: "commission"` instead of `"withdrawal"`.

#### Internal: `createCommissionInAppNotification(userId, type, title, message, referenceId, metadata, vendorId)`
Same shape as `createInAppNotification`, with `referenceType: "commission"`. Catches the `E11000` from the partial unique index and treats it as "already created" (idempotency, log + return null).

#### Internal: `getAdminEmails()` and `getVendorDetails(vendorId)`
Duplicated from `withdrawal-notification.service.js` rather than imported — the audit said "do not refactor unrelated modules", and the duplication is 6 lines. The `getVendorDetails` here selects more fields (`vendorType`, `restaurantDetails`) than the withdrawal version.

### 6. Wire the new service into `routes/wallet.js`
**File:** `backend/routes/wallet.js` (the `/commission/verify` handler, line 227-278)

After `walletService.payCommission` returns `success: true && !alreadyProcessed`, fire-and-forget the notification:
```js
if (result.success && !result.alreadyProcessed) {
  // Side effects are fire-and-forget — the response has already
  // been queued. Failures here are logged but never block the
  // vendor's success response.
  commissionNotifications.notifyCommissionPaid({
    vendorId: req.user.userId,
    amount: result.amountPaid,
    paymentRef: result.paymentRef,
    transactionId: result.transactionId,
  }).catch(err => {
    console.error("[WALLET] Commission notification error:", err.message);
  });
}
res.status(201).json(result);
```

**Why fire-and-forget**: matches the withdrawal flow at `routes/wallet.js:107-110`. The user's spec says "Return success to the frontend" as the **last** step — the response goes out, then the emails/socket are dispatched asynchronously. The vendor doesn't wait 2-3 seconds for two emails to send before seeing "Payment successful!".

**Why gate on `!alreadyProcessed`**: this is the **primary** defense against duplicate notifications. The service-level `findOne` in `payCommission` already prevents a duplicate WalletTransaction, so a duplicate verify call returns `alreadyProcessed: true` and we skip the notification fan-out entirely. The partial unique index on `Notification.metadata.paymentRef` is the secondary defense for the (extremely unlikely) case of a parallel race that slips past the service-level check.

Add the import at the top:
```js
const commissionNotifications = require("../services/commission-notification.service");
```

### 7. Add the partial unique index on `Notification.metadata.paymentRef`
**File:** `backend/models/Notification.js` (after the existing indexes on lines 60-61)

```js
// Commission payment notifications: guarantee no two notifications
// share the same Paystack reference. Partial so other notification
// types can use `metadata.paymentRef` without a uniqueness
// constraint.
notificationSchema.index(
  { "metadata.paymentRef": 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "commission_paid",
      "metadata.paymentRef": { $exists: true, $type: "string" },
    },
    name: "uniq_commission_paid_paymentRef",
  }
);
```

The service catches the `E11000` on duplicate and treats it as "already created, log + return null" — same pattern as the wallet transaction guard.

### 8. Wire the admin dashboard to the new socket event
**File:** `frontend/src/pages/admin/AdminDashboard.jsx`

Add a `useEffect` that:
1. Connects `socketService` (if not already connected via chat)
2. Emits `socketService.emit("admin-notify-join")` (a thin wrapper, see step 9)
3. Subscribes to `admin-notify-room-broadcast` — on receipt, calls a callback that refreshes the notification bell

The callback is best passed via a small custom event on `window` (so the Navbar's `NotificationBell` can listen without prop-drilling). Pattern:
```js
useEffect(() => {
  let cancelled = false;
  (async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      await socketService.connect(token);
      if (cancelled) return;
      socketService.adminNotifyJoin?.();  // see step 9
      const handler = (data) => {
        if (data?.type === "commission_paid") {
          window.dispatchEvent(new CustomEvent("admin-notification", { detail: data }));
        }
      };
      socketService.on("admin-notify-room-broadcast", handler);
      return () => { socketService.off("admin-notify-room-broadcast", handler); };
    } catch (err) {
      // non-fatal — bell still works via 30s poll
    }
  })();
  return () => { cancelled = true; };
}, []);
```

**Why `window` event**: the `NotificationBell` lives in the Navbar (one level above `AdminDashboard`). Prop-drilling through `App.jsx` would be invasive. A `CustomEvent` on `window` is the existing pattern this codebase uses for cross-component messaging (no Redux/Zustand). The bell's listener is independent of socket lifecycle — it just refreshes the badge when the event fires.

### 9. Add `adminNotifyJoin()` to the frontend socket service
**File:** `frontend/src/services/socket.js` (in the `SocketService` class, near the chat methods)

```js
// Join admin-notify-room (admin dashboard only)
adminNotifyJoin() {
  if (this.socket?.connected) {
    this.socket.emit("admin-notify-join");
  }
}

adminNotifyLeave() {
  if (this.socket?.connected) {
    this.socket.emit("admin-notify-leave");
  }
}
```

### 10. Wire `NotificationBell` to refresh on `admin-notify-room-broadcast`
**File:** `frontend/src/components/NotificationBell.jsx`

In the existing `useEffect` that polls every 30s (line 40-52), add a `window` listener:
```js
const handleAdminNotification = () => {
  fetchUnreadCount();
  if (showPanel) fetchNotifications();
};
window.addEventListener("admin-notification", handleAdminNotification);
```

The icon map (line 100-108) gets a new branch:
```js
if (type === "commission_paid") return "💰";
```

The click handler (line 89-98) gets a new branch for admin users:
```js
if (notification.type === "commission_paid") {
  if (userIsAdmin) onNavigate?.("admin");
}
```

The `userIsAdmin` flag comes from `useAuth().user?.isAdmin` (need to import `useAuth` at the top of the file).

For vendors, the new `commission_paid` type would never appear in their notification list (admins are the only recipients), so no vendor routing is needed.

### 11. Tests
**File:** `backend/tests/unit.test.js` — add a new section

Two new tests, no DB needed (test the service-level idempotency logic):
1. **`payCommission alreadyProcessed returns true on duplicate paymentRef`** — already covered by the existing service; the new test verifies the returned shape and that `notifyCommissionPaid` is gated on `!alreadyProcessed` (mocked).
2. **`buildAdminEmail / buildVendorEmail produce the required fields`** — call the pure builder with a fixture, assert that subject contains "New Commission Payment Received", HTML contains the vendor name + business name + amount + reference.

### 12. Final report — what was created, where, and how

#### Where the notification is created
`backend/services/commission-notification.service.js#notifyCommissionPaid`, called fire-and-forget from `backend/routes/wallet.js#POST /commission/verify` after `payCommission` returns `success: true && !alreadyProcessed`. Persists a `Notification` doc with `type: "commission_paid"`, `userId: admin._id`, `referenceType: "commission"`, and `metadata.paymentRef` set to the verified Paystack reference.

#### Where the emails are sent
- **Admin**: same service, in the `for (const admin of admins) await sendCommissionEmail(admin.email, ...)` loop. Subject: "New Commission Payment Received".
- **Vendor**: same service, in the `await sendCommissionEmail(vendor.email, ...)` call. Subject: "Commission Payment Successful".

Both go through the existing `backend/services/email.service.js#sendEmail` transport (Nodemailer, Gmail or generic SMTP). Both log to `NotificationLog` for audit (sent/failed).

#### How duplicate notifications are prevented
Three layers of defense:
1. **Service-level** — `notifyCommissionPaid` is only called when `result.alreadyProcessed !== true`. The existing `payCommission` service already returns this flag for any `paymentRef` that has a `commission_payment` WalletTransaction.
2. **Application-level** — `notifyCommissionPaid` does its own `Notification.findOne({ "metadata.paymentRef": paymentRef, type: "commission_paid" })` check at the top and short-circuits if found. This catches the (very unlikely) case of a duplicate call that slipped past the route gate.
3. **Database-level** — partial unique index on `Notification` (`{ "metadata.paymentRef": 1 }` where `type === "commission_paid"`). A race condition that bypasses both above will trigger an `E11000` on `Notification.create`, which the service catches and treats as "already created" (log + return null). This is the ultimate guarantee.

#### How duplicate emails are prevented
Same three layers, applied to the email sends: the `for` loop and the vendor `sendEmail` are inside the same `notifyCommissionPaid` function, so the same `if (alreadyProcessed) return` early-return prevents the emails from being dispatched. The `NotificationLog` table gives a queryable audit trail of every email sent and its trigger.

#### How duplicate wallet transactions are prevented
Already handled by the previous refactor:
1. **Service-level** — `payCommission` looks up `WalletTransaction.findOne({ type: "commission_payment", paymentRef })` and short-circuits with `alreadyProcessed: true` if found.
2. **Database-level** — the new partial unique index on `WalletTransaction` (`{ paymentRef: 1 }` where `type === "commission_payment"`, added in step 2) makes the service-level check race-proof. A TOCTOU race between two parallel `/commission/verify` calls with the same `paymentRef` will trigger an `E11000` on the second `WalletTransaction.create`, which propagates to the route as a 500 (acceptable — Paystack shouldn't be verifying the same reference twice anyway, and the order route uses the same pattern with no complaints).

#### Why notifications are only created after successful Paystack verification
The route handler at `backend/routes/wallet.js#POST /commission/verify` calls `paystackService.verifyPaystackPayment(paymentRef)` BEFORE calling `walletService.payCommission`. If Paystack returns `status !== "success"`, the route returns 402 and `payCommission` is never called, so the notification fan-out is never reached. If Paystack is unreachable, the route returns 502 — same story. Only when `paystackData.status === "success"` does `payCommission` run, and only when `payCommission` returns `success: true && !alreadyProcessed` does `notifyCommissionPaid` run. The flow is strictly linear with no shortcut paths.

#### Confirm: both Marketplace Vendors and Restaurant Vendors are fully supported
Yes. The new service looks up `vendorType` from the User doc and:
- The business name resolution is `vendorType === "restaurant" ? restaurantDetails?.restaurantName : storeName`, with `name` as the final fallback — so both types render correctly.
- The email templates include a "Vendor Type" row showing "Marketplace Vendor" or "Restaurant" via `formatVendorType()`.
- The in-app notification message includes both the personal name AND the business name: e.g. "Delicious Kitchen (Restaurant Vendor) paid GH₵120.00 via Paystack".
- The socket event payload includes `vendorType` in `metadata` so the frontend can render it correctly.
- The Notification model and `NotificationLog` model have no `vendorType` constraint — both types write to the same tables.

No new fields are required on the User, Wallet, or Order models. No DB migration is needed.

## Files Changed

| File | Change |
|---|---|
| `backend/models/Notification.js` | Add `"commission_paid"` to type enum; add partial unique index on `metadata.paymentRef` |
| `backend/models/WalletTransaction.js` | Add partial unique index on `paymentRef` where `type === "commission_payment"` |
| `backend/services/socket-helper.js` | **NEW** — `setIO`/`getIO` helpers |
| `backend/services/commission-notification.service.js` | **NEW** — full commission notification fan-out |
| `backend/server.js` | Add `socketHelper.setIO(io)`; add `admin-notify-join`/`admin-notify-leave` socket handlers |
| `backend/routes/wallet.js` | Import new service; fire `notifyCommissionPaid` after successful `payCommission` |
| `frontend/src/services/socket.js` | Add `adminNotifyJoin` / `adminNotifyLeave` methods |
| `frontend/src/pages/admin/AdminDashboard.jsx` | Connect socket on mount; emit `admin-notify-join`; forward `admin-notify-room-broadcast` to a `window` event |
| `frontend/src/components/NotificationBell.jsx` | Add `commission_paid` icon, admin click handler, `window` event listener for live badge refresh |
| `backend/tests/unit.test.js` | Add idempotency + email-builder tests |

## Verification

### Syntax + service load
```bash
cd backend
node -c models/Notification.js && node -c models/WalletTransaction.js
node -c services/commission-notification.service.js && node -c services/socket-helper.js
node -c server.js && node -c routes/wallet.js
node -e "require('./services/commission-notification.service.js'); console.log('ok')"
```

### Unit tests
```bash
cd backend && npm test
```
Expect 116 + N new tests pass (where N is the number of new tests added, minimum 2).

### Live API test (using existing vendor + admin tokens)
1. **Successful payment → all side effects fire**:
   ```bash
   # 1. Initialize
   POST /api/wallet/commission/initialize { amount: 50 }
   # → { authorization_url, access_code, reference }
   # 2. Verify with the real reference after a real Paystack popup
   POST /api/wallet/commission/verify { paymentRef, amount: 50 }
   # → 201 { success, amountPaid, remainingOwed, paymentRef, transactionId }
   ```
   Then verify:
   - `GET /api/notifications` as admin → new `commission_paid` notification visible with `isRead: false`
   - `GET /api/notifications/unread-count` as admin → incremented
   - The admin's frontend console shows `admin-notify-room-broadcast` event received
   - The vendor's email inbox has a "Commission Payment Successful" email
   - The admin's email inbox has a "New Commission Payment Received" email
   - `NotificationLog` has 3 entries: 1 in_app (admin), 2 email (admin + vendor)

2. **Duplicate verify (idempotency)**:
   ```bash
   POST /api/wallet/commission/verify { paymentRef: <same>, amount: 50 }
   ```
   Then verify:
   - Response includes `alreadyProcessed: true`
   - **No** new `Notification` document was created
   - **No** new `NotificationLog` entries
   - `commissionOwed` did NOT change
   - `WalletTransaction` count for that `paymentRef` is still 1

3. **Failed Paystack verification (negative test)**:
   ```bash
   POST /api/wallet/commission/verify { paymentRef: "fake_invalid_ref", amount: 50 }
   ```
   Expect 402, no notification, no email, no wallet change, no Socket.IO event.

4. **Admin offline (Socket.IO no-op)**:
   - Disconnect the admin's frontend (close the tab)
   - Run step 1
   - Reconnect the admin's frontend
   - The bell badge updates within 30s (next poll) and the new notification is at the top of the list

5. **Restaurant vendor** (the dual-vendor-type case):
   - Register / log in as a restaurant vendor
   - Place a COD order, deliver it (`commissionOwed` accrues)
   - Pay commission
   - Confirm: admin email shows "Vendor Type: Restaurant", in-app notification shows the restaurant's name from `restaurantDetails.restaurantName`

6. **Marketplace vendor** (the other dual-vendor-type case):
   - Same as above, but the vendor is `vendorType: "marketplace"`
   - Confirm: admin email shows "Vendor Type: Marketplace Vendor", in-app notification uses `storeName`

### Regression checks
- All 116 existing unit tests still pass.
- The `payCommission` service still returns the same shape (idempotency unchanged).
- The vendor's `VendorWallet` modal flow still works (the modal in `frontend/src/components/vendor/VendorWallet.jsx` was the previous refactor — it should be unchanged by this work).
- The existing `withdrawal-notification.service.js` and the order notification flow are **not** modified — they share the Notification model via the same `userId` field but the new type `"commission_paid"` is distinct and additive.
- The 30s notification poll in `NotificationBell.jsx` still works (the live push is additive, not a replacement).

## Non-Goals (explicitly not changing)

- The existing `createInAppNotification` / `sendWithdrawalEmail` in `withdrawal-notification.service.js` are NOT refactored to accept a `referenceType` parameter. The rule says "do not refactor unrelated modules" and the duplication is small (~50 lines). A future PR could unify them.
- The frontend `ChatContext` is NOT modified. The new `adminNotifyJoin` is a peer to the existing `chatJoin`, not a replacement.
- The admin dashboard's existing tabs and content are unchanged. The new socket wiring is additive — a `useEffect` that connects the socket and emits one event.
- The `payCommission` service itself is NOT modified. The new idempotency index is added at the model level, but the service's existing `findOne` check stays as the fast path.
- The `Order.js` `paymentRef` unique index pattern is NOT touched (separate concern, separate model).
- The frontend's `OrderContext`, `AuthContext`, `CartContext`, and all vendor pages are not modified.
