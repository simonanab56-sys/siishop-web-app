// One-shot patcher for restaurant-reviews and products. Run: node patch-restaurant-products.js
const fs = require("fs");
const path = require("path");

// ── restaurant-reviews.js: notify the restaurant of a new review ──
const rp = path.join(__dirname, "backend", "routes", "restaurant-reviews.js");
let rrc = fs.readFileSync(rp, "utf8");
if (!rrc.match(/notifyUser.*new_review/)) {
  rrc = rrc.replace(
    'const { requireAuth } = require("../middleware/auth");',
    'const { requireAuth } = require("../middleware/auth");\nconst { notifyUser } = require("../services/notification.service");'
  );
  rrc = rrc.replace(
    '    const newReview = await RestaurantReview.create({',
    `    // Phase 2: notify the restaurant vendor of a new review
    const _reviewer = await User.findById(req.userId).select("name").lean();
    const _orderForReview = await Order.findById(orderId).select("restaurantId").lean();
    if (_orderForReview && _orderForReview.restaurantId) {
      notifyUser(_orderForReview.restaurantId, {
        type: "new_review",
        title: "New customer review",
        message: \`\${_reviewer?.name || "A customer"} left a \${rating}-star review.\`,
        reviewId: newReview._id,
        restaurantId: _orderForReview.restaurantId,
        deepLink: "/restaurant-dashboard?tab=reviews",
        priority: "medium",
      }).catch(() => {});
    }
    const newReview = await RestaurantReview.create({`
  );
  // We need User and Order imports. Check if present; if not, add.
  if (!rrc.match(/require\("\.\.\/models\/User"\)/)) {
    rrc = rrc.replace(
      'const Order = require("../models/Order");',
      'const Order = require("../models/Order");\nconst User = require("../models/User");'
    );
  }
  fs.writeFileSync(rp, rrc, "utf8");
  console.log("restaurant-reviews.js patched");
} else {
  console.log("restaurant-reviews.js already patched");
}

// ── products.js: low-stock + new review notifications ──
const pp = path.join(__dirname, "backend", "routes", "products.js");
let pc = fs.readFileSync(pp, "utf8");
if (!pc.match(/check-low-stock/)) {
  // Add import
  pc = pc.replace(
    'const { prepareProductForSave } = require("../services/product.service");',
    'const { prepareProductForSave } = require("../services/product.service");\nconst { notifyUser } = require("../services/notification.service");'
  );

  // Append new admin/cron route before the final module.exports.
  const newRoute = `

// ── ADMIN / CRON: low-stock + out-of-stock sweep ────────────────────────────
// Scans marketplace products and notifies the vendor of any whose stock
// has crossed the threshold (low_stock at <=5, out_of_stock at 0). Safe
// to call repeatedly — uses an idempotency guard via metadata.productStock
// + type+productId composite.
router.post("/check-low-stock", requireAuth, requireAdmin, async (req, res) => {
  try {
    const LOW_THRESHOLD = 5;
    const Product = require("../models/Product");
    const products = await Product.find({
      isDeleted: { $ne: true },
      productType: { $ne: "food" },
    })
      .select("_id name stock vendorId")
      .lean();

    let lowNotified = 0;
    let outNotified = 0;
    for (const p of products) {
      if (!p.vendorId) continue;
      if (p.stock === 0) {
        await notifyUser(p.vendorId, {
          type: "product_out_of_stock",
          title: "Product out of stock",
          message: \`"\${p.name}" is now out of stock. Restock to keep it visible.\`,
          productId: p._id,
          vendorId: p.vendorId,
          deepLink: \`/vendor?tab=products\`,
          priority: "high",
        });
        outNotified += 1;
      } else if (p.stock <= LOW_THRESHOLD) {
        await notifyUser(p.vendorId, {
          type: "product_low_stock",
          title: "Product low on stock",
          message: \`"\${p.name}" is down to \${p.stock} left. Consider restocking.\`,
          productId: p._id,
          vendorId: p.vendorId,
          deepLink: \`/vendor?tab=products\`,
          priority: "medium",
        });
        lowNotified += 1;
      }
    }
    res.json({ ok: true, lowNotified, outNotified, scanned: products.length });
  } catch (err) {
    console.error("[products] low-stock check failed:", err.message);
    res.status(500).json({ error: "Low-stock check failed" });
  }
});
`;
  // Insert before the final `module.exports = router;` (or end of file)
  if (pc.match(/module\.exports\s*=\s*router\s*;?\s*$/)) {
    pc = pc.replace(/module\.exports\s*=\s*router\s*;?\s*$/, newRoute + "\nmodule.exports = router;");
  } else {
    pc = pc + newRoute + "\nmodule.exports = router;";
  }
  fs.writeFileSync(pp, pc, "utf8");
  console.log("products.js patched");
} else {
  console.log("products.js already patched");
}
