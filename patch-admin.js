// One-shot patcher. Run from backend/ directory: node ../patch-admin.js
const fs = require("fs");
const path = require("path");

const p = path.join(__dirname, "backend", "routes", "admin.js");
let c = fs.readFileSync(p, "utf8");

if (c.match(/notifyUser.*store_approved/)) {
  console.log("admin.js already patched");
  process.exit(0);
}

// 1) Add import line after "use strict"
const importLine = '\nconst { notifyUser, notifyAdmins } = require("../services/notification.service");\n';
c = c.replace(/("use strict";\s*\n)/, '$1' + importLine);

// 2) After /vendors/:id/approve → fire store_approved + kyc_approved
const approveOld = `    if (!user) return res.status(404).json({ error: "Vendor not found" });
    res.json(user);
  })
);
/* ──── SUSPEND VENDOR (PATCH) ──── */`;
const approveNew = `    if (!user) return res.status(404).json({ error: "Vendor not found" });

    // Phase 2: notify the vendor of approval (+ KYC result if KYC was pending)
    const isRestaurant = user.vendorType === "restaurant";
    notifyUser(user._id, {
      type: isRestaurant ? "restaurant_approved" : "store_approved",
      title: isRestaurant ? "Restaurant approved" : "Store approved",
      message: isRestaurant
        ? "Your restaurant is now live on SiiShop. You can start accepting orders."
        : "Your store is now live on SiiShop. You can start listing products.",
      vendorId: user._id,
      deepLink: isRestaurant ? "/restaurant-dashboard" : "/vendor",
      priority: "high",
    }).catch(() => {});
    if (user.kycStatus === "pending" || user.kycStatus === "submitted") {
      notifyUser(user._id, {
        type: "kyc_approved",
        title: "KYC approved",
        message: "Your identity verification has been approved.",
        vendorId: user._id,
        deepLink: "/vendor?tab=settings",
        priority: "high",
      }).catch(() => {});
    }
    res.json(user);
  })
);
/* ──── SUSPEND VENDOR (PATCH) ──── */`;
c = c.replace(approveOld, approveNew);

// 3) Suspend → store_suspended / restaurant_suspended
const suspendOld = `      { $set: { vendorStatus: "suspended" } },
      { new: true }
    ).lean();
    if (!user) return res.status(404).json({ error: "Vendor not found" });
    res.json(user);`;
const suspendNew = `      { $set: { vendorStatus: "suspended" } },
      { new: true }
    ).lean();
    if (!user) return res.status(404).json({ error: "Vendor not found" });
    const sIsRestaurant = user.vendorType === "restaurant";
    notifyUser(user._id, {
      type: sIsRestaurant ? "restaurant_suspended" : "store_suspended",
      title: sIsRestaurant ? "Restaurant suspended" : "Store suspended",
      message: sIsRestaurant
        ? "Your restaurant has been suspended. Contact support to restore it."
        : "Your store has been suspended. Contact support to restore it.",
      vendorId: user._id,
      deepLink: "/settings",
      priority: "high",
    }).catch(() => {});`;
c = c.replace(suspendOld, suspendNew);

// 4) Reject → store_rejected / restaurant_rejected + kyc_rejected
const rejectOld = `      { $set: { vendorStatus: "rejected", vendorRejectedReason: reason || "" } },
      { new: true }
    ).lean();
    if (!user) return res.status(404).json({ error: "Vendor not found" });
    res.json(user);`;
const rejectNew = `      { $set: { vendorStatus: "rejected", vendorRejectedReason: reason || "" } },
      { new: true }
    ).lean();
    if (!user) return res.status(404).json({ error: "Vendor not found" });
    const rIsRestaurant = user.vendorType === "restaurant";
    notifyUser(user._id, {
      type: rIsRestaurant ? "restaurant_rejected" : "store_rejected",
      title: rIsRestaurant ? "Restaurant application rejected" : "Vendor application rejected",
      message: reason || "Your application was not accepted. Please contact support for details.",
      vendorId: user._id,
      deepLink: "/settings",
      priority: "high",
    }).catch(() => {});
    notifyUser(user._id, {
      type: "kyc_rejected",
      title: "KYC rejected",
      message: reason || "Your KYC submission was not accepted.",
      vendorId: user._id,
      deepLink: "/settings",
      priority: "high",
    }).catch(() => {});`;
c = c.replace(rejectOld, rejectNew);

fs.writeFileSync(p, c, "utf8");
console.log("admin.js patched");
