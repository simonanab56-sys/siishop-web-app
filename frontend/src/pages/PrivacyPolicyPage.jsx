// PrivacyPolicyPage.jsx — Privacy Policy
import styles from "./PolicyPage.module.css";

export default function PrivacyPolicyPage() {
  return (
    <div className={styles.page}>
      <div className="container">
        <h1 className={styles.pageTitle}>Privacy Policy</h1>
        <p className={styles.lastUpdated}>Last updated: May 2026</p>

        <div className={styles.content}>
          <section className={styles.section}>
            <h2>Information We Collect</h2>
            <p>We collect information you provide directly when you create an account, place an order, or contact us. This includes:</p>
            <ul>
              <li>Name and contact information (email, phone number)</li>
              <li>Delivery address for orders</li>
              <li>Payment information (processed securely through Paystack)</li>
              <li>Account credentials (password)</li>
              <li>Communication history with our support team</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>Account Data</h2>
            <p>Your account data includes:</p>
            <ul>
              <li>Profile information you provide</li>
              <li>Order history and preferences</li>
              <li>Vendor store information (for vendors)</li>
              <li>Activity logs for security purposes</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>Payment Processing</h2>
            <p>All payment transactions are processed securely through Paystack, a PCI-DSS Level 1 certified payment gateway. We do not store your full credit card details on our servers.</p>
            <p>For Cash on Delivery orders, we only collect necessary delivery information.</p>
          </section>

          <section className={styles.section}>
            <h2>Cookies and Tracking</h2>
            <p>We use cookies to:</p>
            <ul>
              <li>Keep you logged in during your session</li>
              <li>Remember your preferences and cart</li>
              <li>Understand how you use our platform</li>
              <li>Improve our services based on usage patterns</li>
            </ul>
            <p>You can disable cookies in your browser settings, but some features may not work properly.</p>
          </section>

          <section className={styles.section}>
            <h2>Google Login</h2>
            <p>If you sign in with Google, we receive your basic profile information (name, email, profile picture) from Google. We use this only for authentication and account creation.</p>
          </section>

          <section className={styles.section}>
            <h2>Data Protection</h2>
            <p>We implement appropriate technical and organizational measures to protect your personal data, including:</p>
            <ul>
              <li>Encryption of sensitive data in transit and at rest</li>
              <li>Regular security audits and updates</li>
              <li>Access controls limiting data access to authorized personnel</li>
              <li>Secure storage infrastructure</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>Your Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your data</li>
              <li>Opt-out of marketing communications</li>
            </ul>
            <p>To exercise these rights, contact us at support@siishop.com</p>
          </section>

          <section className={styles.section}>
            <h2>Vendor Information</h2>
            <p>Vendors on our platform share additional business information including store name, description, and product listings. This information is publicly visible as part of the marketplace.</p>
          </section>

          <section className={styles.section}>
            <h2>Future App Store Compliance</h2>
            <p>When we launch our mobile applications on the App Store or Google Play Store, we will comply with all their respective privacy requirements and guidelines.</p>
          </section>

          <section className={styles.section}>
            <h2>Contact Information</h2>
            <p>For privacy-related inquiries, please contact us:</p>
            <p><strong>Email:</strong> support@siishop.com</p>
            <p><strong>WhatsApp:</strong> +233 50 123 4567</p>
          </section>
        </div>
      </div>
    </div>
  );
}