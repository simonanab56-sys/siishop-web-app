// RefundPolicyPage.jsx — Refund & Delivery Policy
import styles from "./PolicyPage.module.css";

export default function RefundPolicyPage() {
  return (
    <div className={styles.page}>
      <div className="container">
        <h1 className={styles.pageTitle}>Refund & Delivery Policy</h1>
        <p className={styles.lastUpdated}>Last updated: May 2026</p>

        <div className={styles.content}>
          <section className={styles.section}>
            <h2>Delivery Timelines</h2>
            <p>Delivery times vary based on:</p>
            <ul>
              <li><strong>Vendor Location:</strong> Products are shipped from the vendor's location</li>
              <li><strong>Customer Location:</strong> Delivery times may be longer for remote areas</li>
              <li><strong>Product Type:</strong> Some items may require additional processing time</li>
            </ul>
            <p>Estimated delivery times are typically 3-7 business days for local orders. You will receive tracking information once your order is dispatched.</p>
          </section>

          <section className={styles.section}>
            <h2>Cash on Delivery (CoD)</h2>
            <p>Our Cash on Delivery option allows you to pay for your order when it arrives. Rules include:</p>
            <ul>
              <li>CoD is available for orders up to GHS 2,000</li>
              <li>CoD orders cannot be cancelled once placed</li>
              <li>Please ensure someone is available to receive and pay for the order</li>
              <li>Repeated failed CoD deliveries may result in account restrictions</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>Failed Delivery</h2>
            <p>If delivery fails due to:</p>
            <ul>
              <li><strong>Wrong Address:</strong> Please provide accurate delivery information</li>
              <li><strong>No One to Receive:</strong> Ensure someone is available at the delivery address</li>
              <li><strong>Refused Delivery:</strong> Contact us before refusing to discuss options</li>
            </ul>
            <p>For failed deliveries, please contact the vendor or our support team for assistance.</p>
          </section>

          <section className={styles.section}>
            <h2>Refund Eligibility</h2>
            <p>You are eligible for a refund if:</p>
            <ul>
              <li>Your order was not delivered within the estimated timeframe</li>
              <li>You received a damaged or defective product</li>
              <li>You received the wrong item</li>
              <li>The product is significantly different from its description</li>
              <li>The product is not as advertised</li>
            </ul>
            <p>Refunds are not available for:</p>
            <ul>
              <li>Change of mind</li>
              <li>Items that have been used or altered</li>
              <li>Digital products once delivered</li>
              <li>Items damaged by customer misuse</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>Damaged Product Process</h2>
            <p>If you receive a damaged product:</p>
            <ol>
              <li>Take photos of the damage immediately</li>
              <li>Contact the vendor within 48 hours of delivery</li>
              <li>Provide order number and photos</li>
              <li>The vendor will arrange for return and refund</li>
            </ol>
            <p>Do not use or alter the damaged item before contacting us.</p>
          </section>

          <section className={styles.section}>
            <h2>Wrong Item Handling</h2>
            <p>If you receive the wrong item:</p>
            <ol>
              <li>Contact the vendor immediately with your order details</li>
              <li>Do not use the wrong item</li>
              <li>The vendor will arrange for return and send the correct item</li>
              <li>Full refund available if vendor cannot replace the item</li>
            </ol>
          </section>

          <section className={styles.section}>
            <h2>Vendor Responsibility</h2>
            <p>Vendors are responsible for:</p>
            <ul>
              <li>Accurate product descriptions and images</li>
              <li>Proper packaging to prevent damage</li>
              <li>Shipping within stated timeframes</li>
              <li>Responding to customer concerns within 48 hours</li>
              <li>Processing valid refunds within 7 business days</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>Customer Responsibility</h2>
            <p>Customers agree to:</p>
            <ul>
              <li>Provide accurate delivery information</li>
              <li>Be available to receive deliveries</li>
              <li>Inspect packages upon delivery</li>
              <li>Report issues within 48 hours of delivery</li>
              <li>Provide necessary information for claims</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>Payment Reversal Timelines</h2>
            <p>Once a refund is approved:</p>
            <ul>
              <li><strong>Original Payment Method:</strong> 5-10 business days</li>
              <li><strong>Paystack Refund:</strong> 5-10 business days</li>
              <li><strong>Cash on Delivery:</strong> Processed within 7 business days of confirmation</li>
            </ul>
            <p>You will receive email confirmation once the refund is processed.</p>
          </section>

          <section className={styles.section}>
            <h2>Contact Us</h2>
            <p>For refund and delivery concerns:</p>
            <p><strong>Email:</strong> support@siishop.com</p>
            <p><strong>WhatsApp:</strong> +233 50 123 4567</p>
          </section>
        </div>
      </div>
    </div>
  );
}