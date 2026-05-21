// `TrivialMsm` — per-thread small-MSM WebGPU driver built on the
// `straus_msm` kernel stack (P2-P5). Mirrors the create / prepare / run /
// destroy lifecycle of `MsmV2` so the sweep pages and the size dispatcher
// (P9) can swap one for the other without callers caring.
//
// Lifecycle split (matches MsmV2):
//   - create-time: compile every per-(n, k) pipeline, allocate every
//     data-independent buffer, upload the SRS slice in Montgomery form,
//     dispatch `lookup_precompute` exactly once. Result lives in the
//     lookup buffers for the rest of the instance's life.
//   - prepare-time: GLV-split each scalar, Booth-pack each half as 4 × u32,
//     upload to the `k1_lims` / `k2_lims` buffers. No GPU dispatch.
//   - run-time: encode + submit `straus_main` → log2(T) `combine_fold`
//     passes → one `to_affine` dispatch, read back the 2 × BigInt result,
//     de-Mont and return `{x, y}`. Idempotent for a given prepared set.

import * as gpu from "./gpu.js";
import { BN254_BASE_FIELD, modInverse } from "./bn254.js";
import { BN254_CURVE_CONFIG } from "./curve_config.js";
import { ShaderManager } from "./shader_manager.js";
import {
  CompiledPipeline,
  StrausKernels,
} from "./straus_kernels.js";
import {
  bigints_to_u8_for_gpu,
  compute_misc_params,
  from_words_le_without_assertion,
} from "./utils.js";
import {
  packHalfToU32Limbs,
  splitIntoEndomorphismScalars,
} from "../straus/glv.js";

const FQ = BN254_BASE_FIELD;

function leBytesToBigint(buf: Uint8Array, off: number): bigint {
  let v = 0n;
  for (let k = 31; k >= 0; k--) v = (v << 8n) | BigInt(buf[off + k]);
  return v;
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

interface Triple {
  x: GPUBuffer;
  y: GPUBuffer;
  z: GPUBuffer;
}

export class TrivialMsm {
  private device!: GPUDevice;
  private n!: number;
  private ntm!: number;
  private wgSize = 64;
  private numWords!: number;
  private wordSize!: number;
  private R!: bigint;
  private rInv!: bigint;

  private lookupCompiled!: CompiledPipeline;
  private mainCompiled!: CompiledPipeline;
  private foldCompiled: Map<number, CompiledPipeline> = new Map();
  private toAffineCompiled!: CompiledPipeline;

  private baseXBuf!: GPUBuffer;
  private baseYBuf!: GPUBuffer;
  private lut!: Triple;
  private k1Buf!: GPUBuffer;
  private k2Buf!: GPUBuffer;
  private partA!: Triple;
  private partB!: Triple;
  private resultXBuf!: GPUBuffer;
  private resultYBuf!: GPUBuffer;

  private foldPasses: number[] = [];
  private prepared = false;

  /**
   * GPU per-pass durations (ms) from the most recent `run()`. Populated
   * only when the device supports `timestamp-query` (otherwise `null`).
   * Keys: `straus_main`, `combine_fold_<tIn>` per pass, `to_affine`, plus
   * the derived `encoder_all` span emitted by `Profiler.report()`.
   */
  lastRunPhaseMs: Record<string, number> | null = null;

  static async create(
    device: GPUDevice,
    n: number,
    pointsBuf: Uint8Array,
    ntm: number,
  ): Promise<TrivialMsm> {
    if (n <= 0) throw new Error(`TrivialMsm.create: n must be > 0 (got ${n})`);
    if (ntm <= 0) {
      throw new Error(`TrivialMsm.create: ntm must be > 0 (got ${ntm})`);
    }
    if (pointsBuf.byteLength !== n * 64) {
      throw new Error(
        `TrivialMsm.create: pointsBuf must be ${n * 64} bytes (got ${pointsBuf.byteLength})`,
      );
    }

    const m = new TrivialMsm();
    m.device = device;
    m.n = n;
    m.ntm = ntm;
    m.wordSize = BN254_CURVE_CONFIG.wordSize;
    const misc = compute_misc_params(FQ, m.wordSize);
    m.numWords = misc.num_words;
    m.R = misc.r;
    m.rInv = modInverse(m.R, FQ);

    const sm = new ShaderManager(15, n, BN254_CURVE_CONFIG, false);

    m.lookupCompiled = await StrausKernels.compileLookupPrecompute(
      device,
      sm,
      n,
      gpu,
      m.wgSize,
    );
    m.mainCompiled = await StrausKernels.compileStrausMain(
      device,
      sm,
      n,
      ntm,
      gpu,
      m.wgSize,
    );
    m.toAffineCompiled = await StrausKernels.compileStrausToAffine(
      device,
      sm,
      gpu,
    );

    let tCur = Math.ceil(n / ntm);
    while (tCur > 1) {
      m.foldPasses.push(tCur);
      const compiled = await StrausKernels.compileStrausCombineFold(
        device,
        sm,
        tCur,
        gpu,
        m.wgSize,
      );
      m.foldCompiled.set(tCur, compiled);
      tCur = Math.ceil(tCur / 2);
    }

    const xs: bigint[] = new Array(n);
    const ys: bigint[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = leBytesToBigint(pointsBuf, i * 64);
      const y = leBytesToBigint(pointsBuf, i * 64 + 32);
      xs[i] = (x * m.R) % FQ;
      ys[i] = (y * m.R) % FQ;
    }
    m.baseXBuf = gpu.create_and_write_sb(
      device,
      bigints_to_u8_for_gpu(xs, m.numWords, m.wordSize),
    );
    m.baseYBuf = gpu.create_and_write_sb(
      device,
      bigints_to_u8_for_gpu(ys, m.numWords, m.wordSize),
    );

    const lutByteLen = n * 8 * m.numWords * 4;
    m.lut = {
      x: gpu.create_sb(device, lutByteLen),
      y: gpu.create_sb(device, lutByteLen),
      z: gpu.create_sb(device, lutByteLen),
    };

    m.k1Buf = gpu.create_sb(device, n * 16);
    m.k2Buf = gpu.create_sb(device, n * 16);

    const T0 = Math.ceil(n / ntm);
    const partByteLen = T0 * m.numWords * 4;
    m.partA = {
      x: gpu.create_sb(device, partByteLen),
      y: gpu.create_sb(device, partByteLen),
      z: gpu.create_sb(device, partByteLen),
    };
    m.partB = {
      x: gpu.create_sb(device, partByteLen),
      y: gpu.create_sb(device, partByteLen),
      z: gpu.create_sb(device, partByteLen),
    };
    m.resultXBuf = gpu.create_sb(device, m.numWords * 4);
    m.resultYBuf = gpu.create_sb(device, m.numWords * 4);

    const precomputeBg = gpu.create_bind_group(
      device,
      m.lookupCompiled.layout,
      [m.baseXBuf, m.baseYBuf, m.lut.x, m.lut.y, m.lut.z],
    );
    const encoder = device.createCommandEncoder();
    await gpu.execute_pipeline(
      encoder,
      m.lookupCompiled.pipeline,
      precomputeBg,
      Math.ceil(n / m.wgSize),
      1,
      1,
    );
    device.queue.submit([encoder.finish()]);

    return m;
  }

  prepare(scalarsBuf: Uint8Array): void {
    if (scalarsBuf.byteLength !== this.n * 32) {
      throw new Error(
        `TrivialMsm.prepare: scalarsBuf must be ${this.n * 32} bytes (got ${scalarsBuf.byteLength})`,
      );
    }
    const halves = new Uint8Array(this.n * 16 * 2);
    const view = new DataView(halves.buffer);
    for (let i = 0; i < this.n; i++) {
      let s = 0n;
      for (let k = 31; k >= 0; k--) {
        s = (s << 8n) | BigInt(scalarsBuf[i * 32 + k]);
      }
      const { k1, k2 } = splitIntoEndomorphismScalars(s % FQ);
      const k1Lims = packHalfToU32Limbs(k1);
      const k2Lims = packHalfToU32Limbs(k2);
      for (let j = 0; j < 4; j++) {
        view.setUint32(i * 16 + j * 4, k1Lims[j], true);
        view.setUint32(this.n * 16 + i * 16 + j * 4, k2Lims[j], true);
      }
    }
    this.device.queue.writeBuffer(
      this.k1Buf,
      0,
      halves.buffer,
      halves.byteOffset,
      this.n * 16,
    );
    this.device.queue.writeBuffer(
      this.k2Buf,
      0,
      halves.buffer,
      halves.byteOffset + this.n * 16,
      this.n * 16,
    );
    this.prepared = true;
  }

  async run(): Promise<{ x: bigint; y: bigint }> {
    if (!this.prepared) {
      throw new Error("TrivialMsm.run: call prepare(scalarsBuf) first");
    }
    const device = this.device;
    const encoder = device.createCommandEncoder();
    const profiler = new gpu.Profiler(device, this.foldPasses.length + 4);

    const mainBg = gpu.create_bind_group(device, this.mainCompiled.layout, [
      this.lut.x,
      this.lut.y,
      this.lut.z,
      this.k1Buf,
      this.k2Buf,
      this.partA.x,
      this.partA.y,
      this.partA.z,
    ]);
    const T0 = Math.ceil(this.n / this.ntm);
    await gpu.execute_pipeline(
      encoder,
      this.mainCompiled.pipeline,
      mainBg,
      Math.ceil(T0 / this.wgSize),
      1,
      1,
      profiler.stage("straus_main"),
    );

    let src: Triple = this.partA;
    let dst: Triple = this.partB;
    let tCur = T0;
    for (const tIn of this.foldPasses) {
      if (tIn !== tCur) {
        throw new Error(
          `TrivialMsm.run: fold-pass mismatch (expected T_IN=${tCur}, have ${tIn})`,
        );
      }
      const compiled = this.foldCompiled.get(tIn)!;
      const tNext = Math.ceil(tIn / 2);
      const foldBg = gpu.create_bind_group(device, compiled.layout, [
        src.x,
        src.y,
        src.z,
        dst.x,
        dst.y,
        dst.z,
      ]);
      await gpu.execute_pipeline(
        encoder,
        compiled.pipeline,
        foldBg,
        Math.ceil(tNext / this.wgSize),
        1,
        1,
        profiler.stage(`combine_fold_${tIn}`),
      );
      const tmp = src;
      src = dst;
      dst = tmp;
      tCur = tNext;
    }

    const toAffineBg = gpu.create_bind_group(
      device,
      this.toAffineCompiled.layout,
      [src.x, src.y, src.z, this.resultXBuf, this.resultYBuf],
    );
    await gpu.execute_pipeline(
      encoder,
      this.toAffineCompiled.pipeline,
      toAffineBg,
      1,
      1,
      1,
      profiler.stage("to_affine"),
    );

    profiler.resolve(encoder);
    const [xData, yData] = await gpu.read_from_gpu(device, encoder, [
      this.resultXBuf,
      this.resultYBuf,
    ]);

    const report = await profiler.report();
    if (report !== null) {
      const phase: Record<string, number> = {};
      for (const r of report) phase[r.label] = r.ms;
      this.lastRunPhaseMs = phase;
    } else {
      this.lastRunPhaseMs = null;
    }
    profiler.destroy();
    const xWords = new Uint32Array(
      xData.buffer,
      xData.byteOffset,
      xData.byteLength / 4,
    );
    const yWords = new Uint32Array(
      yData.buffer,
      yData.byteOffset,
      yData.byteLength / 4,
    );
    const xMont = readBigIntAt(xWords, 0, this.numWords, this.wordSize);
    const yMont = readBigIntAt(yWords, 0, this.numWords, this.wordSize);
    if (xMont === 0n && yMont === 0n) {
      return { x: 0n, y: 0n };
    }
    return {
      x: (xMont * this.rInv) % FQ,
      y: (yMont * this.rInv) % FQ,
    };
  }

  destroy(): void {
    this.baseXBuf?.destroy();
    this.baseYBuf?.destroy();
    this.lut?.x.destroy();
    this.lut?.y.destroy();
    this.lut?.z.destroy();
    this.k1Buf?.destroy();
    this.k2Buf?.destroy();
    this.partA?.x.destroy();
    this.partA?.y.destroy();
    this.partA?.z.destroy();
    this.partB?.x.destroy();
    this.partB?.y.destroy();
    this.partB?.z.destroy();
    this.resultXBuf?.destroy();
    this.resultYBuf?.destroy();
  }
}
