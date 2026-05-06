/**
 * VendorStatusBanner.jsx
 * 
 * Displays vendor account status:
 * - PENDING: "Your vendor account is under review"
 * - REJECTED: "Your vendor request was rejected" + reason
 * - APPROVED: No banner (full access)
 */

import { useAuth } from "../context/AuthContext";
import styles from "./VendorStatusBanner.module.css";

export default function VendorStatusBanner() {
  const { user, isApprovedVendor } = useAuth();

  // Only show for vendors who are NOT approved
  if (!user?.isVendor || isApprovedVendor) {
    return null;
  }

  const isPending = user.vendorStatus === "pending";
  const isRejected = user.vendorStatus === "rejected";

  if (isPending) {
    return (
      <div className={`${styles.banner} ${styles.pending}`}>
        <div className={styles.icon}>⏳</div>
        <div className={styles.content}>
          <h3>Vendor Account Under Review</h3>
          <p>Your vendor application is being reviewed by our team. You'll receive an email notification once approved.</p>
        </div>
      </div>
    );
  }

  if (isRejected) {
    return (
      <div className={`${styles.banner} ${styles.rejected}`}>
        <div className={styles.icon}>❌</div>
        <div className={styles.content}>
          <h3>Vendor Request Rejected</h3>
          <p>{user.vendorRejectedReason || "Your vendor request was rejected. Please contact support for more information."}</p>
        </div>
      </div>
    );
  }

  return null;
}
