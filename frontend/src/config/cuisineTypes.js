// Cuisine Types for Restaurant Module
export const cuisineTypes = [
  "Local Food",
  "Continental",
  "Pizza",
  "Fast Food",
  "Chinese",
  "Indian",
  "African",
  "Bakery",
  "BBQ",
  "Sea Food",
  "Vegetarian",
  "Vegan",
  "Desserts",
  "Drinks & Beverages",
  "Fusion",
];

// Ghana Regions and Cities
export const ghanaRegions = [
  { name: "Ashanti", cities: ["Kumasi", "Obuasi", "Mampong", "Bekwai", "Ejisu", "Asokore Mampong", "Konongo", "Agogo"] },
  { name: "Greater Accra", cities: ["Accra", "Tema", "Teshie", "Nungua", "East Legon", "Spintex", "Tema West", "Ledzokuku"] },
  { name: "Western", cities: ["Takoradi", "Sekondi", "Cape Coast", "Elubo", "Axim", "Bogoso", "Prestea"] },
  { name: "Central", cities: ["Cape Coast", "Kumasi", "Mankessim", "Ajumako", "Gomoa"] },
  { name: "Eastern", cities: ["Koforidua", "Akwapim", "Akim Oda", "Birim", "Densu"] },
  { name: "Northern", cities: ["Tamale", "Yendi", "Savelugu", "Karaga", "Garu"] },
  { name: "Upper East", cities: ["Bolgatanga", "Bawku", "Paga", "Navrongo"] },
  { name: "Upper West", cities: ["Wa", "Lawra", "Jema"] },
  { name: "Volta", cities: ["Ho", "Ketu", "Akatsi", "Dambai", "Kete Krachi"] },
  { name: "Oti", cities: ["Dambai", "Kete Krachi", "Baglo"] },
  { name: "Bono", cities: ["Sunyani", "Berekum", "Drobo", "Atebubu"] },
  { name: "Bono East", cities: ["Techiman", "Kintampo", "Bui"] },
  { name: "Ahafo", cities: ["Goaso", "Tano", "Asunafo"] },
  { name: "Western North", cities: ["Sefwi", "Bonsu", "Wiawso"] },
  { name: "Savanna", cities: ["Damongo", "Salaga", "Buipe"] },
  { name: "North East", cities: ["Nalerigu", "Garu"] },
];

// Default menu categories
export const menuCategories = [
  { id: "breakfast", name: "Breakfast", icon: "🍳" },
  { id: "lunch", name: "Lunch", icon: "🍱" },
  { id: "dinner", name: "Dinner", icon: "🍽️" },
  { id: "snacks", name: "Snacks", icon: "🍿" },
  { id: "drinks", name: "Drinks", icon: "🥤" },
  { id: "desserts", name: "Desserts", icon: "🍰" },
  { id: "starters", name: "Starters", icon: "🥗" },
  { id: "sides", name: "Sides", icon: "🍟" },
];

// DEPRECATED: `foodOrderStatuses` has been retired. All orders (marketplace
// + restaurant) now share the canonical 6-status enum defined in
// components/vendor/OrderRow.jsx (ORDER_STATUSES). Status labels, icons,
// and colors live in the shared StatusBadge component (OrderStatusBadge.jsx).

export default cuisineTypes;