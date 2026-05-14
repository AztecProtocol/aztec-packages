// Client-side share-link codec for the docs AI assistant widget.
//
// Wire format (versioned):
//   { v: 1, m: [{ r: "u" | "b", t: string, s?: Source[] }] }
//
// Encoding: JSON, UTF-8, gzip (CompressionStream), base64url. The encoded
// blob lives in the URL hash so it never reaches the docs origin or any
// backend; the recipient's browser decompresses it locally.

const SHARE_HASH_PREFIX = "#share=";
const MAX_ENCODED_BYTES = 32 * 1024;

function toWire(messages) {
  return {
    v: 1,
    m: messages.map((m) => {
      const wm = { r: m.role === "user" ? "u" : "b", t: m.text };
      if (m.sources && m.sources.length > 0) wm.s = m.sources;
      return wm;
    }),
  };
}

function fromWire(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.v !== 1 || !Array.isArray(payload.m)) return null;
  const out = [];
  for (const raw of payload.m) {
    if (!raw || typeof raw !== "object") return null;
    const { r, t, s } = raw;
    if ((r !== "u" && r !== "b") || typeof t !== "string") return null;
    const msg = { role: r === "u" ? "user" : "bot", text: t };
    if (Array.isArray(s)) msg.sources = s;
    out.push(msg);
  }
  return out;
}

function bytesToBase64Url(bytes) {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s) {
  const padded =
    s.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gzipBytes(bytes) {
  if (typeof CompressionStream === "undefined") {
    const out = new Uint8Array(bytes.length + 1);
    out[0] = 0x75;
    out.set(bytes, 1);
    return out;
  }
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function gunzipBytes(bytes) {
  if (bytes.length === 0) return bytes;
  if (bytes[0] === 0x75) return bytes.subarray(1);
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream not supported");
  }
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

export async function encodeShare(messages) {
  const json = JSON.stringify(toWire(messages));
  const utf8 = new TextEncoder().encode(json);
  const compressed = await gzipBytes(utf8);
  const encoded = bytesToBase64Url(compressed);
  if (encoded.length > MAX_ENCODED_BYTES) {
    throw new Error("Conversation is too long to share as a link.");
  }
  return encoded;
}

export async function decodeShare(token) {
  try {
    const bytes = base64UrlToBytes(token);
    const inflated = await gunzipBytes(bytes);
    const json = new TextDecoder("utf-8").decode(inflated);
    return fromWire(JSON.parse(json));
  } catch {
    return null;
  }
}

export function readShareHash() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash || "";
  if (!hash.startsWith(SHARE_HASH_PREFIX)) return null;
  const token = hash.slice(SHARE_HASH_PREFIX.length);
  return token.length > 0 ? token : null;
}

export function buildShareUrl(token) {
  if (typeof window === "undefined") return `${SHARE_HASH_PREFIX}${token}`;
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}${SHARE_HASH_PREFIX}${token}`;
}

export function clearShareHash() {
  if (typeof window === "undefined") return;
  const { origin, pathname, search } = window.location;
  window.history.replaceState(null, "", `${origin}${pathname}${search}`);
}

export async function copyToClipboard(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through */
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
