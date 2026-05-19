// pages/StoresPage.jsx — v3: currency-aware, fully responsive
import { useState, useEffect, useRef, useCallback } from "react";
import { vendorAPI, productAPI } from "../services/api";
import { useCurrency } from "../context/CurrencyContext";
import { getImageUrl } from "../utils/image";
import styles from "./StoresPage.module.css";

function safeInitials(name) {
  const s = String(name||"S").trim();
  if (!s) return "S";
  return s.split(/\s+/).map(w=>w[0]||"").join("").slice(0,2).toUpperCase()||"S";
}

export default function StoresPage({ onNavigate, onAddToCart }) {
  const { fmt }       = useCurrency();
  const [vendors,     setVendors]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  // Initialize selected vendor from sessionStorage to preserve across navigations
  const [selected,    setSelected]    = useState(() => {
    try {
      const stored = sessionStorage.getItem("selectedVendor");
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  // Initialize products from sessionStorage
  const [products,    setProducts]    = useState(() => {
    try {
      const stored = sessionStorage.getItem("selectedVendorProducts");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [prodLoading, setProdLoading] = useState(false);
  const mountedRef = useRef(true);

  // Persist selected vendor and products to sessionStorage
  const handleSetSelectedVendor = useCallback((vendor, prods) => {
    setSelected(vendor);
    setProducts(prods || []);
    try {
      if (vendor) {
        sessionStorage.setItem("selectedVendor", JSON.stringify(vendor));
        sessionStorage.setItem("selectedVendorProducts", JSON.stringify(prods || []));
      } else {
        sessionStorage.removeItem("selectedVendor");
        sessionStorage.removeItem("selectedVendorProducts");
      }
    } catch {}
  }, []);

  useEffect(() => { mountedRef.current=true; return ()=>{mountedRef.current=false;}; }, []);

  useEffect(() => {
    if (typeof vendorAPI?.getList !== "function") {
      if (mountedRef.current) {
        setError("Store listing is temporarily unavailable.");
        setLoading(false);
      }
      return;
    }

    vendorAPI.getList()
      .then(data => { if(mountedRef.current) setVendors(Array.isArray(data)?data:[]); })
      .catch(err  => { if(mountedRef.current){ setError(err.message||"Failed to load stores"); setVendors([]); } })
      .finally(() => { if(mountedRef.current) setLoading(false); });
  }, []);

  async function openStore(vendor) {
    if (!vendor?._id) return;
    handleSetSelectedVendor(vendor, []); // Clear products while loading
    setProdLoading(true);
    try {
      const data = await productAPI.getAll({ vendorId: vendor._id });
      if(mountedRef.current) {
        const prods = Array.isArray(data) ? data : [];
        setProducts(prods);
        // Persist products to sessionStorage
        try {
          sessionStorage.setItem("selectedVendorProducts", JSON.stringify(prods));
        } catch {}
      }
    } catch { if(mountedRef.current) setProducts([]); }
    finally  { if(mountedRef.current) setProdLoading(false); }
  }

  if (loading) return (
    <div className="container"><div className="loading-center"><div className="spinner"/><p>Loading stores…</p></div></div>
  );

  if (error) return (
    <div className="container">
      <div className="empty-state" style={{paddingTop:60}}>
        <div className="empty-icon">⚠️</div>
        <h3>Could not load stores</h3>
        <p>{error}</p>
        <button className="btn btn-primary" style={{marginTop:16}} onClick={() => window.location.reload()}>Retry</button>
      </div>
    </div>
  );

  const safeVendors  = Array.isArray(vendors)  ? vendors  : [];
  const safeProducts = Array.isArray(products) ? products : [];

  return (
    <div className={`container page-enter ${styles.page}`}>
      <div className="page-header">
        <h1>All Stores</h1>
        <p>{safeVendors.length} verified vendor{safeVendors.length!==1?"s":""} on SiiShop</p>
      </div>

      {safeVendors.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏪</div>
          <h3>No stores yet</h3>
          <p>Register as a vendor to be the first seller!</p>
        </div>
      ) : (
        <div className={styles.layout}>
          {/* Vendor list */}
          <div className={styles.vendorList}>
            {safeVendors.map(v => {
              if (!v?._id) return null;
              const storeName = v.storeName || v.name || "Store";
              return (
                <button key={v._id}
                  className={`${styles.vendorCard} ${selected?._id===v._id?styles.vendorCardActive:""}`}
                  onClick={() => openStore(v)}>
                  <div className={styles.vendorAvatar}>
                    {v.storeLogo
                      ? <img src={getImageUrl(v.storeLogo)} alt={storeName} className={styles.storeLogo}/>
                      : <span>{safeInitials(v.storeName)}</span>
                    }
                  </div>
                  <div className={styles.vendorInfo}>
                    <h3 className={styles.storeName}>{storeName}</h3>
                    <p className={styles.storeDesc}>{v.storeDescription||"Quality products"}</p>
                    <p className={styles.vendorMeta}>by {v.name||"Vendor"}</p>
                  </div>
                  <span className={styles.chevron}>›</span>
                </button>
              );
            })}
          </div>

          {/* Product panel */}
          <div className={styles.productPanel}>
            {!selected ? (
              <div className={styles.selectPrompt}>
                <div style={{fontSize:"2.5rem"}}>👈</div>
                <p>Select a store to browse their products</p>
              </div>
            ) : prodLoading ? (
              <div className="loading-center"><div className="spinner"/></div>
            ) : (
              <>
                <div className={styles.panelHeader}>
                  <div>
                    <h2>{selected.storeName||selected.name||"Store"}</h2>
                    {selected.storeDescription && <p className={styles.panelDesc}>{selected.storeDescription}</p>}
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => onNavigate?.("home")}>Browse All</button>
                </div>

                {safeProducts.length === 0 ? (
                  <div className="empty-state" style={{paddingTop:40}}>
                    <div className="empty-icon">📦</div>
                    <h3>No products listed yet</h3>
                  </div>
                ) : (
                  <div className={styles.productGrid}>
                    {safeProducts.map(p => {
                      if (!p?._id) return null;
                      const price = typeof p.price==="number" ? p.price : 0;
                      const stock = typeof p.stock==="number" ? p.stock : 999;
                      // Get the primary image - support both new images array and legacy image field
                      const primaryImage = p.images && p.images.length > 0
                        ? getImageUrl(p.images[0]?.url)
                        : getImageUrl(p.image);
                      return (
                        <div key={p._id} className={`card ${styles.miniCard}`} onClick={() => onNavigate?.("product", p)} style={{cursor:"pointer"}}>
                          {primaryImage && primaryImage !== "/no-image.svg"
                            ? <img src={primaryImage} alt={p.name||"Product"} className={styles.miniImg}/>
                            : <div className={styles.miniImgPlaceholder}>🛍️</div>
                          }
                          <div className={styles.miniBody}>
                            <p className={styles.miniName}>{p.name||"Product"}</p>
                            <p className={styles.miniPrice}>{fmt(price)}</p>
                            <button
                              className="btn btn-primary btn-sm"
                              style={{width:"100%",borderRadius:"var(--radius-full)"}}
                              onClick={(e) => { e.stopPropagation(); onAddToCart?.(p); }}
                              disabled={stock===0}>
                              {stock===0 ? "Sold Out" : "+ Add"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
