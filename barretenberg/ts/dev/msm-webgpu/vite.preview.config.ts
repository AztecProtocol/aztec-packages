import { defineConfig, type PluginOption } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { appendFileSync, mkdirSync } from "node:fs";

// Production-bundle variant of the msm-webgpu dev page, for driving the
// WASM-free `?autorun=msm-gpu-bench` on mobile BrowserStack devices. The dev
// server ships hundreds of unbundled ESM modules, which never finish loading
// over the Cloudflare tunnel on mobile Chrome; `vite build` collapses that to a
// handful of requests. The results/progress JSONL collector is registered on
// the *preview* server here (the dev config only registers it on the dev
// server). COI/WASM middleware is intentionally omitted — the GPU bench needs
// neither SharedArrayBuffer nor the threaded WASM.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsRoot = path.resolve(__dirname, "../..");

function resultsCollector(): PluginOption {
  const resultsFile =
    process.env.MSM_WEBGPU_RESULTS_FILE ?? "/tmp/msm-webgpu-results.jsonl";
  const progressFile =
    process.env.MSM_WEBGPU_PROGRESS_FILE ?? "/tmp/msm-webgpu-progress.jsonl";
  for (const f of [resultsFile, progressFile]) {
    mkdirSync(path.dirname(f), { recursive: true });
  }
  function readBody(req: import("node:http").IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let buf = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        buf += chunk;
        if (buf.length > 8 * 1024 * 1024) reject(new Error("payload too large (>8MB)"));
      });
      req.on("end", () => resolve(buf));
      req.on("error", reject);
    });
  }
  const attach = (server: { middlewares: import("connect").Server }) => {
    server.middlewares.use(async (req, res, next) => {
      if (req.method === "OPTIONS" && (req.url === "/results" || req.url === "/progress")) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.statusCode = 204;
        res.end();
        return;
      }
      if (req.method !== "POST") {
        next();
        return;
      }
      const targetFile =
        req.url === "/results" ? resultsFile : req.url === "/progress" ? progressFile : null;
      if (!targetFile) {
        next();
        return;
      }
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body);
        const row = { ts: new Date().toISOString(), ...parsed };
        appendFileSync(targetFile, JSON.stringify(row) + "\n");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: (e as Error).message }));
      }
    });
  };
  return {
    name: "msm-webgpu-results-collector-preview",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

export default defineConfig({
  root: tsRoot,
  plugins: [resultsCollector()],
  resolve: {
    alias: [{ find: /^(.*)\/node\/(.*)$/, replacement: "$1/browser/$2" }],
  },
  // bb.js's WASM backend imports `barretenberg.wasm.gz` as a module specifier;
  // the GPU bench never touches that path, but it is in the transitive graph, so
  // treat the gzipped wasm as a static asset rather than JS to keep the build
  // from trying to parse it.
  assetsInclude: ["**/*.wasm.gz"],
  worker: { format: "es" },
  build: {
    target: "esnext",
    outDir: path.resolve(tsRoot, "dev/msm-webgpu/dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(tsRoot, "dev/msm-webgpu/index.html"),
    },
  },
  preview: {
    allowedHosts: [".trycloudflare.com", "127.0.0.1", "localhost"],
  },
});
