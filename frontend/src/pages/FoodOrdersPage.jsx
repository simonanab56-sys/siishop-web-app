"use strict";
/**
 * DEPRECATED — Redirect stub.
 *
 * The customer-side legacy food-orders history page has been retired.
 * All orders (marketplace + restaurant) now appear on the unified
 * /orders page. This file remains only to preserve any bookmarks /
 * deep links pointing at /food-orders — they get redirected to the
 * unified orders page automatically.
 */
import { useEffect } from "react";

export default function FoodOrdersPage({ onNavigate }) {
  useEffect(() => {
    onNavigate?.("orders");
  }, [onNavigate]);
  return null;
}