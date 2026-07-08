// pages/FoodDetailPage.jsx - Food item detail page with gallery and video
import { useState, useEffect, useCallback, useRef } from "react";
import { useCurrency } from "../context/CurrencyContext";
import ProductGallery from "../components/ProductGallery";
import GalleryModal from "../components/GalleryModal";
import SEO from "../components/SEO";
import { getProductImages } from "../utils/image";
import styles from "./ProductDetailPage.module.css";

export default function FoodDetailPage({
  item,
  onBack,
  onAddToCart,
  onNavigate,
  addToast,
  restaurant
}) {
  const { fmt } = useCurrency() || {};
  const [foodItem, setFoodItem] = useState(item);
  const [quantity, setQuantity] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [modalInitialIndex, setModalInitialIndex] = useState(0);
  const mountedRef = useRef(true);

  // Sync item when prop changes
  useEffect(() => {
    if (item) {
      setFoodItem(item);
    }
  }, [item?._id]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Get images array
  const images = getProductImages(foodItem);
  const hasVideo = foodItem?.videoUrl && foodItem.videoUrl.length > 0;

  if (!foodItem) {
    return (
      <div className={styles.page} style={{ textAlign: "center", padding: 60 }}>
        <h2>Food item not found</h2>
        <button className="btn btn-primary" onClick={onBack}>
          Go Back
        </button>
      </div>
    );
  }

  // Safe access to fields
  const name = foodItem?.name || "Unnamed Item";
  const description = foodItem?.description || "";
  const price = Number(foodItem?.price || 0);
  const preparationTime = Number(foodItem?.preparationTime || 0);
  const available = foodItem?.available !== false;
  const category = foodItem?.category || "food";

  // Handle quantity change
  const decreaseQty = useCallback(() => {
    setQuantity(prev => Math.max(1, prev - 1));
  }, []);

  const increaseQty = useCallback(() => {
    setQuantity(prev => prev + 1);
  }, []);

  // Handle add to cart
  const handleAddToCart = useCallback(() => {
    if (!available) return;

    const itemWithQty = { ...foodItem, quantity };
    onAddToCart?.(itemWithQty);
    addToast?.(`${name} added to cart`, "success", 2000);
  }, [foodItem, quantity, available, onAddToCart, addToast, name]);

  // Open fullscreen modal
  const handleOpenFullscreen = useCallback((initialIndex) => {
    setModalInitialIndex(initialIndex);
    setShowModal(true);
  }, []);

  // Close modal
  const handleCloseModal = useCallback(() => {
    setShowModal(false);
  }, []);

  const totalPrice = price * quantity;

  return (
    <div className={styles.page}>
      <SEO
        title={`${name} | Order on SiiShop`}
        description={description}
        keywords={`${name}, food, restaurant, order online`}
      />

      {/* Back button */}
      <button onClick={onBack} className={styles.backBtn}>
        ← Back to Restaurant
      </button>

      {/* Layout - Gallery and Details side by side */}
      <div className={styles.content}>
        {/* Gallery Section */}
        <div className={styles.gallerySection}>
          <ProductGallery
            product={foodItem}
            onOpenFullscreen={handleOpenFullscreen}
          />
        </div>

        {/* Details Section */}
        <div className={styles.detailsSection}>
          {/* Restaurant info */}
          {restaurant && (
            <p className={styles.vendor}>📍 {restaurant.storeName}</p>
          )}

          {category && (
            <span className={styles.category}>{category}</span>
          )}

          <h1 className={styles.name}>{name}</h1>

          {/* Price and prep time */}
          <div className={styles.priceRow}>
            <span className={styles.price}>
              {fmt ? fmt(price) : `GH₵ ${price.toFixed(2)}`}
            </span>
            {preparationTime > 0 && (
              <span style={{ fontSize: "0.9rem", color: "#666" }}>
                ⏱️ {preparationTime} mins
              </span>
            )}
          </div>

          {/* Description */}
          {description && (
            <p className={styles.description}>{description}</p>
          )}

          {/* Availability */}
          {!available && (
            <div style={{
              padding: "12px",
              background: "#fee2e2",
              borderRadius: "8px",
              color: "#dc2626",
              fontWeight: "500"
            }}>
              Currently unavailable
            </div>
          )}

          {/* Quantity selector */}
          {available && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              padding: "16px 0",
              flexWrap: "wrap"
            }}>
              <span style={{ fontWeight: "500" }}>Quantity:</span>
              <div className={styles.quantityControl}>
                <button onClick={decreaseQty} className={styles.qtyBtn} disabled={quantity <= 1}>
                  −
                </button>
                <span className={styles.qtyValue}>{quantity}</span>
                <button onClick={increaseQty} className={styles.qtyBtn}>
                  +
                </button>
              </div>
            </div>
          )}

          {/* Add to cart button */}
          {available ? (
            <button
              className={`btn btn-primary ${styles.addToCartBtn}`}
              onClick={handleAddToCart}
            >
              Add to Cart - {fmt ? fmt(totalPrice) : `GH₵ ${totalPrice.toFixed(2)}`}
            </button>
          ) : (
            <button
              className={`btn btn-disabled ${styles.addToCartBtn}`}
              disabled
            >
              Not Available
            </button>
          )}

          {/* Additional info */}
          <div style={{ marginTop: "16px", fontSize: "0.9rem", color: "#666" }}>
            <p>🚚 Delivery within {preparationTime + 15} minutes</p>
            <p>📦 Freshly prepared when you order</p>
          </div>
        </div>
      </div>

      {/* Gallery Modal */}
      {showModal && images.length > 0 && (
        <GalleryModal
          images={images}
          initialIndex={modalInitialIndex}
          onClose={handleCloseModal}
          name={name}
        />
      )}
    </div>
  );
}