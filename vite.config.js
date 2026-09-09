import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// Mobile App (PWA): Vite Plugin for Service Worker & App Manifest
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // Web / Desktop (Already existing plugins)
    react(), 
    tailwindcss(),

    // Mobile App (PWA) Setup
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer', // 🚀 Auto-injects service worker script without virtual import errors
      includeAssets: ['favicon.ico', 'faviconsms.png', 'logo192.png', 'logo512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 // 5 MB Limit
      },
      devOptions: {
        enabled: false // Production builds generate full service worker
      }
    })
  ],
  server: {
    allowedHosts: true // Web / Local Server config
  }
});