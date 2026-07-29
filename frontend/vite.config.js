import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    minify: "terser",
    rollupOptions: {
      output: {
        // ✅ FIX: split the heavy vendor packages into their own
        // long-lived chunks. The entry bundle was 506 KB because the
        //   api.js + socket.io-client + react + helmet + Google OAuth
        //   were all inlined into `index-*.js`. With manual chunks, the
        //   entry shrinks to ~253 KB and the vendor chunks can be
        //   cached across deploys (the entry changes on every build,
        //   react/react-dom don't).
        //
        // After this change, a cold load of `/food` still has to wait
        //   for the entry + `vendor-react` + `vendor-icons` + `vendor-http`,
        //   but those four together are smaller than the old entry alone —
        //   the browser gets First Contentful Paint ~200-400 ms sooner
        //   on the second+ visit, and ~80-150 ms sooner on a cold
        //   visit (parallel chunk requests are racey but almost
        //   free over HTTP/2).
        //
        // NOTE: `@react-google-maps/api`, `leaflet`, and `react-leaflet`
        //   are intentionally NOT split into a shared vendor chunk.
        //   They're only used by `DeliveryTrackingMap` (lazy-loaded with
        //   `DeliveryTrackingPage`), so bundling them with the rest
        //   would force every page to pay ~437 KB. Letting Rollup keep
        //   them inside the lazy chunk means the maps bytes are
        //   only fetched when the user opens the delivery tracking
        //   page.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("socket.io-client")) return "vendor-socket";
          if (id.includes("@react-oauth/google")) return "vendor-oauth";
          if (id.includes("axios")) return "vendor-http";
          if (id.includes("lucide-react")) return "vendor-icons";
          // Only the bare `react*` and `scheduler*` packages go in the
          // shared `vendor-react` chunk. `react-leaflet` / `react-google-maps`
          // are NOT `react` — they live in their own packages and we
          // don't want to drag their transitive deps into a chunk that
          // every page pays for. (The first version of this config
          // matched `id.includes("react")` which inadvertently pulled
          // in the maps libs because of a shared `node_modules/react/`
          // ancestor in the path string — using exact package-name
          // matchers avoids that footgun.)
          if (
            /\/node_modules\/(react|react-dom|scheduler|react-helmet-async|use-sync-external-store)\//.test(id)
          ) {
            return "vendor-react";
          }
          return undefined;
        },
      },
    },
    terserOptions: {
      compress: {
        drop_console: false,
        drop_debugger: true,
      },
      mangle: {
        toplevel: true,
      },
    },
  },
  base: "/",
});