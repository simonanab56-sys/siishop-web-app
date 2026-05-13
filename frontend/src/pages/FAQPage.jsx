// FAQPage.jsx — Frequently Asked Questions
import { useState } from "react";
import styles from "./FAQPage.module.css";

const faqCategories = [
  {
    title: "How Ordering Works",
    questions: [
      {
        q: "How do I place an order?",
        a: "Browse products, add items to your cart, and proceed to checkout. You can pay online via Paystack or choose Cash on Delivery."
      },
      {
        q: "Can I modify my order after placing it?",
        a: "Once an order is placed, modifications are not guaranteed. Contact the vendor immediately to request changes before shipment."
      },
      {
        q: "How do I track my order?",
        a: "You will receive tracking information via email once your order is shipped. Check your order history in your account for updates."
      }
    ]
  },
  {
    title: "Payment Methods",
    questions: [
      {
        q: "What payment options are available?",
        a: "We accept online payments through Paystack (cards, mobile money) and Cash on Delivery for eligible orders."
      },
      {
        q: "Is Cash on Delivery available?",
        a: "Yes! Cash on Delivery is available for orders up to GHS 2,000. Pay when your order arrives."
      },
      {
        q: "How secure is my payment?",
        a: "All payments are processed through Paystack, a PCI-DSS Level 1 certified payment gateway. Your card details are never stored on our servers."
      }
    ]
  },
  {
    title: "Vendor Onboarding",
    questions: [
      {
        q: "How do I become a vendor?",
        a: "Click 'Become a Vendor' in the navbar, fill out the application form, and submit your business details. We'll review and approve within 2-3 business days."
      },
      {
        q: "Are there fees to sell on SiiShop?",
        a: "SiiShop is free to join! We charge a small commission on each sale. There are no monthly subscription fees."
      },
      {
        q: "What can I sell on SiiShop?",
        a: "You can sell physical products that are legal in Ghana. Check our Terms & Conditions for a list of prohibited items."
      }
    ]
  },
  {
    title: "Delivery",
    questions: [
      {
        q: "How long does delivery take?",
        a: "Delivery typically takes 3-7 business days. Time may vary based on vendor location and your area."
      },
      {
        q: "Do you deliver to my area?",
        a: "We deliver to most areas in Ghana. Enter your address at checkout to confirm delivery availability."
      },
      {
        q: "Can I pick up my order?",
        a: "Currently, we only offer delivery. Pickup options may be available in the future."
      }
    ]
  },
  {
    title: "Refunds",
    questions: [
      {
        q: "How do I request a refund?",
        a: "Contact the vendor within 48 hours of delivery. For damaged or wrong items, provide photos. The vendor will process your refund."
      },
      {
        q: "How long do refunds take?",
        a: "Once approved, refunds are processed within 5-10 business days, depending on your payment method."
      },
      {
        q: "What items are not refundable?",
        a: "Refunds are not available for change of mind, used items, digital products once delivered, or items damaged by misuse."
      }
    ]
  },
  {
    title: "Account Help",
    questions: [
      {
        q: "How do I reset my password?",
        a: "Click 'Forgot Password' on the login page. Enter your email and follow the reset link sent to your inbox."
      },
      {
        q: "Can I delete my account?",
        a: "Contact support@siishop.com to request account deletion. We'll process your request within 7 business days."
      },
      {
        q: "How do I update my profile?",
        a: "Go to Settings in your account to update your name, email, phone, and delivery addresses."
      }
    ]
  }
];

function FAQItem({ question, answer }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.faqItem}>
      <button className={styles.faqQuestion} onClick={() => setOpen(!open)}>
        <span>{question}</span>
        <span className={styles.faqIcon}>{open ? "−" : "+"}</span>
      </button>
      {open && <div className={styles.faqAnswer}>{answer}</div>}
    </div>
  );
}

export default function FAQPage() {
  return (
    <div className={styles.page}>
      <div className="container">
        <h1 className={styles.pageTitle}>Frequently Asked Questions</h1>
        <p className={styles.pageSubtitle}>Find answers to common questions about SiiShop</p>

        <div className={styles.categories}>
          {faqCategories.map((cat, idx) => (
            <section key={idx} className={styles.category}>
              <h2 className={styles.categoryTitle}>{cat.title}</h2>
              <div className={styles.faqList}>
                {cat.questions.map((item, qIdx) => (
                  <FAQItem key={qIdx} question={item.q} answer={item.a} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className={styles.contactBox}>
          <h3>Still have questions?</h3>
          <p>Contact our support team</p>
          <a href="/contact" className="btn btn-primary">Contact Us</a>
        </div>
      </div>
    </div>
  );
}