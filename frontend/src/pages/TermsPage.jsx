// TermsPage.jsx — Terms & Conditions
import styles from "./PolicyPage.module.css";

export default function TermsPage() {
  return (
    <div className={styles.page}>
      <div className="container">
        <h1 className={styles.pageTitle}>Terms & Conditions</h1>
        <p className={styles.lastUpdated}>Last updated: May 2026</p>

        <div className={styles.content}>
          <section className={styles.section}>
            <h2>1. Marketplace Terms</h2>
            <p>SiiShop is a multi-vendor marketplace platform that connects buyers with independent vendors. By using our platform, you agree to these terms and our <a href="/privacy-policy">Privacy Policy</a>.</p>
          </section>

          <section className={styles.section}>
            <h2>2. User Responsibilities</h2>
            <p>As a user, you agree to:</p>
            <ul>
              <li>Provide accurate and complete information</li>
              <li>Maintain the security of your account</li>
              <li>Not use the platform for illegal purposes</li>
              <li>Not attempt to gain unauthorized access to any part of the platform</li>
              <li>Not interfere with the operation of the platform</li>
              <li>Not engage in fraudulent activities</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>3. Vendor Responsibilities</h2>
            <p>Vendors on SiiShop must:</p>
            <ul>
              <li>Provide accurate product descriptions and pricing</li>
              <li>Only sell products that are legal and permitted</li>
              <li>Fulfill orders within the promised timeframe</li>
              <li>Maintain accurate store information</li>
              <li>Respond to customer inquiries promptly</li>
              <li>Comply with all applicable laws and regulations</li>
              <li>Not engage in price manipulation or false advertising</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>4. Payment Terms</h2>
            <p>Payment terms include:</p>
            <ul>
              <li>All prices are in Ghana Cedis (GHS) unless stated otherwise</li>
              <li>Payments are processed securely through Paystack</li>
              <li>Cash on Delivery is available for eligible orders</li>
              <li>Payment must be completed before order fulfillment</li>
              <li>Refunds are processed according to our Refund Policy</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>5. Refund Terms</h2>
            <p>Our refund policy covers:</p>
            <ul>
              <li>Non-delivered orders</li>
              <li>Damaged or defective products</li>
              <li>Wrong items received</li>
              <li>Products significantly not as described</li>
            </ul>
            <p>Please see our <a href="/refund-policy">Refund & Delivery Policy</a> for full details.</p>
          </section>

          <section className={styles.section}>
            <h2>6. Prohibited Products</h2>
            <p>The following are prohibited from sale:</p>
            <ul>
              <li>Illegal items and weapons</li>
              <li>Counterfeit or pirated goods</li>
              <li>Adult content and sexually explicit materials</li>
              <li>Stolen property</li>
              <li>Items that infringe intellectual property rights</li>
              <li>Hazardous or dangerous materials</li>
              <li>Prescription medications without proper authorization</li>
              <li>Any items prohibited by Ghanaian law</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>7. Account Suspension</h2>
            <p>We reserve the right to suspend or terminate accounts that:</p>
            <ul>
              <li>Violate these terms</li>
              <li>Engage in fraudulent activities</li>
              <li>Receive multiple legitimate complaints</li>
              <li>Fail to comply with legal requirements</li>
              <li>Create risk or liability for SiiShop or other users</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>8. Delivery Limitations</h2>
            <p>Delivery terms include:</p>
            <ul>
              <li>Delivery times vary by vendor and location</li>
              <li>Some areas may not be serviceable</li>
              <li>Delivery times are estimates and not guaranteed</li>
              <li>Customers must provide accurate delivery addresses</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>9. Liability Limitations</h2>
            <p>SiiShop's liability is limited to:</p>
            <ul>
              <li>The maximum amount paid for the disputed order</li>
              <li>We are not liable for vendor disputes beyond refund processing</li>
              <li>We are not liable for indirect, incidental, or consequential damages</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>10. Intellectual Property</h2>
            <p>All content on SiiShop, including logos, designs, and code, is our intellectual property. Users may not copy, modify, or distribute our content without permission.</p>
          </section>

          <section className={styles.section}>
            <h2>11. Fraud Prevention</h2>
            <p>We employ various measures to prevent fraud, including:</p>
            <ul>
              <li>Transaction monitoring and verification</li>
              <li>Account security measures</li>
              <li>Payment verification processes</li>
              <li>Reporting suspicious activities to authorities when required</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>Contact Us</h2>
            <p>For questions about these terms, contact us at support@siishop.com</p>
          </section>
        </div>
      </div>
    </div>
  );
}