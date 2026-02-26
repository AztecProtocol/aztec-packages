#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * Docker API Proxy — filtering proxy for container-in-container Docker access.
 *
 * Raw TCP proxy that parses HTTP requests, checks against an allowlist, and
 * forwards to the real Docker socket. Tracks containers created through this
 * proxy and restricts sensitive operations to owned containers only.
 *
 * Security layers:
 * 1. Route allowlist — only Docker API endpoints needed for docker_isolate + exec
 * 2. Container create validation — no privileged, restricted mounts, no host network
 * 3. Container ownership tracking — exec/logs/inspect only on containers created here
 * 4. PidMode:"host" silently stripped
 * 5. Optional image allowlist via ALLOWED_IMAGES env var
 * 6. Connection: close injection for per-request filtering
 *
 * Started by the sidecar. Shares /workspace volume with Claude's container.
 */

import { createServer as netCreateServer, connect as netConnect, Socket } from "net";
import { unlinkSync, existsSync, chmodSync, realpathSync } from "fs";
import { resolve as pathResolve } from "path";

const REAL_DOCKER_SOCK = "/var/run/docker.sock";
const PROXY_SOCK = process.env.DOCKER_PROXY_SOCK || "/workspace/docker.sock";

// Bind-mount source paths allowed inside created containers.
// Configurable via env var for different deployment contexts.
const ALLOWED_MOUNT_PREFIXES = (process.env.ALLOWED_MOUNT_PREFIXES || "/workspace,/tmp")
  .split(",").map(s => s.trim()).filter(Boolean);

// Optional image allowlist — comma-separated prefixes. Empty = allow all.
// Example: ALLOWED_IMAGES=aztecprotocol/build,aztecprotocol/devbox
const IMAGE_ALLOWLIST = (process.env.ALLOWED_IMAGES || "")
  .split(",").map(s => s.trim()).filter(Boolean);

// ── Container ownership tracking ─────────────────────────────────
// Sensitive operations (exec, logs, inspect, start, attach) are only allowed
// on containers created through this proxy session. This prevents Claude from
// exec-ing into the sidecar or other session containers.
//
// Cleanup operations (stop, kill, delete, wait) are allowed on any container
// to support docker_isolate's pre-run cleanup of stale containers.

const ownedContainerIds = new Set<string>();
const ownedContainerNames = new Set<string>();

function extractContainerCid(url: string): string | null {
  const m = url.match(/\/containers\/([a-zA-Z0-9_.-]+)/);
  if (m && m[1] !== "create" && m[1] !== "json") return m[1];
  return null;
}

function extractNameFromUrl(url: string): string | null {
  const m = url.match(/[?&]name=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function isOwnedContainer(cid: string): boolean {
  if (ownedContainerIds.has(cid)) return true;
  if (ownedContainerNames.has(cid)) return true;
  // Support shortened hex IDs (Docker allows unique prefix matching)
  if (/^[a-f0-9]+$/.test(cid) && cid.length >= 6) {
    for (const id of ownedContainerIds) {
      if (id.startsWith(cid)) return true;
    }
  }
  return false;
}

function trackCreatedContainer(responseBuf: Buffer, requestUrl: string): void {
  try {
    const str = responseBuf.toString("utf-8");
    // Only track on successful creation (HTTP 201)
    if (!str.startsWith("HTTP/1.1 201")) return;

    const bodyStart = str.indexOf("\r\n\r\n");
    if (bodyStart === -1) return;
    const body = str.slice(bodyStart + 4).trim();
    const parsed = JSON.parse(body);
    if (parsed.Id) {
      ownedContainerIds.add(parsed.Id);
      console.log(`[docker-proxy] Tracked container: ${parsed.Id.slice(0, 12)}`);
    }
  } catch {}

  // Also track by name from URL query param
  const name = extractNameFromUrl(requestUrl);
  if (name) {
    ownedContainerNames.add(name);
  }
}

// ── Mount validation ─────────────────────────────────────────────

/**
 * Validate a bind mount source path. Returns an error string or null if OK.
 *
 * 1. Normalize the path (resolve ./ ../ to prevent traversal like /tmp/../etc)
 * 2. Check the normalized path starts with an allowed prefix
 * 3. For paths we can access (sidecar has /workspace mounted), resolve symlinks
 *    and re-check — blocks symlink escape like: ln -s /etc /workspace/etc-link
 */
function validateMountSource(src: string): string | null {
  // Normalize: resolve . and .. components
  const normalized = pathResolve("/", src);
  if (!ALLOWED_MOUNT_PREFIXES.some(p => normalized.startsWith(p + "/") || normalized === p)) {
    return `mount source '${src}' resolves to '${normalized}' which is outside allowed prefixes (${ALLOWED_MOUNT_PREFIXES.join(", ")})`;
  }

  // Symlink check: resolve the real path and re-check.
  // The proxy runs in the sidecar which shares the /workspace mount with Claude's container.
  // This catches: ln -s /etc /workspace/escape && docker run -v /workspace/escape:/mnt ...
  try {
    const real = realpathSync(normalized);
    if (real !== normalized && !ALLOWED_MOUNT_PREFIXES.some(p => real.startsWith(p + "/") || real === p)) {
      return `mount source '${src}' is a symlink resolving to '${real}' which is outside allowed prefixes`;
    }
  } catch {
    // Path doesn't exist on this filesystem — can't resolve symlinks.
    // Docker will handle the error if the path doesn't exist on the host.
  }

  return null;
}

// ── Container create validation ──────────────────────────────────

function validateCreateBody(body: string): { ok: boolean; reason?: string; rewritten?: string } {
  let parsed: any;
  try { parsed = JSON.parse(body); } catch { return { ok: true }; }

  // Image allowlist
  if (IMAGE_ALLOWLIST.length > 0 && parsed.Image) {
    if (!IMAGE_ALLOWLIST.some((prefix: string) => parsed.Image.startsWith(prefix))) {
      return { ok: false, reason: `image '${parsed.Image}' not in allowlist` };
    }
  }

  const hc = parsed.HostConfig || {};
  if (hc.Privileged) return { ok: false, reason: "privileged containers not allowed" };

  const dangerousCaps = ["SYS_ADMIN", "SYS_PTRACE", "NET_ADMIN", "SYS_RAWIO", "DAC_OVERRIDE"];
  for (const cap of (hc.CapAdd || []))
    if (dangerousCaps.includes(cap.toUpperCase()))
      return { ok: false, reason: `capability ${cap} not allowed` };

  if (hc.NetworkMode === "host") return { ok: false, reason: "host network not allowed" };

  // Block host device access
  if (hc.Devices && hc.Devices.length > 0)
    return { ok: false, reason: "device mappings not allowed" };

  // Block inheriting volumes from other containers (could access sidecar's /var/run/docker.sock)
  if (hc.VolumesFrom && hc.VolumesFrom.length > 0)
    return { ok: false, reason: "VolumesFrom not allowed" };

  // Block dangerous namespace sharing
  if (hc.IpcMode === "host") return { ok: false, reason: "host IPC mode not allowed" };
  if (hc.UTSMode === "host") return { ok: false, reason: "host UTS mode not allowed" };

  // Validate bind mounts — normalize paths to prevent traversal, resolve symlinks.
  // Named volumes (sources not starting with /) are managed by Docker and safe to allow.
  const mountCheck = validateMountSource;
  for (const bind of (hc.Binds || [])) {
    const src = bind.split(":")[0];
    if (src.startsWith("/")) {
      const err = mountCheck(src);
      if (err) return { ok: false, reason: err };
    }
    // Non-absolute paths are named volumes (e.g., "myvolume:/data") — safe
  }
  for (const m of (parsed.Mounts || []))
    if (m.Type === "bind" && m.Source) {
      const err = mountCheck(m.Source);
      if (err) return { ok: false, reason: err };
    }
    // type=volume mounts use Docker-managed volumes — safe

  // Silently strip host PID namespace — spawned containers run on the real Docker
  // daemon, so --pid=host would expose ALL host processes. docker_isolate uses it
  // for unique PIDs but works fine without it.
  let modified = false;
  if (hc.PidMode === "host") { delete hc.PidMode; modified = true; }

  return { ok: true, rewritten: modified ? JSON.stringify(parsed) : undefined };
}

// ── Route allowlist ──────────────────────────────────────────────
interface Route {
  method: string;
  pattern: RegExp;
  needsBody?: boolean;
  /** Sensitive op — only allowed on containers created through this proxy. */
  needsOwnership?: boolean;
  /** Container create — intercept response to track the new container ID. */
  trackCreate?: boolean;
  /** Return a fake success without forwarding to Docker. */
  fakeOk?: boolean;
  /** Streaming request/response — manual forwarding with Connection: close.
   *  Used for docker build (tar body in, chunked JSON out) and docker pull/load/save. */
  rawPipe?: boolean;
  /** Long-lived stream — bidirectional pipe, NO Connection: close.
   *  Used for events and other long-poll endpoints. */
  rawStream?: boolean;
}

const CID = "[a-zA-Z0-9_.-]+";

const ROUTES: Route[] = [
  // System — health, version, info (compose needs /info for daemon capabilities)
  { method: "GET", pattern: /^\/_ping/ },
  { method: "HEAD", pattern: /^\/_ping/ },
  { method: "GET", pattern: /^\/version/ },
  { method: "GET", pattern: /^\/info/ },
  { method: "GET", pattern: /^\/v[\d.]+\/_ping/ },
  { method: "HEAD", pattern: /^\/v[\d.]+\/_ping/ },
  { method: "GET", pattern: /^\/v[\d.]+\/version/ },
  { method: "GET", pattern: /^\/v[\d.]+\/info/ },

  // Container create — validate body, track response
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/create`), needsBody: true, trackCreate: true },

  // Sensitive container operations — need ownership
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/start`), needsOwnership: true },
  { method: "GET", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/logs`), needsOwnership: true },
  { method: "GET", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/json`), needsOwnership: true },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/attach`), needsOwnership: true },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/exec`), needsOwnership: true },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/resize`), needsOwnership: true },

  // Cleanup operations — allowed on any container (docker_isolate pre-run cleanup)
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/stop`) },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/wait`) },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/kill`) },
  { method: "DELETE", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}`) },

  // Exec operations — exec ID (not container ID); ownership checked at exec create
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/exec/${CID}/start`) },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/exec/${CID}/resize`) },
  { method: "GET", pattern: new RegExp(`^(/v[\\d.]+)?/exec/${CID}/json`) },

  // Image operations — pull/load/save are streaming, need rawPipe
  { method: "POST", pattern: /^(\/v[\d.]+)?\/images\/create/, rawPipe: true },  // docker pull
  { method: "POST", pattern: /^(\/v[\d.]+)?\/images\/load/, rawPipe: true },    // docker load
  { method: "GET", pattern: /^(\/v[\d.]+)?\/images\/json/ },           // docker image ls
  { method: "GET", pattern: /^(\/v[\d.]+)?\/images\/.+\/json/ },       // docker image inspect
  { method: "GET", pattern: /^(\/v[\d.]+)?\/images\/.+\/get/, rawPipe: true },  // docker save
  { method: "POST", pattern: /^(\/v[\d.]+)?\/images\/.+\/tag/ },       // docker tag
  { method: "DELETE", pattern: /^(\/v[\d.]+)?\/images\/.+/ },          // docker rmi

  // Build — streaming tar body in, chunked JSON out; needs rawPipe
  { method: "POST", pattern: /^(\/v[\d.]+)?\/build/, rawPipe: true },  // docker build

  // Auth + push — no-op (login succeeds silently, push is blocked)
  { method: "POST", pattern: /^(\/v[\d.]+)?\/auth/, fakeOk: true },    // docker login
  { method: "POST", pattern: /^(\/v[\d.]+)?\/images\/.+\/push/, fakeOk: true }, // docker push (no-op)

  // List containers (read-only, ownership not applicable)
  { method: "GET", pattern: /^(\/v[\d.]+)?\/containers\/json/ },

  // Network operations (needed for docker-compose)
  // Note: ($|\?) allows query params which compose uses heavily for filtering
  { method: "GET", pattern: /^(\/v[\d.]+)?\/networks($|\?)/ },
  { method: "GET", pattern: /^(\/v[\d.]+)?\/networks\/[a-zA-Z0-9_.-]+($|\?)/ },
  { method: "POST", pattern: /^(\/v[\d.]+)?\/networks\/create/ },
  { method: "DELETE", pattern: /^(\/v[\d.]+)?\/networks\/[a-zA-Z0-9_.-]+($|\?)/ },
  { method: "POST", pattern: /^(\/v[\d.]+)?\/networks\/[a-zA-Z0-9_.-]+\/connect/ },
  { method: "POST", pattern: /^(\/v[\d.]+)?\/networks\/[a-zA-Z0-9_.-]+\/disconnect/ },
  { method: "POST", pattern: /^(\/v[\d.]+)?\/networks\/prune/ },

  // Volume operations (needed for docker-compose)
  { method: "GET", pattern: /^(\/v[\d.]+)?\/volumes($|\?)/ },
  { method: "GET", pattern: /^(\/v[\d.]+)?\/volumes\/[a-zA-Z0-9_.-]+($|\?)/ },
  { method: "POST", pattern: /^(\/v[\d.]+)?\/volumes\/create/ },
  { method: "DELETE", pattern: /^(\/v[\d.]+)?\/volumes\/[a-zA-Z0-9_.-]+($|\?)/ },

  // Events — long-lived streaming connection, compose watches container lifecycle.
  // Uses rawStream (like upgrade): bidirectional pipe, NO Connection: close.
  { method: "GET", pattern: /^(\/v[\d.]+)?\/events/, rawStream: true },

  // Distribution (image manifest inspection, used by compose)
  { method: "GET", pattern: /^(\/v[\d.]+)?\/distribution\/.+\/json/ },
];

function findRoute(method: string, url: string): Route | null {
  for (const route of ROUTES)
    if (route.method === method && route.pattern.test(url)) return route;
  return null;
}

// ── HTTP parsing ─────────────────────────────────────────────────

interface ParsedRequest {
  method: string;
  url: string;
  headers: Map<string, string>;
  headerEndIndex: number;
  contentLength: number;
  isChunked: boolean;
  isUpgrade: boolean;
}

function parseHttpHead(buf: Buffer): ParsedRequest | null {
  const headerEnd = buf.indexOf("\r\n\r\n");
  if (headerEnd === -1) return null;

  const headStr = buf.subarray(0, headerEnd).toString("utf-8");
  const lines = headStr.split("\r\n");
  const [method, url] = (lines[0] || "").split(" ");
  if (!method || !url) return null;

  const headers = new Map<string, string>();
  for (let i = 1; i < lines.length; i++) {
    const ci = lines[i].indexOf(":");
    if (ci > 0) headers.set(lines[i].substring(0, ci).toLowerCase().trim(), lines[i].substring(ci + 1).trim());
  }

  const te = headers.get("transfer-encoding") || "";
  const isChunked = te.toLowerCase().includes("chunked");
  const contentLength = isChunked ? -1 : (parseInt(headers.get("content-length") || "0", 10) || 0);
  const isUpgrade = (headers.get("connection") || "").toLowerCase().includes("upgrade");

  return { method: method.toUpperCase(), url, headers, headerEndIndex: headerEnd + 4, contentLength, isChunked, isUpgrade };
}

function decodeChunkedBody(buf: Buffer, offset: number): string | null {
  let pos = offset;
  let result = "";
  while (pos < buf.length) {
    const lineEnd = buf.indexOf("\r\n", pos);
    if (lineEnd === -1) return null;
    const chunkSize = parseInt(buf.subarray(pos, lineEnd).toString("utf-8").trim(), 16);
    if (isNaN(chunkSize)) return null;
    if (chunkSize === 0) return result;
    pos = lineEnd + 2;
    if (pos + chunkSize > buf.length) return null;
    result += buf.subarray(pos, pos + chunkSize).toString("utf-8");
    pos += chunkSize + 2;
  }
  return null;
}

function denyRaw(client: Socket, status: number, reason: string) {
  console.error(`[DENY] ${reason}`);
  const body = JSON.stringify({ message: reason });
  client.end(`HTTP/1.1 ${status} Forbidden\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
}

/** Inject "Connection: close" into the raw HTTP request to prevent keep-alive. */
function injectConnectionClose(buf: Buffer, headerEndIndex: number): Buffer {
  // headerEndIndex points to the first byte AFTER \r\n\r\n
  const headStr = buf.subarray(0, headerEndIndex - 4).toString("utf-8"); // headers only (before \r\n\r\n)
  const body = buf.subarray(headerEndIndex);
  const lines = headStr.split("\r\n").filter(l => l.length > 0);
  // Replace existing Connection header or add one
  let replaced = false;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].toLowerCase().startsWith("connection:")) {
      lines[i] = "Connection: close";
      replaced = true;
      break;
    }
  }
  if (!replaced) lines.push("Connection: close");
  const newHead = lines.join("\r\n") + "\r\n\r\n";
  return Buffer.concat([Buffer.from(newHead), body]);
}

// ── Connection handler ───────────────────────────────────────────
function handleConnection(client: Socket) {
  let buf = Buffer.alloc(0);
  let forwarded = false;

  client.on("close", () => {
    if (!forwarded) {
      // Client closed before we could forward — log it
      const partial = buf.subarray(0, Math.min(buf.length, 200)).toString("utf-8").split("\r\n")[0];
      if (buf.length > 0) console.error(`[docker-proxy] client closed before forward (${buf.length}b): ${partial}`);
    }
  });

  const onData = (chunk: Buffer) => {
    if (forwarded) return;
    buf = Buffer.concat([buf, chunk]);

    const req = parseHttpHead(buf);
    if (!req) {
      // Headers not yet complete — enforce size limit while buffering
      if (buf.length > 2 * 1024 * 1024) {
        denyRaw(client, 413, "request too large");
      }
      return;
    }

    const route = findRoute(req.method, req.url);
    if (!route) {
      denyRaw(client, 403, `blocked: ${req.method} ${req.url}`);
      return;
    }

    // Body filtering for container create
    if (route.needsBody) {
      let bodyStr: string | null = null;
      if (req.isChunked) {
        bodyStr = decodeChunkedBody(buf, req.headerEndIndex);
        if (bodyStr === null) return; // need more data
      } else if (req.contentLength > 0) {
        const totalNeeded = req.headerEndIndex + req.contentLength;
        if (buf.length < totalNeeded) return;
        bodyStr = buf.subarray(req.headerEndIndex, totalNeeded).toString("utf-8");
      }
      if (bodyStr) {
        const validation = validateCreateBody(bodyStr);
        if (!validation.ok) {
          denyRaw(client, 403, `blocked container create: ${validation.reason}`);
          return;
        }
        // If the validator rewrote the body (e.g. stripped PidMode), rebuild the raw buffer
        if (validation.rewritten) {
          const newBody = Buffer.from(validation.rewritten);
          const head = buf.subarray(0, req.headerEndIndex);
          // Update Content-Length in headers
          const headStr = head.toString("utf-8").replace(
            /content-length:\s*\d+/i, `Content-Length: ${newBody.length}`
          );
          buf = Buffer.concat([Buffer.from(headStr), newBody]);
        }
      }
    }

    // Image pull restriction
    if (IMAGE_ALLOWLIST.length > 0 && /\/images\/create/.test(req.url)) {
      const fromImageMatch = req.url.match(/[?&]fromImage=([^&]+)/);
      if (fromImageMatch) {
        const image = decodeURIComponent(fromImageMatch[1]);
        if (!IMAGE_ALLOWLIST.some(prefix => image.startsWith(prefix))) {
          denyRaw(client, 403, `image pull blocked: '${image}' not in allowlist`);
          return;
        }
      }
    }

    // Ownership check for sensitive operations
    if (route.needsOwnership) {
      const cid = extractContainerCid(req.url);
      if (cid && !isOwnedContainer(cid)) {
        denyRaw(client, 403, `container '${cid}' not owned by this proxy session`);
        return;
      }
    }

    // Allowed — forward to Docker
    forwarded = true;
    client.removeListener("data", onData);

    // Fake success — return 200 without forwarding (used for login, push no-ops)
    if (route.fakeOk) {
      const body = JSON.stringify({ Status: "Login Succeeded" });
      client.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
      console.log(`[docker-proxy] fakeOk: ${req.method} ${req.url}`);
      return;
    }

    if (route.trackCreate) {
      // Container create: intercept response to track the new container ID.
      // Forward in real-time AND buffer to extract the ID after completion.
      const modifiedBuf = injectConnectionClose(buf, req.headerEndIndex);
      const docker = netConnect(REAL_DOCKER_SOCK, () => {
        docker.write(modifiedBuf);
      });
      client.on("data", (c: Buffer) => { if (!docker.destroyed) docker.write(c); });
      let respBuf = Buffer.alloc(0);
      docker.on("data", (c: Buffer) => {
        if (!client.destroyed) client.write(c);
        respBuf = Buffer.concat([respBuf, c]);
      });
      docker.on("end", () => {
        if (!client.destroyed) client.end();
        trackCreatedContainer(respBuf, req.url);
      });
      docker.on("error", (err) => { if (!client.destroyed) denyRaw(client, 502, `proxy error: ${err.message}`); });
      client.on("error", () => docker.destroy());
      client.on("close", () => { if (!docker.destroyed) docker.destroy(); });
    } else if (req.isUpgrade || route.rawStream) {
      // Upgrade (attach/exec) or long-lived stream (events):
      // permanent bidirectional pipe, no Connection: close.
      const docker = netConnect({ path: REAL_DOCKER_SOCK, allowHalfOpen: true }, () => {
        docker.write(buf);
        client.pipe(docker);
        docker.pipe(client);
      });
      docker.on("error", (err) => { if (!client.destroyed) denyRaw(client, 502, `proxy error: ${err.message}`); });
      client.on("error", () => docker.destroy());
      docker.on("error", () => client.destroy());
    } else if (route.rawPipe) {
      // Streaming ops (build/pull/load/save): manual event-based forwarding
      // with Connection: close. Must inject Connection: close so Docker closes
      // the connection after the response — without it, Docker keeps the
      // connection alive and subsequent requests bypass proxy filtering.
      //
      // Uses manual event handlers (not pipe()) and buffers client data that
      // arrives before the Docker socket connects to prevent out-of-order writes.
      const modifiedBuf = injectConnectionClose(buf, req.headerEndIndex);
      let preConnectBuf: Buffer[] = [];
      let dockerReady = false;
      client.on("data", (c: Buffer) => {
        if (!dockerReady) { preConnectBuf.push(c); return; }
        if (!docker.destroyed) docker.write(c);
      });
      const docker = netConnect(REAL_DOCKER_SOCK, () => {
        docker.write(modifiedBuf);
        for (const chunk of preConnectBuf) docker.write(chunk);
        preConnectBuf = [];
        dockerReady = true;
      });
      docker.on("data", (c: Buffer) => { if (!client.destroyed) client.write(c); });
      docker.on("end", () => { if (!client.destroyed) client.end(); });
      docker.on("error", (err) => { if (!client.destroyed) denyRaw(client, 502, `proxy error: ${err.message}`); });
      client.on("error", () => docker.destroy());
      client.on("close", () => { if (!docker.destroyed) docker.destroy(); });
    } else {
      // Normal request: inject Connection: close so the client uses a new
      // connection for each request (enabling per-request filtering).
      const modifiedBuf = injectConnectionClose(buf, req.headerEndIndex);
      const docker = netConnect(REAL_DOCKER_SOCK, () => {
        docker.write(modifiedBuf);
        client.pipe(docker);
        docker.pipe(client);
      });
      docker.on("error", (err) => { if (!client.destroyed) denyRaw(client, 502, `proxy error: ${err.message}`); });
      client.on("error", () => docker.destroy());
      docker.on("error", () => client.destroy());
    }
  };

  client.on("data", onData);
  client.on("error", () => {});
}

// ── Start server ─────────────────────────────────────────────────
if (existsSync(PROXY_SOCK)) {
  try { unlinkSync(PROXY_SOCK); } catch {}
}

const server = netCreateServer({ allowHalfOpen: true }, handleConnection);
server.listen(PROXY_SOCK, () => {
  try { chmodSync(PROXY_SOCK, 0o777); } catch {}
  console.log(`[docker-proxy] listening on ${PROXY_SOCK}`);
  console.log(`[docker-proxy] allowed mount prefixes: ${ALLOWED_MOUNT_PREFIXES.join(", ")}`);
  if (IMAGE_ALLOWLIST.length > 0) {
    console.log(`[docker-proxy] allowed images: ${IMAGE_ALLOWLIST.join(", ")}`);
  }
  console.log(`[docker-proxy] container ownership tracking: enabled`);
});

process.on("uncaughtException", (err) => {
  console.error(`[docker-proxy] UNCAUGHT: ${err.message}\n${err.stack}`);
});

process.on("SIGTERM", () => {
  server.close();
  try { unlinkSync(PROXY_SOCK); } catch {}
  process.exit(0);
});
