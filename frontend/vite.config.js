import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy /api requests to the Express backend during development
// so you don't need to hardcode http://localhost:5000 everywhere
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  // Build configuration for production
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    minify: "esbuild",
  },
  // Ensure base path is correct for mobile builds
  base: "./",
});
