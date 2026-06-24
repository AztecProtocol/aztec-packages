// Real-SRS loader for the dev page. Range-fetches compressed BN254 G1
// points from the public CRS CDN (same source bb.js uses for the
// prover), decompresses them in JS, and packs the result in the
// interleaved [x|y] LE-32 layout the convert+decompose shader expects.
//
// Caching: the final packed buffer goes into IndexedDB keyed by point
// count, so reloads after the first cold pull are instant. The cold
// pull costs roughly 64 MB download + ~5 min of JS bigint sqrts at
// numPoints = 2^21 — pay-once and then forget.

import { get, set } from 'idb-keyval';

import { gpuDecompressG1 } from './gpu_decompress.js';

// BN254 base field modulus q.
const BN254_FP = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;

// sqrt exponent: for q ≡ 3 (mod 4), √a = a^((q+1)/4). BN254's q is
// 3 mod 4 (verifiable: q & 3 === 3), so this is the standard
// closed-form square root.
const SQRT_EXP = (BN254_FP + 1n) / 4n;

const CRS_PRIMARY = 'https://crs.aztec-cdn.foundation';
const CRS_FALLBACK = 'https://crs.aztec-labs.com';

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let r = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % mod;
    e >>= 1n;
    b = (b * b) % mod;
  }
  return r;
}

function writeLe32(out: Uint8Array, offset: number, v: bigint): void {
  let x = v;
  for (let i = 0; i < 32; i++) {
    out[offset + i] = Number(x & 0xffn);
    x >>= 8n;
  }
}

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
  let response: Response;
  try {
    response = await fetchOne(CRS_PRIMARY);
  } catch {
    response = await fetchOne(CRS_FALLBACK);
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

// Compressed BN254 G1 layout (matches barretenberg's from_compressed +
// big-endian uint256 serialize): one point is 32 BE bytes where the top
// bit of byte 0 is sign-of-y and the bottom 255 bits hold x. Decompress
// to affine (x, y) over Fq.
function decompressOne(compressed: Uint8Array, off: number): { x: bigint; y: bigint } {
  const msb = compressed[off];
  const yBit = (msb >> 7) & 1;
  let x = BigInt(msb & 0x7f);
  for (let k = 1; k < 32; k++) {
    x = (x << 8n) | BigInt(compressed[off + k]);
  }
  // y² = x³ + 3 (BN254 b = 3, a = 0).
  const x2 = (x * x) % BN254_FP;
  const y2 = (x2 * x + 3n) % BN254_FP;
  let y = modPow(y2, SQRT_EXP, BN254_FP);
  if ((y & 1n) !== BigInt(yBit)) y = BN254_FP - y;
  return { x, y };
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

  let out: Uint8Array | null = null;
  const decompressT0 = performance.now();
  if (typeof navigator !== 'undefined' && (navigator as Navigator & { gpu?: GPU }).gpu) {
    onProgress({
      kind: 'info',
      msg: `[srs] decompressing ${numPoints.toLocaleString()} points on GPU…`,
    });
    try {
      out = await gpuDecompressG1(compressed, numPoints, msg => onProgress({ kind: 'info', msg }));
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
      // Cross-check the first few points against the JS reference. If
      // the shader produces wrong bytes (e.g. limb-extract off-by-one,
      // parity flip swapped) the cached SRS would silently corrupt
      // every subsequent MSM result. ~16 points × ~30 µs each is
      // unnoticeable next to the ~1s shader cost, so we always run it.
      const sampleN = Math.min(16, numPoints);
      const verifyT0 = performance.now();
      let firstBadIdx = -1;
      for (let i = 0; i < sampleN; i++) {
        const { x, y } = decompressOne(compressed, i * 32);
        const ref = new Uint8Array(64);
        writeLe32(ref, 0, x);
        writeLe32(ref, 32, y);
        const gpuSlice = out.subarray(i * 64, (i + 1) * 64);
        for (let k = 0; k < 64; k++) {
          if (gpuSlice[k] !== ref[k]) {
            firstBadIdx = i;
            break;
          }
        }
        if (firstBadIdx >= 0) break;
      }
      const verifyMs = performance.now() - verifyT0;
      if (firstBadIdx >= 0) {
        const { x, y } = decompressOne(compressed, firstBadIdx * 32);
        const dump = (slice: Uint8Array): string =>
          Array.from(slice)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        const p0 = out.subarray(firstBadIdx * 64, (firstBadIdx + 1) * 64);
        const p1 = numPoints > 1 ? out.subarray(64, 128) : new Uint8Array(64);
        onProgress({
          kind: 'info',
          msg: `[srs] GPU verify FAILED at point ${firstBadIdx} — js x=0x${x
            .toString(16)
            .slice(0, 16)}… y=0x${y.toString(16).slice(0, 16)}…`,
        });
        onProgress({
          kind: 'info',
          msg: `[srs/dbg] p${firstBadIdx} x.lo=${dump(p0.subarray(0, 8))} x.hi=${dump(
            p0.subarray(24, 32),
          )} y.lo=${dump(p0.subarray(32, 40))} y.hi=${dump(p0.subarray(56, 64))}`,
        });
        onProgress({
          kind: 'info',
          msg: `[srs/dbg] p1 x.lo=${dump(p1.subarray(0, 8))} x.hi=${dump(
            p1.subarray(24, 32),
          )} y.lo=${dump(p1.subarray(32, 40))} y.hi=${dump(p1.subarray(56, 64))}`,
        });
        out = null;
      } else {
        onProgress({
          kind: 'info',
          msg: `[srs] GPU verify OK on ${sampleN} samples in ${verifyMs.toFixed(0)}ms`,
        });
      }
    } catch (err) {
      out = null;
      onProgress({
        kind: 'info',
        msg: `[srs] GPU decompression failed (${err instanceof Error ? err.message : String(err)}); falling back to JS`,
      });
    }
  }
  if (out === null) {
    onProgress({
      kind: 'info',
      msg: `[srs] decompressing ${numPoints.toLocaleString()} points in JS (slow on first run; cached after)…`,
    });
    out = new Uint8Array(numPoints * 64);
    // Yield every 50k iters so the UI can render and the progress event
    // for that point lands before the next chunk starts. Picking too
    // small a chunk size burns measurable time in setTimeout round-trips
    // (~50 µs each); too large and the bar visibly freezes.
    const reportEvery = 50_000;
    for (let i = 0; i < numPoints; i++) {
      if (i > 0 && i % reportEvery === 0) {
        onProgress({
          kind: 'phase',
          phase: 'decompress',
          current: i,
          total: numPoints,
          unit: 'pt',
          elapsedMs: performance.now() - decompressT0,
        });
        await new Promise(r => setTimeout(r, 0));
      }
      const { x, y } = decompressOne(compressed, i * 32);
      writeLe32(out, i * 64, x);
      writeLe32(out, i * 64 + 32, y);
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
      msg: `[srs] JS decompressed in ${((performance.now() - decompressT0) / 1000).toFixed(1)}s`,
    });
  }

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
