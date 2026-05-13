// AboutPage.jsx — About SiiShop
import { useState } from "react";
import styles from "./AboutPage.module.css";

export default function AboutPage({ onNavigate }) {
  return (
    <div className={styles.page}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>Welcome to <span className={styles.brand}>SiiShop</span></h1>
          <p className={styles.heroSubtitle}>
            Your trusted multi-vendor marketplace connecting local vendors with customers across Ghana and beyond.
          </p>
          <div className={styles.heroCtas}>
            <button className={`btn btn-primary ${styles.ctaBtn}`} onClick={() => onNavigate?.("home")}>
              Start Shopping
            </button>
            <button className={`btn btn-secondary ${styles.ctaBtn}`} onClick={() => onNavigate?.("vendor")}>
              Become a Vendor
            </button>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className={styles.section}>
        <div className="container">
          <h2 className={styles.sectionTitle}>Our Mission</h2>
          <p className={styles.sectionText}>
            SiiShop exists to empower local businesses and entrepreneurs by providing them with a powerful online platform to reach more customers. We believe everyone should have access to quality products from trusted local vendors, right at their fingertips.
          </p>
        </div>
      </section>

      {/* Who We Help */}
      <section className={`${styles.section} ${styles.altBg}`}>
        <div className="container">
          <h2 className={styles.sectionTitle}>Who We Serve</h2>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardIcon}>🛒</div>
              <h3>Customers</h3>
              <p>Browse thousands of products from verified local vendors. Shop with confidence knowing you're supporting local businesses.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}>🏪</div>
              <h3>Vendors</h3>
              <p>Launch your online store in minutes. Reach customers beyond your physical location and grow your business.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}>📦</div>
              <h3>Entrepreneurs</h3>
              <p>Start selling with zero upfront costs. Our platform provides all the tools you need to succeed.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className={styles.section}>
        <div className="container">
          <h2 className={styles.sectionTitle}>Why Choose SiiShop</h2>
          <div className={styles.benefitsList}>
            <div className={styles.benefitItem}>
              <span className={styles.benefitIcon}>✓</span>
              <div>
                <h4>Verified Vendors</h4>
                <p>Every vendor is verified to ensure authentic products and reliable service.</p>
              </div>
            </div>
            <div className={styles.benefitItem}>
              <span className={styles.benefitIcon}>✓</span>
              <div>
                <h4>Secure Payments</h4>
                <p>Your payments are secured with Paystack, a trusted payment gateway.</p>
              </div>
            </div>
            <div className={styles.benefitItem}>
              <span className={styles.benefitIcon}>✓</span>
              <div>
                <h4>Cash on Delivery</h4>
                <p>Pay when you receive your order - no online payment required.</p>
              </div>
            </div>
            <div className={styles.benefitItem}>
              <span className={styles.benefitIcon}>✓</span>
              <div>
                <h4>Multi-Vendor Marketplace</h4>
                <p>One platform, thousands of vendors, millions of products.</p>
              </div>
            </div>
            <div className={styles.benefitItem}>
              <span className={styles.benefitIcon}>✓</span>
              <div>
                <h4>Easy Returns</h4>
                <p>Clear refund and delivery policies protect your purchases.</p>
              </div>
            </div>
            <div className={styles.benefitItem}>
              <span className={styles.benefitIcon}>✓</span>
              <div>
                <h4>24/7 Support</h4>
                <p>We're here to help whenever you need us.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.ctaSection}>
        <div className="container">
          <h2>Ready to Get Started?</h2>
          <p>Join thousands of customers and vendors already using SiiShop</p>
          <div className={styles.heroCtas}>
            <button className={`btn btn-primary ${styles.ctaBtn}`} onClick={() => onNavigate?.("home")}>
              Start Shopping
            </button>
            <button className={`btn btn-secondary ${styles.ctaBtn}`} onClick={() => onNavigate?.("vendor")}>
              Become a Vendor
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}