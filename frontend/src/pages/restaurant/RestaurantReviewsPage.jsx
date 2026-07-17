// pages/restaurant/RestaurantReviewsPage.jsx - Restaurant reviews management
//
// v2: Switched to a CSS module (RestaurantReviewsPage.module.css).
// v1 used raw class names (`.reviews-page`, `.review-card`, `.star`,
// etc.) that had NO matching rules in the global stylesheet — the
// page rendered as unstyled block text on every breakpoint. v2 uses
// a real CSS module so the styles are scoped to this page.
import { useState, useEffect, useMemo } from "react";
import { restaurantReviewAPI } from "../../services/api";
import { useToast } from "../../components/Toast";
import logger from "../../utils/logger";
import styles from "./RestaurantReviewsPage.module.css";

export default function RestaurantReviewsPage({ onBack, vendorId, addToast }) {
  const { addToast: showToast } = useToast();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterRating, setFilterRating] = useState("all");

  useEffect(() => {
    fetchReviews();
  }, []);

  async function fetchReviews() {
    setLoading(true);
    try {
      const response = await restaurantReviewAPI.getReviews(vendorId);
      logger.log("[RestaurantReviewsPage] API response:", response);

      // DEFENSIVE: Normalize response to always be an array
      let reviewsArray = [];

      if (Array.isArray(response)) {
        // Direct array response
        reviewsArray = response;
      } else if (response?.reviews && Array.isArray(response.reviews)) {
        // Object with reviews property { reviews: [...] }
        reviewsArray = response.reviews;
      } else if (response?.data && Array.isArray(response.data)) {
        // Object with data property { data: [...] }
        reviewsArray = response.data;
      } else if (response?.success && Array.isArray(response.data)) {
        // Object with success flag { success: true, data: [...] }
        reviewsArray = response.data;
      } else {
        // Unexpected format - use empty array.
        // console.warn is preserved in production per spec.
        console.warn("[RestaurantReviewsPage] Unexpected response format:", response);
        reviewsArray = [];
      }

      logger.log("[RestaurantReviewsPage] Normalized reviews:", reviewsArray.length);
      setReviews(reviewsArray);
    } catch (err) {
      // console.error is preserved in production per spec.
      console.error("[RestaurantReviewsPage] Fetch error:", err.message);
      showToast?.("Failed to load reviews", "error");
      setReviews([]); // Ensure we always have an array on error
    } finally {
      setLoading(false);
    }
  }

  // Safe reviews array - defensive accessor
  const safeReviews = Array.isArray(reviews) ? reviews : [];

  // Calculate rating stats
  const stats = useMemo(() => {
    const total = safeReviews.length;
    const avgRating = total > 0
      ? safeReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / total
      : 0;

    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    safeReviews.forEach(r => {
      const rating = Math.round(r.rating || 0);
      if (distribution[rating] !== undefined) {
        distribution[rating]++;
      }
    });

    return { total, avgRating, distribution };
  }, [safeReviews]);

  const filteredReviews = filterRating === "all"
    ? safeReviews
    : safeReviews.filter(r => Math.round(r.rating) === parseInt(filterRating));

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const renderStars = (rating) => {
    const stars = [];
    const roundedRating = Math.round(rating);
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <span key={i} className={i <= roundedRating ? `${styles.star} ${styles.filled}` : styles.star}>
          ★
        </span>
      );
    }
    return stars;
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <button onClick={onBack} className={styles.backBtn}>← Back to Dashboard</button>
          <h2>⭐ Reviews</h2>
        </div>
        <div className={styles.loadingCenter}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <button onClick={onBack} className={styles.backBtn}>← Back to Dashboard</button>
        <h2>⭐ Reviews</h2>
        <span className={styles.reviewCount}>{safeReviews.length} reviews</span>
      </div>

      {/* Rating Summary */}
      {safeReviews.length > 0 && (
        <div className={styles.ratingSummary}>
          <div className={styles.ratingOverview}>
            <div className={styles.avgRating}>
              <span className={styles.bigRating}>{stats.avgRating.toFixed(1)}</span>
              <div className={styles.stars}>{renderStars(stats.avgRating)}</div>
              <span className={styles.totalReviews}>{stats.total} reviews</span>
            </div>
          </div>

          <div className={styles.ratingDistribution}>
            {[5, 4, 3, 2, 1].map(star => (
              <div key={star} className={styles.distributionRow}>
                <span className={styles.starLabel}>{star} ★</span>
                <div className={styles.distributionBar}>
                  <div
                    className={styles.distributionFill}
                    style={{ width: `${(stats.distribution[star] / stats.total) * 100}%` }}
                  />
                </div>
                <span className={styles.distributionCount}>{stats.distribution[star]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className={styles.filterBar}>
        <select value={filterRating} onChange={(e) => setFilterRating(e.target.value)}>
          <option value="all">All Ratings</option>
          <option value="5">5 Stars</option>
          <option value="4">4 Stars</option>
          <option value="3">3 Stars</option>
          <option value="2">2 Stars</option>
          <option value="1">1 Star</option>
        </select>
        <span className={styles.itemCount}>{filteredReviews.length} reviews</span>
      </div>

      {safeReviews.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>⭐</div>
          <h3 className={styles.emptyTitle}>No reviews yet</h3>
          <p className={styles.emptyText}>Customer reviews will appear here</p>
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className={styles.emptyState}>
          <h3 className={styles.emptyTitle}>No {filterRating}-star reviews</h3>
        </div>
      ) : (
        <div className={styles.reviewsList}>
          {filteredReviews.map(review => (
            <div key={review._id} className={styles.reviewCard}>
              <div className={styles.reviewHeader}>
                <div className={styles.reviewerInfo}>
                  <strong>{review.userId?.name || "Anonymous"}</strong>
                  <span className={styles.reviewDate}>{formatDate(review.createdAt)}</span>
                </div>
                <div className={styles.reviewRating}>
                  {renderStars(review.rating)}
                </div>
              </div>
              {review.review && (
                <p className={styles.reviewText}>{review.review}</p>
              )}
              {review.orderId && (
                <span className={styles.orderRef}>Order: #{review.orderId.slice(-8)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}