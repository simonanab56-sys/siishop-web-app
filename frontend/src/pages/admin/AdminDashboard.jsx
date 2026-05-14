// pages/admin/AdminDashboard.jsx — v9: Fixed image modal
import React, { useState, useEffect, useCallback, useRef } from "react";
import { adminAPI, vendorAPI, productAPI, orderAPI, promoAPI } from "../../services/api";
import { useAuth }     from "../../context/AuthContext";
import { useCurrency } from "../../context/CurrencyContext";
import ImageUpload     from "../../components/ImageUpload";
import MultiImageUpload from "../../components/MultiImageUpload";
import { StatusBadge } from "../../components/OrderStatusBadge";
import OrderTracker from "../../components/OrderTracker";
import styles          from "./AdminDashboard.module.css";

const API_BASE = import.meta.env.VITE_API_URL_PROD || import.meta.env.VITE_API_URL || "http://localhost:10000/api";

const ORDER_STATUSES = ["pending","confirmed","preparing","out_for_delivery","delivered"];
const EMPTY_PRODUCT  = { name:"", description:"", price:"", category:"", image:"", images:[], available:true, stock:"" };

function safeId(id)   { return id ? `#${String(id).slice(-6).toUpperCase()}` : "#------"; }

// Helper to properly resolve image URL
function getImageUrl(image) {
  if (!image) return "/no-image.svg";
  // Handle Base64 data URLs - return as-is
  if (image.startsWith("data:image")) return image;
  // Handle full URLs
  if (image.startsWith("http")) return image;
  // Handle relative paths
  if (image.startsWith("/uploads")) {
    return API_BASE.replace("/api", "") + image;
  }
  if (image.startsWith("/")) {
    return API_BASE.replace("/api", "") + image;
  }
  // Handle filename only
  return `${API_BASE.replace("/api", "")}/uploads/products/${image}`;
}

// Helper to get image from item (supports single image and multiple images)
function getItemImage(item) {
  if (!item) return null;
  let img = null;

  // Check for direct image fields
  if (item.image) {
    img = item.image;
  } else if (item.images && item.images.length > 0) {
    const firstImg = item.images[0];
    img = typeof firstImg === "string" ? firstImg : firstImg?.url;
  }

  // Check product reference (for promos and older orders)
  if (!img && item.productId) {
    const productRef = typeof item.productId === "object" ? item.productId : null;
    if (productRef) {
      if (productRef.image) {
        img = productRef.image;
      } else if (productRef.images && productRef.images.length > 0) {
        const firstImg = productRef.images[0];
        img = typeof firstImg === "string" ? firstImg : firstImg?.url;
      }
    }
  }

  // Check product object (another reference format)
  if (!img && item.product) {
    if (item.product.image) {
      img = item.product.image;
    } else if (item.product.images && item.product.images.length > 0) {
      const firstImg = item.product.images[0];
      img = typeof firstImg === "string" ? firstImg : firstImg?.url;
    }
  }

  if (!img) return null;
  return getImageUrl(img);
}

export default function AdminDashboard({ addToast, onRequireAuth }) {
  const { isLoggedIn, isAdmin } = useAuth();
  const { fmt }                 = useCurrency();
  const [tab, setTab] = useState("overview");
  const [imageModal, setImageModal] = useState({ isOpen: false, src: "", title: "" });

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (imageModal.isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [imageModal.isOpen]);

  if (!isLoggedIn) return <GateScreen msg="Sign in to access the Admin Dashboard" onAuth={onRequireAuth} icon="🔐" />;
  if (!isAdmin)    return <GateScreen msg="Admin access required." icon="🚫" />;

  const TABS = [["overview","📊 Overview"],["users","👥 Users"],["vendors","🏪 Vendors"],["products","📦 Products"],["orders","🚚 Orders"],["analytics","📈 Analytics"],["promos","🏷️ Promos"]];

  return (
    <React.Fragment>
      {/* Image fullscreen modal - outside container */}
      {imageModal.isOpen && (
        <div
          className={styles.imageModalOverlay}
          onClick={() => setImageModal({ isOpen: false, src: "", title: "" })}
        >
          <div className={styles.imageModalContent} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.imageModalClose}
              onClick={() => setImageModal({ isOpen: false, src: "", title: "" })}
            >
              ×
            </button>
            <img src={imageModal.src} alt={imageModal.title} className={styles.imageModalImage} />
            <p className={styles.imageModalTitle}>{imageModal.title}</p>
          </div>
        </div>
      )}
      <div className={`container page-enter ${styles.page}`}>
      <div className="page-header"><h1>🛠️ Admin Dashboard</h1><p>Full platform control</p></div>
      <div className={styles.tabScroll}>
        <div className={styles.tabs}>
          {TABS.map(([key,label]) => (
            <button key={key} className={`${styles.tab} ${tab===key?styles.tabActive:""}`} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
      </div>
      {tab === "overview"   && <AdminOverview   addToast={addToast} fmt={fmt} />}
      {tab === "users"      && <AdminUsers      addToast={addToast} />}
      {tab === "vendors"    && <AdminVendors    addToast={addToast} />}
      {tab === "products"   && <AdminProducts   addToast={addToast} fmt={fmt} />}
      {tab === "orders"     && <AdminOrders     addToast={addToast} fmt={fmt} setImageModal={setImageModal} />}
      {tab === "analytics"  && <AdminAnalytics  addToast={addToast} fmt={fmt} />}
      {tab === "promos"     && <AdminPromos     addToast={addToast} fmt={fmt} />}
    </div>
    </React.Fragment>
  );
}

function GateScreen({ msg, onAuth, icon }) {
  return (
    <div className="container"><div className="empty-state" style={{paddingTop:80}}>
      <div className="empty-icon">{icon}</div><h3>{msg}</h3>
      {onAuth && <button className="btn btn-primary" style={{marginTop:20}} onClick={() => onAuth?.()}>Sign In</button>}
    </div></div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────
function AdminOverview({ addToast, fmt }) {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current=true; return ()=>{mountedRef.current=false;}; }, []);

  useEffect(() => {
    const fetchStats = () => {
      adminAPI.getStats()
        .then(d => { if(mountedRef.current) setStats(d||{}); })
        .catch(err => { if(mountedRef.current) addToast?.(err.message,"error"); })
        .finally(() => { if(mountedRef.current) setLoading(false); });
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [addToast]);

  if (loading) return <div className="loading-center"><div className="spinner"/></div>;
  if (!stats)  return <div className="empty-state"><div className="empty-icon">⚠️</div><h3>Could not load stats</h3></div>;

  const rev = typeof stats.totalRevenue === "number" ? stats.totalRevenue : 0;
  const pending = typeof stats.pendingVendors === "number" ? stats.pendingVendors : 0;
  const recentOrders = Array.isArray(stats.recentOrders) ? stats.recentOrders : [];

  return (
    <div className={styles.overview}>
      <div className={styles.statsGrid}>
        {[
          ["👥","Total Users",    stats.totalUsers    ?? 0, "registered accounts"],
          ["🏪","Vendors",        stats.totalVendors  ?? 0, `${pending} pending approval`],
          ["📦","Products",       stats.totalProducts ?? 0, "listed items"],
          ["🛒","Orders",         stats.totalOrders   ?? 0, "placed orders"],
          ["💰","Revenue",        fmt(rev),                 "from paid orders"],
        ].map(([icon,label,value,sub]) => (
          <div key={label} className="stat-card">
            <span className="stat-icon">{icon}</span>
            <span className="stat-label">{label}</span>
            <span className="stat-value">{value}</span>
            <span className="stat-sub">{sub}</span>
          </div>
        ))}
      </div>
      {recentOrders.length > 0 && (
        <>
          <h3 className={styles.sectionTitle}>Recent Orders</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Order #</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead>
              <tbody>
                {recentOrders.map(o => o?._id && (
                  <tr key={o._id}>
                    <td><code>{safeId(o._id)}</code></td>
                    <td>{o.customerName||"—"}</td>
                    <td>{fmt(typeof o.totalAmount==="number"?o.totalAmount:0)}</td>
                    <td><span className={`badge ${o.paymentStatus==="paid"?"badge-delivered":"badge-pending"}`}>{o.paymentStatus||"unknown"}</span></td>
                    <td><StatusBadge status={o.orderStatus || o.status || "pending"}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Analytics ─────────────────────────────────────────────────────────────────
function AdminAnalytics({ addToast, fmt }) {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current=true; return ()=>{mountedRef.current=false;}; }, []);

  useEffect(() => {
    const fetchStats = () => {
      adminAPI.getStats()
        .then(d => { if(mountedRef.current) setStats(d||{}); })
        .catch(err => { if(mountedRef.current) addToast?.(err.message,"error"); })
        .finally(() => { if(mountedRef.current) setLoading(false); });
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [addToast]);

  if (loading) return <div className="loading-center"><div className="spinner"/></div>;

  // stats.vendorEarnings is a flat array returned directly from /admin/stats
  const earnings = Array.isArray(stats?.vendorEarnings) ? stats.vendorEarnings : [];
  const totalRev = typeof stats?.totalRevenue === "number" ? stats.totalRevenue : 0;

  return (
    <div className={styles.analyticsTab}>
      <div className={styles.analyticsHeader}>
        <h3 className={styles.sectionTitle}>Platform Revenue: <span style={{color:"var(--brand-primary)"}}>{fmt(totalRev)}</span></h3>
      </div>

      {earnings.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">📈</div><h3>No vendor sales data yet</h3><p>Revenue will appear here once vendors have paid orders.</p></div>
      ) : (
        <>
          <p style={{fontSize:"0.85rem",color:"var(--brand-muted)",marginBottom:14}}>
            Top {earnings.length} vendor{earnings.length!==1?"s":""} by revenue
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Vendor / Store</th>
                  <th>Email</th>
                  <th>Orders</th>
                  <th>Items Sold</th>
                  <th>Revenue</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {earnings.map((v, i) => {
                  const rev   = typeof v.totalRevenue === "number" ? v.totalRevenue : 0;
                  const share = totalRev > 0 ? ((rev / totalRev) * 100).toFixed(1) : "0.0";
                  return (
                    <tr key={String(v.vendorId||i)}>
                      <td><strong>{i+1}</strong></td>
                      <td>
                        <strong>{v.vendorName||"Unknown"}</strong>
                        {v.vendorEmail && <><br/><small style={{color:"var(--brand-muted)"}}>{v.vendorEmail}</small></>}
                      </td>
                      <td>{v.vendorEmail||"—"}</td>
                      <td>{v.totalOrders||0}</td>
                      <td>{v.totalItems||0}</td>
                      <td><strong style={{color:"var(--brand-primary)"}}>{fmt(rev)}</strong></td>
                      <td>
                        <div className={styles.shareBar}>
                          <div className={styles.shareBarFill} style={{width:`${share}%`}}/>
                          <span>{share}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Users ─────────────────────────────────────────────────────────────────────
function AdminUsers({ addToast }) {
  const { user: me } = useAuth();
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [role,     setRole]     = useState("");
  const [deleting, setDeleting] = useState(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current=true; return ()=>{mountedRef.current=false;}; }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (role)   params.role   = role;
      const res = await adminAPI.getUsers(params);
      // Response is { data: [...], pagination: {...} }
      if (!mountedRef.current) return;
      setUsers(Array.isArray(res?.data) ? res.data : []);
    } catch (err) { if(mountedRef.current) { addToast?.(err.message,"error"); setUsers([]); } }
    finally { if(mountedRef.current) setLoading(false); }
  }, [search, role, addToast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleDelete(id) {
    if (!id || deleting) return;
    if (!window.confirm("Delete this user?")) return;
    setDeleting(id);
    try {
      await adminAPI.deleteUser(id);
      if(!mountedRef.current) return;
      setUsers(prev => prev.filter(u => u._id !== id));
      addToast?.("User deleted.","info");
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
    finally { if(mountedRef.current) setDeleting(null); }
  }

  async function toggleAdmin(user) {
    if (!user?._id) return;
    try {
      const updated = await adminAPI.toggleAdmin(user._id);
      if(!mountedRef.current) return;
      setUsers(prev => prev.map(u => u._id === user._id ? updated : u));
      addToast?.(updated.isAdmin ? "Admin role granted" : "Admin role revoked", "success");
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
  }

  const myId = me?._id;
  return (
    <div>
      <div className={styles.toolbar}>
        <input type="text" placeholder="Search name or email…" value={search} onChange={e=>setSearch(e.target.value)} className={styles.searchInput} />
        <select value={role} onChange={e=>setRole(e.target.value)} className={styles.roleFilter}>
          <option value="">All roles</option>
          <option value="customer">Customers</option>
          <option value="vendor">Vendors</option>
          <option value="admin">Admins</option>
        </select>
      </div>
      {loading ? <div className="loading-center"><div className="spinner"/></div> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>
              {(Array.isArray(users)?users:[]).map(u => {
                if(!u?._id) return null;
                const isMe = myId && String(u._id)===myId;
                return (
                  <tr key={u._id}>
                    <td><strong>{u.name||"—"}</strong></td>
                    <td>{u.email||"—"}</td>
                    <td>
                      {u.isAdmin  && <span className="role-badge role-admin">Admin</span>}
                      {u.isVendor && <span className="role-badge role-vendor" style={{marginLeft:4}}>{u.storeName||"Vendor"}</span>}
                      {!u.isAdmin && !u.isVendor && <span className="role-badge role-customer">Customer</span>}
                    </td>
                    <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</td>
                    <td>
                      <div className={styles.actionBtns}>
                        {!isMe && <button className="btn btn-secondary btn-sm" onClick={() => toggleAdmin(u)}>{u.isAdmin?"Revoke Admin":"Make Admin"}</button>}
                        {!isMe && <button className="btn btn-danger btn-sm" disabled={deleting===u._id} onClick={() => handleDelete(u._id)}>{deleting===u._id?"…":"Delete"}</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(Array.isArray(users)?users:[]).length === 0 && <tr><td colSpan={5} style={{textAlign:"center",color:"var(--brand-muted)",padding:"32px"}}>No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Vendors ───────────────────────────────────────────────────────────────────
function AdminVendors({ addToast }) {
  const [vendors,    setVendors]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState("all");
  const [processing, setProcessing] = useState(null);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current=true; return ()=>{mountedRef.current=false;}; }, []);
  useEffect(() => {
    vendorAPI.adminGetAll()
      .then(d => { if(mountedRef.current) setVendors(Array.isArray(d)?d:[]); })
      .catch(err => { if(mountedRef.current) addToast?.(err.message,"error"); setVendors([]); })
      .finally(() => { if(mountedRef.current) setLoading(false); });
  }, [addToast]);
  async function approve(id) {
    if (processing) return; setProcessing(id);
    try {
      const updated = await vendorAPI.adminApprove(id);
      if(!mountedRef.current) return;
      setVendors(prev=>(Array.isArray(prev)?prev:[]).map(v=>v._id===id ? { ...v, vendorStatus: updated?.vendorStatus || "approved" } : v));
      addToast?.("Vendor approved! ✅","success");
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
    finally { if(mountedRef.current) setProcessing(null); }
  }
  async function suspend(id) {
    if (processing) return; setProcessing(id);
    try {
      const updated = await vendorAPI.adminSuspend(id);
      if(!mountedRef.current) return;
      setVendors(prev=>(Array.isArray(prev)?prev:[]).map(v=>v._id===id ? { ...v, vendorStatus: updated?.vendorStatus || "suspended" } : v));
      addToast?.("Vendor suspended.","info");
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
    finally { if(mountedRef.current) setProcessing(null); }
  }
  const safeVendors = Array.isArray(vendors) ? vendors : [];
  const filtered    = filter==="all" ? safeVendors : safeVendors.filter(v=>v?.vendorStatus===filter);
  return (
    <div>
      <div className={styles.toolbar}>
        {["all","pending","approved","suspended"].map(f => (
          <button key={f} className={`btn ${filter===f?"btn-primary":"btn-secondary"} btn-sm`} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase()+f.slice(1)}
          </button>
        ))}
      </div>
      {loading ? <div className="loading-center"><div className="spinner"/></div> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Store</th><th>Owner</th><th>Email</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(v => v?._id && (
                <tr key={v._id}>
                  <td><strong>{v.storeName||"—"}</strong></td>
                  <td>{v.name||"—"}</td>
                  <td>{v.email||"—"}</td>
                  <td>{v.phoneNumber||"—"}</td>
                  <td><span className={`badge badge-${v.vendorStatus==="approved"?"delivered":v.vendorStatus==="suspended"?"pending":"preparing"}`}>{v.vendorStatus||"pending"}</span></td>
                  <td>
                    <div className={styles.actionBtns}>
                      <button className="btn btn-info btn-sm" onClick={() => setSelectedVendor(v)}>Details</button>
                      {v.vendorStatus!=="approved" && <button className="btn btn-secondary btn-sm" onClick={() => approve(v._id)} disabled={processing===v._id}>Approve</button>}
                      {v.vendorStatus!=="suspended" && <button className="btn btn-danger btn-sm" onClick={() => suspend(v._id)} disabled={processing===v._id}>Suspend</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length===0 && <tr><td colSpan={6} style={{textAlign:"center",color:"var(--brand-muted)",padding:"32px"}}>No vendors found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {selectedVendor && (
        <div className={styles.modal} onClick={() => setSelectedVendor(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Vendor Details - {selectedVendor.storeName}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedVendor(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.detailsGrid}>
                <div><strong>Store Name:</strong> {selectedVendor.storeName||"—"}</div>
                <div><strong>Owner Name:</strong> {selectedVendor.name||"—"}</div>
                <div><strong>Email:</strong> {selectedVendor.email||"—"}</div>
                <div><strong>Phone:</strong> {selectedVendor.phoneNumber||"—"}</div>
                <div><strong>ID Type:</strong> {selectedVendor.idType||"—"}</div>
                <div><strong>Status:</strong> <span className={`badge badge-${selectedVendor.vendorStatus==="approved"?"delivered":selectedVendor.vendorStatus==="suspended"?"pending":"preparing"}`}>{selectedVendor.vendorStatus||"pending"}</span></div>
              </div>
              <div style={{marginTop:"20px"}}>
                <h4>National ID Documents</h4>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px",marginTop:"12px"}}>
                  <div>
                    <p style={{fontSize:"12px",color:"var(--brand-muted)",marginBottom:"8px"}}>Front</p>
                    {selectedVendor.idFrontImage ? (
                      <img src={selectedVendor.idFrontImage.startsWith('http') ? selectedVendor.idFrontImage : `${import.meta.env.VITE_API_URL.replace('/api', '')}${selectedVendor.idFrontImage}`} alt="ID Front" style={{maxWidth:"100%",maxHeight:"200px",borderRadius:"8px",border:"1px solid var(--border-color)"}} />
                    ) : (
                      <div style={{padding:"40px",textAlign:"center",background:"var(--bg-secondary)",borderRadius:"8px",color:"var(--brand-muted)"}}>No image</div>
                    )}
                  </div>
                  <div>
                    <p style={{fontSize:"12px",color:"var(--brand-muted)",marginBottom:"8px"}}>Back</p>
                    {selectedVendor.idBackImage ? (
                      <img src={selectedVendor.idBackImage.startsWith('http') ? selectedVendor.idBackImage : `${import.meta.env.VITE_API_URL.replace('/api', '')}${selectedVendor.idBackImage}`} alt="ID Back" style={{maxWidth:"100%",maxHeight:"200px",borderRadius:"8px",border:"1px solid var(--border-color)"}} />
                    ) : (
                      <div style={{padding:"40px",textAlign:"center",background:"var(--bg-secondary)",borderRadius:"8px",color:"var(--brand-muted)"}}>No image</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Products ──────────────────────────────────────────────────────────────────
function AdminProducts({ addToast, fmt }) {
  const [products,   setProducts]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState(EMPTY_PRODUCT);
  const [formErrors, setFormErrors] = useState({});
  const [saving,     setSaving]     = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current=true; return ()=>{mountedRef.current=false;}; }, []);

  useEffect(() => {
    productAPI.getAll()
      .then(d => { if(mountedRef.current) setProducts(Array.isArray(d)?d:[]); })
      .catch(err => { if(mountedRef.current) addToast?.(err.message,"error"); setProducts([]); })
      .finally(() => { if(mountedRef.current) setLoading(false); });
  }, [addToast]);

  // Handle image changes
  const handleImagesChange = useCallback((newImages) => {
    setForm((prev) => ({ ...prev, images: newImages }));
    setFormErrors((prev) => ({ ...prev, image: "" }));
  }, []);

  function validate() {
    const e={};
    if(!form.name?.trim()) e.name="Required";
    if(!form.description?.trim()) e.description="Required";
    if(!form.price||isNaN(form.price)||Number(form.price)<=0) e.price="Enter a valid price";
    if(!form.category?.trim()) e.category="Required";
    // Check for at least one image
    const hasImages = form.images?.length > 0 || form.image;
    if(!hasImages) e.image="Upload at least one image";
    return e;
  }

  async function handleAdd(e) {
    e.preventDefault(); if(saving) return;
    const errs = validate(); if(Object.keys(errs).length){ setFormErrors(errs); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        price: parseFloat(form.price),
        category: form.category,
        stock: form.stock ? parseInt(form.stock, 10) : 0,
        available: form.available,
      };

      // Get file objects from form.images
      const imageList = form.images || [];
      const newFiles = imageList.filter(img => img.file).map(img => img.file);

      const created = await productAPI.create(payload, newFiles);
      if(!mountedRef.current) return;
      setProducts(prev => Array.isArray(prev)?[created,...prev]:[created]);
      setForm(EMPTY_PRODUCT); setShowForm(false); setFormErrors({});
      addToast?.("Product added!","success");
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
    finally { if(mountedRef.current) setSaving(false); }
  }

  async function handleDelete(id) {
    if(!id) return;
    if(!window.confirm("Delete this product?")) return;
    try {
      await productAPI.delete(id);
      if(!mountedRef.current) return;
      setProducts(prev => Array.isArray(prev)?prev.filter(p=>p._id!==id):[]);
      addToast?.("Product deleted.","info");
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
  }

  const f = (key) => ({ value: form[key], onChange: (e) => { setForm({...form,[key]:e.target.value}); setFormErrors({...formErrors,[key]:""}); } });
  const safeProducts = Array.isArray(products) ? products : [];

  // Get primary image for table display (support both new and legacy)
  const getPrimaryImage = (p) => {
    if (p.images && p.images.length > 0) return p.images[0].url;
    return p.image || "";
  };

  return (
    <div>
      <div className={styles.toolbar}>
        <span style={{fontWeight:600}}>{safeProducts.length} products</span>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(v=>!v)}>{showForm?"✕ Cancel":"+ Add Product"}</button>
      </div>
      {showForm && (
        <div className={styles.formCard}>
          <h4>Add New Product</h4>
          <form onSubmit={handleAdd} noValidate>
            <div className={styles.formGrid}>
              <div className={styles.formFields}>
                {[["name","Name","text","Product name"],["description","Description","textarea","Describe it"],["price","Price (GHS)","number","9.99"],["category","Category","text","e.g. Electronics"],["stock","Stock Qty","number","0"]].map(([key,label,type,ph]) => (
                  <div key={key} className={styles.formGroup}>
                    <label className={styles.label}>{label}</label>
                    {type==="textarea"?<textarea rows={2} placeholder={ph} {...f(key)} style={{resize:"vertical"}}/>:<input type={type} step={type==="number"?"0.01":undefined} min={type==="number"?"0":undefined} placeholder={ph} {...f(key)}/>}
                    {formErrors[key] && <span className={styles.fieldError}>{formErrors[key]}</span>}
                  </div>
                ))}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Availability</label>
                  <select value={form.available} onChange={e=>setForm({...form,available:e.target.value==="true"})}>
                    <option value="true">Available</option>
                    <option value="false">Unavailable</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={styles.label}>Product Images (max 10)</label>
                <MultiImageUpload
                  images={form.images || []}
                  onImagesChange={handleImagesChange}
                />
                {formErrors.image && <span className={styles.fieldError}>{formErrors.image}</span>}
              </div>
            </div>
            <div className={styles.formActions}>
              <button type="button" className="btn btn-ghost" onClick={() => {setShowForm(false);setForm(EMPTY_PRODUCT);setFormErrors({});}}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving?"Saving…":"Add Product"}</button>
            </div>
          </form>
        </div>
      )}
      {loading ? <div className="loading-center"><div className="spinner"/></div> : (
        <div className="table-wrap" style={{marginTop:8}}>
          <table className="data-table">
            <thead><tr><th>Image</th><th>Name</th><th>Category</th><th>Vendor</th><th>Price</th><th>Stock</th><th></th></tr></thead>
            <tbody>
              {safeProducts.map(p => {
                if(!p?._id) return null;
                const price = typeof p.price==="number"?p.price:0;
                const primaryImage = getPrimaryImage(p);
                return (
                  <tr key={p._id}>
                    <td>{primaryImage?<img src={primaryImage} alt={p.name||"Product"} style={{width:40,height:40,objectFit:"cover",borderRadius:8}}/>:<div style={{width:40,height:40,background:"var(--brand-surface)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"}}>🛍️</div>}</td>
                    <td><strong>{p.name||"—"}</strong></td>
                    <td>{p.category||"—"}</td>
                    <td>{p.vendorName || (typeof p.vendorId === "object" && p.vendorId?.storeName ? p.vendorId.storeName : <em style={{color:"var(--brand-muted)"}}>—</em>)}</td>
                    <td>{fmt(price)}</td>
                    <td>{(typeof p.stock === "number" && p.stock >= 999) ? "∞" : (typeof p.stock === "number" ? p.stock : 0)}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => handleDelete(p._id)}>Delete</button></td>
                  </tr>
                );
              })}
              {safeProducts.length===0 && <tr><td colSpan={7} style={{textAlign:"center",color:"var(--brand-muted)",padding:"32px"}}>No products yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Orders ────────────────────────────────────────────────────────────────────
function AdminOrders({ addToast, fmt, setImageModal }) {
  const [orders,         setOrders]         = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [updating,       setUpdating]       = useState(null);
  const [expandedOrder,  setExpandedOrder]  = useState(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current=true; return ()=>{mountedRef.current=false;}; }, []);

  useEffect(() => {
    adminAPI.getOrders()
      .then(d => { if(mountedRef.current) setOrders(Array.isArray(d)?d:[]); })
      .catch(err => { if(mountedRef.current) addToast?.(err.message,"error"); setOrders([]); })
      .finally(() => { if(mountedRef.current) setLoading(false); });
  }, [addToast]);

  async function handleStatus(id, os) {
    if(updating===id) return; setUpdating(id);
    const legacyMap = {pending:"pending",confirmed:"confirmed",preparing:"preparing",out_for_delivery:"out_for_delivery",delivered:"delivered"};
    try {
      const updated = await orderAPI.updateStatus(id, legacyMap[os]||"pending");
      if(!mountedRef.current) return;
      setOrders(prev=>(Array.isArray(prev)?prev:[]).map(o=>o._id===id?(updated||o):o));
      addToast?.("Order updated.","success");
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
    finally { if(mountedRef.current) setUpdating(null); }
  }

  if(loading) return <div className="loading-center"><div className="spinner"/></div>;
  const safeOrders = Array.isArray(orders) ? orders : [];

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Order #</th><th>Customer</th><th>Phone</th><th>Total</th><th>Method</th><th>Payment</th><th>Status</th><th>Update</th></tr></thead>
        <tbody>
          {safeOrders.map(o => {
            if(!o?._id) return null;
            const isExpanded = expandedOrder === o._id;
            return (
              <React.Fragment key={o._id}>
                <tr onClick={() => setExpandedOrder(isExpanded ? null : o._id)} style={{cursor:"pointer"}} className={isExpanded ? styles.expandedRow : ""}>
                  <td><code>{safeId(o._id)}</code><br/><small style={{color:"var(--brand-muted)"}}>{o.createdAt?new Date(o.createdAt).toLocaleDateString():"—"}</small></td>
                  <td>{o.customerName||"—"}<br/><small style={{color:"var(--brand-muted)"}}>{o.customerEmail||""}</small></td>
                  <td>{o.customerPhone||<em style={{color:"var(--brand-muted)"}}>—</em>}</td>
                  <td><strong>{fmt(typeof o.totalAmount==="number"?o.totalAmount:0)}</strong></td>
                  <td>{o.paymentMethod==="cash"?"💵 COD":"💳 Card"}</td>
                  <td><span className={`badge ${o.paymentStatus==="paid"?"badge-delivered":"badge-pending"}`}>{o.paymentStatus||"unknown"}</span></td>
                  <td><StatusBadge status={o.orderStatus||o.status}/></td>
                  <td onClick={e => e.stopPropagation()}>
                    <select value={o.orderStatus||"pending"} onChange={e=>handleStatus(o._id,e.target.value)} className={styles.statusSelect} disabled={updating===o._id}>
                      {ORDER_STATUSES.map(s=><option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
                    </select>
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${o._id}-detail`} className={styles.detailRow}>
                    <td colSpan={8} style={{padding:"16px 20px"}}>
                      <div className={styles.trackerWrap}>
                        <p className={styles.detailHeading}><strong>Order Progress</strong> — tap row to collapse</p>
                        <OrderTracker orderStatus={o.orderStatus || "pending"}/>
                        {o.items && o.items.length > 0 && (
                          <div className={styles.orderItemsList}>
                            <strong>Items:</strong>
                            {o.items.map((item, idx) => {
                              const rawImg = getItemImage(item);
                              const itemImg = rawImg;
                              return (
                              <div key={idx} className={styles.orderItemRow}>
                                {itemImg && <img src={itemImg} alt={item.name} style={{width:"40px",height:"40px",borderRadius:"4px",marginRight:"8px",objectFit:"cover",cursor:"pointer"}} onClick={() => setImageModal({ isOpen: true, src: itemImg, title: item.name || "Product Image" })} onError={(e) => { e.target.style.display = "none"; }} />}
                                <span>{item.quantity}x {item.name}</span>
                                <span>{fmt((typeof item.price === "number" ? item.price : 0) * (typeof item.quantity === "number" ? item.quantity : 1))}</span>
                              </div>
                            );
                          })}
                            {o.deliveryAddress && (
                              <p className={styles.deliveryAddr}><strong>Delivery address:</strong> {o.deliveryAddress}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {safeOrders.length===0 && <tr><td colSpan={8} style={{textAlign:"center",color:"var(--brand-muted)",padding:"32px"}}>No orders yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ── Promo management ──────────────────────────────────────────────────────────
function AdminPromos({ addToast, fmt }) {
  const [promos,   setPromos]   = useState([]);
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [form,     setForm]     = useState({ productId:"", discountPercent:"", startDate:"", endDate:"", title:"" });
  const [formErrors, setFormErrors] = useState({});
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current=true; return ()=>{mountedRef.current=false;}; }, []);

  useEffect(() => {
    Promise.all([promoAPI.getAdmin(), productAPI.getAll()])
      .then(([p, pr]) => {
        if(!mountedRef.current) return;
        setPromos(Array.isArray(p)?p:[]);
        setProducts(Array.isArray(pr)?pr:[]);
      })
      .catch(err => { if(mountedRef.current) addToast?.(err.message,"error"); })
      .finally(() => { if(mountedRef.current) setLoading(false); });
  }, [addToast]);

  function validateForm() {
    const e={};
    if(!form.productId) e.productId="Select a product";
    if(!form.discountPercent||isNaN(form.discountPercent)||Number(form.discountPercent)<1||Number(form.discountPercent)>99) e.discountPercent="Enter 1–99";
    if(!form.startDate) e.startDate="Required";
    if(!form.endDate)   e.endDate="Required";
    else if(new Date(form.endDate)<=new Date(form.startDate)) e.endDate="End must be after start";
    return e;
  }

  async function handleCreate(e) {
    e.preventDefault(); if(saving) return;
    const errs = validateForm(); if(Object.keys(errs).length){ setFormErrors(errs); return; }
    setSaving(true);
    try {
      await promoAPI.create({
        productId:       form.productId,
        discountPercent: Number(form.discountPercent),
        startDate:       new Date(form.startDate).toISOString(),
        endDate:         new Date(form.endDate).toISOString(),
        title:           form.title.trim(),
      });
      if(!mountedRef.current) return;
      const updated = await promoAPI.getAdmin();
      if(mountedRef.current) setPromos(Array.isArray(updated)?updated:[]);
      setShowForm(false); setForm({productId:"",discountPercent:"",startDate:"",endDate:"",title:""});
      addToast?.("Promo created! 🎉","success");
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
    finally { if(mountedRef.current) setSaving(false); }
  }

  async function handleDelete(id) {
    if(!window.confirm("Delete this promo?")) return;
    try {
      await promoAPI.delete(id);
      if(!mountedRef.current) return;
      setPromos(prev=>(Array.isArray(prev)?prev:[]).filter(p=>p._id!==id));
      addToast?.("Promo deleted.","info");
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
  }

  async function toggleActive(promo) {
    try {
      await promoAPI.update(promo._id, { active: !promo.active });
      if(!mountedRef.current) return;
      setPromos(prev=>(Array.isArray(prev)?prev:[]).map(p=>p._id===promo._id?{...p,active:!p.active}:p));
    } catch (err) { if(mountedRef.current) addToast?.(err.message,"error"); }
  }

  const f = (key) => ({ value: form[key], onChange: (e)=>{ setForm({...form,[key]:e.target.value}); setFormErrors({...formErrors,[key]:""}); } });
  const safePromos = Array.isArray(promos) ? promos : [];

  return (
    <div>
      <div className={styles.toolbar}>
        <span style={{fontWeight:600}}>{safePromos.length} promo{safePromos.length!==1?"s":""}</span>
        <button className="btn btn-primary btn-sm" onClick={()=>setShowForm(v=>!v)}>{showForm?"✕ Cancel":"+ New Promo"}</button>
      </div>

      {showForm && (
        <div className={styles.formCard}>
          <h4>Create Flash Deal</h4>
          <form onSubmit={handleCreate} noValidate>
            <div className={styles.promoFormGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Product</label>
                <select {...f("productId")} className={styles.select}>
                  <option value="">— Select a product —</option>
                  {(Array.isArray(products)?products:[]).map(p=>(
                    <option key={p._id} value={p._id}>{p.name} ({fmt(p.price||0)})</option>
                  ))}
                </select>
                {formErrors.productId && <span className={styles.fieldError}>{formErrors.productId}</span>}
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Discount %</label>
                <input type="number" min="1" max="99" placeholder="e.g. 30" {...f("discountPercent")}/>
                {formErrors.discountPercent && <span className={styles.fieldError}>{formErrors.discountPercent}</span>}
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Start Date & Time</label>
                <input type="datetime-local" {...f("startDate")}/>
                {formErrors.startDate && <span className={styles.fieldError}>{formErrors.startDate}</span>}
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>End Date & Time</label>
                <input type="datetime-local" {...f("endDate")}/>
                {formErrors.endDate && <span className={styles.fieldError}>{formErrors.endDate}</span>}
              </div>
              <div className={styles.formGroup} style={{gridColumn:"span 2"}}>
                <label className={styles.label}>Promo Title (optional)</label>
                <input type="text" placeholder="e.g. Weekend Special — 30% Off" {...f("title")}/>
              </div>
            </div>
            <div className={styles.formActions}>
              <button type="button" className="btn btn-ghost" onClick={()=>{setShowForm(false);setFormErrors({});}}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving?"Creating…":"Create Promo"}</button>
            </div>
          </form>
        </div>
      )}

      {loading ? <div className="loading-center"><div className="spinner"/></div> : (
        <div className="table-wrap" style={{marginTop:8}}>
          <table className="data-table">
            <thead><tr><th>Product</th><th>Discount</th><th>Original</th><th>Sale Price</th><th>Start</th><th>End</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {safePromos.map(promo => {
                if(!promo?._id) return null;
                const product  = promo.productId;
                const now      = new Date();
                const start    = new Date(promo.startDate);
                const end      = new Date(promo.endDate);
                const isLive   = promo.active && start <= now && end > now;
                const isFuture = promo.active && start > now;
                const original = typeof product?.price === "number" ? product.price : 0;
                const sale     = parseFloat((original * (1 - (promo.discountPercent||0)/100)).toFixed(2));

                return (
                  <tr key={promo._id}>
                    <td><strong>{product?.name||"—"}</strong></td>
                    <td><span style={{fontWeight:700,color:"var(--brand-primary)"}}>{promo.discountPercent}%</span></td>
                    <td>{fmt(original)}</td>
                    <td><strong>{fmt(sale)}</strong></td>
                    <td style={{fontSize:"0.78rem"}}>{start.toLocaleString()}</td>
                    <td style={{fontSize:"0.78rem"}}>{end.toLocaleString()}</td>
                    <td>
                      {!promo.active ? <span className="badge badge-pending">Inactive</span>
                        : isLive     ? <span className="badge badge-delivered">🔴 Live</span>
                        : isFuture   ? <span className="badge badge-preparing">Scheduled</span>
                        :              <span className="badge badge-pending">Expired</span>
                      }
                    </td>
                    <td>
                      <div className={styles.actionBtns}>
                        <button className={`btn btn-sm ${promo.active?"btn-secondary":"btn-primary"}`} onClick={()=>toggleActive(promo)}>
                          {promo.active?"Pause":"Activate"}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={()=>handleDelete(promo._id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {safePromos.length===0 && <tr><td colSpan={8} style={{textAlign:"center",color:"var(--brand-muted)",padding:"32px"}}>No promos yet. Create your first flash deal!</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}