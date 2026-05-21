import { defineConfig, type PluginOption } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsRoot = path.resolve(__dirname, "../..");

// The bb.js sources `import` a `*.wasm.gz` pointer file whose body is a
// relative path the dev server resolves at request time. Rollup tries to
// parse that pointer as JS and fails. The WebGPU-only page never boots
// the WASM Pippenger, so map every `.wasm.gz` import to a stub URL.
function stubBbWasm(): PluginOption {
  const VIRTUAL = "\0stub-bb-wasm-gz";
  return {
    name: "stub-bb-wasm-gz",
    enforce: "pre",
    resolveId(source) {
      return source.endsWith(".wasm.gz") ? VIRTUAL : null;
    },
    load(id) {
      return id === VIRTUAL ? 'export default "/__unused_barretenberg.wasm.gz";' : null;
    },
  };
}

// Static production build of the WebGPU MSM dev page. The interactive
// `vite.config.ts` serves hundreds of individually-transpiled ESM
// modules; that request waterfall is fine on a local desktop browser but
// is far too slow on a real mobile device reached through a Cloudflare
// Quick Tunnel (the page never finishes booting before the BrowserStack
// watchdog fires). This config bundles the page into a handful of static
// assets so a real iPhone/Android can load it in one shot. Serve the
// output with `scripts/serve-static.mjs`, which re-implements the
// `/progress` + `/results` JSONL collector the dev server provides.
export default defineConfig({
  root: tsRoot,
  plugins: [stubBbWasm()],
  // bb.js's browser worker factory uses a code-split module worker; the
  // default iife worker format can't code-split.
  worker: { format: "es" },
  resolve: {
    // Mirror the dev server's node/→browser/ rewrite so the bb.js worker
    // factory and friends resolve to their browser variants.
    alias: [
      {
        find: /^(.*)\/node\/(.*)$/,
        replacement: "$1/browser/$2",
      },
    ],
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    target: "es2022",
    minify: false,
    rollupOptions: {
      input: {
        index: path.join(__dirname, "index.html"),
        "field-verify": path.join(__dirname, "bench-field-verify.html"),
      },
    },
  },
});
