// Shared plumbing for the sumcheck-webgpu test dashboard: the scalar-field
// shader manager, Montgomery <-> canonical conversion, byte packing, a
// deterministic RNG, a small polynomial reference, and the Suite contract each
// test page registers. One device is created by main.ts and threaded to every
// suite via SuiteCtx.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { BN254_SCALAR_FIELD } from '../../src/msm_webgpu/cuzk/bn254.js';
import {
  create_and_write_sb,
  create_and_write_ub,
  create_bind_group_layout,
  create_bind_group,
  create_compute_pipeline,
  execute_pipeline,
  read_from_gpu,
} from '../../src/msm_webgpu/cuzk/gpu.js';

export const P = BN254_SCALAR_FIELD;
export const WG = 64; // workgroup size used by every test kernel

export const mod = (x: bigint): bigint => ((x % P) + P) % P;
export const modinv = (a: bigint, m = P): bigint => {
  let [or, r] = [mod(a), m];
  let [os, s] = [1n, 0n];
  while (r) {
    const q = or / r;
    [or, r] = [r, or - q * r];
    [os, s] = [s, os - q * s];
  }
  return mod(os);
};

// The scalar-field (F_r) shader manager. `sm.r` / `sm.rinv` are the Montgomery
// radix (2^260 mod p) and its inverse — the host's toMont / fromMont scalars.
export const sm = new ShaderManager(4, 1 << 8, BN254_CURVE_CONFIG, false, 'scalar');
export const R = sm.r;
export const RINV = sm.rinv;
export const toMont = (x: bigint): bigint => (mod(x) * R) % P;
export const fromMont = (y: bigint): bigint => (y * RINV) % P;

export function biToLe32(v: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = v;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}
export function le32ToBi(bytes: Uint8Array, off: number): bigint {
  let v = 0n;
  for (let i = 31; i >= 0; i--) v = (v << 8n) | BigInt(bytes[off + i]);
  return v;
}

// The all-0xff output sentinel (see dispatchRelation): a slot still holding this
// after a dispatch was never written by the kernel.
export const UNWRITTEN = (1n << 256n) - 1n;

// Deterministic 254-bit LCG; each suite takes its own stream so failing runs
// are reproducible and suites don't perturb each other's inputs.
export function makeRng(seed: bigint): () => bigint {
  let s = seed & ((1n << 256n) - 1n);
  return () => {
    s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n);
    return mod(s >> 2n);
  };
}

// ---- polynomial reference (coefficient arrays, mod P) — the relation goldens ----
export type Poly = bigint[];
export const pMul = (a: Poly, b: Poly): Poly => {
  const r: Poly = Array(a.length + b.length - 1).fill(0n);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] = mod(r[i + j] + a[i] * b[j]);
  return r;
};
export const pAdd = (a: Poly, b: Poly): Poly =>
  Array.from({ length: Math.max(a.length, b.length) }, (_, i) => mod((a[i] ?? 0n) + (b[i] ?? 0n)));
export const pSub = (a: Poly, b: Poly): Poly =>
  Array.from({ length: Math.max(a.length, b.length) }, (_, i) => mod((a[i] ?? 0n) - (b[i] ?? 0n)));
export const pScale = (a: Poly, s: bigint): Poly => a.map(x => mod(x * s));
export const pAddC = (a: Poly, s: bigint): Poly => {
  const r = a.slice();
  r[0] = mod((r[0] ?? 0n) + s);
  return r;
};
export const pSubC = (a: Poly, s: bigint): Poly => pAddC(a, mod(-s));
export const pNeg = (a: Poly): Poly => a.map(x => mod(-x));
export const edgePoly = (v0: bigint, v1: bigint): Poly => [mod(v0), mod(v1 - v0)];
export const evalSet = (a: Poly, L: number): bigint[] =>
  Array.from({ length: L }, (_, k) => {
    let acc = 0n;
    let xp = 1n;
    for (const c of a) {
      acc = mod(acc + c * xp);
      xp = mod(xp * BigInt(k));
    }
    return acc;
  });

export type Level = 'info' | 'ok' | 'err' | 'warn' | 'muted';
export type Logger = (level: Level, msg: string) => void;

// ---- relation-kernel dispatch + diff (shared by every relation suite) ----

// Run a single-entry relation kernel: one read-only input SB, one storage output
// SB (n*outLen Fr), one Params{n} uniform; one thread per edge. When `relParams`
// is given (the relation_parameters, e.g. beta/gamma — Montgomery 8x u32, one
// per Fr) it is bound at @group(0) @binding(3) as a read-only SB. Returns the raw
// output bytes and the GPU compute+readback time.
export async function dispatchRelation(
  device: GPUDevice,
  n: number,
  code: string,
  entry: string,
  inBytes: Uint8Array,
  outLen: number,
  relParams?: Uint8Array,
): Promise<{ bytes: Uint8Array; ms: number }> {
  // Guard against IN_LEN/OUT_LEN drift: each kernel compiles its own consts while
  // the suite passes its own copies, and a mismatch would silently misalign the
  // input/output strides instead of failing cleanly.
  const outConst = /const\s+OUT_LEN\s*:\s*u32\s*=\s*(\d+)u/.exec(code);
  if (outConst && Number(outConst[1]) !== outLen) {
    throw new Error(`OUT_LEN mismatch: kernel ${outConst[1]} vs suite ${outLen}`);
  }
  const inConst = /const\s+IN_LEN\s*:\s*u32\s*=\s*(\d+)u/.exec(code);
  if (inConst && inBytes.length !== n * Number(inConst[1]) * 32) {
    throw new Error(`IN_LEN mismatch: kernel ${inConst[1]} expects ${n * Number(inConst[1]) * 32} input bytes, got ${inBytes.length}`);
  }

  const types = ['read-only-storage', 'storage', 'uniform'];
  if (relParams) types.push('read-only-storage');
  const layout = create_bind_group_layout(device, types);
  const inBuf = create_and_write_sb(device, inBytes);
  // Pre-fill the output with a sentinel (0xff bytes = 2^256-1, larger than any
  // Montgomery field value a kernel can write) so a row the kernel fails to write
  // reads back as detectably "unwritten" rather than as a valid 0 — which would
  // otherwise mask a skipped write on the rows whose reference is zero.
  const outBuf = create_and_write_sb(device, new Uint8Array(n * outLen * 32).fill(0xff));
  const params = new Uint8Array(16);
  new DataView(params.buffer).setUint32(0, n, true);
  const bufs = [inBuf, outBuf, create_and_write_ub(device, params)];
  if (relParams) bufs.push(create_and_write_sb(device, relParams));
  const bg = create_bind_group(device, layout, bufs);
  const pipeline = await create_compute_pipeline(device, [layout], code, entry, entry);
  const t0 = performance.now();
  const enc = device.createCommandEncoder();
  await execute_pipeline(enc, pipeline, bg, Math.ceil(n / WG));
  const [bytes] = await read_from_gpu(device, enc, [outBuf]);
  return { bytes, ms: performance.now() - t0 };
}

// Pack a list of canonical Fr params into a Montgomery 8x u32 buffer for the
// binding(3) relation-parameters SB.
export function packParams(vals: bigint[]): Uint8Array {
  const out = new Uint8Array(vals.length * 32);
  vals.forEach((v, i) => out.set(biToLe32(toMont(v)), i * 32));
  return out;
}

export interface EdgeRow {
  e: bigint[][]; // numEdges entity edges, each [v0, v1]
  s: bigint; // scaling factor
}

// Pack n rows of (numEdges edges {v0,v1} + 1 scaling scalar) into a Montgomery
// 8x u32 input buffer of stride inLen Fr: edge j at slots 2j/2j+1, scaling last.
export function packEdgeRows(
  n: number,
  inLen: number,
  numEdges: number,
  build: (i: number) => EdgeRow,
): { inBytes: Uint8Array; inputs: EdgeRow[] } {
  const inBytes = new Uint8Array(n * inLen * 32);
  const inputs: EdgeRow[] = [];
  for (let i = 0; i < n; i++) {
    const row = build(i);
    inputs.push(row);
    for (let j = 0; j < numEdges; j++) {
      inBytes.set(biToLe32(toMont(row.e[j][0])), (i * inLen + 2 * j) * 32);
      inBytes.set(biToLe32(toMont(row.e[j][1])), (i * inLen + 2 * j + 1) * 32);
    }
    inBytes.set(biToLe32(toMont(row.s)), (i * inLen + numEdges * 2) * 32);
  }
  return { inBytes, inputs };
}

// Diff a relation kernel's output (Montgomery, 8x u32) against a per-row Fr
// reference. `ref(i)` returns the outLen expected canonical Fr for edge i.
export function diffRelation(
  bytes: Uint8Array,
  n: number,
  outLen: number,
  ref: (i: number) => bigint[],
  log: Logger,
  label: string,
  ms: number,
): boolean {
  let mism = 0;
  let first = '';
  for (let i = 0; i < n; i++) {
    const want = ref(i);
    for (let k = 0; k < outLen; k++) {
      const raw = le32ToBi(bytes, (i * outLen + k) * 32);
      const got = raw === UNWRITTEN ? null : fromMont(raw);
      if (got !== want[k]) {
        mism++;
        if (mism <= 4) first += `\n    i=${i} k=${k} got=${got === null ? '(unwritten)' : got} want=${want[k]}`;
      }
    }
  }
  if (mism === 0) {
    log('ok', `  ${label.padEnd(12)} ✓  ${n}×${outLen} match  (${ms.toFixed(1)} ms)`);
    return true;
  }
  log('err', `  ${label.padEnd(12)} ✗  ${mism}/${n * outLen} MISMATCH${first}`);
  return false;
}
export interface SuiteCtx {
  device: GPUDevice;
  n: number;
  log: Logger;
}
export interface Suite {
  id: string; // url-safe id, e.g. 'fr' | 'mono' | 'arith'
  label: string; // button text
  /** Run the suite; return true iff every check passed. */
  run: (ctx: SuiteCtx) => Promise<boolean>;
}
