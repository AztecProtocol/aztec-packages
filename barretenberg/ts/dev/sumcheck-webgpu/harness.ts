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

const U64 = (1n << 64n) - 1n;
export function biToLe32(v: bigint): Uint8Array {
  const out = new Uint8Array(32);
  writeLe32(out, 0, v);
  return out;
}
// Serialize a field element as 32 little-endian bytes into `bytes` at `off` via
// four 64-bit limb writes — far cheaper than 32 single-byte bigint shifts.
export function writeLe32(bytes: Uint8Array, off: number, v: bigint): void {
  const dv = new DataView(bytes.buffer, bytes.byteOffset + off, 32);
  let x = v;
  for (let i = 0; i < 4; i++) {
    dv.setBigUint64(i * 8, x & U64, true);
    x >>= 64n;
  }
}
export function le32ToBi(bytes: Uint8Array, off: number): bigint {
  const dv = new DataView(bytes.buffer, bytes.byteOffset + off, 32);
  return (
    dv.getBigUint64(0, true) |
    (dv.getBigUint64(8, true) << 64n) |
    (dv.getBigUint64(16, true) << 128n) |
    (dv.getBigUint64(24, true) << 192n)
  );
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

// A compiled (bind-group-layout, pipeline) pair, memoized so a kernel reused
// across many dispatches (e.g. one per round in the multi-round suite) is
// compiled once rather than recompiled every call. Key by entry + binding arity.
export type PipelineCache = Map<string, { layout: GPUBindGroupLayout; pipeline: GPUComputePipeline }>;

// Run a single-entry relation kernel. The kernel gathers its edges directly from
// the resident column-major columns (`colBytes`: numEdges columns of length 2n)
// plus the per-edge scaling (`scalBytes`: n Fr) — the same input contract as the
// resident sumcheck engine. Bindings: col_buf at binding(0), storage output SB
// (n*outLen Fr) at binding(1), Params{n} uniform at binding(2), scaling SB at
// binding(3); when `relParams` is given (relation_parameters, e.g. beta/gamma) it
// is bound at binding(4). One thread per edge. Returns the raw output bytes and
// the GPU compute+readback time. Pass a `cache` to reuse the compiled pipeline.
export async function dispatchRelation(
  device: GPUDevice,
  n: number,
  code: string,
  entry: string,
  colBytes: Uint8Array,
  scalBytes: Uint8Array,
  numEdges: number,
  outLen: number,
  relParams?: Uint8Array,
  cache?: PipelineCache,
): Promise<{ bytes: Uint8Array; ms: number }> {
  // Guard against IN_LEN/OUT_LEN drift: each kernel compiles its own consts while
  // the suite passes its own copies, and a mismatch would silently misalign the
  // input/output strides instead of failing cleanly.
  const outConst = /const\s+OUT_LEN\s*:\s*u32\s*=\s*(\d+)u/.exec(code);
  if (outConst && Number(outConst[1]) !== outLen) {
    throw new Error(`OUT_LEN mismatch: kernel ${outConst[1]} vs suite ${outLen}`);
  }
  const inLen = 2 * numEdges + 1;
  const inConst = /const\s+IN_LEN\s*:\s*u32\s*=\s*(\d+)u/.exec(code);
  if (inConst && Number(inConst[1]) !== inLen) {
    throw new Error(`IN_LEN mismatch: kernel ${inConst[1]} vs suite ${inLen} (numEdges ${numEdges})`);
  }
  const colLen = 2 * n;
  if (colBytes.length !== numEdges * colLen * 32) {
    throw new Error(`col bytes mismatch: expected ${numEdges * colLen * 32}, got ${colBytes.length}`);
  }
  if (scalBytes.length !== n * 32) {
    throw new Error(`scaling bytes mismatch: expected ${n * 32}, got ${scalBytes.length}`);
  }

  const types = ['read-only-storage', 'storage', 'uniform', 'read-only-storage'];
  if (relParams) types.push('read-only-storage');
  const cacheKey = `${entry}|${types.length}`;
  let compiled = cache?.get(cacheKey);
  if (!compiled) {
    const layout = create_bind_group_layout(device, types);
    const pipeline = await create_compute_pipeline(device, [layout], code, entry, entry);
    compiled = { layout, pipeline };
    cache?.set(cacheKey, compiled);
  }
  const { layout, pipeline } = compiled;
  const colBuf = create_and_write_sb(device, colBytes);
  // Pre-fill the output with a sentinel (0xff bytes = 2^256-1, larger than any
  // Montgomery field value a kernel can write) so a row the kernel fails to write
  // reads back as detectably "unwritten" rather than as a valid 0 — which would
  // otherwise mask a skipped write on the rows whose reference is zero.
  const outBuf = create_and_write_sb(device, new Uint8Array(n * outLen * 32).fill(0xff));
  const params = new Uint8Array(16);
  new DataView(params.buffer).setUint32(0, n, true);
  const scalBuf = create_and_write_sb(device, scalBytes);
  const bufs = [colBuf, outBuf, create_and_write_ub(device, params), scalBuf];
  if (relParams) bufs.push(create_and_write_sb(device, relParams));
  const bg = create_bind_group(device, layout, bufs);
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
  vals.forEach((v, i) => writeLe32(out, i * 32, toMont(v)));
  return out;
}

export interface EdgeRow {
  e: bigint[][]; // numEdges entity edges, each [v0, v1]
  s: bigint; // scaling factor
}

// Declarative mirror of a relation's C++ `Relation::skip(in)` predicate, evaluated
// per edge-pair on the GPU. The relation contributes zero on a pair iff the predicate
// holds, so skipping is a pure performance optimization (the contribution it elides is
// provably zero). Indices are entity column indices (the `e[idx]` index in build):
//   - allZero: skip iff EVERY listed selector column is Montgomery-zero on both edge
//     evals (covers the single-`is_zero()` relations and the compound AND ones —
//     logderiv `[q_lookup, read_counts]`, databus `[q_busread, 5×read_counts]`).
//   - eqPair: skip iff columns [a,b] are byte-equal on both edge evals — the
//     permutation relation's `(z_perm - z_perm_shift).is_zero()`.
// Montgomery 0 is all-zero bytes and stored columns are canonical Montgomery, so both
// predicates reduce to cheap byte tests on-GPU (no fromMont). See descriptors.ts.
export type SkipPredicate =
  | { kind: 'allZero'; cols: number[] }
  | { kind: 'eqPair'; cols: [number, number] };

// A relation's per-edge isolation kernel + reference, packaged so both its
// standalone suite and the end-to-end integration suite can drive it. `build`
// produces one edge row; `polyRef` is the per-edge polynomial golden (outLen Fr).
export interface RelationDescriptor {
  id: string;
  label: string;
  relationIndex: number; // MegaFlavor Relations_ tuple index (0..13)
  numEdges: number;
  inLen: number;
  outLen: number; // == this relation's slice length in the 345-Fr accumulator
  entry: string;
  seed: bigint;
  // Map this relation's local entity (WGSL edge order, 0..numEdges-1) to its global
  // MegaFlavor entity index in GLOBAL_ENTITIES (descriptors.ts). Drives the shared
  // resident column set: instead of numEdges per-relation columns, all 14 relations
  // read one set of NUM_GLOBAL_ENTITIES columns, each relation gathering its slice via
  // these indices (the accumulate kernel's entity_map binding in the `shared` variant).
  globalEntityIndices: number[];
  // `shared` renders the accumulate kernel against the shared column set (entity_map
  // indirection); omitted/false keeps the per-relation contiguous layout the standalone
  // suites use, byte-identical to before this option existed.
  shader: (shared?: boolean) => string;
  // Draw this relation's relation_parameters from the rng (consumed BEFORE the
  // edges, matching the standalone suites). Omitted for parameter-free relations.
  makeParams?: (rng: () => bigint) => bigint[];
  build: (rng: () => bigint, i: number) => EdgeRow;
  polyRef: (e: bigint[][], s: bigint, params: bigint[]) => bigint[];
  // The relation's skip predicate (mirrors C++ Relation::skip). The GPU skip path
  // (gpu_pipeline.injectSkipPrelude) and the sparse-instance generator (sparsity.ts)
  // both read this; the same column indices appear as the "skip path" rows in `build`.
  skip: SkipPredicate;
}

// Pack n test edges into the resident column layout the relation kernels read:
// numEdges columns (column-major, length 2n each) with edge i's entity j at column
// rows 2i/2i+1, plus the per-edge scaling (n Fr). Mirrors encodeColumnsToBytes +
// the gate-separator scaling, so the standalone/integration suites exercise the
// exact input contract of the resident sumcheck engine.
export function packColEdges(
  n: number,
  numEdges: number,
  build: (i: number) => EdgeRow,
): { colBytes: Uint8Array; scalBytes: Uint8Array; inputs: EdgeRow[] } {
  const colLen = 2 * n;
  const colBytes = new Uint8Array(numEdges * colLen * 32);
  const scalBytes = new Uint8Array(n * 32);
  const inputs: EdgeRow[] = [];
  for (let i = 0; i < n; i++) {
    const row = build(i);
    inputs.push(row);
    for (let j = 0; j < numEdges; j++) {
      writeLe32(colBytes, (j * colLen + 2 * i) * 32, toMont(row.e[j][0]));
      writeLe32(colBytes, (j * colLen + 2 * i + 1) * 32, toMont(row.e[j][1]));
    }
    writeLe32(scalBytes, i * 32, toMont(row.s));
  }
  return { colBytes, scalBytes, inputs };
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

// Run a relation descriptor's isolation kernel and diff every edge's output
// against its polynomial reference (the standalone per-relation suite path).
export async function runRelationStandalone(d: RelationDescriptor, ctx: SuiteCtx): Promise<boolean> {
  const rng = makeRng(d.seed);
  const params = d.makeParams ? d.makeParams(rng) : [];
  const { colBytes, scalBytes, inputs } = packColEdges(ctx.n, d.numEdges, i => d.build(rng, i));
  const relParams = d.makeParams ? packParams(params) : undefined;
  const { bytes, ms } = await dispatchRelation(ctx.device, ctx.n, d.shader(), d.entry, colBytes, scalBytes, d.numEdges, d.outLen, relParams);
  return diffRelation(bytes, ctx.n, d.outLen, i => d.polyRef(inputs[i].e, inputs[i].s, params), ctx.log, d.id, ms);
}
