/// <reference types="@webgpu/types" />
// WGSL primitive unit tests for the BN254 WebGPU MSM port.
//
// Each test compiles ONE shader from `src/msm_webgpu/wgsl/` in isolation
// (via ShaderManager + a manual bind-group/dispatch wrapper), feeds it
// known inputs, reads back outputs, and compares against a small JS
// reference computed from the same spec. Failures point at exactly one
// kernel rather than the full MSM end-to-end.
//
// The tests deliberately do NOT go through `compute_bn254_msm` or
// `cached_bases`; the goal is to localise breakage to a single stage.
// The triple-slash above is needed because `dev/` is outside the
// `src/`-scoped tsconfig and IDE-default contexts do not auto-load
// the sibling `env.d.ts`.

import { BN254_CURVE_CONFIG } from "../../src/msm_webgpu/cuzk/curve_config.js";
import { GpuContext } from "../../src/msm_webgpu/cuzk/gpu_context.js";
import {
  create_and_write_sb,
  create_and_write_ub,
  read_from_gpu,
  create_bind_group_layout,
  create_bind_group,
  create_compute_pipeline,
  execute_pipeline,
} from "../../src/msm_webgpu/cuzk/gpu.js";
import { transpose_gpu_parallel } from "../../src/msm_webgpu/msm.js";
import {
  compute_bn254_msm_f32,
  compute_bn254_msm_batch_affine_f32,
  precompute_bn254_bases_f32,
} from "../../src/msm_webgpu/msm_f32.js";
import { mulhilo as mulhiloSrc } from "../../src/msm_webgpu/wgsl/_generated/shaders.js";
import {
  compute_misc_params,
  bigints_to_u8_for_gpu,
  u8s_to_bigints,
} from "../../src/msm_webgpu/cuzk/utils.js";
import {
  addBn254Jacobian,
  BN254_JACOBIAN_ZERO,
  BN254_SCALAR_FIELD,
  Bn254Jacobian,
  doubleBn254Jacobian,
  scalarMultBn254Jacobian,
  toAffineBn254Jacobian,
} from "../../src/msm_webgpu/cuzk/bn254.js";
import { bn254 } from "@noble/curves/bn254";

export interface UnitTestResult {
  name: string;
  ok: boolean;
  detail?: string;
}

// --------- helpers ----------

function scalarToLeBytes(s: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = s;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

function leBytesToU32Array(bytes: Uint8Array): Uint8Array {
  // The decompose shader reads `scalars: array<u32>`, which on the host
  // side is just the same byte buffer (LE). create_and_write_sb takes a
  // Uint8Array, so we hand it the bytes directly.
  return bytes;
}

// JS mirror of decompose_scalars_signed_only.wgsl. Computes the same
// shifted-signed bucket indices the shader writes into `chunks_sb`.
// `scalarBitLength` matches the curveConfig field — the buffer-width,
// NOT the Fr bit-length (the shader's override formula was written
// against this convention, see curve_config.ts comment).
export function referenceDecompose(
  scalar: bigint,
  chunkSize: number,
  numSubtasks: number,
  numColumns: number,
  scalarBitLength: number,
): number[] {
  const chunkMask = (1n << BigInt(chunkSize)) - 1n;

  // Step 1: raw chunks via right-shift.
  const rawChunks: number[] = [];
  let s = scalar;
  for (let i = 0; i < numSubtasks; i++) {
    rawChunks.push(Number(s & chunkMask));
    s >>= BigInt(chunkSize);
  }

  // Step 2: top-chunk override mirrors
  //   chunks_arr[T-1] = scalar_bytes[0] >> shift
  // with `shift = NUM_SUBTASKS*CHUNK_SIZE - scalar_bitlength + 16 - CHUNK_SIZE`,
  // computed in u32 (wraps on negative). scalar_bytes[0] holds the top
  // 16 bits of the 256-bit scalar buffer.
  const useTopChunkOverride = scalarBitLength % chunkSize !== 0;
  if (useTopChunkOverride) {
    const top16 = Number((scalar >> 240n) & 0xffffn);
    const shiftSigned =
      numSubtasks * chunkSize - scalarBitLength + 16 - chunkSize;
    // Mirror WGSL u32 semantics on the (possibly-negative) intermediate.
    const shift = ((shiftSigned % 0x100000000) + 0x100000000) % 0x100000000;
    if (shift >= 32) {
      rawChunks[numSubtasks - 1] = 0; // any shift ≥ 32 zeros a 32-bit value
    } else {
      rawChunks[numSubtasks - 1] = (top16 >>> shift) >>> 0;
    }
  }

  // Step 3: signed-bucket transform with carry.
  const half = numColumns / 2;
  const l = numColumns;
  let carry = 0;
  const out: number[] = new Array(numSubtasks);
  for (let i = 0; i < numSubtasks; i++) {
    let v = rawChunks[i] + carry;
    if (v >= half) {
      v = -(l - v);
      carry = 1;
    } else {
      carry = 0;
    }
    out[i] = v + half; // store as unsigned, shifted by `half`
  }
  return out;
}

// --------- decompose test ----------

interface DecomposeOpts {
  numSubtasks: number;
  chunkSize: number;
  numColumns: number;
  scalarBitLength: number;
  scalarByteLength: number;
  workgroupSize: number;
  numYWorkgroups: number;
}

async function runDecomposeOnce(
  context: GpuContext,
  scalars: bigint[],
  opts: DecomposeOpts,
): Promise<Uint32Array> {
  const inputSize = scalars.length;
  const sm = context.getShaderManager(
    BN254_CURVE_CONFIG,
    opts.chunkSize,
    inputSize,
  );
  const shaderCode = sm.gen_decompose_scalars_signed_only_shader(
    opts.workgroupSize,
    opts.numYWorkgroups,
    opts.numSubtasks,
    opts.numColumns,
    /* scalar_bit_length_override */ undefined,
    /* scalar_byte_length_override */ undefined,
    /* count_into_col_ptr */ false,
  );

  // Pack scalars: each as 32 LE bytes, concatenated.
  const scalarBytes = new Uint8Array(inputSize * 32);
  for (let i = 0; i < inputSize; i++) {
    scalarBytes.set(scalarToLeBytes(scalars[i]), i * 32);
  }

  const { device } = context;
  const scalarsSb = create_and_write_sb(device, leBytesToU32Array(scalarBytes));
  const chunksSb = device.createBuffer({
    size: inputSize * opts.numSubtasks * 4,
    usage:
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const inputSizeUb = create_and_write_ub(
    device,
    new Uint8Array(new Uint32Array([inputSize]).buffer),
  );

  const layout = create_bind_group_layout(device, [
    "read-only-storage",
    "storage",
    "uniform",
  ]);
  const pipeline = await create_compute_pipeline(
    device,
    [layout],
    shaderCode,
    "main",
    "decompose-unit-test",
  );
  const bg = create_bind_group(device, layout, [scalarsSb, chunksSb, inputSizeUb]);

  const numXWorkgroups = Math.ceil(
    inputSize / opts.workgroupSize / opts.numYWorkgroups,
  );

  const encoder = device.createCommandEncoder();
  await execute_pipeline(
    encoder,
    pipeline,
    bg,
    numXWorkgroups,
    opts.numYWorkgroups,
    1,
  );

  const data = await read_from_gpu(device, encoder, [chunksSb]);
  scalarsSb.destroy();
  chunksSb.destroy();
  inputSizeUb.destroy();

  return new Uint32Array(data[0].buffer, data[0].byteOffset, data[0].byteLength / 4);
}

export async function testDecomposeAtChunkSize(
  chunkSize: number,
): Promise<UnitTestResult> {
  const name = `decompose chunk_size=${chunkSize}`;
  try {
    const numSubtasks = Math.ceil(BN254_CURVE_CONFIG.scalarBitLength / chunkSize);
    const numColumns = 2 ** chunkSize;
    const opts: DecomposeOpts = {
      numSubtasks,
      chunkSize,
      numColumns,
      scalarBitLength: BN254_CURVE_CONFIG.scalarBitLength,
      scalarByteLength: BN254_CURVE_CONFIG.scalarByteLength,
      workgroupSize: 64,
      numYWorkgroups: 1,
    };

    // Test scalars: a mix of boundary values + a couple of randoms.
    const FR =
      21888242871839275222246405745257275088548364400416034343698204186575808495617n;
    const testScalars: bigint[] = [
      0n,
      1n,
      2n,
      (1n << BigInt(chunkSize)) - 1n, // max single chunk
      1n << BigInt(chunkSize), // forces signed flip on chunk 0
      (1n << BigInt(chunkSize - 1)) - 1n, // largest non-flipping chunk 0
      1n << BigInt(chunkSize - 1), // smallest flipping chunk 0
      FR - 1n, // max valid Fr
    ];
    // Pad to a multiple of workgroup_size * num_y_workgroups so we don't
    // dispatch a partial workgroup.
    const padTo = opts.workgroupSize * opts.numYWorkgroups;
    while (testScalars.length % padTo !== 0) testScalars.push(1n);

    const context = await GpuContext.create();
    const got = await runDecomposeOnce(context, testScalars, opts);
    context.destroy();

    // Reference + comparison. Output layout: chunks[i*input_size + scalarIdx].
    const inputSize = testScalars.length;
    for (let s = 0; s < testScalars.length; s++) {
      const ref = referenceDecompose(
        testScalars[s],
        chunkSize,
        numSubtasks,
        numColumns,
        opts.scalarBitLength,
      );
      for (let i = 0; i < numSubtasks; i++) {
        const gotVal = got[i * inputSize + s];
        if (gotVal !== ref[i]) {
          return {
            name,
            ok: false,
            detail:
              `scalar[${s}] = 0x${testScalars[s].toString(16)}\n` +
              `  chunk[${i}]: got ${gotVal} (0x${gotVal.toString(16)}), ` +
              `expected ${ref[i]} (0x${ref[i].toString(16)})\n` +
              `  full got chunks:  [${Array.from({ length: numSubtasks }, (_, k) => got[k * inputSize + s]).join(", ")}]\n` +
              `  full ref chunks:  [${ref.join(", ")}]`,
          };
        }
      }
    }
    return { name, ok: true, detail: `${testScalars.length} scalars × ${numSubtasks} chunks all matched reference` };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// --------- transpose test ----------

// JS mirror of the parallel transpose pipeline (count → scan → scatter).
// Input layout: chunks[subtask * inputSize + scalarIdx] (matches what
// decompose writes into scalar_chunks_sb — `chunks[id + subtask*input_size]`
// from the shader).
//
// Output layouts:
//   colPtr[subtask * (numColumns + 1) + k] = number of scalars whose chunk
//     for `subtask` is < k. Plus the standard CSR offset-by-1 convention
//     where slot 0 is 0 and slot numColumns is the total per-subtask count.
//   valIdxs[subtask * inputSize + slot] = scalar index, where the run
//     [colPtr[i*(C+1)+k], colPtr[i*(C+1)+k+1]) is the indices whose
//     chunk for subtask i equals k.
export function referenceTranspose(
  chunks: Uint32Array,
  inputSize: number,
  numSubtasks: number,
  numColumns: number,
): { colPtr: Uint32Array; valIdxs: Uint32Array } {
  const colPtrStride = numColumns + 1;
  const colPtr = new Uint32Array(numSubtasks * colPtrStride);

  // Count: bump slot k+1 of subtask i's slice for each chunks[i*N + s] == k.
  for (let i = 0; i < numSubtasks; i++) {
    for (let s = 0; s < inputSize; s++) {
      const col = chunks[i * inputSize + s];
      colPtr[i * colPtrStride + col + 1]++;
    }
  }

  // Prefix-sum per subtask.
  for (let i = 0; i < numSubtasks; i++) {
    for (let k = 1; k < colPtrStride; k++) {
      colPtr[i * colPtrStride + k] += colPtr[i * colPtrStride + k - 1];
    }
  }

  // Scatter: for each (subtask, scalar) write the scalar index into the
  // next free slot for its column.
  const valIdxs = new Uint32Array(numSubtasks * inputSize);
  const curr = new Uint32Array(numSubtasks * numColumns);
  for (let i = 0; i < numSubtasks; i++) {
    for (let s = 0; s < inputSize; s++) {
      const col = chunks[i * inputSize + s];
      const base = colPtr[i * colPtrStride + col];
      const slot = curr[i * numColumns + col]++;
      valIdxs[i * inputSize + base + slot] = s;
    }
  }
  return { colPtr, valIdxs };
}

interface TransposeOpts {
  chunkSize: number;
  numSubtasks: number;
  numColumns: number;
  inputSize: number;
}

// Build synthetic scalar_chunks that exercise every column at least
// once: chunks[i, s] = (s + i) mod numColumns. Deterministic and easy
// to reason about — the same scalar index appears in column (s+i)%C of
// subtask i, so col_ptr should be ceil(inputSize / numColumns) for the
// first `inputSize % numColumns` columns and floor for the rest.
function buildSyntheticChunks(
  inputSize: number,
  numSubtasks: number,
  numColumns: number,
): Uint32Array {
  const out = new Uint32Array(inputSize * numSubtasks);
  for (let i = 0; i < numSubtasks; i++) {
    for (let s = 0; s < inputSize; s++) {
      out[i * inputSize + s] = (s + i) % numColumns;
    }
  }
  return out;
}

async function runTransposeOnce(
  context: GpuContext,
  scalarChunks: Uint32Array,
  opts: TransposeOpts,
): Promise<{ colPtr: Uint32Array; valIdxs: Uint32Array }> {
  const { device } = context;
  const sm = context.getShaderManager(
    BN254_CURVE_CONFIG,
    opts.chunkSize,
    opts.inputSize,
  );

  const countShader = sm.gen_transpose_count_shader(64);
  const scanShader = sm.gen_transpose_scan_shader(opts.numSubtasks);
  const scatterShader = sm.gen_transpose_scatter_shader(64);

  // Upload the synthetic chunks as a storage buffer with the same layout
  // the production decompose path writes.
  const chunksBytes = new Uint8Array(
    scalarChunks.buffer,
    scalarChunks.byteOffset,
    scalarChunks.byteLength,
  );
  const scalarChunksSb = create_and_write_sb(device, chunksBytes);

  const numRows = Math.ceil(opts.inputSize / opts.numColumns);

  const encoder = device.createCommandEncoder();
  const out = await transpose_gpu_parallel(
    countShader,
    scanShader,
    scatterShader,
    device,
    encoder,
    opts.inputSize,
    opts.numColumns,
    numRows,
    opts.numSubtasks,
    scalarChunksSb,
    undefined, // cpu_timer
    undefined, // context — pass undefined so it allocates fresh, ephemeral buffers
    BN254_CURVE_CONFIG.id,
    opts.chunkSize,
  );

  const data = await read_from_gpu(device, encoder, [
    out.all_csc_col_ptr_sb,
    out.all_csc_val_idxs_sb,
  ]);
  scalarChunksSb.destroy();
  out.all_csc_col_ptr_sb.destroy();
  out.all_csc_val_idxs_sb.destroy();

  const colPtr = new Uint32Array(
    data[0].buffer,
    data[0].byteOffset,
    data[0].byteLength / 4,
  );
  const valIdxs = new Uint32Array(
    data[1].buffer,
    data[1].byteOffset,
    data[1].byteLength / 4,
  );
  // Slice into owned arrays so destroying the source data is safe.
  return { colPtr: new Uint32Array(colPtr), valIdxs: new Uint32Array(valIdxs) };
}

export async function testTransposeAtChunkSize(
  chunkSize: number,
  inputSize: number,
): Promise<UnitTestResult> {
  const name = `transpose chunk_size=${chunkSize}, n=${inputSize}`;
  try {
    const numSubtasks = Math.ceil(
      BN254_CURVE_CONFIG.scalarBitLength / chunkSize,
    );
    const numColumns = 2 ** chunkSize;
    const opts: TransposeOpts = {
      chunkSize,
      numSubtasks,
      numColumns,
      inputSize,
    };

    const chunks = buildSyntheticChunks(inputSize, numSubtasks, numColumns);
    const ref = referenceTranspose(chunks, inputSize, numSubtasks, numColumns);

    const context = await GpuContext.create();
    const got = await runTransposeOnce(context, chunks, opts);
    context.destroy();

    // Compare col_ptr — exact equality required.
    const colPtrStride = numColumns + 1;
    for (let i = 0; i < numSubtasks; i++) {
      for (let k = 0; k < colPtrStride; k++) {
        const idx = i * colPtrStride + k;
        if (got.colPtr[idx] !== ref.colPtr[idx]) {
          return {
            name,
            ok: false,
            detail:
              `col_ptr[subtask=${i}, k=${k}]: got ${got.colPtr[idx]}, expected ${ref.colPtr[idx]}`,
          };
        }
      }
    }

    // Compare val_idxs — within each column run, order isn't guaranteed
    // (parallel scatter uses atomics). Compare as multisets per column.
    for (let i = 0; i < numSubtasks; i++) {
      for (let k = 0; k < numColumns; k++) {
        const begin = ref.colPtr[i * colPtrStride + k];
        const end = ref.colPtr[i * colPtrStride + k + 1];
        if (begin === end) continue;
        const refRun = Array.from(
          ref.valIdxs.subarray(i * inputSize + begin, i * inputSize + end),
        ).sort((a, b) => a - b);
        const gotRun = Array.from(
          got.valIdxs.subarray(i * inputSize + begin, i * inputSize + end),
        ).sort((a, b) => a - b);
        for (let m = 0; m < refRun.length; m++) {
          if (refRun[m] !== gotRun[m]) {
            return {
              name,
              ok: false,
              detail:
                `val_idxs[subtask=${i}, col=${k}] multiset mismatch at slot ${m}: ` +
                `got=[${gotRun.slice(0, 8).join(", ")}${gotRun.length > 8 ? ", …" : ""}], ` +
                `expected=[${refRun.slice(0, 8).join(", ")}${refRun.length > 8 ? ", …" : ""}]`,
            };
          }
        }
      }
    }

    return {
      name,
      ok: true,
      detail: `${numSubtasks} subtasks × ${numColumns} cols matched`,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// --------- mulhilo test ----------

// Reference (host-side, BigInt): a*b = hi * 2^23 + lo with hi, lo in [0, 2^23).
function mulhiloRef(a: number, b: number): { hi: number; lo: number } {
  const prod = BigInt(a) * BigInt(b);
  return { hi: Number(prod >> 23n), lo: Number(prod & ((1n << 23n) - 1n)) };
}

// 30 pairs whose product lands within ±2 of a multiple of 2^22 — these
// straddle the rounding boundary of the FMA-bias trick and would catch
// an off-by-one in the underflow correction.
function buildNearBoundaryPairs(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const W = 1 << 23;
  let attempts = 0;
  while (out.length < 30 && attempts < 5000) {
    attempts++;
    const k = Math.floor(Math.random() * W);
    const offset = (Math.floor(Math.random() * 5) - 2); // {-2,-1,0,1,2}
    const target = k * (1 << 22) + offset;
    if (target < 1 || target >= W * W) continue;
    // Factor target = a*b with a, b in [1, 2^23). Try a small set of trial
    // divisors so we don't loop forever on primes.
    let found = false;
    for (let t = 0; t < 8; t++) {
      const a = 1 + Math.floor(Math.random() * (W - 1));
      if (target % a !== 0) continue;
      const b = target / a;
      if (b >= 1 && b < W && Number.isInteger(b)) {
        out.push([a, b]);
        found = true;
        break;
      }
    }
    if (!found) continue;
  }
  return out;
}

export async function testMulhilo(): Promise<UnitTestResult> {
  const name = `mulhilo (23-bit f32 hi/lo split)`;
  try {
    // Inputs: corners + 200 randoms + ~30 near-rounding-boundary pairs.
    const corners: Array<[number, number]> = [
      [0, 0],
      [0, 8388607],
      [8388607, 0],
      [1, 1],
      [8388607, 8388607],
      [4194304, 4194304],
      [4194303, 4194305],
    ];
    const randoms: Array<[number, number]> = [];
    for (let i = 0; i < 200; i++) {
      randoms.push([
        Math.floor(Math.random() * (1 << 23)),
        Math.floor(Math.random() * (1 << 23)),
      ]);
    }
    const pairs = [...corners, ...randoms, ...buildNearBoundaryPairs()];
    const N = pairs.length;

    // Inputs packed as f32 (a, b) per pair; outputs as f32 (hi, lo) per pair.
    const inputF32 = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      inputF32[2 * i + 0] = pairs[i][0];
      inputF32[2 * i + 1] = pairs[i][1];
    }
    const inputBytes = new Uint8Array(inputF32.buffer);

    const WORKGROUP_SIZE = 64;
    const shaderCode = `${mulhiloSrc}

@group(0) @binding(0) var<storage, read>       inputs:  array<vec2<f32>>;
@group(0) @binding(1) var<storage, read_write> outputs: array<vec2<f32>>;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= ${N}u) { return; }
    let p = inputs[i];
    outputs[i] = mulhilo(p.x, p.y);
}
`;

    const context = await GpuContext.create();
    const { device } = context;
    const inputSb = create_and_write_sb(device, inputBytes);
    const outputSb = device.createBuffer({
      size: N * 8,
      usage:
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    const layout = create_bind_group_layout(device, ["read-only-storage", "storage"]);
    const pipeline = await create_compute_pipeline(
      device,
      [layout],
      shaderCode,
      "main",
      "mulhilo-unit-test",
    );
    const bg = create_bind_group(device, layout, [inputSb, outputSb]);

    const numXWorkgroups = Math.ceil(N / WORKGROUP_SIZE);
    const encoder = device.createCommandEncoder();
    await execute_pipeline(encoder, pipeline, bg, numXWorkgroups, 1, 1);

    const data = await read_from_gpu(device, encoder, [outputSb]);
    inputSb.destroy();
    outputSb.destroy();
    context.destroy();

    const outF32 = new Float32Array(data[0].buffer, data[0].byteOffset, data[0].byteLength / 4);

    let failures = 0;
    const firstFailures: string[] = [];
    for (let i = 0; i < N; i++) {
      const [a, b] = pairs[i];
      const ref = mulhiloRef(a, b);
      const actualHi = outF32[2 * i + 0];
      const actualLo = outF32[2 * i + 1];
      if (actualHi !== ref.hi || actualLo !== ref.lo) {
        failures++;
        if (firstFailures.length < 5) {
          firstFailures.push(
            `{a: ${a}, b: ${b}, expectedHi: ${ref.hi}, expectedLo: ${ref.lo}, actualHi: ${actualHi}, actualLo: ${actualLo}}`,
          );
        }
      }
    }

    if (failures === 0) {
      return { name, ok: true, detail: `${N} pairs (corners + 200 random + near-boundary) all matched reference` };
    }
    return {
      name,
      ok: false,
      detail: `${failures}/${N} mismatches. First failures:\n  ${firstFailures.join("\n  ")}`,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// --------- montgomery_product_f32 test ----------

const NUM_LIMBS_F32 = 12;
const WORD_SIZE_F32 = 23;
const W_F32 = 1n << BigInt(WORD_SIZE_F32);
const LIMB_MASK_F32 = W_F32 - 1n;

function bigintTo23BitLimbs(v: bigint): number[] {
  const limbs: number[] = new Array(NUM_LIMBS_F32);
  let x = v;
  for (let i = 0; i < NUM_LIMBS_F32; i++) {
    limbs[i] = Number(x & LIMB_MASK_F32);
    x >>= BigInt(WORD_SIZE_F32);
  }
  return limbs;
}

function limbs23ToBigint(limbs: ArrayLike<number>): bigint {
  let v = 0n;
  for (let i = NUM_LIMBS_F32 - 1; i >= 0; i--) {
    v = (v << BigInt(WORD_SIZE_F32)) | BigInt(Math.round(limbs[i]));
  }
  return v;
}

function randomBelow(p: bigint): bigint {
  const bitlen = p.toString(2).length;
  const byteLen = Math.ceil(bitlen / 8);
  while (true) {
    let v = 0n;
    for (let i = 0; i < byteLen; i++) {
      v = (v << 8n) | BigInt(Math.floor(Math.random() * 256));
    }
    // Mask off bits above the top bit of p, so rejection sampling
    // converges quickly even when p's top byte is mostly zero.
    v &= (1n << BigInt(bitlen)) - 1n;
    if (v < p) return v;
  }
}

export async function testMontgomeryProductF32(): Promise<UnitTestResult> {
  const name = `montgomery_product_f32 (23-bit f32 CIOS)`;
  try {
    const p = BN254_CURVE_CONFIG.baseFieldModulus;
    const params = compute_misc_params(p, WORD_SIZE_F32);
    if (params.num_words !== NUM_LIMBS_F32) {
      return {
        name,
        ok: false,
        detail: `expected num_words=${NUM_LIMBS_F32}, got ${params.num_words}`,
      };
    }
    // R = 2^(num_limbs * word_size) mod p. compute_misc_params returns
    // params.r already reduced; use that for x_mont = (x * R) mod p.
    const R = params.r;
    const Rinv = params.rinv;
    // Spot-check that Rinv is correct (catches mis-wired generic params).
    if ((R * Rinv) % p !== 1n) {
      return { name, ok: false, detail: "R * Rinv mod p != 1" };
    }

    // Build N test pairs: a few corners + random fills.
    const corners: Array<[bigint, bigint]> = [
      [0n, 0n],
      [0n, 1n],
      [1n, 1n],
      [p - 1n, 1n],
      [p - 1n, p - 1n],
      [R, 1n],
      [R, R],
      [1n, R],
    ];
    const pairs: Array<[bigint, bigint]> = [...corners];
    for (let i = 0; i < 50; i++) {
      pairs.push([randomBelow(p), randomBelow(p)]);
    }
    const N = pairs.length;

    // Convert each pair to Montgomery form: x_mont = (x * R) mod p.
    const xMontLimbs: number[][] = [];
    const yMontLimbs: number[][] = [];
    const expectedLimbs: number[][] = [];
    for (const [x, y] of pairs) {
      const xMont = (x * R) % p;
      const yMont = (y * R) % p;
      xMontLimbs.push(bigintTo23BitLimbs(xMont));
      yMontLimbs.push(bigintTo23BitLimbs(yMont));
      // montgomery_product(x_mont, y_mont) = x_mont * y_mont * Rinv mod p
      const exp = (xMont * yMont * Rinv) % p;
      expectedLimbs.push(bigintTo23BitLimbs(exp));
    }

    // Pack two input buffers (xs, ys), each as N * NUM_LIMBS_F32 f32 limbs.
    const xs = new Float32Array(N * NUM_LIMBS_F32);
    const ys = new Float32Array(N * NUM_LIMBS_F32);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < NUM_LIMBS_F32; j++) {
        xs[i * NUM_LIMBS_F32 + j] = xMontLimbs[i][j];
        ys[i * NUM_LIMBS_F32 + j] = yMontLimbs[i][j];
      }
    }

    const context = await GpuContext.create();
    const sm = context.getShaderManager(BN254_CURVE_CONFIG, 4, N);
    const helpers = sm.gen_montgomery_product_f32_shader();
    const WORKGROUP_SIZE = 64;
    const shaderCode = `${helpers}

@group(0) @binding(0) var<storage, read>       xs:      array<BigIntF32>;
@group(0) @binding(1) var<storage, read>       ys:      array<BigIntF32>;
@group(0) @binding(2) var<storage, read_write> outputs: array<BigIntF32>;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= ${N}u) { return; }
    var x = xs[i];
    var y = ys[i];
    outputs[i] = montgomery_product_f32(&x, &y);
}
`;

    const { device } = context;
    const xsSb = create_and_write_sb(device, new Uint8Array(xs.buffer));
    const ysSb = create_and_write_sb(device, new Uint8Array(ys.buffer));
    const outSb = device.createBuffer({
      size: N * NUM_LIMBS_F32 * 4,
      usage:
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    const layout = create_bind_group_layout(device, [
      "read-only-storage",
      "read-only-storage",
      "storage",
    ]);
    const pipeline = await create_compute_pipeline(
      device,
      [layout],
      shaderCode,
      "main",
      "mont-product-f32-unit-test",
    );
    const bg = create_bind_group(device, layout, [xsSb, ysSb, outSb]);

    const numXWorkgroups = Math.ceil(N / WORKGROUP_SIZE);
    const encoder = device.createCommandEncoder();
    await execute_pipeline(encoder, pipeline, bg, numXWorkgroups, 1, 1);

    const data = await read_from_gpu(device, encoder, [outSb]);
    xsSb.destroy();
    ysSb.destroy();
    outSb.destroy();
    context.destroy();

    const outF32 = new Float32Array(
      data[0].buffer,
      data[0].byteOffset,
      data[0].byteLength / 4,
    );

    let failures = 0;
    const firstFailures: string[] = [];
    for (let i = 0; i < N; i++) {
      const got = outF32.subarray(i * NUM_LIMBS_F32, (i + 1) * NUM_LIMBS_F32);
      const exp = expectedLimbs[i];
      let mismatch = false;
      for (let j = 0; j < NUM_LIMBS_F32; j++) {
        if (Math.round(got[j]) !== exp[j]) {
          mismatch = true;
          break;
        }
      }
      if (mismatch) {
        failures++;
        if (firstFailures.length < 5) {
          const [x, y] = pairs[i];
          firstFailures.push(
            `pair[${i}]: x=0x${x.toString(16)}, y=0x${y.toString(16)}\n` +
              `    expected_limbs: [${exp.join(", ")}]\n` +
              `    actual_limbs:   [${Array.from(got).join(", ")}]\n` +
              `    expected_int:   0x${limbs23ToBigint(exp).toString(16)}\n` +
              `    actual_int:     0x${limbs23ToBigint(got).toString(16)}`,
          );
        }
      }
    }

    if (failures === 0) {
      return {
        name,
        ok: true,
        detail: `${N} (x, y) pairs (corners + 50 random) all matched BigInt reference`,
      };
    }
    return {
      name,
      ok: false,
      detail: `${failures}/${N} mismatches. First failures:\n  ${firstFailures.join("\n  ")}`,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// --------- montgomery parity test (13-bit u32 vs 23-bit f32) ----------

// Cross-checks `montgomery_product` (existing u32 path, 20×13-bit limbs,
// radix R_u = 2^260 mod p) and `montgomery_product_f32` (new f32 path,
// 12×23-bit limbs, radix R_f = 2^276 mod p) on field-equivalent inputs
// in a single dispatch. The two paths live in different Montgomery
// rings (different R), so raw shader outputs are NOT bit-exact equal
// as BigInts. After host-side un-Montgomery (multiply by R^-1 mod p),
// both reduce to the same canonical (x · y) mod p — that's what we
// compare. Any deviation flags a real bug in either path.
const NUM_WORDS_U32 = 20;
const WORD_SIZE_U32 = 13;

export async function testMontgomeryParity(
  N: number = 64,
): Promise<UnitTestResult> {
  const name = `montgomery parity (u32 13-bit vs f32 23-bit)`;
  try {
    const p = BN254_CURVE_CONFIG.baseFieldModulus;
    const params_u32 = compute_misc_params(p, WORD_SIZE_U32);
    const params_f32 = compute_misc_params(p, WORD_SIZE_F32);
    const R_u32 = params_u32.r;
    const R_f32 = params_f32.r;
    const Rinv_u32 = params_u32.rinv;
    const Rinv_f32 = params_f32.rinv;

    // Build pairs: 8 corners (same corner set as testMontgomeryProductF32)
    // + N - 8 random fills. The corners use R_f32 — they live in the
    // f32 ring as "Montgomery-form-of-x" values. We treat them as plain
    // field elements x here; each path then re-Mont's them to its own R.
    const corners: Array<[bigint, bigint]> = [
      [0n, 0n],
      [0n, 1n],
      [1n, 1n],
      [p - 1n, 1n],
      [p - 1n, p - 1n],
      [R_f32, 1n],
      [R_f32, R_f32],
      [1n, R_f32],
    ];
    const pairs: Array<[bigint, bigint]> = [...corners];
    while (pairs.length < N) {
      pairs.push([randomBelow(p), randomBelow(p)]);
    }
    pairs.length = N;

    // Per-pair Mont forms in each ring + expected canonical x·y mod p.
    const xMontU32: bigint[] = [];
    const yMontU32: bigint[] = [];
    const xMontF32_BI: bigint[] = [];
    const yMontF32_BI: bigint[] = [];
    const expected: bigint[] = [];
    for (const [x, y] of pairs) {
      xMontU32.push((x * R_u32) % p);
      yMontU32.push((y * R_u32) % p);
      xMontF32_BI.push((x * R_f32) % p);
      yMontF32_BI.push((y * R_f32) % p);
      expected.push((x * y) % p);
    }

    // Pack 13-bit u32 inputs: bigints_to_u8_for_gpu lays out each value
    // as num_words × 4 bytes (low byte at i*4, high byte at i*4+1),
    // which is the storage layout of `array<u32, 20>`.
    const u32Stride = NUM_WORDS_U32 * 4;
    const pair13Bytes = new Uint8Array(N * u32Stride * 2);
    for (let i = 0; i < N; i++) {
      const xBytes = bigints_to_u8_for_gpu([xMontU32[i]], NUM_WORDS_U32, WORD_SIZE_U32);
      const yBytes = bigints_to_u8_for_gpu([yMontU32[i]], NUM_WORDS_U32, WORD_SIZE_U32);
      pair13Bytes.set(xBytes, i * u32Stride * 2);
      pair13Bytes.set(yBytes, i * u32Stride * 2 + u32Stride);
    }

    // Pack 23-bit f32 inputs: 2 × 12 f32 limbs per pair = 96 bytes.
    const pair23F32 = new Float32Array(N * NUM_LIMBS_F32 * 2);
    for (let i = 0; i < N; i++) {
      const xL = bigintTo23BitLimbs(xMontF32_BI[i]);
      const yL = bigintTo23BitLimbs(yMontF32_BI[i]);
      for (let j = 0; j < NUM_LIMBS_F32; j++) {
        pair23F32[(i * 2) * NUM_LIMBS_F32 + j] = xL[j];
        pair23F32[(i * 2 + 1) * NUM_LIMBS_F32 + j] = yL[j];
      }
    }

    const context = await GpuContext.create();
    // chunk_size argument is unused by gen_montgomery_parity_shader but
    // required by the constructor; any in-range value works.
    const sm = context.getShaderManager(BN254_CURVE_CONFIG, 13, N);
    const shaderCode = sm.gen_montgomery_parity_shader(64);

    const { device } = context;
    const inU32Sb = create_and_write_sb(device, pair13Bytes);
    const inF32Sb = create_and_write_sb(device, new Uint8Array(pair23F32.buffer));
    const outU32Sb = device.createBuffer({
      size: N * u32Stride,
      usage:
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    const outF32Sb = device.createBuffer({
      size: N * NUM_LIMBS_F32 * 4,
      usage:
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    const layout = create_bind_group_layout(device, [
      "read-only-storage",
      "read-only-storage",
      "storage",
      "storage",
    ]);
    const pipeline = await create_compute_pipeline(
      device,
      [layout],
      shaderCode,
      "parity_main",
      "montgomery-parity",
    );
    const bg = create_bind_group(device, layout, [inU32Sb, inF32Sb, outU32Sb, outF32Sb]);

    const WORKGROUP_SIZE = 64;
    const numXWorkgroups = Math.ceil(N / WORKGROUP_SIZE);
    const encoder = device.createCommandEncoder();
    await execute_pipeline(encoder, pipeline, bg, numXWorkgroups, 1, 1);

    const data = await read_from_gpu(device, encoder, [outU32Sb, outF32Sb]);
    inU32Sb.destroy();
    inF32Sb.destroy();
    outU32Sb.destroy();
    outF32Sb.destroy();
    context.destroy();

    // Decode u32 outputs via the existing helper (works on whole-buffer
    // u8 input and returns N BigInts).
    const outU32Bigints = u8s_to_bigints(data[0], NUM_WORDS_U32, WORD_SIZE_U32);
    // Decode f32 outputs into BigInts via limbs23ToBigint.
    const outF32 = new Float32Array(
      data[1].buffer,
      data[1].byteOffset,
      data[1].byteLength / 4,
    );
    const outF32Bigints: bigint[] = [];
    for (let i = 0; i < N; i++) {
      const limbs = outF32.subarray(i * NUM_LIMBS_F32, (i + 1) * NUM_LIMBS_F32);
      outF32Bigints.push(limbs23ToBigint(limbs));
    }

    // Un-Mont both raw outputs into canonical field form. u32 raw output
    // is (x·y · R_u) mod p; multiply by R_u^-1 mod p → (x·y) mod p.
    // Same for f32 with R_f. Both canonical values must equal each
    // other and the host reference (x·y) mod p.
    let failures = 0;
    const firstFailures: string[] = [];
    for (let i = 0; i < N; i++) {
      const ru_raw = outU32Bigints[i];
      const rf_raw = outF32Bigints[i];
      const ru = (ru_raw * Rinv_u32) % p;
      const rf = (rf_raw * Rinv_f32) % p;
      if (ru !== rf || ru !== expected[i]) {
        failures++;
        if (firstFailures.length < 5) {
          const [x, y] = pairs[i];
          firstFailures.push(
            `i=${i}: x=0x${x.toString(16)}, y=0x${y.toString(16)}\n` +
              `    x_mont(u32)=0x${xMontU32[i].toString(16)}\n` +
              `    y_mont(u32)=0x${yMontU32[i].toString(16)}\n` +
              `    raw_u32=0x${ru_raw.toString(16)} (canon=0x${ru.toString(16)})\n` +
              `    raw_f32=0x${rf_raw.toString(16)} (canon=0x${rf.toString(16)})\n` +
              `    expected=0x${expected[i].toString(16)}`,
          );
        }
      }
    }

    const matched = N - failures;
    if (failures === 0) {
      return {
        name,
        ok: true,
        detail: `${matched}/${N} matched (8 corners + ${N - 8} random)`,
      };
    }
    return {
      name,
      ok: false,
      detail: `${failures}/${N} mismatched. First failures:\n  ${firstFailures.join("\n  ")}`,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// --------- field_f32 per-op tests ----------

// Run a compute pipeline on `inputs` (one BigIntF32 per element if `binary`
// is false, two if true). The shader source must define an `op` function
// with signature `(a: BigIntF32) -> BigIntF32` (unary) or
// `(a, b: BigIntF32) -> BigIntF32` (binary). Returns one BigIntF32 per
// input slot, as `bigint`s.
async function runFieldF32Op(
  bodyOp: string,
  inputsX: number[][],
  inputsY: number[][] | null,
): Promise<bigint[]> {
  const N = inputsX.length;
  const isBinary = inputsY !== null;

  const xs = new Float32Array(N * NUM_LIMBS_F32);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < NUM_LIMBS_F32; j++) xs[i * NUM_LIMBS_F32 + j] = inputsX[i][j];
  }
  let ys: Float32Array | null = null;
  if (isBinary) {
    ys = new Float32Array(N * NUM_LIMBS_F32);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < NUM_LIMBS_F32; j++) ys[i * NUM_LIMBS_F32 + j] = inputsY![i][j];
    }
  }

  const context = await GpuContext.create();
  const sm = context.getShaderManager(BN254_CURVE_CONFIG, 4, N);
  const helpers = sm.gen_field_f32_shader();
  const WORKGROUP_SIZE = 64;

  let bindings: string;
  let dispatch: string;
  if (isBinary) {
    bindings = `
@group(0) @binding(0) var<storage, read>       xs:      array<BigIntF32>;
@group(0) @binding(1) var<storage, read>       ys:      array<BigIntF32>;
@group(0) @binding(2) var<storage, read_write> outputs: array<BigIntF32>;
`;
    dispatch = `
@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= ${N}u) { return; }
    var a = xs[i];
    var b = ys[i];
    outputs[i] = ${bodyOp};
}
`;
  } else {
    bindings = `
@group(0) @binding(0) var<storage, read>       xs:      array<BigIntF32>;
@group(0) @binding(1) var<storage, read_write> outputs: array<BigIntF32>;
`;
    dispatch = `
@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= ${N}u) { return; }
    var a = xs[i];
    outputs[i] = ${bodyOp};
}
`;
  }
  const shaderCode = `${helpers}\n${bindings}\n${dispatch}`;

  const { device } = context;
  const xsSb = create_and_write_sb(device, new Uint8Array(xs.buffer));
  const ysSb = isBinary
    ? create_and_write_sb(device, new Uint8Array(ys!.buffer))
    : null;
  const outSb = device.createBuffer({
    size: N * NUM_LIMBS_F32 * 4,
    usage:
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });

  const layout = isBinary
    ? create_bind_group_layout(device, ["read-only-storage", "read-only-storage", "storage"])
    : create_bind_group_layout(device, ["read-only-storage", "storage"]);
  const pipeline = await create_compute_pipeline(
    device,
    [layout],
    shaderCode,
    "main",
    "field-f32-unit-test",
  );
  const bg = isBinary
    ? create_bind_group(device, layout, [xsSb, ysSb!, outSb])
    : create_bind_group(device, layout, [xsSb, outSb]);

  const numXWorkgroups = Math.ceil(N / WORKGROUP_SIZE);
  const encoder = device.createCommandEncoder();
  await execute_pipeline(encoder, pipeline, bg, numXWorkgroups, 1, 1);

  const data = await read_from_gpu(device, encoder, [outSb]);
  xsSb.destroy();
  if (ysSb) ysSb.destroy();
  outSb.destroy();
  context.destroy();

  const outF32 = new Float32Array(
    data[0].buffer,
    data[0].byteOffset,
    data[0].byteLength / 4,
  );
  const results: bigint[] = [];
  for (let i = 0; i < N; i++) {
    const limbs = outF32.subarray(i * NUM_LIMBS_F32, (i + 1) * NUM_LIMBS_F32);
    results.push(limbs23ToBigint(limbs));
  }
  return results;
}

// Build the common test sample set: corners + 50 random pairs. Returned
// as plain bigints in [0, p). Callers convert to Montgomery form / limbs
// as needed.
function buildPairsForFieldF32Test(
  p: bigint,
): { xs: bigint[]; ys: bigint[] } {
  // Corners: include 0, 1, p-1, p/2 plus a few extra interesting points
  // (small powers of 2, R, etc.).
  const corners: Array<[bigint, bigint]> = [
    [0n, 0n],
    [0n, 1n],
    [1n, 0n],
    [1n, 1n],
    [p - 1n, 1n],
    [p - 1n, p - 1n],
    [p / 2n, p / 2n],
    [p / 2n, 1n],
    [(p - 1n) / 2n, 2n],
    [(p + 1n) / 2n, 2n],
  ];
  const xs: bigint[] = [];
  const ys: bigint[] = [];
  for (const [x, y] of corners) {
    xs.push(x);
    ys.push(y);
  }
  for (let i = 0; i < 50; i++) {
    xs.push(randomBelow(p));
    ys.push(randomBelow(p));
  }
  return { xs, ys };
}

interface CompareReport {
  failures: number;
  total: number;
  firstFailures: string[];
}

function compareBigints(
  got: bigint[],
  expected: bigint[],
  formatInput: (i: number) => string,
): CompareReport {
  let failures = 0;
  const firstFailures: string[] = [];
  for (let i = 0; i < got.length; i++) {
    if (got[i] !== expected[i]) {
      failures++;
      if (firstFailures.length < 5) {
        firstFailures.push(
          `${formatInput(i)}\n` +
            `    expected: 0x${expected[i].toString(16)}\n` +
            `    actual:   0x${got[i].toString(16)}`,
        );
      }
    }
  }
  return { failures, total: got.length, firstFailures };
}

function makeReport(name: string, r: CompareReport, detailOnPass: string): UnitTestResult {
  if (r.failures === 0) {
    return { name, ok: true, detail: detailOnPass };
  }
  return {
    name,
    ok: false,
    detail: `${r.failures}/${r.total} mismatched. First failures:\n  ${r.firstFailures.join("\n  ")}`,
  };
}

// fr_add_f32(a_mont, b_mont) = ((a + b) * R_f) mod p = (a*R_f + b*R_f) mod p
export async function testFieldAddF32(): Promise<UnitTestResult> {
  const name = `fr_add_f32 (23-bit f32 field add)`;
  try {
    const p = BN254_CURVE_CONFIG.baseFieldModulus;
    const R = compute_misc_params(p, WORD_SIZE_F32).r;
    const { xs, ys } = buildPairsForFieldF32Test(p);
    const N = xs.length;

    const inputsX = xs.map((x) => bigintTo23BitLimbs((x * R) % p));
    const inputsY = ys.map((y) => bigintTo23BitLimbs((y * R) % p));
    const expected = xs.map((_, i) => ((xs[i] + ys[i]) * R) % p);

    const got = await runFieldF32Op("fr_add_f32(&a, &b)", inputsX, inputsY);
    const r = compareBigints(got, expected, (i) =>
      `pair[${i}]: a=0x${xs[i].toString(16)}, b=0x${ys[i].toString(16)}`,
    );
    return makeReport(name, r, `${N} pairs (corners + 50 random) all matched`);
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// fr_sub_f32(a_mont, b_mont) = ((a - b) mod p) * R_f mod p
export async function testFieldSubF32(): Promise<UnitTestResult> {
  const name = `fr_sub_f32 (23-bit f32 field sub)`;
  try {
    const p = BN254_CURVE_CONFIG.baseFieldModulus;
    const R = compute_misc_params(p, WORD_SIZE_F32).r;
    const { xs, ys } = buildPairsForFieldF32Test(p);
    const N = xs.length;

    const inputsX = xs.map((x) => bigintTo23BitLimbs((x * R) % p));
    const inputsY = ys.map((y) => bigintTo23BitLimbs((y * R) % p));
    const expected = xs.map((_, i) => {
      const diff = ((xs[i] - ys[i]) % p + p) % p;
      return (diff * R) % p;
    });

    const got = await runFieldF32Op("fr_sub_f32(&a, &b)", inputsX, inputsY);
    const r = compareBigints(got, expected, (i) =>
      `pair[${i}]: a=0x${xs[i].toString(16)}, b=0x${ys[i].toString(16)}`,
    );
    return makeReport(name, r, `${N} pairs (corners + 50 random) all matched`);
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// fr_double_f32(a_mont) = (2a * R_f) mod p
export async function testFieldDoubleF32(): Promise<UnitTestResult> {
  const name = `fr_double_f32 (23-bit f32 field double)`;
  try {
    const p = BN254_CURVE_CONFIG.baseFieldModulus;
    const R = compute_misc_params(p, WORD_SIZE_F32).r;
    const { xs } = buildPairsForFieldF32Test(p);
    const N = xs.length;

    const inputsX = xs.map((x) => bigintTo23BitLimbs((x * R) % p));
    const expected = xs.map((x) => ((2n * x) % p * R) % p);

    const got = await runFieldF32Op("fr_double_f32(&a)", inputsX, null);
    const r = compareBigints(got, expected, (i) =>
      `singleton[${i}]: a=0x${xs[i].toString(16)}`,
    );
    return makeReport(name, r, `${N} singletons (corners + 50 random) all matched`);
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// fr_neg_f32(a_mont) = ((p - a) mod p) * R_f mod p. Distinguished
// case a == 0 returns 0, not p.
export async function testFieldNegF32(): Promise<UnitTestResult> {
  const name = `fr_neg_f32 (23-bit f32 field negate)`;
  try {
    const p = BN254_CURVE_CONFIG.baseFieldModulus;
    const R = compute_misc_params(p, WORD_SIZE_F32).r;
    const { xs } = buildPairsForFieldF32Test(p);
    const N = xs.length;

    const inputsX = xs.map((x) => bigintTo23BitLimbs((x * R) % p));
    const expected = xs.map((x) => (x === 0n ? 0n : ((p - x) * R) % p));

    const got = await runFieldF32Op("fr_neg_f32(&a)", inputsX, null);
    const r = compareBigints(got, expected, (i) =>
      `singleton[${i}]: a=0x${xs[i].toString(16)}`,
    );
    return makeReport(name, r, `${N} singletons (corners + 50 random) all matched`);
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// fr_mul_f32(a_mont, b_mont) = a*b * R_f mod p (Montgomery-correct).
// Same identity as testMontgomeryProductF32 — included for naming
// symmetry with field_<op>_f32.
export async function testFieldMulF32(): Promise<UnitTestResult> {
  const name = `fr_mul_f32 (23-bit f32 field mul, alias of montgomery_product_f32)`;
  try {
    const p = BN254_CURVE_CONFIG.baseFieldModulus;
    const R = compute_misc_params(p, WORD_SIZE_F32).r;
    const { xs, ys } = buildPairsForFieldF32Test(p);
    const N = xs.length;

    const inputsX = xs.map((x) => bigintTo23BitLimbs((x * R) % p));
    const inputsY = ys.map((y) => bigintTo23BitLimbs((y * R) % p));
    const expected = xs.map((_, i) => ((xs[i] * ys[i]) % p * R) % p);

    const got = await runFieldF32Op("fr_mul_f32(&a, &b)", inputsX, inputsY);
    const r = compareBigints(got, expected, (i) =>
      `pair[${i}]: a=0x${xs[i].toString(16)}, b=0x${ys[i].toString(16)}`,
    );
    return makeReport(name, r, `${N} pairs (corners + 50 random) all matched`);
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// fr_sqr_f32(a_mont) = a^2 * R_f mod p
export async function testFieldSqrF32(): Promise<UnitTestResult> {
  const name = `fr_sqr_f32 (23-bit f32 field square)`;
  try {
    const p = BN254_CURVE_CONFIG.baseFieldModulus;
    const R = compute_misc_params(p, WORD_SIZE_F32).r;
    const { xs } = buildPairsForFieldF32Test(p);
    const N = xs.length;

    const inputsX = xs.map((x) => bigintTo23BitLimbs((x * R) % p));
    const expected = xs.map((x) => ((x * x) % p * R) % p);

    const got = await runFieldF32Op("fr_sqr_f32(&a)", inputsX, null);
    const r = compareBigints(got, expected, (i) =>
      `singleton[${i}]: a=0x${xs[i].toString(16)}`,
    );
    return makeReport(name, r, `${N} singletons (corners + 50 random) all matched`);
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// fr_inv_f32(a_mont) = (a^-1 * R_f) mod p. The Mont-form round-trip
// a_mont * inv_mont = (a * R_f) * (a^-1 * R_f) * R_f^-1 = R_f.
// For a == 0 the Fermat exponent gives 0^(p-2) = 0, so the output
// limbs are all zero.
export async function testFieldInvF32(): Promise<UnitTestResult> {
  const name = `fr_inv_f32 (23-bit f32 Fermat inverse)`;
  try {
    const p = BN254_CURVE_CONFIG.baseFieldModulus;
    const R = compute_misc_params(p, WORD_SIZE_F32).r;
    const Rinv = compute_misc_params(p, WORD_SIZE_F32).rinv;
    const { xs } = buildPairsForFieldF32Test(p);
    const N = xs.length;

    const inputsX = xs.map((x) => bigintTo23BitLimbs((x * R) % p));
    // Reference: a^-1 in Mont form. For a==0 the Fermat exponent gives 0.
    const expected = xs.map((x) => {
      if (x === 0n) return 0n;
      // a * a^-1 = 1 (canonical), so a^-1 = a^(p-2). In Mont form:
      // mont(a^-1) = a^-1 * R = a^(p-2) * R.
      let inv = 1n;
      let base = x % p;
      let exp = p - 2n;
      while (exp > 0n) {
        if (exp & 1n) inv = (inv * base) % p;
        base = (base * base) % p;
        exp >>= 1n;
      }
      return (inv * R) % p;
    });
    // sanity check using Rinv to make sure (R * Rinv) % p == 1
    if ((R * Rinv) % p !== 1n) {
      return { name, ok: false, detail: "R * Rinv mod p != 1 (host setup error)" };
    }

    const got = await runFieldF32Op("fr_inv_f32(a)", inputsX, null);
    const r = compareBigints(got, expected, (i) =>
      `singleton[${i}]: a=0x${xs[i].toString(16)}`,
    );
    return makeReport(name, r, `${N} singletons (corners + 50 random) all matched`);
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// fr_pow_f32(a_mont, exp_canonical) = (a^exp * R_f) mod p
// Note: exp is a plain canonical BigIntF32 (NOT in Mont form) — only
// its bit pattern matters.
export async function testFieldPowF32(): Promise<UnitTestResult> {
  const name = `fr_pow_f32 (23-bit f32 square-and-multiply)`;
  try {
    const p = BN254_CURVE_CONFIG.baseFieldModulus;
    const R = compute_misc_params(p, WORD_SIZE_F32).r;
    const { xs } = buildPairsForFieldF32Test(p);
    // For the exponent stream: pair each base with a different
    // exponent — small ints and a couple of large random exponents
    // covering different bit patterns.
    const exps: bigint[] = xs.map((_, i) => {
      if (i < 6) return BigInt(i); // 0, 1, 2, 3, 4, 5
      if (i === 6) return (1n << 23n) - 1n; // full single limb
      if (i === 7) return 1n << 23n; // limb boundary
      if (i === 8) return p - 2n; // Fermat exp
      if (i === 9) return (p + 1n) / 4n; // sqrt exp
      return randomBelow(p);
    });
    const N = xs.length;

    const inputsX = xs.map((x) => bigintTo23BitLimbs((x * R) % p));
    const inputsE = exps.map((e) => bigintTo23BitLimbs(e));
    const expected = xs.map((x, i) => {
      let r = 1n;
      let b = x % p;
      let e = exps[i];
      while (e > 0n) {
        if (e & 1n) r = (r * b) % p;
        b = (b * b) % p;
        e >>= 1n;
      }
      return (r * R) % p;
    });

    // Use a custom shader since fr_pow_f32 takes (base, exp) not pointers.
    // We embed the exponent as the `b` slot's BigIntF32 — the existing
    // runner already wires up two inputs.
    const got = await runFieldF32Op("fr_pow_f32(a, b)", inputsX, inputsE);
    const r = compareBigints(got, expected, (i) =>
      `pair[${i}]: a=0x${xs[i].toString(16)}, e=0x${exps[i].toString(16)}`,
    );
    return makeReport(name, r, `${N} (base, exp) pairs (corners + 50 random) all matched`);
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// fr_sqrt_f32(a_mont) returns one of the two square roots of a in
// Montgomery form, when a is a quadratic residue. Verify s^2 == a
// for QRs (test by squaring the input then taking sqrt — guaranteed
// QR). Don't constrain which root is returned.
export async function testFieldSqrtF32(): Promise<UnitTestResult> {
  const name = `fr_sqrt_f32 (23-bit f32 (p+1)/4 sqrt)`;
  try {
    const p = BN254_CURVE_CONFIG.baseFieldModulus;
    const R = compute_misc_params(p, WORD_SIZE_F32).r;
    const Rinv = compute_misc_params(p, WORD_SIZE_F32).rinv;
    const { xs } = buildPairsForFieldF32Test(p);
    // Square each input to guarantee QR. The shader sqrt's the squares
    // and we compare s^2 vs a_squared (both Mont). For a == 0 the sqrt
    // is 0 too.
    const squares: bigint[] = xs.map((x) => (x * x) % p);
    const N = xs.length;

    const inputsX = squares.map((s) => bigintTo23BitLimbs((s * R) % p));

    const got = await runFieldF32Op("fr_sqrt_f32(a)", inputsX, null);

    // Verify (got)^2 == squares in canonical form. Got is in Mont form:
    // got = sqrt(a) * R; (got)^2 = sqrt(a)^2 * R^2 = a * R^2. The
    // canonical (got * Rinv)^2 should equal squares[i].
    let failures = 0;
    const firstFailures: string[] = [];
    for (let i = 0; i < N; i++) {
      const sqrtMont = got[i];
      const sqrtCanonical = (sqrtMont * Rinv) % p;
      const squared = (sqrtCanonical * sqrtCanonical) % p;
      if (squared !== squares[i]) {
        failures++;
        if (firstFailures.length < 5) {
          firstFailures.push(
            `i=${i}: a_canonical=0x${squares[i].toString(16)}\n` +
              `    sqrt_mont=0x${sqrtMont.toString(16)}, canonical=0x${sqrtCanonical.toString(16)}\n` +
              `    sqrt^2=0x${squared.toString(16)}`,
          );
        }
      }
    }

    if (failures === 0) {
      return { name, ok: true, detail: `${N} QR inputs (corners + 50 random) all matched s^2 == a` };
    }
    return {
      name,
      ok: false,
      detail: `${failures}/${N} mismatched. First failures:\n  ${firstFailures.join("\n  ")}`,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// --------- ec_bn254_f32 (curve) per-op tests ----------

// Random non-zero scalar in [1, n) where n is the BN254 scalar field order.
function randomScalar(): bigint {
  while (true) {
    const s = randomBelow(BN254_SCALAR_FIELD);
    if (s !== 0n) return s;
  }
}

// 30 distinct random Jacobian points on BN254. Generated as scalar
// multiples of G so they're guaranteed to lie on the curve. Returned in
// canonical (non-Montgomery) form.
function generateRandomJacobianPoints(count: number): Bn254Jacobian[] {
  // G = (1, 2, 1) on BN254 (short Weierstrass y^2 = x^3 + 3).
  const G: Bn254Jacobian = { x: 1n, y: 2n, z: 1n };
  const pts: Bn254Jacobian[] = [];
  for (let i = 0; i < count; i++) {
    pts.push(scalarMultBn254Jacobian(G, randomScalar()));
  }
  return pts;
}

// Convert a Jacobian point's canonical coords into f32-Mont limb form.
// Identity (Z=0) is encoded as all-zero limbs across X/Y/Z — the shader
// is_zero_f32(z) test matches the host BN254_JACOBIAN_ZERO sentinel.
function pointToF32MontLimbs(
  p: Bn254Jacobian,
  R: bigint,
  modulus: bigint,
): { x: number[]; y: number[]; z: number[] } {
  if (p.z === 0n) {
    const zero = new Array<number>(NUM_LIMBS_F32).fill(0);
    return { x: zero.slice(), y: zero.slice(), z: zero.slice() };
  }
  return {
    x: bigintTo23BitLimbs((p.x * R) % modulus),
    y: bigintTo23BitLimbs((p.y * R) % modulus),
    z: bigintTo23BitLimbs((p.z * R) % modulus),
  };
}

// Inverse: GPU-output limbs (Montgomery form) -> canonical Jacobian point.
function f32MontLimbsToPoint(
  xLimbs: ArrayLike<number>,
  yLimbs: ArrayLike<number>,
  zLimbs: ArrayLike<number>,
  Rinv: bigint,
  modulus: bigint,
): Bn254Jacobian {
  const xMont = limbs23ToBigint(xLimbs);
  const yMont = limbs23ToBigint(yLimbs);
  const zMont = limbs23ToBigint(zLimbs);
  if (zMont === 0n) {
    // Identity sentinel survives the round-trip: Mont(0) = 0, so any
    // Z-limbs all-zero signals identity regardless of X/Y content.
    return BN254_JACOBIAN_ZERO;
  }
  return {
    x: (xMont * Rinv) % modulus,
    y: (yMont * Rinv) % modulus,
    z: (zMont * Rinv) % modulus,
  };
}

// Compare two Jacobian points as affine. Both must be on-curve. Identity
// is handled via the Z == 0 sentinel.
function jacobianEqAffine(
  a: Bn254Jacobian,
  b: Bn254Jacobian,
): boolean {
  if (a.z === 0n || b.z === 0n) return a.z === 0n && b.z === 0n;
  const aAff = toAffineBn254Jacobian(a);
  const bAff = toAffineBn254Jacobian(b);
  return aAff.x === bAff.x && aAff.y === bAff.y;
}

function formatPoint(p: Bn254Jacobian): string {
  return `(x=0x${p.x.toString(16)}, y=0x${p.y.toString(16)}, z=0x${p.z.toString(16)})`;
}

// Run a compute pipeline over an array of PointF32 inputs. The shader
// must define an `op` function callable as `${bodyOp}` with the local
// variables `p1` (and optionally `p2`) in scope. Returns one PointF32
// per input slot, decoded back to canonical Jacobian coordinates.
async function runCurveF32Op(
  bodyOp: string,
  binary: boolean,
  inputsP1: Bn254Jacobian[],
  inputsP2: Bn254Jacobian[] | null,
): Promise<Bn254Jacobian[]> {
  const N = inputsP1.length;
  if (binary && (!inputsP2 || inputsP2.length !== N)) {
    throw new Error("runCurveF32Op: binary expects inputsP2 of equal length");
  }

  const p = BN254_CURVE_CONFIG.baseFieldModulus;
  const params = compute_misc_params(p, WORD_SIZE_F32);
  const R = params.r;
  const Rinv = params.rinv;

  // Each PointF32 = 3 × BigIntF32 = 3 × NUM_LIMBS_F32 × f32 = 144 bytes.
  // Pack [x_limbs, y_limbs, z_limbs] contiguously per point.
  const pointStride = 3 * NUM_LIMBS_F32;
  const xs = new Float32Array(N * pointStride);
  for (let i = 0; i < N; i++) {
    const lim = pointToF32MontLimbs(inputsP1[i], R, p);
    for (let j = 0; j < NUM_LIMBS_F32; j++) xs[i * pointStride + j] = lim.x[j];
    for (let j = 0; j < NUM_LIMBS_F32; j++) xs[i * pointStride + NUM_LIMBS_F32 + j] = lim.y[j];
    for (let j = 0; j < NUM_LIMBS_F32; j++) xs[i * pointStride + 2 * NUM_LIMBS_F32 + j] = lim.z[j];
  }
  let ys: Float32Array | null = null;
  if (binary) {
    ys = new Float32Array(N * pointStride);
    for (let i = 0; i < N; i++) {
      const lim = pointToF32MontLimbs(inputsP2![i], R, p);
      for (let j = 0; j < NUM_LIMBS_F32; j++) ys[i * pointStride + j] = lim.x[j];
      for (let j = 0; j < NUM_LIMBS_F32; j++) ys[i * pointStride + NUM_LIMBS_F32 + j] = lim.y[j];
      for (let j = 0; j < NUM_LIMBS_F32; j++) ys[i * pointStride + 2 * NUM_LIMBS_F32 + j] = lim.z[j];
    }
  }

  const context = await GpuContext.create();
  const sm = context.getShaderManager(BN254_CURVE_CONFIG, 4, N);
  const helpers = sm.gen_curve_f32_shader();
  const WORKGROUP_SIZE = 64;

  let bindings: string;
  let dispatch: string;
  if (binary) {
    bindings = `
@group(0) @binding(0) var<storage, read>       xs:      array<PointF32>;
@group(0) @binding(1) var<storage, read>       ys:      array<PointF32>;
@group(0) @binding(2) var<storage, read_write> outputs: array<PointF32>;
`;
    dispatch = `
@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= ${N}u) { return; }
    let p1 = xs[i];
    let p2 = ys[i];
    outputs[i] = ${bodyOp};
}
`;
  } else {
    bindings = `
@group(0) @binding(0) var<storage, read>       xs:      array<PointF32>;
@group(0) @binding(1) var<storage, read_write> outputs: array<PointF32>;
`;
    dispatch = `
@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= ${N}u) { return; }
    let p1 = xs[i];
    outputs[i] = ${bodyOp};
}
`;
  }
  const shaderCode = `${helpers}\n${bindings}\n${dispatch}`;

  const { device } = context;
  const xsSb = create_and_write_sb(device, new Uint8Array(xs.buffer));
  const ysSb = binary
    ? create_and_write_sb(device, new Uint8Array(ys!.buffer))
    : null;
  const outSb = device.createBuffer({
    size: N * pointStride * 4,
    usage:
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });

  const layout = binary
    ? create_bind_group_layout(device, ["read-only-storage", "read-only-storage", "storage"])
    : create_bind_group_layout(device, ["read-only-storage", "storage"]);
  const pipeline = await create_compute_pipeline(
    device,
    [layout],
    shaderCode,
    "main",
    "curve-f32-unit-test",
  );
  const bg = binary
    ? create_bind_group(device, layout, [xsSb, ysSb!, outSb])
    : create_bind_group(device, layout, [xsSb, outSb]);

  const numXWorkgroups = Math.ceil(N / WORKGROUP_SIZE);
  const encoder = device.createCommandEncoder();
  await execute_pipeline(encoder, pipeline, bg, numXWorkgroups, 1, 1);

  const data = await read_from_gpu(device, encoder, [outSb]);
  xsSb.destroy();
  if (ysSb) ysSb.destroy();
  outSb.destroy();
  context.destroy();

  const outF32 = new Float32Array(
    data[0].buffer,
    data[0].byteOffset,
    data[0].byteLength / 4,
  );
  const results: Bn254Jacobian[] = [];
  for (let i = 0; i < N; i++) {
    const off = i * pointStride;
    const xLimbs = outF32.subarray(off, off + NUM_LIMBS_F32);
    const yLimbs = outF32.subarray(off + NUM_LIMBS_F32, off + 2 * NUM_LIMBS_F32);
    const zLimbs = outF32.subarray(off + 2 * NUM_LIMBS_F32, off + 3 * NUM_LIMBS_F32);
    results.push(f32MontLimbsToPoint(xLimbs, yLimbs, zLimbs, Rinv, p));
  }
  return results;
}

// Common test-set: 30 random Jacobian points + a few edge cases. Edge
// cases let each unary op exercise identity / known-doubling-of-G; binary
// ops add P+(-P) and P+P.
function buildCurveF32TestPoints(): {
  unary: { inputs: Bn254Jacobian[]; labels: string[] };
  binary: { inputsP1: Bn254Jacobian[]; inputsP2: Bn254Jacobian[]; labels: string[] };
} {
  const G: Bn254Jacobian = { x: 1n, y: 2n, z: 1n };
  const TWO_G = doubleBn254Jacobian(G);
  const NEG_G: Bn254Jacobian = { x: G.x, y: BN254_CURVE_CONFIG.baseFieldModulus - G.y, z: G.z };

  const random = generateRandomJacobianPoints(30);

  // Unary edge cases: identity, G, 2G, NEG_G, then the 30 random.
  const unaryInputs: Bn254Jacobian[] = [
    BN254_JACOBIAN_ZERO,
    G,
    TWO_G,
    NEG_G,
    ...random,
  ];
  const unaryLabels: string[] = [
    "identity",
    "G",
    "2G",
    "-G",
    ...random.map((_, i) => `random[${i}]`),
  ];

  // Binary edge cases:
  //   identity + G          (left identity)
  //   G + identity          (right identity)
  //   G + (-G)              (sum to identity)
  //   G + G                 (doubling via add)
  //   then pairs of randoms.
  const binaryP1: Bn254Jacobian[] = [
    BN254_JACOBIAN_ZERO,
    G,
    G,
    G,
  ];
  const binaryP2: Bn254Jacobian[] = [
    G,
    BN254_JACOBIAN_ZERO,
    NEG_G,
    G,
  ];
  const binaryLabels: string[] = [
    "identity + G",
    "G + identity",
    "G + (-G)",
    "G + G (== 2G via add)",
  ];
  // Pair random[i] with random[(i+1) % 30].
  for (let i = 0; i < random.length; i++) {
    binaryP1.push(random[i]);
    binaryP2.push(random[(i + 1) % random.length]);
    binaryLabels.push(`random[${i}] + random[${(i + 1) % random.length}]`);
  }

  return {
    unary: { inputs: unaryInputs, labels: unaryLabels },
    binary: { inputsP1: binaryP1, inputsP2: binaryP2, labels: binaryLabels },
  };
}

function compareJacobian(
  got: Bn254Jacobian[],
  expected: Bn254Jacobian[],
  labels: string[],
): { failures: number; total: number; firstFailures: string[] } {
  let failures = 0;
  const firstFailures: string[] = [];
  for (let i = 0; i < got.length; i++) {
    if (!jacobianEqAffine(got[i], expected[i])) {
      failures++;
      if (firstFailures.length < 5) {
        firstFailures.push(
          `${labels[i]}\n` +
            `    expected: ${formatPoint(expected[i])}\n` +
            `    actual:   ${formatPoint(got[i])}`,
        );
      }
    }
  }
  return { failures, total: got.length, firstFailures };
}

// double_point_f32(P) — Jacobian doubling.
export async function testPointDoubleF32(): Promise<UnitTestResult> {
  const name = `double_point_f32 (23-bit f32 Jacobian doubling)`;
  try {
    const { unary } = buildCurveF32TestPoints();
    const expected = unary.inputs.map((p) => doubleBn254Jacobian(p));
    const got = await runCurveF32Op("double_point_f32(p1)", false, unary.inputs, null);
    const r = compareJacobian(got, expected, unary.labels);
    return makeReport(name, r, `${unary.inputs.length} inputs (edge cases + random) all matched`);
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// add_points_f32(P1, P2) — general Jacobian addition with collision fallback.
export async function testPointAddF32(): Promise<UnitTestResult> {
  const name = `add_points_f32 (23-bit f32 Jacobian add)`;
  try {
    const { binary } = buildCurveF32TestPoints();
    const expected = binary.inputsP1.map((p, i) =>
      addBn254Jacobian(p, binary.inputsP2[i]),
    );
    const got = await runCurveF32Op(
      "add_points_f32(p1, p2)",
      true,
      binary.inputsP1,
      binary.inputsP2,
    );
    const r = compareJacobian(got, expected, binary.labels);
    return makeReport(name, r, `${binary.inputsP1.length} pairs (edge cases + random) all matched`);
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// add_points_no_collision_f32: SAFETY-critical caller-guaranteed variant.
// We only feed it inputs known to be non-collision: random pairs plus
// identity short-circuits. Doubling cases would yield (0,0,0) and are
// excluded.
export async function testPointAddNoCollisionF32(): Promise<UnitTestResult> {
  const name = `add_points_no_collision_f32 (23-bit f32 no-collision add)`;
  try {
    const G: Bn254Jacobian = { x: 1n, y: 2n, z: 1n };
    const random = generateRandomJacobianPoints(30);

    const inputsP1: Bn254Jacobian[] = [
      BN254_JACOBIAN_ZERO, // identity short-circuit
      G,                   // identity short-circuit on right
    ];
    const inputsP2: Bn254Jacobian[] = [
      G,
      BN254_JACOBIAN_ZERO,
    ];
    const labels: string[] = ["identity + G", "G + identity"];
    for (let i = 0; i < random.length; i++) {
      inputsP1.push(random[i]);
      inputsP2.push(random[(i + 1) % random.length]);
      labels.push(`random[${i}] + random[${(i + 1) % random.length}]`);
    }

    const expected = inputsP1.map((p, i) =>
      addBn254Jacobian(p, inputsP2[i]),
    );
    const got = await runCurveF32Op(
      "add_points_no_collision_f32(p1, p2)",
      true,
      inputsP1,
      inputsP2,
    );
    const r = compareJacobian(got, expected, labels);
    return makeReport(name, r, `${inputsP1.length} pairs all matched`);
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// add_points_mixed_f32(P1, P2_affine_with_Z=1): mixed Jacobian + affine
// addition. We construct p2 in affine form (z=1) so the formula's Z2=1
// precondition holds. p2.z is IGNORED by the shader; we still pack a
// valid Mont-1 there to be conservative on shape.
export async function testPointAddMixedF32(): Promise<UnitTestResult> {
  const name = `add_points_mixed_f32 (23-bit f32 Jacobian + affine add)`;
  try {
    const G: Bn254Jacobian = { x: 1n, y: 2n, z: 1n };
    const TWO_G = doubleBn254Jacobian(G);
    const NEG_G: Bn254Jacobian = { x: G.x, y: BN254_CURVE_CONFIG.baseFieldModulus - G.y, z: 1n };

    // Convert each random Jacobian point to affine then back to Jacobian
    // with z=1 — gives us valid affine p2 inputs.
    const random = generateRandomJacobianPoints(30);
    const randomAff: Bn254Jacobian[] = random.map((p) => {
      const a = toAffineBn254Jacobian(p);
      return { x: a.x, y: a.y, z: 1n };
    });

    // p1 can be any Jacobian point; p2 must have z=1 (affine).
    const inputsP1: Bn254Jacobian[] = [
      BN254_JACOBIAN_ZERO, // identity short-circuit
      G,
      G,                   // doubling via mixed-add: G + G_affine
      G,                   // G + (-G)_affine
    ];
    const inputsP2: Bn254Jacobian[] = [
      G,
      TWO_G.z === 1n ? TWO_G : { x: toAffineBn254Jacobian(TWO_G).x, y: toAffineBn254Jacobian(TWO_G).y, z: 1n },
      G,
      NEG_G,
    ];
    const labels: string[] = [
      "identity + G",
      "G + 2G_aff",
      "G + G_aff (== 2G)",
      "G + (-G)_aff (== identity)",
    ];
    for (let i = 0; i < random.length; i++) {
      inputsP1.push(random[i]);
      inputsP2.push(randomAff[(i + 1) % random.length]);
      labels.push(`random[${i}] + randomAff[${(i + 1) % random.length}]`);
    }

    const expected = inputsP1.map((p, i) =>
      addBn254Jacobian(p, inputsP2[i]),
    );
    const got = await runCurveF32Op(
      "add_points_mixed_f32(p1, p2)",
      true,
      inputsP1,
      inputsP2,
    );
    const r = compareJacobian(got, expected, labels);
    return makeReport(name, r, `${inputsP1.length} pairs (edge + random) all matched`);
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// add_points_mixed_no_collision_f32: caller-guaranteed-non-collision mixed
// add. Identity short-circuit retained; doubling/inverse pairs excluded.
export async function testPointAddMixedNoCollisionF32(): Promise<UnitTestResult> {
  const name = `add_points_mixed_no_collision_f32 (23-bit f32 mixed no-collision)`;
  try {
    const G: Bn254Jacobian = { x: 1n, y: 2n, z: 1n };
    const random = generateRandomJacobianPoints(30);
    const randomAff: Bn254Jacobian[] = random.map((p) => {
      const a = toAffineBn254Jacobian(p);
      return { x: a.x, y: a.y, z: 1n };
    });

    const inputsP1: Bn254Jacobian[] = [BN254_JACOBIAN_ZERO]; // identity short-circuit
    const inputsP2: Bn254Jacobian[] = [G];
    const labels: string[] = ["identity + G"];
    for (let i = 0; i < random.length; i++) {
      inputsP1.push(random[i]);
      inputsP2.push(randomAff[(i + 1) % random.length]);
      labels.push(`random[${i}] + randomAff[${(i + 1) % random.length}]`);
    }

    const expected = inputsP1.map((p, i) =>
      addBn254Jacobian(p, inputsP2[i]),
    );
    const got = await runCurveF32Op(
      "add_points_mixed_no_collision_f32(p1, p2)",
      true,
      inputsP1,
      inputsP2,
    );
    const r = compareJacobian(got, expected, labels);
    return makeReport(name, r, `${inputsP1.length} pairs all matched`);
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// Consistency: G + G (via add_points_f32) must equal double_point_f32(G).
// Catches the strongly-unified vs add-2007-bl collision-fallback wiring
// in particular — a missed fallback returns (0,0,0) here.
export async function testPointAddEqualsDoubleF32(): Promise<UnitTestResult> {
  const name = `add_points_f32(G,G) == double_point_f32(G) (23-bit f32 consistency)`;
  try {
    const G: Bn254Jacobian = { x: 1n, y: 2n, z: 1n };
    const random = generateRandomJacobianPoints(30);
    const inputs: Bn254Jacobian[] = [G, ...random];
    const labels: string[] = ["G", ...random.map((_, i) => `random[${i}]`)];

    const doubled = await runCurveF32Op("double_point_f32(p1)", false, inputs, null);
    const added = await runCurveF32Op("add_points_f32(p1, p1)", false, inputs, null);

    let failures = 0;
    const firstFailures: string[] = [];
    for (let i = 0; i < inputs.length; i++) {
      if (!jacobianEqAffine(doubled[i], added[i])) {
        failures++;
        if (firstFailures.length < 5) {
          firstFailures.push(
            `${labels[i]}\n` +
              `    double:  ${formatPoint(doubled[i])}\n` +
              `    add P+P: ${formatPoint(added[i])}`,
          );
        }
      }
    }
    if (failures === 0) {
      return { name, ok: true, detail: `${inputs.length} points: add(P,P) matches double(P)` };
    }
    return {
      name,
      ok: false,
      detail: `${failures}/${inputs.length} mismatched. First failures:\n  ${firstFailures.join("\n  ")}`,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// --------- f32 MSM end-to-end test ----------

// Pack canonical affine (x, y) into the raw byte layout the f32 MSM
// driver expects: interleaved [x_le32, y_le32, x_le32, y_le32, ...].
function packAffineBytes(points: { x: bigint; y: bigint }[]): Uint8Array {
  const out = new Uint8Array(points.length * 64);
  for (let i = 0; i < points.length; i++) {
    let xv = points[i].x;
    let yv = points[i].y;
    const off = i * 64;
    for (let k = 0; k < 32; k++) {
      out[off + k] = Number(xv & 0xffn);
      xv >>= 8n;
    }
    for (let k = 0; k < 32; k++) {
      out[off + 32 + k] = Number(yv & 0xffn);
      yv >>= 8n;
    }
  }
  return out;
}

function packScalarBytes(scalars: bigint[]): Uint8Array {
  const out = new Uint8Array(scalars.length * 32);
  for (let i = 0; i < scalars.length; i++) {
    let s = scalars[i];
    const off = i * 32;
    for (let k = 0; k < 32; k++) {
      out[off + k] = Number(s & 0xffn);
      s >>= 8n;
    }
  }
  return out;
}

// Σ s_i · P_i over BN254 via noble's MSM. Used as the ground-truth
// reference for `testMsmF32End2End`.
function nobleMsmReference(
  points: { x: bigint; y: bigint }[],
  scalars: bigint[],
): { x: bigint; y: bigint } {
  const projPoints = points.map((p) => bn254.G1.ProjectivePoint.fromAffine(p));
  const result = bn254.G1.ProjectivePoint.msm(projPoints, scalars);
  return result.toAffine();
}

// End-to-end correctness for the f32-Montgomery MSM driver. Builds
// `N = 2^logN` random Jacobian base points (as scalar multiples of G,
// converted to affine) plus `N` random scalars, runs them through
// `compute_bn254_msm_f32`, and compares the affine result against
// `bn254.G1.ProjectivePoint.msm` from noble.
//
// SMOKE-TEST NOTE: defaults to `logN = 10` (N = 1024). The shaders
// require `chunk_size = 4` at this size (the small-N policy in
// msm.ts kicks in below N = 65536) so this DOES exercise the same
// SMVP / BPR / horner pipeline as production — just on a much smaller
// scalar grid. The full perf comparison at logN = 20 is step 5 of
// the FMA-Montgomery overhaul. Call with `logN = 16` to exercise the
// chunk_size = 15 production path (slow on a cold device: minutes
// for the GPU MSM at this size on Chrome; minutes more for noble).
export async function testMsmF32End2End(
  logN: number = 10,
): Promise<UnitTestResult> {
  const N = 1 << logN;
  const isSmokeTest = logN < 16;
  const name = `f32 MSM end-to-end (logN=${logN}, N=${N}${
    isSmokeTest ? "; smoke test, reduced N" : ""
  })`;
  try {
    // Generate N base points as scalar multiples of G so they're
    // guaranteed on-curve and statistically independent. Each multiple
    // uses a distinct random scalar.
    const G: Bn254Jacobian = { x: 1n, y: 2n, z: 1n };
    const affinePoints: { x: bigint; y: bigint }[] = new Array(N);
    const scalars: bigint[] = new Array(N);
    for (let i = 0; i < N; i++) {
      const pjac = scalarMultBn254Jacobian(G, randomScalar());
      const paff = toAffineBn254Jacobian(pjac);
      affinePoints[i] = { x: paff.x, y: paff.y };
      scalars[i] = randomScalar();
    }

    const pointsBuf = packAffineBytes(affinePoints);
    const scalarsBuf = packScalarBytes(scalars);

    const gpuResult = await compute_bn254_msm_f32(
      pointsBuf as unknown as Buffer,
      scalarsBuf as unknown as Buffer,
    );
    const nobleResult = nobleMsmReference(affinePoints, scalars);

    if (gpuResult.x === nobleResult.x && gpuResult.y === nobleResult.y) {
      return {
        name,
        ok: true,
        detail: `N=${N}: f32 GPU MSM matches noble bigint reference`,
      };
    }
    return {
      name,
      ok: false,
      detail:
        `mismatch at N=${N}\n` +
        `    gpu.x   = 0x${gpuResult.x.toString(16)}\n` +
        `    gpu.y   = 0x${gpuResult.y.toString(16)}\n` +
        `    noble.x = 0x${nobleResult.x.toString(16)}\n` +
        `    noble.y = 0x${nobleResult.y.toString(16)}`,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// End-to-end correctness for the batch-affine f32 MSM driver. Mirrors
// `testMsmF32End2End`, but routes through `compute_bn254_msm_batch_affine_f32`
// (the production-fast f32 entry point) instead of the legacy SMVP+BPR
// `compute_bn254_msm_f32`. Cold-spins its own `GpuContext` + f32 cached
// bases so the test is self-contained; the dev page's warm-cached path
// shares the same code via shared exports.
export async function testMsmBatchAffineF32End2End(
  logN: number = 10,
): Promise<UnitTestResult> {
  const N = 1 << logN;
  const isSmokeTest = logN < 16;
  const name = `f32 batch-affine MSM end-to-end (logN=${logN}, N=${N}${
    isSmokeTest ? "; smoke test, reduced N" : ""
  })`;
  try {
    const G: Bn254Jacobian = { x: 1n, y: 2n, z: 1n };
    const affinePoints: { x: bigint; y: bigint }[] = new Array(N);
    const scalars: bigint[] = new Array(N);
    for (let i = 0; i < N; i++) {
      const pjac = scalarMultBn254Jacobian(G, randomScalar());
      const paff = toAffineBn254Jacobian(pjac);
      affinePoints[i] = { x: paff.x, y: paff.y };
      scalars[i] = randomScalar();
    }

    const pointsBuf = packAffineBytes(affinePoints);
    const scalarsBuf = packScalarBytes(scalars);

    const ctx = await GpuContext.create();
    let gpuResult: { x: bigint; y: bigint };
    try {
      const cached = await precompute_bn254_bases_f32(ctx, pointsBuf as unknown as Buffer);
      gpuResult = await compute_bn254_msm_batch_affine_f32(
        ctx,
        cached,
        scalarsBuf as unknown as Buffer,
      );
      cached.destroy();
    } finally {
      ctx.destroy();
    }
    const nobleResult = nobleMsmReference(affinePoints, scalars);

    if (gpuResult.x === nobleResult.x && gpuResult.y === nobleResult.y) {
      return {
        name,
        ok: true,
        detail: `N=${N}: batch-affine f32 GPU MSM matches noble bigint reference`,
      };
    }
    return {
      name,
      ok: false,
      detail:
        `mismatch at N=${N}\n` +
        `    gpu.x   = 0x${gpuResult.x.toString(16)}\n` +
        `    gpu.y   = 0x${gpuResult.y.toString(16)}\n` +
        `    noble.x = 0x${nobleResult.x.toString(16)}\n` +
        `    noble.y = 0x${nobleResult.y.toString(16)}`,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    };
  }
}

// --------- test runner ----------

export async function runAllWgslUnitTests(): Promise<UnitTestResult[]> {
  const results: UnitTestResult[] = [];
  // chunk_size=15 is the production path at log2(n) ≥ 16; chunk_size=4
  // is the small-n fallback. Both go through the same shader template
  // with different Mustache substitutions, and bugs in the top-chunk
  // override formula tend to bite differently at each.
  results.push(await testDecomposeAtChunkSize(15));
  results.push(await testDecomposeAtChunkSize(4));
  results.push(await testDecomposeAtChunkSize(16));

  // Transpose at small n keeps the test cheap; at this scale we'd catch
  // off-by-one column-indexing bugs, prefix-sum bugs, or scatter races.
  // Larger n would also exercise the cross-workgroup count atomics but
  // is slow to compare on the JS side.
  results.push(await testTransposeAtChunkSize(15, 256));
  results.push(await testTransposeAtChunkSize(4, 256));
  results.push(await testTransposeAtChunkSize(16, 256));

  // 23-bit f32 mulhilo primitive — foundation for the FMA Montgomery refactor.
  results.push(await testMulhilo());
  // 23-bit f32 Montgomery product — built atop mulhilo.
  results.push(await testMontgomeryProductF32());
  // 23-bit f32 field ops (step 4a): each is a near-mechanical translation
  // of the u32 version; one test per op.
  results.push(await testFieldAddF32());
  results.push(await testFieldSubF32());
  results.push(await testFieldDoubleF32());
  results.push(await testFieldNegF32());
  results.push(await testFieldMulF32());
  results.push(await testFieldSqrF32());
  results.push(await testFieldPowF32());
  results.push(await testFieldInvF32());
  results.push(await testFieldSqrtF32());

  // 23-bit f32 curve ops (step 4b): mechanical translation of
  // ec_bn254.template.wgsl. Tests cover identity handling, doubling,
  // unified add, no-collision fast paths, and mixed-add (Z2=1).
  results.push(await testPointDoubleF32());
  results.push(await testPointAddF32());
  results.push(await testPointAddNoCollisionF32());
  results.push(await testPointAddMixedF32());
  results.push(await testPointAddMixedNoCollisionF32());
  results.push(await testPointAddEqualsDoubleF32());

  // Step 4c: full f32-Montgomery MSM end-to-end against noble.
  // logN=10 keeps the smoke test under a few seconds; the full perf
  // comparison at logN=20 is step 5.
  results.push(await testMsmF32End2End(10));

  // Step 4c batch-affine variant: routes through the production-fast
  // entry point `compute_bn254_msm_batch_affine_f32` instead of the
  // legacy SMVP+BPR `compute_bn254_msm_f32`. Same noble reference, same
  // smoke-test logN.
  results.push(await testMsmBatchAffineF32End2End(10));
  return results;
}
