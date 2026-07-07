import { bn254 } from '@noble/curves/bn254';

import { BatchMsmV2 } from '../batch_msm.js';
import { MsmV2, MsmV2Pool } from '../msm_v2.js';
import { buildPerfettoTrace, type TraceSpan } from '../perfetto_trace.js';
import { get_device } from '../cuzk/gpu.js';
import {
  ERR_GENERIC,
  OP_BATCH_MSM,
  OP_MSM,
  OP_PUBLISH_SRS,
  SLOT_BATCH_LABELS_PTR,
  SLOT_BATCH_META_PTR,
  SLOT_C,
  SLOT_ERROR_CODE,
  SLOT_N,
  SLOT_NUM_WINDOWS,
  SLOT_OPCODE,
  SLOT_POINTS_PTR,
  SLOT_RESULT_PTR,
  SLOT_SCALARS_PTR,
  SLOT_SRS_OFFSET,
  SLOT_STATE,
  STATE_DONE,
  STATE_ERROR,
} from './protocol.js';

// Non-SRS-sized MSM instances held besides the pinned SRS-sized one. Per-`n`
// instances are cheap to build (they bind the shared pool, no point upload —
// and pool.cache now memoizes the compiled pipelines + layouts), but they
// still allocate per-instance prepare buffers, so we cap the LRU at the
// number of distinct sizes the canonical ECDSA-r1 transfer flow uses (the
// telemetry shows ~10 distinct n values). 16 is plenty of headroom.
const MSM_LRU_CAP = 16;
// Max distinct MsmV2 slots kept per N for same-N batching. The biggest
// same-N batch in the chonk flow is 10 (the translator concatenated/ordered
// range constraints) so 10 keeps every same-N batch on the single-encoder
// path. Each extra slot ≈ 25 MB GPU memory at n=131k.
const MAX_SAME_N_SLOTS = 10;

// Production routing rule for the Tier 2 BatchMsmV2 path. See
// MSM_IMPL.md §4.4 (design history in git: BATCH_MSM_DESIGN.md):
//   - B=3 W_L/W_R/W_O at n ≤ 2^17 — solo wins (batch 0.67×-0.82× of solo).
//     Confirmed empirically on the chonk e2e flow: B=3 batch slows the GPU
//     MSM phase by ~130 ms vs solo (3.37 s → 3.50 s).
//   - B ≥ 4 at n ≤ 2^17 — batch wins 1.07×-1.17× over solo. The translator's
//     B=10 range-constraint commit (n=131072) is the main target.
//   - B ≥ 4 at n=2^18 — known MEM_BUDGET regression (batch 0.74× of solo).
// Activated only when the chonk page sets `__bridge_batch_enabled = true`
// for the duration of one prove.
const BATCH_MSM_V2_MIN_B_DEFAULT = 4;
// Runtime-overridable so a measurement harness can A/B the B≥3 wire-group routing
// (W_L/W_R/W_O are B=3) without a rebuild. `globalThis.__bridge_batch_min_b`.
const batchMinB = (): number => {
  const v = (globalThis as any).__bridge_batch_min_b;
  return typeof v === 'number' && v >= 1 ? v : BATCH_MSM_V2_MIN_B_DEFAULT;
};
const BATCH_MSM_V2_MAX_N_DEFAULT = 1 << 17;
// Runtime-overridable so a harness can test routing the large same-N wire groups
// (e.g. storage_proof's W_L/W_R/W_O at n≈383516) through BatchMsmV2's concatenated
// `prepareAll` instead of the serial per-MSM path (which pays ~130ms of histogram
// backpressure per MSM at that size). `globalThis.__bridge_batch_max_n`.
const batchMaxN = (): number => {
  const v = (globalThis as any).__bridge_batch_max_n;
  return typeof v === 'number' && v >= 1 ? v : BATCH_MSM_V2_MAX_N_DEFAULT;
};
// Distinct (n, B) BatchMsmV2 instances kept across the prove. Each instance
// re-uploads the SRS to its own pool (BatchMsmV2 owns the upload — see
// batch_msm.ts), so the cost is one re-upload + Montgomery
// convert per cache miss, then amortized across every same-N batch at that
// (n, B). The chonk flow hits at most ~3 distinct (n, B) keys, so a small
// LRU is enough. Each cached instance pins ~2 × (n × 32) bytes of GPU
// memory for its dedicated poolX / poolY.
const BATCH_MSM_LRU_CAP = 8;

// Aligned CPU+GPU Perfetto trace accumulation across a whole proof. Off by
// default. The chonk-webgpu page flips `globalThis.__bridge_trace_on = true`
// around a WebGPU prove (a plain global flag, read per-MSM, so it works
// regardless of whether this module has loaded yet — same pattern as
// `__bridge_phase_trace`), then calls `globalThis.__bridge_trace_build()` to
// get the Perfetto JSON once proving is done. Every span carries absolute
// `performance.now()` start/end, so all batches across the proof lay out on one
// shared CPU timeline; each batch's GPU passes are anchored to its own submit
// instant on that same clock.
const bridgeTrace: { cpu: TraceSpan[]; gpu: TraceSpan[]; mem: TraceSpan[] } = { cpu: [], gpu: [], mem: [] };
function bridgeTraceOn(): boolean {
  return (globalThis as any).__bridge_trace_on === true;
}
function traceCpu(name: string, startMs: number, endMs: number, args?: Record<string, string | number>): void {
  bridgeTrace.cpu.push({ name, startMs, endMs, args });
}
function traceGpu(name: string, startMs: number, endMs: number, args?: Record<string, string | number>): void {
  bridgeTrace.gpu.push({ name, startMs, endMs, args });
}
// First-class Memory lane: host↔GPU transfers (scalar writeBuffer uploads, SRS upload, mapAsync
// readbacks), each carrying its byte count and direction. writeBuffer is async on the WebGPU queue,
// so the recorded span is the host-side wall cost of issuing it (the queue-flush), labelled as such.
function traceMem(
  name: string,
  startMs: number,
  endMs: number,
  bytes: number,
  dir: 'h2d' | 'd2h',
  args?: Record<string, string | number>,
): void {
  const mb = (bytes / (1024 * 1024)).toFixed(2);
  bridgeTrace.mem.push({ name: `${name} · ${mb}MB ${dir}`, startMs, endMs, args: { ...args, bytes, dir } });
}

// Paired (C++ clock ms, main-thread performance.now() ms) clock-alignment anchors, sampled at the
// top of every bridge request so they spread across the whole prove. The C++ BB_BENCH events are
// stamped with the WASI clock = `performance.timeOrigin + performance.now()`, so the anchor's cMs
// reads that SAME source here; a least-squares fit then maps every C++ event onto the main-thread
// performance.now() domain the GPU/host/memory lanes already live on. (On this thread cMs and hMs
// share one performance.now(), so the pair is exact — no quantization.)
const alignAnchors: { cMs: number; hMs: number }[] = [];
function sampleAlignAnchor(): void {
  if (!bridgeTraceOn()) return;
  const hMs = performance.now();
  const cMs = performance.timeOrigin + hMs;
  alignAnchors.push({ cMs, hMs });
}

(globalThis as any).__bridge_trace_reset = (): void => {
  bridgeTrace.cpu = [];
  bridgeTrace.gpu = [];
  bridgeTrace.mem = [];
  alignAnchors.length = 0;
};
(globalThis as any).__bridge_trace_build = (): string =>
  buildPerfettoTrace({ cpu: bridgeTrace.cpu, gpu: bridgeTrace.gpu }, 'Chonk MSM (WebGPU)');
// Raw spans for the e2e merge in serve.ts (already on the performance.now() ms domain). Returns
// copies so the caller can't mutate the live accumulators mid-prove.
(globalThis as any).__bridge_trace_spans = (): { cpu: TraceSpan[]; gpu: TraceSpan[]; mem: TraceSpan[] } => ({
  cpu: bridgeTrace.cpu.slice(),
  gpu: bridgeTrace.gpu.slice(),
  mem: bridgeTrace.mem.slice(),
});
(globalThis as any).__bridge_align_anchors = (): { cMs: number; hMs: number }[] => alignAnchors.slice();
(globalThis as any).__bridge_trace_counts = (): { cpu: number; gpu: number; mem: number; anchors: number } => ({
  cpu: bridgeTrace.cpu.length,
  gpu: bridgeTrace.gpu.length,
  mem: bridgeTrace.mem.length,
  anchors: alignAnchors.length,
});

// Whole-prove GPU-memory high-water mark, in bytes. `statsBytesSummary` updates
// it every time the bridge logs a per-batch memory summary, so it tracks the
// peak of (SRS pool + active + LRU) GPU bytes across the entire prove. The
// chonk-webgpu bench resets it before each run and reads it after — same
// flag-style global pattern as the trace handles above, so serve.ts reads the
// number without importing this module (which would couple the webpack bundle).
let peakGpuBytes = 0;
(globalThis as any).__bridge_gpu_mem_reset = (): void => {
  peakGpuBytes = 0;
};
(globalThis as any).__bridge_gpu_mem_peak = (): number => peakGpuBytes;

/**
 * Main-thread host for the WebGPU MSM bridge. Owns one `GPUDevice`, one shared
 * `MsmV2Pool` (the SRS uploaded + Montgomery-converted on the GPU once), and a
 * small cache of per-size `MsmV2` instances bound to that pool.
 *
 * Lifecycle:
 *   1. Construct one per worker, sharing the same control SAB the worker stub
 *      was constructed with.
 *   2. Pass the WASM module's `WebAssembly.Memory` once it's been instantiated,
 *      so the host can `new Uint8Array(memory.buffer, ...)` against shared
 *      memory.
 *   3. Wire `worker.onmessage = e => host.handleMessage(e.data)`. The worker
 *      stub posts the string `'msm_request'` every time a WASM-side import is
 *      called.
 *
 * The first `OP_PUBLISH_SRS` builds the shared point pool — the SRS coordinates
 * are streamed to the GPU and converted to Montgomery form exactly once. Every
 * subsequent `OP_MSM` reuses a prefix of that pool; only the scalars are copied
 * in per call.
 *
 * Concurrency: one MSM in flight at a time. The bridge protocol is single-slot,
 * mirroring the WASM hot path which always issues one MSM at a time.
 */
export class WebGpuMsmHost {
  private readonly ctrl: Int32Array;
  private wasmMemory: WebAssembly.Memory | null = null;
  private device: GPUDevice | null = null;
  private destroyed = false;

  // The one shared SRS point pool, plus the per-size MSM instances bound to it.
  // `srsMsm` (n === srsN) is the hot path and is pinned; other sizes rotate
  // through `lru` (insertion order == LRU order). For same-N batches > 1
  // we additionally allocate up to MAX_SAME_N_SLOTS distinct MsmV2 instances
  // per N (the "slot pool") so the same-N batch can encode into ONE command
  // buffer with each MSM in its own slot — eliminating per-MSM submit + per-
  // MSM mapAsync for the same-N case.
  private pool: MsmV2Pool | null = null;
  private srsN = 0;
  private srsMsm: MsmV2 | null = null;
  private lru = new Map<number, MsmV2>();
  private slotPools = new Map<number, MsmV2[]>();

  // Raw canonical SRS bytes (`srsN × 64` LE non-Montgomery), kept across
  // the proof so `runBatchMsm` can rebuild a `BatchMsmV2` instance for any
  // (n, B) cache miss. Stored as a JS Uint8Array (no GPU memory cost on
  // its own; just heap). Re-uploaded to a per-instance pool inside each
  // cached `BatchMsmV2` — the SRS coords end up duplicated in GPU memory
  // (~2 × 32 × srsN bytes per cache hit), capped by BATCH_MSM_LRU_CAP.
  private srsBytes: Uint8Array | null = null;

  // ── Additive scalar masking (experiment) ─────────────────────────────────
  // When `globalThis.__bridge_mask_msms === true` at SRS-publish time, every
  // SRS-prefix MSM is computed on masked scalars (s + R) mod r and the host
  // subtracts the per-(srsOffset,n) offset O = Σ R_i P_i to recover the true
  // commitment. R is a per-SRS-position random vector laid out as 8×u32 LE per
  // entry (same form/length as a scalar buffer), held on the host (`maskBytes`,
  // for noble offset computation) and on the GPU (`maskBuf`, fed to MsmV2 as
  // `config.maskBuf`). Frozen for the pool's lifetime — toggling the flag takes
  // effect on the next OP_PUBLISH_SRS. See the mask_scalars shader + MsmV2's
  // masking path. Offsets are cached by `${srsOffset}:${n}` and reused across
  // every same-shape commit and every prove.
  private maskingEnabled = false;
  private maskBytes: Uint8Array | null = null;
  private maskBuf: GPUBuffer | null = null;
  private maskOffsetCache = new Map<string, { x: bigint; y: bigint }>();
  // Reusable all-zero scalar buffer for the GPU offset zero-run (grown to the
  // largest n seen). A masked run over zeros yields masked = (0+R) mod r = R.
  private zeroScalars: Uint8Array | null = null;

  // BatchMsmV2 instances keyed by `n * 65536 + B` — a plain integer, NOT a
  // bitwise `(n << 16) | B` pack: JS `<<` is a 32-bit signed op, so `n << 16`
  // overflows for n ≥ 32768 and keeps only n's low 16 bits, collapsing distinct
  // sizes (e.g. 65535/131071/196607) onto one key and handing back a wrong-`n`
  // cached instance. Each holds its own
  // MsmV2Pool with a private SRS upload, plus a single MsmV2 configured
  // with `batchSize = B`. Activated by `__bridge_batch_enabled === true`
  // for the duration of one chonk page run; insertion order == LRU order.
  private batchInstances = new Map<number, BatchMsmV2>();

  // If a request arrives before `setWasmMemory` is called, we can't service it.
  // Used by the test harness; production order is always memory-then-message.
  private pendingErrorMessage: string | null = null;

  constructor(ctrl_sab: SharedArrayBuffer) {
    this.ctrl = new Int32Array(ctrl_sab);
  }

  public setWasmMemory(memory: WebAssembly.Memory): void {
    this.wasmMemory = memory;
  }

  /**
   * Routine for `worker.onmessage`. The worker posts the string `'msm_request'`;
   * we dispatch on the current OPCODE slot.
   */
  public async handleMessage(msg: unknown): Promise<void> {
    if (msg !== 'msm_request' || this.destroyed) return;
    // Clock-alignment anchor: pair the global Date.now() (the C++ BB_BENCH clock source) with the
    // main-thread performance.now() right as this bridge request begins. Spread across the prove,
    // these anchor the C++ event lanes onto this thread's performance.now() domain.
    sampleAlignAnchor();
    try {
      const op = Atomics.load(this.ctrl, SLOT_OPCODE);
      if (op === OP_MSM) {
        await this.runMsm();
      } else if (op === OP_BATCH_MSM) {
        await this.runBatchMsm();
      } else if (op === OP_PUBLISH_SRS) {
        await this.runPublishSrs();
      } else {
        throw new Error(`WebGPU bridge: unknown opcode ${op}`);
      }
      // Track the whole-prove GPU-memory high-water after each dispatch (buffers
      // persist in the pool + caches), so the peak is captured regardless of the
      // dispatch path. The bench/page reads it via __bridge_gpu_mem_peak().
      // Best-effort telemetry: never let it fail the MSM request / break a prove.
      try {
        const gpuBytes = this.currentGpuBytes();
        if (gpuBytes > peakGpuBytes) peakGpuBytes = gpuBytes;
      } catch {
        /* ignore — memory accounting must not break proving */
      }
      Atomics.store(this.ctrl, SLOT_STATE, STATE_DONE);
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
      // Pass the rendered message as a string so headless test frameworks
      // that can't unwrap JSHandle@error get the actual content.
      console.error(`WebGPU MSM bridge error: ${msg}`);
      Atomics.store(this.ctrl, SLOT_ERROR_CODE, ERR_GENERIC);
      Atomics.store(this.ctrl, SLOT_STATE, STATE_ERROR);
      this.pendingErrorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      Atomics.notify(this.ctrl, SLOT_STATE, 1);
    }
  }

  /** Return and clear the message of the most-recent failed request. */
  public getLastErrorMessage(): string | null {
    const m = this.pendingErrorMessage;
    this.pendingErrorMessage = null;
    return m;
  }

  public async destroy(): Promise<void> {
    this.destroyed = true;
    try {
      this.srsMsm?.destroy();
    } catch {
      /* idempotent */
    }
    for (const m of this.lru.values()) {
      try {
        m.destroy();
      } catch {
        /* idempotent */
      }
    }
    for (const pools of this.slotPools.values()) {
      for (const m of pools) {
        try {
          m.destroy();
        } catch {
          /* idempotent */
        }
      }
    }
    for (const b of this.batchInstances.values()) {
      try {
        b.destroy();
      } catch {
        /* idempotent */
      }
    }
    try {
      this.pool?.destroy();
    } catch {
      /* idempotent */
    }
    try {
      this.maskBuf?.destroy();
    } catch {
      /* idempotent */
    }
    this.maskBuf = null;
    this.maskBytes = null;
    this.maskingEnabled = false;
    this.maskOffsetCache.clear();
    this.srsMsm = null;
    this.lru.clear();
    this.slotPools.clear();
    this.batchInstances.clear();
    this.srsBytes = null;
    this.pool = null;
    // GPUDevice.destroy() lets the driver reclaim every shader pipeline and
    // buffer immediately instead of waiting for GC. Idempotent per the spec.
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
  }

  private async getDevice(): Promise<GPUDevice> {
    if (this.device === null) {
      this.device = await get_device();
    }
    return this.device;
  }

  private wasmSliceCopy(ptr: number, byteLength: number): Uint8Array {
    if (this.wasmMemory === null) {
      throw new Error('WebGPU bridge: wasm memory not set');
    }
    // Copy out of WASM memory rather than holding a view. The WASM build may
    // grow its memory between request and result, which detaches existing
    // views and would crash the WebGPU upload.
    return new Uint8Array(this.wasmMemory.buffer, ptr, byteLength).slice();
  }

  /**
   * Summarize per-instance + pool GPU memory for a batch's MSMs in a
   * compact form suitable for inline log lines:
   *   `pool=16MB,active=54MB,lru=128MB,total=198MB`
   * - `pool` = shared SRS pool bytes.
   * - `active` = sum across the MSMs in this batch (the ones the GPU just
   *   touched).
   * - `lru` = sum across every cached MsmV2 instance not in `active`
   *   (the LRU memory "tax").
   * - `total` = pool + active + lru.
   * Used by the memory-reduction plan's per-phase verification.
   */
  private statsBytesSummary(activeMsms: MsmV2[]): string {
    const pool = this.pool?.statsBytes() ?? 0;
    // Dedupe — same-N batches share one MsmV2 instance, so a batch of 3
    // same-N MSMs has activeMsms.length=3 but they all reference the same
    // instance. Counting each only once gives the actual GPU bytes.
    const activeSet = new Set<MsmV2>(activeMsms);
    let active = 0;
    for (const m of activeSet) active += m.statsBytes();
    let lru = 0;
    if (this.srsMsm && !activeSet.has(this.srsMsm)) lru += this.srsMsm.statsBytes();
    for (const m of this.lru.values()) if (!activeSet.has(m)) lru += m.statsBytes();
    for (const slotPool of this.slotPools.values()) {
      for (const m of slotPool) if (!activeSet.has(m)) lru += m.statsBytes();
    }
    const mb = (b: number) => `${(b / (1024 * 1024)).toFixed(1)}MB`;
    return `pool=${mb(pool)},active=${mb(active)},lru=${mb(lru)},total=${mb(pool + active + lru)}`;
  }

  /**
   * Current total GPU bytes the bridge holds: the shared SRS pool + scratch,
   * every cached per-size `MsmV2` (solo + same-N slot pools), and every
   * `BatchMsmV2`'s dedicated pool. Read from the host's own state so it is
   * accurate for every dispatch path (solo / same-N / batch), independent of
   * which paths happen to log a memory summary.
   */
  private currentGpuBytes(): number {
    let total = this.pool?.statsBytes() ?? 0;
    const seen = new Set<MsmV2>();
    const add = (m: MsmV2 | null): void => {
      if (m && !seen.has(m)) {
        seen.add(m);
        total += m.statsBytes();
      }
    };
    add(this.srsMsm);
    for (const m of this.lru.values()) add(m);
    for (const slotPool of this.slotPools.values()) for (const m of slotPool) add(m);
    for (const b of this.batchInstances.values()) total += b.statsBytes();
    return total;
  }

  /**
   * Reset the GPU bridge to a clean post-publish baseline WITHOUT a backend rebuild,
   * so ONE warm GPU backend can prove many different chonk flows correctly. Tears
   * down every cached per-prove MsmV2 / BatchMsmV2 instance — these accumulate
   * per-flow state that corrupts a later, differently-shaped flow — and rebuilds the
   * SRS pool from the cached raw bytes on the SAME GPUDevice: no SRS re-download, and
   * the driver keeps the compiled shader pipelines, so the next flow stays warm.
   * Masking state (maskBuf/maskBytes/offset cache) is tied to the unchanged SRS and
   * is preserved. No-op before the first `OP_PUBLISH_SRS` (no cached SRS yet) or after
   * destroy. Exposed to the page as `__bridge_reset` (see setup.ts) so the chonk page
   * can isolate each flow between proves while keeping the WASM threads + CRS warm.
   *
   * By default it keeps the SRS `pool` (its `poolX`/`poolY` upload + shared scratch)
   * and only clears the per-(n) instance caches — skipping the per-flow SRS re-upload.
   * The shared scratch is rewritten per MSM, so it carries no cross-flow state; the
   * cross-flow corruption lives in the cleared instances (confirmed bit-exact via the
   * page's VK-match across all 11 example flows on Metal-3). Set
   * `globalThis.__bridge_reset_keep_pool === false` to force the full pool rebuild
   * (the slower, maximally-conservative path) as an escape hatch.
   */
  public async reset(): Promise<void> {
    if (this.destroyed || this.srsBytes === null) return;
    const device = await this.getDevice();
    this.srsMsm?.destroy();
    this.srsMsm = null;
    for (const m of this.lru.values()) m.destroy();
    this.lru.clear();
    for (const pools of this.slotPools.values()) for (const m of pools) m.destroy();
    this.slotPools.clear();
    for (const b of this.batchInstances.values()) b.destroy();
    this.batchInstances.clear();
    if ((globalThis as any).__bridge_reset_keep_pool !== false) return;
    this.pool?.destroy();
    this.pool = await MsmV2Pool.create(device, this.srsBytes);
  }

  /**
   * `OP_PUBLISH_SRS` — stream the SRS to the GPU once. Builds the shared
   * `MsmV2Pool` (raw upload + GPU Montgomery conversion); any previously cached
   * instances/pool are torn down first.
   */
  private async runPublishSrs(): Promise<void> {
    const n = Atomics.load(this.ctrl, SLOT_N);
    if (n === 0) return;
    const ptr = Atomics.load(this.ctrl, SLOT_POINTS_PTR);
    const srsBytes = this.wasmSliceCopy(ptr, n * 64);
    const device = await this.getDevice();

    this.srsMsm?.destroy();
    this.srsMsm = null;
    for (const m of this.lru.values()) m.destroy();
    this.lru.clear();
    for (const pools of this.slotPools.values()) for (const m of pools) m.destroy();
    this.slotPools.clear();
    for (const b of this.batchInstances.values()) b.destroy();
    this.batchInstances.clear();
    this.pool?.destroy();
    this.maskBuf?.destroy();
    this.maskBuf = null;
    this.maskBytes = null;
    this.maskOffsetCache.clear();

    const tSrs0 = performance.now();
    this.pool = await MsmV2Pool.create(device, srsBytes);
    if (bridgeTraceOn()) {
      // SRS coords streamed to the GPU + Montgomery-converted once. srsBytes is the raw n×64 LE
      // upload; the convert runs on-GPU inside create().
      traceMem('SRS upload+convert', tSrs0, performance.now(), srsBytes.byteLength, 'h2d', { n });
    }
    this.srsN = n;
    // Keep the raw SRS so `runBatchMsm` can spin up BatchMsmV2 instances
    // on demand. `BatchMsmV2.create` re-uploads + Montgomery-converts to a
    // private pool per (n, B); the duplicate GPU-side coords are capped by
    // BATCH_MSM_LRU_CAP.
    this.srsBytes = srsBytes;

    // Build the masking vector R if the experiment flag is set. Frozen for the
    // life of this pool; every subsequent MsmV2 create() binds `maskBuf`.
    this.maskingEnabled = (globalThis as any).__bridge_mask_msms === true;
    if (this.maskingEnabled) {
      const tMask0 = performance.now();
      this.maskBytes = this.generateMaskVector(n);
      this.maskBuf = device.createBuffer({
        size: this.maskBytes.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(this.maskBuf, 0, this.maskBytes as BufferSource);
      console.log(
        `[mask] enabled — R over ${n} SRS positions (${(this.maskBytes.byteLength / 1e6).toFixed(1)} MB) ` +
          `in ${(performance.now() - tMask0).toFixed(0)}ms`,
      );
    }
  }

  /**
   * Build the per-SRS-position random mask vector R: `srsN` scalars uniform in
   * [0, r), packed as 8×u32 little-endian limbs each (the scalar buffer layout
   * the mask_scalars shader indexes by absolute pool position). Generated in
   * 64 KiB chunks of `crypto.getRandomValues`, masking the top 2 bits and
   * rejection-clamping the rare draw ≥ r down by one reduction (uniform enough
   * for masking — these never need to be cryptographically uniform, only
   * structure-free and < r).
   */
  private generateMaskVector(srsN: number): Uint8Array {
    const r = bn254.fields.Fr.ORDER;
    const out = new Uint8Array(srsN * 32);
    const CHUNK = 1 << 16; // bytes per getRandomValues call
    for (let off = 0; off < out.byteLength; off += CHUNK) {
      crypto.getRandomValues(out.subarray(off, Math.min(off + CHUNK, out.byteLength)));
    }
    // Per entry: clear the top 2 bits (so value < 2^254) and, if still ≥ r,
    // subtract r once. r is ~2^254 so a single conditional subtraction lands
    // every clamped value back in [0, r).
    for (let i = 0; i < srsN; i++) {
      const base = i * 32;
      out[base + 31] &= 0x3f;
      let v = 0n;
      for (let k = 31; k >= 0; k--) v = (v << 8n) | BigInt(out[base + k]);
      if (v >= r) {
        v -= r;
        for (let k = 0; k < 32; k++) {
          out[base + k] = Number(v & 0xffn);
          v >>= 8n;
        }
      }
    }
    return out;
  }

  /** Horner-fold per-window sums into one affine point (the C++ combine_windows
   *  in JS): acc = acc·2^c + L[w], high→low; (0,0) is the point at infinity. */
  private foldWindows(windows: { x: bigint; y: bigint }[], c: number): { x: bigint; y: bigint } {
    const G = bn254.G1.ProjectivePoint;
    const toPt = (x: bigint, y: bigint) => (x === 0n && y === 0n ? G.ZERO : G.fromAffine({ x, y }));
    let acc = toPt(windows[windows.length - 1].x, windows[windows.length - 1].y);
    for (let w = windows.length - 2; w >= 0; w--) {
      for (let d = 0; d < c; d++) acc = acc.double();
      acc = acc.add(toPt(windows[w].x, windows[w].y));
    }
    if (acc.equals(G.ZERO)) return { x: 0n, y: 0n };
    const a = acc.toAffine();
    return { x: a.x, y: a.y };
  }

  /**
   * Offset point O = Σ_{i<n} R[srsOffset+i] · SRS[srsOffset+i] for one point set,
   * computed on the GPU and cached. A masked run over ZERO scalars yields
   * masked = (0 + R) mod r = R, so the result is exactly O — the same fast GPU
   * path the real MSMs use (~one MSM) instead of seconds of single-threaded
   * noble. Each (srsOffset, n) is computed once, then reused across every
   * same-shape commit and every later round/prove.
   */
  private async getMaskOffset(srsOffset: number, n: number): Promise<{ x: bigint; y: bigint }> {
    const key = `${srsOffset}:${n}`;
    const hit = this.maskOffsetCache.get(key);
    if (hit) return hit;
    const t0 = performance.now();
    if (this.zeroScalars === null || this.zeroScalars.byteLength < n * 32) {
      this.zeroScalars = new Uint8Array(n * 32);
    }
    const zeros = this.zeroScalars.subarray(0, n * 32);
    const msm = await this.getOrCreateMsm(n);
    await msm.prepare(zeros, srsOffset);
    const { windowSums, c } = await msm.run();
    const O = this.foldWindows(windowSums, c);
    this.maskOffsetCache.set(key, O);
    console.log(`[mask] offset O(${key}) via GPU zero-run in ${(performance.now() - t0).toFixed(0)}ms`);
    return O;
  }

  /**
   * Recover the true commitment from a masked MSM's per-window sums: subtract
   * the offset O from window 0 (weight 2^0 = 1) so the downstream Horner
   * combine yields C = C' - O. Mutates `windows[0]` in place. No-op when
   * masking is off. (0,0) is read/written as the point at infinity.
   */
  private async applyMaskOffset(srsOffset: number, n: number, windows: { x: bigint; y: bigint }[]): Promise<void> {
    if (!this.maskingEnabled || windows.length === 0) return;
    const O = await this.getMaskOffset(srsOffset, n);
    if (O.x === 0n && O.y === 0n) return; // subtracting infinity is a no-op
    const G = bn254.G1.ProjectivePoint;
    const toPt = (x: bigint, y: bigint) => (x === 0n && y === 0n ? G.ZERO : G.fromAffine({ x, y }));
    const w0 = windows[0];
    const adj = toPt(w0.x, w0.y).add(toPt(O.x, O.y).negate());
    if (adj.equals(G.ZERO)) {
      windows[0] = { x: 0n, y: 0n };
    } else {
      const a = adj.toAffine();
      windows[0] = { x: a.x, y: a.y };
    }
  }

  /**
   * Get (or build) an `MsmV2` for `n` points, bound to the shared pool. The
   * SRS-sized instance is pinned; others rotate through a small LRU.
   */
  /**
   * Fetch (or create) the `slot`-th MsmV2 instance for size `n`. Slot 0 is the
   * primary cache entry (same as `getOrCreateMsm`); slots 1..K-1 are extra
   * instances kept in `slotPools[n]` so a same-N batch can place each MSM in
   * its own instance and the bridge's single-encoder path can encode them all
   * into one command buffer. Falls back to slot 0 (sharing) for slots ≥ K.
   */
  private async getOrCreateMsmSlot(n: number, slot: number): Promise<MsmV2> {
    if (slot === 0) return this.getOrCreateMsm(n);
    if (slot >= MAX_SAME_N_SLOTS) return this.getOrCreateMsm(n);
    const device = await this.getDevice();
    const pool = this.pool!;
    let pools = this.slotPools.get(n);
    if (!pools) {
      pools = [];
      this.slotPools.set(n, pools);
    }
    // Slot 0 is the primary cache entry with profile:true (per-MSM GPU
    // timestamp lands in [msm] telemetry). Slots 1..K-1 have profile:false —
    // Apple Metal caps the per-device counter-sample-buffer pool (~64
    // QuerySets across all profile:true instances) and having profile on
    // every slot exhausts it ("Cannot allocate sample buffer"). The extra
    // slots exist to break same-N submit serialization, not for timestamp
    // readback; their GPU compute is fungible with slot 0's at the same n.
    while (pools.length <= slot - 1) {
      pools.push(
        await MsmV2.create(device, n, pool, {
          warmupRuns: 0,
          combineOnHost: false,
          profile: false,
          maskBuf: this.maskBuf ?? undefined,
        }),
      );
    }
    return pools[slot - 1];
  }

  private async getOrCreateMsm(n: number): Promise<MsmV2> {
    const device = await this.getDevice();
    const pool = this.pool!;
    if (n === this.srsN) {
      if (this.srsMsm === null) {
        this.srsMsm = await MsmV2.create(device, n, pool, {
          warmupRuns: 0,
          combineOnHost: false,
          profile: true,
          maskBuf: this.maskBuf ?? undefined,
        });
      }
      return this.srsMsm;
    }
    const hit = this.lru.get(n);
    if (hit) {
      // Refresh recency.
      this.lru.delete(n);
      this.lru.set(n, hit);
      return hit;
    }
    // Build before inserting — a throw leaves the cache clean.
    const fresh = await MsmV2.create(device, n, pool, {
      warmupRuns: 0,
      combineOnHost: false,
      profile: true,
      maskBuf: this.maskBuf ?? undefined,
    });
    while (this.lru.size >= MSM_LRU_CAP) {
      const oldest = this.lru.keys().next().value as number;
      this.lru.get(oldest)!.destroy();
      this.lru.delete(oldest);
    }
    this.lru.set(n, fresh);
    return fresh;
  }

  private evict(n: number): void {
    if (n === this.srsN) {
      this.srsMsm?.destroy();
      this.srsMsm = null;
    } else {
      const m = this.lru.get(n);
      if (m) {
        m.destroy();
        this.lru.delete(n);
      }
    }
  }

  /**
   * `OP_MSM` — run one MSM. With `combineOnHost: false`, MsmV2 yields the
   * per-window sums; they are written to the result region (`numWindows × 64`
   * canonical LE bytes) and `numWindows` + `c` go in the SAB slots, so the C++
   * hook Horner-combines them in native bb::g1.
   *
   * `points_ptr === 0` means the MSM's points are a prefix of the published SRS
   * — the shared pool is used. A non-zero pointer is an off-SRS point set; a
   * one-off pool + instance is built for it and torn down after the run.
   */
  private async runMsm(): Promise<void> {
    const n = Atomics.load(this.ctrl, SLOT_N);
    const pointsPtr = Atomics.load(this.ctrl, SLOT_POINTS_PTR);
    const scalarsPtr = Atomics.load(this.ctrl, SLOT_SCALARS_PTR);
    const resultPtr = Atomics.load(this.ctrl, SLOT_RESULT_PTR);
    // Treat as unsigned — the C++ side packs a point-index offset (always >= 0).
    const srsOffset = Atomics.load(this.ctrl, SLOT_SRS_OFFSET) >>> 0;

    if (n === 0) {
      Atomics.store(this.ctrl, SLOT_NUM_WINDOWS, 0);
      Atomics.store(this.ctrl, SLOT_C, 0);
      return;
    }

    // Zero-copy view of the scalars in WASM memory. Safe because the WASM
    // worker thread issued this request and is blocked on Atomics.wait until
    // STATE_DONE is set in handleMessage() — WASM cannot call memory.grow()
    // while blocked, so the underlying ArrayBuffer cannot be detached during
    // this view's lifetime (creation → MsmV2.prepare's writeBuffer → return).
    // Saves an n*32-byte copy per solo MSM (~2.8 MB at n=88_899).
    const scalars = new Uint8Array(this.wasmMemory!.buffer, scalarsPtr, n * 32);

    let msm: MsmV2;
    let oneOff: { pool: MsmV2Pool; msm: MsmV2 } | null = null;
    const tGet = performance.now();
    let hitKind: 'srs-pinned' | 'srs-cached' | 'srs-fresh' | 'off-srs' = 'srs-pinned';
    if (pointsPtr === 0) {
      if (this.pool === null || srsOffset + n > this.srsN) {
        throw new Error(
          `WebGPU bridge: SRS-prefix MSM n=${n} srsOffset=${srsOffset} doesn't fit in pool (srsN=${this.srsN})`,
        );
      }
      // The instance cache is keyed by n alone; the per-call SRS offset
      // is threaded into prepare() so the same MsmV2 serves every commit
      // of the same size but different start_index.
      const cachedHit = n === this.srsN ? this.srsMsm !== null : this.lru.has(n);
      msm = await this.getOrCreateMsm(n);
      hitKind = n === this.srsN ? 'srs-pinned' : cachedHit ? 'srs-cached' : 'srs-fresh';
    } else {
      hitKind = 'off-srs';
      // Off-SRS MSM: bring its points in as a one-off pool.
      const device = await this.getDevice();
      const pointBytes = this.wasmSliceCopy(pointsPtr, n * 64);
      const pool = await MsmV2Pool.create(device, pointBytes);
      msm = await MsmV2.create(device, n, pool, { warmupRuns: 0, combineOnHost: false, profile: true });
      oneOff = { pool, msm };
    }
    const tGetEnd = performance.now();

    try {
      const tPrep = performance.now();
      // SRS-prefix MSMs pass the offset so MsmV2 bakes it into the
      // per-point indices written into active_sums; off-SRS uses the
      // one-off pool starting at index 0 (offset=0).
      await msm.prepare(scalars, oneOff === null ? srsOffset : 0);
      const tPrepEnd = performance.now();
      const { windowSums, c } = await msm.run();
      const tRunEnd = performance.now();
      // Masking applies only to SRS-prefix MSMs (off-SRS one-offs are built
      // without maskBuf). Recover C = C' - O before writing + verifying, so the
      // window sums shipped to C++ fold to the true commitment and the optional
      // cross-check validates the full masking pipeline end to end.
      if (pointsPtr === 0) await this.applyMaskOffset(srsOffset, n, windowSums);
      this.writeWindowSumsLE(resultPtr, windowSums);
      Atomics.store(this.ctrl, SLOT_NUM_WINDOWS, windowSums.length);
      Atomics.store(this.ctrl, SLOT_C, c);
      // SRS-prefix solo MSM only — off-SRS one-offs use points the cross-check can't see.
      if (pointsPtr === 0) this.verifyDelegatedMsm('(solo)', n, srsOffset, scalars, windowSums, c);
      // Per-MSM telemetry: get/prepare/run breakdown lets the bench see
      // whether MsmV2 instance setup (rebuild on LRU miss) or GPU dispatch
      // dominates. Costs only one console.log per delegated MSM.
      console.log(
        `[bridge-msm] n=${n} kind=${hitKind} srsOff=${srsOffset} get=${(tGetEnd - tGet).toFixed(1)}ms ` +
          `prepare=${(tPrepEnd - tPrep).toFixed(1)}ms run=${(tRunEnd - tPrepEnd).toFixed(1)}ms`,
      );
      if (bridgeTraceOn()) {
        traceCpu(`get n=${n}`, tGet, tGetEnd, { n, kind: hitKind });
        traceCpu(`prepare n=${n}`, tPrep, tPrepEnd, { n });
        traceCpu(`run n=${n}`, tPrepEnd, tRunEnd, { n });
        // Scalar writeBuffer upload (host→GPU). The queue-flush wall is the first slice of
        // prepare(); anchor the span there. Window-sums readback (GPU→host) lands in run().
        const uploadMs = msm.scalarUploadMs;
        traceMem(`scalars n=${n}`, tPrep, tPrep + uploadMs, n * 32, 'h2d', { n });
        traceMem(`windowSums n=${n}`, tPrepEnd, tRunEnd, msm.windowSumsByteLength, 'd2h', { n });
        // run() submits right after prepare returns, so anchor the GPU passes
        // to tPrepEnd. run() already drained + read the timestamps; re-reading
        // the staging buffer yields the same per-pass timeline.
        const raw = await msm.readProfilePassTimelineRaw();
        if (raw) {
          for (const p of raw.passes) {
            traceGpu(`${p.label} (solo n=${n})`, tPrepEnd + p.beginNs / 1e6, tPrepEnd + p.endNs / 1e6, {
              n,
              gpu_us: Math.round((p.endNs - p.beginNs) / 1000),
            });
          }
        }
      }
    } catch (e) {
      // A cached instance's prepared buffers may be torn — drop it so the next
      // request rebuilds. A one-off is torn down in `finally` regardless.
      if (oneOff === null) this.evict(n);
      throw e;
    } finally {
      if (oneOff) {
        oneOff.msm.destroy();
        oneOff.pool.destroy();
      }
    }
  }

  private writeWindowSumsLE(resultPtr: number, windows: { x: bigint; y: bigint }[]): void {
    if (this.wasmMemory === null) {
      throw new Error('WebGPU bridge: wasm memory not set');
    }
    const out = new Uint8Array(this.wasmMemory.buffer, resultPtr, windows.length * 64);
    for (let w = 0; w < windows.length; w++) {
      writeBigIntLE(out, w * 64, windows[w].x, 32);
      writeBigIntLE(out, w * 64 + 32, windows[w].y, 32);
    }
  }

  /**
   * Debug cross-check (gated by `globalThis.__bridge_verify_msms === true`):
   * recompute one delegated SRS-prefix MSM on the CPU with noble's tested
   * `bn254` group ops — the same scalars + the same SRS points the GPU saw —
   * and compare to the GPU's window-sums (Horner-folded the same way the C++
   * `combine_windows` does, reading (0,0) as the point at infinity). Logs one
   * `[msm-verify] OK|MISMATCH …` line per MSM so a single prove names the exact
   * polynomial(s) the GPU computes wrong. Off by default — the noble MSM costs
   * seconds at chonk sizes. No-op for off-SRS one-offs (no `srsBytes`).
   */
  private verifyDelegatedMsm(
    label: string,
    n: number,
    srsOffset: number,
    scalarsBytes: Uint8Array,
    windows: { x: bigint; y: bigint }[],
    c: number,
  ): void {
    if ((globalThis as any).__bridge_verify_msms !== true || this.srsBytes === null) return;
    try {
      const srs = this.srsBytes;
      const readLE = (buf: Uint8Array, off: number, len: number): bigint => {
        let v = 0n;
        for (let i = len - 1; i >= 0; i--) v = (v << 8n) | BigInt(buf[off + i]);
        return v;
      };
      const G = bn254.G1.ProjectivePoint;
      const toPt = (x: bigint, y: bigint) => (x === 0n && y === 0n ? G.ZERO : G.fromAffine({ x, y }));
      const affine = (p: ReturnType<typeof G.fromAffine>): { x: bigint; y: bigint } => {
        try {
          const a = p.toAffine();
          return { x: a.x, y: a.y };
        } catch {
          return { x: 0n, y: 0n };
        }
      };

      // CPU reference: sum_j scalar_j · SRS[srsOffset + j], dropping zero scalars.
      const pts: ReturnType<typeof G.fromAffine>[] = [];
      const scs: bigint[] = [];
      for (let j = 0; j < n; j++) {
        const s = readLE(scalarsBytes, j * 32, 32);
        if (s === 0n) continue;
        const pOff = (srsOffset + j) * 64;
        pts.push(toPt(readLE(srs, pOff, 32), readLE(srs, pOff + 32, 32)));
        scs.push(s);
      }
      const cpu = pts.length === 0 ? { x: 0n, y: 0n } : affine(G.msm(pts, scs));

      // GPU: Horner-fold the per-window sums, acc = acc·2^c + L[w], high→low.
      let acc = toPt(windows[windows.length - 1].x, windows[windows.length - 1].y);
      for (let w = windows.length - 2; w >= 0; w--) {
        for (let d = 0; d < c; d++) acc = acc.double();
        acc = acc.add(toPt(windows[w].x, windows[w].y));
      }
      const gpu = affine(acc);

      const match = gpu.x === cpu.x && gpu.y === cpu.y;
      console.log(
        `[msm-verify] ${match ? 'OK      ' : 'MISMATCH'} label=${label} n=${n} c=${c} srsOff=${srsOffset} nnz=${scs.length}`,
      );
      // On the first mismatch, capture the EXACT inputs (real scalars + the SRS
      // pool) so the failure can be replayed in a clean solo MsmV2 on the same
      // GPU — the definitive "is it the data?" test. Window-exposed replay below.
      if (!match && !(globalThis as any).__capturedMsm) {
        (globalThis as any).__capturedMsm = { label, n, srsOffset, c, scalars: scalarsBytes.slice(), srsBytes: srs };
        console.log(`[msm-verify] captured ${label} n=${n} for replay — call await __replayCapturedMsm()`);
      }
    } catch (e) {
      console.log(`[msm-verify] ERROR label=${label} n=${n}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * `OP_BATCH_MSM` — run every MSM in a `batch_multi_scalar_mul` call as a
   * single GPU submit, awaited via a single `mapAsync`. Eliminates the
   * dominant per-MSM cost on the end-to-end Chonk bench (~10–30 ms of
   * Chrome event-loop polling latency on each individual `mapAsync`). For
   * 91 MSMs across the canonical ECDSA-r1 flow that's ~1.5–2.5 s saved.
   *
   * Per-MSM descriptor layout (5 × u32 = 20 bytes), packed by the C++
   * hook into a contiguous `descriptors_ptr` region:
   *   [0] n              point count of this MSM
   *   [1] srs_offset     point-index offset into the published SRS pool
   *   [2] scalars_off    byte offset of this MSM's scalars within
   *                      the batch scalars region (`scalars_base + off`)
   *   [3] result_off     byte offset of this MSM's result region within
   *                      the batch results region (`results_base + off`)
   *   [4] _reserved      reserved for off-SRS points pointer (always 0
   *                      in the current implementation; off-SRS commits
   *                      stay on the per-MSM path)
   *
   * After running, writes `numWindows` and `c` per MSM to
   * `meta_base + i * 8` so the C++ hook can `combine_windows` each one.
   */
  private async runBatchMsm(): Promise<void> {
    const batchCount = Atomics.load(this.ctrl, SLOT_N);
    const descPtr = Atomics.load(this.ctrl, SLOT_POINTS_PTR) >>> 0;
    const scalarsBase = Atomics.load(this.ctrl, SLOT_SCALARS_PTR) >>> 0;
    const resultsBase = Atomics.load(this.ctrl, SLOT_RESULT_PTR) >>> 0;
    const metaBase = Atomics.load(this.ctrl, SLOT_BATCH_META_PTR) >>> 0;
    const labelsPtr = Atomics.load(this.ctrl, SLOT_BATCH_LABELS_PTR) >>> 0;
    if (batchCount === 0) return;
    if (this.wasmMemory === null) {
      throw new Error('WebGPU bridge: wasm memory not set');
    }
    const tBatch0 = performance.now();
    if (this.pool === null) {
      throw new Error('WebGPU bridge: SRS pool not published');
    }

    const DESC_BYTES = 20;
    const SCALAR_BYTES = 32;

    const descs = new Uint32Array(this.wasmMemory.buffer.slice(descPtr, descPtr + batchCount * DESC_BYTES));

    // Decode optional per-MSM labels packed as `[u8 len, len ASCII bytes]`
    // back-to-back in WASM memory. Result is `batchCount` entries; missing
    // labels (or trailing bytes that don't decode cleanly) become `?`. The
    // C++ hook only fills SLOT_BATCH_LABELS_PTR when a labels span was
    // threaded through from CommitBatch::commit_and_send_to_verifier.
    const labels: string[] = new Array(batchCount).fill('?');
    if (labelsPtr !== 0) {
      // SharedArrayBuffer-backed views can't be passed to TextDecoder.decode,
      // so decode the label bytes by walking codepoint-by-codepoint into a
      // string. Labels are ASCII (entity names from Flavor::CommitmentLabels),
      // so a direct `fromCharCode` is sufficient.
      const bytes = new Uint8Array(this.wasmMemory.buffer, labelsPtr);
      let off = 0;
      for (let i = 0; i < batchCount; i++) {
        const len = bytes[off];
        off += 1;
        let s = '';
        for (let k = 0; k < len; k++) s += String.fromCharCode(bytes[off + k]);
        labels[i] = s;
        off += len;
      }
    }

    const device = await this.getDevice();

    // Per-MSM submit strategy with batched mapAsync. We *cannot* collapse
    // all MSMs into one encoder because `MsmV2.prepare()` is queue-ordered
    // (its writeBuffer calls fire before any submit), so two same-N MSMs
    // sharing an instance would clobber each other's uniforms — the second
    // prepare's plan would apply to the first MSM's dispatches in the
    // single-encoder submit.
    //
    // Per-MSM submits preserve correctness via the queue's FIFO ordering:
    //   submit(A) reads scalarsRawBuf with A's data ✓
    //   writeBuffer(scalarsRawBuf, B) happens after submit(A)'s commands ✓
    //   submit(B) reads scalarsRawBuf with B's data ✓
    //
    // The win is in deferring the mapAsync waits: we kick off all submits
    // first, THEN Promise.all the mapAsyncs. Chrome's event-loop polling
    // for queue completion shares one wait cycle across all stagings —
    // collapses N × ~10–30 ms of per-MSM polling latency into a single
    // wait. Per-staging mapAsync allocations get freed at the end of the
    // function (browser-managed once unmapped + destroyed).
    interface Pending {
      msm: MsmV2;
      staging: GPUBuffer;
      resultByteOff: number;
      windowCount: number;
      mapPromise: Promise<void>;
    }
    const pendings: Pending[] = new Array(batchCount);
    const phaseTrace = (globalThis as any).__bridge_phase_trace === true;

    // Detect same-N collisions in this batch: with one MsmV2 instance
    // per n, encoding two same-n MSMs into the same command buffer would
    // make them share scalarsRawBuf + per-level uniforms (the second
    // prepare clobbers the first's plan). For mixed-N batches we can
    // safely build one big encoder; for same-N collisions we fall back
    // to per-MSM submits with batched mapAsync.
    const nCounts = new Map<number, number>();
    for (let i = 0; i < batchCount; i++) {
      const n = descs[i * 5 + 0];
      nCounts.set(n, (nCounts.get(n) ?? 0) + 1);
    }
    let maxNCount = 0;
    for (const c of nCounts.values()) maxNCount = Math.max(maxNCount, c);
    // Slot-pool experiment (using getOrCreateMsmSlot) — tried Mon May 24:
    //   - Routes same-N MSMs through distinct MsmV2 instances so the same-N
    //     batch can encode into one command buffer (no scalarsRawBuf race).
    //   - Cost: ~80-100 ms per fresh instance create × ~30 extra slots needed
    //     across the chonk flow = ~3 s of upfront overhead.
    //   - GPU still executes passes within one command buffer sequentially —
    //     the slot pool removes per-MSM mapAsync but doesn't parallelize GPU
    //     compute itself.
    //   - Net: 0.78× → 0.58×. Reverted.
    // True same-N concurrency needs multi-MSM-per-shader rewrites (see status
    // doc), not multiple instances of the single-MSM shader. The slot-pool
    // path stays in place for the easy case (no collisions); same-N collisions
    // stay on per-MSM submit + batched mapAsync.
    const hasSameNCollision = maxNCount > 1;

    if (!hasSameNCollision) {
      // Single-encoder path with slot-pool assignment: prepare all MSMs
      // (writeBuffers queue in order, each into a distinct instance's
      // scalarsRawBuf), encode them all into one big encoder writing to one
      // shared staging buffer at distinct offsets, one submit, one mapAsync.
      // Eliminates per-MSM mapAsync polling (~15-25 ms each on Dawn/Metal) and
      // the inter-submit GPU idle gap for same-N batches.
      let totalStagingBytes = 0;
      const stagingOffsets: number[] = new Array(batchCount);
      const msms: MsmV2[] = new Array(batchCount);
      const resultOffs: number[] = new Array(batchCount);
      const tPrepSum0 = performance.now();
      for (let i = 0; i < batchCount; i++) {
        const n = descs[i * 5 + 0];
        const srsOffset = descs[i * 5 + 1];
        const scalarsOff = descs[i * 5 + 2];
        const resultOff = descs[i * 5 + 3];
        if (srsOffset + n > this.srsN) {
          throw new Error(
            `WebGPU bridge: batched MSM ${i} n=${n} srsOffset=${srsOffset} doesn't fit in pool (srsN=${this.srsN})`,
          );
        }
        const msm = await this.getOrCreateMsm(n);
        const scalarsBytes = new Uint8Array(this.wasmMemory.buffer, scalarsBase + scalarsOff, n * SCALAR_BYTES);
        const tP0 = bridgeTraceOn() ? performance.now() : 0;
        await msm.prepare(scalarsBytes, srsOffset);
        if (bridgeTraceOn()) {
          traceCpu(`prepare ${labels[i]}`, tP0, performance.now(), { n, idx: i });
          traceMem(`scalars ${labels[i]}`, tP0, tP0 + msm.scalarUploadMs, n * SCALAR_BYTES, 'h2d', { n, idx: i });
        }
        msms[i] = msm;
        resultOffs[i] = resultOff;
        // 4-byte align so the next MSM's u32 writes from the GPU are aligned.
        stagingOffsets[i] = totalStagingBytes;
        totalStagingBytes += msm.windowSumsByteLength;
      }
      const tPrepSum1 = performance.now();
      const sharedStaging = device.createBuffer({
        size: Math.max(4, totalStagingBytes),
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      const enc = device.createCommandEncoder();
      for (let i = 0; i < batchCount; i++) {
        msms[i].encodeIntoBatch(enc, sharedStaging, stagingOffsets[i]);
      }
      const tEncoded = performance.now();
      device.queue.submit([enc.finish()]);
      await sharedStaging.mapAsync(GPUMapMode.READ);
      const tMapped = performance.now();
      const stagingBytes = new Uint8Array(sharedStaging.getMappedRange().slice(0));
      sharedStaging.unmap();
      const metaOut = new Uint32Array(this.wasmMemory.buffer, metaBase, batchCount * 2);
      for (let i = 0; i < batchCount; i++) {
        const msm = msms[i];
        const windows = msm.decodeWindowSumsFromBytes(stagingBytes, stagingOffsets[i]);
        await this.applyMaskOffset(descs[i * 5 + 1], descs[i * 5 + 0], windows);
        const out = new Uint8Array(this.wasmMemory.buffer, resultsBase + resultOffs[i], windows.length * 64);
        for (let w = 0; w < windows.length; w++) {
          writeBigIntLE(out, w * 64, windows[w].x, 32);
          writeBigIntLE(out, w * 64 + 32, windows[w].y, 32);
        }
        metaOut[i * 2 + 0] = windows.length;
        metaOut[i * 2 + 1] = msm.c;
        this.verifyDelegatedMsm(
          labels[i],
          descs[i * 5 + 0],
          descs[i * 5 + 1],
          new Uint8Array(this.wasmMemory.buffer, scalarsBase + descs[i * 5 + 2], descs[i * 5 + 0] * SCALAR_BYTES),
          windows,
          msm.c,
        );
      }
      const tDecodeEnd = performance.now();
      sharedStaging.destroy();
      const gpuMsPerMsm = await Promise.all(msms.map(m => m.readProfileGpuMs()));
      let summed = 0;
      let uploadSum = 0;
      let histogramSum = 0;
      for (let i = 0; i < batchCount; i++) {
        const gpuMs = gpuMsPerMsm[i] ?? 0;
        summed += gpuMs;
        uploadSum += msms[i].scalarUploadMs;
        histogramSum += msms[i].bucketHistogramGpuMs;
        console.log(
          `[msm] name=${labels[i]} n=${descs[i * 5 + 0]} kind=mixed ` +
            `gpu=${gpuMs.toFixed(2)}ms (batch-1enc, idx=${i})`,
        );
      }
      console.log(
        `[batch-1enc] count=${batchCount} prepare=${(tPrepSum1 - tPrepSum0).toFixed(1)}ms ` +
          `encode=${(tEncoded - tPrepSum1).toFixed(1)}ms ` +
          `submit+wait=${(tMapped - tEncoded).toFixed(1)}ms ` +
          `gpu_sum=${summed.toFixed(2)}ms ` +
          `mem=${this.statsBytesSummary(msms)}`,
      );
      {
        const wall = tDecodeEnd - tBatch0;
        const gpuCompute = summed + histogramSum;
        const overhead = wall - Math.max(uploadSum, gpuCompute);
        console.log(
          `[batch-stat] kind=mixed count=${batchCount} ` +
            `wall=${wall.toFixed(1)}ms host_sync=${uploadSum.toFixed(2)}ms ` +
            `gpu_compute=${gpuCompute.toFixed(2)}ms ` +
            `(main=${summed.toFixed(2)}ms hist=${histogramSum.toFixed(2)}ms) ` +
            `overhead=${overhead.toFixed(1)}ms`,
        );
      }
      if (bridgeTraceOn()) {
        traceCpu(`encode ×${batchCount}`, tPrepSum1, tEncoded, { count: batchCount });
        traceCpu('submit+wait', tEncoded, tMapped, { count: batchCount });
        traceCpu(`decode ×${batchCount}`, tMapped, tDecodeEnd, { count: batchCount });
        // Single shared staging buffer mapped back (GPU→host) once for the whole batch.
        traceMem(`readback ×${batchCount}`, tEncoded, tMapped, totalStagingBytes, 'd2h', { count: batchCount });
        // All MSMs were submitted into one command buffer, so their per-pass
        // timestamps share the device GPU clock. Rebase every MSM onto the
        // batch's earliest pass begin (minEpoch) and anchor that to the submit
        // instant (tEncoded) — the passes then lay out in true GPU execution
        // order (MSM 0's passes, then MSM 1's, …) reflecting serial execution
        // within the single submit.
        const raws = await Promise.all(msms.map(m => m.readProfilePassTimelineRaw()));
        let minEpoch: bigint | null = null;
        for (const r of raws) {
          if (r && (minEpoch === null || r.epochNs < minEpoch)) minEpoch = r.epochNs;
        }
        if (minEpoch !== null) {
          for (let i = 0; i < batchCount; i++) {
            const r = raws[i];
            if (!r) continue;
            const offMs = Number(r.epochNs - minEpoch) / 1e6;
            for (const p of r.passes) {
              traceGpu(
                `${p.label} · ${labels[i]}`,
                tEncoded + offMs + p.beginNs / 1e6,
                tEncoded + offMs + p.endNs / 1e6,
                {
                  n: descs[i * 5 + 0],
                  idx: i,
                  gpu_us: Math.round((p.endNs - p.beginNs) / 1000),
                },
              );
            }
          }
        }
      }
      return;
    }

    // Tier 2 BatchMsmV2 path — see MSM_IMPL.md §3.4. Uniform same-N
    // batches at B ≥ 4 and n ≤ 2^17 win 1.07×-1.17× over the per-MSM
    // submit fallback below. Activated only when the chonk page sets
    // `__bridge_batch_enabled = true` around the run (the third button
    // on the page); falls through to the existing same-N fallback when
    // disabled or when the routing rule rejects the batch.
    const batchEnabled = (globalThis as any).__bridge_batch_enabled === true;
    const uniformN = nCounts.size === 1;
    const n0 = descs[0];
    const srsOff0 = descs[1];
    let allEqualSrsOff = true;
    for (let i = 0; i < batchCount; i++) {
      if (descs[i * 5 + 1] !== srsOff0) {
        allEqualSrsOff = false;
        break;
      }
    }
    // Loud diagnostic so we can see exactly which condition rejected when
    // the chonk page's "Run WebGPU (batch)" run doesn't show `route=batch-v2`
    // lines. Only fires when the user has explicitly opted in to batch
    // routing (the flag); silent otherwise.
    if (batchEnabled && hasSameNCollision) {
      const reasons: string[] = [];
      if (!uniformN) reasons.push(`mixed-n (sizes=${[...nCounts.keys()].join(',')})`);
      if (batchCount < batchMinB()) reasons.push(`B=${batchCount} < ${batchMinB()}`);
      if (n0 > batchMaxN()) reasons.push(`n=${n0} > ${batchMaxN()}`);
      if (!allEqualSrsOff)
        reasons.push(
          `srsOff mismatch (offsets=${Array.from({ length: batchCount }, (_, i) => descs[i * 5 + 1]).join(',')})`,
        );
      if (this.srsBytes === null) reasons.push('srsBytes null');
      if (reasons.length === 0) {
        console.log(`[batch-v2] routing accepted n=${n0} B=${batchCount} srsOffset=${srsOff0}`);
      } else {
        console.log(`[batch-v2] routing rejected n=${n0} B=${batchCount} reasons=[${reasons.join('; ')}]`);
      }
    }
    if (
      batchEnabled &&
      uniformN &&
      batchCount >= batchMinB() &&
      n0 <= batchMaxN() &&
      allEqualSrsOff &&
      this.srsBytes !== null
    ) {
      await this.runBatchMsmV2Path(batchCount, n0, srsOff0, descs, labels, scalarsBase, resultsBase, metaBase, tBatch0);
      return;
    }

    // Same-N collision path — per-MSM submits + batched mapAsync. Per-MSM
    // gpu timing is collected via `onSubmittedWorkDone()` regardless of
    // phaseTrace (cheap — one promise round-trip per MSM, which already
    // happens for mapAsync anyway). Note: this `gpu` measurement is the
    // queue-serialized wait, not isolated compute — same-N MSMs run
    // sequentially on the GPU queue, so MSM i's measurement includes
    // MSM 0..i's collective wait.
    interface PhaseSample {
      n: number;
      label: string;
      prepareMs: number;
      uploadMs: number;
      histWallMs: number;
      planMs: number;
      submitMs: number;
      gpuMs: number;
      mapAsyncMs: number;
    }
    // Indexed by batch position i so the post-batch sort can recover commit
    // order regardless of which .then() callback the JS runtime fired first.
    const phaseLog: (PhaseSample & { batchIdx: number })[] = [];
    // Absolute submit / drain instants (performance.now()) per MSM, captured
    // only when tracing, for the serial GPU-burst reconstruction below.
    const traceOn = bridgeTraceOn();
    const traceSubmitAbs: number[] = traceOn ? new Array(batchCount) : [];
    const traceDrainAbs: number[] = traceOn ? new Array(batchCount) : [];
    for (let i = 0; i < batchCount; i++) {
      const n = descs[i * 5 + 0];
      const srsOffset = descs[i * 5 + 1];
      const scalarsOff = descs[i * 5 + 2];
      const resultOff = descs[i * 5 + 3];
      if (srsOffset + n > this.srsN) {
        throw new Error(
          `WebGPU bridge: batched MSM ${i} n=${n} srsOffset=${srsOffset} doesn't fit in pool (srsN=${this.srsN})`,
        );
      }
      const msm = await this.getOrCreateMsm(n);
      const scalarsBytes = new Uint8Array(this.wasmMemory.buffer, scalarsBase + scalarsOff, n * SCALAR_BYTES);
      const tPrep0 = performance.now();
      await msm.prepare(scalarsBytes, srsOffset);
      const tPrep1 = performance.now();
      // Capture prepare sub-phases now — the MsmV2 instance is shared across the
      // same-N batch, so the next prepare() overwrites these fields.
      const uploadMs = msm.scalarUploadMs;
      const histWallMs = msm.prepHistogramWallMs;
      const planMs = msm.prepLevelPlanMs;
      if (traceOn) {
        traceCpu(`prepare ${labels[i]}`, tPrep0, tPrep1, { n, idx: i });
        traceMem(`scalars ${labels[i]}`, tPrep0, tPrep0 + msm.scalarUploadMs, n * SCALAR_BYTES, 'h2d', { n, idx: i });
      }
      const windowSumBytes = msm.windowSumsByteLength;
      const staging = device.createBuffer({
        size: windowSumBytes,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      const enc = device.createCommandEncoder();
      msm.encodeIntoBatch(enc, staging, 0);
      const tSub0 = performance.now();
      device.queue.submit([enc.finish()]);
      const tSub1 = performance.now();
      if (traceOn) {
        traceSubmitAbs[i] = tSub1;
        traceCpu(`submit ${labels[i]}`, tSub0, tSub1, { n, idx: i });
      }
      const tGpu0 = performance.now();
      const label = labels[i];
      const batchIdx = i;
      const mapPromise: Promise<void> = device.queue.onSubmittedWorkDone().then(() => {
        const tGpu1 = performance.now();
        if (traceOn) traceDrainAbs[batchIdx] = tGpu1;
        const mp = staging.mapAsync(GPUMapMode.READ);
        return mp.then(() => {
          const tMap1 = performance.now();
          phaseLog.push({
            batchIdx,
            n,
            label,
            prepareMs: tPrep1 - tPrep0,
            uploadMs,
            histWallMs,
            planMs,
            submitMs: tSub1 - tSub0,
            gpuMs: tGpu1 - tGpu0,
            mapAsyncMs: tMap1 - tGpu1,
          });
        });
      });
      pendings[i] = {
        msm,
        staging,
        resultByteOff: resultOff,
        windowCount: msm.numWindows,
        mapPromise,
      };
    }
    const tEncoded = performance.now();
    await Promise.all(pendings.map(p => p.mapPromise));
    const tMapped = performance.now();
    // Sort by batchIdx so the [msm] lines come out in commit order — the CSV
    // parser matches against the CPU pass's per-MSM log by sequence. Report
    // gpu_wait directly (time from submit to queue-drain for this MSM); for
    // a same-N batch GPU work serializes, so the average wait across the
    // batch ≈ batch_total / 2 + per-MSM_compute. The total batch GPU compute
    // is `max(gpu_wait) + prepare_total` (roughly). Per-MSM compute is
    // batch_total / N — emitted as gpu_avg for downstream stats.
    phaseLog.sort((a, b) => a.batchIdx - b.batchIdx);
    let maxGpuWait = 0;
    for (const p of phaseLog) maxGpuWait = Math.max(maxGpuWait, p.gpuMs);
    const gpuAvg = maxGpuWait / phaseLog.length;
    // True per-MSM main-pass compute, timestamp-measured. Same-N MSMs share an
    // MsmV2 instance — each prepare() overwrites the prior timestamp staging,
    // so only the LAST submit's per-pass timing survives. We collect it anyway
    // to anchor `gpu_compute` against an actual GPU measurement on the last
    // MSM in the batch; the sum-across-MSMs uses gpu_avg (=maxGpuWait / N) as
    // the per-MSM share, which matches the serial GPU execution model.
    const lastMsmGpuMs = (await pendings[batchCount - 1].msm.readProfileGpuMs()) ?? 0;
    let uploadSum = 0;
    let histogramSum = 0;
    for (const p of pendings) {
      uploadSum += p.msm.scalarUploadMs;
      histogramSum += p.msm.bucketHistogramGpuMs;
    }
    // Per-MSM main-pass compute share: total batch GPU wait / N ≈ per-MSM run.
    // This is an estimate — true compute is only readable for the last MSM.
    const perMsmMainEst = gpuAvg;
    const mainComputeSum = perMsmMainEst * batchCount;
    for (const p of phaseLog) {
      const other = Math.max(0, p.prepareMs - p.uploadMs - p.histWallMs - p.planMs);
      console.log(
        `[msm] name=${p.label} n=${p.n} kind=same-n ` +
          `prepare=${p.prepareMs.toFixed(1)}ms [upload=${p.uploadMs.toFixed(1)} histWall=${p.histWallMs.toFixed(1)} ` +
          `plan=${p.planMs.toFixed(1)} other=${other.toFixed(1)}] gpu_wait=${p.gpuMs.toFixed(2)}ms ` +
          `gpu_avg=${gpuAvg.toFixed(2)}ms (batch_size=${phaseLog.length})`,
      );
    }
    console.log(
      `[batch-Nenc] count=${batchCount} maxSameN=${maxNCount} ` +
        `encode=${(tEncoded - tBatch0).toFixed(1)}ms mapAsync=${(tMapped - tEncoded).toFixed(1)}ms ` +
        `mem=${this.statsBytesSummary(pendings.map(p => p.msm))}`,
    );
    if (phaseTrace) {
      for (const p of phaseLog) {
        console.log(
          `[phase] n=${p.n} label=${p.label} prepare=${p.prepareMs.toFixed(1)}ms ` +
            `submit=${p.submitMs.toFixed(2)}ms gpu=${p.gpuMs.toFixed(2)}ms mapAsync=${p.mapAsyncMs.toFixed(2)}ms`,
        );
      }
    }
    if (traceOn) {
      traceCpu(`await drain ×${batchCount}`, tEncoded, tMapped, { count: batchCount, maxSameN: maxNCount });
      // Each MSM's window-sums staging is mapped back (GPU→host) during the batched drain window.
      let readbackBytes = 0;
      for (const p of pendings) readbackBytes += p.windowCount * 64;
      traceMem(`readback ×${batchCount}`, tEncoded, tMapped, readbackBytes, 'd2h', { count: batchCount });
      // The GPU is one FIFO queue: same-N submits drain serially. Reconstruct
      // each MSM's GPU burst as [end of the previous burst (but not before this
      // MSM's own submit), this submit's drain instant]. submit/drain are
      // absolute performance.now() values, so the bars land on the shared
      // timeline. The per-pass detail isn't available here (the shared instance's
      // timestamp staging is clobbered by the next submit before it's read), so
      // these are coarse per-MSM bars — which is exactly what visualizes the
      // same-N serialization.
      let prevEnd = traceSubmitAbs[0] ?? tEncoded;
      for (let i = 0; i < batchCount; i++) {
        const submit = traceSubmitAbs[i];
        const drain = traceDrainAbs[i];
        if (submit === undefined || drain === undefined) continue;
        const start = Math.max(submit, prevEnd);
        traceGpu(`msm ${labels[i]}`, start, drain, { n: descs[i * 5 + 0], idx: i, kind: 'same-n' });
        prevEnd = drain;
      }
    }
    const tDecode0 = performance.now();
    const metaOut = new Uint32Array(this.wasmMemory.buffer, metaBase, batchCount * 2);
    for (let i = 0; i < batchCount; i++) {
      const p = pendings[i];
      const stagingBytes = new Uint8Array(p.staging.getMappedRange().slice(0));
      p.staging.unmap();
      const windows = p.msm.decodeWindowSumsFromBytes(stagingBytes, 0);
      await this.applyMaskOffset(descs[i * 5 + 1], descs[i * 5 + 0], windows);
      const out = new Uint8Array(this.wasmMemory.buffer, resultsBase + p.resultByteOff, windows.length * 64);
      for (let w = 0; w < windows.length; w++) {
        writeBigIntLE(out, w * 64, windows[w].x, 32);
        writeBigIntLE(out, w * 64 + 32, windows[w].y, 32);
      }
      metaOut[i * 2 + 0] = windows.length;
      metaOut[i * 2 + 1] = p.msm.c;
      this.verifyDelegatedMsm(
        labels[i],
        descs[i * 5 + 0],
        descs[i * 5 + 1],
        new Uint8Array(this.wasmMemory.buffer, scalarsBase + descs[i * 5 + 2], descs[i * 5 + 0] * SCALAR_BYTES),
        windows,
        p.msm.c,
      );
      p.staging.destroy();
    }
    const tDecodeEnd = performance.now();
    if (traceOn) traceCpu(`decode ×${batchCount}`, tDecode0, tDecodeEnd, { count: batchCount });
    {
      const wall = tDecodeEnd - tBatch0;
      const gpuCompute = mainComputeSum + histogramSum;
      const overhead = wall - Math.max(uploadSum, gpuCompute);
      console.log(
        `[batch-stat] kind=same-n count=${batchCount} maxSameN=${maxNCount} ` +
          `wall=${wall.toFixed(1)}ms host_sync=${uploadSum.toFixed(2)}ms ` +
          `gpu_compute=${gpuCompute.toFixed(2)}ms ` +
          `(main≈${mainComputeSum.toFixed(2)}ms hist=${histogramSum.toFixed(2)}ms last_msm_main=${lastMsmGpuMs.toFixed(2)}ms) ` +
          `overhead=${overhead.toFixed(1)}ms`,
      );
    }
  }

  /**
   * Tier 2 `BatchMsmV2` route for a uniform same-N batch. Caches one
   * `BatchMsmV2` instance per `(n, B)` so the SRS re-upload + Montgomery
   * convert only happens on first encounter; subsequent batches at the
   * same shape just call `prepareAll` + `runAll`.
   *
   * BatchMsmV2 returns B already-combined affine results, so each per-MSM
   * result slot is written as `num_windows = 1` with the single affine
   * point — the C++ `combine_windows` Horner fold returns it as-is
   * (`num_windows == 1` ⇒ loop runs 0 iterations, no doublings).
   */
  private async runBatchMsmV2Path(
    B: number,
    n: number,
    srsOffset: number,
    descs: Uint32Array,
    labels: string[],
    scalarsBase: number,
    resultsBase: number,
    metaBase: number,
    tBatch0: number,
  ): Promise<void> {
    if (this.srsBytes === null) {
      throw new Error('WebGPU bridge: SRS bytes missing for BatchMsmV2');
    }
    const SCALAR_BYTES = 32;
    const key = n * 65536 + B;
    let batch = this.batchInstances.get(key);
    const cacheHit = !!batch;
    if (batch) {
      this.batchInstances.delete(key);
      this.batchInstances.set(key, batch);
    } else {
      const device = await this.getDevice();
      const tCreate0 = performance.now();
      // Under masking the batch's internal MsmV2 binds the same per-position R
      // (maskBuf), so its B slots are masked exactly like the solo/same-N paths;
      // the offset O(srsOffset, n) is subtracted from each combined result below.
      batch = await BatchMsmV2.create(device, this.srsBytes, n, B, { maskBuf: this.maskBuf ?? undefined });
      console.log(`[batch-v2] create n=${n} B=${B} time=${(performance.now() - tCreate0).toFixed(1)}ms`);
      while (this.batchInstances.size >= BATCH_MSM_LRU_CAP) {
        const oldest = this.batchInstances.keys().next().value as number;
        this.batchInstances.get(oldest)!.destroy();
        this.batchInstances.delete(oldest);
      }
      this.batchInstances.set(key, batch);
    }

    const scalarsList: Uint8Array[] = new Array(B);
    for (let i = 0; i < B; i++) {
      const scalarsOff = descs[i * 5 + 2];
      scalarsList[i] = new Uint8Array(this.wasmMemory!.buffer, scalarsBase + scalarsOff, n * SCALAR_BYTES);
    }

    const tPrep0 = performance.now();
    await batch.prepareAll(scalarsList, srsOffset);
    const tPrep1 = performance.now();
    const { results, gpuMs, wallMs } = await batch.runAll();
    const tRun1 = performance.now();

    // Masked batch: each slot's combined result is C_b + O; subtract the shared
    // offset O(srsOffset, n) to recover C_b. results[] are already-combined
    // affine points, so the subtraction is on the point directly (not window 0).
    if (this.maskingEnabled) {
      const O = await this.getMaskOffset(srsOffset, n);
      if (!(O.x === 0n && O.y === 0n)) {
        const G = bn254.G1.ProjectivePoint;
        const toPt = (x: bigint, y: bigint) => (x === 0n && y === 0n ? G.ZERO : G.fromAffine({ x, y }));
        const negO = toPt(O.x, O.y).negate();
        for (let i = 0; i < B; i++) {
          const adj = toPt(results[i].x, results[i].y).add(negO);
          if (adj.equals(G.ZERO)) {
            results[i] = { x: 0n, y: 0n };
          } else {
            const a = adj.toAffine();
            results[i] = { x: a.x, y: a.y };
          }
        }
      }
    }

    const metaOut = new Uint32Array(this.wasmMemory!.buffer, metaBase, B * 2);
    const c = batch.instances[0].c;
    for (let i = 0; i < B; i++) {
      const resultOff = descs[i * 5 + 3];
      const out = new Uint8Array(this.wasmMemory!.buffer, resultsBase + resultOff, 64);
      writeBigIntLE(out, 0, results[i].x, 32);
      writeBigIntLE(out, 32, results[i].y, 32);
      metaOut[i * 2 + 0] = 1;
      metaOut[i * 2 + 1] = c;
    }

    // Telemetry — emit the same `[msm] kind=same-n` + `[batch-Nenc]` shape
    // serve.ts's aggregateGpuPhase regex expects so the GPU phase breakdown
    // keeps working. gpu_wait carries the BatchMsmV2 GPU wall (queue.submit
    // → mapAsync); gpu_avg = gpu_wait / B is the per-MSM amortized share.
    const gpuAvg = gpuMs / B;
    for (let i = 0; i < B; i++) {
      console.log(
        `[msm] name=${labels[i]} n=${n} kind=same-n ` +
          `prepare=${(tPrep1 - tPrep0).toFixed(1)}ms gpu_wait=${gpuMs.toFixed(2)}ms ` +
          `gpu_avg=${gpuAvg.toFixed(2)}ms (batch_size=${B})`,
      );
    }
    console.log(
      `[batch-Nenc] count=${B} maxSameN=${B} ` +
        `encode=${(tRun1 - tBatch0).toFixed(1)}ms mapAsync=0.0ms ` +
        `mem=${this.statsBytesSummary([batch.instances[0]])} ` +
        `route=batch-v2 cache=${cacheHit ? 'hit' : 'miss'} batch_gpu=${gpuMs.toFixed(1)}ms batch_wall=${wallMs.toFixed(1)}ms`,
    );

    if (bridgeTraceOn()) {
      traceCpu(`batch-v2 prepareAll B=${B} n=${n}`, tPrep0, tPrep1, { n, B });
      traceCpu(`batch-v2 runAll B=${B} n=${n}`, tPrep1, tRun1, { n, B });
      traceGpu(`batch-msm-v2 B=${B} n=${n}`, tPrep1, tPrep1 + gpuMs, { n, B, route: 'batch-v2' });
      // All B scalar columns uploaded (host→GPU) inside prepareAll; B affine results read back
      // (GPU→host) inside runAll.
      traceMem(`scalars B=${B} n=${n}`, tPrep0, tPrep1, B * n * SCALAR_BYTES, 'h2d', { n, B });
      traceMem(`readback B=${B}`, tPrep1, tRun1, B * 64, 'd2h', { n, B });
    }
  }
}

function writeBigIntLE(out: Uint8Array, offset: number, v: bigint, byteLength: number): void {
  let cur = v;
  const mask = 0xffn;
  for (let i = 0; i < byteLength; i++) {
    out[offset + i] = Number(cur & mask);
    cur >>= 8n;
  }
}

export { writeBigIntLE };

/**
 * Replay the MSM captured by `verifyDelegatedMsm` on the first mismatch: rebuild
 * a fresh pool from the captured SRS bytes and run a clean solo `MsmV2` with the
 * EXACT real scalars + srsOffset, on the same GPU, and cross-check vs noble.
 * This is the definitive "is it the data?" test:
 *   MISMATCH → the real scalars break a clean solo run → data-dependent compute bug (reproducible, minimisable).
 *   MATCH    → real scalars are fine solo → the chonk failure is the same-N batch CONTEXT, not the data.
 * Window-exposed as `__replayCapturedMsm`. Run a prove with `__bridge_verify_msms=true` first to populate the capture.
 */
async function replayCapturedMsm(opts?: { combineOnHost?: boolean }): Promise<void> {
  const cap = (globalThis as any).__capturedMsm;
  if (!cap) {
    console.log('[replay] nothing captured — run a prove with window.__bridge_verify_msms=true first');
    return;
  }
  const { label, n, srsOffset, scalars, srsBytes } = cap as {
    label: string;
    n: number;
    srsOffset: number;
    scalars: Uint8Array;
    srsBytes: Uint8Array;
  };
  const combineOnHost = opts?.combineOnHost ?? false;
  console.log(
    `[replay] ${label} n=${n} srsOff=${srsOffset} combineOnHost=${combineOnHost} — clean solo MsmV2, REAL scalars`,
  );
  const G = bn254.G1.ProjectivePoint;
  const readLE = (buf: Uint8Array, off: number, len: number): bigint => {
    let v = 0n;
    for (let i = len - 1; i >= 0; i--) v = (v << 8n) | BigInt(buf[off + i]);
    return v;
  };
  const toPt = (x: bigint, y: bigint) => (x === 0n && y === 0n ? G.ZERO : G.fromAffine({ x, y }));
  const toAff = (p: ReturnType<typeof G.fromAffine>): { x: bigint; y: bigint } => {
    try {
      const a = p.toAffine();
      return { x: a.x, y: a.y };
    } catch {
      return { x: 0n, y: 0n };
    }
  };

  const pts: ReturnType<typeof G.fromAffine>[] = [];
  const scs: bigint[] = [];
  for (let j = 0; j < n; j++) {
    const s = readLE(scalars, j * 32, 32);
    if (s === 0n) continue;
    const o = (srsOffset + j) * 64;
    pts.push(toPt(readLE(srsBytes, o, 32), readLE(srsBytes, o + 32, 32)));
    scs.push(s);
  }
  const cpu = pts.length === 0 ? { x: 0n, y: 0n } : toAff(G.msm(pts, scs));

  const device = await get_device();
  const pool = await MsmV2Pool.create(device, srsBytes); // the exact chonk pool (full SRS)
  const msm = await MsmV2.create(device, n, pool, { warmupRuns: 0, combineOnHost });
  let gpu: { x: bigint; y: bigint };
  try {
    await msm.prepare(scalars, srsOffset);
    const out = (await msm.run()) as { x?: bigint; y?: bigint; windowSums?: { x: bigint; y: bigint }[]; c?: number };
    if (combineOnHost) {
      gpu = { x: out.x!, y: out.y! };
    } else {
      const W = out.windowSums!;
      let acc = toPt(W[W.length - 1].x, W[W.length - 1].y);
      for (let w = W.length - 2; w >= 0; w--) {
        for (let d = 0; d < out.c!; d++) acc = acc.double();
        acc = acc.add(toPt(W[w].x, W[w].y));
      }
      gpu = toAff(acc);
    }
  } finally {
    msm.destroy();
    pool.destroy();
  }
  const match = gpu.x === cpu.x && gpu.y === cpu.y;
  console.log(
    `[replay] ${label} n=${n} → ${
      match
        ? 'MATCH ✓  → real scalars are correct in a clean solo run; the same-N BATCH CONTEXT is the bug'
        : 'MISMATCH ✗ → real scalars break a clean solo run; DATA-dependent compute bug (reproducible)'
    }`,
  );
}
(globalThis as any).__replayCapturedMsm = replayCapturedMsm;
