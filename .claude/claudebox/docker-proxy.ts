#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * Docker API Proxy — filtering proxy for container-in-container Docker access.
 *
 * Raw TCP proxy that parses HTTP requests, checks against an allowlist, and
 * forwards to the real Docker socket. Connection: close is injected for normal
 * requests so each request gets its own connection (enabling per-request filtering).
 * Upgrade requests (attach/exec) get a permanent bidirectional pipe.
 *
 * Started by the sidecar. Shares /workspace volume with Claude's container.
 */

import { createServer as netCreateServer, connect as netConnect, Socket } from "net";
import { unlinkSync, existsSync, chmodSync } from "fs";

const REAL_DOCKER_SOCK = "/var/run/docker.sock";
const PROXY_SOCK = process.env.DOCKER_PROXY_SOCK || "/workspace/docker.sock";

// All images allowed. Security enforced via other constraints (no privileged,
// restricted mounts, no host network).

// Bind-mount source paths allowed inside created containers.
const ALLOWED_MOUNT_PREFIXES = ["/workspace", "/tmp"];

// ── Validation ───────────────────────────────────────────────────

function validateCreateBody(body: string): { ok: boolean; reason?: string; rewritten?: string } {
  let parsed: any;
  try { parsed = JSON.parse(body); } catch { return { ok: true }; }

  const hc = parsed.HostConfig || {};
  if (hc.Privileged) return { ok: false, reason: "privileged containers not allowed" };

  const dangerousCaps = ["SYS_ADMIN", "SYS_PTRACE", "NET_ADMIN", "SYS_RAWIO", "DAC_OVERRIDE"];
  for (const cap of (hc.CapAdd || []))
    if (dangerousCaps.includes(cap.toUpperCase()))
      return { ok: false, reason: `capability ${cap} not allowed` };

  if (hc.NetworkMode === "host") return { ok: false, reason: "host network not allowed" };

  for (const bind of (hc.Binds || [])) {
    const src = bind.split(":")[0];
    if (!ALLOWED_MOUNT_PREFIXES.some(p => src.startsWith(p)))
      return { ok: false, reason: `bind mount source '${src}' not allowed (must be under ${ALLOWED_MOUNT_PREFIXES.join(" or ")})` };
  }
  for (const m of (parsed.Mounts || []))
    if (m.Type === "bind" && m.Source && !ALLOWED_MOUNT_PREFIXES.some(p => m.Source.startsWith(p)))
      return { ok: false, reason: `mount source '${m.Source}' not allowed` };

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
}

const CID = "[a-zA-Z0-9_.-]+";

const ROUTES: Route[] = [
  { method: "GET", pattern: /^\/_ping/ },
  { method: "HEAD", pattern: /^\/_ping/ },
  { method: "GET", pattern: /^\/version/ },
  { method: "GET", pattern: /^\/v[\d.]+\/_ping/ },
  { method: "HEAD", pattern: /^\/v[\d.]+\/_ping/ },
  { method: "GET", pattern: /^\/v[\d.]+\/version/ },

  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/create`), needsBody: true },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/start`) },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/stop`) },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/wait`) },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/kill`) },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/resize`) },
  { method: "DELETE", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}`) },
  { method: "GET", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/logs`) },
  { method: "GET", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/json`) },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/attach`) },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/exec`) },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/exec/${CID}/start`) },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/exec/${CID}/resize`) },
  { method: "GET", pattern: new RegExp(`^(/v[\\d.]+)?/exec/${CID}/json`) },
  { method: "POST", pattern: /^(\/v[\d.]+)?\/images\/create/ },
  { method: "GET", pattern: /^(\/v[\d.]+)?\/containers\/json/ },
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

  const onData = (chunk: Buffer) => {
    if (forwarded) return;
    buf = Buffer.concat([buf, chunk]);

    if (buf.length > 2 * 1024 * 1024) {
      denyRaw(client, 413, "request too large");
      return;
    }

    const req = parseHttpHead(buf);
    if (!req) return;

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

    // Allowed — forward to Docker
    forwarded = true;
    client.removeListener("data", onData);

    if (req.isUpgrade) {
      // Upgrade (attach/exec): permanent bidirectional pipe
      const docker = netConnect({ path: REAL_DOCKER_SOCK, allowHalfOpen: true }, () => {
        docker.write(buf);
        client.pipe(docker);
        docker.pipe(client);
      });
      docker.on("error", (err) => { if (!client.destroyed) denyRaw(client, 502, `proxy error: ${err.message}`); });
      client.on("error", () => docker.destroy());
      docker.on("error", () => client.destroy());
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
});

process.on("SIGTERM", () => {
  server.close();
  try { unlinkSync(PROXY_SOCK); } catch {}
  process.exit(0);
});
