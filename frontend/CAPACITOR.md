# SiiShop Mobile Apps - Capacitor Setup

This document explains how to build SiiShop as Android and iOS apps using Capacitor without breaking the existing web app.

## Prerequisites

- Node.js 18+
- npm 9+
- Android Studio (for Android builds)
- Xcode (for iOS builds)
- Java JDK 11+

## Quick Start Commands

```bash
# Install dependencies
cd frontend
npm install

# Build for production (uses production API URLs)
npm run build

# Add platforms (already done - for new setup)
npx cap add android
npx cap add ios

# Sync web assets to native projects
npx cap sync

# Open in Android Studio
npx cap open android

# Open in Xcode
npx cap open ios
```

## Build Commands

### Development
```bash
# Run web app (development)
npm run dev

# Build for production (uses localhost)
npm run build
```

### Production Build with Production API
```bash
# Build with production backend URLs
npm run build:prod

# Then sync to native projects
npx cap sync
```

### Android
```bash
# Build debug APK
cd android
./gradlew assembleDebug

# Build release APK/AAB
./gradlew assembleRelease
```

### iOS
```bash
# Open Xcode
open ios/App.xcworkspace

# Build via command line (requires Xcode)
xcodebuild -workspace ios/App.xcworkspace -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' build
```

## Configuration Files

### Environment Variables

- `.env` - Development configuration (localhost API)
- `.env.production` - Production configuration (production API URLs)

### Key Settings

- **appId**: `com.siishop.app`
- **appName**: `SiiShop`
- **webDir**: `dist`
- **Production API**: `https://siishop-web-app-backend.onrender.com/api`

## Android Configuration

### Key Files
- `android/app/src/main/AndroidManifest.xml` - Permissions and app config
- `android/app/build.gradle` - Build settings
- `capacitor.config.json` - Capacitor settings

### Required Permissions
- `INTERNET` - For API calls
- `ACCESS_NETWORK_STATE` - Network status
- `CAMERA` - Product photo uploads
- `READ_EXTERNAL_STORAGE` - Access photos
- `WRITE_EXTERNAL_STORAGE` - Save images

### Deep Linking
Configured for `https://siishop.app`

## iOS Configuration

### Key Files
- `ios/App/App/Info.plist` - iOS settings
- `ios/App/App/Assets.xcassets` - App icons
- `capacitor.config.json` - Capacitor settings

### Required Info.plist Entries
- `NSAppTransportSecurity` - Allow all loads for Paystack
- `NSCameraUsageDescription` - Camera access
- `NSPhotoLibraryUsageDescription` - Photo library access

## Building for Release

### Android (Google Play Store)

1. **Generate signing key** (if not already done):
```bash
keytool -genkeypair -v -keystore siishop-release.keystore -alias siishop -keyalg RSA -keysize 2048 -validity 10000
```

2. **Configure build.gradle** with signing:
```groovy
android {
    signingConfigs {
        release {
            storeFile file("siishop-release.keystore")
            storePassword "your_password"
            keyAlias "siishop"
            keyPassword "your_password"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

3. **Build AAB**:
```bash
cd android
./gradlew bundleRelease
```

4. **Output**: `android/app/build/outputs/bundle/release/app-release.aab`

### iOS (App Store)

1. **Configure Xcode**:
   - Set up App Store distribution certificate
   - Configure App ID in Apple Developer Portal
   - Set up App Store listing

2. **Build**:
   - Open `ios/App.xcworkspace` in Xcode
   - Select "Any iOS Device" as destination
   - Product → Build

3. **Upload**: Use Transporter app or xcodebuild to upload

## Troubleshooting

### Common Issues

1. **API calls fail on mobile**
   - Ensure `.env.production` has correct production URL
   - Run `npm run build:prod` not just `npm run build`

2. **Images don't load**
   - Check that production API returns full URLs
   - Verify `usesCleartextTraffic` is true in AndroidManifest.xml

3. **Paystack doesn't work**
   - Ensure webview allows mixed content
   - Check that Paystack redirect URLs are configured in Paystack dashboard

4. **Blank screen on launch**
   - Check the `webDir` path in capacitor.config.json
   - Ensure build output is in `dist/` folder

## Project Structure

```
frontend/
├── android/              # Android native project
├── ios/                 # iOS native project
├── src/                 # React source code
├── dist/                # Production build output
├── capacitor.config.json # Capacitor configuration
├── vite.config.js       # Vite build configuration
├── .env                 # Development environment
├── .env.production      # Production environment
└── package.json        # Dependencies and scripts
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production (dev API) |
| `npm run build:prod` | Build for production (prod API) |
| `npm run cap:sync` | Sync web assets to native projects |
| `npm run cap:android` | Add Android platform |
| `npm run cap:ios` | Add iOS platform |
| `npm run cap:open:android` | Open Android Studio |
| `npm run cap:open:ios` | Open Xcode |

## Notes

- The website continues to work normally at `localhost:3000`
- Mobile apps use production API by default with `npm run build:prod`
- All routing, authentication, and payments work identically on mobile
- The app is scalable and maintains a single codebase for all platforms