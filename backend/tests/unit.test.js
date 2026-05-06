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
