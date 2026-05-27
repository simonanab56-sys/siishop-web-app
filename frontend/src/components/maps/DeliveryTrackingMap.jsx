// components/maps/DeliveryTrackingMap.jsx - Unified delivery tracking map
import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { getActiveMapProvider, hasGoogleMaps } from "../../utils/mapProvider";
import styles from "./DeliveryTrackingMap.module.css";

// Lazy load Google Maps component (only loads if API key exists)
const GoogleMapView = lazy(() =>
  import("./GoogleMapView").catch(() => {
    console.warn("Failed to load GoogleMapView, falling back to OSM");
    return { default: () => OpenStreetMapView };
  })
);

// Import OSM directly
import OpenStreetMapView from "./OpenStreetMapView";

/**
 * Unified Delivery Tracking Map
 * Automatically selects between Google Maps and OpenStreetMap based on API key
 *
 * @param {Object} props
 * @param {Object} props.riderLocation - Rider location { lat, lng }
 * @param {Object} props.customerLocation - Customer location { lat, lng }
 * @param {Object} props.vendorLocation - Vendor location { lat, lng }
 * @param {Function} props.onMapReady - Callback when map is ready
 * @param {string} props.height - Map height (default: "250px")
 */
export default function DeliveryTrackingMap({
  riderLocation,
  customerLocation,
  vendorLocation,
  onMapReady,
  height = "250px",
}) {
  const [mapProvider, setMapProvider] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Determine which map provider to use
  useEffect(() => {
    const provider = getActiveMapProvider();
    setMapProvider(provider);
    setIsLoading(false);
  }, []);

  // Prepare locations for the map components
  const locations = useMemo(
    () => ({
      riderLocation,
      customerLocation,
      vendorLocation,
    }),
    [riderLocation, customerLocation, vendorLocation]
  );

  // Loading state while determining provider
  if (isLoading) {
    return (
      <div className={styles.container} style={{ height }}>
        <div className={styles.loading}>
          <div className="spinner" />
          <p>Loading map...</p>
        </div>
      </div>
    );
  }

  // Render appropriate map based on provider
  const renderMap = () => {
    if (mapProvider === "google" && hasGoogleMaps()) {
      return (
        <Suspense
          fallback={
            <div className={styles.loading}>
              <div className="spinner" />
              <p>Loading Google Maps...</p>
            </div>
          }
        >
          <GoogleMapView
            {...locations}
            onMapReady={onMapReady}
            height={height}
          />
        </Suspense>
      );
    }

    // Default to OpenStreetMap
    return (
      <OpenStreetMapView
        {...locations}
        onMapReady={onMapReady}
        height={height}
      />
    );
  };

  return (
    <div className={styles.container}>
      {renderMap()}
      <div className={styles.badge}>
        {mapProvider === "google" ? "🗺️ Powered by Google Maps" : "🗺️ Powered by OpenStreetMap"}
      </div>
    </div>
  );
}