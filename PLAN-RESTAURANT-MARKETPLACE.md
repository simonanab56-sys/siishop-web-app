# Restaurant Marketplace Module - Implementation Plan

## Overview
Build a complete Restaurant/Food Marketplace module inside SiiShop, similar to Jumia + Jumia Food, with complete separation from the general marketplace.

---

## Architecture Overview

### Two Marketplace Types

| Type | Products | Vendors | Cart | Orders |
|------|----------|---------|------|--------|
| **General Marketplace** | Products | Marketplace Vendors | Marketplace Cart | Marketplace Orders |
| **Restaurant/Food** | Menu Items | Restaurant Vendors | Food Cart | Food Orders |

### Key Separation Rules
- Marketplace products NEVER appear on Food pages
- Restaurant menu items NEVER appear on Marketplace pages
- Separate carts prevent mixing items
- Different order flows for each type

---

## Database Schema Changes

### 1. Update User Model (`backend/models/User.js`)

Add vendorType field:
```javascript
vendorType: {
  type: String,
  enum: ["marketplace", "restaurant"],
  default: "marketplace",
}
```

Add Restaurant-specific fields (only for vendorType === "restaurant"):
```javascript
restaurantDetails: {
  restaurantName: String,
  restaurantLogo: String,
  restaurantCoverImage: String,
  restaurantDescription: String,
  address: String,
  deliveryRadius: Number, // in km
  openingHours: String, // e.g., "08:00"
  closingHours: String, // e.g., "22:00"
  cuisineType: String,
  isOpen: { type: Boolean, default: false },
}
```

Add indexes:
```javascript
userSchema.index({ vendorType: 1, vendorStatus: 1 });
userSchema.index({ vendorType: 1, "location.region": 1 });
userSchema.index({ vendorType: 1, "location.city": 1 });
```

### 2. Create MenuItem Model (`backend/models/MenuItem.js`)

```javascript
{
  vendorId: ObjectId, // Reference to User (restaurant)
  name: String,
  description: String,
  price: Number,
  category: String, // breakfast, lunch, dinner, snacks, drinks, desserts
  image: String,
  preparationTime: Number, // in minutes
  available: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
}
```

### 3. Create MenuCategory Model (`backend/models/MenuCategory.js`)

```javascript
{
  vendorId: ObjectId,
  name: String, // breakfast, lunch, dinner, snacks, drinks, desserts
  displayOrder: Number,
  isActive: { type: Boolean, default: true },
}
```

### 4. Create FoodOrder Model (`backend/models/FoodOrder.js`)

```javascript
{
  userId: ObjectId,
  restaurantId: ObjectId,
  items: [{
    menuItemId: ObjectId,
    name: String,
    price: Number,
    quantity: Number,
    image: String,
    preparationTime: Number,
  }],
  totalAmount: Number,
  deliveryAddress: String,
  deliveryPhone: String,
  paymentMethod: { type: String, enum: ["paystack", "cash"] },
  paymentStatus: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
  orderStatus: {
    type: String,
    enum: ["pending", "received", "preparing", "ready", "rider_assigned", "on_the_way", "delivered"],
    default: "pending",
  },
  riderId: ObjectId,
  estimatedDeliveryTime: Number, // in minutes
  deliveryCode: String,
  specialInstructions: String,
}
```

### 5. Create RestaurantReview Model (`backend/models/RestaurantReview.js`)

```javascript
{
  userId: ObjectId,
  restaurantId: ObjectId,
  orderId: ObjectId,
  rating: { type: Number, min: 1, max: 5 },
  review: String,
  isDeleted: { type: Boolean, default: false },
}
```

---

## Backend API Routes

### New Routes Structure

```
/api/restaurants          - Restaurant listing & search
/api/restaurants/:slug    - Restaurant details
/api/restaurants/locations - Get restaurants by location
/api/menu                - Menu item CRUD
/api/food-orders          - Food order management
/api/food-orders/:id/status - Update order status
/api/restaurant-reviews  - Reviews
```

### Modify Existing Routes

**`backend/routes/auth.js`**
- Update registration to accept vendorType
- Add restaurant-specific registration fields
- Validate restaurant data

**`backend/routes/admin.js`**
- Add Restaurant Applications tab
- Approve/Reject/Suspend restaurants
- View restaurant-specific data

**`backend/routes/vendor.js`**
- Add vendorType filter for marketplace vendors
- Restaurant vendors get menu system instead of products

---

## Frontend Implementation

### Navigation Changes

**Desktop Navbar (`Navbar.jsx`):**
- Add Food icon and link
- Route: `/food`

**Mobile Navbar (`MobileLayoutWrapper.jsx`):**
- Add Food icon in bottom nav
- Reorder: Home, Categories, Stores, Food, Cart

### New Pages

| Page | Route | Description |
|------|-------|-------------|
| FoodPage | `/food` | Featured restaurants, nearby, popular, new |
| RestaurantPage | `/restaurant/:slug` | Restaurant banner, logo, menu, reviews |
| FoodCartPage | `/food-cart` | Separate cart for food orders |
| FoodOrdersPage | `/food-orders` | Food order tracking |
| RestaurantDashboard | `/restaurant-dashboard` | Menu management, orders, analytics |
| FavoriteRestaurants | `/favorites` | Favorite restaurants |

### AuthModal Changes

Update vendor registration:
1. Add Business Type selection:
   - Radio: Marketplace Vendor
   - Radio: Restaurant / Food Vendor

2. If Restaurant selected:
   - Show restaurant form with:
     - Restaurant Name
     - Restaurant Logo (upload)
     - Restaurant Cover Image (upload)
     - Restaurant Description
     - Cuisine Type dropdown
     - Address
     - Delivery Radius
     - Opening Hours / Closing Hours
     - Region/City (already exists)

### Existing Page Updates

**VendorDashboard.jsx:**
- If vendorType === "restaurant", show restaurant dashboard
- Otherwise, show existing marketplace dashboard

**AdminDashboard.jsx:**
- Add "Restaurant Applications" tab
- Add "Food Orders" tab with order tracking

---

## Menu System

### Default Menu Categories
1. Breakfast
2. Lunch
3. Dinner
4. Snacks
5. Drinks
6. Desserts

### Menu Item Fields
- Name (required)
- Description
- Price (required)
- Category (dropdown)
- Image (upload)
- Preparation Time (minutes)
- Availability (toggle)

### Restaurant Dashboard Menu
- Add/Edit/Delete Menu Items
- Manage Categories
- Set Availability
- View Orders
- Manage Opening Hours
- Manage Promotions

---

## Order Tracking Flow

### Food Order Statuses
```
pending → received → preparing → ready → rider_assigned → on_the_way → delivered
```

### Status Descriptions
| Status | Description |
|--------|-------------|
| pending | Order placed, awaiting restaurant confirmation |
| received | Restaurant confirmed the order |
| preparing | Kitchen is preparing the food |
| ready | Food ready for pickup |
| rider_assigned | Rider assigned to deliver |
| on_the_way | Rider is en route |
| delivered | Order delivered to customer |

---

## Search System

### General Search (`/search` or global search)
- Searches marketplace products only
- Filters: category, price, vendor, region, city

### Food Search (`/food/search`)
- Searches restaurants by name
- Searches menu items by name
- Filters: cuisine type, location, rating, delivery time

---

## Implementation Steps

### Phase 1: Database & Backend Core
1. Update User model with vendorType and restaurantDetails
2. Create MenuItem model
3. Create MenuCategory model
4. Create FoodOrder model
5. Create RestaurantReview model
6. Update auth routes for restaurant registration
7. Create restaurant API routes
8. Create menu API routes
9. Create food-order API routes
10. Update admin routes for restaurant management

### Phase 2: Frontend Core
1. Update AuthModal with business type selection
2. Create ghanaLocations.js config (already exists)
3. Create FoodPage
4. Create RestaurantPage
5. Create RestaurantDashboard
6. Update Navbar with Food link
7. Update MobileNav with Food link

### Phase 3: Cart & Orders
1. Create FoodCartPage
2. Create FoodOrdersPage
3. Implement separate cart logic
4. Implement food order creation
5. Implement order tracking UI

### Phase 4: Admin & Features
1. Update AdminDashboard with restaurant tabs
2. Add restaurant approval workflow
3. Add restaurant reviews
4. Add favorites system
5. Add SEO for restaurant pages

### Phase 5: Polish & Testing
1. Ensure backward compatibility
2. Test registration flows
3. Test cart separation
4. Test order flows
5. Fix any bugs

---

## Backward Compatibility

### Must NOT break:
- ✅ Existing marketplace vendors (vendorType defaults to "marketplace")
- ✅ Existing products (no changes)
- ✅ Existing orders (separate FoodOrder model)
- ✅ Existing carts (separate food cart in localStorage)
- ✅ Existing dashboards (conditional rendering by vendorType)
- ✅ Existing authentication (same auth system)

### Database Migration
- All existing vendors get vendorType: "marketplace" by default
- No migration needed - schema default handles it

---

## Cuisine Types (Comprehensive)

1. Local Food
2. Continental
3. Pizza
4. Fast Food
5. Chinese
6. Indian
7. African
8. Bakery
9. BBQ
10. Sea Food
11. Vegetarian
12. Vegan
13. Desserts
14. Drinks & Beverages
15. Fusion

---

## File Changes Summary

### Backend (New Files)
- `backend/models/MenuItem.js`
- `backend/models/MenuCategory.js`
- `backend/models/FoodOrder.js`
- `backend/models/RestaurantReview.js`
- `backend/routes/restaurants.js`
- `backend/routes/menu.js`
- `backend/routes/food-orders.js`
- `backend/routes/restaurant-reviews.js`

### Backend (Modified Files)
- `backend/models/User.js`
- `backend/routes/auth.js`
- `backend/routes/admin.js`
- `backend/routes/vendor.js`
- `backend/server.js`

### Frontend (New Files)
- `frontend/src/pages/FoodPage.jsx`
- `frontend/src/pages/RestaurantPage.jsx`
- `frontend/src/pages/FoodCartPage.jsx`
- `frontend/src/pages/FoodOrdersPage.jsx`
- `frontend/src/pages/restaurant/RestaurantDashboard.jsx`
- `frontend/src/components/restaurant/MenuItemCard.jsx`
- `frontend/src/components/restaurant/RestaurantCard.jsx`
- `frontend/src/config/cuisineTypes.js`

### Frontend (Modified Files)
- `frontend/src/App.jsx`
- `frontend/src/components/auth/AuthModal.jsx`
- `frontend/src/components/Navbar.jsx`
- `frontend/src/components/mobile/MobileLayoutWrapper.jsx`
- `frontend/src/pages/vendor/VendorDashboard.jsx`
- `frontend/src/pages/admin/AdminDashboard.jsx`
- `frontend/src/services/api.js`

---

## SEO Implementation

### Restaurant Page
- URL: `/restaurant/restaurant-name`
- Title: `{Restaurant Name} | Order Food on SiiShop`
- Description: `Order {cuisineType} delivery from {restaurantName}. {description}`
- Keywords: restaurant, food delivery, {cuisineType}, {city}

### Menu Item Page
- URL: `/restaurant/restaurant-name/menu/{item-name}`
- Title: `{Item Name} - {Restaurant Name} | SiiShop Food`
- Description: `Order {itemName} from {restaurantName}. {description}`

---

## Future-Ready Architecture

### Rider Integration (Phase 2)
- Rider model already has isRider flag
- FoodOrder has riderId field
- Live tracking via existing Socket.IO
- ETA calculation from deliveryRadius

### Maps Integration
- Delivery radius calculation
- Restaurant coverage area
- Rider location tracking

---

## Success Criteria

1. ✅ Two separate marketplace types (marketplace/restaurant)
2. ✅ Restaurant registration with all required fields
3. ✅ Admin approval workflow for restaurants
4. ✅ Menu system (categories + items)
5. ✅ Separate food cart (never mixes with marketplace)
6. ✅ Food order tracking with statuses
7. ✅ Food page with restaurant listing
8. ✅ Restaurant page with menu display
9. ✅ Navigation with Food link
10. ✅ Backward compatibility preserved