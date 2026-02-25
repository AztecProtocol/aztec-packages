#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * Docker API Proxy — filtering proxy for container-in-container Docker access.
 *
 * Uses a raw TCP proxy approach: each incoming connection is parsed just enough
 * to extract the HTTP method + URL (and optionally the body for create requests),
 * then the entire connection is forwarded verbatim to the real Docker socket.
 * This ensures Docker's connection hijacking (for attach/exec) works perfectly.
 *
 * Allowed operations:
 *   - POST /containers/create  (body-filtered: no privileged, restricted mounts, blocked images)
 *   - POST /containers/{id}/start|stop|wait|kill|resize|attach
 *   - POST /containers/{id}/exec, POST /exec/{id}/start|resize
 *   - DELETE /containers/{id}
 *   - GET  /containers/{id}/logs|json
 *   - GET|HEAD /_ping, GET /version
 *   - POST /images/create (pull)
 *
 * Started by the sidecar. Shares /workspace volume with Claude's container.
 */

import { createServer as netCreateServer, Socket } from "net";
import { connect as netConnect } from "net";
import { unlinkSync, existsSync, chmodSync } from "fs";

const REAL_DOCKER_SOCK = "/var/run/docker.sock";
const PROXY_SOCK = process.env.DOCKER_PROXY_SOCK || "/workspace/docker.sock";

// Blocked images — prevent recursive container creation.
// All other images are allowed; security is enforced via other constraints.
const BLOCKED_IMAGES = ["claudebox"];

// Bind-mount source paths allowed inside created containers.
const ALLOWED_MOUNT_PREFIXES = ["/workspace", "/tmp"];

// ── Route allowlist ──────────────────────────────────────────────
interface Route {
  method: string;
  pattern: RegExp;
  needsBody?: boolean; // true = read full HTTP body for validation before forwarding
}

const CID = "[a-zA-Z0-9_.-]+";
const QS = "(\\\\?.*)?";

const ROUTES: Route[] = [
  // Health / version
  { method: "GET", pattern: /^\/_ping/ },
  { method: "HEAD", pattern: /^\/_ping/ },
  { method: "GET", pattern: /^\/version/ },
  { method: "GET", pattern: /^\/v[\d.]+\/_ping/ },
  { method: "HEAD", pattern: /^\/v[\d.]+\/_ping/ },
  { method: "GET", pattern: /^\/v[\d.]+\/version/ },

  // Container lifecycle
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/create`), needsBody: true },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/start`) },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/stop`) },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/wait`) },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/kill`) },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/resize`) },
  { method: "DELETE", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}`) },
  { method: "GET", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/logs`) },
  { method: "GET", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/json`) },

  // Attach (uses HTTP upgrade / connection hijack)
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/attach`) },

  // Exec
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/containers/${CID}/exec`) },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/exec/${CID}/start`), needsBody: false },
  { method: "POST", pattern: new RegExp(`^(/v[\\d.]+)?/exec/${CID}/resize`) },
  { method: "GET", pattern: new RegExp(`^(/v[\\d.]+)?/exec/${CID}/json`) },

  // Image pull
  { method: "POST", pattern: /^(\/v[\d.]+)?\/images\/create/ },

  // Container list (docker CLI uses this for cleanup with --rm)
  { method: "GET", pattern: /^(\/v[\d.]+)?\/containers\/json/ },
];

function findRoute(method: string, url: string): Route | null {
  for (const route of ROUTES) {
    if (route.method === method && route.pattern.test(url)) return route;
  }
  return null;
}

function validateCreateBody(body: string): { ok: boolean; reason?: string } {
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: true }; // let Docker handle parse errors
  }

  const hc = parsed.HostConfig || {};

  if (hc.Privileged) return { ok: false, reason: "privileged containers not allowed" };

  const dangerousCaps = ["SYS_ADMIN", "SYS_PTRACE", "NET_ADMIN", "SYS_RAWIO", "DAC_OVERRIDE"];
  for (const cap of (hc.CapAdd || [])) {
    if (dangerousCaps.includes(cap.toUpperCase()))
      return { ok: false, reason: `capability ${cap} not allowed` };
  }

  if (hc.NetworkMode === "host") return { ok: false, reason: "host network not allowed" };

  for (const bind of (hc.Binds || [])) {
    const src = bind.split(":")[0];
    if (!ALLOWED_MOUNT_PREFIXES.some(p => src.startsWith(p)))
      return { ok: false, reason: `bind mount source '${src}' not allowed (must be under ${ALLOWED_MOUNT_PREFIXES.join(" or ")})` };
  }

  for (const m of (parsed.Mounts || [])) {
    if (m.Type === "bind" && m.Source && !ALLOWED_MOUNT_PREFIXES.some(p => m.Source.startsWith(p)))
      return { ok: false, reason: `mount source '${m.Source}' not allowed` };
  }

  const image: string = parsed.Image || "";
  if (BLOCKED_IMAGES.some(prefix => image.startsWith(prefix)))
    return { ok: false, reason: `image '${image}' is blocked` };

  return { ok: true };
}

// ── HTTP request parser (minimal, for raw TCP proxy) ─────────────
// Parses method, URL, headers, and optionally the body from raw bytes.
interface ParsedRequest {
  method: string;
  url: string;
  headers: Map<string, string>;
  headerEndIndex: number; // byte offset where headers end (\r\n\r\n)
  contentLength: number;
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
    const colonIdx = lines[i].indexOf(":");
    if (colonIdx > 0) {
      headers.set(lines[i].substring(0, colonIdx).toLowerCase().trim(), lines[i].substring(colonIdx + 1).trim());
    }
  }

  const contentLength = parseInt(headers.get("content-length") || "0", 10) || 0;

  return { method: method.toUpperCase(), url, headers, headerEndIndex: headerEnd + 4, contentLength };
}

function denyRaw(client: Socket, status: number, reason: string) {
  console.error(`[DENY] ${reason}`);
  const body = JSON.stringify({ message: reason });
  client.end(
    `HTTP/1.1 ${status} Forbidden\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`
  );
}

// ── Connection handler ───────────────────────────────────────────
function handleConnection(client: Socket) {
  let buf = Buffer.alloc(0);
  let forwarded = false;

  const onData = (chunk: Buffer) => {
    if (forwarded) return; // already piped
    buf = Buffer.concat([buf, chunk]);

    // Safety: don't buffer more than 2MB
    if (buf.length > 2 * 1024 * 1024) {
      denyRaw(client, 413, "request too large");
      return;
    }

    const req = parseHttpHead(buf);
    if (!req) return; // need more data for headers

    const route = findRoute(req.method, req.url);
    if (!route) {
      denyRaw(client, 403, `blocked: ${req.method} ${req.url}`);
      return;
    }

    // For body-filtered routes, wait for the full body
    if (route.needsBody && req.contentLength > 0) {
      const totalNeeded = req.headerEndIndex + req.contentLength;
      if (buf.length < totalNeeded) return; // need more data

      const bodyStr = buf.subarray(req.headerEndIndex, totalNeeded).toString("utf-8");
      const validation = validateCreateBody(bodyStr);
      if (!validation.ok) {
        denyRaw(client, 403, `blocked container create: ${validation.reason}`);
        return;
      }
    }

    // Route is allowed — forward entire buffered data + pipe remainder to Docker
    forwarded = true;
    client.removeListener("data", onData);

    const docker = netConnect(REAL_DOCKER_SOCK, () => {
      // Send everything we've buffered so far
      docker.write(buf);
      // Pipe remainder bidirectionally
      client.pipe(docker);
      docker.pipe(client);
    });

    docker.on("error", (err) => {
      denyRaw(client, 502, `proxy error: ${err.message}`);
    });
    client.on("error", () => docker.destroy());
    docker.on("close", () => client.destroy());
    client.on("close", () => docker.destroy());
  };

  client.on("data", onData);
  client.on("error", () => {}); // prevent uncaught
}

// ── Start server ─────────────────────────────────────────────────
if (existsSync(PROXY_SOCK)) {
  try { unlinkSync(PROXY_SOCK); } catch {}
}

const server = netCreateServer(handleConnection);
server.listen(PROXY_SOCK, () => {
  try { chmodSync(PROXY_SOCK, 0o777); } catch {}
  console.log(`[docker-proxy] listening on ${PROXY_SOCK}`);
  console.log(`[docker-proxy] blocked images: ${BLOCKED_IMAGES.join(", ")}`);
  console.log(`[docker-proxy] allowed mount prefixes: ${ALLOWED_MOUNT_PREFIXES.join(", ")}`);
});

process.on("SIGTERM", () => {
  server.close();
  try { unlinkSync(PROXY_SOCK); } catch {}
  process.exit(0);
});
