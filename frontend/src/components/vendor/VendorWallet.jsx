"use strict";
/**
 * VendorWallet — shared wallet view used by both Marketplace VendorDashboard
 * and Restaurant Dashboard. Single source of truth for the vendor-side
 * wallet, online earnings, COD commission, withdrawals, and transaction
 * history.
 *
 * The backend wallet stack (routes/wallet.js + services/wallet.service.js)
 * is vendor-type agnostic: every endpoint scopes by req.user.userId and the
 * service never inspects vendorType. Restaurants share the same Wallet model
 * and the same accounting as marketplace vendors, so importing this single
 * component gives the restaurant dashboard a working wallet with zero
 * duplication.
 *
 * Reused: walletAPI (services/api.js), useCurrency, the global btn / spinner
 * / empty-state styles, and the existing modals / cards / list layouts.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { walletAPI } from "../../services/api";
import { useCurrency } from "../../context/CurrencyContext";
import { useAuth } from "../../context/AuthContext";
import { openPaystackPopup } from "../../services/paystack";
import styles from "./VendorWallet.module.css";

function VendorWallet({ addToast, sharedStats }) {
  const { fmt } = useCurrency();
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState("summary");
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState({ amount: "", method: "mobile_money", provider: "mtn", phoneNumber: "", accountName: "", bankName: "", accountNumber: "" });
  const [submitting, setSubmitting] = useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchWallet = useCallback(() => {
    walletAPI.getSummary()
      .then((data) => { if (mountedRef.current) setWallet(data); })
      .catch((err) => { if (mountedRef.current) addToast?.(err.message, "error"); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [addToast]);

  const fetchTransactions = useCallback(() => {
    walletAPI.getTransactions({ limit: 20 })
      .then((data) => { if (mountedRef.current) setTransactions(data.transactions || []); })
      .catch((err) => { if (mountedRef.current) addToast?.(err.message, "error"); });
  }, [addToast]);

  const fetchWithdrawals = useCallback(() => {
    walletAPI.getWithdrawals({ limit: 10 })
      .then((data) => { if (mountedRef.current) setWithdrawals(data.withdrawals || []); })
      .catch((err) => { if (mountedRef.current) addToast?.(err.message, "error"); });
  }, [addToast]);

  useEffect(() => {
    if (activeSection === "summary") fetchWallet();
    if (activeSection === "transactions") fetchTransactions();
    if (activeSection === "withdrawals") fetchWithdrawals();
  }, [activeSection, fetchWallet, fetchTransactions, fetchWithdrawals]);

  const handleWithdraw = async (e) => {
    e.preventDefault();
    if (!withdrawForm.amount || parseFloat(withdrawForm.amount) <= 0) {
      addToast?.("Please enter a valid amount", "error");
      return;
    }

    setSubmitting(true);
    try {
      const data = {
        amount: parseFloat(withdrawForm.amount),
        method: withdrawForm.method,
        mobileMoneyDetails: withdrawForm.method === "mobile_money" ? {
          provider: withdrawForm.provider,
          phoneNumber: withdrawForm.phoneNumber,
          accountName: withdrawForm.accountName,
        } : undefined,
        bankDetails: withdrawForm.method === "bank_transfer" ? {
          bankName: withdrawForm.bankName,
          accountNumber: withdrawForm.accountNumber,
          accountName: withdrawForm.accountName,
        } : undefined,
      };
      await walletAPI.withdraw(data);
      addToast?.("Withdrawal request submitted successfully!", "success");
      setShowWithdrawModal(false);
      setWithdrawForm({ amount: "", method: "mobile_money", provider: "mtn", phoneNumber: "", accountName: "", bankName: "", accountNumber: "" });
      fetchWallet();
      fetchWithdrawals();
    } catch (err) {
      addToast?.(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayCommission = async (e) => {
    e.preventDefault();
    const amount = parseFloat(withdrawForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      addToast?.("Please enter a valid amount", "error");
      return;
    }
    if (amount > (wallet?.outstandingCommission || 0)) {
      addToast?.("Amount exceeds commission owed", "error");
      return;
    }

    // Paystack is the single source of truth: we must NOT mark the
    // commission as paid until the server verifies the reference.
    // The flow is: init → popup → verify. If the user closes the
    // popup, abandons the popup, or verification fails, the wallet
    // is left untouched.
    if (!user?.email) {
      addToast?.("User email is not available — cannot initialize Paystack payment", "error");
      return;
    }

    setSubmitting(true);
    try {
      // Step 1: server calls Paystack.initialize. This returns a
      // unique reference. NO wallet change happens here.
      const { reference } = await walletAPI.initializeCommissionPayment(amount);
      if (!reference) {
        throw new Error("Paystack did not return a payment reference");
      }

      // Step 2: open the Paystack popup. The popup owns the
      // user-facing card/mobile-money choice — we don't need to
      // ask the user which method they prefer in our modal anymore.
      await openPaystackPopup({
        email: user.email,
        amountInMajorUnits: amount,
        reference,
        async onSuccess(paymentRef) {
          if (!mountedRef.current) return;
          try {
            // Step 3: server re-verifies the reference with
            // Paystack, then debits commissionOwed and writes a
            // `commission_payment` WalletTransaction with the
            // paymentRef. The whole ledger is idempotent on
            // paymentRef so a duplicate verify call is safe.
            const result = await walletAPI.verifyCommissionPayment(paymentRef, amount);
            if (mountedRef.current) {
              addToast?.(
                `Commission payment successful! Paid ${fmt(result.amountPaid)}.`,
                "success"
              );
              setShowCommissionModal(false);
              setWithdrawForm({ amount: "", method: "mobile_money", provider: "mtn", phoneNumber: "", accountName: "", bankName: "", accountNumber: "" });
              fetchWallet();
              fetchTransactions();
            }
          } catch (verifyErr) {
            if (mountedRef.current) {
              addToast?.(verifyErr.message || "Payment verification failed", "error");
            }
          }
        },
        onClose() {
          if (mountedRef.current) {
            addToast?.("Payment cancelled", "info");
          }
        },
      });
    } catch (err) {
      addToast?.(err.message || "Could not initialize commission payment", "error");
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleUpdateDetails = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (withdrawForm.method === "mobile_money") {
        await walletAPI.updateMobileMoney({
          provider: withdrawForm.provider,
          phoneNumber: withdrawForm.phoneNumber,
          accountName: withdrawForm.accountName,
        });
      } else {
        await walletAPI.updateBankDetails({
          bankName: withdrawForm.bankName,
          accountNumber: withdrawForm.accountNumber,
          accountName: withdrawForm.accountName,
        });
      }
      addToast?.("Payment details updated successfully!", "success");
      setShowDetailsModal(false);
      fetchWallet();
    } catch (err) {
      addToast?.(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="loading-center"><div className="spinner" /></div>;
  }

  const settings = wallet?.settings || {};

  return (
    <div className={styles.walletContainer}>
      {/* CONSOLIDATED REVENUE SECTION — single source of truth
          When the parent passes `sharedStats` (RestaurantDashboard
          fetches it from /api/vendor/stats), show the online / COD
          revenue split here so the wallet card values match the
          numbers on Dashboard, Customers, and Analytics instead of
          diverging until `processOrderEarnings` has had a chance to
          credit the wallet ledger. The wallet ledger values
          (availableBalance / totalCODSales) remain the source of
          truth for withdrawable funds and commission accounting —
          the consolidated view sits ABOVE the ledger and shows the
          raw order-aggregated revenue. */}
      {sharedStats && (
        <>
          <h3 className={styles.walletSectionTitle}>Total Revenue (All Orders)</h3>
          <div className={styles.walletCards}>
            <div className={styles.walletCard}>
              <span className={styles.walletCardLabel}>Total Revenue</span>
              <span className={styles.walletCardValue}>{fmt(sharedStats?.totalRevenue || 0)}</span>
            </div>
            <div className={styles.walletCard}>
              <span className={styles.walletCardLabel}>Online (Paystack/Card)</span>
              <span className={styles.walletCardValue}>{fmt(sharedStats?.onlineRevenue || 0)}</span>
            </div>
            <div className={styles.walletCard}>
              <span className={styles.walletCardLabel}>Cash on Delivery</span>
              <span className={styles.walletCardValueCOD}>{fmt(sharedStats?.codRevenue || 0)}</span>
            </div>
            <div className={styles.walletCard}>
              <span className={styles.walletCardLabel}>Total Orders</span>
              <span className={styles.walletCardValue}>{sharedStats?.totalOrders || 0}</span>
            </div>
          </div>
        </>
      )}

      {/* WALLET BALANCE SECTION - Online Payments */}
      <h3 className={styles.walletSectionTitle}>Wallet Balance (Online Payments)</h3>
      <div className={styles.walletCards}>
        <div className={styles.walletCard}>
          <span className={styles.walletCardLabel}>Available (Withdrawable)</span>
          <span className={styles.walletCardValue}>{fmt(wallet?.availableBalance || 0)}</span>
        </div>
        <div className={styles.walletCard}>
          <span className={styles.walletCardLabel}>Pending (Held)</span>
          <span className={styles.walletCardValuePending}>{fmt(wallet?.pendingBalance || 0)}</span>
        </div>
        <div className={styles.walletCard}>
          <span className={styles.walletCardLabel}>Online Earnings</span>
          <span className={styles.walletCardValue}>{fmt(wallet?.totalOnlineEarnings || 0)}</span>
        </div>
        <div className={styles.walletCard}>
          <span className={styles.walletCardLabel}>Total Withdrawn</span>
          <span className={styles.walletCardValue}>{fmt(wallet?.totalWithdrawn || 0)}</span>
        </div>
      </div>

      {/* COD SALES SECTION */}
      <h3 className={styles.walletSectionTitle}>COD Sales (Cash Collected)</h3>
      <div className={styles.walletCards}>
        <div className={styles.walletCard}>
          <span className={styles.walletCardLabel}>Total COD Sales</span>
          <span className={styles.walletCardValueCOD}>{fmt(wallet?.totalCODSales || 0)}</span>
        </div>
        <div className={styles.walletCard}>
          <span className={styles.walletCardLabel}>Commission Owed</span>
          <span className={`${styles.walletCardValue} ${(wallet?.commissionOwed || 0) > 0 ? styles.walletCardValueNegative : ""}`}>{fmt(wallet?.commissionOwed || 0)}</span>
        </div>
        <div className={styles.walletCard}>
          <span className={styles.walletCardLabel}>Commission Paid</span>
          <span className={styles.walletCardValue}>{fmt(wallet?.commissionPaid || 0)}</span>
        </div>
        <div className={styles.walletCard}>
          <span className={styles.walletCardLabel}>Outstanding</span>
          <span className={`${styles.walletCardValue} ${(wallet?.outstandingCommission || 0) > 0 ? styles.walletCardValueNegative : ""}`}>{fmt(wallet?.outstandingCommission || 0)}</span>
        </div>
      </div>

      {/* Wallet Actions */}
      <div className={styles.walletActions}>
        <button className="btn btn-primary" onClick={() => setShowWithdrawModal(true)} disabled={!wallet?.availableBalance || wallet?.availableBalance < settings.minWithdrawal}>
          Withdraw Funds
        </button>
        <button className="btn btn-secondary" onClick={() => setShowDetailsModal(true)}>
          Payment Details
        </button>
        {(wallet?.commissionOwed || 0) > 0 && (
          <button className="btn btn-warning" onClick={() => setShowCommissionModal(true)}>
            Pay Commission ({fmt(wallet?.commissionOwed || 0)})
          </button>
        )}
      </div>

      {/* Settings Info */}
      <div className={styles.walletInfo}>
        <p>Min withdrawal: <strong>{fmt(settings.minWithdrawal)}</strong> | Commission: <strong>{settings.commissionRate}%</strong> | Holding period: <strong>{settings.holdingPeriod} days</strong></p>
        <p style={{marginTop:"8px",color:"#92400e"}}>Note: COD earnings are collected directly from customers. Only online payment earnings can be withdrawn through the wallet.</p>
      </div>

      {/* Section Tabs */}
      <div className={styles.walletSections}>
        <button className={`${styles.walletSectionTab} ${activeSection === "transactions" ? styles.walletSectionTabActive : ""}`} onClick={() => setActiveSection("transactions")}>Transactions</button>
        <button className={`${styles.walletSectionTab} ${activeSection === "withdrawals" ? styles.walletSectionTabActive : ""}`} onClick={() => setActiveSection("withdrawals")}>Withdrawal History</button>
      </div>

      {/* Transactions List */}
      {activeSection === "transactions" && (
        <div className={styles.transactionList}>
          {transactions.length === 0 ? (
            <div className="empty-state"><p>No transactions yet</p></div>
          ) : (
            transactions.map((txn, idx) => (
              <div key={idx} className={styles.transactionItem}>
                <div className={styles.transactionInfo}>
                  <span className={styles.transactionType}>{txn.type.replace(/_/g, " ")}</span>
                  <span className={styles.transactionDesc}>{txn.description}</span>
                  <span className={styles.transactionDate}>{new Date(txn.createdAt).toLocaleDateString()}</span>
                </div>
                <span className={`${styles.transactionAmount} ${["withdrawal", "commission", "commission_due", "commission_payment"].includes(txn.type) ? styles.transactionNegative : styles.transactionPositive}`}>
                  {["withdrawal", "commission", "commission_due", "commission_payment"].includes(txn.type) ? "-" : "+"}{fmt(txn.amount)}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Withdrawals List */}
      {activeSection === "withdrawals" && (
        <div className={styles.transactionList}>
          {withdrawals.length === 0 ? (
            <div className="empty-state"><p>No withdrawal requests yet</p></div>
          ) : (
            withdrawals.map((wd, idx) => (
              <div key={idx} className={styles.transactionItem}>
                <div className={styles.transactionInfo}>
                  <span className={styles.transactionType}>{wd.method.replace("_", " ")}</span>
                  <span className={styles.transactionDesc}>Ref: {wd._id?.slice(-8)}</span>
                  <span className={styles.transactionDate}>{new Date(wd.createdAt).toLocaleDateString()}</span>
                </div>
                <div className={styles.transactionRight}>
                  <span className={styles.transactionAmountNegative}>-{fmt(wd.amount)}</span>
                  <span className={`${styles.transactionStatus} ${styles[`status${wd.status}`]}`}>{wd.status}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className={styles.modalOverlay} onClick={() => setShowWithdrawModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3>Request Withdrawal</h3>
            <form onSubmit={handleWithdraw}>
              <div className={styles.formGroup}>
                <label>Amount (GHS)</label>
                <input type="number" min={settings.minWithdrawal} max={wallet?.availableBalance} value={withdrawForm.amount} onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })} placeholder={`Min: ${settings.minWithdrawal}`} required />
              </div>
              <div className={styles.formGroup}>
                <label>Method</label>
                <select value={withdrawForm.method} onChange={(e) => setWithdrawForm({ ...withdrawForm, method: e.target.value })}>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>
              {withdrawForm.method === "mobile_money" ? (
                <>
                  <div className={styles.formGroup}>
                    <label>Provider</label>
                    <select value={withdrawForm.provider} onChange={(e) => setWithdrawForm({ ...withdrawForm, provider: e.target.value })}>
                      <option value="mtn">MTN</option>
                      <option value="telecel">Telecel</option>
                      <option value="airteltigo">AirtelTigo</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Phone Number</label>
                    <input type="tel" value={withdrawForm.phoneNumber} onChange={(e) => setWithdrawForm({ ...withdrawForm, phoneNumber: e.target.value })} placeholder="e.g. 0201234567" required />
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.formGroup}>
                    <label>Bank Name</label>
                    <input type="text" value={withdrawForm.bankName} onChange={(e) => setWithdrawForm({ ...withdrawForm, bankName: e.target.value })} placeholder="e.g. Ghana Commercial Bank" required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Account Number</label>
                    <input type="text" value={withdrawForm.accountNumber} onChange={(e) => setWithdrawForm({ ...withdrawForm, accountNumber: e.target.value })} placeholder="e.g. 1234567890" required />
                  </div>
                </>
              )}
              <div className={styles.formGroup}>
                <label>Account Name</label>
                <input type="text" value={withdrawForm.accountName} onChange={(e) => setWithdrawForm({ ...withdrawForm, accountName: e.target.value })} placeholder="Full name on account" required />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowWithdrawModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Processing..." : "Submit Request"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Details Modal */}
      {showDetailsModal && (
        <div className={styles.modalOverlay} onClick={() => setShowDetailsModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3>Update Payment Details</h3>
            <form onSubmit={handleUpdateDetails}>
              <div className={styles.formGroup}>
                <label>Method</label>
                <select value={withdrawForm.method} onChange={(e) => setWithdrawForm({ ...withdrawForm, method: e.target.value })}>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>
              {withdrawForm.method === "mobile_money" ? (
                <>
                  <div className={styles.formGroup}>
                    <label>Provider</label>
                    <select value={withdrawForm.provider} onChange={(e) => setWithdrawForm({ ...withdrawForm, provider: e.target.value })}>
                      <option value="mtn">MTN</option>
                      <option value="telecel">Telecel</option>
                      <option value="airteltigo">AirtelTigo</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Phone Number</label>
                    <input type="tel" value={withdrawForm.phoneNumber} onChange={(e) => setWithdrawForm({ ...withdrawForm, phoneNumber: e.target.value })} required />
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.formGroup}>
                    <label>Bank Name</label>
                    <input type="text" value={withdrawForm.bankName} onChange={(e) => setWithdrawForm({ ...withdrawForm, bankName: e.target.value })} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Account Number</label>
                    <input type="text" value={withdrawForm.accountNumber} onChange={(e) => setWithdrawForm({ ...withdrawForm, accountNumber: e.target.value })} required />
                  </div>
                </>
              )}
              <div className={styles.formGroup}>
                <label>Account Name</label>
                <input type="text" value={withdrawForm.accountName} onChange={(e) => setWithdrawForm({ ...withdrawForm, accountName: e.target.value })} required />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowDetailsModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Saving..." : "Save"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Commission Modal — Paystack only.
          The popup handles the card / mobile-money choice, so the
          modal here is just an amount entry + a "Pay via Paystack"
          trigger. The full flow is in `handlePayCommission` above:
          init → popup → verify. If the popup is closed or the
          server-side Paystack verify fails, the wallet is not
          touched. */}
      {showCommissionModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCommissionModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3>Pay Commission Owed</h3>
            <div className={styles.commissionInfo}>
              <p>Outstanding Commission: <strong>{fmt(wallet?.commissionOwed || 0)}</strong></p>
              <p style={{ fontSize: "0.85rem", color: "#6b7280", marginTop: 4 }}>
                Payment is processed securely by Paystack. You can pay with a card or mobile money in the popup.
              </p>
            </div>
            <form onSubmit={handlePayCommission}>
              <div className={styles.formGroup}>
                <label>Amount (GHS)</label>
                <input
                  type="number"
                  min={1}
                  max={wallet?.commissionOwed}
                  value={withdrawForm.amount}
                  onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                  placeholder={`Max: ${fmt(wallet?.commissionOwed || 0)}`}
                  required
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCommissionModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-warning" disabled={submitting}>
                  {submitting ? "Opening Paystack…" : "Pay via Paystack"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default VendorWallet;
