// components/maps/GoogleMapView.jsx - Google Maps component
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import { getGoogleMapsApiKey } from "../../utils/mapProvider";
import styles from "./GoogleMapView.module.css";

const GOOGLE_MAPS_OPTIONS = {
  zoom: 14,
  disableDefaultUI: false,
  zoomControl: true,
  fullscreenControl: true,
  streetViewControl: false,
  mapTypeControl: false,
};

const libraries = ["places", "directions"];

export default function GoogleMapView({
  riderLocation,
  customerLocation,
  vendorLocation,
  onMapReady,
  height = "250px",
}) {
  const mapRef = useRef(null);
  const riderMarkerRef = useRef(null);
  const customerMarkerRef = useRef(null);
  const vendorMarkerRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const mapInstanceRef = useRef(null);

  const apiKey = getGoogleMapsApiKey();

  // Load Google Maps API
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries,
  });

  // Initialize map when API is loaded
  useEffect(() => {
    if (!isLoaded || !window.google?.maps || !mapRef.current) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 5.6037, lng: -0.187 },
      ...GOOGLE_MAPS_OPTIONS,
    });

    mapInstanceRef.current = map;

    // Create directions renderer
    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: "#f97316",
        strokeWeight: 4,
      },
    });

    // Create customer marker (destination)
    if (customerLocation?.lat && customerLocation?.lng) {
      customerMarkerRef.current = new window.google.maps.Marker({
        position: { lat: customerLocation.lat, lng: customerLocation.lng },
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

    onMapReady?.(map);

    return () => {
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
      }
      if (customerMarkerRef.current) {
        customerMarkerRef.current.setMap(null);
      }
      if (vendorMarkerRef.current) {
        vendorMarkerRef.current.setMap(null);
      }
      if (riderMarkerRef.current) {
        riderMarkerRef.current.setMap(null);
      }
    };
  }, [isLoaded, customerLocation, onMapReady]);

  // Update rider marker
  useEffect(() => {
    if (!isLoaded || !window.google?.maps) return;

    if (riderLocation?.lat && riderLocation?.lng) {
      if (!riderMarkerRef.current) {
        riderMarkerRef.current = new window.google.maps.Marker({
          position: { lat: riderLocation.lat, lng: riderLocation.lng },
          map: mapInstanceRef.current,
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
      } else {
        riderMarkerRef.current.setPosition({
          lat: riderLocation.lat,
          lng: riderLocation.lng,
        });
      }

      // Update route
      if (customerMarkerRef.current && directionsRendererRef.current) {
        const directionsService = new window.google.maps.DirectionsService();

        directionsService.route(
          {
            origin: { lat: riderLocation.lat, lng: riderLocation.lng },
            destination: customerMarkerRef.current.getPosition(),
            travelMode: window.google.maps.TravelMode.DRIVING,
          },
          (result, status) => {
            if (status === "OK") {
              directionsRendererRef.current.setDirections(result);
            }
          }
        );
      }

      // Center map on rider
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setCenter({
          lat: riderLocation.lat,
          lng: riderLocation.lng,
        });
      }
    }
  }, [isLoaded, riderLocation]);

  // Update vendor marker
  useEffect(() => {
    if (!isLoaded || !window.google?.maps) return;

    if (vendorLocation?.lat && vendorLocation?.lng) {
      if (!vendorMarkerRef.current) {
        vendorMarkerRef.current = new window.google.maps.Marker({
          position: { lat: vendorLocation.lat, lng: vendorLocation.lng },
          map: mapInstanceRef.current,
          title: "Store Location",
          icon: {
            path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z",
            fillColor: "#8b5cf6",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            scale: 1.2,
          },
        });
      }
    }
  }, [isLoaded, vendorLocation]);

  // Show loading state
  if (loadError) {
    return (
      <div className={styles.error} style={{ height }}>
        <p>Failed to load Google Maps</p>
        <small>Please check your API key</small>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={styles.loading} style={{ height }}>
        <div className="spinner" />
        <p>Loading map...</p>
      </div>
    );
  }

  return (
    <div style={{ height, width: "100%", borderRadius: "12px", overflow: "hidden" }}>
      <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}