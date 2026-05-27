// pages/DeliveryTrackingPage.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import { deliveryAPI } from "../services/api";
import { socketService } from "../services/socket";
import { StatusBadge } from "../components/OrderStatusBadge";
import styles from "./DeliveryTrackingPage.module.css";

const ORDER_STEPS = [
  { key: "pending", label: "Order Placed", icon: "📝" },
  { key: "confirmed", label: "Confirmed", icon: "✅" },
  { key: "preparing", label: "Preparing", icon: "👨‍🍳" },
  { key: "out_for_delivery", label: "Out for Delivery", icon: "🏃" },
  { key: "delivered", label: "Delivered", icon: "🎉" },
];

export default function DeliveryTrackingPage({ onNavigate }) {

  // Get orderId from sessionStorage (set when navigating to tracking page)
  const [orderId, setOrderId] = useState(() => {
    return sessionStorage.getItem("trackingOrderId");
  });

  const { fmt } = useCurrency();
  const { user, isLoggedIn } = useAuth();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [riderLocation, setRiderLocation] = useState(null);
  const [eta, setEta] = useState(null);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const riderMarkerRef = useRef(null);
  const customerMarkerRef = useRef(null);
  const directionRendererRef = useRef(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      socketService.leaveOrderTracking(orderId);
      socketService.removeAllListeners();
    };
  }, [orderId]);

  // Fetch order data
  useEffect(() => {
    const fetchOrder = async () => {
      if (!mountedRef.current) return;
      setLoading(true);
      try {
        const data = await deliveryAPI.trackOrder(orderId);
        if (mountedRef.current) {
          setOrder(data);
          if (data.riderLocation) {
            setRiderLocation(data.riderLocation);
          }
          if (data.eta) {
            setEta(data.eta);
          }
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err.message || "Failed to load order");
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    fetchOrder();
  }, [orderId]);

  // Connect to socket and join tracking room
  useEffect(() => {
    const setupSocket = async () => {
      if (!order || !isLoggedIn) return;

      try {
        const token = localStorage.getItem("token");
        if (token) {
          await socketService.connect(token);
          socketService.joinOrderTracking(orderId, "customer", user?._id);

          // Listen for location updates
          socketService.on("rider-location-update", (data) => {
            if (data.orderId === orderId && mountedRef.current) {
              setRiderLocation({
                lat: data.latitude,
                lng: data.longitude,
                timestamp: data.timestamp,
              });
            }
          });

          // Listen for ETA updates
          socketService.on("eta-update", (data) => {
            if (data.orderId === orderId && mountedRef.current) {
              setEta({
                eta: data.eta,
                distance: data.distance,
                duration: data.duration,
              });
            }
          });

          // Listen for status updates
          socketService.on("order-status-update", (data) => {
            if (data.orderId === orderId && mountedRef.current) {
              setOrder((prev) => ({ ...prev, status: data.status }));
            }
          });

          // Listen for delivery completion
          socketService.on("delivery-completed", (data) => {
            if (data.orderId === orderId && mountedRef.current) {
              setOrder((prev) => ({
                ...prev,
                status: "delivered",
                deliveredAt: data.deliveredAt,
              }));
            }
          });
        }
      } catch (err) {
        console.error("[DeliveryTracking] Socket error:", err);
      }
    };

    setupSocket();

    return () => {
      socketService.removeAllListeners();
    };
  }, [order, orderId, isLoggedIn, user]);

  // Initialize map
  useEffect(() => {
    if (!order || typeof window === "undefined") return;

    const initMap = async () => {
      // Check for Google Maps
      if (!window.google?.maps) {
        console.log("[DeliveryTracking] Google Maps not loaded");
        return;
      }

      const mapEl = mapRef.current;
      if (!mapEl) return;

      // Default center (Accra, Ghana)
      const defaultCenter = { lat: 5.6037, lng: -0.187 };

      const map = new window.google.maps.Map(mapEl, {
        center: defaultCenter,
        zoom: 14,
        disableDefaultUI: true,
        zoomControl: true,
        fullscreenControl: true,
      });

      mapInstanceRef.current = map;

      // Customer marker (destination)
      if (order.deliveryAddressCoords?.lat) {
        customerMarkerRef.current = new window.google.maps.Marker({
          position: {
            lat: order.deliveryAddressCoords.lat,
            lng: order.deliveryAddressCoords.lng,
          },
          map,
          title: "Delivery Location",
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#22c55e",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
        map.setCenter(customerMarkerRef.current.getPosition());
      }

      // Rider marker
      if (riderLocation?.lat) {
        riderMarkerRef.current = new window.google.maps.Marker({
          position: { lat: riderLocation.lat, lng: riderLocation.lng },
          map,
          title: "Rider",
          icon: {
            path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z",
            fillColor: "#f97316",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            scale: 1.5,
            anchor: new window.google.maps.Point(12, 24),
          },
        });

        // Draw route
        if (customerMarkerRef.current) {
          const directionsService = new window.google.maps.DirectionsService();
          const directionsRenderer = new window.google.maps.DirectionsRenderer({
            map,
            suppressMarkers: true,
            polylineOptions: {
              strokeColor: "#f97316",
              strokeWeight: 4,
            },
          });

          directionsService.route(
            {
              origin: { lat: riderLocation.lat, lng: riderLocation.lng },
              destination: customerMarkerRef.current.getPosition(),
              travelMode: window.google.maps.TravelMode.DRIVING,
            },
            (result, status) => {
              if (status === "OK") {
                directionsRenderer.setDirections(result);
                directionRendererRef.current = directionsRenderer;
              }
            }
          );
        }
      }
    };

    initMap();
  }, [order]);

  // Update rider marker when location changes
  useEffect(() => {
    if (!riderLocation?.lat || !riderMarkerRef.current) return;

    riderMarkerRef.current.setPosition({
      lat: riderLocation.lat,
      lng: riderLocation.lng,
    });

    // Also update route if renderer exists
    if (directionRendererRef.current && customerMarkerRef.current) {
      const directionsService = new window.google.maps.DirectionsService();
      directionsService.route(
        {
          origin: { lat: riderLocation.lat, lng: riderLocation.lng },
          destination: customerMarkerRef.current.getPosition(),
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === "OK") {
            directionRendererRef.current.setDirections(result);
          }
        }
      );
    }
  }, [riderLocation]);

  const getStepIndex = (status) => {
    return ORDER_STEPS.findIndex((s) => s.key === status);
  };

  const formatTime = (date) => {
    if (!date) return "";
    return new Date(date).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleGoBack = () => {
    // Clear tracking orderId from sessionStorage
    sessionStorage.removeItem("trackingOrderId");
    // Navigate to orders page
    onNavigate?.("orders");
  };

  if (loading) {
    return (
      <div className="container">
        <div className="loading-center">
          <div className="spinner" />
          <p>Loading order details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="empty-state">
          <div className="empty-icon">⚠️</div>
          <h3>{error}</h3>
          <button className="btn btn-primary" onClick={handleGoBack}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container">
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <h3>Order not found</h3>
          <button className="btn btn-primary" onClick={handleGoBack}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const currentStep = getStepIndex(order.status);
  const isOutForDelivery = order.status === "out_for_delivery";

  return (
    <div className={`container page-enter ${styles.page}`}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={handleGoBack}>
          ← Back
        </button>
        <h1 className={styles.title}>Track Delivery</h1>
        <p className={styles.orderId}>Order #{orderId.slice(-6).toUpperCase()}</p>
      </div>

      {/* Map Section */}
      {isOutForDelivery && (
        <div className={styles.mapContainer}>
          <div ref={mapRef} className={styles.map} />
          <div className={styles.mapOverlay}>
            {eta && (
              <div className={styles.etaBadge}>
                <span className={styles.etaIcon}>🚴</span>
                <div>
                  <span className={styles.etaTime}>
                    {eta.duration ? `${eta.duration} min away` : "Arriving..."}
                  </span>
                  {eta.distance && (
                    <span className={styles.etaDistance}>
                      {eta.distance} km
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Progress Timeline */}
      <div className={styles.timeline}>
        {ORDER_STEPS.map((step, index) => {
          const isCompleted = index <= currentStep;
          const isCurrent = index === currentStep;

          return (
            <div
              key={step.key}
              className={`${styles.step} ${isCompleted ? styles.completed : ""} ${isCurrent ? styles.current : ""}`}
            >
              <div className={styles.stepIcon}>{step.icon}</div>
              <div className={styles.stepLabel}>{step.label}</div>
              {index < ORDER_STEPS.length - 1 && (
                <div className={`${styles.stepLine} ${isCompleted ? styles.completed : ""}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Order Details */}
      <div className={styles.orderCard}>
        <div className={styles.cardHeader}>
          <h3>Order Details</h3>
          <StatusBadge status={order.status} />
        </div>

        <div className={styles.orderInfo}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Store</span>
            <span className={styles.infoValue}>{order.vendorName || "Unknown"}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Total</span>
            <span className={styles.infoValue}>{fmt(order.totalAmount)}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Payment</span>
            <span className={styles.infoValue}>
              {order.paymentMethod === "cash" ? "💵 COD" : "💳 Card"}
            </span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Delivery Address</span>
            <span className={styles.infoValue}>{order.deliveryAddress}</span>
          </div>
        </div>

        {/* Rider Info */}
        {(order.riderName || order.riderPhone) && (
          <div className={styles.riderInfo}>
            <h4>Your Rider</h4>
            <div className={styles.riderDetails}>
              <div className={styles.riderAvatar}>🏃</div>
              <div className={styles.riderText}>
                <span className={styles.riderName}>{order.riderName}</span>
                {order.riderPhone && (
                  <a href={`tel:${order.riderPhone}`} className={styles.riderPhone}>
                    📞 {order.riderPhone}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delivery Complete Message */}
      {order.status === "delivered" && (
        <div className={styles.deliveredMessage}>
          <div className={styles.deliveredIcon}>🎉</div>
          <h3>Order Delivered!</h3>
          <p>Thank you for shopping with SiiShop</p>
        </div>
      )}
    </div>
  );
}