// pages/restaurant/RestaurantReviewsPage.jsx - Restaurant reviews management
import { useState, useEffect, useMemo } from "react";
import { restaurantReviewAPI } from "../../services/api";
import { useToast } from "../../components/Toast";

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
      console.log("[RestaurantReviewsPage] API response:", response);

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
        // Unexpected format - use empty array
        console.warn("[RestaurantReviewsPage] Unexpected response format:", response);
        reviewsArray = [];
      }

      console.log("[RestaurantReviewsPage] Normalized reviews:", reviewsArray.length);
      setReviews(reviewsArray);
    } catch (err) {
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
        <span key={i} className={i <= roundedRating ? "star filled" : "star"}>
          ★
        </span>
      );
    }
    return stars;
  };

  if (loading) {
    return (
      <div className="reviews-page">
        <div className="page-header">
          <button onClick={onBack} className="back-btn">← Back to Dashboard</button>
          <h2>⭐ Reviews</h2>
        </div>
        <div className="loading-center">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="reviews-page">
      <div className="page-header">
        <button onClick={onBack} className="back-btn">← Back to Dashboard</button>
        <h2>⭐ Reviews</h2>
        <span className="review-count">{safeReviews.length} reviews</span>
      </div>

      {/* Rating Summary */}
      {safeReviews.length > 0 && (
        <div className="rating-summary">
          <div className="rating-overview">
            <div className="avg-rating">
              <span className="big-rating">{stats.avgRating.toFixed(1)}</span>
              <div className="stars">{renderStars(stats.avgRating)}</div>
              <span className="total-reviews">{stats.total} reviews</span>
            </div>
          </div>

          <div className="rating-distribution">
            {[5, 4, 3, 2, 1].map(star => (
              <div key={star} className="distribution-row">
                <span className="star-label">{star} ★</span>
                <div className="distribution-bar">
                  <div
                    className="distribution-fill"
                    style={{ width: `${(stats.distribution[star] / stats.total) * 100}%` }}
                  />
                </div>
                <span className="distribution-count">{stats.distribution[star]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="filter-bar">
        <select value={filterRating} onChange={(e) => setFilterRating(e.target.value)}>
          <option value="all">All Ratings</option>
          <option value="5">5 Stars</option>
          <option value="4">4 Stars</option>
          <option value="3">3 Stars</option>
          <option value="2">2 Stars</option>
          <option value="1">1 Star</option>
        </select>
        <span className="item-count">{filteredReviews.length} reviews</span>
      </div>

      {safeReviews.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">⭐</div>
          <h3>No reviews yet</h3>
          <p>Customer reviews will appear here</p>
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="empty-state">
          <h3>No {filterRating}-star reviews</h3>
        </div>
      ) : (
        <div className="reviews-list">
          {filteredReviews.map(review => (
            <div key={review._id} className="review-card">
              <div className="review-header">
                <div className="reviewer-info">
                  <strong>{review.userId?.name || "Anonymous"}</strong>
                  <span className="review-date">{formatDate(review.createdAt)}</span>
                </div>
                <div className="review-rating">
                  {renderStars(review.rating)}
                </div>
              </div>
              {review.review && (
                <p className="review-text">{review.review}</p>
              )}
              {review.orderId && (
                <span className="order-ref">Order: #{review.orderId.slice(-8)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}