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

import { bn254 } from "@noble/curves/bn254";
import {
  BN254_BASE_FIELD,
  modInverse,
} from "../../src/msm_webgpu/cuzk/bn254.js";
import { BN254_CURVE_CONFIG } from "../../src/msm_webgpu/cuzk/curve_config.js";
import { GpuContext } from "../../src/msm_webgpu/cuzk/gpu_context.js";
import * as gpu from "../../src/msm_webgpu/cuzk/gpu.js";
import {
  create_and_write_sb,
  create_and_write_ub,
  read_from_gpu,
  create_bind_group_layout,
  create_bind_group,
  create_compute_pipeline,
  execute_pipeline,
  create_sb,
} from "../../src/msm_webgpu/cuzk/gpu.js";
import { StrausKernels } from "../../src/msm_webgpu/cuzk/straus_kernels.js";
import {
  bigints_to_u8_for_gpu,
  compute_misc_params,
  from_words_le_without_assertion,
} from "../../src/msm_webgpu/cuzk/utils.js";
import { transpose_gpu_parallel } from "../../src/msm_webgpu/msm.js";

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

// --------- straus lookup-precompute test ----------

function mod(a: bigint, m = BN254_BASE_FIELD): bigint {
  const r = a % m;
  return r >= 0n ? r : r + m;
}

function jacobianToAffineQ(
  x: bigint,
  y: bigint,
  z: bigint,
): { x: bigint; y: bigint } | null {
  if (mod(z) === 0n) return null;
  const zInv = modInverse(z, BN254_BASE_FIELD);
  const zInv2 = mod(zInv * zInv);
  const zInv3 = mod(zInv2 * zInv);
  return { x: mod(x * zInv2), y: mod(y * zInv3) };
}

function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function generateAffinePoints(
  n: number,
  seed: number,
): Array<{ x: bigint; y: bigint }> {
  const rand = makeRng(seed);
  const points: Array<{ x: bigint; y: bigint }> = [];
  for (let i = 0; i < n; i++) {
    let s = 0n;
    for (let k = 0; k < 8; k++) {
      s = (s << 32n) | BigInt(rand());
    }
    s = s % bn254.fields.Fr.ORDER;
    if (s === 0n) s = 1n;
    const aff = bn254.G1.ProjectivePoint.BASE.multiply(s).toAffine();
    points.push({ x: aff.x, y: aff.y });
  }
  return points;
}

function readBigIntAt(
  buf: Uint32Array,
  index: number,
  numWords: number,
  wordSize: number,
): bigint {
  const limbs = new Uint16Array(numWords);
  for (let i = 0; i < numWords; i++) {
    limbs[i] = buf[index * numWords + i] & 0xffff;
  }
  return from_words_le_without_assertion(limbs, numWords, wordSize);
}

export async function testStrausLookupPrecompute(
  n: number,
): Promise<UnitTestResult> {
  const name = `straus_lookup_precompute n=${n}`;
  try {
    const context = await GpuContext.create();
    const { device } = context;
    const sm = context.getShaderManager(BN254_CURVE_CONFIG, 15, n);

    const params = compute_misc_params(
      BN254_BASE_FIELD,
      BN254_CURVE_CONFIG.wordSize,
    );
    const numWords = params.num_words;
    const wordSize = BN254_CURVE_CONFIG.wordSize;
    const R = params.r;

    const points = generateAffinePoints(n, n * 0xa5a5 + 1);

    const xsMont = points.map((p) => (p.x * R) % BN254_BASE_FIELD);
    const ysMont = points.map((p) => (p.y * R) % BN254_BASE_FIELD);
    const baseXBytes = bigints_to_u8_for_gpu(xsMont, numWords, wordSize);
    const baseYBytes = bigints_to_u8_for_gpu(ysMont, numWords, wordSize);
    const baseXSb = create_and_write_sb(device, baseXBytes);
    const baseYSb = create_and_write_sb(device, baseYBytes);

    const lutByteLen = n * 8 * numWords * 4;
    const lutXSb = create_sb(device, lutByteLen);
    const lutYSb = create_sb(device, lutByteLen);
    const lutZSb = create_sb(device, lutByteLen);

    const workgroupSize = 64;
    const { pipeline, layout } = await StrausKernels.compileLookupPrecompute(
      device,
      sm,
      n,
      gpu,
      workgroupSize,
    );
    const bg = create_bind_group(device, layout, [
      baseXSb,
      baseYSb,
      lutXSb,
      lutYSb,
      lutZSb,
    ]);

    const numWorkgroups = Math.ceil(n / workgroupSize);
    const encoder = device.createCommandEncoder();
    await execute_pipeline(encoder, pipeline, bg, numWorkgroups, 1, 1);

    const [lutXData, lutYData, lutZData] = await read_from_gpu(device, encoder, [
      lutXSb,
      lutYSb,
      lutZSb,
    ]);

    baseXSb.destroy();
    baseYSb.destroy();
    lutXSb.destroy();
    lutYSb.destroy();
    lutZSb.destroy();
    context.destroy();

    const lutX = new Uint32Array(
      lutXData.buffer,
      lutXData.byteOffset,
      lutXData.byteLength / 4,
    );
    const lutY = new Uint32Array(
      lutYData.buffer,
      lutYData.byteOffset,
      lutYData.byteLength / 4,
    );
    const lutZ = new Uint32Array(
      lutZData.buffer,
      lutZData.byteOffset,
      lutZData.byteLength / 4,
    );

    const rInv = modInverse(R, BN254_BASE_FIELD);

    for (let i = 0; i < n; i++) {
      const baseProj = bn254.G1.ProjectivePoint.fromAffine(points[i]);
      for (let k = 0; k < 8; k++) {
        const flat = i * 8 + k;
        const xMont = readBigIntAt(lutX, flat, numWords, wordSize);
        const yMont = readBigIntAt(lutY, flat, numWords, wordSize);
        const zMont = readBigIntAt(lutZ, flat, numWords, wordSize);
        const x = mod(xMont * rInv);
        const y = mod(yMont * rInv);
        const z = mod(zMont * rInv);
        const aff = jacobianToAffineQ(x, y, z);
        const expectedProj = baseProj.multiply(BigInt(k + 1));
        if (expectedProj.equals(bn254.G1.ProjectivePoint.ZERO)) {
          if (aff !== null) {
            return {
              name,
              ok: false,
              detail: `i=${i} k=${k} expected identity, got (${aff.x.toString(
                16,
              )}, ${aff.y.toString(16)})`,
            };
          }
          continue;
        }
        if (aff === null) {
          return {
            name,
            ok: false,
            detail: `i=${i} k=${k} got identity, expected (k+1)·base`,
          };
        }
        const expectedAff = expectedProj.toAffine();
        if (aff.x !== expectedAff.x || aff.y !== expectedAff.y) {
          return {
            name,
            ok: false,
            detail:
              `i=${i} k=${k} mismatch\n` +
              `  got x=${aff.x.toString(16)} y=${aff.y.toString(16)}\n` +
              `  expected x=${expectedAff.x.toString(16)} y=${expectedAff.y.toString(16)}`,
          };
        }
      }
    }

    return {
      name,
      ok: true,
      detail: `${n} points × 8 lookup entries all matched (k+1)·base`,
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

  for (const n of [1, 8, 64, 256, 1024]) {
    results.push(await testStrausLookupPrecompute(n));
  }

  return results;
}
