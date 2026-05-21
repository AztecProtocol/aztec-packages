import { createServer } from "node:http";
import { appendFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { basename, dirname, extname, join, resolve, relative, isAbsolute, sep } from "node:path";
import { pathToFileURL } from "node:url";

// Serves the webpack-built browser-test-app plus the inputs and two bb.wasm variants the paired
// A/B harness fetches at runtime. bb.js fetches CRS straight from the public CDN, so no CRS proxy
// here. COOP/COEP are required for the SharedArrayBuffer-backed threaded wasm.

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) args.set(a.slice(2), process.argv[i + 1]);
}

const host = args.get("host") ?? process.env.BENCH_HOST ?? "127.0.0.1";
const port = Number(args.get("port") ?? process.env.BENCH_PORT ?? 8080);
const distDir = resolve(args.get("dist") ?? "dest");
const wasmDir = resolve(args.get("wasm-dir") ?? "bench-wasm");
const inputsDir = resolve(
  args.get("inputs-dir") ??
    process.env.CHONK_PINNED_IVC_INPUTS_DIR ??
    "../../../yarn-project/end-to-end/example-app-ivc-inputs-out",
);
const progressJsonl = resolve(args.get("progress-jsonl") ?? "/tmp/browser-bench-progress.jsonl");
const resultJsonl = resolve(args.get("result-jsonl") ?? "/tmp/browser-bench-results.jsonl");

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".msgpack", "application/octet-stream"],
  [".wasm", "application/wasm"],
  [".gz", "application/gzip"],
]);

function setHeaders(res) {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
}

function send(res, status, body, headers = {}) {
  setHeaders(res);
  res.writeHead(status, headers);
  res.end(body);
}

function safeJoin(root, requestPath) {
  const resolved = resolve(root, `.${requestPath}`);
  const diff = relative(root, resolved);
  if (diff === "" || (diff !== ".." && !diff.startsWith(`..${sep}`) && !isAbsolute(diff))) return resolved;
  throw new Error(`path escapes root: ${requestPath}`);
}

async function serveFile(res, filePath) {
  let info;
  try {
    info = await stat(filePath);
  } catch {
    return send(res, 404, "not found");
  }
  if (!info.isFile()) return send(res, 404, "not found");
  setHeaders(res);
  res.writeHead(200, {
    "Content-Type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
    "Content-Length": String(info.size),
  });
  createReadStream(filePath).pipe(res);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function listFlows() {
  try {
    const entries = await readdir(inputsDir, { withFileTypes: true });
    const flows = [];
    for (const e of entries) {
      if (e.isDirectory()) {
        try {
          await stat(join(inputsDir, e.name, "ivc-inputs.msgpack"));
          flows.push(e.name);
        } catch {
          // flow dir without pinned inputs; skip
        }
      }
    }
    return flows.sort();
  } catch {
    return [];
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "OPTIONS") return send(res, 204, "");
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, JSON.stringify({ ok: true, distDir, wasmDir, inputsDir }), {
        "Content-Type": "application/json",
      });
    }
    if (req.method === "GET" && url.pathname === "/inputs/index.json") {
      return send(res, 200, JSON.stringify({ flows: await listFlows() }), { "Content-Type": "application/json" });
    }
    if (req.method === "GET" && url.pathname.startsWith("/inputs/") && url.pathname.endsWith("/ivc-inputs.msgpack")) {
      const flow = decodeURIComponent(url.pathname.slice("/inputs/".length, -"/ivc-inputs.msgpack".length));
      return serveFile(res, safeJoin(inputsDir, `/${flow}/ivc-inputs.msgpack`));
    }
    if (req.method === "GET" && url.pathname.startsWith("/wasm/")) {
      return serveFile(res, safeJoin(wasmDir, url.pathname.slice("/wasm".length)));
    }
    if (req.method === "POST" && url.pathname === "/progress") {
      await mkdir(dirname(progressJsonl), { recursive: true });
      await appendFile(progressJsonl, `${JSON.stringify({ receivedAt: new Date().toISOString(), ...(await readBody(req)) })}\n`);
      return send(res, 200, JSON.stringify({ ok: true }), { "Content-Type": "application/json" });
    }
    if (req.method === "POST" && url.pathname === "/result") {
      await mkdir(dirname(resultJsonl), { recursive: true });
      await appendFile(resultJsonl, `${JSON.stringify({ receivedAt: new Date().toISOString(), ...(await readBody(req)) })}\n`);
      return send(res, 200, JSON.stringify({ ok: true }), { "Content-Type": "application/json" });
    }
    if (req.method !== "GET") return send(res, 405, "method not allowed");
    return await serveFile(res, safeJoin(distDir, url.pathname === "/" ? "/index.html" : url.pathname));
  } catch (error) {
    send(res, error?.code === "ENOENT" ? 404 : 500, JSON.stringify({ ok: false, error: error?.message ?? String(error) }), {
      "Content-Type": "application/json",
    });
  }
});

server.listen(port, host, () => {
  console.log(`browser-test-app bench server: http://${host}:${port}`);
  console.log(`  dist=${distDir} wasm=${wasmDir} inputs=${inputsDir}`);
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // started directly
}
