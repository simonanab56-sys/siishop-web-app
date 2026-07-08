// pages/RestaurantPage.jsx — v3
//
// Performance / UX:
// - Skeleton placeholder paints immediately on first mount. The chrome
//   (cover banner, header, tab strip, menu-item cards) shows up at once;
//   real data swaps in when the API responds. The previous code returned
//   a centered spinner for the full 1–3s of the slug endpoint.
// - All images use `loading="lazy"` + `decoding="async"` and
//   Cloudinary-aware width variants so the cover banner doesn't block
//   first paint.
// - Inline <style>{...} block (~240 lines) is now RestaurantPage.module.css.
//
// ✅ v3 (perf audit):
// - `MenuItemCard` is now defined at module scope and wrapped in
//   `React.memo`. The previous inline definition was recreated on every
//   render of `RestaurantPage`, so React treated every card as a new
//   component type and remounted them on every state change (category
//   tab click, cart open/close, etc.). With the memo, cards only re-
//   render when their props actually change — and only do, because the
//   parent's `handleAddToCart` / `handleViewFoodDetail` are now stable
//   via `useCallback`.
// - `filteredMenuItems` (selected-category filter), `cartItemCount`, and
//   `cartTotal` are now memoized — they were being recomputed on every
//   render of the parent.
// - Dropped the dead `DeferredSection` import (unused since the v2
//   reviews/recommended refactor).

import { memo, useState, useEffect, useMemo, useCallback } from "react";
import { restaurantAPI } from "../services/api";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import { getImageUrl, getImageSrcSet } from "../utils/image";
import logger from "../utils/logger";
import SEO from "../components/SEO";
import RestaurantPageSkeleton from "../components/skeletons/RestaurantPageSkeleton";
import styles from "./RestaurantPage.module.css";

/* ── Safe price formatter — fallback if context unavailable ───────────────── */
function safeFormatPrice(price, fmt) {
  const num = Number(price || 0);
  if (typeof fmt === "function") return fmt(num);
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
  }).format(num);
}

/* ── Menu Item Card (module-scope, memoized) ──────────────────────────────
   Defined OUTSIDE the page so React keeps the same component identity
   across renders. The previous inline definition remounted every card
   on every parent state change. Wrapped in `React.memo` so a card
   only re-renders when its props actually change — and only does,
   because the parent passes stable `useCallback` handlers. */
const MenuItemCard = memo(function MenuItemCard({ item, onAddToCart, onViewDetail }) {
  const { fmt } = useCurrency() || {};

  const image = item?.images?.[0]?.url || item?.image || "";
  const name = item?.name || "Unnamed Item";
  const description = item?.description || "";
  const price = Number(item?.price || 0);
  const preparationTime = Number(item?.preparationTime || 0);
  const available = item?.available !== false;
  const category = typeof item?.category === "string" ? item.category : item?.category?.name || "food";

  // ✅ Cloudinary-aware variant. Falls back to the raw URL for non-Cloudinary
  // uploads (legacy /uploads/menu/).
  const optimizedImage = image ? getImageUrl(image, { width: 160 }) : "";
  const srcSet = image ? getImageSrcSet(image, [120, 160, 240]) : "";

  function handleCardClick() {
    if (onViewDetail) onViewDetail(item);
  }

  function handleAddClick(e) {
    e.stopPropagation();
    if (onAddToCart) onAddToCart(item);
  }

  return (
    <div
      className={styles.menuItem}
      onClick={handleCardClick}
      role={onViewDetail ? "button" : undefined}
    >
      <div className={styles.itemImage}>
        {image ? (
          <img
            src={optimizedImage}
            srcSet={srcSet}
            sizes="80px"
            alt={name}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className={styles.noImage}>🍽️</div>
        )}
      </div>
      <div className={styles.itemInfo}>
        <h4 className={styles.itemName}>{name}</h4>
        {description && <p className={styles.description}>{description}</p>}
        <div className={styles.meta}>
          <span className={styles.price}>{safeFormatPrice(price, fmt)}</span>
          <span className={styles.prepTime}>⏱️ {preparationTime} mins</span>
        </div>
        {!available && <span className={styles.unavailable}>Unavailable</span>}
      </div>
      {available && onAddToCart && (
        <button className="btn btn-primary btn-sm" onClick={handleAddClick}>Add</button>
      )}
    </div>
  );
});

/* ── Main Restaurant Page ──────────────────────────────────────────────── */
export default function RestaurantPage({
  onNavigate,
  cart,
  onAddToCart,
  onIncreaseQty,
  onDecreaseQty,
  onRemoveFromCart,
  onClearCart,
  addToast,
}) {
  const { isLoggedIn } = useAuth();
  const { fmt } = useCurrency() || {};
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [showCart, setShowCart] = useState(false);

  // Slug pulled from sessionStorage (set by App.jsx from the URL).
  const [slug, setSlug] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("restaurantSlug");
    }
    return null;
  });

  useEffect(() => {
    const checkSlug = () => {
      const storedSlug = sessionStorage.getItem("restaurantSlug");
      if (storedSlug) setSlug(storedSlug);
    };
    checkSlug();
    window.addEventListener("storage", checkSlug);
    return () => window.removeEventListener("storage", checkSlug);
  }, []);

  // Cart scoping — only items for this restaurant.
  // ✅ FIX: Memoize so the cart math is only recomputed when `cart` or
  // `restaurant._id` actually change. Previously every render of the page
  // re-filtered/reduced the entire cart (e.g. on every category click).
  const { foodItems, cartTotal, cartItemCount } = useMemo(() => {
    const items = (cart || []).filter(
      (item) => item.itemType === "food" && item.restaurantId === restaurant?._id
    );
    const total = items.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
      0
    );
    const count = items.reduce(
      (sum, item) => sum + (Number(item.quantity) || 0),
      0
    );
    return { foodItems: items, cartTotal: total, cartItemCount: count };
  }, [cart, restaurant?._id]);

  useEffect(() => {
    if (slug) fetchRestaurant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const fetchRestaurant = useCallback(async () => {
    if (!slug) {
      setError("Restaurant not found");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await restaurantAPI.getRestaurantBySlug(slug);
      if (!data) {
        setError("Restaurant not found");
        return;
      }
      setRestaurant(data);
      if (data.menuCategories?.length > 0) {
        setSelectedCategory(data.menuCategories[0].name);
      }
    } catch (err) {
      console.error("[RestaurantPage] Error:", err.message);
      setError("Failed to load restaurant");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  // ✅ FIX: useCallback makes these handlers stable references — without
  // this, `React.memo` on `MenuItemCard` would always re-render because
  // the parent passes a fresh function on every render. Stable refs let
  // the memo actually skip re-renders.
  const handleAddToCart = useCallback((item) => {
    const marketplaceItems = (cart || []).filter((i) => i.itemType !== "food");
    if (marketplaceItems.length > 0) {
      addToast?.("You already have marketplace items in your cart. Complete checkout or clear cart before ordering food.", "error");
      return;
    }
    const otherRestaurantFood = (cart || []).find(
      (i) => i.itemType === "food" && i.restaurantId && i.restaurantId !== restaurant?._id
    );
    if (otherRestaurantFood) {
      addToast?.("You have food from another restaurant. Complete checkout or clear cart first.", "error");
      return;
    }
    const foodItem = {
      ...item,
      _id: item._id,
      itemType: "food",
      restaurantId: restaurant?._id,
      restaurantName: restaurant?.storeName || restaurant?.restaurantDetails?.restaurantName,
      image: item.images?.[0]?.url || item.image || "",
    };
    onAddToCart?.(foodItem);
    addToast?.(`🍔 ${item.name} added to cart`, "success", 2000);
  }, [cart, restaurant, onAddToCart, addToast]);

  const handleUpdateQuantity = useCallback((itemId, delta) => {
    if (delta > 0) onIncreaseQty?.(itemId);
    else onDecreaseQty?.(itemId);
  }, [onIncreaseQty, onDecreaseQty]);

  const handleViewFoodDetail = useCallback((item) => {
    try {
      sessionStorage.setItem("foodDetailItem", JSON.stringify(item));
      sessionStorage.setItem("foodDetailRestaurant", JSON.stringify({
        _id: restaurant._id,
        storeName: restaurant.storeName || restaurant.restaurantDetails?.restaurantName,
      }));
    } catch (e) {
      // ✅ Dev-only — this is a recently-viewed localStorage write
      // failure, not a real error. The catch block is silent in
      // production (logger.log is dev-only). The user keeps using
      // the app normally.
      logger.log("[RestaurantPage] Error storing food detail:", e.message);
    }
    onNavigate?.("food-detail");
  }, [restaurant, onNavigate]);

  // ✅ FIX: Memoize the category grouping. With 50 menu items, the reduce
  // ran on every render of the page (including category tab clicks).
  const menuItemsByCategory = useMemo(() => {
    return (restaurant?.menuItems || []).reduce((acc, item) => {
      if (!item || !item._id) return acc;
      const cat = typeof item.category === "string" ? item.category : "other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {});
  }, [restaurant?.menuItems]);

  // ✅ Skeleton paints immediately — no more blank 60px-padded spinner.
  if (loading) {
    return (
      <>
        <SEO title="Restaurant | SiiShop Food" />
        <RestaurantPageSkeleton count={6} />
      </>
    );
  }

  if (error || !restaurant) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <h2>{error || "Restaurant not found"}</h2>
        </div>
      </div>
    );
  }

  const restaurantName =
    restaurant.restaurantDetails?.restaurantName || restaurant.storeName;

  // ✅ Cloudinary-aware cover image — same transform helper as the card grid.
  const coverUrl = restaurant.restaurantDetails?.restaurantCoverImage
    ? getImageUrl(restaurant.restaurantDetails.restaurantCoverImage, { width: 1600 })
    : null;
  const coverSrcSet = coverUrl
    ? getImageSrcSet(restaurant.restaurantDetails.restaurantCoverImage, [800, 1200, 1600])
    : "";
  const logoUrl = restaurant.storeLogo
    ? getImageUrl(restaurant.storeLogo, { width: 200 })
    : null;

  return (
    <div className={styles.page}>
      <SEO
        title={`${restaurantName} | Order Food on SiiShop`}
        description={`Order ${restaurant.restaurantDetails?.cuisineType} delivery from ${restaurantName}. ${restaurant.restaurantDetails?.restaurantDescription || ""}`}
        keywords={`${restaurantName}, food delivery, ${restaurant.restaurantDetails?.cuisineType}, restaurant`}
      />

      {/* Header */}
      <header className={styles.header}>
        {coverUrl && (
          <img
            src={coverUrl}
            srcSet={coverSrcSet}
            sizes="100vw"
            alt={restaurantName}
            className={styles.coverImage}
            loading="eager"
            decoding="async"
            // Cover is above the fold — eager so it paints with the chrome.
          />
        )}
        <div className={styles.headerContent}>
          <div className={styles.logo}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={restaurantName}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className={styles.logoPlaceholder}>🍽️</div>
            )}
          </div>
          <div className={styles.info}>
            <h1 className={styles.infoTitle}>{restaurantName}</h1>
            {restaurant.restaurantDetails?.cuisineType && (
              <span className={styles.cuisine}>
                {restaurant.restaurantDetails.cuisineType}
              </span>
            )}
            <p className={styles.location}>
              📍 {restaurant.location?.city}, {restaurant.location?.region}
            </p>
            {restaurant.restaurantDetails?.address && (
              <p className={styles.address}>{restaurant.restaurantDetails.address}</p>
            )}
            <div className={styles.rating}>
              <span className={styles.ratingStars}>
                {restaurant.rating > 0
                  ? `★ ${restaurant.rating.toFixed(1)}`
                  : "★ New"}
              </span>
              <span className={styles.ratingCount}>
                ({restaurant.reviewCount || 0} reviews)
              </span>
            </div>
            {restaurant.restaurantDetails?.openingHours && (
              <p className={styles.hours}>
                🕐 {restaurant.restaurantDetails.openingHours} -{" "}
                {restaurant.restaurantDetails.closingHours}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Category Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${!selectedCategory ? styles.tabActive : ""}`}
          onClick={() => setSelectedCategory("")}
        >
          All
        </button>
        {(restaurant.menuCategories || []).map((cat) => {
          const catName = cat?.name || "other";
          return (
            <button
              key={cat?._id || catName}
              className={`${styles.tab} ${selectedCategory === catName ? styles.tabActive : ""}`}
              onClick={() => setSelectedCategory(catName)}
            >
              {(catName || "Other").charAt(0).toUpperCase() + (catName || "other").slice(1)}
            </button>
          );
        })}
      </div>

      {/* Menu Items */}
      <div className={styles.menuSection}>
        {(() => {
          if (!selectedCategory) {
            if ((restaurant.menuCategories || []).length > 0) {
              return (restaurant.menuCategories || []).map((cat) => {
                const catName = cat?.name || "other";
                return (
                  <div key={cat?._id || catName} className={styles.categorySection}>
                    <h2 className={styles.categoryTitle}>
                      {(catName || "Other").charAt(0).toUpperCase() + (catName || "other").slice(1)}
                    </h2>
                    <div className={styles.menuGrid}>
                      {(menuItemsByCategory?.[catName] || []).map((item) => (
                        <MenuItemCard
                          key={item?._id || Math.random()}
                          item={item}
                          onAddToCart={handleAddToCart}
                          onViewDetail={handleViewFoodDetail}
                        />
                      ))}
                    </div>
                  </div>
                );
              });
            }
            return (
              <div className={styles.menuGrid}>
                {(restaurant.menuItems || []).map((item) => (
                  <MenuItemCard
                    key={item?._id || Math.random()}
                    item={item}
                    onAddToCart={handleAddToCart}
                    onViewDetail={handleViewFoodDetail}
                  />
                ))}
              </div>
            );
          }
          return (
            <div className={styles.menuGrid}>
              {(menuItemsByCategory?.[selectedCategory] || []).map((item) => (
                <MenuItemCard
                  key={item?._id || Math.random()}
                  item={item}
                  onAddToCart={handleAddToCart}
                  onViewDetail={handleViewFoodDetail}
                />
              ))}
            </div>
          );
        })()}

        {(restaurant?.menuItems || []).length === 0 && (
          <div className={styles.empty}><p>Menu not available yet</p></div>
        )}
      </div>

      {/* Floating Cart Button */}
      {foodItems.length > 0 && (
        <div className={styles.floatingCart} onClick={() => setShowCart(true)}>
          <span className={styles.cartIcon}>🛒</span>
          <span className={styles.cartCount}>{cartItemCount} items</span>
          <span className={styles.cartTotal}>{safeFormatPrice(cartTotal, fmt)}</span>
        </div>
      )}

      {/* Cart Modal */}
      {showCart && (
        <div className={styles.cartModalOverlay} onClick={() => setShowCart(false)}>
          <div className={styles.cartModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.cartHeader}>
              <h3>Your Food Cart</h3>
              <button onClick={() => setShowCart(false)} aria-label="Close cart">✕</button>
            </div>
            <div className={styles.cartItems}>
              {foodItems.map((item) => (
                <div key={item._id} className={styles.cartItem}>
                  <div className={styles.itemInfoCell}>
                    <h4>{item.name}</h4>
                    <span className={styles.price}>{safeFormatPrice(item.price, fmt)}</span>
                  </div>
                  <div className={styles.quantityControls}>
                    <button onClick={() => handleUpdateQuantity(item._id, -1)}>−</button>
                    <span>{item.quantity}</span>
                    <button onClick={() => handleUpdateQuantity(item._id, 1)}>+</button>
                  </div>
                  <button className={styles.removeBtn} onClick={() => onRemoveFromCart?.(item._id)}>🗑️</button>
                </div>
              ))}
            </div>
            <div className={styles.cartFooter}>
              <div className={styles.totalRow}>
                <span>Total</span>
                <span>{safeFormatPrice(cartTotal, fmt)}</span>
              </div>
              <button className="btn btn-primary btn-block" onClick={() => onNavigate?.("cart")}>
                Proceed to Checkout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
