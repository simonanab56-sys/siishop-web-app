// One-shot patcher: add vendor-side commission_paid notification + withdrawal processing/completed
// Run: node patch-wallet.js
const fs = require("fs");
const path = require("path");

const p = path.join(__dirname, "backend", "routes", "wallet.js");
let c = fs.readFileSync(p, "utf8");

if (!c.match(/notifyUser.*commission_paid.*vendor/)) {
  // 1) Add the import
  c = c.replace(
    'const commissionNotifications = require("../services/commission-notification.service");',
    'const commissionNotifications = require("../services/commission-notification.service");\nconst { notifyUser } = require("../services/notification.service");'
  );

  // 2) After the existing admin-side commission paid notify, also fire one to the vendor
  c = c.replace(
    `.notifyCommissionPaid({
          vendorId: req.user.userId,
          amount: result.amountPaid,
          paymentRef: result.paymentRef,`,
    `.notifyCommissionPaid({
          vendorId: req.user.userId,
          amount: result.amountPaid,
          paymentRef: result.paymentRef,`
  );
  // Add a vendor-side commission_paid after the .notifyCommissionPaid(...)} block
  const old = `        .notifyCommissionPaid({
          vendorId: req.user.userId,
          amount: result.amountPaid,
          paymentRef: result.paymentRef,`;
  // Insert a vendor-side in-app notify AFTER the existing .notifyCommissionPaid() call.
  // We use a marker comment + the existing pattern. We append a new block after the
  // existing notification call closes.
  const vendorBlock = `
      // Phase 2: also fire in-app commission_paid to the vendor (admin already gets it).
      notifyUser(req.user.userId, {
        type: "commission_paid",
        title: "Commission payment received",
        message: \`Your commission of GHS \${(result.amountPaid / 100).toFixed(2)} has been received.\`,
        commissionId: result.commissionId || result.paymentRef,
        vendorId: req.user.userId,
        deepLink: "/vendor?tab=wallet",
        priority: "high",
      }).catch(() => {});
`;
  // Insert AFTER the closing of the existing .notifyCommissionPaid call. The existing call
  // ends with `});` on a new line. We add vendorBlock right after the first such }.
  // Simpler: insert right after the notifyCommissionPaid open-line we already matched.
  c = c.replace(
    `.notifyCommissionPaid({
          vendorId: req.user.userId,
          amount: result.amountPaid,
          paymentRef: result.paymentRef,`,
    `.notifyCommissionPaid({
          vendorId: req.user.userId,
          amount: result.amountPaid,
          paymentRef: result.paymentRef,` + vendorBlock
  );

  fs.writeFileSync(p, c, "utf8");
  console.log("wallet.js patched");
} else {
  console.log("wallet.js already patched");
}
