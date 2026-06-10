// pages/CartPage.jsx — v3: phone field, GHS currency, full responsiveness
import { useState, useEffect } from "react";
import { orderAPI } from "../services/api";
import { openPaystackPopup } from "../services/paystack";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import CartItem from "../components/CartItem";
import SEO from "../components/SEO";
import styles from "./CartPage.module.css";

const STAGE = { IDLE:"idle", PAYING:"paying", SAVING:"saving", SUCCESS:"success", FAILED:"failed" };

export default function CartPage({ cart: cartProp, onIncrease, onDecrease, onRemove, onClearCart, onNavigate, addToast, onRequireAuth }) {
  const { user, isLoggedIn } = useAuth();
  const { fmt } = useCurrency();
  const cart = Array.isArray(cartProp) ? cartProp : [];

  const [form, setForm] = useState({
    customerName:    user?.name  || "",
    customerEmail:   user?.email || "",
    customerPhone:   "",
    deliveryAddress: "",
  });
  const [errors,      setErrors]      = useState({});
  const [stage,       setStage]       = useState(STAGE.IDLE);
  const [failMessage, setFailMessage] = useState("");
  const [createdOrder,setCreatedOrder]= useState(null);
  const [payMethod,   setPayMethod]   = useState("paystack");
  const [momoNetwork, setMomoNetwork] = useState("mtn");
  const [paymentAbandoned, setPaymentAbandoned] = useState(false);

  // Sync form fields when user logs in after the component mounts
  useEffect(() => {
    setForm(prev => ({
      ...prev,
      customerName:  user?.name  || prev.customerName,
      customerEmail: user?.email || prev.customerEmail,
    }));
  }, [user?.name, user?.email]);

  const subtotal    = cart.reduce((s, i) => s + (Number(i.price)||0) * (Number(i.quantity)||0), 0);
  const deliveryFee = cart.length > 0 ? 0 : 0;
  const total       = subtotal + deliveryFee;

  function validate() {
    const e = {};
    if (!form.customerName.trim())    e.customerName    = "Name is required";
    if (!form.customerEmail.trim())   e.customerEmail   = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.customerEmail)) e.customerEmail = "Enter a valid email";
    // PART 5: phone validation
    if (!form.customerPhone.trim()) {
      e.customerPhone = "Phone number is required";
    } else if (!/^[+\d][\d\s\-().]{6,19}$/.test(form.customerPhone.trim())) {
      e.customerPhone = "Enter a valid phone number";
    }
    if (!form.deliveryAddress.trim()) e.deliveryAddress = "Address is required";
    return e;
  }

  function field(key) {
    return {
      value: form[key],
      disabled: stage === STAGE.PAYING || stage === STAGE.SAVING,
      onChange: (e) => {
        setForm(prev => ({ ...prev, [key]: e.target.value }));
        setErrors(prev => ({ ...prev, [key]: "" }));
      },
    };
  }

  async function handleCheckout(e) {
    e.preventDefault();
    if (stage === STAGE.PAYING || stage === STAGE.SAVING) return;
    if (!isLoggedIn) { onRequireAuth?.(); return; }
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (cart.length === 0) { addToast?.("Your cart is empty!", "error"); return; }

    const basePayload = {
      customerName:    form.customerName.trim(),
      customerEmail:   form.customerEmail.trim(),
      customerPhone:   form.customerPhone.trim(),
      deliveryAddress: form.deliveryAddress.trim(),
      // ✅ FIXED: Send name, image, and fromPromo flag
      // Backend will validate promo is still active if fromPromo: true
      items: cart.filter(i => i?._id && i?.quantity).map(i => ({
        productId: i._id,
        name: i.name || "",  // ✅ Backend requires name
        image: i.image || "",  // ✅ Backend requires image
        quantity: Number(i.quantity)||1,
        fromPromo: i.fromPromo === true,  // ✅ Tell backend if this came from promo section
      })),
      // ✅ Frontend calculates total for display only - backend will recalculate and verify
      totalAmount: parseFloat(total.toFixed(2)),
    };
    if (basePayload.items.length === 0) { addToast?.("Cart items are invalid.", "error"); return; }

    if (payMethod === "cash") {
      setStage(STAGE.SAVING);
      try {
        const order = await orderAPI.create({ ...basePayload, paymentMethod: "cash" });
        if (order?._id) localStorage.setItem("lastOrderId", order._id);
        setCreatedOrder(order || {});
        setStage(STAGE.SUCCESS);
        onClearCart?.();
      } catch (err) {
        setFailMessage(err.message || "Order could not be placed.");
        setStage(STAGE.FAILED);
      }
      return;
    }

    setStage(STAGE.PAYING);
    try {
      // 1. Initialize payment on backend to get a real reference
      const { reference } = await orderAPI.initializePayment({
        email: form.customerEmail.trim(),
        amount: parseFloat(total.toFixed(2)),
      });

      // 2. Open Paystack popup with the real reference
      setPaymentAbandoned(false);
      await openPaystackPopup({
        email: form.customerEmail.trim(),
        amountInMajorUnits: parseFloat(total.toFixed(2)),
        reference,
        ...(payMethod === "momo" && { channels: ["mobile_money"], network: momoNetwork.toUpperCase() }),
        async onSuccess(paymentRef) {
          // Guard: if user closed payment without completing, don't create order
          if (paymentAbandoned) {
            addToast?.("Payment was not completed.", "info");
            return;
          }
          setStage(STAGE.SAVING);
          try {
            // 3. Create order - backend verifies payment first
            // If payment was abandoned/failed, backend throws with actual status
            const order = await orderAPI.create({ ...basePayload, paymentMethod: "paystack", paymentRef });
            if (order?._id) localStorage.setItem("lastOrderId", order._id);
            setCreatedOrder(order || {});
            setStage(STAGE.SUCCESS);
            onClearCart?.();
          } catch (err) {
            // Show actual backend error (e.g., "Payment not successful. Status: abandoned")
            const msg = err.message || "Payment could not be completed.";
            setFailMessage(msg);
            setStage(STAGE.FAILED);
          }
        },
        onClose() {
          setPaymentAbandoned(true);
          setStage(STAGE.IDLE);
          addToast?.("Payment cancelled — cart saved.", "info");
        },
      });
    } catch (err) {
      setFailMessage(err.message || "Could not initialize payment.");
      setStage(STAGE.FAILED);
    }
  }

  if (stage === STAGE.SUCCESS) {
    const orderId    = createdOrder?._id ? `#${createdOrder._id.slice(-6).toUpperCase()}` : "#------";
    const orderTotal = typeof createdOrder?.totalAmount === "number" ? fmt(createdOrder.totalAmount) : "—";
    const isCash     = createdOrder?.paymentMethod === "cash";
    return (
      <div className={`container page-enter ${styles.page}`}>
        <div className={styles.resultCard}>
          <div className={styles.successIcon}>🎉</div>
          <h2 className={styles.resultTitle}>{isCash ? "Order Placed!" : "Payment Successful!"}</h2>
          <p className={styles.resultText}>
            {isCash ? "Your Cash on Delivery order has been placed. Pay when it arrives!" : "Payment confirmed and your order is being prepared!"}
          </p>
          {createdOrder && (
            <div className={styles.orderSummaryBox}>
              <SummaryRow label="Order ID" value={orderId} />
              <SummaryRow label="Total"    value={orderTotal} />
              <SummaryRow label="Payment"  value={isCash ? "Cash on Delivery" : "Paystack"} />
              {createdOrder.customerPhone && <SummaryRow label="Phone" value={createdOrder.customerPhone} />}
              <SummaryRow label="Pay status" value={
                <span className={createdOrder.paymentStatus === "paid" ? styles.paidBadge : styles.pendingBadge}>
                  {createdOrder.paymentStatus === "paid" ? "✓ Paid" : "⏳ Pay on delivery"}
                </span>
              } />
            </div>
          )}
          <div className={styles.resultActions}>
            <button className="btn btn-primary"   onClick={() => onNavigate?.("orders")}>Track Order</button>
            <button className="btn btn-secondary" onClick={() => onNavigate?.("home")}>Continue Shopping</button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === STAGE.FAILED) {
    return (
      <div className={`container page-enter ${styles.page}`}>
        <div className={styles.resultCard}>
          <div className={styles.failIcon}>❌</div>
          <h2 className={styles.resultTitle}>Payment Failed</h2>
          <p className={styles.resultText}>{failMessage || "Something went wrong. Please try again."}</p>
          <div className={styles.resultActions}>
            <button className="btn btn-primary"   onClick={() => { setStage(STAGE.IDLE); setFailMessage(""); }}>Try Again</button>
            <button className="btn btn-secondary" onClick={() => onNavigate?.("home")}>Back to Shop</button>
          </div>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className={`container page-enter ${styles.page}`}>
        <h1 className={styles.title}>Your Cart</h1>
        <div className="empty-state">
          <div className="empty-icon">🛒</div>
          <h3>Your cart is empty</h3>
          <p>Browse our products and add items to get started.</p>
          <button className="btn btn-primary" style={{marginTop:20}} onClick={() => onNavigate?.("home")}>Browse Shop</button>
        </div>
      </div>
    );
  }

  const isPaying   = stage === STAGE.PAYING || stage === STAGE.SAVING;
  const totalItems = cart.reduce((s, i) => s + (Number(i.quantity)||0), 0);

  return (
    <div className={`container page-enter ${styles.page}`}>
      <SEO
        title="Shopping Cart | SiiShop"
        description="Review your cart items and proceed to secure checkout on SiiShop marketplace."
        keywords="shopping cart, checkout, online payment, Ghana"
        url="https://siishops.com/cart"
      />
      <h1 className={styles.title}>Your Cart</h1>

      {!isLoggedIn && (
        <div className={styles.loginNudge}>
          <span>🔐 You need to <strong>sign in</strong> before checkout.</span>
          <button className="btn btn-primary btn-sm" onClick={() => onRequireAuth?.()}>Sign In</button>
        </div>
      )}

      <div className={styles.layout}>
        {/* Cart items */}
        <div>
          <div className={styles.cartCard}>
            <div className={styles.cartHeader}>
              <h2>Items ({totalItems})</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => onClearCart?.()} disabled={isPaying}>Clear all</button>
            </div>
            {cart.map(item => item?._id && (
              <CartItem key={item._id} item={item} onIncrease={onIncrease} onDecrease={onDecrease} onRemove={onRemove} />
            ))}
            <div className={styles.summary}>
              <div className={styles.summaryRow}><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
              <div className={styles.summaryRow}><span>Delivery fee</span><span></span></div>
              <div className={`${styles.summaryRow} ${styles.totalRow}`}><span>Total</span><span>{fmt(total)}</span></div>
            </div>
          </div>
        </div>

        {/* Checkout form */}
        <div>
          <div className={styles.checkoutCard}>
            <h2 className={styles.checkoutTitle}>Delivery Details</h2>
            <form onSubmit={handleCheckout} noValidate>

              <div className={styles.formGroup}>
                <label className={styles.label}>Full Name</label>
                <input type="text" placeholder="John Doe" {...field("customerName")} />
                {errors.customerName && <span className={styles.fieldError}>{errors.customerName}</span>}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Email</label>
                <input type="email" placeholder="you@example.com" {...field("customerEmail")} />
                {errors.customerEmail && <span className={styles.fieldError}>{errors.customerEmail}</span>}
              </div>

              {/* PART 5: Phone number field */}
              <div className={styles.formGroup}>
                <label className={styles.label}>Phone Number <span className={styles.required}>*</span></label>
                <input type="tel" placeholder="+233 24 000 0000" {...field("customerPhone")} autoComplete="tel" />
                {errors.customerPhone && <span className={styles.fieldError}>{errors.customerPhone}</span>}
                <span className={styles.fieldHint}>We'll contact you about your delivery</span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Delivery Address</label>
                <textarea rows={3} placeholder="123 Ring Road, Accra" style={{resize:"vertical"}} {...field("deliveryAddress")} />
                {errors.deliveryAddress && <span className={styles.fieldError}>{errors.deliveryAddress}</span>}
              </div>

              {/* Payment method */}
              <div className={styles.formGroup}>
                <label className={styles.label}>Payment Method</label>
                <div className={styles.payMethods}>
                  {[{id:"paystack",icon:"💳",label:"Card"},{id:"momo",icon:"📱",label:"Mobile Money"},{id:"cash",icon:"💵",label:"Cash on Delivery"}].map(m => (
                    <button type="button" key={m.id}
                      className={`${styles.payMethodBtn} ${payMethod===m.id ? styles.payMethodActive : ""}`}
                      onClick={() => setPayMethod(m.id)} disabled={isPaying}>
                      <span>{m.icon}</span><span className={styles.payMethodLabel}>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {payMethod === "momo" && (
                <div className={styles.formGroup}>
                  <label className={styles.label}>Network</label>
                  <div className={styles.momoNetworks}>
                    {[{id:"mtn",label:"MTN",color:"#FFC200"},{id:"vodafone",label:"Vodafone",color:"#E60000"},{id:"airteltigo",label:"AirtelTigo",color:"#FF4500"}].map(n => (
                      <button type="button" key={n.id}
                        className={`${styles.momoBtn} ${momoNetwork===n.id ? styles.momoBtnActive : ""}`}
                        style={momoNetwork===n.id ? {borderColor:n.color,background:n.color+"18"} : {}}
                        onClick={() => setMomoNetwork(n.id)} disabled={isPaying}>
                        {n.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {payMethod === "cash" && (
                <div className={styles.codBanner}>
                  💵 You'll pay <strong>{fmt(total)}</strong> in cash when your order is delivered.
                </div>
              )}

              <button type="submit" className={`btn btn-primary ${styles.payBtn}`} disabled={isPaying}>
                {stage === STAGE.PAYING && "⏳ Awaiting Payment…"}
                {stage === STAGE.SAVING && "⏳ Confirming Order…"}
                {stage === STAGE.IDLE   && (payMethod === "cash" ? `Place Order · ${fmt(total)}` : `🔒 Pay Now · ${fmt(total)}`)}
              </button>

              {payMethod !== "cash" && <p className={styles.payNote}>Secured by Paystack. We never store card details.</p>}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid var(--brand-border)"}}>
      <span style={{fontSize:"0.8rem",color:"var(--brand-muted)",fontWeight:500}}>{label}</span>
      <span style={{fontSize:"0.88rem",fontWeight:600,color:"var(--brand-dark)"}}>{value}</span>
    </div>
  );
}
