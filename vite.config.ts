import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from 'node:child_process';
import { pwaManifest } from "./src/pwa/pwaManifest";

function resolveBuildId() {
  const packageVersion = process.env.npm_package_version ?? "0.0.0";
  try {
    const gitHash = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    let dirtySuffix = "";
    try {
      execSync("git diff --quiet --ignore-submodules HEAD --", { stdio: "ignore" });
    } catch {
      dirtySuffix = "-dirty";
    }
    return `${packageVersion}-${gitHash}${dirtySuffix}`;
  } catch {
    return packageVersion;
  }
}

export default defineConfig({
  define: {
    __APP_BUILD_ID__: JSON.stringify(resolveBuildId()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa-192.png", "pwa-512.png"],
      manifest: pwaManifest,
    }),
  ],
});
