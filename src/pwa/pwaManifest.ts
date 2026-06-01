import type { ManifestOptions } from "vite-plugin-pwa";

export const pwaManifest = {
  name: "EPUB Reader",
  short_name: "EPUB Reader",
  start_url: "/",
  display: "standalone",
  background_color: "#efe3cf",
  theme_color: "#3f2514",
  icons: [
    {
      src: "/pwa-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any maskable",
    },
    {
      src: "/pwa-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any maskable",
    },
  ],
} satisfies Partial<ManifestOptions>;
