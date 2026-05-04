import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // Legacy plugin = compiles to ES5 + polyfills for older Safari (iOS 12+)
    legacy({
      targets: [
        "ios >= 12",
        "safari >= 12",
        "chrome >= 70",
        "firefox >= 68",
        "edge >= 79",
      ],
      additionalLegacyPolyfills: ["regenerator-runtime/runtime"],
      modernPolyfills: true,
      renderLegacyChunks: true,
    }),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Periodiza Pro",
        short_name: "Periodiza Pro",
        description: "Periodização científica de treinamento esportivo",
        theme_color: "#07090d",
        background_color: "#07090d",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        lang: "pt-BR",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      }
    })
  ],
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2015",
    minify: "terser",
  }
});
