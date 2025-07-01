import { defineConfig, loadEnv, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react-swc";
import { PolyfillOptions, nodePolyfills } from "vite-plugin-node-polyfills";

const nodeModulesPath = `${searchForWorkspaceRoot(process.cwd())}/node_modules`;

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
        return `${nodeModulesPath}/vite-plugin-node-polyfills/shims/${m[1]}/dist/index.cjs`;
      }
    },
  };
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    logLevel: "error",
    server: {
      // Headers needed for bb WASM to work in multithreaded mode
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
      // Allow vite to serve files from these directories, since they are symlinked
      // These are the protocol circuit artifacts and noir/bb WASMs.
      // ONLY REQUIRED TO RUN FROM THE MONOREPO
      fs: {
        allow: [
          searchForWorkspaceRoot(process.cwd()),
          "../../../yarn-project/noir-protocol-circuits-types/artifacts",
          "../../../noir/packages/noirc_abi/web",
          "../../../noir/packages/acvm_js/web",
        ],
      },
    },
    plugins: [
      react(),
      nodePolyfillsFix({ include: ["buffer", "path", "process"] }),
    ],
    define: {
      "process.env": JSON.stringify({
        AZTEC_NODE_URL: env.AZTEC_NODE_URL,
      }),
    },
  };
});
