// Shared plumbing for the sumcheck-webgpu test dashboard: the scalar-field
// shader manager, Montgomery <-> canonical conversion, byte packing, a
// deterministic RNG, a small polynomial reference, and the Suite contract each
// test page registers. One device is created by main.ts and threaded to every
// suite via SuiteCtx.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { BN254_SCALAR_FIELD } from '../../src/msm_webgpu/cuzk/bn254.js';

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
