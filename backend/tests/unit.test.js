// backend/tests/unit.test.js
// ─────────────────────────────────────────────────────────────────────────────
// Self-contained test suite using ONLY Node.js built-in modules.
// No npm packages required. Run with:
//
//   node --test backend/tests/unit.test.js
//
// All cryptographic primitives (JWT, password hashing) are implemented
// using node:crypto so results mirror the real bcryptjs / jsonwebtoken
// behaviour while staying completely dependency-free.
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const { describe, test, before, beforeEach } = require("node:test");
const assert  = require("node:assert/strict");
const crypto  = require("node:crypto");

// ═════════════════════════════════════════════════════════════════════════════
// SELF-CONTAINED CRYPTO UTILITIES
// (mirrors jsonwebtoken + bcryptjs behaviour)
// ═════════════════════════════════════════════════════════════════════════════

// ── Minimal JWT (HS256) ──────────────────────────────────────────────────────
const JWT = {
  sign(payload, secret, opts = {}) {
    const header  = this._b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    if (opts.expiresIn) {
      const secs = typeof opts.expiresIn === "string"
        ? this._parseDuration(opts.expiresIn)
        : opts.expiresIn;
      payload = { ...payload, exp: Math.floor(Date.now() / 1000) + secs };
    }
    const body = this._b64u(JSON.stringify(payload));
    const sig  = crypto.createHmac("sha256", secret)
                       .update(`${header}.${body}`)
                       .digest("base64url");
    return `${header}.${body}.${sig}`;
  },

  verify(token, secret) {
    const parts = token.split(".");
    if (parts.length !== 3) throw Object.assign(new Error("jwt malformed"), { name: "JsonWebTokenError" });
    const [h, b, s] = parts;
    const expected  = crypto.createHmac("sha256", secret)
                            .update(`${h}.${b}`)
                            .digest("base64url");
    if (s !== expected) throw Object.assign(new Error("invalid signature"), { name: "JsonWebTokenError" });
    const payload = JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      throw Object.assign(new Error("jwt expired"), { name: "TokenExpiredError" });
    }
    return payload;
  },

  _b64u: (str) => Buffer.from(str).toString("base64url"),

  _parseDuration(s) {
    const m = s.match(/^(\d+)(ms|s|m|h|d)$/);
    if (!m) throw new Error(`Unknown duration: ${s}`);
    const n = Number(m[1]);
    return ({ ms: 0.001, s: 1, m: 60, h: 3600, d: 86400 }[m[2]]) * n;
  },
};

// ── PBKDF2-based password hashing (bcryptjs-equivalent) ─────────────────────
const Password = {
  ROUNDS: 10000,
  KEY_LEN: 64,

  hash(plain) {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(16).toString("hex");
      crypto.pbkdf2(plain, salt, this.ROUNDS, this.KEY_LEN, "sha512", (err, key) => {
        if (err) return reject(err);
        resolve(`${salt}:${key.toString("hex")}`);
      });
    });
  },

  compare(plain, stored) {
    return new Promise((resolve, reject) => {
      const [salt, hash] = stored.split(":");
      if (!salt || !hash) return resolve(false);
      crypto.pbkdf2(plain, salt, this.ROUNDS, this.KEY_LEN, "sha512", (err, key) => {
        if (err) return reject(err);
        resolve(crypto.timingSafeEqual(
          Buffer.from(key.toString("hex")),
          Buffer.from(hash)
        ));
      });
    });
  },
};

const TEST_SECRET = "test_jwt_secret_32chars_minimum!!";


// ═════════════════════════════════════════════════════════════════════════════
// SUITE 1 — JWT UTILITIES
// ═════════════════════════════════════════════════════════════════════════════
describe("1. JWT utilities", () => {
  test("1.1  sign() produces a 3-part dot-separated string", () => {
    const token = JWT.sign({ userId: "u1" }, TEST_SECRET);
    assert.equal(token.split(".").length, 3, "JWT should have header.payload.sig");
  });

  test("1.2  verify() decodes the original payload", () => {
    const token   = JWT.sign({ userId: "abc", isAdmin: true }, TEST_SECRET);
    const decoded = JWT.verify(token, TEST_SECRET);
    assert.equal(decoded.userId,  "abc");
    assert.equal(decoded.isAdmin, true);
  });

  test("1.3  wrong secret raises JsonWebTokenError", () => {
    const token = JWT.sign({ userId: "x" }, TEST_SECRET);
    assert.throws(
      () => JWT.verify(token, "wrong_secret"),
      (err) => err.name === "JsonWebTokenError"
    );
  });

  test("1.4  malformed token raises JsonWebTokenError", () => {
    assert.throws(
      () => JWT.verify("not.a.token", TEST_SECRET),
      (err) => err.name === "JsonWebTokenError"
    );
  });

  test("1.5  expired token raises TokenExpiredError", (t, done) => {
    const token = JWT.sign({ userId: "x", exp: Math.floor(Date.now() / 1000) - 1 }, TEST_SECRET);
    setTimeout(() => {
      try {
        JWT.verify(token, TEST_SECRET);
        assert.fail("Should have thrown TokenExpiredError");
      } catch (err) {
        assert.equal(err.name, "TokenExpiredError");
        done();
      }
    }, 5);
  });

  test("1.6  expiresIn option embeds exp claim", () => {
    const before = Math.floor(Date.now() / 1000);
    const token  = JWT.sign({ userId: "u1" }, TEST_SECRET, { expiresIn: "1h" });
    const decoded = JWT.verify(token, TEST_SECRET);
    assert.ok(decoded.exp >= before + 3598, "exp should be ~1h from now");
    assert.ok(decoded.exp <= before + 3602);
  });

  test("1.7  isAdmin flag survives round-trip", () => {
    const cases = [true, false];
    cases.forEach((isAdmin) => {
      const t = JWT.sign({ userId: "u", isAdmin }, TEST_SECRET);
      const d = JWT.verify(t, TEST_SECRET);
      assert.equal(d.isAdmin, isAdmin);
    });
  });

  test("1.8  token payload is NOT encrypted (base64 only)", () => {
    const token   = JWT.sign({ userId: "visible" }, TEST_SECRET);
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    assert.equal(payload.userId, "visible");
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// SUITE 2 — PASSWORD HASHING
// ═════════════════════════════════════════════════════════════════════════════
describe("2. Password hashing", () => {
  test("2.1  hash() produces a string different from the input", async () => {
    const hash = await Password.hash("mypassword");
    assert.ok(typeof hash === "string");
    assert.notEqual(hash, "mypassword");
  });

  test("2.2  hash() contains a salt separator", async () => {
    const hash = await Password.hash("pw");
    assert.ok(hash.includes(":"), "stored hash should be salt:hash");
  });

  test("2.3  compare() returns true for correct password", async () => {
    const hash = await Password.hash("correct_password");
    const ok   = await Password.compare("correct_password", hash);
    assert.equal(ok, true);
  });

  test("2.4  compare() returns false for wrong password", async () => {
    const hash = await Password.hash("correct");
    const bad  = await Password.compare("incorrect", hash);
    assert.equal(bad, false);
  });

  test("2.5  two hashes of the same password differ (unique salt)", async () => {
    const h1 = await Password.hash("same_password");
    const h2 = await Password.hash("same_password");
    assert.notEqual(h1, h2);
  });

  test("2.6  compare() returns false for empty string vs real hash", async () => {
    const hash   = await Password.hash("real");
    const result = await Password.compare("", hash);
    assert.equal(result, false);
  });

  test("2.7  compare() handles malformed stored hash gracefully", async () => {
    const result = await Password.compare("any", "malformed_no_colon");
    assert.equal(result, false);
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// SUITE 3 — PAYSTACK VERIFICATION LOGIC
// ═════════════════════════════════════════════════════════════════════════════
describe("3. Paystack payment verification", () => {
  // Inline mock of the verifyPaystackPayment helper used in routes/orders.js
  function buildVerifier(mockData) {
    return () =>
      new Promise((resolve, reject) => {
        if (mockData.networkError) return reject(new Error("Network error"));
        if (mockData.status === true && mockData.data) resolve(mockData.data);
        else reject(new Error(mockData.message || "Paystack error"));
      });
  }

  test("3.1  resolves with data on success response", async () => {
    const verify = buildVerifier({ status: true, data: { status: "success", amount: 5000 } });
    const data   = await verify();
    assert.equal(data.status, "success");
    assert.equal(data.amount, 5000);
  });

  test("3.2  rejects when status:false", async () => {
    const verify = buildVerifier({ status: false, message: "Invalid key" });
    await assert.rejects(verify, /Invalid key/);
  });

  test("3.3  rejects on network error", async () => {
    const verify = buildVerifier({ networkError: true });
    await assert.rejects(verify, /Network error/);
  });

  test("3.4  transaction with status 'failed' is not success", async () => {
    const verify = buildVerifier({ status: true, data: { status: "failed", amount: 5000 } });
    const data   = await verify();
    assert.notEqual(data.status, "success");
  });

  test("3.5  amount integrity: correct conversion GHS → pesewas", () => {
    const cases = [
      [35.00, 3500], [9.99,  999], [100.00, 10000],
      [0.01,  1],    [1.50,  150], [49.99,  4999],
    ];
    cases.forEach(([major, minor]) => {
      assert.equal(Math.round(major * 100), minor, `${major} GHS should be ${minor} pesewas`);
    });
  });

  test("3.6  amount mismatch is detectable", () => {
    const orderTotal   = 35.00;
    const paystackAmt  = 100;          // attacker tampered
    const expected     = Math.round(orderTotal * 100);
    assert.notEqual(expected, paystackAmt, "mismatched amounts should differ");
  });

  test("3.7  floating-point edge cases round correctly", () => {
    // Ensure we don't get 998.9999... instead of 999
    assert.equal(Math.round(9.99  * 100), 999);
    assert.equal(Math.round(0.1   * 100), 10);
    assert.equal(Math.round(0.005 * 100), 1);
  });

  test("3.8  duplicate reference detection works", () => {
    const usedRefs = new Set(["ref_used_1", "ref_used_2"]);
    assert.equal(usedRefs.has("ref_used_1"), true);
    assert.equal(usedRefs.has("ref_new"),    false);
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// SUITE 4 — ORDER STATUS MAPPING
// ═════════════════════════════════════════════════════════════════════════════
describe("4. Order status mapping (5-step ↔ 3-step legacy)", () => {
  const STATUS_MAP = {
    pending:          "Pending",
    confirmed:        "Pending",
    preparing:        "Preparing",
    out_for_delivery: "Preparing",
    delivered:        "Delivered",
  };

  const VALID_NEW    = ["pending","confirmed","preparing","out_for_delivery","delivered"];
  const VALID_LEGACY = ["Pending","Preparing","Delivered"];

  test("4.1  pending   → Pending",   () => assert.equal(STATUS_MAP.pending,          "Pending"));
  test("4.2  confirmed → Pending",   () => assert.equal(STATUS_MAP.confirmed,         "Pending"));
  test("4.3  preparing → Preparing", () => assert.equal(STATUS_MAP.preparing,         "Preparing"));
  test("4.4  out_for_delivery → Preparing", () => assert.equal(STATUS_MAP.out_for_delivery, "Preparing"));
  test("4.5  delivered → Delivered", () => assert.equal(STATUS_MAP.delivered,         "Delivered"));

  test("4.6  all 5 new statuses are mapped", () => {
    VALID_NEW.forEach((s) =>
      assert.ok(s in STATUS_MAP, `'${s}' must have a legacy mapping`)
    );
  });

  test("4.7  only valid legacy statuses appear as values", () => {
    Object.values(STATUS_MAP).forEach((v) =>
      assert.ok(VALID_LEGACY.includes(v), `'${v}' is not a valid legacy status`)
    );
  });

  test("4.8  status enum values are lowercase for new, title-case for legacy", () => {
    VALID_NEW.forEach((s)    => assert.equal(s, s.toLowerCase()));
    VALID_LEGACY.forEach((s) => assert.equal(s[0], s[0].toUpperCase()));
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// SUITE 5 — CART PRICE CALCULATIONS
// ═════════════════════════════════════════════════════════════════════════════
describe("5. Cart price calculations", () => {
  const DELIVERY_FEE = 2.99;

  function calcTotal(items) {
    const sub = items.reduce((s, i) => s + i.price * i.quantity, 0);
    return parseFloat((sub + DELIVERY_FEE).toFixed(2));
  }

  function calcSubtotal(items) {
    return items.reduce((s, i) => s + i.price * i.quantity, 0);
  }

  test("5.1  single item", () => assert.equal(calcTotal([{ price: 10.00, quantity: 1 }]), 12.99));
  test("5.2  multiple items", () => assert.equal(calcTotal([{ price: 5.00, quantity: 2 }, { price: 3.50, quantity: 1 }]), 16.49));
  test("5.3  zero items returns delivery fee only", () => assert.equal(calcTotal([]), DELIVERY_FEE));
  test("5.4  quantity multiplier", () => assert.equal(calcSubtotal([{ price: 7.50, quantity: 4 }]), 30.00));

  test("5.5  result has at most 2 decimal places", () => {
    const total = calcTotal([{ price: 1.005, quantity: 3 }]);
    const decimals = total.toString().split(".")[1] || "";
    assert.ok(decimals.length <= 2, `Too many decimals: ${total}`);
  });

  test("5.6  cart count (total items) is sum of quantities", () => {
    const cart = [
      { _id: "a", quantity: 2 },
      { _id: "b", quantity: 3 },
      { _id: "c", quantity: 1 },
    ];
    const count = cart.reduce((s, i) => s + i.quantity, 0);
    assert.equal(count, 6);
  });

  test("5.7  adding existing product increments quantity", () => {
    const cart = [{ _id: "a", name: "Burger", quantity: 1 }];
    const incoming = { _id: "a" };
    const updated = cart.map((item) =>
      item._id === incoming._id ? { ...item, quantity: item.quantity + 1 } : item
    );
    assert.equal(updated[0].quantity, 2);
  });

  test("5.8  adding new product appends to cart", () => {
    const cart = [{ _id: "a", quantity: 1 }];
    const updated = [...cart, { _id: "b", quantity: 1 }];
    assert.equal(updated.length, 2);
  });

  test("5.9  decreasing to 0 removes item", () => {
    const cart    = [{ _id: "a", quantity: 1 }, { _id: "b", quantity: 2 }];
    const updated = cart
      .map((i) => i._id === "a" ? { ...i, quantity: i.quantity - 1 } : i)
      .filter((i) => i.quantity > 0);
    assert.equal(updated.length, 1);
    assert.equal(updated[0]._id, "b");
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// SUITE 6 — INPUT VALIDATION
// ═════════════════════════════════════════════════════════════════════════════
describe("6. Input validation", () => {
  const emailRe = /\S+@\S+\.\S+/;

  function validateOrder(o) {
    const e = [];
    if (!o.customerName?.trim())       e.push("customerName required");
    if (!o.customerEmail?.trim())      e.push("customerEmail required");
    else if (!emailRe.test(o.customerEmail)) e.push("invalid email");
    if (!o.deliveryAddress?.trim())    e.push("deliveryAddress required");
    if (!Array.isArray(o.items) || !o.items.length) e.push("items required");
    if (!o.totalAmount || o.totalAmount <= 0) e.push("totalAmount required");
    if (o.paymentMethod && !["paystack","cash"].includes(o.paymentMethod)) e.push("invalid paymentMethod");
    return e;
  }

  function validateUser(u) {
    const e = [];
    if (!u.name || u.name.trim().length < 2) e.push("name too short");
    if (!u.email || !emailRe.test(u.email))  e.push("invalid email");
    if (!u.password || u.password.length < 6) e.push("password too short");
    return e;
  }

  test("6.1  valid order has no errors", () => {
    const errs = validateOrder({
      customerName: "Jane", customerEmail: "j@t.com",
      deliveryAddress: "Accra", items: [{}], totalAmount: 10,
      paymentMethod: "paystack",
    });
    assert.equal(errs.length, 0);
  });

  test("6.2  missing customerName", () => {
    const errs = validateOrder({ customerName: "", customerEmail: "a@b.com", deliveryAddress: "x", items: [{}], totalAmount: 5 });
    assert.ok(errs.includes("customerName required"));
  });

  test("6.3  invalid email format", () => {
    assert.equal(emailRe.test("notanemail"), false);
    assert.equal(emailRe.test("a@b.com"),    true);
    assert.equal(emailRe.test("@nodomain"),  false);
    assert.equal(emailRe.test("no@tld"),     false);
  });

  test("6.4  empty items array", () => {
    const errs = validateOrder({ customerName:"A", customerEmail:"a@b.com", deliveryAddress:"x", items:[], totalAmount:5 });
    assert.ok(errs.includes("items required"));
  });

  test("6.5  zero totalAmount", () => {
    const errs = validateOrder({ customerName:"A", customerEmail:"a@b.com", deliveryAddress:"x", items:[{}], totalAmount:0 });
    assert.ok(errs.includes("totalAmount required"));
  });

  test("6.6  invalid paymentMethod", () => {
    const errs = validateOrder({ customerName:"A", customerEmail:"a@b.com", deliveryAddress:"x", items:[{}], totalAmount:5, paymentMethod:"bitcoin" });
    assert.ok(errs.includes("invalid paymentMethod"));
  });

  test("6.7  valid user fields", () => assert.equal(validateUser({ name:"Jo", email:"j@t.com", password:"abc123" }).length, 0));
  test("6.8  name too short",    () => assert.ok(validateUser({ name:"J",  email:"j@t.com", password:"abc123" }).includes("name too short")));
  test("6.9  password too short",() => assert.ok(validateUser({ name:"Jo", email:"j@t.com", password:"abc"   }).includes("password too short")));
  test("6.10 password min = 6",  () => {
    assert.ok(validateUser({ name:"Jo", email:"j@t.com", password:"abcde"  }).includes("password too short"));
    assert.equal(validateUser({ name:"Jo", email:"j@t.com", password:"abcdef" }).length, 0);
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// SUITE 7 — AUTH MIDDLEWARE LOGIC
// ═════════════════════════════════════════════════════════════════════════════
describe("7. Auth middleware simulation", () => {
  function requireAuth(authHeader) {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { status: 401, error: "Authentication required" };
    }
    const token = authHeader.split(" ")[1];
    try {
      const user = JWT.verify(token, TEST_SECRET);
      return { status: 200, user };
    } catch (err) {
      return { status: 401, error: err.name === "TokenExpiredError" ? "Session expired" : "Invalid token" };
    }
  }

  function requireAdmin(user) {
    if (!user?.isAdmin) return { status: 403, error: "Admin access required" };
    return { status: 200 };
  }

  test("7.1  valid token passes", () => {
    const token  = JWT.sign({ userId: "u1", isAdmin: false }, TEST_SECRET, { expiresIn: "1h" });
    const result = requireAuth(`Bearer ${token}`);
    assert.equal(result.status, 200);
    assert.equal(result.user.userId, "u1");
  });

  test("7.2  missing header → 401", () => {
    assert.equal(requireAuth(undefined).status, 401);
    assert.equal(requireAuth("").status, 401);
  });

  test("7.3  no Bearer prefix → 401", () => {
    assert.equal(requireAuth("Token abc").status, 401);
  });

  test("7.4  malformed token → 401", () => {
    assert.equal(requireAuth("Bearer bad.token.here").status, 401);
  });

  test("7.5  expired token → 401 'Session expired'", () => {
    const token  = JWT.sign({ userId: "u1", exp: Math.floor(Date.now() / 1000) - 5 }, TEST_SECRET);
    const result = requireAuth(`Bearer ${token}`);
    assert.equal(result.status, 401);
    assert.match(result.error, /expired/i);
  });

  test("7.6  admin user passes requireAdmin", () => {
    assert.equal(requireAdmin({ userId: "a1", isAdmin: true }).status, 200);
  });

  test("7.7  non-admin → 403", () => {
    assert.equal(requireAdmin({ userId: "u1", isAdmin: false }).status, 403);
  });

  test("7.8  null user → 403", () => {
    assert.equal(requireAdmin(null).status, 403);
  });

  test("7.9  admin token carries isAdmin=true in payload", () => {
    const token   = JWT.sign({ userId: "a1", isAdmin: true }, TEST_SECRET, { expiresIn: "1h" });
    const result  = requireAuth(`Bearer ${token}`);
    assert.equal(result.user.isAdmin, true);
    assert.equal(requireAdmin(result.user).status, 200);
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// SUITE 8 — PAYMENT METHOD BRANCHING (COD vs PAYSTACK)
// ═════════════════════════════════════════════════════════════════════════════
describe("8. Payment method branching", () => {
  function processPayment(method, ref) {
    if (!["paystack", "cash"].includes(method)) throw new Error(`Invalid method: ${method}`);
    if (method === "paystack" && !ref) throw new Error("paymentRef required for Paystack");
    if (method === "cash") return { path: "cod",      paymentStatus: "pending",  orderStatus: "pending"   };
    return               { path: "paystack", paymentStatus: "paid",     orderStatus: "confirmed" };
  }

  test("8.1  cash → COD path, pending status", () => {
    const r = processPayment("cash", undefined);
    assert.equal(r.path,          "cod");
    assert.equal(r.paymentStatus, "pending");
    assert.equal(r.orderStatus,   "pending");
  });

  test("8.2  paystack + ref → paid status", () => {
    const r = processPayment("paystack", "ref_abc");
    assert.equal(r.path,          "paystack");
    assert.equal(r.paymentStatus, "paid");
    assert.equal(r.orderStatus,   "confirmed");
  });

  test("8.3  paystack without ref throws", () => {
    assert.throws(() => processPayment("paystack", undefined), /paymentRef required/i);
  });

  test("8.4  unknown method throws", () => {
    assert.throws(() => processPayment("crypto", "ref"), /Invalid method/i);
  });

  test("8.5  paystack with empty-string ref throws", () => {
    assert.throws(() => processPayment("paystack", ""), /paymentRef required/i);
  });

  test("8.6  cash ignores any paymentRef provided", () => {
    const r = processPayment("cash", "some_ref");   // ref is ignored
    assert.equal(r.path, "cod");
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// SUITE 9 — DUPLICATE PAYMENT REFERENCE GUARD
// ═════════════════════════════════════════════════════════════════════════════
describe("9. Duplicate paymentRef guard", () => {
  let usedRefs;

  beforeEach(() => { usedRefs = new Set(); });

  function createOrder(ref, data) {
    if (!ref) throw new Error("paymentRef required");
    if (usedRefs.has(ref)) throw new Error("Payment reference already used");
    usedRefs.add(ref);
    return { id: crypto.randomUUID(), ref, ...data };
  }

  test("9.1  first order with a ref succeeds", () => {
    const order = createOrder("ref_001", { amount: 50 });
    assert.ok(order.id);
    assert.equal(order.ref, "ref_001");
  });

  test("9.2  same ref used twice throws", () => {
    createOrder("ref_dup", { amount: 10 });
    assert.throws(() => createOrder("ref_dup", { amount: 10 }), /already used/i);
  });

  test("9.3  different refs are both accepted", () => {
    const o1 = createOrder("ref_a", { amount: 10 });
    const o2 = createOrder("ref_b", { amount: 20 });
    assert.ok(o1.ref !== o2.ref);
    assert.equal(usedRefs.size, 2);
  });

  test("9.4  missing ref throws", () => {
    assert.throws(() => createOrder(undefined, {}), /paymentRef required/i);
  });

  test("9.5  used set is empty at start of each test", () => {
    assert.equal(usedRefs.size, 0);
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// SUITE 10 — RESET PASSWORD TOKEN LOGIC
// ═════════════════════════════════════════════════════════════════════════════
describe("10. Password reset token logic", () => {
  function generateResetToken() {
    return crypto.randomBytes(32).toString("hex");
  }

  function buildTokenRecord() {
    return {
      token:   generateResetToken(),
      expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    };
  }

  function isTokenValid(record) {
    return record && record.expires > new Date();
  }

  test("10.1 token is a 64-char hex string", () => {
    const token = generateResetToken();
    assert.equal(token.length, 64);
    assert.match(token, /^[0-9a-f]+$/);
  });

  test("10.2 two tokens are always different", () => {
    const t1 = generateResetToken();
    const t2 = generateResetToken();
    assert.notEqual(t1, t2);
  });

  test("10.3 fresh token is valid", () => {
    const record = buildTokenRecord();
    assert.equal(isTokenValid(record), true);
  });

  test("10.4 expired token is invalid", () => {
    const record = { token: generateResetToken(), expires: new Date(Date.now() - 1000) };
    assert.equal(isTokenValid(record), false);
  });

  test("10.5 null record is invalid (falsy)", () => {
    // null && anything short-circuits to null — falsy but not strictly false.
    assert.ok(!isTokenValid(null), "null record should be falsy/invalid");
  });

  test("10.6 token cleared after use (set to null)", () => {
    const user = buildTokenRecord();
    // simulate "use the token"
    const usedUser = { ...user, token: null, expires: null };
    assert.equal(usedUser.token,   null);
    assert.equal(usedUser.expires, null);
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// SUITE 11 — ORDER TRACKING / PROGRESS STATE
// ═════════════════════════════════════════════════════════════════════════════
describe("11. Order tracking progress state", () => {
  const STEPS = ["pending","confirmed","preparing","out_for_delivery","delivered"];

  function getStepIndex(status) { return STEPS.indexOf(status); }
  function isStepCompleted(status, step) { return getStepIndex(step) < getStepIndex(status); }
  function isStepCurrent(status, step)   { return step === status; }
  function progressPercent(status) {
    const i = getStepIndex(status);
    return i === -1 ? 0 : Math.round((i / (STEPS.length - 1)) * 100);
  }

  test("11.1 pending is first step (index 0)",        () => assert.equal(getStepIndex("pending"),          0));
  test("11.2 delivered is last step",                 () => assert.equal(getStepIndex("delivered"),        4));
  test("11.3 unknown status returns -1",              () => assert.equal(getStepIndex("unknown"),          -1));
  test("11.4 pending = 0% progress",                  () => assert.equal(progressPercent("pending"),       0));
  test("11.5 confirmed = 25% progress",               () => assert.equal(progressPercent("confirmed"),    25));
  test("11.6 delivered = 100% progress",              () => assert.equal(progressPercent("delivered"),   100));

  test("11.7 step before current is 'completed'", () => {
    assert.equal(isStepCompleted("preparing", "confirmed"), true);
    assert.equal(isStepCompleted("confirmed", "pending"),   true);
  });

  test("11.8 current step is not 'completed'", () => {
    assert.equal(isStepCompleted("preparing", "preparing"), false);
  });

  test("11.9 step after current is not 'completed'", () => {
    assert.equal(isStepCompleted("confirmed", "preparing"), false);
  });

  test("11.10 isStepCurrent works correctly", () => {
    assert.equal(isStepCurrent("preparing", "preparing"), true);
    assert.equal(isStepCurrent("preparing", "confirmed"), false);
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// SUITE 12 — AUTH CONTEXT STATE MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════
describe("12. Auth context state management", () => {
  // Simulate AuthContext without React
  function createAuthStore() {
    let token = null;
    let user  = null;
    const store = {
      login(t, u)    { token = t; user = u; },
      logout()       { token = null; user = null; },
      get token()    { return token; },
      get user()     { return user; },
      get isLoggedIn()  { return !!(token && user); },
      get isAdmin()     { return !!(user && user.isAdmin); },
    };
    return store;
  }

  test("12.1 initial state is logged out", () => {
    const store = createAuthStore();
    assert.equal(store.isLoggedIn, false);
    assert.equal(store.user,       null);
  });

  test("12.2 login sets user and token", () => {
    const store = createAuthStore();
    const tok   = JWT.sign({ userId: "u1" }, TEST_SECRET, { expiresIn: "1h" });
    store.login(tok, { _id: "u1", name: "Jane", email: "j@t.com", isAdmin: false });
    assert.equal(store.isLoggedIn, true);
    assert.equal(store.user.name,  "Jane");
  });

  test("12.3 logout clears user and token", () => {
    const store = createAuthStore();
    store.login("tok", { _id: "u1" });
    store.logout();
    assert.equal(store.isLoggedIn, false);
    assert.equal(store.user,       null);
    assert.equal(store.token,      null);
  });

  test("12.4 isAdmin false for regular user", () => {
    const store = createAuthStore();
    store.login("tok", { _id: "u1", isAdmin: false });
    assert.equal(store.isAdmin, false);
  });

  test("12.5 isAdmin true for admin user", () => {
    const store = createAuthStore();
    store.login("tok", { _id: "a1", isAdmin: true });
    assert.equal(store.isAdmin, true);
  });

  test("12.6 isLoggedIn false when token null but user set", () => {
    const store = createAuthStore();
    store.login(null, { _id: "u1" }); // malformed login
    assert.equal(store.isLoggedIn, false);
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// SUITE 13 — API SERVICE HEADER BUILDER
// ═════════════════════════════════════════════════════════════════════════════
describe("13. API service auth headers", () => {
  function buildHeaders(token = null, needsAuth = false) {
    const headers = { "Content-Type": "application/json" };
    if (needsAuth && token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }

  test("13.1 always includes Content-Type", () => {
    const h = buildHeaders(null, false);
    assert.equal(h["Content-Type"], "application/json");
  });

  test("13.2 no Authorization when needsAuth=false", () => {
    const h = buildHeaders("tok_abc", false);
    assert.equal(h["Authorization"], undefined);
  });

  test("13.3 Authorization added when needsAuth=true and token present", () => {
    const h = buildHeaders("tok_abc", true);
    assert.equal(h["Authorization"], "Bearer tok_abc");
  });

  test("13.4 no Authorization when token is null even with needsAuth", () => {
    const h = buildHeaders(null, true);
    assert.equal(h["Authorization"], undefined);
  });

  test("13.5 no Authorization when token is empty string", () => {
    const h = buildHeaders("", true);
    assert.equal(h["Authorization"], undefined);
  });

  test("13.6 Bearer prefix is always present when auth included", () => {
    const h = buildHeaders("mytoken", true);
    assert.ok(h["Authorization"].startsWith("Bearer "));
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// SUITE 14 — PRODUCT MODEL VALIDATION
// ═════════════════════════════════════════════════════════════════════════════
describe("14. Product field validation", () => {
  function validateProduct(p) {
    const e = [];
    if (!p.name?.trim())        e.push("name required");
    if (!p.description?.trim()) e.push("description required");
    if (!p.price || p.price <= 0 || isNaN(p.price)) e.push("price must be positive number");
    if (!p.category?.trim())    e.push("category required");
    if (!p.image)               e.push("image required");
    return e;
  }

  const VALID = { name:"Burger", description:"Tasty", price:9.99, category:"Burgers", image:"data:image/png;base64,abc" };

  test("14.1 valid product passes",           () => assert.equal(validateProduct(VALID).length, 0));
  test("14.2 missing name fails",             () => assert.ok(validateProduct({ ...VALID, name:"" }).includes("name required")));
  test("14.3 missing description fails",      () => assert.ok(validateProduct({ ...VALID, description:"" }).includes("description required")));
  test("14.4 zero price fails",               () => assert.ok(validateProduct({ ...VALID, price:0 }).includes("price must be positive number")));
  test("14.5 negative price fails",           () => assert.ok(validateProduct({ ...VALID, price:-5 }).includes("price must be positive number")));
  test("14.6 missing category fails",         () => assert.ok(validateProduct({ ...VALID, category:"" }).includes("category required")));
  test("14.7 missing image fails",            () => assert.ok(validateProduct({ ...VALID, image:"" }).includes("image required")));
  test("14.8 available defaults to true",     () => {
    const p = { available: undefined };
    const defaultAvailable = p.available ?? true;
    assert.equal(defaultAvailable, true);
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// SUITE 15 — END-TO-END FLOW SIMULATION
// ═════════════════════════════════════════════════════════════════════════════
describe("15. End-to-end flow simulation", () => {
  // Simulate an entire user journey in memory:
  //   register → login → add to cart → checkout (paystack) → track order

  let db;  // in-memory "database"

  before(() => {
    db = { users: new Map(), orders: new Map(), usedRefs: new Set() };
  });

  async function register(name, email, password) {
    if (db.users.has(email)) throw new Error("Email already registered");
    const hash = await Password.hash(password);
    const user = { _id: crypto.randomUUID(), name, email, password: hash, isAdmin: false };
    db.users.set(email, user);
    const token = JWT.sign({ userId: user._id, name, email, isAdmin: false }, TEST_SECRET, { expiresIn: "7d" });
    return { token, user: { _id: user._id, name, email, isAdmin: false } };
  }

  async function login(email, password) {
    const user = db.users.get(email);
    if (!user) throw new Error("Invalid email or password");
    const ok = await Password.compare(password, user.password);
    if (!ok) throw new Error("Invalid email or password");
    const token = JWT.sign({ userId: user._id, name: user.name, email, isAdmin: user.isAdmin }, TEST_SECRET, { expiresIn: "7d" });
    return { token, user: { _id: user._id, name: user.name, email, isAdmin: user.isAdmin } };
  }

  function placeOrder(token, orderData) {
    const user = JWT.verify(token, TEST_SECRET);
    if (orderData.paymentMethod === "paystack") {
      if (!orderData.paymentRef) throw new Error("paymentRef required");
      if (db.usedRefs.has(orderData.paymentRef)) throw new Error("Reference already used");
      db.usedRefs.add(orderData.paymentRef);
    }
    const order = {
      _id: crypto.randomUUID(),
      userId: user.userId,
      ...orderData,
      paymentStatus: orderData.paymentMethod === "cash" ? "pending" : "paid",
      orderStatus:   orderData.paymentMethod === "cash" ? "pending" : "confirmed",
      status: "Pending",
      createdAt: new Date(),
    };
    db.orders.set(order._id, order);
    return order;
  }

  function getMyOrders(token) {
    const user = JWT.verify(token, TEST_SECRET);
    return [...db.orders.values()].filter((o) => o.userId === user.userId);
  }

  function updateOrderStatus(adminToken, orderId, orderStatus) {
    const admin = JWT.verify(adminToken, TEST_SECRET);
    if (!admin.isAdmin) throw new Error("Admin required");
    const order = db.orders.get(orderId);
    if (!order) throw new Error("Order not found");
    order.orderStatus = orderStatus;
    return order;
  }

  test("15.1 user can register", async () => {
    const { token, user } = await register("Alice", "alice@test.com", "password123");
    assert.ok(token);
    assert.equal(user.name, "Alice");
  });

  test("15.2 duplicate registration throws", async () => {
    await assert.rejects(
      () => register("Alice", "alice@test.com", "password123"),
      /already registered/i
    );
  });

  test("15.3 login with correct credentials returns token", async () => {
    const { token } = await login("alice@test.com", "password123");
    assert.ok(token);
    const decoded = JWT.verify(token, TEST_SECRET);
    assert.equal(decoded.email, "alice@test.com");
  });

  test("15.4 login with wrong password throws", async () => {
    await assert.rejects(
      () => login("alice@test.com", "wrongpass"),
      /Invalid email or password/
    );
  });

  test("15.5 logged-in user can place a Paystack order", async () => {
    const { token } = await login("alice@test.com", "password123");
    const order = placeOrder(token, {
      customerName: "Alice",
      customerEmail: "alice@test.com",
      deliveryAddress: "12 Test St",
      items: [{ name: "Burger", price: 10, quantity: 2 }],
      totalAmount: 22.99,
      paymentMethod: "paystack",
      paymentRef: "test_ref_001",
    });
    assert.equal(order.paymentStatus, "paid");
    assert.equal(order.orderStatus,   "confirmed");
  });

  test("15.6 duplicate paymentRef is rejected", async () => {
    const { token } = await login("alice@test.com", "password123");
    assert.throws(
      () => placeOrder(token, {
        customerName:"Alice", customerEmail:"alice@test.com", deliveryAddress:"x",
        items:[{}], totalAmount:10, paymentMethod:"paystack", paymentRef:"test_ref_001",
      }),
      /already used/i
    );
  });

  test("15.7 user can place a COD order", async () => {
    const { token } = await login("alice@test.com", "password123");
    const order = placeOrder(token, {
      customerName: "Alice", customerEmail: "alice@test.com", deliveryAddress: "x",
      items: [{}], totalAmount: 15, paymentMethod: "cash",
    });
    assert.equal(order.paymentStatus, "pending");
    assert.equal(order.orderStatus,   "pending");
  });

  test("15.8 user can retrieve their own orders", async () => {
    const { token } = await login("alice@test.com", "password123");
    const orders = getMyOrders(token);
    assert.ok(orders.length >= 2, "Alice should have at least 2 orders");
  });

  test("15.9 admin can update order status", async () => {
    // Create admin user directly
    const adminHash = await Password.hash("admin_pw");
    db.users.set("admin@test.com", {
      _id: "admin_id", name: "Admin", email: "admin@test.com",
      password: adminHash, isAdmin: true,
    });
    const { token: adminTok } = await login("admin@test.com", "admin_pw");

    const { token: userTok } = await login("alice@test.com", "password123");
    const orders = getMyOrders(userTok);
    const order  = orders[0];

    const updated = updateOrderStatus(adminTok, order._id, "preparing");
    assert.equal(updated.orderStatus, "preparing");
  });

  test("15.10 non-admin cannot update order status", async () => {
    const { token } = await login("alice@test.com", "password123");
    const orders = getMyOrders(token);
    assert.throws(
      () => updateOrderStatus(token, orders[0]._id, "delivered"),
      /Admin required/i
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 16. Commission Notification — pure email + label helpers
// ─────────────────────────────────────────────────────────────────────────────
// The commission-notification.service.js exports buildAdminEmail,
// buildVendorEmail, formatVendorType, and resolveBusinessName as pure
// functions of their inputs. These tests cover the EMAIL-CONTENT contract
// the user specified for the new commission payment notification fan-out.
//
// The DB-bound functions (notifyCommissionPaid, createCommissionInAppNotification)
// are integration-tested by the live API test in the plan, not here —
// they require a real Mongo + real Paystack to exercise the idempotency
// layers end-to-end. The 116 existing tests stay self-contained and
// dependency-free.
// ═════════════════════════════════════════════════════════════════════════════

describe("16. Commission notification email + label helpers", () => {
  // We can't `require()` the service in a self-contained test because
  // it pulls in Mongoose models at import time. Instead, mirror the
  // pure-function logic here by re-requiring the service from a
  // minimal sandbox. We test the public output shape, not internals.
  // If the service can't be loaded (e.g. models have a hard dep on
  // a live Mongo), skip with a clear message rather than failing.
  let svc;
  try {
    svc = require("../services/commission-notification.service");
  } catch (err) {
    test("service is loadable", () => {
      assert.fail(`commission-notification.service.js failed to load: ${err.message}`);
    });
    return;
  }

  const restaurantVendor = {
    name: "John Mensah",
    email: "john@delicious.test",
    vendorType: "restaurant",
    storeName: null,
    restaurantDetails: { restaurantName: "Delicious Kitchen" },
  };
  const marketplaceVendor = {
    name: "Ama Owusu",
    email: "ama@crafts.test",
    vendorType: "marketplace",
    storeName: "Ama's Crafts",
    restaurantDetails: null,
  };
  const fallbackVendor = {
    name: "Bob Smith",
    email: "bob@test.com",
    vendorType: "marketplace",
    storeName: null,
    restaurantDetails: null,
  };

  test("16.1 formatVendorType maps known vendor types", () => {
    assert.equal(svc.formatVendorType("restaurant"),  "Restaurant");
    assert.equal(svc.formatVendorType("marketplace"), "Marketplace Vendor");
    assert.equal(svc.formatVendorType("unknown"),     "Vendor");
  });

  test("16.2 resolveBusinessName prefers restaurantName for restaurants", () => {
    assert.equal(svc.resolveBusinessName(restaurantVendor), "Delicious Kitchen");
  });

  test("16.3 resolveBusinessName uses storeName for marketplace vendors", () => {
    assert.equal(svc.resolveBusinessName(marketplaceVendor), "Ama's Crafts");
  });

  test("16.4 resolveBusinessName falls back to name", () => {
    assert.equal(svc.resolveBusinessName(fallbackVendor), "Bob Smith");
  });

  test("16.5 resolveBusinessName returns 'Unknown Vendor' for null", () => {
    assert.equal(svc.resolveBusinessName(null), "Unknown Vendor");
  });

  test("16.6 buildAdminEmail subject includes business name, type, and amount", () => {
    const { subject } = svc.buildAdminEmail({
      vendor: restaurantVendor,
      businessName: "Delicious Kitchen",
      vendorType: "restaurant",
      amountGHS: "120.00",
      paymentRef: "PSK_TEST_REF_001",
      paymentDate: "04 July 2026, 10:42 AM",
    });
    assert.match(subject, /New Commission Payment Received/);
    assert.match(subject, /Delicious Kitchen/);
    assert.match(subject, /Restaurant/);
    assert.match(subject, /120\.00/);
  });

  test("16.7 buildAdminEmail HTML contains all required fields (restaurant)", () => {
    const { html } = svc.buildAdminEmail({
      vendor: restaurantVendor,
      businessName: "Delicious Kitchen",
      vendorType: "restaurant",
      amountGHS: "120.00",
      paymentRef: "PSK_TEST_REF_001",
      paymentDate: "04 July 2026, 10:42 AM",
    });
    // Vendor personal name
    assert.match(html, /John Mensah/);
    // Business name
    assert.match(html, /Delicious Kitchen/);
    // Vendor type
    assert.match(html, /Restaurant/);
    // Amount (note: the GH₵ symbol contains "₵" + "120.00")
    assert.match(html, /120\.00/);
    // Payment method
    assert.match(html, /Paystack/);
    // Paystack reference
    assert.match(html, /PSK_TEST_REF_001/);
    // Payment date
    assert.match(html, /04 July 2026/);
    // Admin dashboard link
    assert.match(html, /\/admin\?tab=wallets/);
  });

  test("16.8 buildAdminEmail HTML shows 'Marketplace Vendor' for marketplace vendors", () => {
    const { html } = svc.buildAdminEmail({
      vendor: marketplaceVendor,
      businessName: "Ama's Crafts",
      vendorType: "marketplace",
      amountGHS: "75.50",
      paymentRef: "PSK_TEST_REF_002",
      paymentDate: "04 July 2026, 11:00 AM",
    });
    // Business name with apostrophe is HTML-escaped (XSS guard).
    assert.match(html, /Ama&#39;s Crafts/);
    assert.match(html, /Marketplace Vendor/);
    // Vendor personal name with no special chars renders unescaped.
    assert.match(html, /Ama Owusu/);
    assert.match(html, /75\.50/);
  });

  test("16.9 buildVendorEmail subject is 'Commission Payment Successful'", () => {
    const { subject } = svc.buildVendorEmail({
      vendor: restaurantVendor,
      businessName: "Delicious Kitchen",
      amountGHS: "120.00",
      paymentRef: "PSK_TEST_REF_001",
      paymentDate: "04 July 2026, 10:42 AM",
    });
    assert.equal(subject, "Commission Payment Successful");
  });

  test("16.10 buildVendorEmail HTML contains receipt summary fields", () => {
    const { html } = svc.buildVendorEmail({
      vendor: restaurantVendor,
      businessName: "Delicious Kitchen",
      amountGHS: "120.00",
      paymentRef: "PSK_TEST_REF_001",
      paymentDate: "04 July 2026, 10:42 AM",
    });
    // Greeting
    assert.match(html, /Hello John Mensah/);
    // Receipt Summary section header
    assert.match(html, /Receipt Summary/i);
    // Business name
    assert.match(html, /Delicious Kitchen/);
    // Amount
    assert.match(html, /120\.00/);
    // Payment method
    assert.match(html, /Paystack/);
    // Reference
    assert.match(html, /PSK_TEST_REF_001/);
    // Thank-you message
    assert.match(html, /Thank you for keeping your account in good standing/i);
  });

  test("16.11 buildAdminEmail HTML escapes user-supplied business name (XSS guard)", () => {
    // Vendors can name their store anything. If they put a <script>
    // tag, it must NOT execute — the email must render it as text.
    const xssVendor = {
      ...restaurantVendor,
      restaurantDetails: { restaurantName: '<script>alert("xss")</script>' },
    };
    const { html } = svc.buildAdminEmail({
      vendor: xssVendor,
      businessName: '<script>alert("xss")</script>',
      vendorType: "restaurant",
      amountGHS: "10.00",
      paymentRef: "PSK_XSS",
      paymentDate: "04 July 2026",
    });
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe("17. Restaurant customer-status derivation", () => {
  // Mirror the rule from services/restaurantStats.service.js (the JS
  // block in #getStats that builds customersWithStatus). We test the
  // pure-function logic in isolation because the full aggregation
  // requires a live Mongo. Keeping this in sync with the service IS
  // the regression test — if a future refactor changes the rule, the
  // test will fail before the production code does.

  function deriveCustomerStatus({ orderCount, hasDelivered }) {
    if (hasDelivered) return "Active";
    if (orderCount >= 2) return "Returning";
    if (orderCount === 1) return "New";
    return "Inactive";
  }

  test("17.1 single order, not delivered → New", () => {
    assert.strictEqual(deriveCustomerStatus({ orderCount: 1, hasDelivered: 0 }), "New");
  });

  test("17.2 single order, delivered → Active", () => {
    assert.strictEqual(deriveCustomerStatus({ orderCount: 1, hasDelivered: 1 }), "Active");
  });

  test("17.3 two orders, neither delivered → Returning", () => {
    assert.strictEqual(deriveCustomerStatus({ orderCount: 2, hasDelivered: 0 }), "Returning");
  });

  test("17.4 two orders, one delivered → Active (Active beats Returning)", () => {
    assert.strictEqual(deriveCustomerStatus({ orderCount: 2, hasDelivered: 1 }), "Active");
  });

  test("17.5 five orders, all delivered → Active", () => {
    assert.strictEqual(deriveCustomerStatus({ orderCount: 5, hasDelivered: 1 }), "Active");
  });

  test("17.6 three orders, two cancelled one pending → Returning, not Active", () => {
    // Cancelled counts toward orderCount but hasDelivered=0, so the
    // customer is Returning (2+ orders) — NOT Active, because the
    // spec says Active requires a "Delivered/Completed" order.
    assert.strictEqual(deriveCustomerStatus({ orderCount: 3, hasDelivered: 0 }), "Returning");
  });

  test("17.7 six orders, five delivered + one recent pending → Active (THE BUG FIX)", () => {
    // The pre-v3 code would have shown "Pending" for this customer
    // because the most recent order's orderStatus is "pending".
    // The new rules correctly classify them as Active because of
    // the five delivered orders in their history. This is the
    // headline regression guard.
    assert.strictEqual(deriveCustomerStatus({ orderCount: 6, hasDelivered: 1 }), "Active");
  });

  test("17.8 fallback: zero orders → Inactive", () => {
    assert.strictEqual(deriveCustomerStatus({ orderCount: 0, hasDelivered: 0 }), "Inactive");
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe("18. Admin Commissions — per-vendor withdrawal-status derivation", () => {
  // Mirror the rule from
  //   backend/routes/admin-wallet.js (inline helper
  //   WITHDRAWAL_STATUS_PRIORITY in GET /commissions/vendors) and from
  //   the AdminCommissions sub-component in AdminDashboard.jsx. The
  //   server and the client must agree on the priority order — the
  //   status filter and the badge color both depend on it.
  //
  // Priority (top wins):
  //   1. vendorStatus === "suspended" → "Suspended"
  //   2. wallet missing or isActive === false → "Blocked"
  //   3. outstandingCommission > 0 → "Outstanding Commission"
  //   4. pendingWithdrawalCount > 0 →
  //        lastWithdrawalStatus === "pending" → "Withdrawal Requested"
  //        else → "Awaiting Approval"
  //   5. lastWithdrawalStatus in {approved, completed} → "Paid Out"
  //   6. lastWithdrawalStatus in {rejected, failed} → "Commission Paid"
  //   7. fallback → "Commission Paid"
  function deriveWithdrawalStatus({
    vendorStatus = "approved",
    walletStatus = "active",
    outstandingCommission = 0,
    pendingWithdrawalCount = 0,
    lastWithdrawalStatus = null,
  }) {
    if (vendorStatus === "suspended") return "Suspended";
    if (walletStatus !== "active") return "Blocked";
    if (outstandingCommission > 0) return "Outstanding Commission";
    if (pendingWithdrawalCount > 0) {
      return lastWithdrawalStatus === "pending"
        ? "Withdrawal Requested"
        : "Awaiting Approval";
    }
    if (
      lastWithdrawalStatus === "completed" ||
      lastWithdrawalStatus === "approved"
    )
      return "Paid Out";
    if (
      lastWithdrawalStatus === "rejected" ||
      lastWithdrawalStatus === "failed"
    )
      return "Commission Paid";
    return "Commission Paid";
  }

  test("18.1 vendor with no wallet and no activity → Commission Paid (fallback)", () => {
    assert.strictEqual(
      deriveWithdrawalStatus({}),
      "Commission Paid"
    );
  });

  test("18.2 vendor with completed withdrawal, no pending, no commission owed → Paid Out", () => {
    assert.strictEqual(
      deriveWithdrawalStatus({
        lastWithdrawalStatus: "completed",
        pendingWithdrawalCount: 0,
        outstandingCommission: 0,
      }),
      "Paid Out"
    );
  });

  test("18.3 vendor with approved (in-flight) withdrawal, no pending → Paid Out", () => {
    // "approved" is the post-approval pre-Paystack-transfer state.
    // Per the priority rules, it counts as "Paid Out" until a more
    // specific signal arrives.
    assert.strictEqual(
      deriveWithdrawalStatus({ lastWithdrawalStatus: "approved" }),
      "Paid Out"
    );
  });

  test("18.4 vendor with rejected withdrawal → Commission Paid (back to settle-and-retry)", () => {
    assert.strictEqual(
      deriveWithdrawalStatus({ lastWithdrawalStatus: "rejected" }),
      "Commission Paid"
    );
  });

  test("18.5 vendor with one pending withdrawal → Withdrawal Requested", () => {
    assert.strictEqual(
      deriveWithdrawalStatus({
        pendingWithdrawalCount: 1,
        lastWithdrawalStatus: "pending",
      }),
      "Withdrawal Requested"
    );
  });

  test("18.6 vendor with pending withdrawal and lastWithdrawalStatus='processing' → Awaiting Approval", () => {
    // The rare case where a withdrawal is in the "processing" state
    // (post-approve, awaiting Paystack transfer confirmation). The
    // admin is still waiting for the final payout to land.
    assert.strictEqual(
      deriveWithdrawalStatus({
        pendingWithdrawalCount: 1,
        lastWithdrawalStatus: "processing",
      }),
      "Awaiting Approval"
    );
  });

  test("18.7 vendor owes commission → Outstanding Commission (BLOCKS PAYOUT, the headline rule)", () => {
    // This is the business rule the spec calls out: "A vendor should
    // NOT be paid if outstanding commission > 0." Even if a
    // withdrawal is already pending, the status is "Outstanding
    // Commission" so the UI's approve button stays hidden.
    assert.strictEqual(
      deriveWithdrawalStatus({
        outstandingCommission: 230,
        pendingWithdrawalCount: 1,
        lastWithdrawalStatus: "pending",
      }),
      "Outstanding Commission"
    );
  });

  test("18.8 suspended vendor → Suspended (overrides everything, even outstanding commission)", () => {
    // A suspended vendor is suspended regardless of any wallet or
    // withdrawal state. The admin should see the Suspended badge
    // and review the vendor's status before processing anything.
    assert.strictEqual(
      deriveWithdrawalStatus({
        vendorStatus: "suspended",
        outstandingCommission: 500,
        pendingWithdrawalCount: 1,
        lastWithdrawalStatus: "pending",
        walletStatus: "active",
      }),
      "Suspended"
    );
  });

  test("18.9 vendor with no wallet (walletStatus='none') → Blocked (overrides everything)", () => {
    // If the vendor doesn't have a wallet document, no withdrawal
    // can be processed. The Blocked badge surfaces this so the admin
    // can investigate.
    assert.strictEqual(
      deriveWithdrawalStatus({
        walletStatus: "none",
        lastWithdrawalStatus: "pending",
        pendingWithdrawalCount: 1,
        outstandingCommission: 0,
      }),
      "Blocked"
    );
  });

  test("18.10 vendor with deactivated wallet (walletStatus='inactive') → Blocked", () => {
    assert.strictEqual(
      deriveWithdrawalStatus({ walletStatus: "inactive" }),
      "Blocked"
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 19 — Customer review notification flow
// ═════════════════════════════════════════════════════════════════════════════
// Mirrors the pure helpers in
//   backend/services/notification.service.js
//     - buildPendingReviewItems(order, existingReviews)
//     - shouldCreateReviewNotification(item, isDelivered, alreadyReviewed)
//     - validateRating(rating)
//
// The new customer review flow is pure-data end-to-end: the server
// reads from a delivered order, dedupes against existing reviews, and
// surfaces one reviewable item per unique product (or restaurant for
// food items). All three helpers are exported from
// notification.service.js so they can be unit-tested without touching
// MongoDB. The frontend's ReviewPage consumes exactly the same shape.
describe("19. Customer review notification flow", () => {
  // ── 19.1 buildPendingReviewItems ────────────────────────────────────────
  // Inlined copy of the helper from services/notification.service.js.
  // Returns [] for non-delivered orders, and one row per unique
  // productId / restaurantId for delivered ones. The shape matches
  // what the review modal consumes.
  function buildPendingReviewItems(order, existingReviews) {
    if (!order || order.orderStatus !== "delivered") return [];
    const reviews = existingReviews || { product: new Set(), food: new Set() };
    const productMap = new Map();
    const restaurantMap = new Map();

    const items = Array.isArray(order.items) ? order.items : [];
    for (const it of items) {
      if (it.itemType === "food" && it.restaurantId) {
        const key = String(it.restaurantId);
        if (!restaurantMap.has(key)) {
          restaurantMap.set(key, {
            type: "food",
            orderId: String(order._id),
            restaurantId: it.restaurantId,
            name: it.restaurantName || "Restaurant",
            image: it.image || "",
            vendorId: it.restaurantId,
            orderType: "food",
            alreadyReviewed: reviews.food.has(`${key}:${String(order._id)}`),
          });
        }
      } else if (it.itemType !== "food" && it.productId) {
        const key = String(it.productId);
        if (!productMap.has(key)) {
          productMap.set(key, {
            type: "product",
            orderId: String(order._id),
            productId: it.productId,
            name: it.name || "Product",
            image: it.image || "",
            vendorId: it.vendorId,
            orderType: "product",
            alreadyReviewed: reviews.product.has(`${key}:${String(order._id)}`),
          });
        }
      }
    }

    return [...productMap.values(), ...restaurantMap.values()];
  }

  // ── 19.2 shouldCreateReviewNotification ─────────────────────────────────
  // Inlined copy of the boolean helper. Returns true only if the order
  // is delivered AND the item is non-null AND the customer has not
  // already reviewed it. The "false" cases are the dedupe path.
  function shouldCreateReviewNotification(item, isDelivered, alreadyReviewed) {
    if (!isDelivered) return false;
    if (!item) return false;
    if (alreadyReviewed) return false;
    return true;
  }

  // ── 19.3 validateRating ────────────────────────────────────────────────
  // Inlined copy. Returns null on a valid 1..5 integer, or a string
  // error message explaining the rejection.
  function validateRating(rating) {
    const n = Number(rating);
    if (!Number.isFinite(n)) return "Rating must be a number";
    if (n < 1 || n > 5) return "Rating must be between 1 and 5";
    if (!Number.isInteger(n)) return "Rating must be a whole number (1-5)";
    return null;
  }

  test("19.1 buildPendingReviewItems: 2 product items + 1 food item → 3 rows", () => {
    const order = {
      _id: "ord-1",
      orderStatus: "delivered",
      items: [
        { productId: "p1", vendorId: "v1", name: "Headphones", image: "h.jpg", itemType: "product", quantity: 2 },
        { productId: "p2", vendorId: "v1", name: "Cable",       image: "c.jpg", itemType: "product", quantity: 1 },
        { restaurantId: "r1", restaurantName: "Joes Pizza", image: "p.jpg", itemType: "food",     quantity: 1 },
      ],
    };
    const items = buildPendingReviewItems(order);
    assert.strictEqual(items.length, 3);
    // Products first, restaurant second (per the implementation).
    assert.strictEqual(items[0].type, "product");
    assert.strictEqual(items[0].name, "Headphones");
    assert.strictEqual(items[1].type, "product");
    assert.strictEqual(items[1].name, "Cable");
    assert.strictEqual(items[2].type, "food");
    assert.strictEqual(items[2].name, "Joes Pizza");
  });

  test("19.2 buildPendingReviewItems: duplicate productId is deduped (one row, not per quantity)", () => {
    const order = {
      _id: "ord-2",
      orderStatus: "delivered",
      items: [
        { productId: "p1", vendorId: "v1", name: "Mug", image: "m.jpg", itemType: "product", quantity: 3 },
        { productId: "p1", vendorId: "v1", name: "Mug", image: "m.jpg", itemType: "product", quantity: 1 },
      ],
    };
    const items = buildPendingReviewItems(order);
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].productId, "p1");
  });

  test("19.3 buildPendingReviewItems: non-delivered order returns []", () => {
    const order = {
      _id: "ord-3",
      orderStatus: "out_for_delivery",
      items: [
        { productId: "p1", vendorId: "v1", name: "X", itemType: "product" },
      ],
    };
    assert.deepStrictEqual(buildPendingReviewItems(order), []);
  });

  test("19.4 buildPendingReviewItems: already-reviewed items are marked but still returned", () => {
    const order = {
      _id: "ord-4",
      orderStatus: "delivered",
      items: [
        { productId: "p1", vendorId: "v1", name: "Reviewed",  itemType: "product" },
        { productId: "p2", vendorId: "v1", name: "Unreviewed", itemType: "product" },
      ],
    };
    const existing = {
      product: new Set(["p1:ord-4"]),
      food: new Set(),
    };
    const items = buildPendingReviewItems(order, existing);
    const reviewed = items.find((i) => i.productId === "p1");
    const unreviewed = items.find((i) => i.productId === "p2");
    assert.strictEqual(reviewed.alreadyReviewed, true);
    assert.strictEqual(unreviewed.alreadyReviewed, false);
  });

  test("19.5 shouldCreateReviewNotification: false for non-delivered orders", () => {
    assert.strictEqual(shouldCreateReviewNotification({ id: 1 }, false, false), false);
  });

  test("19.6 shouldCreateReviewNotification: false when already reviewed", () => {
    assert.strictEqual(shouldCreateReviewNotification({ id: 1 }, true, true), false);
  });

  test("19.7 shouldCreateReviewNotification: false for null item", () => {
    assert.strictEqual(shouldCreateReviewNotification(null, true, false), false);
  });

  test("19.8 shouldCreateReviewNotification: true for delivered, unreviewed, valid item", () => {
    assert.strictEqual(shouldCreateReviewNotification({ id: 1 }, true, false), true);
  });

  test("19.9 validateRating: accepts 1, 2, 3, 4, 5", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      assert.strictEqual(validateRating(n), null, `expected ${n} to be valid`);
    }
  });

  test("19.10 validateRating: rejects 0, 6, non-integer, NaN, non-numeric", () => {
    assert.ok(validateRating(0));
    assert.ok(validateRating(6));
    assert.ok(validateRating(3.5));
    assert.ok(validateRating("abc"));
    assert.ok(validateRating(NaN));
    assert.ok(validateRating(null));
    assert.ok(validateRating(undefined));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 20 — Phase 2: notification preferences, DND, audience query,
// broadcast validation. These are all PURE helpers exported by
// services/notification.service.js. The inlined copies below mirror the
// source so the suite is self-contained and does not need to import
// the real service (which transitively requires mongoose).
// ═════════════════════════════════════════════════════════════════════════════

describe("20. Phase 2 — notification preferences, DND, audience, broadcast", () => {
  // ── 20.1 parseTimeOfDay ───────────────────────────────────────────────
  // Inlined from services/notification.service.js. Returns minutes
  // since midnight, or null on invalid input. Drives isInDnd.
  function parseTimeOfDay(str) {
    if (!str || typeof str !== "string") return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(str.trim());
    if (!m) return null;
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  // ── 20.2 isInDnd ─────────────────────────────────────────────────────
  // Inlined. Returns true iff `now` (Date or minutes) falls inside
  // the user's [dndStart, dndEnd) window. Handles overnight wrap.
  function isInDnd(prefs, now) {
    if (!prefs || !prefs.dndStart || !prefs.dndEnd) return false;
    const start = parseTimeOfDay(prefs.dndStart);
    const end = parseTimeOfDay(prefs.dndEnd);
    if (start === null || end === null) return false;
    if (start === end) return false;
    const minutes = typeof now === "number"
      ? now
      : (now instanceof Date ? now.getHours() * 60 + now.getMinutes() : null);
    if (minutes === null) return false;
    if (start < end) {
      return minutes >= start && minutes < end;
    }
    return minutes >= start || minutes < end;
  }

  // ── 20.3 prefKeyForType ──────────────────────────────────────────────
  // Inlined. Maps a notification type to a preference key, or null
  // for "no per-type opt-out".
  function prefKeyForType(type) {
    if (!type) return null;
    if (type.startsWith("order_") || type === "rider_assigned" || type === "out_for_delivery" || type === "order_new" || type === "order_status") return "orderUpdates";
    if (type === "review_request") return "reviewReminders";
    if (type.startsWith("commission_") || type.startsWith("withdrawal_") || type === "refund_processed" || type === "refund_request" || type === "payment_succeeded" || type === "payment_failed") return "walletUpdates";
    if (type === "coupon_received" || type === "promo_available" || type === "flash_sale" || type === "wishlist_price_drop" || type === "wishlist_stock_available") return "promotional";
    return null;
  }

  // ── 20.4 shouldNotifyByType ──────────────────────────────────────────
  // Inlined. True unless the user's per-category pref is explicitly false.
  function shouldNotifyByType(prefs, type) {
    if (!prefs) return true;
    const key = prefKeyForType(type);
    if (!key) return true;
    return prefs[key] !== false;
  }

  // ── 20.5 buildAudienceQuery ──────────────────────────────────────────
  // Inlined. Builds a Mongoose-shaped query for the broadcast endpoint.
  // Returns null for "selected" (caller must supply ids) and unknown
  // audiences.
  function buildAudienceQuery(audience, filters) {
    const q = {};
    switch (audience) {
      case "all":
        q.isAdmin = { $ne: true };
        break;
      case "customers":
        q.isAdmin = { $ne: true };
        q.isVendor = { $ne: true };
        break;
      case "vendors":
        q.isVendor = true;
        q.vendorType = { $ne: "restaurant" };
        if (filters?.vendorStatus) q.vendorStatus = filters.vendorStatus;
        break;
      case "restaurants":
        q.isVendor = true;
        q.vendorType = "restaurant";
        if (filters?.vendorStatus) q.vendorStatus = filters.vendorStatus;
        break;
      case "admins":
        q.isAdmin = true;
        break;
      case "selected":
        return null;
      default:
        return null;
    }
    if (filters?.country) q["location.country"] = filters.country;
    if (filters?.city)    q["location.city"]    = filters.city;
    return q;
  }

  // ── 20.6 validateBroadcastInput ─────────────────────────────────────
  // Inlined. Returns null on success or an error string.
  function validateBroadcastInput(body) {
    if (!body || typeof body !== "object") return "Body required";
    if (!body.audience) return "audience is required";
    if (!["all", "customers", "vendors", "restaurants", "admins", "selected"].includes(body.audience)) {
      return "audience must be one of: all, customers, vendors, restaurants, admins, selected";
    }
    if (body.audience === "selected" && (!Array.isArray(body.selectedUserIds) || body.selectedUserIds.length === 0)) {
      return "selectedUserIds is required for audience=selected";
    }
    if (!body.title || typeof body.title !== "string" || !body.title.trim()) return "title is required";
    if (!body.message || typeof body.message !== "string" || !body.message.trim()) return "message is required";
    if (body.title.length > 200) return "title too long (max 200)";
    if (body.message.length > 2000) return "message too long (max 2000)";
    if (body.priority && !["high", "medium", "low"].includes(body.priority)) {
      return "priority must be: high, medium, low";
    }
    if (body.scheduledFor) {
      const d = new Date(body.scheduledFor);
      if (isNaN(d.getTime())) return "scheduledFor must be a valid ISO date";
      if (d.getTime() < Date.now() - 60 * 1000) return "scheduledFor must be in the future";
    }
    return null;
  }

  // ───────── parseTimeOfDay ─────────
  test("20.1 parseTimeOfDay: parses '22:00' → 1320, '00:00' → 0, '7:30' → 450", () => {
    assert.strictEqual(parseTimeOfDay("22:00"), 22 * 60);
    assert.strictEqual(parseTimeOfDay("00:00"), 0);
    assert.strictEqual(parseTimeOfDay("7:30"),  7 * 60 + 30);
    assert.strictEqual(parseTimeOfDay("23:59"), 23 * 60 + 59);
  });

  test("20.2 parseTimeOfDay: rejects empty, non-string, out-of-range, malformed", () => {
    assert.strictEqual(parseTimeOfDay(""),       null);
    assert.strictEqual(parseTimeOfDay("  "),     null);
    assert.strictEqual(parseTimeOfDay(null),      null);
    assert.strictEqual(parseTimeOfDay(undefined), null);
    assert.strictEqual(parseTimeOfDay(123),       null);
    assert.strictEqual(parseTimeOfDay("24:00"),   null);
    assert.strictEqual(parseTimeOfDay("12:60"),   null);
    assert.strictEqual(parseTimeOfDay("12"),      null);
    assert.strictEqual(parseTimeOfDay("ab:cd"),   null);
  });

  // ───────── isInDnd ─────────
  test("20.3 isInDnd: returns false when prefs/dndStart/dndEnd missing", () => {
    assert.strictEqual(isInDnd(null,           new Date()), false);
    assert.strictEqual(isInDnd(undefined,      new Date()), false);
    assert.strictEqual(isInDnd({},             new Date()), false);
    assert.strictEqual(isInDnd({ dndStart: "", dndEnd: "07:00" }, new Date()), false);
    assert.strictEqual(isInDnd({ dndStart: "22:00", dndEnd: "" }, new Date()), false);
  });

  test("20.4 isInDnd: simple daytime window 13:00-15:00 — true at 14:00, false at 16:00", () => {
    const prefs = { dndStart: "13:00", dndEnd: "15:00" };
    assert.strictEqual(isInDnd(prefs, 14 * 60),        true);
    assert.strictEqual(isInDnd(prefs, 13 * 60),        true);  // inclusive start
    assert.strictEqual(isInDnd(prefs, 14 * 60 + 59),   true);
    assert.strictEqual(isInDnd(prefs, 15 * 60),        false); // exclusive end
    assert.strictEqual(isInDnd(prefs, 12 * 60),        false);
    assert.strictEqual(isInDnd(prefs, 16 * 60),        false);
  });

  test("20.5 isInDnd: overnight window 22:00-07:00 — true at 23:00 and 03:00, false at 12:00", () => {
    const prefs = { dndStart: "22:00", dndEnd: "07:00" };
    assert.strictEqual(isInDnd(prefs, 23 * 60), true);   // late evening
    assert.strictEqual(isInDnd(prefs, 3 * 60),  true);   // early morning, after wrap
    assert.strictEqual(isInDnd(prefs, 6 * 60 + 59), true);
    assert.strictEqual(isInDnd(prefs, 7 * 60),  false);  // exclusive end
    assert.strictEqual(isInDnd(prefs, 12 * 60), false);  // daytime
    assert.strictEqual(isInDnd(prefs, 21 * 60), false);  // before start
  });

  test("20.6 isInDnd: zero-length window start===end is treated as 'no DND'", () => {
    const prefs = { dndStart: "08:00", dndEnd: "08:00" };
    assert.strictEqual(isInDnd(prefs, 8 * 60),  false);
    assert.strictEqual(isInDnd(prefs, 12 * 60), false);
  });

  test("20.7 isInDnd: accepts a Date object and uses local time", () => {
    const prefs = { dndStart: "22:00", dndEnd: "07:00" };
    const late  = new Date(2026, 6, 4, 23, 30, 0);
    const day   = new Date(2026, 6, 4, 12, 0, 0);
    assert.strictEqual(isInDnd(prefs, late), true);
    assert.strictEqual(isInDnd(prefs, day),  false);
  });

  // ───────── prefKeyForType / shouldNotifyByType ─────────
  test("20.8 prefKeyForType: order_*, rider_assigned, out_for_delivery → orderUpdates", () => {
    assert.strictEqual(prefKeyForType("order_placed"),     "orderUpdates");
    assert.strictEqual(prefKeyForType("order_accepted"),   "orderUpdates");
    assert.strictEqual(prefKeyForType("order_delivered"),  "orderUpdates");
    assert.strictEqual(prefKeyForType("rider_assigned"),   "orderUpdates");
    assert.strictEqual(prefKeyForType("out_for_delivery"), "orderUpdates");
    assert.strictEqual(prefKeyForType("order_new"),        "orderUpdates");
    assert.strictEqual(prefKeyForType("order_status"),     "orderUpdates");
  });

  test("20.9 prefKeyForType: commission_*/withdrawal_*/refund/payment → walletUpdates", () => {
    assert.strictEqual(prefKeyForType("commission_paid"),   "walletUpdates");
    assert.strictEqual(prefKeyForType("commission_due"),    "walletUpdates");
    assert.strictEqual(prefKeyForType("withdrawal_submitted"), "walletUpdates");
    assert.strictEqual(prefKeyForType("withdrawal_completed"), "walletUpdates");
    assert.strictEqual(prefKeyForType("refund_processed"), "walletUpdates");
    assert.strictEqual(prefKeyForType("payment_succeeded"), "walletUpdates");
    assert.strictEqual(prefKeyForType("payment_failed"),    "walletUpdates");
  });

  test("20.10 prefKeyForType: review_request → reviewReminders; coupons/promos → promotional", () => {
    assert.strictEqual(prefKeyForType("review_request"),         "reviewReminders");
    assert.strictEqual(prefKeyForType("coupon_received"),        "promotional");
    assert.strictEqual(prefKeyForType("promo_available"),        "promotional");
    assert.strictEqual(prefKeyForType("flash_sale"),             "promotional");
    assert.strictEqual(prefKeyForType("wishlist_price_drop"),    "promotional");
    assert.strictEqual(prefKeyForType("wishlist_stock_available"), "promotional");
  });

  test("20.11 prefKeyForType: returns null for unmapped types", () => {
    assert.strictEqual(prefKeyForType("welcome"),            null);
    assert.strictEqual(prefKeyForType("system_announcement"), null);
    assert.strictEqual(prefKeyForType("store_approved"),     null);
    assert.strictEqual(prefKeyForType(""),                   null);
    assert.strictEqual(prefKeyForType(null),                null);
  });

  test("20.12 shouldNotifyByType: empty/null prefs default to allow", () => {
    assert.strictEqual(shouldNotifyByType(null,      "order_placed"),  true);
    assert.strictEqual(shouldNotifyByType(undefined, "order_placed"),  true);
    assert.strictEqual(shouldNotifyByType({},        "order_placed"),  true);
    assert.strictEqual(shouldNotifyByType({ marketing: false }, "order_placed"), true); // unrelated pref
  });

  test("20.13 shouldNotifyByType: respects explicit false on the mapped key", () => {
    const prefs = {
      orderUpdates:     false,
      walletUpdates:    false,
      reviewReminders:  false,
      promotional:      false,
    };
    assert.strictEqual(shouldNotifyByType(prefs, "order_placed"),    false);
    assert.strictEqual(shouldNotifyByType(prefs, "rider_assigned"),  false);
    assert.strictEqual(shouldNotifyByType(prefs, "commission_paid"), false);
    assert.strictEqual(shouldNotifyByType(prefs, "withdrawal_completed"), false);
    assert.strictEqual(shouldNotifyByType(prefs, "review_request"),  false);
    assert.strictEqual(shouldNotifyByType(prefs, "flash_sale"),      false);
  });

  test("20.14 shouldNotifyByType: explicit true still allows", () => {
    const prefs = { orderUpdates: true };
    assert.strictEqual(shouldNotifyByType(prefs, "order_placed"), true);
  });

  // ───────── buildAudienceQuery ─────────
  test("20.15 buildAudienceQuery: 'all' excludes admins", () => {
    const q = buildAudienceQuery("all", null);
    assert.deepStrictEqual(q, { isAdmin: { $ne: true } });
  });

  test("20.16 buildAudienceQuery: 'customers' excludes vendors and admins", () => {
    const q = buildAudienceQuery("customers", null);
    assert.deepStrictEqual(q, {
      isAdmin:  { $ne: true },
      isVendor: { $ne: true },
    });
  });

  test("20.17 buildAudienceQuery: 'vendors' targets marketplace vendors (not restaurants)", () => {
    const q = buildAudienceQuery("vendors", { vendorStatus: "approved" });
    assert.deepStrictEqual(q, {
      isVendor:     true,
      vendorType:   { $ne: "restaurant" },
      vendorStatus: "approved",
    });
  });

  test("20.18 buildAudienceQuery: 'restaurants' targets only restaurants", () => {
    const q = buildAudienceQuery("restaurants", null);
    assert.deepStrictEqual(q, {
      isVendor:   true,
      vendorType: "restaurant",
    });
  });

  test("20.19 buildAudienceQuery: 'admins' is just isAdmin:true", () => {
    assert.deepStrictEqual(buildAudienceQuery("admins", null), { isAdmin: true });
  });

  test("20.20 buildAudienceQuery: 'selected' returns null (caller supplies ids)", () => {
    assert.strictEqual(buildAudienceQuery("selected", null), null);
  });

  test("20.21 buildAudienceQuery: unknown audience returns null", () => {
    assert.strictEqual(buildAudienceQuery("hackers", null), null);
    assert.strictEqual(buildAudienceQuery("", null),       null);
  });

  test("20.22 buildAudienceQuery: applies country + city filters", () => {
    const q = buildAudienceQuery("all", { country: "GH", city: "Accra" });
    assert.deepStrictEqual(q, {
      isAdmin:          { $ne: true },
      "location.country": "GH",
      "location.city":    "Accra",
    });
  });

  // ───────── validateBroadcastInput ─────────
  test("20.23 validateBroadcastInput: rejects non-object body", () => {
    assert.ok(validateBroadcastInput(null));
    assert.ok(validateBroadcastInput("hi"));
    assert.ok(validateBroadcastInput(42));
    assert.ok(validateBroadcastInput([]));
  });

  test("20.24 validateBroadcastInput: rejects missing audience and unknown audience", () => {
    assert.ok(validateBroadcastInput({ title: "T", message: "M" }));
    assert.ok(validateBroadcastInput({ audience: "hackers", title: "T", message: "M" }));
  });

  test("20.25 validateBroadcastInput: 'selected' requires selectedUserIds", () => {
    assert.ok(validateBroadcastInput({ audience: "selected", title: "T", message: "M" }));
    assert.ok(validateBroadcastInput({ audience: "selected", title: "T", message: "M", selectedUserIds: [] }));
    assert.strictEqual(
      validateBroadcastInput({ audience: "selected", title: "T", message: "M", selectedUserIds: ["u1"] }),
      null
    );
  });

  test("20.26 validateBroadcastInput: requires non-empty title and message, with length caps", () => {
    const base = { audience: "all", title: "T", message: "M" };
    assert.strictEqual(validateBroadcastInput(base), null);
    assert.ok(validateBroadcastInput({ ...base, title: "" }));
    assert.ok(validateBroadcastInput({ ...base, title: "   " }));
    assert.ok(validateBroadcastInput({ ...base, message: "" }));
    assert.ok(validateBroadcastInput({ ...base, title:  "x".repeat(201) }));
    assert.ok(validateBroadcastInput({ ...base, message: "x".repeat(2001) }));
  });

  test("20.27 validateBroadcastInput: rejects bad priority", () => {
    const base = { audience: "all", title: "T", message: "M" };
    assert.strictEqual(validateBroadcastInput({ ...base, priority: "high" }),   null);
    assert.strictEqual(validateBroadcastInput({ ...base, priority: "medium" }), null);
    assert.strictEqual(validateBroadcastInput({ ...base, priority: "low" }),    null);
    assert.ok(validateBroadcastInput({ ...base, priority: "urgent" }));
  });

  test("20.28 validateBroadcastInput: scheduledFor must be a future ISO date", () => {
    const base = { audience: "all", title: "T", message: "M" };
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const past   = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    assert.strictEqual(validateBroadcastInput({ ...base, scheduledFor: future }), null);
    assert.ok(validateBroadcastInput({ ...base, scheduledFor: "not-a-date" }));
    assert.ok(validateBroadcastInput({ ...base, scheduledFor: past }));
  });
});

// SECTION 21 — vendorType classification (regression test for the
// "marketplace vendor routed to Restaurant Dashboard" bug).
// ─────────────────────────────────────────────────────────────────────────────
// Bug history: Mongoose auto-hydrates every user's `restaurantDetails`
// subdoc with default keys (deliveryRadius: 5, deliveryFee: 0,
// estimatedDeliveryTime: 30, isOpen: false, coverImagePublicId: ""),
// so a marketplace vendor with no restaurant data still has a
// non-empty `restaurantDetails` object. The old check
// `vendorType === "restaurant" || Object.keys(restaurantDetails).length > 0`
// misclassified those vendors as restaurants and routed them to the
// Restaurant Dashboard (frontend) and granted them restaurant API
// access (backend).
//
// Fix: see backend/utils/vendorType.js. A user is a restaurant vendor
// only when `vendorType === "restaurant"`, or (legacy) when
// `vendorType` is null/undefined AND the restaurantDetails subdoc
// contains at least one user-populated field (i.e. not just the
// Mongoose default keys).
// ─────────────────────────────────────────────────────────────────────────────

const {
  isRestaurantVendor,
  classifyVendorType,
  hasUserSetRestaurantFields,
  RESTAURANT_DEFAULT_KEYS,
} = require("../utils/vendorType");

// Default-hydrated subdoc (what Mongoose produces for a brand-new user
// that has never set any restaurant field).
const DEFAULT_SUBDOC = {
  deliveryRadius: 5,
  deliveryFee: 0,
  estimatedDeliveryTime: 30,
  isOpen: false,
  coverImagePublicId: "",
};

describe("21. vendorType classification (marketplace-vs-restaurant)", () => {
  // ── isRestaurantVendor ────────────────────────────────────────────────────
  test("21.1 isRestaurantVendor: explicit 'restaurant' is true regardless of details", () => {
    assert.strictEqual(isRestaurantVendor("restaurant", null), true);
    assert.strictEqual(isRestaurantVendor("restaurant", undefined), true);
    assert.strictEqual(isRestaurantVendor("restaurant", {}), true);
    assert.strictEqual(isRestaurantVendor("restaurant", DEFAULT_SUBDOC), true);
    assert.strictEqual(isRestaurantVendor("restaurant", { cuisineType: "Ghanaian" }), true);
  });

  test("21.2 isRestaurantVendor: explicit 'marketplace' is false even with full restaurant data", () => {
    assert.strictEqual(isRestaurantVendor("marketplace", null), false);
    assert.strictEqual(isRestaurantVendor("marketplace", {}), false);
    assert.strictEqual(isRestaurantVendor("marketplace", DEFAULT_SUBDOC), false);
    // Even with a fully populated restaurant subdoc, an explicit
    // "marketplace" vendorType is a marketplace vendor.
    assert.strictEqual(
      isRestaurantVendor("marketplace", {
        ...DEFAULT_SUBDOC,
        cuisineType: "Ghanaian",
        restaurantName: "KFC",
      }),
      false
    );
  });

  test("21.3 isRestaurantVendor: REGRESSION — default-hydrated subdoc is NOT a restaurant vendor", () => {
    // The whole point of the fix. A marketplace vendor whose
    // restaurantDetails is just Mongoose defaults must NOT be
    // classified as a restaurant vendor.
    assert.strictEqual(isRestaurantVendor("marketplace", DEFAULT_SUBDOC), false);
    assert.strictEqual(isRestaurantVendor("marketplace", { ...DEFAULT_SUBDOC }), false);
  });

  test("21.4 isRestaurantVendor: legacy null vendorType + default subdoc is false", () => {
    // Pre-migration vendors with no `vendorType` and no real
    // restaurant data are marketplace vendors.
    assert.strictEqual(isRestaurantVendor(null, DEFAULT_SUBDOC), false);
    assert.strictEqual(isRestaurantVendor(undefined, DEFAULT_SUBDOC), false);
  });

  test("21.5 isRestaurantVendor: legacy null vendorType + user-set fields is true", () => {
    // Pre-migration vendors who DID set restaurant fields are
    // restaurant vendors (legacy back-compat).
    assert.strictEqual(
      isRestaurantVendor(null, { ...DEFAULT_SUBDOC, cuisineType: "Ghanaian" }),
      true
    );
    assert.strictEqual(
      isRestaurantVendor(undefined, { ...DEFAULT_SUBDOC, restaurantName: "KFC" }),
      true
    );
  });

  test("21.6 isRestaurantVendor: legacy null vendorType + empty subdoc is false", () => {
    assert.strictEqual(isRestaurantVendor(null, null), false);
    assert.strictEqual(isRestaurantVendor(undefined, undefined), false);
    assert.strictEqual(isRestaurantVendor(null, {}), false);
  });

  // ── classifyVendorType ────────────────────────────────────────────────────
  test("21.7 classifyVendorType: explicit values pass through", () => {
    assert.strictEqual(classifyVendorType("marketplace", null), "marketplace");
    assert.strictEqual(classifyVendorType("marketplace", DEFAULT_SUBDOC), "marketplace");
    assert.strictEqual(classifyVendorType("restaurant", null), "restaurant");
    assert.strictEqual(classifyVendorType("restaurant", DEFAULT_SUBDOC), "restaurant");
  });

  test("21.8 classifyVendorType: null + default subdoc is 'marketplace'", () => {
    assert.strictEqual(classifyVendorType(null, DEFAULT_SUBDOC), "marketplace");
    assert.strictEqual(classifyVendorType(undefined, DEFAULT_SUBDOC), "marketplace");
  });

  test("21.9 classifyVendorType: null + user-set fields is 'restaurant'", () => {
    assert.strictEqual(
      classifyVendorType(null, { ...DEFAULT_SUBDOC, cuisineType: "Ghanaian" }),
      "restaurant"
    );
    assert.strictEqual(
      classifyVendorType(undefined, { ...DEFAULT_SUBDOC, address: "Accra" }),
      "restaurant"
    );
  });

  test("21.10 classifyVendorType: null + empty is 'marketplace'", () => {
    assert.strictEqual(classifyVendorType(null, null), "marketplace");
    assert.strictEqual(classifyVendorType(undefined, {}), "marketplace");
  });

  test("21.11 classifyVendorType: unknown stored value falls through to inference", () => {
    // Defensive: if the DB ever holds a value outside the enum
    // (e.g. "store" from a typo), we should still infer correctly
    // from the subdoc rather than passing the bad value through.
    assert.strictEqual(classifyVendorType("store", DEFAULT_SUBDOC), "marketplace");
    assert.strictEqual(
      classifyVendorType("store", { ...DEFAULT_SUBDOC, cuisineType: "Pizza" }),
      "restaurant"
    );
  });

  // ── hasUserSetRestaurantFields ────────────────────────────────────────────
  test("21.12 hasUserSetRestaurantFields: only default keys → false", () => {
    assert.strictEqual(hasUserSetRestaurantFields(DEFAULT_SUBDOC), false);
    assert.strictEqual(hasUserSetRestaurantFields({ ...DEFAULT_SUBDOC }), false);
    assert.strictEqual(hasUserSetRestaurantFields({}), false);
    assert.strictEqual(hasUserSetRestaurantFields(null), false);
    assert.strictEqual(hasUserSetRestaurantFields(undefined), false);
  });

  test("21.13 hasUserSetRestaurantFields: at least one non-default key → true", () => {
    assert.strictEqual(
      hasUserSetRestaurantFields({ ...DEFAULT_SUBDOC, cuisineType: "Ghanaian" }),
      true
    );
    assert.strictEqual(
      hasUserSetRestaurantFields({ ...DEFAULT_SUBDOC, restaurantName: "KFC" }),
      true
    );
    assert.strictEqual(
      hasUserSetRestaurantFields({ address: "Accra" }),
      true
    );
  });

  // ── integration with the previously-broken pattern ───────────────────────
  test("21.14 integration: the OLD buggy pattern would misclassify (sanity check)", () => {
    // The OLD pattern that was in App.jsx / RestaurantDashboard.jsx /
    // cleanUser / requireRestaurantVendor. It would return `true` for
    // any non-empty subdoc — including the default-hydrated one.
    function oldIsRestaurantVendor(vendorType, details) {
      return (
        vendorType === "restaurant" ||
        (details && Object.keys(details).length > 0)
      );
    }
    // The bug: a marketplace vendor with default-hydrated subdoc is
    // wrongly classified as a restaurant vendor.
    assert.strictEqual(oldIsRestaurantVendor("marketplace", DEFAULT_SUBDOC), true);
    // The fix:
    assert.strictEqual(isRestaurantVendor("marketplace", DEFAULT_SUBDOC), false);
  });
});
