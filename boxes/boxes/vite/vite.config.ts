import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { PolyfillOptions, nodePolyfills } from "vite-plugin-node-polyfills";
import topLevelAwait from "vite-plugin-top-level-await";

// Unfortunate, but needed due to https://github.com/davidmyersdev/vite-plugin-node-polyfills/issues/81
// Suspected to be because of the yarn workspace setup, but not sure
const nodePolyfillsFix = (options?: PolyfillOptions | undefined): Plugin => {
  return {
    ...nodePolyfills(options),
    /* @ts-ignore */
    resolveId(source: string) {
      const m =
        /^vite-plugin-node-polyfills\/shims\/(buffer|global|process)$/.exec(
          source,
        );
      if (m) {
        return `../../node_modules/vite-plugin-node-polyfills/shims/${m[1]}/dist/index.cjs`;
      }
    },
  };
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfillsFix({
      overrides: {
        fs: "memfs",
        buffer: "buffer/",
      },
    }),
    topLevelAwait(),
  ],
  optimizeDeps: {
    exclude: ["@noir-lang/acvm_js", "@noir-lang/noirc_abi"],
  },
});
