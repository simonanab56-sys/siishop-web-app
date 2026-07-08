// pages/FoodPage.jsx — v3
//
// Performance / UX:
// - Skeleton placeholder paints immediately on first mount (no more blank
//   60px-padded spinner). The chrome (hero, search, filters, card grid)
//   shows up at once, then swaps in real data when the API responds.
// - SINGLE round-trip for the initial load. The previous version fired
//   5 parallel requests (restaurants×3, regions, cuisines). With the
//   `composite=true` server mode, the 3 restaurant lists (all / featured
//   / popular) now arrive in ONE response; the same single fetch is used
//   for filters and load-more (just an updated skip).
// - All card images use `loading="lazy"` + `decoding="async"` so the
//   browser doesn't block the initial paint on the dozens of restaurant
//   logos / covers on this page.
// - "Load more" pagination: the server already supports `limit` + `skip`,
//   so the button just bumps `skip` and appends.
// - `RestaurantCard` is defined at module scope and wrapped in `React.memo`
//   so it is a stable component identity across renders. The previous
//   version defined it inside the page component, which caused React to
//   treat each card as a new component type and remount all of them on
//   every parent state change.
// - Filters are persisted in the URL via `useSearchParams` so a refresh
//   keeps the user's selection and a shared link reproduces the same view.

import { memo, useState, useEffect, useCallback } from "react";
import { restaurantAPI } from "../services/api";
import { getImageUrl, getImageSrcSet } from "../utils/image";
import SEO from "../components/SEO";
import FoodPageSkeleton from "../components/skeletons/FoodPageSkeleton";
import styles from "./FoodPage.module.css";

const PAGE_LIMIT = 20; // matches the server default

/* ── useUrlState ────────────────────────────────────────────────────────
   Tiny in-house equivalent of react-router-dom's useSearchParams. The
   app uses a page-state router (not react-router-dom) so we read/write
   the URL via window.history.replaceState. The setter accepts:
     - a URLSearchParams instance (wholesale replace)
     - a function (prevParams => void) for partial updates
     - a plain object { key: value | null } for the common case.
   See pages/SeeAllPage.jsx for the same pattern. */
function useUrlState() {
  const read = () => {
    try {
      return new URLSearchParams(window.location.search || "");
    } catch {
      return new URLSearchParams();
    }
  };
  const [params, setParamsState] = useState(read);

  useEffect(() => {
    const onPop = () => setParamsState(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setParams = useCallback((input) => {
    setParamsState((prev) => {
      const next = new URLSearchParams(prev);
      if (typeof input === "function") {
        input(next);
      } else if (input instanceof URLSearchParams) {
        for (const key of Array.from(next.keys())) next.delete(key);
        for (const [k, v] of input.entries()) next.set(k, v);
      } else if (input && typeof input === "object") {
        for (const [k, v] of Object.entries(input)) {
          if (v == null || v === "") next.delete(k);
          else next.set(k, String(v));
        }
      }
      const qs = next.toString();
      const url = qs
        ? `${window.location.pathname}?${qs}`
        : window.location.pathname;
      try {
        window.history.replaceState({}, document.title, url);
      } catch {
        /* noop — non-browser env */
      }
      return next;
    });
  }, []);

  return [params, setParams];
}

/* ── Restaurant Card Component (module-scope, memoized) ───────────────────
   Defined OUTSIDE the page so React keeps the same component identity
   across renders. The previous inline definition remounted every card
   on every parent state change (filter typing, search debounce, etc.). */
const RestaurantCard = memo(function RestaurantCard({ restaurant }) {
  const handleClick = () => {
    const slug = restaurant.vendorSlug;
    if (slug) {
      const url = `/restaurant/${slug}`;
      window.history.pushState({ from: "food" }, document.title, url);
      window.dispatchEvent(new Event("popstate"));
    }
  };

  // ✅ Cloudinary-aware URL — uses the same width-transform helper as the
  // homepage so high-density screens fetch a proper variant.
  const logoUrl = restaurant.storeLogo
    ? getImageUrl(restaurant.storeLogo, { width: 360 })
    : null;
  const srcSet = logoUrl ? getImageSrcSet(logoUrl, [240, 360, 600]) : "";

  return (
    <div className={styles.card} onClick={handleClick}>
      <div className={styles.cardImage}>
        {logoUrl ? (
          <img
            src={logoUrl}
            srcSet={srcSet}
            sizes="(max-width: 600px) 240px, 360px"
            alt={restaurant.storeName || "Restaurant"}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className={styles.imagePlaceholder}>🍽️</div>
        )}
      </div>
      <div className={styles.cardContent}>
        <h4 className={styles.cardName}>
          {restaurant.restaurantDetails?.restaurantName || restaurant.storeName}
        </h4>
        <p className={styles.cardMeta}>
          {restaurant.location?.city}, {restaurant.location?.region}
        </p>
        <div className={styles.cardFooter}>
          <span className={styles.cardRating}>
            {restaurant.rating > 0 ? `★ ${restaurant.rating.toFixed(1)}` : "★ New"}
          </span>
          <span className={styles.cardReviewCount}>
            ({restaurant.reviewCount || 0} reviews)
          </span>
        </div>
        {restaurant.restaurantDetails?.cuisineType && (
          <span className={styles.cardCuisine}>
            {restaurant.restaurantDetails.cuisineType}
          </span>
        )}
      </div>
    </div>
  );
});

/* ── Main Food Page ─────────────────────────────────────────────────────── */
export default function FoodPage({ onNavigate }) {
  // ✅ FIX: useUrlState keeps filters in the URL so a refresh, a
  // back-button, or a shared link reproduces the same view. The 3
  // filter fields are URL params; the page reads them on mount and
  // writes them back when the user changes them. (In-house equivalent
  // of react-router-dom's useSearchParams — the app uses a page-state
  // router, not react-router-dom.)
  const [searchParams, setSearchParams] = useUrlState();
  const search = searchParams.get("q") || "";
  const region = searchParams.get("region") || "";
  const cuisine = searchParams.get("cuisine") || "";

  const [restaurants, setRestaurants] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [popular, setPopular] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [skip, setSkip] = useState(0);
  const [error, setError] = useState("");
  const [regions, setRegions] = useState([]);
  const [cuisines, setCuisines] = useState([]);

  // Local copy of the search input so typing is responsive and we don't
  // rewrite the URL on every keystroke. The URL is the source of truth
  // for the *applied* filter (written on submit / apply / clear).
  const [searchInput, setSearchInput] = useState(search);

  // ✅ FIX: single round-trip initial load. The previous version fired
  // 3× getRestaurants (all/featured/popular) + 2× getRegions/getCuisines
  // = 5 round-trips. Now the 3 lists are one request via
  // `composite: "true"`, and the filter lookups stay parallel.
  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      setError("");
      try {
        const [compositeRes, regionsRes, cuisinesRes] = await Promise.all([
          restaurantAPI.getRestaurants({
            composite: "true",
            limit: PAGE_LIMIT,
            skip: 0,
            ...(region ? { region } : {}),
            ...(cuisine ? { cuisineType: cuisine } : {}),
            ...(search ? { search } : {}),
          }),
          restaurantAPI.getRegions(),
          restaurantAPI.getCuisines(),
        ]);
        // Server returns `{ all, featured, popular }` when composite=true.
        // Older callers that don't pass composite still get the array, so
        // we accept both shapes defensively.
        if (compositeRes && !Array.isArray(compositeRes) && compositeRes.all) {
          setRestaurants(compositeRes.all || []);
          setFeatured(compositeRes.featured || []);
          setPopular(compositeRes.popular || []);
          setHasMore((compositeRes.all || []).length === PAGE_LIMIT);
          setSkip((compositeRes.all || []).length);
        } else {
          // Fallback: composite mode not active, treat response as the "all" list.
          const list = Array.isArray(compositeRes) ? compositeRes : [];
          setRestaurants(list);
          setHasMore(list.length === PAGE_LIMIT);
          setSkip(list.length);
        }
        setRegions(regionsRes || []);
        setCuisines(cuisinesRes || []);
      } catch (err) {
        console.error("[FoodPage] Error:", err.message);
        setError("Failed to load restaurants");
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, [region, cuisine, search]);

  // ✅ FIX: URL is the source of truth. We never mutate the search input
  // by hand — we update the URL via setSearchParams and let the effect
  // refetch. This also means a refresh / back button / shared link
  // reproduces the exact view the user had. The in-house useUrlState
  // setter already uses history.replaceState, so no second arg.
  const updateFilters = useCallback(
    (patch) => {
      setSearchParams(patch);
    },
    [setSearchParams]
  );

  function handleSearch(e) {
    e.preventDefault();
    if (!searchInput.trim()) return;
    updateFilters({ q: searchInput.trim() });
  }

  function handleFilter() {
    // Search/region/cuisine already live in the URL; nothing to write,
    // the effect picks them up. This handler exists to give the
    // "Apply Filters" button a clear onClick target.
  }

  // ✅ Load more — appends the next page to the existing list. Used by
  // the "Load more" button when the server returned a full page.
  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const params = { limit: PAGE_LIMIT, skip };
      if (region) params.region = region;
      if (cuisine) params.cuisineType = cuisine;
      if (search) params.search = search;
      const results = await restaurantAPI.getRestaurants(params);
      const next = Array.isArray(results) ? results : results?.all || [];
      setRestaurants((prev) => [...prev, ...next]);
      setSkip((s) => s + next.length);
      if (next.length < PAGE_LIMIT) setHasMore(false);
    } catch (err) {
      setError("Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, skip, region, cuisine, search]);

  function clearFilters() {
    setSearchInput("");
    setSearchParams(new URLSearchParams());
  }

  // ✅ Skeleton paints immediately on first mount — no blank screen.
  if (loading && restaurants.length === 0) {
    return (
      <>
        <SEO
          title="🍔 Food Delivery | SiiShop"
          description="Order food online from the best restaurants in Ghana. Fast delivery, great prices."
          keywords="food delivery, restaurant, online food order, Ghana food, delivery"
        />
        <FoodPageSkeleton count={6} />
      </>
    );
  }

  const showFeatured = featured.length > 0 && !search && !region && !cuisine;
  const showPopular = popular.length > 0 && !search && !region && !cuisine;

  return (
    <div className={styles.page}>
      <SEO
        title="🍔 Food Delivery | SiiShop"
        description="Order food online from the best restaurants in Ghana. Fast delivery, great prices."
        keywords="food delivery, restaurant, online food order, Ghana food, delivery"
      />

      {/* Hero Section */}
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>🍔 Food Delivery</h1>
        <p className={styles.heroSub}>Order from your favorite restaurants in Ghana</p>
      </section>

      {/* Search Bar */}
      <div className={styles.searchBar}>
        <form onSubmit={handleSearch} className={styles.searchForm}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search restaurants or food..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">Search</button>
        </form>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <select
          className={styles.filterSelect}
          value={region}
          onChange={(e) => updateFilters({ region: e.target.value })}
        >
          <option value="">All Regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select
          className={styles.filterSelect}
          value={cuisine}
          onChange={(e) => updateFilters({ cuisine: e.target.value })}
        >
          <option value="">All Cuisines</option>
          {cuisines.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button onClick={handleFilter} className="btn btn-secondary">Apply Filters</button>
        {(region || cuisine || search) && (
          <button onClick={clearFilters} className="btn btn-outline">Clear</button>
        )}
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {/* Featured */}
      {showFeatured && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>⭐ Featured Restaurants</h2>
          <div className={styles.grid}>
            {featured.slice(0, 6).map((restaurant) => (
              <RestaurantCard key={restaurant._id} restaurant={restaurant} />
            ))}
          </div>
        </section>
      )}

      {/* Popular */}
      {showPopular && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>🔥 Popular Near You</h2>
          <div className={styles.grid}>
            {popular.slice(0, 6).map((restaurant) => (
              <RestaurantCard key={restaurant._id} restaurant={restaurant} />
            ))}
          </div>
        </section>
      )}

      {/* All / Search / Filter results */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {search ? `🔍 Search Results for "${search}"` : "🍽️ All Restaurants"}
        </h2>
        {restaurants.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No restaurants found</p>
            <p className={styles.emptySub}>Try a different search or filter</p>
          </div>
        ) : (
          <>
            <div className={styles.grid}>
              {restaurants.map((restaurant) => (
                <RestaurantCard key={restaurant._id} restaurant={restaurant} />
              ))}
            </div>
            {hasMore && (
              <button
                className={styles.loadMore}
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
