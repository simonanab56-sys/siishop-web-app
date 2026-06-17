// pages/StoresPage.jsx — v3: currency-aware, fully responsive
import { useState, useEffect, useRef, useCallback } from "react";
import { vendorAPI, productAPI } from "../services/api";
import { useCurrency } from "../context/CurrencyContext";
import { getImageUrl } from "../utils/image";
import { regions, getCitiesByRegion, formatLocation } from "../config/ghanaLocations";
import SEO from "../components/SEO";
import styles from "./StoresPage.module.css";

function safeInitials(name) {
  const s = String(name||"S").trim();
  if (!s) return "S";
  return s.split(/\s+/).map(w=>w[0]||"").join("").slice(0,2).toUpperCase()||"S";
}

export default function StoresPage({ onNavigate, onAddToCart, onRequireAuth, vendorContext, onClearVendorContext }) {
  const { fmt }       = useCurrency();
  const [vendors,     setVendors]     = useState([]);
  const [allVendors, setAllVendors]  = useState([]); // Keep original list for filtering
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [search,      setSearch]     = useState("");

  // Location filter state
  const [locationFilter, setLocationFilter] = useState({ region: "", city: "" });
  const [availableCities, setAvailableCities] = useState([]);
  const [customLocation, setCustomLocation] = useState({ region: "", city: "" });
  const [useCustomLocation, setUseCustomLocation] = useState({ region: false, city: false });

  // Initialize state from sessionStorage
  const [selected, setSelected] = useState(() => {
    try {
      const stored = sessionStorage.getItem("selectedVendor");
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  const [products, setProducts] = useState(() => {
    try {
      const stored = sessionStorage.getItem("selectedVendorProducts");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const [prodLoading, setProdLoading] = useState(false);
  const mountedRef = useRef(true);

  // Persist to sessionStorage when state changes
  const persistToStorage = useCallback((vendor, prods) => {
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

  useEffect(() => {
    mountedRef.current=true;
    setInitialized(true);
    return ()=>{mountedRef.current=false;};
  }, []);

  // Fetch vendors from API with optional search and location filter
  const fetchVendors = useCallback(async (searchQuery = "") => {
    if (typeof vendorAPI?.getList !== "function") {
      if (mountedRef.current) {
        setError("Store listing is temporarily unavailable.");
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      // Build params with search and location (dropdown or custom)
      const params = {};
      if (searchQuery) params.search = searchQuery;
      // Use custom input if selected, otherwise use dropdown
      const finalRegion = useCustomLocation.region ? customLocation.region : locationFilter.region;
      const finalCity = useCustomLocation.city ? customLocation.city : locationFilter.city;
      if (finalRegion) params.region = finalRegion;
      if (finalCity) params.city = finalCity;

      const data = await vendorAPI.getList(params);
      if (mountedRef.current) {
        let vendorList = Array.isArray(data) ? data : [];

        // Filter to show only the vendor in context
        if (vendorContext?.vendorId) {
          vendorList = vendorList.filter(v => v._id === vendorContext.vendorId);
        }

        setAllVendors(vendorList);
        setVendors(vendorList);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || "Failed to load stores");
        setVendors([]);
        setAllVendors([]);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [vendorContext]);

  useEffect(() => {
    mountedRef.current = true;
    setInitialized(true);
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    // Only fetch vendors if we don't have them cached and no search
    if (vendors.length > 0 && !search && !locationFilter.region && !locationFilter.city) return;
    fetchVendors(search);
  }, [vendors.length, search, locationFilter, fetchVendors]);

  // Update available cities when region changes
  useEffect(() => {
    if (locationFilter.region && !useCustomLocation.region) {
      setAvailableCities(getCitiesByRegion(locationFilter.region));
      // Reset city when region changes
      setLocationFilter(prev => ({ ...prev, city: "" }));
      setUseCustomLocation(prev => ({ ...prev, city: false }));
    } else if (!locationFilter.region) {
      setAvailableCities([]);
    }
  }, [locationFilter.region, useCustomLocation.region]);

  // Handle location filter change
  const handleLocationFilterChange = (field, value) => {
    if (value === "other") {
      setUseCustomLocation(prev => ({ ...prev, [field]: true }));
      setLocationFilter(prev => ({ ...prev, [field]: "" }));
    } else {
      setUseCustomLocation(prev => ({ ...prev, [field]: false }));
      setCustomLocation(prev => ({ ...prev, [field]: "" }));
      setLocationFilter(prev => ({ ...prev, [field]: value }));
    }
  };

  // Handle custom location input
  const handleCustomLocationChange = (field, value) => {
    setCustomLocation(prev => ({ ...prev, [field]: value }));
  };

  // ── Initialize search from mobile header or global search ───────────────────
  useEffect(() => {
    const mobileSearch = localStorage.getItem("mobile_search");
    const globalSearch = localStorage.getItem("global_search");
    if (mobileSearch) {
      setSearch(mobileSearch);
      localStorage.removeItem("mobile_search");
    } else if (globalSearch) {
      setSearch(globalSearch);
      localStorage.removeItem("global_search");
    }
  }, []);

  async function openStore(vendor) {
    if (!vendor?._id) return;
    setSelected(vendor);
    setProducts([]);
    persistToStorage(vendor, []);
    setProdLoading(true);
    try {
      const data = await productAPI.getAll({ vendorId: vendor._id });
      if(mountedRef.current) {
        const prods = Array.isArray(data)?data:[];
        setProducts(prods);
        persistToStorage(vendor, prods);
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
      <SEO
        title="Our Vendors | SiiShop Marketplace"
        description="Discover trusted vendors and sellers on SiiShop Ghana. Browse verified stores, shop quality products, secure checkout."
        keywords="vendor stores, seller marketplace, verified vendors, online shopping Ghana"
        url="https://siishops.com/vendors"
      />
      {/* Vendor Context Banner */}
      {vendorContext && (
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: '20px',
          borderRadius: '8px'
        }}>
          <span>🛒 Showing products from vendor store</span>
          <button
            onClick={onClearVendorContext}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.4)',
              color: 'white',
              padding: '6px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            ✕ Clear Filter
          </button>
        </div>
      )}

      <div className="page-header">
        <h1>{search ? "Search Results" : "All Stores"}</h1>
        <p>
          {search
            ? `${safeVendors.length} result${safeVendors.length !== 1 ? "s" : ""} for "${search}"`
            : `${safeVendors.length} verified vendor${safeVendors.length !== 1 ? "s" : ""} on SiiShop`
          }
        </p>
        {(search || locationFilter.region || locationFilter.city) && (
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => { setSearch(""); setLocationFilter({ region: "", city: "" }); }}
          >
            Clear Filters
          </button>
        )}

        {/* Location Filters */}
        <div className={styles.locationFilter}>
          {useCustomLocation.region ? (
            <input
              type="text"
              placeholder="Type region..."
              value={customLocation.region}
              onChange={(e) => handleCustomLocationChange('region', e.target.value)}
              className={styles.locationInput}
            />
          ) : (
            <select
              value={locationFilter.region}
              onChange={(e) => handleLocationFilterChange('region', e.target.value)}
            >
              <option value="">All Regions</option>
              {regions.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
              <option value="other">Other (type)</option>
            </select>
          )}

          {useCustomLocation.city ? (
            <input
              type="text"
              placeholder="Type city..."
              value={customLocation.city}
              onChange={(e) => handleCustomLocationChange('city', e.target.value)}
              className={styles.locationInput}
              disabled={!useCustomLocation.region && !locationFilter.region}
            />
          ) : (
            <select
              value={locationFilter.city}
              onChange={(e) => handleLocationFilterChange('city', e.target.value)}
              disabled={!locationFilter.region && !useCustomLocation.region}
            >
              <option value="">{(locationFilter.region || useCustomLocation.region) ? "All Cities" : "Select Region first"}</option>
              {availableCities.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="other">Other (type)</option>
            </select>
          )}
        </div>
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
                    {v.formattedLocation && v.formattedLocation !== "Location not specified" && (
                      <p className={styles.vendorMeta}>📍 {v.formattedLocation}</p>
                    )}
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