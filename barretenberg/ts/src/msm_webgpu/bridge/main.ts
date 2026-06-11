import { MsmV2, MsmV2Pool, MEM_BUDGET } from '../msm_v2.js';
import { runUnionPacks, type BridgeDescriptor } from './union_runner.js';
import { get_device } from '../cuzk/gpu.js';
import {
  ERR_GENERIC,
  OP_BATCH_MSM,
  OP_MSM,
  OP_PUBLISH_SRS,
  SLOT_BATCH_LABELS_PTR,
  SLOT_BATCH_META_PTR,
  SLOT_PARTIALS,
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
// Distinct union instances (one per pack max-n) cached across the prove. Chonk's
// commitment mix spans ~10 distinct n, and each pack's max-n is one of them, so a
// small cache amortises union-instance creation (tens of ms each) over the whole
// prove. Each is a full MsmV2 bound to the shared pool (envelope-sized prepare
// buffers), so the cap is kept tighter than the per-MSM LRU.
const UNION_LRU_CAP = 8;

/** The multi-MSM union path drives `batch_multi_scalar_mul` through one saturating
 *  GPU dispatch per budget-sized pack (MULTI_MSM_PERF.md: 3.5–14× GPU-throughput in
 *  the small-MSM regime) instead of K sequential per-MSM dispatches. Set
 *  `globalThis.__msm_union_bridge = false` to force the legacy per-MSM path (A/B
 *  comparison or instant revert if a prove ever diverges). Default ON. */
function unionBridgeEnabled(): boolean {
  return (globalThis as { __msm_union_bridge?: boolean }).__msm_union_bridge !== false;
}

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
  // Union instances for the multi-MSM packed path, keyed by a pack's max n (each
  // bound to the shared pool). Separate from `lru` so a union prepareBatch and a
  // per-MSM solo prepare never thrash the same instance's prepared buffers.
  private unionMsms = new Map<number, MsmV2>();

  // If a request arrives before `setWasmMemory` is called, we can't service it.
  // Used by the test harness; production order is always memory-then-message.
  private pendingErrorMessage: string | null = null;

  /** Extra MsmV2 config merged into every bridge-created instance — the
   *  embedding page sets `globalThis.__msmBridgeFlags` (e.g. `{
   *  halvingReduce: true, earlyExit: true }`) before requests arrive. Read
   *  at create time so harnesses can flip modes between runs. */
  private msmFlags(): Record<string, unknown> {
    return (globalThis as { __msmBridgeFlags?: Record<string, unknown> }).__msmBridgeFlags ?? {};
  }

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
    for (const m of this.unionMsms.values()) {
      try {
        m.destroy();
      } catch {
        /* idempotent */
      }
    }
    try {
      this.pool?.destroy();
    } catch {
      /* idempotent */
    }
    this.srsMsm = null;
    this.lru.clear();
    this.slotPools.clear();
    this.unionMsms.clear();
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
    for (const m of this.unionMsms.values()) m.destroy();
    this.unionMsms.clear();
    this.pool?.destroy();

    this.pool = await MsmV2Pool.create(device, srsBytes);
    this.srsN = n;
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
      pools.push(await MsmV2.create(device, n, pool, { warmupRuns: 0, combineOnHost: false, profile: false, ...this.msmFlags() }));
    }
    return pools[slot - 1];
  }

  private async getOrCreateMsm(n: number): Promise<MsmV2> {
    const device = await this.getDevice();
    const pool = this.pool!;
    if (n === this.srsN) {
      if (this.srsMsm === null) {
        this.srsMsm = await MsmV2.create(device, n, pool, { warmupRuns: 0, combineOnHost: false, profile: true, ...this.msmFlags() });
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
    const fresh = await MsmV2.create(device, n, pool, { warmupRuns: 0, combineOnHost: false, profile: true, ...this.msmFlags() });
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
      msm = await MsmV2.create(device, n, pool, { warmupRuns: 0, combineOnHost: false, profile: true, ...this.msmFlags() });
      oneOff = { pool, msm };
    }
    const tGetEnd = performance.now();

    try {
      const tPrep = performance.now();
      // SRS-prefix MSMs pass the offset so MsmV2 bakes it into the
      // per-point indices written into active_sums; off-SRS uses the
      // one-off pool starting at index 0 (offset=0).
      msm.prepare(scalars, oneOff === null ? srsOffset : 0);
      const tPrepEnd = performance.now();
      const { windowSums, c, stagedPartials, partialsPerWindow } = await msm.run();
      const tRunEnd = performance.now();
      if (stagedPartials !== null && partialsPerWindow > 0) {
        // Early exit: raw Montgomery staged bytes — the native
        // finish_and_combine_windows adopts the limbs directly.
        new Uint8Array(this.wasmMemory.buffer, resultPtr, stagedPartials.byteLength).set(stagedPartials);
        Atomics.store(this.ctrl, SLOT_NUM_WINDOWS, msm.numWindows);
        Atomics.store(this.ctrl, SLOT_PARTIALS, partialsPerWindow);
      } else {
        this.writeWindowSumsLE(resultPtr, windowSums);
        Atomics.store(this.ctrl, SLOT_NUM_WINDOWS, windowSums.length);
        Atomics.store(this.ctrl, SLOT_PARTIALS, 0);
      }
      Atomics.store(this.ctrl, SLOT_C, c);
      // Per-MSM telemetry: get/prepare/run breakdown lets the bench see
      // whether MsmV2 instance setup (rebuild on LRU miss) or GPU dispatch
      // dominates. Costs only one console.log per delegated MSM.
      console.log(
        `[bridge-msm] n=${n} kind=${hitKind} srsOff=${srsOffset} get=${(tGetEnd - tGet).toFixed(1)}ms ` +
          `prepare=${(tPrepEnd - tPrep).toFixed(1)}ms run=${(tRunEnd - tPrepEnd).toFixed(1)}ms`,
      );
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

    // Multi-MSM union path: pack the batch into budget-sized super-MSMs and run
    // each as ONE saturating dispatch (MULTI_MSM_PERF.md). Byte-identical to the
    // legacy per-MSM path (same per-window sums + meta), so the C++ Horner combine
    // — and the proof — is unchanged. Flag off ⇒ fall through to the legacy path.
    if (unionBridgeEnabled()) {
      await this.runBatchMsmUnion(descs, labels, batchCount, scalarsBase, resultsBase, metaBase, tBatch0);
      return;
    }

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
        msm.prepare(scalarsBytes, srsOffset);
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
        if (msm.windowSumsByteLength !== msm.numWindows * 64) {
          // Early exit: raw staged Montgomery bytes, adopted natively by
          // finish_and_combine_windows. meta packs (partials << 16) | windows.
          const len = msm.windowSumsByteLength;
          new Uint8Array(this.wasmMemory.buffer, resultsBase + resultOffs[i], len).set(
            stagingBytes.subarray(stagingOffsets[i], stagingOffsets[i] + len),
          );
          metaOut[i * 2 + 0] = ((msm.halvePartialsPerWindow << 16) | msm.numWindows) >>> 0;
          metaOut[i * 2 + 1] = msm.c;
        } else {
          const windows = msm.decodeWindowSumsFromBytes(stagingBytes, stagingOffsets[i]);
          const out = new Uint8Array(this.wasmMemory.buffer, resultsBase + resultOffs[i], windows.length * 64);
          for (let w = 0; w < windows.length; w++) {
            writeBigIntLE(out, w * 64, windows[w].x, 32);
            writeBigIntLE(out, w * 64 + 32, windows[w].y, 32);
          }
          metaOut[i * 2 + 0] = windows.length;
          metaOut[i * 2 + 1] = msm.c;
        }
      }
      sharedStaging.destroy();
      const gpuMsPerMsm = await Promise.all(msms.map(m => m.readProfileGpuMs()));
      let summed = 0;
      for (let i = 0; i < batchCount; i++) {
        const gpuMs = gpuMsPerMsm[i] ?? 0;
        summed += gpuMs;
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
      submitMs: number;
      gpuMs: number;
      mapAsyncMs: number;
    }
    // Indexed by batch position i so the post-batch sort can recover commit
    // order regardless of which .then() callback the JS runtime fired first.
    const phaseLog: (PhaseSample & { batchIdx: number })[] = [];
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
      msm.prepare(scalarsBytes, srsOffset);
      const tPrep1 = performance.now();
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
      const tGpu0 = performance.now();
      const label = labels[i];
      const batchIdx = i;
      const mapPromise: Promise<void> = device.queue.onSubmittedWorkDone().then(() => {
        const tGpu1 = performance.now();
        const mp = staging.mapAsync(GPUMapMode.READ);
        return mp.then(() => {
          const tMap1 = performance.now();
          phaseLog.push({
            batchIdx,
            n,
            label,
            prepareMs: tPrep1 - tPrep0,
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
    for (const p of phaseLog) {
      console.log(
        `[msm] name=${p.label} n=${p.n} kind=same-n ` +
          `prepare=${p.prepareMs.toFixed(1)}ms gpu_wait=${p.gpuMs.toFixed(2)}ms ` +
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
    const metaOut = new Uint32Array(this.wasmMemory.buffer, metaBase, batchCount * 2);
    for (let i = 0; i < batchCount; i++) {
      const p = pendings[i];
      const stagingBytes = new Uint8Array(p.staging.getMappedRange().slice(0));
      p.staging.unmap();
      if (p.msm.windowSumsByteLength !== p.msm.numWindows * 64) {
        const len = p.msm.windowSumsByteLength;
        new Uint8Array(this.wasmMemory.buffer, resultsBase + p.resultByteOff, len).set(stagingBytes.subarray(0, len));
        metaOut[i * 2 + 0] = ((p.msm.halvePartialsPerWindow << 16) | p.msm.numWindows) >>> 0;
        metaOut[i * 2 + 1] = p.msm.c;
        continue;
      }
      const windows = p.msm.decodeWindowSumsFromBytes(stagingBytes, 0);
      const out = new Uint8Array(this.wasmMemory.buffer, resultsBase + p.resultByteOff, windows.length * 64);
      for (let w = 0; w < windows.length; w++) {
        writeBigIntLE(out, w * 64, windows[w].x, 32);
        writeBigIntLE(out, w * 64 + 32, windows[w].y, 32);
      }
      metaOut[i * 2 + 0] = windows.length;
      metaOut[i * 2 + 1] = p.msm.c;
      p.staging.destroy();
    }
  }

  /**
   * Multi-MSM union path for `OP_BATCH_MSM`. Packs the descriptors into budget-
   * sized super-MSMs (`runUnionPacks`) and runs each as ONE saturating dispatch
   * (`MsmV2.prepareBatch`), then scatters each member's per-window sums back to its
   * result region in the SAME canonical-LE format + `(numWindows, c)` meta as the
   * legacy per-MSM path — so the C++ Horner combine and the proof are unchanged.
   * Members the union can't take (`srsOffset≠0`/`reserved≠0`, or too large for one
   * dispatch) run on the per-MSM path via {@link runSoloBridgeMember}, so every
   * descriptor's result + meta is written exactly once.
   */
  private async runBatchMsmUnion(
    descs: Uint32Array,
    labels: string[],
    batchCount: number,
    scalarsBase: number,
    resultsBase: number,
    metaBase: number,
    tBatch0: number,
  ): Promise<void> {
    const wasm = this.wasmMemory!;
    const pool = this.pool!;
    const descriptors: BridgeDescriptor[] = new Array(batchCount);
    for (let i = 0; i < batchCount; i++) {
      descriptors[i] = {
        n: descs[i * 5 + 0],
        srsOffset: descs[i * 5 + 1],
        scalarsOff: descs[i * 5 + 2],
        resultOff: descs[i * 5 + 3],
        reserved: descs[i * 5 + 4],
      };
      // Packable members (reserved==0) use the SRS prefix [srsOffset, srsOffset+n);
      // the union applies srsOffset as the point-fetch base, so reject one whose span
      // overruns the published pool. Off-SRS members (reserved≠0) run on the per-MSM
      // path and are validated there.
      const d = descriptors[i];
      if (d.reserved === 0 && d.srsOffset + d.n > this.srsN) {
        throw new Error(
          `WebGPU bridge: batched union MSM ${i} n=${d.n} srsOffset=${d.srsOffset} doesn't fit in pool (srsN=${this.srsN})`,
        );
      }
    }

    // Zero-copy scalar views into WASM memory — valid for the call's lifetime (the
    // WASM worker is blocked on Atomics.wait, so it cannot grow/detach memory).
    // `runUnionPacks` copies each member's bytes into its pack's concat buffer before
    // any await.
    const readScalars = (off: number, byteLen: number): Uint8Array =>
      new Uint8Array(wasm.buffer, scalarsBase + off, byteLen);

    const out = await runUnionPacks((maxN: number) => this.getOrCreateUnionMsm(maxN), descriptors, readScalars, {
      srsBytes: pool.srsBudgetBytes(),
      budgetBytes: MEM_BUDGET,
    });

    const metaOut = new Uint32Array(wasm.buffer, metaBase, batchCount * 2);
    for (const r of out.results) {
      const dst = new Uint8Array(wasm.buffer, resultsBase + r.resultOff, r.windows.length * 64);
      for (let w = 0; w < r.windows.length; w++) {
        writeBigIntLE(dst, w * 64, r.windows[w].x, 32);
        writeBigIntLE(dst, w * 64 + 32, r.windows[w].y, 32);
      }
      metaOut[r.descIdx * 2 + 0] = r.windows.length;
      metaOut[r.descIdx * 2 + 1] = r.c;
    }

    // Members the union path declined → per-MSM path (writes their result + meta).
    for (const i of out.fallback) {
      await this.runSoloBridgeMember(i, descs, scalarsBase, resultsBase, metaOut);
    }

    const tEnd = performance.now();
    const perMemberMs = out.results.length > 0 ? (tEnd - tBatch0) / out.results.length : 0;
    for (const r of out.results) {
      console.log(
        `[msm] name=${labels[r.descIdx]} n=${descs[r.descIdx * 5 + 0]} kind=union ` +
          `gpu=${perMemberMs.toFixed(2)}ms (batch-union, idx=${r.descIdx})`,
      );
    }
    console.log(
      `[batch-union] count=${batchCount} packed=${out.results.length} packs=${out.packCount} ` +
        `fallback=${out.fallback.length} unionWindows=${out.totalUnionWindows} ` +
        `wall=${(tEnd - tBatch0).toFixed(1)}ms mem=${this.statsBytesSummary([...this.unionMsms.values()])}`,
    );
  }

  /**
   * Run one batch member on the per-MSM path (the union path's fallback for
   * `srsOffset≠0`/`reserved≠0` members and any too large for one union dispatch).
   * Writes its per-window sums + `(numWindows, c)` meta exactly as the legacy path.
   */
  private async runSoloBridgeMember(
    i: number,
    descs: Uint32Array,
    scalarsBase: number,
    resultsBase: number,
    metaOut: Uint32Array,
  ): Promise<void> {
    const wasm = this.wasmMemory!;
    const n = descs[i * 5 + 0];
    const srsOffset = descs[i * 5 + 1];
    const scalarsOff = descs[i * 5 + 2];
    const resultOff = descs[i * 5 + 3];
    const reserved = descs[i * 5 + 4];
    if (reserved !== 0) {
      // An off-SRS point pointer — never set by the current C++ batch hook. The
      // single-MSM OP_MSM path handles off-SRS via a one-off pool; surface this
      // loudly rather than silently treating it as an SRS-prefix MSM.
      throw new Error(
        `WebGPU bridge: batched MSM ${i} has reserved=${reserved} (off-SRS points unsupported in a batch)`,
      );
    }
    if (srsOffset + n > this.srsN) {
      throw new Error(
        `WebGPU bridge: batched MSM ${i} n=${n} srsOffset=${srsOffset} doesn't fit in pool (srsN=${this.srsN})`,
      );
    }
    const msm = await this.getOrCreateMsm(n);
    const scalars = new Uint8Array(wasm.buffer, scalarsBase + scalarsOff, n * 32);
    try {
      msm.prepare(scalars, srsOffset);
      const { windowSums, stagedPartials, partialsPerWindow } = await msm.run();
      if (stagedPartials !== null && partialsPerWindow > 0) {
        new Uint8Array(wasm.buffer, resultsBase + resultOff, stagedPartials.byteLength).set(stagedPartials);
        metaOut[i * 2 + 0] = ((partialsPerWindow << 16) | msm.numWindows) >>> 0;
        metaOut[i * 2 + 1] = msm.c;
      } else {
        const dst = new Uint8Array(wasm.buffer, resultsBase + resultOff, windowSums.length * 64);
        for (let w = 0; w < windowSums.length; w++) {
          writeBigIntLE(dst, w * 64, windowSums[w].x, 32);
          writeBigIntLE(dst, w * 64 + 32, windowSums[w].y, 32);
        }
        metaOut[i * 2 + 0] = windowSums.length;
        metaOut[i * 2 + 1] = msm.c;
      }
    } catch (e) {
      // A torn cached instance — drop it so the next request rebuilds.
      this.evict(n);
      throw e;
    }
  }

  /**
   * Get (or build) a union `MsmV2` sized to a pack's `maxN`, bound to the shared
   * pool. Cached by `maxN` in its own LRU (separate from the per-MSM `lru`) so a
   * union prepareBatch and a per-MSM prepare never thrash one instance's buffers.
   */
  private async getOrCreateUnionMsm(maxN: number): Promise<MsmV2> {
    const hit = this.unionMsms.get(maxN);
    if (hit) {
      this.unionMsms.delete(maxN);
      this.unionMsms.set(maxN, hit);
      return hit;
    }
    const device = await this.getDevice();
    const fresh = await MsmV2.create(device, maxN, this.pool!, { warmupRuns: 0, combineOnHost: false, profile: false, ...this.msmFlags() });
    while (this.unionMsms.size >= UNION_LRU_CAP) {
      const oldest = this.unionMsms.keys().next().value as number;
      this.unionMsms.get(oldest)!.destroy();
      this.unionMsms.delete(oldest);
    }
    this.unionMsms.set(maxN, fresh);
    return fresh;
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
