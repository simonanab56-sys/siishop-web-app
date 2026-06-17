# Location-Based Vendor Registration System - Implementation Plan

## Overview
This document outlines the implementation plan for adding location-based vendor registration to the SiiShop multi-vendor marketplace. The implementation maintains backward compatibility with existing vendors while adding location requirements for new vendor registrations.

---

## 1. Database Schema Changes

### 1.1 User Model Update
**File**: `backend/models/User.js`

Add location fields:
```javascript
// ── Vendor Location Fields (Ghana-focused) ──
location: {
  country: { type: String, default: "Ghana" },
  region: { type: String, default: "" },
  city: { type: String, default: "" },
}
```

Add indexes for performance:
```javascript
userSchema.index({ "location.region": 1 });
userSchema.index({ "location.city": 1 });
userSchema.index({ "location.region": 1, "location.city": 1 });
```

---

## 2. Backend API Updates

### 2.1 Authentication Routes
**File**: `backend/routes/auth.js`

- **Registration endpoint** (`POST /auth/register`):
  - Accept location data (country, region, city) when `isVendor=true`
  - Validate region and city are required for vendors
  - Include location in response via `cleanUser()`

- **Profile update endpoint** (`PUT /auth/me`):
  - Allow vendors to update their location

### 2.2 Vendor Routes
**File**: `backend/routes/vendor.js`

- **GET /vendor/list** - Add location filtering:
  - Filter by `region` query param
  - Filter by `city` query param
  - Include location in vendor data

- **GET /vendor/store/:slug** - Include location in store data

- **PUT /vendor/location** (new) - Allow vendors to update location

- **GET /vendor/dashboard** - Include location in response

### 2.3 Product Routes
**File**: `backend/routes/products.js`

- **GET /products** - Add location filtering:
  - Filter by `region` (vendor's region)
  - Filter by `city` (vendor's city)
  - Include vendor location in product response

- **GET /products/:id** - Include vendor location in response

### 2.4 Admin Vendor Routes
**File**: `backend/routes/admin-vendors.js`

- **GET /admin/vendors/pending** - Include location fields

- **GET /admin/vendors/all** - Include location fields, add filtering:
  - Filter by region
  - Filter by city

---

## 3. Data Configuration

### 3.1 Ghana Regions and Cities
**File**: `backend/config/ghanaLocations.js` (new)

Create a configuration file with Ghana's 16 regions and their cities:

```javascript
module.exports = {
  "Greater Accra": ["Accra", "Tema", "Madina", "Kasoa", "Teshie", "Nungua", "Tema New Town", "Sakumono", "Kpong", "Ada"],
  "Ashanti": ["Kumasi", "Obuasi", "Mampong", "Ejura", "Bekwai", "Asante Mampong", "Konongo", "Agogo", "Bompata", "Effiduase"],
  "Central": ["Cape Coast", "Kumasi", "Elmina", "Mankessim", "Apam", "Winneba", "Gomoa", "Ajumako", "Abura", "Nsaba"],
  "Eastern": ["Koforidua", "Akwapim", "Akim", "Birim", "Akyem", "Kumasi", "Suhum", "Nkawkaw", "Akwatia", "Mumford"],
  "Western": ["Sekondi", "Takoradi", "Ahanta", "Effia", "Kwesimintsim", "Foso", "Boin", "Banos", "Nzul", "Lower"],
  "Western North": ["Sefwi", "Wiawso", "Bonsu", "Kojina", "Pamu", "Debiso", "Bibiani", "Asanwinso", "Kwabeng", "Anhwiam"],
  "Bono": ["Sunyani", "Bono", "Goaso", "Drobon", "Atebubu", "Techiman", "Nkoranza", "Buipe", "Sani", "Zabzugu"],
  "Bono East": ["Techiman", "Bono East", "Atebubu", "Nkoranza", "Pru", "Sene", "Dagomba", "Kintampo", "Bui", "Lashibi"],
  "Ahafo": ["Goaso", "Bechem", "Kenyasi", "Hwidiem", "Tano", "Daa", "Ghana", "Adiembak", "Dunkwa", "Maase"],
  "Volta": ["Ho", "Ketu", "Akatsi", "Ho West", "Kpando", "Togo", "Hohoe", "Keta", "Sogakope", "Aflao"],
  "Oti": ["Dambai", "Oti", "Nkwanta", "Kpassa", "Nakpanduri", "Bimbila", "Kete Krachi", "Salaga", "Saboba", "Yendi"],
  "Northern": ["Tamale", "Yendi", "Savelugu", "Kumbum", "Mamprusi", "Garu", "Buipe", "Sang", "Ghana", "Kulmasa"],
  "Savannah": ["Damongo", "Savannah", "Bole", "Bamboi", "Salaga", "Tolon", "Kumbum", "Yendi", "Garu", "Buipe"],
  "North East": ["Nalerigu", "North East", "Garu", "Bawku", "Bawku West", "Mamprusi", "Kulmasa", "Pigu", "Bachie", "Warib"],
  "Upper East": ["Bolgatanga", "Bawku", "Bawku West", "Navrongo", "Paga", "Kulmasa", "Zebilla", "Banie", "Tongo", "Bawyina"],
  "Upper West": ["Wa", "Lawra", "Jema", "Nandom", "Kalle", "Funsi", "Daffiama", "Issa", "Lambo", "Sombo"],
};
```

### 3.2 Location Helper Functions
**File**: `backend/utils/locationHelpers.js` (new)
- Helper to get all regions
- Helper to get cities by region
- Helper to format location string

---

## 4. Frontend Updates

### 4.1 Location Data Configuration
**File**: `frontend/src/config/ghanaLocations.js` (new)
- Mirror backend data for frontend use

### 4.2 AuthModal Update
**File**: `frontend/src/components/auth/AuthModal.jsx`

Add location fields when `asVendor === true`:
- Country field (default: Ghana, readonly or dropdown)
- Region dropdown (populated from config)
- City dropdown (dynamically populated based on region)

Validation:
- Region is required when registering as vendor
- City is required when registering as vendor

### 4.3 Vendor Store Page
**File**: `frontend/src/pages/vendor/StorePage.jsx` (or similar)

Display location:
```jsx
{location && (
  <div className="store-location">
    <span>Store Location:</span>
    <span>{location.city}, {location.region}</span>
  </div>
)}
```

Fallback: "Location not specified"

### 4.4 Product Display
**File**: `frontend/src/pages/product/ProductPage.jsx` (or similar)

Display vendor location on product page:
```jsx
{vendorLocation && (
  <div className="vendor-location">
    <span>Sold from:</span>
    <span>{vendorLocation.city}, {vendorLocation.region}</span>
  </div>
)}
```

### 4.5 Vendor Dashboard Update
**File**: `frontend/src/pages/vendor/VendorDashboard.jsx` (or similar)

- Display current location
- Add form to update location

### 4.6 Product Listing / Marketplace
**File**: `frontend/src/pages/shop/ShopPage.jsx` (or similar)

Add filters:
- Region dropdown filter
- City dropdown filter
- Update API calls with location params

### 4.7 Vendor Listing
**File**: `frontend/src/pages/vendors/VendorsPage.jsx` (or similar)

Add filters:
- Region dropdown filter
- City dropdown filter

### 4.8 Admin Dashboard
**File**: `frontend/src/pages/admin/AdminDashboard.jsx` (or similar)

- Add Region and City columns to vendor list
- Add filtering by location
- Update table display

---

## 5. API Response Updates

### 5.1 Vendor APIs Response
All vendor responses should include:
```json
{
  "location": {
    "country": "Ghana",
    "region": "Ahafo",
    "city": "Goaso"
  }
}
```

### 5.2 Product APIs Response
Product responses should include vendor location:
```json
{
  "name": "Product Name",
  "price": 100,
  "vendorId": {
    "storeName": "Store Name",
    "location": {
      "country": "Ghana",
      "region": "Ahafo",
      "city": "Goaso"
    }
  }
}
```

---

## 6. Backward Compatibility

### 6.1 Missing Location Handling
- If existing vendor has no location, the system should continue working
- Display "Location not specified" instead of empty/missing values

### 6.2 Graceful Degradation
- Location filtering should work with vendors that have location data
- Products without vendor location data should still be displayed
- Location filters should be optional, not blocking

### 6.3 Migration Path
- Existing vendors can update their location through vendor dashboard
- No forced migration required

---

## 7. Mobile Support

### 7.1 Responsive Dropdowns
- Use native `<select>` elements for maximum compatibility
- Ensure touch-friendly target sizes (44px minimum)
- Test on mobile browsers

### 7.2 CSS Responsive
- Ensure forms work on all screen sizes
- Use flexbox/grid for layout
- Test on Android, iOS, tablets

---

## 8. Performance Optimization

### 8.1 Database Indexes
Add indexes on User model:
- `location.region`
- `location.city`
- Compound index: `location.region + location.city`

### 8.2 Query Optimization
- Use select fields to limit data transfer
- Add pagination to vendor/product listings
- Cache region/city lists

---

## 9. Implementation Order

1. **Phase 1: Database & Config**
   - Add location fields to User model
   - Create ghanaLocations.js config
   - Add indexes

2. **Phase 2: Backend APIs**
   - Update auth routes (register, profile)
   - Update vendor routes (list, store, location)
   - Update product routes (filtering)
   - Update admin routes

3. **Phase 3: Frontend Registration**
   - Add location data config
   - Update AuthModal with location dropdowns

4. **Phase 4: Display Pages**
   - Update vendor store page
   - Update product page

5. **Phase 5: Filtering & Search**
   - Add location filters to marketplace
   - Add location filters to vendor listing
   - Update search to include location

6. **Phase 6: Dashboards**
   - Update vendor dashboard
   - Update admin dashboard

7. **Phase 7: Testing & Polish**
   - Mobile testing
   - Performance testing
   - Edge case handling

---

## 10. Files to Modify

### Backend Files
1. `backend/models/User.js` - Add location fields and indexes
2. `backend/config/ghanaLocations.js` - NEW - Location data
3. `backend/utils/locationHelpers.js` - NEW - Helper functions
4. `backend/routes/auth.js` - Accept location on registration
5. `backend/routes/vendor.js` - Add location filtering
6. `backend/routes/products.js` - Add location filtering
7. `backend/routes/admin-vendors.js` - Include location in responses

### Frontend Files
1. `frontend/src/config/ghanaLocations.js` - NEW - Location data
2. `frontend/src/components/auth/AuthModal.jsx` - Add location fields
3. `frontend/src/pages/vendor/StorePage.jsx` - Display location
4. `frontend/src/pages/product/ProductPage.jsx` - Display location
5. `frontend/src/pages/shop/ShopPage.jsx` - Add location filters
6. `frontend/src/pages/vendors/VendorsPage.jsx` - Add location filters
7. `frontend/src/pages/vendor/VendorDashboard.jsx` - Display/update location
8. `frontend/src/pages/admin/AdminDashboard.jsx` - Add location columns/filters

---

## 11. Testing Checklist

- [ ] New vendor registration with location succeeds
- [ ] Location validation prevents empty region/city
- [ ] Vendor store page displays location correctly
- [ ] Product page displays vendor location correctly
- [ ] Location filtering works for vendors
- [ ] Location filtering works for products
- [ ] Search by location returns correct results
- [ ] Admin can filter vendors by location
- [ ] Vendor can update their location
- [ ] Existing vendors work without location data
- [ ] Mobile forms work correctly
- [ ] Performance is acceptable with location data