"use strict";
/**
 * DEPRECATED — Redirect stub.
 *
 * The legacy standalone food cart has been retired. All restaurant orders
 * now flow through the unified CartPage (which already supports
 * itemType === "food" items). This file remains only to preserve any
 * bookmarks / deep links pointing at /food-cart — they get redirected
 * to the unified cart automatically.
 */
import { useEffect } from "react";

export default function FoodCartPage({ onNavigate }) {
  useEffect(() => {
    // The app uses a page-state router (not react-router-dom). Setting
    // the page to "cart" routes to the unified CartPage.
    onNavigate?.("cart");
  }, [onNavigate]);
  return null;
}