// In-browser correctness harness for the BN254 scalar-field (F_r) WebGPU
// primitives (Phase 0 of the sumcheck WebGPU port).
//
// For each op (add, sub, mul, neg, inv) it uploads random + edge-case scalars
// in the memory-aware 8×u32 Montgomery form, dispatches the matching kernel
// entry point, reads back, converts out of Montgomery form, and diffs every
// element against the CPU `bn254ScalarField` reference. Any mismatch is a hard
// fail; the first few are printed with their inputs.
//
// Run: `yarn dev:sumcheck-webgpu`, open the page, click Run. Or drive it
// headless with `node dev/sumcheck-webgpu/drive-fr.mjs` (autoruns via
// `?autorun=fr-ops` and emits `[autorun] state=ok|err`).

import {
  get_device,
  create_and_write_sb,
  create_and_write_ub,
  create_sb,
  create_bind_group_layout,
  create_bind_group,
  create_compute_pipeline,
  execute_pipeline,
  read_from_gpu,
} from '../../src/msm_webgpu/cuzk/gpu.js';
import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { BN254_SCALAR_FIELD, bn254ScalarField } from '../../src/msm_webgpu/cuzk/bn254.js';

type Level = 'info' | 'ok' | 'err' | 'warn' | 'muted';

const $log = document.getElementById('log') as HTMLDivElement;
const $run = document.getElementById('run') as HTMLButtonElement;
const $logn = document.getElementById('logn') as HTMLInputElement;

function log(level: Level, msg: string): void {
  const div = document.createElement('div');
  if (level !== 'info') div.className = level;
  div.textContent = msg;
  $log.appendChild(div);
  // eslint-disable-next-line no-console
  console.log(msg);
}

const P = BN254_SCALAR_FIELD;
const WORKGROUP_SIZE = 64;
const ENTRY_POINTS = ['fr_add_main', 'fr_sub_main', 'fr_mul_main', 'fr_neg_main', 'fr_inv_main'] as const;
type EntryPoint = (typeof ENTRY_POINTS)[number];

// The scalar-field shader manager. `sm.r` / `sm.rinv` are the Montgomery
// radix (2^260 mod p) and its inverse — the host's toMont / fromMont scalars.
const sm = new ShaderManager(4, 1 << 8, BN254_CURVE_CONFIG, false, 'scalar');
const R = sm.r;
const RINV = sm.rinv;
const toMont = (x: bigint): bigint => (((x % P) + P) % P) * R % P;
const fromMont = (y: bigint): bigint => (y * RINV) % P;

function biToLe32(v: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = v;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}
function le32ToBi(bytes: Uint8Array, off: number): bigint {
  let v = 0n;
  for (let i = 31; i >= 0; i--) v = (v << 8n) | BigInt(bytes[off + i]);
  return v;
}

// Deterministic 254-bit LCG so a failing run is reproducible.
let seed = 0x9e3779b97f4a7c15n;
function rand(): bigint {
  seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n);
  return (seed >> 2n) % P; // 254-bit, reduced
}

function buildInputs(n: number): { a: bigint[]; b: bigint[] } {
  // Edge cases first so failures surface on the interesting values.
  const edges = [0n, 1n, 2n, P - 1n, P - 2n, R % P, (P - 1n) / 2n, (1n << 253n) % P];
  const a: bigint[] = [];
  const b: bigint[] = [];
  for (const x of edges) {
    for (const y of edges) {
      a.push(x);
      b.push(y);
    }
  }
  while (a.length < n) {
    a.push(rand());
    b.push(rand());
  }
  return { a: a.slice(0, n), b: b.slice(0, n) };
}

function packMont(vals: bigint[]): Uint8Array {
  const out = new Uint8Array(vals.length * 32);
  for (let i = 0; i < vals.length; i++) out.set(biToLe32(toMont(vals[i])), i * 32);
  return out;
}

function cpuExpected(op: EntryPoint, x: bigint, y: bigint): bigint {
  switch (op) {
    case 'fr_add_main':
      return bn254ScalarField.add(x, y);
    case 'fr_sub_main':
      return bn254ScalarField.sub(x, y);
    case 'fr_mul_main':
      return bn254ScalarField.mul(x, y);
    case 'fr_neg_main':
      return bn254ScalarField.neg(x);
    case 'fr_inv_main':
      return x === 0n ? 0n : bn254ScalarField.inv(x); // GPU returns 0 for inv(0)
  }
}

async function run(): Promise<boolean> {
  $run.disabled = true;
  $log.replaceChildren();
  let allOk = true;
  try {
    const n = 1 << Math.max(4, Math.min(20, parseInt($logn.value, 10) || 14));
    log('info', `BN254 F_r WebGPU primitives — n=${n} (2^${Math.log2(n)}) per op`);
    log('muted', `p = ${P}`);

    const device = await get_device();
    const code = sm.gen_fr_ops_test_shader(WORKGROUP_SIZE);

    const layout = create_bind_group_layout(device, [
      'read-only-storage',
      'read-only-storage',
      'storage',
      'uniform',
    ]);
    const pipelines: Record<EntryPoint, GPUComputePipeline> = {} as Record<EntryPoint, GPUComputePipeline>;
    for (const ep of ENTRY_POINTS) {
      pipelines[ep] = await create_compute_pipeline(device, [layout], code, ep, ep);
    }
    log('ok', `compiled ${ENTRY_POINTS.length} entry points`);

    const { a, b } = buildInputs(n);
    const aBuf = create_and_write_sb(device, packMont(a));
    const bBuf = create_and_write_sb(device, packMont(b));
    const outBuf = create_sb(device, n * 32);
    const params = new Uint8Array(16);
    new DataView(params.buffer).setUint32(0, n, true);
    const paramsBuf = create_and_write_ub(device, params);
    const bindGroup = create_bind_group(device, layout, [aBuf, bBuf, outBuf, paramsBuf]);
    const numWg = Math.ceil(n / WORKGROUP_SIZE);

    for (const ep of ENTRY_POINTS) {
      const t0 = performance.now();
      const enc = device.createCommandEncoder();
      await execute_pipeline(enc, pipelines[ep], bindGroup, numWg);
      const [bytes] = await read_from_gpu(device, enc, [outBuf]);
      const ms = performance.now() - t0;

      let mismatches = 0;
      let firstMismatch = '';
      for (let i = 0; i < n; i++) {
        const got = fromMont(le32ToBi(bytes, i * 32));
        const want = cpuExpected(ep, a[i], b[i]);
        if (got !== want) {
          mismatches++;
          if (mismatches <= 3) {
            firstMismatch +=
              `\n    i=${i} a=${a[i]} b=${b[i]}\n      got =${got}\n      want=${want}`;
          }
        }
      }
      const opName = ep.replace('_main', '');
      if (mismatches === 0) {
        log('ok', `  ${opName.padEnd(7)} ✓  ${n}/${n} match   (${ms.toFixed(1)} ms incl. readback)`);
      } else {
        allOk = false;
        log('err', `  ${opName.padEnd(7)} ✗  ${mismatches}/${n} MISMATCH${firstMismatch}`);
      }
    }

    log(allOk ? 'ok' : 'err', allOk ? 'ALL OPS CORRECT' : 'FAILURES DETECTED');
  } catch (e) {
    allOk = false;
    log('err', `exception: ${(e as Error).message}`);
    // eslint-disable-next-line no-console
    console.error(e);
  } finally {
    $run.disabled = false;
    // Terminal marker for the headless driver.
    log('muted', `[autorun] state=${allOk ? 'ok' : 'err'}`);
  }
  return allOk;
}

$run.addEventListener('click', () => void run());

if (new URLSearchParams(window.location.search).get('autorun') === 'fr-ops') {
  void run();
}
