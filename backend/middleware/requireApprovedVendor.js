/**
 * Middleware: requireApprovedVendor
 * 
 * Ensures that:
 * 1. User is authenticated
 * 2. User is a vendor (isVendor === true)
 * 3. User's vendor account is approved (vendorStatus === "approved")
 * 
 * If any condition fails, returns appropriate error message
 */

const requireApprovedVendor = async (req, res, next) => {
  try {
    // ✅ Check if user is authenticated (set by requireAuth middleware)
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // ✅ Check if user is a vendor
    if (!req.user.isVendor) {
      return res.status(403).json({ error: "Only vendors can access this resource" });
    }

    // ✅ Check if vendor account is approved
    if (req.user.vendorStatus !== "approved") {
      let message = "Your vendor account is pending approval";
      
      if (req.user.vendorStatus === "rejected") {
        message = `Your vendor request was rejected: ${req.user.vendorRejectedReason || "No reason provided"}`;
      } else if (req.user.vendorStatus === "suspended") {
        message = "Your vendor account has been suspended";
      }
      
      return res.status(403).json({ error: message });
    }

    // ✅ All checks passed, proceed to next middleware/route
    next();
  } catch (err) {
    console.error("[requireApprovedVendor] Error:", err.message);
    res.status(500).json({ error: "Authorization check failed" });
  }
};

module.exports = requireApprovedVendor;
