// components/maps/OpenStreetMapView.jsx - OpenStreetMap fallback using Leaflet
import { useEffect, useRef, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Custom rider icon
const riderIcon = L.divIcon({
  className: "custom-rider-marker",
  html: `<div style="
    background: #f97316;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  ">🏃</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// Custom customer icon
const customerIcon = L.divIcon({
  className: "custom-customer-marker",
  html: `<div style="
    background: #22c55e;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  "></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Custom vendor icon
const vendorIcon = L.divIcon({
  className: "custom-vendor-marker",
  html: `<div style="
    background: #8b5cf6;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
  ">🏪</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Component to center map on rider location
function MapCenterUpdater({ center }) {
  const map = useMap();

  useEffect(() => {
    if (center?.lat && center?.lng) {
      map.setView([center.lat, center.lng], map.getZoom(), { animate: true });
    }
  }, [center, map]);

  return null;
}

// Component to track rider position smoothly
function RiderTracker({ riderLocation }) {
  const map = useMap();
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    if (!riderLocation?.lat || !riderLocation?.lng) return;

    // Throttle updates to prevent excessive re-renders
    const now = Date.now();
    if (now - lastUpdateRef.current < 1000) return;
    lastUpdateRef.current = now;

    map.setView([riderLocation.lat, riderLocation.lng], map.getZoom(), {
      animate: true,
      duration: 0.5,
    });
  }, [riderLocation, map]);

  return null;
}

export default function OpenStreetMapView({
  riderLocation,
  customerLocation,
  vendorLocation,
  onMapReady,
  height = "250px",
}) {
  const mapRef = useRef(null);

  // Default center (Accra, Ghana)
  const defaultCenter = useMemo(() => {
    return { lat: 5.6037, lng: -0.187 };
  }, []);

  // Determine map center based on available locations
  const center = useMemo(() => {
    if (riderLocation?.lat && riderLocation?.lng) {
      return riderLocation;
    }
    if (customerLocation?.lat && customerLocation?.lng) {
      return customerLocation;
    }
    if (vendorLocation?.lat && vendorLocation?.lng) {
      return vendorLocation;
    }
    return defaultCenter;
  }, [riderLocation, customerLocation, vendorLocation, defaultCenter]);

  // Create route polyline if we have both rider and customer locations
  const routePositions = useMemo(() => {
    if (riderLocation?.lat && riderLocation?.lng && customerLocation?.lat && customerLocation?.lng) {
      return [
        [riderLocation.lat, riderLocation.lng],
        [customerLocation.lat, customerLocation.lng],
      ];
    }
    return null;
  }, [riderLocation, customerLocation]);

  const handleMapReady = (map) => {
    mapRef.current = map;
    onMapReady?.(map);
  };

  return (
    <div style={{ height, width: "100%", borderRadius: "12px", overflow: "hidden" }}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
        zoomControl={true}
        scrollWheelZoom={true}
        dragging={true}
        tap={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Map center updater */}
        <MapCenterUpdater center={center} />

        {/* Rider tracker */}
        <RiderTracker riderLocation={riderLocation} />

        {/* Vendor marker */}
        {vendorLocation?.lat && vendorLocation?.lng && (
          <Marker position={[vendorLocation.lat, vendorLocation.lng]} icon={vendorIcon}>
            <Popup>Store Location</Popup>
          </Marker>
        )}

        {/* Customer marker */}
        {customerLocation?.lat && customerLocation?.lng && (
          <Marker position={[customerLocation.lat, customerLocation.lng]} icon={customerIcon}>
            <Popup>Delivery Location</Popup>
          </Marker>
        )}

        {/* Rider marker */}
        {riderLocation?.lat && riderLocation?.lng && (
          <Marker position={[riderLocation.lat, riderLocation.lng]} icon={riderIcon}>
            <Popup>Rider Location</Popup>
          </Marker>
        )}

        {/* Route line */}
        {routePositions && (
          <Polyline
            positions={routePositions}
            pathOptions={{
              color: "#f97316",
              weight: 4,
              opacity: 0.8,
              dashArray: "10, 10",
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}