import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import topLevelAwait from "vite-plugin-top-level-await";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      overrides: {
        fs: "memfs",
      },
    }),
    topLevelAwait(),
  ],
});
