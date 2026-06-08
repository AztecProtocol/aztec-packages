// Real-SRS loader for the dev page. Range-fetches compressed BN254 G1
// points from the public CRS CDN (same source bb.js uses for the
// prover), decompresses them on the GPU (gpuDecompressG1), and packs the
// result in the interleaved [x|y] LE-32 layout the convert+decompose
// shader expects.
//
// Caching: the final packed buffer goes into IndexedDB keyed by point
// count, so reloads after the first cold pull are instant. The cold pull
// costs roughly 64 MB download + a few seconds of GPU decompression at
// numPoints = 2^21 — pay-once and then forget.

import { get, set } from 'idb-keyval';

import { gpuDecompressG1 } from './gpu_decompress.js';

const CRS_PRIMARY = 'https://crs.aztec-cdn.foundation';
const CRS_FALLBACK = 'https://crs.aztec-labs.com';

// Streaming download with byte-level progress. Falls back to the
// alternate CRS host on primary failure.
async function fetchCompressed(numPoints: number, onProgress: SrsProgress): Promise<Uint8Array> {
  const totalBytes = numPoints * 32;
  const end = totalBytes - 1;
  const opts: RequestInit = {
    headers: { Range: `bytes=0-${end}` },
    cache: 'force-cache',
  };
  const fetchOne = async (host: string): Promise<Response> => {
    const r = await fetch(`${host}/g1_compressed.dat`, opts);
    if (!r.ok && r.status !== 206) {
      throw new Error(`HTTP ${r.status} from ${host}`);
    }
    return r;
  };
  // Try the SAME-ORIGIN path first ('' host → `/g1_compressed.dat`). In the
  // dev server this is served by the vite `serve-srs-proxy` middleware, which
  // Range-proxies the real CDN host-side — essential for the OFFLINE phone
  // (USB-only via adb reverse, no WAN) whose IndexedDB SRS cache is cold. The
  // proxy returns byte-identical data, so correctness/timing are unaffected.
  // Falls through to the public CDNs for online/production clients (where the
  // relative path simply 404s and we hit the real hosts).
  let response: Response;
  try {
    response = await fetchOne('');
  } catch {
    try {
      response = await fetchOne(CRS_PRIMARY);
    } catch {
      response = await fetchOne(CRS_FALLBACK);
    }
  }

  // Stream the body so we can report byte-level progress as it lands.
  // Range responses don't always set Content-Length to the slice size,
  // so fall back to the known total when the header's missing.
  const reader = response.body!.getReader();
  const out = new Uint8Array(totalBytes);
  let received = 0;
  const startedAt = performance.now();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (received + value.length > totalBytes) {
      // Some CDNs ignore the Range header and stream the full file.
      // Truncate to the requested prefix.
      out.set(value.subarray(0, totalBytes - received), received);
      received = totalBytes;
      reader.cancel().catch(() => {});
      break;
    }
    out.set(value, received);
    received += value.length;
    onProgress({
      kind: 'phase',
      phase: 'download',
      current: received,
      total: totalBytes,
      unit: 'B',
      elapsedMs: performance.now() - startedAt,
    });
  }
  if (received < totalBytes) {
    throw new Error(`SRS download truncated: ${received} < ${totalBytes}`);
  }
  return out;
}

export type SrsEvent =
  | { kind: 'info'; msg: string }
  | {
      kind: 'phase';
      phase: 'download' | 'decompress' | 'cache';
      current: number;
      total: number;
      unit?: 'B' | 'pt';
      elapsedMs: number;
    }
  | { kind: 'done' };

export type SrsProgress = (e: SrsEvent) => void;

// Returns an interleaved [x_0|y_0|x_1|y_1|…|x_{n-1}|y_{n-1}] LE-32
// buffer (n*64 bytes) for the first n SRS G1 points. Hits IndexedDB on
// reloads. Caller must hold a reference to the returned buffer to keep
// it alive — slicing for smaller N is just `buf.slice(0, n*64)`.
export async function loadSrsPoints(numPoints: number, onProgress: SrsProgress = () => {}): Promise<Uint8Array> {
  const key = `webgpu-msm-dev:srs:bn254:n=${numPoints}`;
  const cached = await get(key);
  if (cached instanceof Uint8Array && cached.length === numPoints * 64) {
    onProgress({
      kind: 'info',
      msg: `[srs] loaded ${numPoints.toLocaleString()} points from IndexedDB cache`,
    });
    onProgress({ kind: 'done' });
    return cached;
  }

  const downloadMB = (numPoints * 32) / 1024 / 1024;
  onProgress({
    kind: 'info',
    msg: `[srs] downloading compressed g1 (${downloadMB.toFixed(1)} MB)…`,
  });
  const downloadT0 = performance.now();
  const compressed = await fetchCompressed(numPoints, onProgress);
  const downloadSec = (performance.now() - downloadT0) / 1000;
  onProgress({
    kind: 'info',
    msg: `[srs] download complete: ${downloadMB.toFixed(1)} MB in ${downloadSec.toFixed(2)}s (${(downloadMB / downloadSec).toFixed(1)} MB/s)`,
  });

  // WebGPU decompression is mandatory — there is no JS fallback. The GPU
  // shader (gpuDecompressG1) is the single, validated decompression path;
  // any failure throws rather than silently substituting a slow/divergent
  // JS result.
  if (typeof navigator === 'undefined' || !(navigator as Navigator & { gpu?: GPU }).gpu) {
    throw new Error('[srs] WebGPU is required for SRS decompression (no navigator.gpu available)');
  }
  const decompressT0 = performance.now();
  onProgress({
    kind: 'info',
    msg: `[srs] decompressing ${numPoints.toLocaleString()} points on GPU…`,
  });
  // Bounded device-lost retry. With no JS fallback, a transient GPU reset
  // (e.g. an Adreno TDR under thermal/memory pressure) during the page-load
  // decompress would otherwise brick the page. gpuDecompressG1 requests and
  // destroys its own device, so each retry transparently gets a fresh one —
  // still GPU-only, just resilient to a one-off reset.
  const MAX_DECOMPRESS_ATTEMPTS = 3;
  let out: Uint8Array | null = null;
  for (let attempt = 1; attempt <= MAX_DECOMPRESS_ATTEMPTS; attempt++) {
    try {
      out = await gpuDecompressG1(compressed, numPoints, msg => onProgress({ kind: 'info', msg }));
      break;
    } catch (err) {
      const emsg = err instanceof Error ? err.message : String(err);
      const deviceLost = /device.{0,3}is lost|mapAsync|device.*destroyed/i.test(emsg);
      if (attempt < MAX_DECOMPRESS_ATTEMPTS && deviceLost) {
        onProgress({
          kind: 'info',
          msg: `[srs] GPU decompress lost the device (attempt ${attempt}/${MAX_DECOMPRESS_ATTEMPTS}: ${emsg}); re-acquiring a fresh device and retrying…`,
        });
        await new Promise(r => setTimeout(r, 400 * attempt));
        continue;
      }
      throw err;
    }
  }
  if (out === null) {
    throw new Error('[srs] GPU decompression failed after retries');
  }
  onProgress({
    kind: 'phase',
    phase: 'decompress',
    current: numPoints,
    total: numPoints,
    unit: 'pt',
    elapsedMs: performance.now() - decompressT0,
  });
  onProgress({
    kind: 'info',
    msg: `[srs] GPU decompressed ${numPoints.toLocaleString()} points in ${(
      (performance.now() - decompressT0) /
      1000
    ).toFixed(2)}s`,
  });

  onProgress({
    kind: 'info',
    msg: `[srs] caching ${(out.length / 1024 / 1024).toFixed(1)} MB to IndexedDB…`,
  });
  const cacheT0 = performance.now();
  await set(key, out);
  onProgress({
    kind: 'info',
    msg: `[srs] cache write done in ${((performance.now() - cacheT0) / 1000).toFixed(1)}s`,
  });
  onProgress({ kind: 'done' });
  return out;
}
