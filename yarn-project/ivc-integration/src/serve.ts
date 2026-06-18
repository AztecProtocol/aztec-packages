import { AztecClientBackend, Barretenberg } from '@aztec/bb.js';
import { createLogger } from '@aztec/foundation/log';

import { Unpackr } from 'msgpackr';
import { ungzip } from 'pako';

import { concatChonkProofFields } from './chonk_native_proof.js';

// The benchmark loads its inputs from a pinned ivc-inputs.msgpack instead
// of the mock-circuit codegen (witgen.ts), so we deliberately don't import
// witgen — pulling it in would require a full noir build of the mock
// circuits + @aztec/foundation. chonk_browser.test.ts (the
// generateTestingIVCStack-driven test) goes through its own webpack bundle.

const logger = createLogger('aztec:ivc-test');

/* eslint-disable no-console */

// Expose APIs on window for browser testing
(window as any).Barretenberg = Barretenberg;
(window as any).AztecClientBackend = AztecClientBackend;

interface ChonkWebGpuBenchRunResult {
  /** Wall-clock ms for backend.prove. */
  proveMs: number;
  /** Wall-clock ms for backend.verify. */
  verifyMs: number;
  /** Verifier returned true. */
  verified: boolean;
  /** Length of the resulting proof bytes. */
  proofLength: number;
  /** Cumulative wall-clock ms spent in BN254 MSMs during prove (from the C++
   *  accumulator via bb.emitMsmPhase → [msm-phase-total]). 0 if the build lacks
   *  the instrumentation export. GPU bridge round-trips when WebGPU is on;
   *  native Pippenger when off. */
  msmPhaseMs: number;
  /** Peak WASM linear-memory heap during prove, in MiB — the same metric the
   *  CI browser benchmark greps as `(mem: X MiB)` (committed WebAssembly.Memory
   *  buffer of the one shared multi-threaded heap). Captured for both off and
   *  on; should be ~equal between them since delegating MSMs to the GPU does
   *  not shrink the WASM heap (polynomials still live there). */
  wasmHeapPeakMb: number;
  /** Peak GPU (VRAM) bytes the WebGPU MSM bridge held during prove, in MiB —
   *  the high-water of (SRS pool + active + LRU) GPUBuffer sizes self-accounted
   *  by the bridge. 0 when WebGPU is off (no bridge). This is the memory the
   *  WASM-heap metric above cannot see (separate GPU process). */
  gpuPeakMb: number;
  /** Best-effort JS-heap size after prove, in MiB, from
   *  performance.measureUserAgentSpecificMemory() (or performance.memory as a
   *  fallback). 0 when neither API is available under the test Chrome flags. */
  jsHeapMb: number;
}

interface ChonkWebGpuBenchResult {
  /** Number of circuits in the IVC stack actually executed. */
  numCreatorApps: number;
  /** WebGPU off — native Pippenger throughout. */
  off: ChonkWebGpuBenchRunResult;
  /** WebGPU on — BN254 batch MSMs at or above WEBGPU_MSM_THRESHOLD route through the bridge. */
  on: ChonkWebGpuBenchRunResult;
  /** True if the produced verification keys are byte-equal between runs. */
  vksMatch: boolean;
  /** True when the GPU adapter is SwiftShader/software (the webgpu=on run was
   *  skipped — not BN254 bit-exact). The bench test reads this to gate its
   *  on-mode assertions. */
  swiftshaderDetected: boolean;
}

/**
 * Best-effort JS-heap size in MiB. Prefers
 * `performance.measureUserAgentSpecificMemory()` (accurate cross-origin-isolated
 * breakdown — the bench server already sets the required COOP/COEP headers),
 * falling back to the legacy `performance.memory.usedJSHeapSize`, and 0 when
 * neither is exposed under the current Chrome flags. Never throws.
 */
async function measureJsHeapMb(): Promise<number> {
  try {
    const measure = (performance as any).measureUserAgentSpecificMemory;
    if (typeof measure === 'function') {
      const sample = await measure.call(performance);
      if (sample && typeof sample.bytes === 'number') {
        return sample.bytes / (1024 * 1024);
      }
    }
  } catch {
    // Can reject if not cross-origin-isolated or if the UA throttles the call.
    // Fall through to the legacy synchronous API.
  }
  const mem = (performance as any).memory;
  return mem && typeof mem.usedJSHeapSize === 'number' ? mem.usedJSHeapSize / (1024 * 1024) : 0;
}

/**
 * Run ChonkApi::prove once on `bytecodes` + `witnessStack` + `vks`, measuring
 * the prove and verify wall times. Spins up a fresh Barretenberg singleton
 * (with WebGPU MSM either off or on per `webgpuMsm`) so the comparison is
 * apples-to-apples and the SRS upload + GPU warmup costs are amortized per
 * run.
 */
async function runChonkOnce(
  webgpuMsm: boolean,
  bytecodes: Uint8Array[],
  witnessStack: Uint8Array[],
  vks: Uint8Array[],
  functionNames?: string[],
  msmCsvMode = false,
  loggerOverride?: (m: string) => void,
  msmDistributionMode = false,
  webgpuMsmBlocklist?: readonly string[],
  msmTraceMode = false,
  benchTraceOpts?: { maxDepth?: number; denylist?: readonly string[] },
  // Discarded proves run on this same instance BEFORE the measured one. A WebGPU
  // prove pays one-time GPU cold-start (SRS upload + Montgomery-convert, shader
  // compilation, buffer-pool allocation) that subsequent proves on the instance
  // skip; warming first makes the measured prove (and its trace) reflect steady
  // state rather than that cold-start. `onBeforeMeasured` fires after the last
  // warm-up, before the measured prove — used to reset the host bridge trace so
  // its lanes capture only the measured prove.
  warmupRuns = 0,
  onBeforeMeasured?: () => void | Promise<void>,
): Promise<{
  result: ChonkWebGpuBenchRunResult;
  vk: Uint8Array;
  /** The proof serialized as the native `bb verify --scheme chonk` reads it (concatenated field elements). */
  nativeProof: Uint8Array;
  /** Phase-level BB_BENCH per-call trace JSON (Chrome Trace Event format), when benchTraceOpts set. */
  benchTraceJson?: string;
  /** performance.now() ms at backend.prove entry/exit — the host-clock prove window. */
  proveStartMs: number;
  proveEndMs: number;
}> {
  // Capture the [msm-phase-total] line that bb.emitMsmPhase() makes the C++
  // accumulator log, so we can report the exact cumulative MSM-phase wall time
  // for this run. Wrap whatever base logger the caller wants.
  let msmPhaseMs = 0;
  let wasmHeapPeakMb = 0;
  const baseLog = loggerOverride ?? ((m: string) => logger.info(m));
  const capturingLog = (m: string): void => {
    const mt = /\[msm-phase-total\]\s+ms=([\d.]+)/.exec(m);
    if (mt) {
      msmPhaseMs = parseFloat(mt[1]);
    }
    // Every WASM log line carries the heap size as `(mem: X MiB)` (appended by
    // bb.js's logstr import). The shared linear memory only grows during a
    // prove, so the max observed value is the prove's peak — the same number
    // the CI browser memory benchmark greps as `(mem: X MiB)`.
    const mm = /\(mem:\s*([\d.]+)\s*MiB\)/.exec(m);
    if (mm) {
      const v = parseFloat(mm[1]);
      if (v > wasmHeapPeakMb) wasmHeapPeakMb = v;
    }
    baseLog(m);
  };
  const bb = await Barretenberg.initSingleton({
    threads: 16,
    logger: capturingLog,
    webgpuMsm,
    msmCsvMode,
    msmDistributionMode,
    msmTraceMode,
    benchTrace: benchTraceOpts !== undefined,
    benchTraceMaxDepth: benchTraceOpts?.maxDepth,
    benchTraceDenylist: benchTraceOpts?.denylist,
    webgpuMsmBlocklist,
  });
  try {
    // Cold-start warm-up: a fresh backend wrapper per prove (cheap — bb is reused,
    // so the bridge's GPU pool + compiled shaders persist), discarded.
    for (let w = 0; w < warmupRuns; w++) {
      baseLog(
        `[trace] warm-up prove ${w + 1}/${warmupRuns} (discarded — pays GPU cold-start so the measured prove is warm)`,
      );
      const warmBackend = new AztecClientBackend(bytecodes, bb, functionNames);
      await warmBackend.prove(witnessStack, vks);
    }
    if (onBeforeMeasured) await onBeforeMeasured();
    const backend = new AztecClientBackend(bytecodes, bb, functionNames);
    // Reset the bridge's whole-prove GPU-memory high-water before this run so
    // gpuPeakMb is per-run (the bridge module persists across off/on runs).
    // No-op when WebGPU is off (handle undefined / bridge not loaded).
    (window as any).__bridge_gpu_mem_reset?.();
    const t0 = performance.now();
    const { proof, proofFields, vk } = await backend.prove(witnessStack, vks);
    const proveMs = performance.now() - t0;
    const proveEndMs = performance.now();

    // GPU VRAM peak (bridge self-accounting) and JS heap — the memory the WASM
    // `(mem:)` metric can't see. GPU peak is 0 when WebGPU is off.
    const gpuPeakMb = ((window as any).__bridge_gpu_mem_peak?.() ?? 0) / (1024 * 1024);
    const jsHeapMb = await measureJsHeapMb();

    // Emit the cumulative MSM-phase wall time accrued during prove (the fresh
    // WASM instance starts the accumulator at 0). Emitted before verify so it
    // reflects the prove only; the [msm-phase-total] line arrives via the logger
    // proxy and is read into the result below (after verify, so it has landed).
    await bb.emitMsmPhase();

    // Dump the phase-level BB_BENCH per-call trace before destroying the singleton.
    const benchTraceJson = benchTraceOpts !== undefined ? await bb.dumpBenchTraceJson() : undefined;

    const t1 = performance.now();
    const verified = await backend.verify(proof, vk);
    const verifyMs = performance.now() - t1;

    return {
      result: {
        proveMs,
        verifyMs,
        verified,
        proofLength: proof.length,
        msmPhaseMs,
        wasmHeapPeakMb,
        gpuPeakMb,
        jsHeapMb,
      },
      vk,
      nativeProof: concatChonkProofFields(proofFields),
      benchTraceJson,
      proveStartMs: t0,
      proveEndMs,
    };
  } finally {
    await Barretenberg.destroySingleton();
  }
}

/** Raw step shape (mirrors PrivateExecutionStepRaw in C++). */
interface PinnedExecutionStep {
  function_name: string;
  bytecode: Uint8Array; // gzip-compressed ACIR bytecode
  witness: Uint8Array; // gzip-compressed witness
  vk: Uint8Array; // uncompressed serialized MegaVerificationKey
}

/**
 * Load and decode a pinned ivc-inputs.msgpack. Mirrors C++ in
 * barretenberg/cpp/src/barretenberg/chonk/private_execution_steps.cpp:
 * msgpack-decodes a `vector<PrivateExecutionStepRaw>` and gunzips the
 * inner bytecode + witness fields per step. The msgpack file itself is
 * served from the test harness (createServer in
 * chonk_browser_webgpu_bench.test.ts) at /ivc-inputs/<flow>.msgpack.
 */
async function loadPinnedInputs(flow: string): Promise<{
  bytecodes: Uint8Array[];
  witnesses: Uint8Array[];
  vks: Uint8Array[];
  functionNames: string[];
}> {
  const url = `/ivc-inputs/${flow}.msgpack`;
  logger.info(`[bench] fetching pinned inputs from ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  logger.info(`[bench] msgpack size: ${buf.length} bytes; decoding`);

  // useRecords:false keeps records as plain objects; structuredClone keeps
  // bytecode/witness as Uint8Array (vs Buffer in Node) so the WASM bridge sees
  // the raw bytes directly.
  const steps = new Unpackr({ useRecords: false, structuredClone: false }).unpack(buf) as PinnedExecutionStep[];
  logger.info(`[bench] decoded ${steps.length} steps; gunzipping bytecode + witness`);

  const bytecodes: Uint8Array[] = [];
  const witnesses: Uint8Array[] = [];
  const vks: Uint8Array[] = [];
  const functionNames: string[] = [];
  for (const step of steps) {
    bytecodes.push(ungzip(step.bytecode));
    witnesses.push(ungzip(step.witness));
    vks.push(step.vk); // vk is not gzipped
    functionNames.push(step.function_name);
  }
  logger.info(`[bench] inputs ready: ${steps.length} circuits, names: ${functionNames.join(', ')}`);
  return { bytecodes, witnesses, vks, functionNames };
}

/**
 * End-to-end ChonkApi::prove benchmark with WebGPU on vs off, using the
 * pinned ECDSA-r1 transfer flow. Loads
 * yarn-project/end-to-end/example-app-ivc-inputs-out/<flow>/ivc-inputs.msgpack
 * via /ivc-inputs/<flow>.msgpack (served by the test harness), runs the
 * full proving pipeline twice, and reports wall-times + VK cross-check.
 *
 * Default flow is `ecdsar1+transfer_1_recursions+sponsored_fpc` — the
 * canonical chonk benchmark per the profile-chonk skill.
 *
 * Exposed on `window` so chonk_browser_webgpu_bench.test.ts (Puppeteer)
 * can call it via page.evaluate(); the interactive UI button below also
 * uses it.
 */
async function runChonkWebGpuBench(
  flow: string = 'ecdsar1+transfer_1_recursions+sponsored_fpc',
): Promise<ChonkWebGpuBenchResult & { flow: string; adapter: string }> {
  // Probe the GPU adapter up-front so the test log makes it obvious which
  // backend is actually running the MSM (real hardware vs SwiftShader).
  // The bridge inside bb.js requests its own device at first SRS publish,
  // so this probe is informational — but it'd surface a misconfigured
  // launch (Vulkan flag forcing software etc.) before the bench wall-time
  // is interpreted as a meaningful signal.
  let adapterInfo = 'unavailable';
  if ('gpu' in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        const info = (adapter as any).info ?? (await (adapter as any).requestAdapterInfo?.());
        adapterInfo = info
          ? `${info.vendor ?? '?'} / ${info.architecture ?? '?'} / ${info.device ?? '?'} / ${info.description ?? '?'}`
          : 'unknown';
      } else {
        adapterInfo = 'requestAdapter returned null';
      }
    } catch (err) {
      adapterInfo = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  logger.info(`[bench] GPU adapter: ${adapterInfo}`);

  const swiftshaderDetected = /swiftshader/i.test(adapterInfo);

  const { bytecodes, witnesses, vks, functionNames } = await loadPinnedInputs(flow);
  logger.info(`[bench] running webgpu=off then webgpu=on on flow=${flow} (${bytecodes.length} circuits)`);

  const off = await runChonkOnce(false, bytecodes, witnesses, vks, functionNames);
  logger.info(
    `[bench] webgpu=off: prove=${off.result.proveMs.toFixed(0)}ms verify=${off.result.verifyMs.toFixed(0)}ms`,
  );

  if (swiftshaderDetected) {
    // SwiftShader (software WebGPU) does not produce bit-exact BN254 affine
    // arithmetic — proof verification fails on its output. The VK-match
    // invariant only holds on real hardware; on Linux CI without a hardware
    // GPU we return the off-mode baseline and an empty `on` placeholder so
    // the caller can detect this and skip its GPU assertions.
    logger.warn(
      `[bench] SwiftShader detected — skipping webgpu=on run. ` +
        `Run on a hardware GPU (Apple Metal / discrete NVIDIA) to validate vks_match.`,
    );
    return {
      flow,
      adapter: adapterInfo,
      numCreatorApps: bytecodes.length,
      off: off.result,
      on: {
        proveMs: 0,
        verifyMs: 0,
        verified: false,
        proofLength: 0,
        msmPhaseMs: 0,
        wasmHeapPeakMb: 0,
        gpuPeakMb: 0,
        jsHeapMb: 0,
      },
      vksMatch: false,
      swiftshaderDetected: true,
    };
  }

  const on = await runChonkOnce(true, bytecodes, witnesses, vks, functionNames);
  logger.info(`[bench] webgpu=on:  prove=${on.result.proveMs.toFixed(0)}ms verify=${on.result.verifyMs.toFixed(0)}ms`);

  // Sanity check: WebGPU and native paths must produce identical VKs. A
  // divergence here would indicate the GPU MSM corrupted a commitment.
  const vksMatch = off.vk.length === on.vk.length && off.vk.every((b, i) => b === on.vk[i]);
  if (!vksMatch) {
    logger.error(`[bench] VK mismatch between webgpu off and on — GPU path may be incorrect`);
  }

  return {
    flow,
    adapter: adapterInfo,
    numCreatorApps: bytecodes.length,
    off: off.result,
    on: on.result,
    vksMatch,
    swiftshaderDetected: false,
  };
}

(window as any).runChonkWebGpuBench = runChonkWebGpuBench;

/**
 * The (label[, size]) pairs we keep on the CPU even when WebGPU is on. Two
 * groups, matched against the per-MSM telemetry name passed down from
 * `commit_and_send_to_verifier`:
 *
 *   1. Wildcard-label entries ("LABEL") — block at any n. These are the
 *      columns the distribution-mode analysis (see
 *      /tmp/zac-webgpu/chonk-delegate-eligible.md) flagged as 🟡 verify or
 *      🔴 block: every nonzero scalar lands in a tiny number of buckets
 *      (selectors are 0/1, lookup tags are mostly equal, VK precomputed
 *      polys are structured by construction). The MsmV2 pair-tree contract
 *      has the least margin there.
 *
 *   2. (label, n) entries ("LABEL@N") — block only at that exact size. These
 *      are pairs where the GPU is empirically a wash (≤1.5× per-MSM speedup
 *      against cpu_solo, which already overstates batched CPU). See
 *      /tmp/zac-webgpu/chonk-msm-cpu-vs-gpu-report.md. The win at other sizes
 *      of the same label is real, so we can't blanket-block the label.
 */
// The 10 translator range-constraint labels at n=131071. Solo path blocks
// them (the serial WebGPU `prepare` cost — ~396 ms for ~37 ms of compute
// — loses ~310 ms to CPU). BatchMsmV2's concatenated `prepareAll` upload
// invalidates that rationale, so the batch-mode blocklist below omits
// them. Dev-sweep B=10 n=2^17: batch wins 1.78×-2.32× wall vs WASM batch
// and 1.17× vs serial-WebGPU solo.
const TRANSLATOR_RANGE_CONSTRAINT_BLOCK_ENTRIES = [
  'CONCATENATED_RANGE_CONSTRAINTS_0@131071',
  'CONCATENATED_RANGE_CONSTRAINTS_1@131071',
  'CONCATENATED_RANGE_CONSTRAINTS_2@131071',
  'CONCATENATED_RANGE_CONSTRAINTS_3@131071',
  'CONCATENATED_NON_RANGE@131071',
  'ORDERED_RANGE_CONSTRAINTS_0@131071',
  'ORDERED_RANGE_CONSTRAINTS_1@131071',
  'ORDERED_RANGE_CONSTRAINTS_2@131071',
  'ORDERED_RANGE_CONSTRAINTS_3@131071',
  'ORDERED_RANGE_CONSTRAINTS_4@131071',
] as const;

// Label-only blocks at ALL sizes — the affine pair-tree mishandles these
// distributions for a reason that is NOT scalar magnitude/structure, so
// additive masking (which only turns structured scalars uniform) does NOT fix
// them. They remain blocked even under masking and run on the CPU; confirmed
// empirically (VK_PRECOMPUTED_POLY @ n=17455 srsOff=1982 still mismatches the
// CPU cross-check with masking armed).
const PAIR_TREE_HOSTILE_LABELS = ['LOOKUP_READ_COUNTS', 'LOOKUP_READ_TAGS', 'VK_PRECOMPUTED_POLY'] as const;

// Everything that stays on the CPU even when masking empties the rest of the
// blocklist: only the non-structural pair-tree-hostile labels, which masking
// does not fix. All correctly-maskable MSMs (including the B=3 wire groups)
// run on the GPU.
const MASKING_RESIDUAL_BLOCKLIST: readonly string[] = [...PAIR_TREE_HOSTILE_LABELS];

const DEFAULT_WEBGPU_BLOCKLIST: readonly string[] = [
  ...PAIR_TREE_HOSTILE_LABELS,
  // The WebGPU MSM computes commitments at n = 131071 (= 2^17 - 1) wrong. A
  // per-MSM CPU cross-check (bridge __bridge_verify_msms) shows every wrong
  // commitment in a chonk prove is at exactly this size — the translator's
  // polynomials — while the same labels/offsets at other sizes verify (e.g.
  // W_L@46498 with srsOff=1 is correct, so this is not an SRS-offset bug). It's
  // a size-specific MSM bug at 2^17-1. The 10 translator range-constraint polys
  // (below) were already blocked for perf, which masked it; the translator's
  // Z_PERM@131071 was not, which is what made the private-FPC proof fail to
  // verify. Block it until the n=2^17-1 case is fixed in MsmV2.
  'Z_PERM@131071',
  // (label, n) pairs where the GPU is a wash on Apple Metal (per-MSM
  // cpu_solo/gpu ≤ 1.5×, so production batched CPU is at parity or faster).
  // All of these are same-N triplets (W_L/W_R/W_O at a given size) or W_4
  // mixed-batch entries on the smaller transfer/ECDSA-r1 circuits. Z_PERM
  // and LOOKUP_INVERSES are intentionally NOT here: they're mixed-batch so
  // they don't pay the same-N `prepare` serialization tax, and they still
  // show a 1.3–1.4× per-MSM speedup that's worth keeping.
  'W_L@20406',
  'W_R@20406',
  'W_O@20406',
  'W_L@38778',
  'W_R@38778',
  'W_O@38778',
  'W_L@88899',
  'W_R@88899',
  'W_O@88899',
  'W_4@30240',
  'W_4@33050',
  // Translator range-constraint same-n batch at n=131071. The per-MSM CSV
  // ratios look great (3-7x cpu_solo/gpu), but production batched WASM
  // does the whole 10-way group in ~121 ms while the GPU spends ~396 ms
  // serial `prepare` for ~37 ms of compute — a net ~310 ms loss vs CPU.
  // CSV cpu_solo overstates batched CPU because it runs each MSM alone on
  // a fresh 16-thread Pippenger, missing the bucket-setup amortization.
  ...TRANSLATOR_RANGE_CONSTRAINT_BLOCK_ENTRIES,
];

// Blocklist used by the "Run WebGPU (batch)" button. Identical to the solo
// list: the 10 translator @131071 polys (and the translator Z_PERM@131071)
// are shifted commitments (srsOff = 1) that the GPU computes wrong, so they
// must NOT be delegated even via BatchMsmV2 — routing them through the batch
// path would just produce wrong commitments faster. Re-enable the batch route
// for them only once MsmV2's srsOffset path is fixed.
const DEFAULT_WEBGPU_BLOCKLIST_BATCH: readonly string[] = DEFAULT_WEBGPU_BLOCKLIST;

/**
 * Blocklist for an interactive WebGPU prove. Normally {@link DEFAULT_WEBGPU_BLOCKLIST};
 * but when the additive-masking experiment is armed (`globalThis.__bridge_mask_msms
 * === true`), masking turns structured scalars into uniform full-width ones the
 * GPU computes correctly, so the size/structure/perf blocks are dropped and ALL
 * those MSMs go to the GPU. The only residual blocks are {@link PAIR_TREE_HOSTILE_LABELS}
 * — masking does not fix those, so they stay on the CPU. Set the flag before
 * warm-up/init (the bridge freezes it at SRS-publish time) so the masking vector
 * and the blocklist agree.
 */
function webgpuBlocklist(): readonly string[] {
  return (globalThis as any).__bridge_mask_msms === true ? MASKING_RESIDUAL_BLOCKLIST : DEFAULT_WEBGPU_BLOCKLIST;
}

interface ChonkWebGpuBenchPartialResult {
  flow: string;
  adapter: string;
  numCreatorApps: number;
  /** True when the test environment only exposes a software WebGPU
   *  (SwiftShader). When set, the `onAll` / `onPartial` proofs were skipped
   *  because SwiftShader is not bit-exact for BN254 affine arithmetic — its
   *  results do not match the native Pippenger byte-for-byte, so any
   *  `vksMatch*` assertion would fire on a real-hardware-only invariant.
   *  Real GPU runs (Metal, Vulkan-on-discrete) must happen on a host with a
   *  hardware adapter. */
  swiftshaderDetected: boolean;
  off: ChonkWebGpuBenchRunResult;
  /** Undefined when `swiftshaderDetected` is true. */
  onAll?: ChonkWebGpuBenchRunResult;
  /** Undefined when `swiftshaderDetected` is true. */
  onPartial?: ChonkWebGpuBenchRunResult;
  /** webgpu=off VK byte-equal to webgpu=on(all). Undefined under SwiftShader. */
  vksMatchOffOnAll?: boolean;
  /** webgpu=off VK byte-equal to webgpu=on(blocklist applied). Undefined under SwiftShader. */
  vksMatchOffOnPartial?: boolean;
  /** Labels passed to the C++ block-list for the `onPartial` run. */
  blocklist: readonly string[];
}

/**
 * Three-way ChonkApi::prove comparison: webgpu=off, webgpu=on (all 91+ MSMs
 * delegated), webgpu=on with a per-label block-list applied so the columns
 * flagged 🟡/🔴 in the distribution analysis stay on CPU. Reports wall times
 * for all three plus VK byte-equality checks (off↔onAll and off↔onPartial).
 *
 * A passing `vksMatchOffOnPartial` is the actionable signal: it proves that
 * delegating only the 89 safe columns produces the same VK as the all-CPU
 * baseline, i.e. the block-list is correctly excluding the risky columns and
 * the rest of the delegate set is computing correct commitments.
 */
async function runChonkWebGpuBenchPartial(
  flow: string = 'ecdsar1+transfer_1_recursions+sponsored_fpc',
  blocklist: readonly string[] = DEFAULT_WEBGPU_BLOCKLIST,
): Promise<ChonkWebGpuBenchPartialResult> {
  let adapterInfo = 'unavailable';
  if ('gpu' in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        const info = (adapter as any).info ?? (await (adapter as any).requestAdapterInfo?.());
        adapterInfo = info
          ? `${info.vendor ?? '?'} / ${info.architecture ?? '?'} / ${info.device ?? '?'} / ${info.description ?? '?'}`
          : 'unknown';
      } else {
        adapterInfo = 'requestAdapter returned null';
      }
    } catch (err) {
      adapterInfo = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  logger.info(`[bench-partial] GPU adapter: ${adapterInfo}`);

  const swiftshaderDetected = /swiftshader/i.test(adapterInfo);

  const { bytecodes, witnesses, vks, functionNames } = await loadPinnedInputs(flow);
  logger.info(`[bench-partial] flow=${flow} (${bytecodes.length} circuits); blocklist=[${blocklist.join(', ')}]`);

  const off = await runChonkOnce(false, bytecodes, witnesses, vks, functionNames);
  logger.info(
    `[bench-partial] webgpu=off: prove=${off.result.proveMs.toFixed(0)}ms verify=${off.result.verifyMs.toFixed(0)}ms`,
  );

  if (swiftshaderDetected) {
    // SwiftShader is not bit-exact for BN254 affine arithmetic at this scale —
    // its float / integer-emulation paths give results that do not match the
    // native Pippenger byte-for-byte, so even an all-CPU vs all-GPU run fails
    // verification under it. The real-hardware comparison (off vs on(all) vs
    // on(blocklist)) has to run on a host with a hardware GPU (M-series Macs,
    // discrete NVIDIA, etc.). Skip the GPU runs here so the test still
    // exercises the partial-delegation plumbing without firing on a
    // hardware-dependent invariant.
    logger.warn(
      '[bench-partial] SwiftShader detected — skipping webgpu=on(all) and webgpu=on(blocklist) runs. ' +
        'Run on a hardware GPU (Apple Metal / discrete NVIDIA / etc.) to validate the VK-match invariant.',
    );
    return {
      flow,
      adapter: adapterInfo,
      numCreatorApps: bytecodes.length,
      swiftshaderDetected: true,
      off: off.result,
      blocklist,
    };
  }

  const onAll = await runChonkOnce(true, bytecodes, witnesses, vks, functionNames);
  logger.info(
    `[bench-partial] webgpu=on (all delegated): prove=${onAll.result.proveMs.toFixed(0)}ms verify=${onAll.result.verifyMs.toFixed(0)}ms`,
  );

  const onPartial = await runChonkOnce(
    true,
    bytecodes,
    witnesses,
    vks,
    functionNames,
    /*msmCsvMode=*/ false,
    /*loggerOverride=*/ undefined,
    /*msmDistributionMode=*/ false,
    /*webgpuMsmBlocklist=*/ blocklist,
  );
  logger.info(
    `[bench-partial] webgpu=on (blocklist applied): prove=${onPartial.result.proveMs.toFixed(0)}ms verify=${onPartial.result.verifyMs.toFixed(0)}ms`,
  );

  const vksMatchOffOnAll = off.vk.length === onAll.vk.length && off.vk.every((b, i) => b === onAll.vk[i]);
  const vksMatchOffOnPartial = off.vk.length === onPartial.vk.length && off.vk.every((b, i) => b === onPartial.vk[i]);
  if (!vksMatchOffOnAll) {
    logger.error('[bench-partial] VK mismatch: webgpu=off vs webgpu=on(all)');
  }
  if (!vksMatchOffOnPartial) {
    logger.error('[bench-partial] VK mismatch: webgpu=off vs webgpu=on(blocklist)');
  }

  return {
    flow,
    adapter: adapterInfo,
    numCreatorApps: bytecodes.length,
    swiftshaderDetected: false,
    off: off.result,
    onAll: onAll.result,
    onPartial: onPartial.result,
    vksMatchOffOnAll,
    vksMatchOffOnPartial,
    blocklist,
  };
}

(window as any).runChonkWebGpuBenchPartial = runChonkWebGpuBenchPartial;

/**
 * Run ChonkApi::prove once in a single mode and report wall times + proof
 * validity. `mode='wasm'` keeps every MSM on the multi-threaded WASM CPU
 * Pippenger; `mode='webgpu'` delegates the safe columns to the GPU with the
 * DEFAULT_WEBGPU_BLOCKLIST keeping the structured columns (selectors / lookup
 * counters / VK precomputed polys) on CPU. One backend, one prove, one verify
 * — there is no cross-mode coupling, so a failure in one mode never aborts the
 * other (unlike runChonkWebGpuBenchPartial, where an on-all throw hides the
 * block-list run).
 */
/**
 * GPU MSM-phase decomposition, aggregated from the bridge's per-batch telemetry
 * across the whole prove. Two bridge paths log differently:
 *  - Mixed-N batches ([batch-1enc]): host prepare/encode/submit+wait plus
 *    gpu_sum = the ACTUAL GPU compute from on-device timestamp queries.
 *  - Same-N batches ([batch-Nenc] + per-MSM [msm] kind=same-n): host encode/
 *    mapAsync and per-MSM prepare; the GPU figure here is gpu_wait (queue-
 *    serialized wall time) — an UPPER BOUND on compute, not isolated like
 *    the mixed path's timestamp gpu_sum.
 * msmPhaseMs is the ground-truth total MSM-phase wall time (C++ accumulator).
 */
interface GpuPhaseBreakdown {
  msmPhaseMs: number;
  mixedBatches: number;
  mixedPrepareMs: number;
  mixedEncodeMs: number;
  mixedSubmitWaitMs: number;
  mixedGpuComputeMs: number;
  sameNBatches: number;
  sameNEncodeMs: number;
  sameNMapAsyncMs: number;
  sameNPrepareMs: number;
  sameNGpuWaitMs: number;
}

function aggregateGpuPhase(lines: string[], msmPhaseMs: number): GpuPhaseBreakdown {
  const b: GpuPhaseBreakdown = {
    msmPhaseMs,
    mixedBatches: 0,
    mixedPrepareMs: 0,
    mixedEncodeMs: 0,
    mixedSubmitWaitMs: 0,
    mixedGpuComputeMs: 0,
    sameNBatches: 0,
    sameNEncodeMs: 0,
    sameNMapAsyncMs: 0,
    sameNPrepareMs: 0,
    sameNGpuWaitMs: 0,
  };
  const re1 =
    /\[batch-1enc\]\s+count=\d+\s+prepare=([\d.]+)ms\s+encode=([\d.]+)ms\s+submit\+wait=([\d.]+)ms\s+gpu_sum=([\d.]+)ms/;
  const reN = /\[batch-Nenc\]\s+count=\d+\s+maxSameN=\d+\s+encode=([\d.]+)ms\s+mapAsync=([\d.]+)ms/;
  const reMsmSameN = /\[msm\]\s+name=\S+\s+n=\d+\s+kind=same-n\s+prepare=([\d.]+)ms\s+gpu_wait=([\d.]+)ms/;
  for (const l of lines) {
    let m = re1.exec(l);
    if (m) {
      b.mixedBatches++;
      b.mixedPrepareMs += parseFloat(m[1]);
      b.mixedEncodeMs += parseFloat(m[2]);
      b.mixedSubmitWaitMs += parseFloat(m[3]);
      b.mixedGpuComputeMs += parseFloat(m[4]);
      continue;
    }
    m = reN.exec(l);
    if (m) {
      b.sameNBatches++;
      b.sameNEncodeMs += parseFloat(m[1]);
      b.sameNMapAsyncMs += parseFloat(m[2]);
      continue;
    }
    m = reMsmSameN.exec(l);
    if (m) {
      b.sameNPrepareMs += parseFloat(m[1]);
      b.sameNGpuWaitMs += parseFloat(m[2]);
    }
  }
  return b;
}

async function runChonkSingleMode(
  mode: 'wasm' | 'webgpu',
  flow: string = 'ecdsar1+transfer_1_recursions+sponsored_fpc',
  trace = false,
  blocklistOverride?: readonly string[],
): Promise<{
  flow: string;
  mode: 'wasm' | 'webgpu';
  adapter: string;
  blocklist: readonly string[];
  result: ChonkWebGpuBenchRunResult;
  vk: Uint8Array;
  /** The proof serialized as the native `bb verify --scheme chonk` reads it (concatenated field elements). */
  nativeProof: Uint8Array;
  gpuPhase?: GpuPhaseBreakdown;
  /** WASM MSM-phase Perfetto trace JSON, set when `trace` and `mode==='wasm'`. */
  traceJson?: string;
}> {
  const useWebgpu = mode === 'webgpu';
  let adapterInfo = 'n/a (wasm)';
  if (useWebgpu) {
    adapterInfo = 'unavailable';
    if ('gpu' in navigator) {
      try {
        const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (a) {
          const info = (a as any).info ?? (await (a as any).requestAdapterInfo?.());
          adapterInfo = info
            ? `${info.vendor ?? '?'} / ${info.architecture ?? '?'} / ${info.device ?? '?'} / ${info.description ?? '?'}`
            : 'unknown';
        } else {
          adapterInfo = 'requestAdapter returned null';
        }
      } catch (err) {
        adapterInfo = `error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }
  const blocklist = useWebgpu ? (blocklistOverride ?? DEFAULT_WEBGPU_BLOCKLIST) : [];

  const { bytecodes, witnesses, vks, functionNames } = await loadPinnedInputs(flow);
  logger.info(
    `[bench-single] mode=${mode} flow=${flow} (${bytecodes.length} circuits)` +
      (useWebgpu ? `; blocklist=[${blocklist.join(', ')}]` : ''),
  );

  // For the GPU run, sniff the bridge's per-batch telemetry ([batch-1enc] /
  // [batch-Nenc] / [msm] kind=same-n) off console.log so we can decompose the
  // GPU MSM phase into prepare vs actual GPU compute. The bridge runs on the
  // main thread and logs via console directly (the [msm-phase-total] total
  // comes separately through the WASM logger inside runChonkOnce).
  const bridgeLines: string[] = [];
  const origLog = console.log.bind(console);
  const origInfo = console.info.bind(console);
  if (useWebgpu) {
    const sniff =
      (orig: (...a: unknown[]) => void) =>
      (...args: unknown[]) => {
        const s = args.map(a => (typeof a === 'string' ? a : String(a))).join(' ');
        if (s.includes('[batch-1enc]') || s.includes('[batch-Nenc]') || s.includes('[msm]')) {
          bridgeLines.push(s);
        }
        orig(...(args as []));
      };
    console.log = sniff(origLog);
    console.info = sniff(origInfo);
  }

  // For the WASM run with tracing on, capture the C++ `[msm-span]` lines (a
  // prove-relative MSM-phase timeline) via the WASM logger. They arrive through
  // runChonkOnce's logger proxy, not console, so a logger override is the
  // reliable capture point (mirrors runChonkMsmCsv's [msm-csv-cpu] capture).
  const wasmTrace = !useWebgpu && trace;
  const spanLines: string[] = [];
  // For the WASM run, also capture `[msm-csv-cpu]` lines so we can print a
  // per-MSM CPU table at the end for the same MSMs the WebGPU button would
  // delegate. msmCsvMode runs every MSM solo on native Pippenger (no batched
  // amortisation) and is therefore slower than the production batched path —
  // the printed `[bench-single]` line for mode='wasm' notes this explicitly.
  const wasmCsvLines: string[] = [];
  const loggerOverride = !useWebgpu
    ? (m: string) => {
        if (wasmTrace && m.includes('[msm-span]')) spanLines.push(m);
        if (m.includes('[msm-csv-cpu]')) wasmCsvLines.push(m);
        logger.info(m);
      }
    : undefined;

  let result: ChonkWebGpuBenchRunResult;
  let vk: Uint8Array;
  let nativeProof: Uint8Array;
  try {
    const out = await runChonkOnce(
      useWebgpu,
      bytecodes,
      witnesses,
      vks,
      functionNames,
      /*msmCsvMode=*/ !useWebgpu,
      /*loggerOverride=*/ loggerOverride,
      /*msmDistributionMode=*/ false,
      /*webgpuMsmBlocklist=*/ useWebgpu ? blocklist : undefined,
      /*msmTraceMode=*/ wasmTrace,
    );
    result = out.result;
    vk = out.vk;
    nativeProof = out.nativeProof;
  } finally {
    if (useWebgpu) {
      console.log = origLog;
      console.info = origInfo;
    }
  }
  if (useWebgpu) {
    logger.info(
      `[bench-single] mode=${mode}: prove=${result.proveMs.toFixed(0)}ms verify=${result.verifyMs.toFixed(0)}ms verified=${result.verified} msmPhase=${result.msmPhaseMs.toFixed(0)}ms`,
    );
  } else {
    // Make it loud that the WASM MSM phase here is the csv-mode (solo-per-MSM)
    // accumulator — overstates the production batched WASM Pippenger.
    logger.info(
      `[bench-single] mode=${mode} (csv mode — every MSM solo): prove=${result.proveMs.toFixed(0)}ms verify=${result.verifyMs.toFixed(0)}ms verified=${result.verified} msmPhase=${result.msmPhaseMs.toFixed(0)}ms`,
    );
    emitWasmPerMsmTable(wasmCsvLines, DEFAULT_WEBGPU_BLOCKLIST);
  }

  const gpuPhase = useWebgpu ? aggregateGpuPhase(bridgeLines, result.msmPhaseMs) : undefined;
  const traceJson = wasmTrace ? buildWasmMsmTrace(spanLines) : undefined;
  return { flow, mode, adapter: adapterInfo, blocklist, result, vk, nativeProof, gpuPhase, traceJson };
}

/**
 * Mirror of `webgpu_msm_should_delegate` + `is_label_blocked` in the C++ hook
 * (barretenberg/cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_hook.{hpp,cpp}).
 * Returns true iff the MSM at this `(label, n)` would be delegated to the
 * WebGPU bridge under the given blocklist. Threshold matches the C++ default
 * of `WEBGPU_MSM_THRESHOLD = 1 << 14`.
 */
const WEBGPU_MSM_THRESHOLD = 1 << 14;
function isWebgpuEligible(label: string, n: number, blocklist: readonly string[]): boolean {
  if (n < WEBGPU_MSM_THRESHOLD) return false;
  for (const entry of blocklist) {
    const at = entry.indexOf('@');
    if (at === -1) {
      if (label === entry) return false;
    } else {
      const lbl = entry.slice(0, at);
      const nStr = entry.slice(at + 1);
      const blockedN = Number(nStr);
      if (!Number.isFinite(blockedN)) continue;
      if (label === lbl && n === blockedN) return false;
    }
  }
  return true;
}

/**
 * Parse the `[msm-csv-cpu]` lines captured during a WASM csv-mode prove and
 * print a per-MSM table for the MSMs that the WebGPU run *would* delegate
 * under the current blocklist (i.e. n ≥ threshold and not blocked). Sorted by
 * sequence so the user can correlate with the bridge's `[msm]` lines from a
 * separate WebGPU click. The `cpu_ms` column is csv-mode (solo) and overstates
 * the batched-WASM cost — a fair comparison still needs the GPU side run
 * separately, but the per-MSM ranking is a useful directional signal.
 */
function emitWasmPerMsmTable(lines: readonly string[], blocklist: readonly string[]): void {
  const re = /\[msm-csv-cpu\]\s+name=(\S+)\s+n=(\d+)\s+cpu_ms=([\d.]+)/;
  interface Row {
    seq: number;
    name: string;
    n: number;
    cpuMs: number;
  }
  const rows: Row[] = [];
  let seq = 0;
  for (const m of lines) {
    const match = re.exec(m);
    if (!match) continue;
    rows.push({ seq: seq++, name: match[1], n: Number(match[2]), cpuMs: Number(match[3]) });
  }
  const selected = rows.filter(r => isWebgpuEligible(r.name, r.n, blocklist));
  const totalMs = selected.reduce((s, r) => s + r.cpuMs, 0);
  // Emit via `console.log` directly so the page's console sniffer (installed
  // by setupChonkWebGpuPage at first click) captures these into the visible
  // log window. The foundation `createLogger` is a Pino wrapper that may
  // bind to the original `console.log` at module-init time — before the
  // sniffer replaces it — so `logger.info()` would only land in DevTools.
  console.log(
    `[wasm-per-msm] ${selected.length} MSMs would be delegated under the current blocklist ` +
      `(n ≥ ${WEBGPU_MSM_THRESHOLD}, label not in blocklist); cpu_solo_sum = ${totalMs.toFixed(0)} ms`,
  );
  // Padding chosen so the table lines up reasonably for the longest expected
  // names (CONCATENATED_RANGE_CONSTRAINTS_0 = 32 chars).
  for (const r of selected) {
    console.log(
      `  seq=${String(r.seq).padStart(3)}  name=${r.name.padEnd(34)}  n=${String(r.n).padStart(7)}  cpu_ms=${r.cpuMs.toFixed(2)}`,
    );
  }
}

interface TraceSpan {
  name: string;
  startMs: number;
  endMs: number;
  args?: Record<string, string | number>;
}

/**
 * Build a Chrome "Trace Event Format" JSON (one thread row per track) for
 * ui.perfetto.dev.
 *
 * Deliberately a LOCAL copy rather than `import { buildPerfettoTraceTracks } from
 * '@aztec/bb.js'`: importing it pulls bb.js's `perfetto_trace` module into this
 * page's synchronous entry bundle, where it is *also* statically imported by the
 * WebGPU bridge in bb.js's dynamically-imported (async) msm_webgpu chunk. webpack
 * then reorganizes that shared module across chunks, which reshuffled the
 * msm_webgpu chunk and silently broke the WebGPU MSM (wrong commitments → proof
 * verification failure). Keeping the builder local leaves the bb.js bundle
 * structure untouched. The bridge keeps its own copy via bb.js's perfetto_trace.
 */
function buildPerfettoTraceTracks(tracks: { name: string; spans: TraceSpan[] }[], processName: string): string {
  const all = tracks.flatMap(t => t.spans);
  // Loop rather than `Math.min(...all.map(…))`: the e2e trace has tens of thousands of C++ spans,
  // and spreading that many into a function call throws "Maximum call stack size exceeded".
  let t0 = all.length ? all[0].startMs : 0;
  for (const s of all) {
    if (s.startMs < t0) t0 = s.startMs;
  }
  const usPerMs = 1000;
  const events: Array<Record<string, unknown>> = [
    { ph: 'M', name: 'process_name', pid: 1, tid: 0, args: { name: processName } },
  ];
  let tid = 0;
  for (const track of tracks) {
    if (track.spans.length === 0) continue;
    tid += 1;
    events.push({ ph: 'M', name: 'thread_name', pid: 1, tid, args: { name: track.name } });
    for (const s of track.spans) {
      events.push({
        ph: 'X',
        name: s.name,
        pid: 1,
        tid,
        ts: (s.startMs - t0) * usPerMs,
        dur: Math.max(0, s.endMs - s.startMs) * usPerMs,
        args: s.args,
      });
    }
  }
  return JSON.stringify({ traceEvents: events, displayTimeUnit: 'ns' });
}

/** Parse the C++ `[msm-span] t0_us=… t1_us=… count=… n=… labels=…` lines from a
 *  traced WASM prove into a single-track Perfetto trace (CPU-only; no GPU on the
 *  WASM path). Each span sits at its true prove-relative wall position, so the
 *  trace is directly comparable to the WebGPU bridge trace's batch grouping. */
const MSM_SPAN_RE = /\[msm-span\]\s+t0_us=([\d.]+)\s+t1_us=([\d.]+)\s+count=(\d+)\s+n=(\d+)\s+labels=(.*)$/;
function buildWasmMsmTrace(lines: string[]): string | undefined {
  const spans: TraceSpan[] = [];
  for (const line of lines) {
    const m = MSM_SPAN_RE.exec(line);
    if (!m) continue;
    const count = parseInt(m[3], 10);
    const n = parseInt(m[4], 10);
    const labels = m[5].trim();
    spans.push({
      name: labels ? (count > 1 ? `[${count}] ${labels}` : labels) : `batch[${count}] n=${n}`,
      startMs: parseFloat(m[1]) / 1000,
      endMs: parseFloat(m[2]) / 1000,
      args: { count, n },
    });
  }
  if (spans.length === 0) return undefined;
  return buildPerfettoTraceTracks([{ name: 'WASM MSM (CPU, MT Pippenger)', spans }], 'Chonk MSM (WASM)');
}

// ─────────────────────────────────────────────────────────────────────────────
// End-to-end WebGPU Perfetto trace: WASM phase lanes (C++ BB_BENCH per-call) +
// bridge CPU/GPU/Memory lanes, all merged onto ONE main-thread performance.now()
// clock via a least-squares fit of (Date.now(), performance.now()) anchors.
// ─────────────────────────────────────────────────────────────────────────────

// Smallest record-time nesting-depth cap that keeps the prove-stage tree down to its deepest MSM
// overlay anchor (`MSM::batch_multi_scalar_mul` sits at record-depth 10 in the Hypernova → fold →
// Oink → commit_to_wires → batch_commit → MSM path) while auto-excluding the per-work-unit leaves
// below it (`MSM::evaluate_work_units` etc. live at record-depth 11+). Calibrated empirically from a
// native BB_BENCH=1 prove of the pinned flow.
const BENCH_TRACE_MAX_DEPTH = 10;

// Hot work-unit / parallel-chunk leaves that fall within the depth cap on shallower call paths and
// would otherwise flood the trace. Dropped at record time regardless of depth. The MSM anchors
// (`MSM::batch_multi_scalar_mul`, `CommitmentKey::batch_commit`, `CommitmentKey::commit`) are kept.
const BENCH_TRACE_DENYLIST: readonly string[] = [
  'MSM::evaluate_work_units',
  'MSM::batch_multi_scalar_mul/evaluate_work_units',
  'MSM::batch_multi_scalar_mul/scalars_to_montgomery',
  'MSM::batch_multi_scalar_mul/accumulate_results',
  'MSM::batch_multi_scalar_mul/batch_normalize',
  'MSM::scalars_to_montgomery/chunk',
  'MSM::convert_scalars',
  'compute_univariate_with_row_skipping/chunk',
  'Polynomial::op*=/chunk',
  'add_scaled_batch/chunk',
  'Lookup::compute_inverses/chunk',
  'Databus::compute_inverses/chunk',
];

interface AlignAnchor {
  /** C++ clock sample in ms — the WASI clock_time_get source (performance.timeOrigin + performance.now()). */
  cMs: number;
  /** Main-thread performance.now() ms, read back-to-back with cMs. */
  hMs: number;
}

interface AlignFit {
  /** Slope (≈1; absorbs any rate drift between the WASI clock and performance.now). */
  b: number;
  /** Centering epoch: anchors[0].cMs (a high-res wall-clock ms value). */
  cm0: number;
  /** performance.now() ms at cMs == cm0 (the fit intercept, in centered space). */
  hAtCm0: number;
  n: number;
  maxResidualMs: number;
  rmsResidualMs: number;
}

/**
 * Sample up to `maxCount` clock-alignment pairs back-to-back to bracket the prove (the per-bridge-
 * call anchors fill in across it). The WASI clock is now `performance.timeOrigin + performance.now()`,
 * so cMs reads that same source; on this thread cMs and hMs share one performance.now() read, making
 * each pair exact. `maxSpinMs` bounds the loop.
 */
function sampleEdgeAnchors(maxCount: number, maxSpinMs: number): AlignAnchor[] {
  const out: AlignAnchor[] = [];
  const deadline = performance.now() + maxSpinMs;
  const origin = performance.timeOrigin;
  while (out.length < maxCount && performance.now() < deadline) {
    const hMs = performance.now();
    out.push({ cMs: origin + hMs, hMs });
  }
  return out;
}

/**
 * Least-squares fit hMs ≈ hAtCm0 + b·(cMs − cm0). Centering at the first anchor's cMs keeps the
 * normal equations numerically sound — raw wall-clock ms values (~1.7e12) would overflow a double's
 * mantissa when squared. Reports max + RMS residual so the caller can validate the alignment (with
 * the high-res WASI clock the main-thread anchors are near-exact, so the residual is ~µs).
 */
function fitAnchors(anchors: readonly AlignAnchor[]): AlignFit | undefined {
  if (anchors.length < 2) return undefined;
  const cm0 = anchors[0].cMs;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const a of anchors) {
    const dx = a.cMs - cm0;
    sx += dx;
    sy += a.hMs;
    sxx += dx * dx;
    sxy += dx * a.hMs;
  }
  const n = anchors.length;
  const denom = n * sxx - sx * sx;
  // Degenerate (all anchors share one ms): fall back to slope 1.
  const b = Math.abs(denom) < 1e-9 ? 1 : (n * sxy - sx * sy) / denom;
  const hAtCm0 = (sy - b * sx) / n;
  let maxRes = 0;
  let sumSq = 0;
  for (const a of anchors) {
    const r = a.hMs - (hAtCm0 + b * (a.cMs - cm0));
    maxRes = Math.max(maxRes, Math.abs(r));
    sumSq += r * r;
  }
  return { b, cm0, hAtCm0, n, maxResidualMs: maxRes, rmsResidualMs: Math.sqrt(sumSq / n) };
}

/** Map a C++ clock sample (absolute ns) onto the main-thread performance.now() ms domain. */
function cppNsToHostMs(absNs: bigint, fit: AlignFit): number {
  // cm0 is now a fractional (high-res) ms, so convert via round (BigInt() rejects non-integers). The
  // ~256 ns rounding error on this centering constant is a uniform offset, immaterial to placement.
  const cm0Ns = BigInt(Math.round(fit.cm0 * 1e6));
  // Event time relative to the centering epoch, in ms. The difference spans only the prove
  // (~seconds), so Number() of the ns delta is exact and no precision is lost.
  const relMs = Number(absNs - cm0Ns) / 1e6;
  return fit.hAtCm0 + fit.b * relMs;
}

/**
 * Parse the C++ BB_BENCH Chrome-trace JSON (with its `min_ts_ns` header and per-event rebased `ts`
 * in µs) into one Perfetto track per WASM worker thread, every span mapped onto the main-thread
 * performance.now() domain via `fit`. Perfetto auto-nests the `'X'` events on a track by ts/dur
 * containment, so the phase tree renders without extra work.
 */
function mapCppTraceToTracks(
  json: string,
  fit: AlignFit,
): { tracks: { name: string; spans: TraceSpan[] }[]; eventCount: number } {
  const m = /"min_ts_ns"\s*:\s*(\d+)/.exec(json);
  const minTsNs = m ? BigInt(m[1]) : 0n;
  const parsed = JSON.parse(json) as { traceEvents: Array<Record<string, any>> };
  const tidName = new Map<number, string>();
  const tidSpans = new Map<number, TraceSpan[]>();
  let eventCount = 0;
  for (const e of parsed.traceEvents) {
    if (e.ph === 'M' && e.name === 'thread_name') {
      tidName.set(e.tid, e.args?.name ?? `tid${e.tid}`);
    } else if (e.ph === 'X') {
      const absNs = minTsNs + BigInt(Math.round((e.ts as number) * 1000));
      const startMs = cppNsToHostMs(absNs, fit);
      const endMs = startMs + ((e.dur as number) / 1000) * fit.b;
      let spans = tidSpans.get(e.tid);
      if (!spans) {
        spans = [];
        tidSpans.set(e.tid, spans);
      }
      spans.push({ name: e.name, startMs, endMs, args: e.args });
      eventCount++;
    }
  }
  const tracks = [...tidSpans.keys()]
    .sort((a, b) => a - b)
    .map(tid => ({ name: `WASM ${tidName.get(tid) ?? `tid${tid}`}`, spans: tidSpans.get(tid)! }));
  return { tracks, eventCount };
}

/** Gaps within [start, end] not covered by the union of any span — emitted as explicit `untracked`
 *  slices so unaccounted host time is never silently hidden. */
function untrackedSpans(allSpans: readonly TraceSpan[], start: number, end: number): TraceSpan[] {
  const ivals = allSpans
    .map(s => [Math.max(start, s.startMs), Math.min(end, s.endMs)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((p, q) => p[0] - q[0]);
  const gaps: TraceSpan[] = [];
  let cursor = start;
  for (const [a, b] of ivals) {
    if (a > cursor + 0.05) gaps.push({ name: 'untracked', startMs: cursor, endMs: a, args: { gap_ms: a - cursor } });
    cursor = Math.max(cursor, b);
  }
  if (end > cursor + 0.05)
    gaps.push({ name: 'untracked', startMs: cursor, endMs: end, args: { gap_ms: end - cursor } });
  return gaps;
}

/** One circuit's witness-commit (Oink) wall + the commitments delegated to the
 *  GPU in it. Per-circuit reduction = WASM oinkMs − WebGPU oinkMs. */
export interface PerCircuitRow {
  name: string;
  oinkMs: number;
  /** Commitment names whose MSM ran on the GPU in this circuit (empty for WASM). */
  gpuMsms: string[];
}

/**
 * Extract a per-circuit breakdown from a merged e2e Perfetto trace: each circuit
 * is one `OinkProver::prove` span on the WASM-main lane (the MSM-dominated
 * witness-commit phase), labelled by `functionNames` in prove order. `gpuMsms`
 * is the set of commitment names appearing on the GPU lane within that circuit's
 * window — i.e. the MSMs that were delegated to WebGPU there. Pure; validated
 * against captured traces in /tmp/zac-webgpu/.
 */
export function extractPerCircuit(traceJson: string, functionNames: string[]): PerCircuitRow[] {
  let parsed: { traceEvents?: Array<Record<string, any>> };
  try {
    parsed = JSON.parse(traceJson);
  } catch {
    return [];
  }
  const ev = parsed.traceEvents ?? [];
  const tidByName = new Map<string, number>();
  for (const e of ev) {
    if (e.ph === 'M' && e.name === 'thread_name') tidByName.set(e.args?.name, e.tid);
  }
  const mainTid = tidByName.get('WASM main');
  const gpuTid = tidByName.get('GPU (WebGPU passes)');
  const slices = ev.filter(e => e.ph === 'X');
  const windows = slices
    .filter(e => e.name === 'OinkProver::prove' && e.tid === mainTid)
    .map(e => ({ s: e.ts as number, en: (e.ts as number) + (e.dur as number), durUs: e.dur as number }))
    .sort((a, b) => a.s - b.s);
  const gpuSlices = gpuTid != null ? slices.filter(e => e.tid === gpuTid) : [];
  // GPU pass labels are "<pass>#<k> · <COMMITMENT>"; the suffix is the MSM identity.
  const commitment = (name: string): string | undefined =>
    name.includes('·') ? name.split('·').pop()!.trim() : undefined;
  const gpuNamesIn = (wins: Array<{ s: number; en: number }>): string[] => {
    const names = new Set<string>();
    for (const g of gpuSlices) {
      const ts = g.ts as number;
      if (wins.some(w => ts >= w.s && ts < w.en)) {
        const c = commitment(g.name as string);
        if (c) names.add(c);
      }
    }
    return [...names].sort();
  };

  const circuitRows: PerCircuitRow[] = windows.map((w, i) => ({
    name: functionNames[i] ?? `circuit ${i}`,
    oinkMs: w.durUs / 1000,
    gpuMsms: gpuNamesIn([w]),
  }));

  // Tail phases — once per prove, AFTER the per-circuit Oink loop (so they aren't
  // captured by the circuit windows): the Goblin ECCVM, the Translator (where the
  // tail GPU MSMs land), and the remaining decider/PCS. Verify is excluded.
  if (windows.length === 0) return circuitRows;
  let tailStart = 0;
  for (const w of windows) if (w.en > tailStart) tailStart = w.en;
  let traceEnd = tailStart;
  for (const e of slices) {
    const end = (e.ts as number) + (e.dur as number);
    if (end > traceEnd) traceEnd = end;
  }
  let tailEnd = traceEnd;
  for (const e of slices) {
    if (e.name === 'ChonkVerifier::verify' && (e.ts as number) < tailEnd) tailEnd = e.ts as number;
  }
  const phaseWins = (name: string): Array<{ s: number; en: number }> =>
    slices
      .filter(e => e.name === name && e.tid === mainTid && (e.ts as number) >= tailStart && (e.ts as number) < tailEnd)
      .map(e => ({ s: e.ts as number, en: (e.ts as number) + (e.dur as number) }));
  const sumMs = (wins: Array<{ s: number; en: number }>): number => wins.reduce((a, w) => a + (w.en - w.s), 0) / 1000;
  const eccWins = phaseWins('Goblin::prove_eccvm');
  const trWins = phaseWins('BatchedHonkTranslatorProver::prove');
  const inAny = (ts: number, wins: Array<{ s: number; en: number }>): boolean => wins.some(w => ts >= w.s && ts < w.en);
  const restGpu = new Set<string>();
  for (const g of gpuSlices) {
    const ts = g.ts as number;
    if (ts >= tailStart && ts < tailEnd && !inAny(ts, eccWins) && !inAny(ts, trWins)) {
      const c = commitment(g.name as string);
      if (c) restGpu.add(c);
    }
  }
  const eccMs = sumMs(eccWins);
  const trMs = sumMs(trWins);
  const restMs = Math.max(0, (tailEnd - tailStart) / 1000 - eccMs - trMs);
  const tailRows: PerCircuitRow[] = [
    { name: 'tail · ECCVM (Goblin)', oinkMs: eccMs, gpuMsms: gpuNamesIn(eccWins) },
    { name: 'tail · Translator', oinkMs: trMs, gpuMsms: gpuNamesIn(trWins) },
    { name: 'tail · Decider/PCS', oinkMs: restMs, gpuMsms: [...restGpu].sort() },
  ];
  return [...circuitRows, ...tailRows];
}

/** One profiling phase from the merged e2e trace: a top-level Chonk phase
 *  (`depth` 0) or a one-level-deeper sub-phase of ChonkProve (`depth` 1).
 *  `gpuMsms` counts the MSM dispatches delegated to the GPU inside the phase
 *  window — each opens with a `decompose` pass — so it reads as "where the GPU
 *  was actually engaged" (0 in a WASM trace, since nothing is delegated). */
export interface PhaseRow {
  name: string;
  ms: number;
  depth: number;
  gpuMsms: number;
}

/** ChonkProve's one-level-deeper Goblin sub-provers, in run order. Each label
 *  matches the BB_BENCH span name(s) bounded to the ChonkProve window; Translator
 *  folds its tiny circuit-build + proving-key setup spans into the prove span. */
const CHONK_PROVE_SUBPHASES: { label: string; names: string[] }[] = [
  { label: 'Mega-ZK oink (hiding)', names: ['BatchedHonkTranslatorProver::prove_mega_zk_oink'] },
  { label: 'Goblin merge', names: ['Goblin::prove_merge'] },
  { label: 'ECCVM', names: ['Goblin::prove_eccvm'] },
  {
    label: 'Translator',
    names: [
      'BatchedHonkTranslatorProver::prove',
      'TranslatorCircuitBuilder::feed_ecc_op_queue_into_circuit',
      'TranslatorCircuitBuilder::constructor',
      'TranslatorProvingKey(TranslatorCircuit&)',
    ],
  },
];

/**
 * Extract the high-level phase breakdown from a merged e2e Perfetto trace: the
 * top-level Chonk phases (`ChonkStart` / `ChonkLoad` / `ChonkAccumulate` /
 * `ChonkProve` / `ChonkComputeVk` / `ChonkVerify`) on the WASM-main lane, plus a
 * one-level-deeper split of `ChonkProve` into its Goblin sub-provers (Mega-ZK
 * oink, merge, ECCVM, Translator, and a decider/PCS/verify remainder). `ChonkLoad`
 * and `ChonkAccumulate` run once per circuit, so their durations are summed across
 * windows. Pure; validated against captured traces in /tmp/zac-webgpu/.
 */
export function extractPhaseBreakdown(traceJson: string): PhaseRow[] {
  let parsed: { traceEvents?: Array<Record<string, any>> };
  try {
    parsed = JSON.parse(traceJson);
  } catch {
    return [];
  }
  const ev = parsed.traceEvents ?? [];
  const tidByName = new Map<string, number>();
  for (const e of ev) {
    if (e.ph === 'M' && e.name === 'thread_name') tidByName.set(e.args?.name, e.tid);
  }
  const mainTid = tidByName.get('WASM main');
  const gpuTid = tidByName.get('GPU (WebGPU passes)');
  const slices = ev.filter(e => e.ph === 'X');
  const mainSlices = slices.filter(e => e.tid === mainTid);
  // Each MSM delegated to the GPU opens with a `decompose` pass; counting those
  // inside a window = number of MSM dispatches that ran on the GPU in that phase.
  const gpuDispatches =
    gpuTid != null
      ? slices.filter(e => e.tid === gpuTid && typeof e.name === 'string' && (e.name as string).startsWith('decompose'))
      : [];
  type Win = { s: number; en: number };
  const winsOf = (name: string): Win[] =>
    mainSlices.filter(e => e.name === name).map(e => ({ s: e.ts as number, en: (e.ts as number) + (e.dur as number) }));
  const sumMs = (wins: Win[]): number => wins.reduce((a, w) => a + (w.en - w.s), 0) / 1000;
  const gpuIn = (wins: Win[]): number =>
    gpuDispatches.filter(g => wins.some(w => (g.ts as number) >= w.s && (g.ts as number) < w.en)).length;

  const TOP = ['ChonkStart', 'ChonkLoad', 'ChonkAccumulate', 'ChonkProve', 'ChonkComputeVk', 'ChonkVerify'];
  const rows: PhaseRow[] = [];
  for (const name of TOP) {
    const wins = winsOf(name);
    if (!wins.length) continue;
    const ms = sumMs(wins);
    rows.push({ name, ms, depth: 0, gpuMsms: gpuIn(wins) });
    if (name !== 'ChonkProve') continue;
    // Bound the sub-phase name matches to the prove window so a span name that
    // also appears outside ChonkProve cannot leak in. Sub-rows sum to ChonkProve;
    // the remainder absorbs the inner verify, decider, and PCS.
    const pv = wins.slice().sort((a, b) => a.s - b.s)[0];
    let subMs = 0;
    let subGpu = 0;
    for (const sp of CHONK_PROVE_SUBPHASES) {
      const sw = mainSlices
        .filter(e => sp.names.includes(e.name as string) && (e.ts as number) >= pv.s && (e.ts as number) < pv.en)
        .map(e => ({ s: e.ts as number, en: (e.ts as number) + (e.dur as number) }));
      const sms = sumMs(sw);
      const sg = gpuIn(sw);
      subMs += sms;
      subGpu += sg;
      rows.push({ name: sp.label, ms: sms, depth: 1, gpuMsms: sg });
    }
    const otherMs = ms - subMs;
    if (otherMs > 20) {
      rows.push({ name: 'decider / PCS / verify', ms: otherMs, depth: 1, gpuMsms: Math.max(0, gpuIn(wins) - subGpu) });
    }
  }
  return rows;
}

/**
 * When a trace was captured with one or more discarded warm-up proves preceding
 * the measured one, the C++ bench buffer (which has no clear hook) holds every
 * prove's events. Each prove opens with exactly one `ChonkStart` scope, so the
 * last `ChonkStart`'s `ts` marks the start of the measured prove; drop every `X`
 * event before it (keeping all `M` metadata + the `min_ts_ns` header) so the
 * merged trace, the lane counts, and the per-circuit/phase extraction all see only
 * the measured prove. No-op when fewer than two proves are present (the common
 * single-prove trace), so non-warm-up traces are returned byte-identical.
 * Comparison is `ts`-vs-`ts` within one JSON — no clock conversion.
 */
function clipBenchTraceJsonToLastProve(json: string): string {
  let parsed: { traceEvents?: Array<Record<string, any>>; [k: string]: any };
  try {
    parsed = JSON.parse(json);
  } catch {
    return json;
  }
  const ev = parsed.traceEvents ?? [];
  let starts = 0;
  let clipTs = -Infinity;
  for (const e of ev) {
    if (e.ph === 'X' && e.name === 'ChonkStart' && typeof e.ts === 'number') {
      starts++;
      if (e.ts > clipTs) clipTs = e.ts;
    }
  }
  if (starts < 2) return json;
  const kept = ev.filter(e => e.ph !== 'X' || (typeof e.ts === 'number' && e.ts >= clipTs));
  return JSON.stringify({ ...parsed, traceEvents: kept });
}

interface ChonkWebGpuTraceResult {
  flow: string;
  adapter: string;
  swiftshaderDetected: boolean;
  /** Per-circuit witness-commit walls + GPU-delegated MSMs (empty under SwiftShader). */
  perCircuit?: PerCircuitRow[];
  /** High-level Chonk phase breakdown (Load/Accumulate/Prove…) with ChonkProve drilled one level deeper. */
  phases?: PhaseRow[];
  /** Perfetto-loadable Chrome Trace Event JSON, or undefined if no GPU run happened. */
  traceJson?: string;
  proveMs: number;
  verified: boolean;
  vksMatch: boolean | undefined;
  alignment?: { b: number; bMinus1: number; maxResidualMs: number; rmsResidualMs: number; anchors: number };
  counts: { cppEvents: number; cpu: number; gpu: number; mem: number; untracked: number; lanes: number };
  /** Top spans by total duration across all lanes (flame hotspot summary). */
  top: { name: string; lane: string; totalMs: number; count: number }[];
  validation: {
    gpuPassSumMs: number;
    bridgeSubmitWaitSumMs: number;
    cppRootMs: number;
    proveMs: number;
    untrackedMs: number;
  };
}

/**
 * Capture ONE end-to-end WebGPU Chonk prove as a single Perfetto trace overlaying, on one clock:
 * the C++/WASM prove phases (phase-level, one lane per worker thread), the host MSM bridge phases,
 * the GPU passes, and host↔GPU memory transfers.
 *
 * Must run on a real hardware-WebGPU host: webgpu-on under SwiftShader is not BN254 bit-exact, so
 * the prove's own verify fails. Detects SwiftShader and returns a bridge-less placeholder with a
 * warning. Exposed on `window` for the Puppeteer capture test and the interactive page.
 */
async function runChonkWebGpuTrace(
  flow: string = 'ecdsar1+transfer_1_recursions+sponsored_fpc',
  opts?: { webgpu?: boolean },
): Promise<ChonkWebGpuTraceResult> {
  // webgpu=false captures the same phase-level BB_BENCH WASM lanes from a CPU-only prove — there are
  // simply no GPU / host-bridge / Memory lanes (the bridge isn't active), and no SwiftShader gating
  // (a CPU prove needs no adapter). The WASM trace is internally consistent on the one Date.now()
  // clock; the alignment fit still runs off the edge anchors but has nothing cross-clock to overlay.
  const webgpu = opts?.webgpu ?? true;
  let adapterInfo = webgpu ? 'unavailable' : 'n/a (WASM CPU run)';
  if (webgpu && 'gpu' in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        const info = (adapter as any).info ?? (await (adapter as any).requestAdapterInfo?.());
        adapterInfo = info
          ? `${info.vendor ?? '?'} / ${info.architecture ?? '?'} / ${info.device ?? '?'} / ${info.description ?? '?'}`
          : 'unknown';
      } else {
        adapterInfo = 'requestAdapter returned null';
      }
    } catch (err) {
      adapterInfo = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  logger.info(`[trace] ${webgpu ? 'GPU adapter' : 'mode'}: ${adapterInfo}`);
  const swiftshaderDetected = webgpu && /swiftshader|llvmpipe|software/i.test(adapterInfo);

  const { bytecodes, witnesses, vks, functionNames } = await loadPinnedInputs(flow);

  if (swiftshaderDetected) {
    logger.warn(
      `[trace] SwiftShader/software WebGPU detected — a webgpu=on prove would not be BN254 bit-exact ` +
        `(verify fails). Run on a hardware GPU (Apple Metal / discrete NVIDIA) to capture a valid trace.`,
    );
    return {
      flow,
      adapter: adapterInfo,
      swiftshaderDetected: true,
      proveMs: 0,
      verified: false,
      vksMatch: undefined,
      counts: { cppEvents: 0, cpu: 0, gpu: 0, mem: 0, untracked: 0, lanes: 0 },
      top: [],
      validation: { gpuPassSumMs: 0, bridgeSubmitWaitSumMs: 0, cppRootMs: 0, proveMs: 0, untrackedMs: 0 },
    };
  }

  const win = window as any;
  win.__bridge_trace_on = true;
  win.__bridge_trace_reset?.();

  // Bracket the prove with precise edge-detected anchors; the bridge fills in ~per-MSM anchors
  // across the prove via sampleAlignAnchor() in handleMessage. Re-sampled tight against the
  // measured prove (after the warm-up) by the onBeforeMeasured callback below.
  let preAnchors = sampleEdgeAnchors(16, 60);

  // Warm up the GPU once for a webgpu trace so the measured prove reflects steady state, not the
  // one-time SRS upload + shader compile + pool allocation (which would otherwise inflate the
  // WebGPU e2e total and ChonkAccumulate vs the warm median). WASM has no such cold-start.
  const warmupRuns = webgpu ? 1 : 0;
  logger.info(
    `[trace] running ONE ${webgpu ? 'webgpu=on' : 'webgpu=off (WASM)'} prove of flow=${flow} ` +
      `(${bytecodes.length} circuits), bench trace ON` +
      (warmupRuns ? `, after ${warmupRuns} discarded GPU warm-up prove` : ''),
  );
  const out = await runChonkOnce(
    /*webgpuMsm=*/ webgpu,
    bytecodes,
    witnesses,
    vks,
    functionNames,
    /*msmCsvMode=*/ false,
    /*loggerOverride=*/ undefined,
    /*msmDistributionMode=*/ false,
    /*webgpuMsmBlocklist=*/ webgpu ? webgpuBlocklist() : undefined,
    /*msmTraceMode=*/ false,
    /*benchTraceOpts=*/ { maxDepth: BENCH_TRACE_MAX_DEPTH, denylist: BENCH_TRACE_DENYLIST },
    /*warmupRuns=*/ warmupRuns,
    /*onBeforeMeasured=*/ () => {
      // Drop the warm-up's bridge spans + anchors so the bridge lanes capture only the measured
      // prove, and re-bracket with anchors taken right before it.
      win.__bridge_trace_reset?.();
      preAnchors = sampleEdgeAnchors(16, 60);
    },
  );

  const postAnchors = sampleEdgeAnchors(16, 60);
  win.__bridge_trace_on = false;

  // The C++ bench buffer can't be cleared between proves, so a warm-up trace holds both proves'
  // events; slice to the measured (last) prove before mapping/extraction.
  const benchTraceJson = warmupRuns ? clipBenchTraceJsonToLastProve(out.benchTraceJson ?? '') : out.benchTraceJson;

  const bridgeAnchors: AlignAnchor[] = win.__bridge_align_anchors?.() ?? [];
  const anchors = [...preAnchors, ...bridgeAnchors, ...postAnchors];
  const fit = fitAnchors(anchors);

  const bridge = (win.__bridge_trace_spans?.() ?? { cpu: [], gpu: [], mem: [] }) as {
    cpu: TraceSpan[];
    gpu: TraceSpan[];
    mem: TraceSpan[];
  };

  // Map the C++ phase lanes onto the host clock.
  let cppTracks: { name: string; spans: TraceSpan[] }[] = [];
  let cppEvents = 0;
  if (fit && benchTraceJson) {
    const mapped = mapCppTraceToTracks(benchTraceJson, fit);
    cppTracks = mapped.tracks;
    cppEvents = mapped.eventCount;
  } else if (!fit) {
    logger.warn(`[trace] fewer than 2 alignment anchors (${anchors.length}) — cannot map C++ lanes; bridge-only trace`);
  }

  // Untracked: prove window minus the union of every span (across all lanes).
  const everySpan = [...cppTracks.flatMap(t => t.spans), ...bridge.cpu, ...bridge.gpu, ...bridge.mem];
  const untracked = untrackedSpans(everySpan, out.proveStartMs, out.proveEndMs);

  // Place the three host-bridge lanes (CPU/Memory/GPU) directly beneath the C++ main thread and
  // above the per-worker C++ lanes. Perfetto orders rows by tid, which buildPerfettoTraceTracks
  // assigns in array order, so row order == array order here.
  const mainTrack = cppTracks.find(t => t.name === 'WASM main') ?? cppTracks[0];
  const workerTracks = cppTracks.filter(t => t !== mainTrack);
  const tracks = [
    ...(mainTrack ? [mainTrack] : []),
    { name: 'CPU (host MSM bridge)', spans: bridge.cpu },
    { name: 'Memory', spans: bridge.mem },
    { name: 'GPU (WebGPU passes)', spans: bridge.gpu },
    ...workerTracks,
    { name: 'Untracked', spans: untracked },
  ].filter(t => t.spans.length > 0);
  const traceJson = buildPerfettoTraceTracks(tracks, `Chonk e2e ${webgpu ? 'WebGPU' : 'WASM'} — ${flow}`);

  // ── Validation + reporting ────────────────────────────────────────────────
  const sumDur = (spans: readonly TraceSpan[]) => spans.reduce((acc, s) => acc + Math.max(0, s.endMs - s.startMs), 0);
  const gpuPassSumMs = sumDur(bridge.gpu);
  const bridgeSubmitWaitSumMs = sumDur(bridge.cpu.filter(s => /submit\+wait|await drain|runAll|submit /.test(s.name)));
  // C++ prove root = the longest span on the WASM main lane (ChonkAPI::prove). Loop, not
  // `Math.max(0, ...spans.map(…))` — the main lane can hold thousands of spans (spread overflow).
  const mainLane = cppTracks.find(t => t.name === 'WASM main');
  let cppRootMs = 0;
  if (mainLane) {
    for (const s of mainLane.spans) {
      const d = s.endMs - s.startMs;
      if (d > cppRootMs) cppRootMs = d;
    }
  }
  const untrackedMs = sumDur(untracked);

  // Top-20 by total duration across all lanes (flame hotspot summary).
  const byName = new Map<string, { lane: string; totalMs: number; count: number }>();
  for (const t of tracks) {
    for (const s of t.spans) {
      const key = `${t.name}|${s.name}`;
      const cur = byName.get(key) ?? { lane: t.name, totalMs: 0, count: 0 };
      cur.totalMs += Math.max(0, s.endMs - s.startMs);
      cur.count++;
      byName.set(key, cur);
    }
  }
  const top = [...byName.entries()]
    .map(([key, v]) => ({ name: key.split('|')[1], lane: v.lane, totalMs: v.totalMs, count: v.count }))
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 20);

  const alignment = fit
    ? {
        b: fit.b,
        bMinus1: fit.b - 1,
        maxResidualMs: fit.maxResidualMs,
        rmsResidualMs: fit.rmsResidualMs,
        anchors: fit.n,
      }
    : undefined;

  logger.info(`[trace] ===== e2e WebGPU trace summary (flow=${flow}) =====`);
  logger.info(
    `[trace] adapter=${adapterInfo} verified=${out.result.verified} prove=${out.result.proveMs.toFixed(0)}ms`,
  );
  if (alignment) {
    logger.info(
      `[trace] alignment: anchors=${alignment.anchors} b-1=${alignment.bMinus1.toExponential(2)} ` +
        `maxResidual=${(alignment.maxResidualMs * 1000).toFixed(0)}µs rmsResidual=${(alignment.rmsResidualMs * 1000).toFixed(0)}µs`,
    );
    if (alignment.maxResidualMs > 0.6) {
      logger.warn(
        `[trace] alignment maxResidual ${(alignment.maxResidualMs * 1000).toFixed(0)}µs is high for the ` +
          `high-res clock (expect ~µs) — check for tab backgrounding (divergently throttled clocks).`,
      );
    }
  }
  logger.info(
    `[trace] validation: Σgpu_passes=${gpuPassSumMs.toFixed(1)}ms Σbridge_submit_wait=${bridgeSubmitWaitSumMs.toFixed(1)}ms ` +
      `cpp_prove_root=${cppRootMs.toFixed(0)}ms prove_wall=${out.result.proveMs.toFixed(0)}ms untracked=${untrackedMs.toFixed(0)}ms`,
  );
  logger.info(
    `[trace] lanes=${tracks.length} cppEvents=${cppEvents} cpu=${bridge.cpu.length} gpu=${bridge.gpu.length} mem=${bridge.mem.length} untracked=${untracked.length}`,
  );
  logger.info(`[trace] top ${top.length} spans by total duration:`);
  for (const t of top) {
    logger.info(
      `[trace]   ${t.totalMs.toFixed(1).padStart(8)}ms  ×${String(t.count).padStart(4)}  [${t.lane}] ${t.name}`,
    );
  }

  return {
    flow,
    adapter: adapterInfo,
    swiftshaderDetected: false,
    traceJson,
    perCircuit: extractPerCircuit(traceJson, functionNames),
    phases: extractPhaseBreakdown(traceJson),
    proveMs: out.result.proveMs,
    verified: out.result.verified,
    vksMatch: undefined,
    alignment,
    counts: {
      cppEvents,
      cpu: bridge.cpu.length,
      gpu: bridge.gpu.length,
      mem: bridge.mem.length,
      untracked: untracked.length,
      lanes: tracks.length,
    },
    top,
    validation: { gpuPassSumMs, bridgeSubmitWaitSumMs, cppRootMs, proveMs: out.result.proveMs, untrackedMs },
  };
}

(window as any).runChonkWebGpuTrace = runChonkWebGpuTrace;

// ─────────────────────────────────────────────────────────────────────────────
// Multi-run median: run the prove N× each for WASM and WebGPU and report median
// (+ min/max) totals, to wash out run-to-run noise.
//
// CRITICAL: this reuses ONE Barretenberg instance per mode (init once, prove N×,
// destroy once) rather than re-initialising per run. Re-creating the full bb.js
// instance — a main Web Worker + ~16 thread Web Workers + SRS upload — every run
// and doing it 10× back-to-back in one tab leaks/contends workers the browser
// doesn't reclaim promptly, which collapsed the CPU-bound WASM proves to ~10×
// from the 2nd run on (the GPU-offloaded path barely noticed). Reuse removes the
// churn entirely; it's also how production (PXE) uses bb — one instance, many
// proves. Bench trace is OFF here so the totals are the true prove cost (per-
// circuit detail comes from the e2e trace instead).
// ─────────────────────────────────────────────────────────────────────────────

const median = (arr: number[]): number => {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length === 0 ? 0 : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

interface MedianSide {
  totals: number[];
  medianTotal: number;
  minTotal: number;
  maxTotal: number;
  allVerified: boolean;
}
interface ChonkMedianResult {
  flow: string;
  runs: number;
  wasm: MedianSide;
  webgpu: MedianSide;
}
type MedianProgress = {
  done: number;
  total: number;
  side: 'wasm' | 'webgpu';
  run: number;
  runs: number;
  phase: 'start' | 'done';
  lastMs?: number;
};

/**
 * Run the pinned flow `runs`× as WASM and `runs`× as WebGPU on ONE reused bb instance per mode,
 * reporting median (+ min/max + per-run) total prove time. `onProgress` fires before and after each
 * prove so the page can drive a progress bar. Exposed on `window`.
 */
async function runChonkMedian(
  flow: string = 'ecdsar1+transfer_1_recursions+sponsored_fpc',
  runs = 5,
  onProgress?: (p: MedianProgress) => void,
): Promise<ChonkMedianResult> {
  const { bytecodes, witnesses, vks, functionNames } = await loadPinnedInputs(flow);
  const total = 2 * runs;
  let done = 0;
  const sides: Array<{ key: 'wasm' | 'webgpu'; webgpu: boolean }> = [
    { key: 'wasm', webgpu: false },
    { key: 'webgpu', webgpu: true },
  ];
  const out: Partial<ChonkMedianResult> = { flow, runs };
  for (const side of sides) {
    // Fresh, single instance for this whole mode. destroy any leftover first so a stale
    // single-run singleton can't bleed the wrong webgpuMsm setting in.
    await Barretenberg.destroySingleton();
    const bb = await Barretenberg.initSingleton({
      threads: 16,
      logger: () => {},
      webgpuMsm: side.webgpu,
      webgpuMsmBlocklist: side.webgpu ? webgpuBlocklist() : undefined,
    });
    const totals: number[] = [];
    let allVerified = true;
    try {
      for (let r = 1; r <= runs; r++) {
        onProgress?.({ done, total, side: side.key, run: r, runs, phase: 'start' });
        // Fresh backend wrapper per run (cheap, no worker/SRS churn — bb is reused). Time prove only.
        const backend = new AztecClientBackend(bytecodes, bb, functionNames);
        const t0 = performance.now();
        const { proof, vk } = await backend.prove(witnesses, vks);
        const proveMs = performance.now() - t0;
        const verified = await backend.verify(proof, vk);
        totals.push(proveMs);
        allVerified = allVerified && verified;
        done += 1;
        onProgress?.({ done, total, side: side.key, run: r, runs, phase: 'done', lastMs: proveMs });
        logger.info(`[median] ${side.key} run ${r}/${runs}: prove=${proveMs.toFixed(0)}ms verified=${verified}`);
      }
    } finally {
      await Barretenberg.destroySingleton();
    }
    out[side.key] = {
      totals,
      medianTotal: median(totals),
      minTotal: Math.min(...totals),
      maxTotal: Math.max(...totals),
      allVerified,
    };
  }
  return out as ChonkMedianResult;
}

(window as any).runChonkMedian = runChonkMedian;

(window as any).runChonkSingleMode = runChonkSingleMode;

/** Base64-encode a byte buffer in fixed-size chunks (avoids a call-stack blowup on big proofs). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Result of a single prove + native verify round trip via `runChonkNativeVerify`.
 */
interface ChonkNativeVerifyResult {
  mode: 'wasm' | 'webgpu';
  flow: string;
  adapter: string;
  /** In-browser WASM verify (from the prove itself). */
  wasmVerified: boolean;
  /** Native `bb verify --scheme chonk` verdict, from the dev server's /proof sink. */
  nativeVerified: boolean;
  /** bb exit code reported by the sink (0 = accepted). */
  exitCode?: number;
  proofBytes: number;
}

/**
 * Prove a single chonk flow in `mode`, then POST the resulting proof + vk to the dev
 * server's `/proof` sink, which runs the native `bb verify --scheme chonk` and returns
 * the verdict. This is the end-to-end "does the page's (WebGPU) proof pass native
 * verification" check. Requires `serve-chonk-webgpu.mjs` (the sink + native bb live there);
 * the Puppeteer harness's createServer does not implement /proof.
 */
async function runChonkNativeVerify(
  mode: 'wasm' | 'webgpu',
  flow: string = 'ecdsar1+transfer_1_recursions+sponsored_fpc',
): Promise<ChonkNativeVerifyResult> {
  const single = await runChonkSingleMode(mode, flow);
  const res = await fetch(`/proof?label=${encodeURIComponent(mode)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proof: bytesToBase64(single.nativeProof), vk: bytesToBase64(single.vk) }),
  });
  if (!res.ok) {
    throw new Error(`/proof sink returned ${res.status}: ${await res.text()}`);
  }
  const sink = (await res.json()) as { verified: boolean; exitCode?: number };
  return {
    mode,
    flow,
    adapter: single.adapter,
    wasmVerified: single.result.verified,
    nativeVerified: sink.verified,
    exitCode: sink.exitCode,
    proofBytes: single.nativeProof.length,
  };
}

(window as any).runChonkNativeVerify = runChonkNativeVerify;

type RunMode = 'wasm' | 'webgpu' | 'batch';

interface ModeMultiProgress {
  done: number;
  total: number;
  run: number;
  runs: number;
  // 'measuring' fires once after the last run, while the post-loop JS-heap
  // sample (measureUserAgentSpecificMemory) is still pending — that call can
  // take seconds (Chrome defers it to the next GC), so the UI relabels rather
  // than leaving the elapsed timer looking like it's still proving.
  phase: 'start' | 'done' | 'measuring';
  lastMs?: number;
}

interface ModeMultiResult {
  totals: number[];
  medianTotal: number;
  minTotal: number;
  maxTotal: number;
  allVerified: boolean;
  vk: Uint8Array;
  /** One-time `loadPinnedInputs` wall (fetch + msgpack decode + gunzip). */
  loadMs: number;
  /** `Barretenberg.initSingleton` wall (compile WASM + spin up the 16 worker
   *  threads + load CRS). 0 when the warm backend was reused. Excluded from
   *  `totals`, which time prove only. */
  initMs: number;
  /** True when this click reused the already-warm backend (no init paid). */
  reused: boolean;
  /** Peak WASM linear-memory heap across the N runs (MiB) — the same `(mem: X MiB)`
   *  metric the CI browser benchmark reports. */
  wasmHeapPeakMb: number;
  /** Peak GPU VRAM the WebGPU MSM bridge held across the N runs (MiB); 0 in WASM mode. */
  gpuPeakMb: number;
  /** Best-effort JS-heap size after the run loop (MiB); 0 if unavailable under the browser flags. */
  jsHeapMb: number;
}

// ── Warm backend reuse ──────────────────────────────────────────────────────
// One Barretenberg backend kept alive across median-run clicks so the ~13s
// 16-thread WASM init + CRS load isn't re-paid on every click. webgpuMsm wiring
// and the MSM block-list are baked at init, so the slot is keyed by config: a
// different mode tears the old one down and rebuilds (only one instance is ever
// held — no multiplied memory). The trace path needs benchTrace at init, so it
// disposes this slot first (disposeWarmBackend) and builds its own fresh
// instance — otherwise the config-blind initSingleton would hand it this
// non-bench backend.
let warmKey: string | undefined;
let warmHeapPeakMb = 0;
// Bound once at init; the only logger the warm backend ever gets, so it must read
// into module state (reset per run) rather than a per-call closure.
const warmMemLogger = (m: string): void => {
  const mm = /\(mem:\s*([\d.]+)\s*MiB\)/.exec(m);
  if (mm) {
    const v = parseFloat(mm[1]);
    if (v > warmHeapPeakMb) warmHeapPeakMb = v;
  }
};

function warmConfigKey(webgpu: boolean, blocklist?: readonly string[]): string {
  return `${webgpu}|${(blocklist ?? []).join(',')}`;
}

/** Return the warm backend for this config, building it (and tearing down a
 *  differently-configured one) only when the config changed. `initMs` is 0 and
 *  `reused` true when the live backend was reused. */
async function ensureWarmBackend(
  webgpu: boolean,
  blocklist: readonly string[] | undefined,
): Promise<{ bb: Barretenberg; initMs: number; reused: boolean }> {
  const key = warmConfigKey(webgpu, webgpu ? blocklist : undefined);
  if (warmKey === key) {
    try {
      return { bb: Barretenberg.getSingleton(), initMs: 0, reused: true };
    } catch {
      // The singleton was torn down out from under us (e.g. a trace run); rebuild.
      warmKey = undefined;
    }
  }
  if (warmKey !== undefined) {
    await Barretenberg.destroySingleton();
    warmKey = undefined;
  }
  const t0 = performance.now();
  const bb = await Barretenberg.initSingleton({
    threads: 16,
    logger: warmMemLogger,
    webgpuMsm: webgpu,
    webgpuMsmBlocklist: webgpu ? blocklist : undefined,
  });
  warmKey = key;
  return { bb, initMs: performance.now() - t0, reused: false };
}

/** Tear down the warm backend, if any. The trace path calls this so its fresh
 *  benchTrace instance isn't shadowed by the config-blind singleton. */
async function disposeWarmBackend(): Promise<void> {
  if (warmKey !== undefined) {
    await Barretenberg.destroySingleton();
    warmKey = undefined;
  }
}

(window as any).ensureWarmBackend = (webgpu: boolean): Promise<{ bb: Barretenberg; initMs: number; reused: boolean }> =>
  ensureWarmBackend(webgpu, webgpu ? webgpuBlocklist() : undefined);
(window as any).disposeWarmBackend = disposeWarmBackend;

/**
 * Run the Chonk prove `runs`× in a single mode on ONE backend (warm-reused across
 * clicks where the config matches; otherwise rebuilt — no per-run worker/SRS
 * churn, which otherwise makes the CPU-bound WASM totals degrade run-over-run) and
 * return the median (+ min/max) prove time, the per-run totals, and the last VK
 * for the WASM-baseline check. `'batch'` enables the BatchMsmV2 same-N route and
 * uses the batch block-list. The backend is left warm for the next click; a prove
 * error disposes it so a possibly-corrupt instance is never reused.
 */
async function runChonkModeMulti(
  mode: RunMode,
  flow: string = 'ecdsar1+transfer_1_recursions+sponsored_fpc',
  runs = 5,
  onProgress?: (p: ModeMultiProgress) => void,
): Promise<ModeMultiResult> {
  // At least one run, so the loop always assigns lastVk and the median/min/max are
  // over a non-empty set (the UI clamps too, but this is window-exposed for tests).
  runs = Math.max(1, Math.floor(runs));
  const tLoad0 = performance.now();
  const { bytecodes, witnesses, vks, functionNames } = await loadPinnedInputs(flow);
  const loadMs = performance.now() - tLoad0;
  const webgpu = mode !== 'wasm';
  // Under masking only the pair-tree-hostile labels stay blocked (masking does
  // not fix those); everything else is delegated to the GPU. Batch mode falls
  // back to the per-MSM same-N path in the bridge when masking is on, so the
  // same residual list is correct there too.
  const blocklist =
    (globalThis as any).__bridge_mask_msms === true
      ? MASKING_RESIDUAL_BLOCKLIST
      : mode === 'batch'
        ? DEFAULT_WEBGPU_BLOCKLIST_BATCH
        : DEFAULT_WEBGPU_BLOCKLIST;
  // Reuse the warm backend if this mode's config matches the live one; otherwise
  // it's torn down and rebuilt. The `(mem: X MiB)` high-water is captured by the
  // backend's bound `warmMemLogger` into module state — reset here so it reflects
  // only this click's N runs (the shared linear memory only grows).
  warmHeapPeakMb = 0;
  const { bb, initMs, reused } = await ensureWarmBackend(webgpu, webgpu ? blocklist : undefined);
  const win = window as any;
  if (mode === 'batch') win.__bridge_batch_enabled = true;
  // Reset the bridge's GPU-memory high-water so gpuPeakMb reflects only this
  // mode's N runs (the bridge module persists across button clicks).
  if (webgpu) win.__bridge_gpu_mem_reset?.();
  const totals: number[] = [];
  let allVerified = true;
  let lastVk: Uint8Array | undefined;
  let jsHeapMb = 0;
  try {
    for (let r = 1; r <= runs; r++) {
      onProgress?.({ done: r - 1, total: runs, run: r, runs, phase: 'start' });
      // Fresh backend wrapper per run (cheap — bb is reused). Time prove only.
      const backend = new AztecClientBackend(bytecodes, bb, functionNames);
      const t0 = performance.now();
      const { proof, vk } = await backend.prove(witnesses, vks);
      const proveMs = performance.now() - t0;
      const verified = await backend.verify(proof, vk);
      totals.push(proveMs);
      allVerified = allVerified && verified;
      lastVk = vk;
      onProgress?.({ done: r, total: runs, run: r, runs, phase: 'done', lastMs: proveMs });
      logger.info(`[multi:${mode}] run ${r}/${runs}: prove=${proveMs.toFixed(0)}ms verified=${verified}`);
    }
    // Sample JS heap before any later teardown frees the worker isolates.
    // Signal a distinct phase first: measureUserAgentSpecificMemory() can take
    // seconds, and without this the elapsed timer keeps ticking under a "N/N
    // done" label that reads as if a prove were still running.
    onProgress?.({ done: runs, total: runs, run: runs, runs, phase: 'measuring' });
    jsHeapMb = await measureJsHeapMb();
  } catch (err) {
    // Don't keep a possibly-corrupt backend warm for the next click.
    await disposeWarmBackend();
    throw err;
  } finally {
    // Leave the backend warm for the next click; only clear the per-run batch gate.
    if (mode === 'batch') win.__bridge_batch_enabled = false;
  }
  // peakGpuBytes persists in the bridge module across runs, so this reads the
  // whole-mode peak. WASM mode never touches the bridge → 0.
  const gpuPeakMb = webgpu ? (win.__bridge_gpu_mem_peak?.() ?? 0) / (1024 * 1024) : 0;
  return {
    totals,
    medianTotal: median(totals),
    minTotal: Math.min(...totals),
    maxTotal: Math.max(...totals),
    allVerified,
    vk: lastVk!,
    loadMs,
    initMs,
    reused,
    wasmHeapPeakMb: warmHeapPeakMb,
    gpuPeakMb,
    jsHeapMb,
  };
}

(window as any).runChonkModeMulti = runChonkModeMulti;

type AllRunMode = 'wasm' | 'webgpu';

/** Per-example result of an interleaved all-examples sweep: the prove time for
 *  each round (in round order) plus the median/min/max over those rounds. */
interface AllRunFlowResult {
  flow: string;
  /** Number of circuits (creator apps + kernels) in this example's stack. */
  numCircuits: number;
  /** Prove wall (ms) for this example, one entry per round, in round order. */
  rounds: number[];
  medianMs: number;
  minMs: number;
  maxMs: number;
  /** True only if every round's in-browser verify passed. */
  verified: boolean;
}

interface AllRunResult {
  mode: AllRunMode;
  rounds: number;
  /** True when the warm backend was reused (no init paid) for this sweep. */
  reused: boolean;
  initMs: number;
  results: AllRunFlowResult[];
}

interface AllRunProgress {
  /** 1-based round, or 0 for the discarded warm-up prove. */
  round: number;
  rounds: number;
  flowIndex: number;
  flowCount: number;
  flow: string;
  phase: 'warmup' | 'proving' | 'done';
  lastMs?: number;
}

/**
 * Prove every example in `flows` interleaved — round-robin (ex1, ex2, …, exk),
 * repeated `rounds` times — on ONE warm backend, and report the per-example
 * median (+ min/max + per-round times) of the prove wall. Interleaving spreads
 * any thermal / CPU-boost drift evenly across all examples rather than letting
 * it bias whichever example a contiguous block happens to land on, so the
 * per-example medians are comparable. No memory measurement (kept out so the
 * sweep stays fast and the table stays tabular).
 *
 * The backend is config-keyed and reused across clicks; `mode==='webgpu'` runs
 * the WebGPU MSM path (DEFAULT_WEBGPU_BLOCKLIST), `'wasm'` the CPU path. A fresh
 * warm backend pays a one-time GPU cold-start on its first prove, so one
 * discarded warm-up prove runs first (skipped when the backend is already warm).
 * A prove error disposes the backend so a possibly-corrupt instance isn't reused.
 */
async function runChonkAllExamples(
  mode: AllRunMode,
  flows: string[],
  rounds = 3,
  onProgress?: (p: AllRunProgress) => void,
): Promise<AllRunResult> {
  rounds = Math.max(1, Math.floor(rounds));
  const webgpu = mode === 'webgpu';
  const blocklist = webgpu ? webgpuBlocklist() : undefined;

  // Decode every example's inputs once up front (fetch + msgpack decode + gunzip)
  // so the interleaved rounds time prove only — the decode cost is never charged
  // to whichever example happens to be proven first.
  const inputs = new Map<
    string,
    { bytecodes: Uint8Array[]; witnesses: Uint8Array[]; vks: Uint8Array[]; functionNames: string[] }
  >();
  for (const flow of flows) {
    inputs.set(flow, await loadPinnedInputs(flow));
  }

  const { bb, initMs, reused } = await ensureWarmBackend(webgpu, blocklist);
  const win = window as any;
  if (webgpu) win.__bridge_gpu_mem_reset?.();

  const perFlow = new Map<string, { rounds: number[]; verified: boolean; numCircuits: number }>();
  for (const flow of flows) {
    perFlow.set(flow, { rounds: [], verified: true, numCircuits: inputs.get(flow)!.bytecodes.length });
  }

  const proveOnce = async (flow: string): Promise<{ ms: number; verified: boolean }> => {
    const { bytecodes, witnesses, vks, functionNames } = inputs.get(flow)!;
    // Fresh backend wrapper per prove (cheap — bb is reused). Time prove only.
    const backend = new AztecClientBackend(bytecodes, bb, functionNames);
    const t0 = performance.now();
    const { proof, vk } = await backend.prove(witnesses, vks);
    const ms = performance.now() - t0;
    const verified = await backend.verify(proof, vk);
    return { ms, verified };
  };

  try {
    // A fresh warm backend pays GPU cold-start (SRS upload, shader compile, pool
    // alloc) on its first prove; run one discarded prove so the measured rounds
    // reflect steady state. Already-warm backend has paid it — skip.
    if (!reused && flows.length) {
      onProgress?.({ round: 0, rounds, flowIndex: 0, flowCount: flows.length, flow: flows[0], phase: 'warmup' });
      await proveOnce(flows[0]);
    }
    for (let r = 1; r <= rounds; r++) {
      for (let i = 0; i < flows.length; i++) {
        const flow = flows[i];
        onProgress?.({ round: r, rounds, flowIndex: i, flowCount: flows.length, flow, phase: 'proving' });
        const { ms, verified } = await proveOnce(flow);
        const fr = perFlow.get(flow)!;
        fr.rounds.push(ms);
        fr.verified = fr.verified && verified;
        onProgress?.({ round: r, rounds, flowIndex: i, flowCount: flows.length, flow, phase: 'done', lastMs: ms });
        logger.info(`[all:${mode}] round ${r}/${rounds} ${flow}: prove=${ms.toFixed(0)}ms verified=${verified}`);
      }
    }
  } catch (err) {
    await disposeWarmBackend();
    throw err;
  }

  const results: AllRunFlowResult[] = flows.map(flow => {
    const fr = perFlow.get(flow)!;
    return {
      flow,
      numCircuits: fr.numCircuits,
      rounds: fr.rounds,
      medianMs: median(fr.rounds),
      minMs: Math.min(...fr.rounds),
      maxMs: Math.max(...fr.rounds),
      verified: fr.verified,
    };
  });
  return { mode, rounds, reused, initMs, results };
}

(window as any).runChonkAllExamples = runChonkAllExamples;

interface MsmCsvRow {
  seq: number;
  name: string;
  n: number;
  cpu_ms: number;
  gpu_ms: number;
  kind: string;
}

/**
 * Run ChonkApi::prove twice with msmCsvMode enabled — first off (CPU per-MSM
 * via in-tree native Pippenger, one MSM at a time) then on (GPU per-MSM via
 * the WebGPU bridge) — sniff the per-MSM log lines from both runs, and merge
 * them by (name, n, sequence-within-run) into a CSV string. The prove is
 * deterministic, so the i-th MSM in run 1 has the same (name, n) as the i-th
 * MSM in run 2.
 *
 * Returns the CSV as a single string (newline-terminated rows) plus the
 * summary metadata. The caller writes the CSV out (puppeteer test pipes it
 * to a file).
 */
async function runChonkMsmCsv(flow: string = 'ecdsar1+transfer_1_recursions+sponsored_fpc'): Promise<{
  flow: string;
  adapter: string;
  csv: string;
  rowCount: number;
  cpuOnly: number;
  gpuOnly: number;
}> {
  // Probe GPU.
  let adapterInfo = 'unavailable';
  if ('gpu' in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        const info = (adapter as any).info ?? (await (adapter as any).requestAdapterInfo?.());
        adapterInfo = info
          ? `${info.vendor ?? '?'} / ${info.architecture ?? '?'} / ${info.device ?? '?'} / ${info.description ?? '?'}`
          : 'unknown';
      }
    } catch {
      /* leave as unavailable */
    }
  }

  const { bytecodes, witnesses, vks, functionNames } = await loadPinnedInputs(flow);

  // Capture the [msm-csv-cpu] lines via the C++ logger callback (those flow
  // through `info()` in C++ → the bb.js `logstr` import → the logger we set
  // on Barretenberg.initSingleton). Capture the bridge's [msm] GPU lines via
  // console.log sniffing (the bridge runs on the main thread, not the WASM
  // worker, and uses console.log directly).
  const cpuCaptured: string[] = [];
  const gpuCaptured: string[] = [];
  const origConsoleLog = console.log.bind(console);
  const origConsoleInfo = console.info.bind(console);
  const sniffConsole =
    (orig: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      const s = args
        .map(a => {
          if (typeof a === 'string') return a;
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(' ');
      if (s.includes('[msm]')) gpuCaptured.push(s);
      orig(...(args as []));
    };
  console.log = sniffConsole(origConsoleLog);
  console.info = sniffConsole(origConsoleInfo);

  const cpuLogger = (m: string) => {
    if (m.includes('[msm-csv-cpu]')) cpuCaptured.push(m);
    logger.info(m);
  };
  const noopLogger = (m: string) => logger.info(m);

  const swiftshaderDetected = /swiftshader/i.test(adapterInfo);

  try {
    // CPU pass: msmCsvMode=on, webgpu=off → emits [msm-csv-cpu] per MSM via
    // the C++ logger callback (cpuLogger captures into cpuCaptured).
    await runChonkOnce(false, bytecodes, witnesses, vks, functionNames, /*msmCsvMode=*/ true, cpuLogger);
    const cpuLines = cpuCaptured.slice();

    // GPU pass: webgpu=on → bridge emits [msm] per-MSM lines via console.log,
    // captured by the sniffConsole interceptor above. msmCsvMode stays off so
    // the GPU pass is the real batched flow, not solo-per-MSM.
    //
    // Skipped under SwiftShader (Linux CI without hardware GPU): its software
    // WebGPU is not bit-exact for BN254 affine arithmetic, so the GPU prove
    // throws at the in-prover verify sanity check. The CPU column of the CSV
    // is still meaningful — it's the answer to "what does keeping the
    // pair-tree-hostile columns on CPU cost?" — so we keep that and leave
    // the gpu_ms column at 0 for every row when running here.
    let gpuLines: string[] = [];
    if (swiftshaderDetected) {
      noopLogger(
        `[msm-csv] adapter=[${adapterInfo}] — SwiftShader, skipping GPU pass. CPU column is the meaningful one here.`,
      );
    } else {
      gpuCaptured.length = 0;
      // Apply the DEFAULT_WEBGPU_BLOCKLIST so the GPU pass delegates exactly the
      // 89 columns the production config delegates (the structured columns stay
      // on CPU and show up as cpu-only rows). This also matches the only Metal-
      // verified config, so the GPU prove completes instead of risking a verify
      // throw on an unvetted all-delegated run.
      await runChonkOnce(
        true,
        bytecodes,
        witnesses,
        vks,
        functionNames,
        /*msmCsvMode=*/ false,
        noopLogger,
        /*msmDistributionMode=*/ false,
        /*webgpuMsmBlocklist=*/ DEFAULT_WEBGPU_BLOCKLIST,
      );
      gpuLines = gpuCaptured.slice();
    }

    // Parse CPU lines: `[msm-csv-cpu] name=W_L n=88899 cpu_ms=18.34`.
    interface CpuEntry {
      name: string;
      n: number;
      cpu_ms: number;
    }
    const cpus: CpuEntry[] = [];
    const cpuRe = /\[msm-csv-cpu\]\s+name=(\S+)\s+n=(\d+)\s+cpu_ms=([\d.]+)/;
    for (const line of cpuLines) {
      const m = cpuRe.exec(line);
      if (m) cpus.push({ name: m[1], n: parseInt(m[2], 10), cpu_ms: parseFloat(m[3]) });
    }

    // Parse GPU lines: bridge emits `[msm] name=W_L n=88899 kind=mixed gpu=...ms (...)`
    // and `[msm] name=W_L n=88899 kind=same-n prepare=... gpu_incremental=... (...)`.
    interface GpuEntry {
      name: string;
      n: number;
      gpu_ms: number;
      kind: string;
    }
    const gpus: GpuEntry[] = [];
    const gpuMixedRe = /\[msm\]\s+name=(\S+)\s+n=(\d+)\s+kind=mixed\s+gpu=([\d.]+)ms/;
    // For same-N batches the GPU queue serializes — the per-MSM wait isn't
    // representative of per-MSM compute. We log gpu_avg = max(wait) /
    // batch_size as a fairer per-MSM number (total batch GPU time divided
    // evenly across the same-N MSMs). gpu_wait is kept for debugging.
    const gpuSameNRe = /\[msm\]\s+name=(\S+)\s+n=(\d+)\s+kind=same-n[^]*?gpu_avg=([\d.]+)ms/;
    for (const line of gpuLines) {
      let m = gpuMixedRe.exec(line);
      if (m) {
        gpus.push({ name: m[1], n: parseInt(m[2], 10), gpu_ms: parseFloat(m[3]), kind: 'mixed' });
        continue;
      }
      m = gpuSameNRe.exec(line);
      if (m) {
        gpus.push({ name: m[1], n: parseInt(m[2], 10), gpu_ms: parseFloat(m[3]), kind: 'same-n' });
      }
    }

    // Merge — for the i-th CPU entry, find the matching GPU entry (the
    // GPU pass only delegates MSMs at or above WEBGPU_MSM_THRESHOLD, so
    // there will be fewer GPU entries than CPU entries; below-threshold
    // MSMs get gpu_ms=0 to mark them as CPU-only). Match by walking GPU
    // entries in order: each CPU entry whose (name, n) matches the next
    // pending GPU entry consumes it.
    // GPU entries are a strict SUBSEQUENCE of CPU entries (the GPU pass only
    // sees MSMs at or above WEBGPU_MSM_THRESHOLD; below-threshold MSMs never
    // reach the bridge). Walk both lists in order: when cpu[i] matches the
    // pending gpu[gpuIdx], consume it; otherwise this MSM stayed on CPU.
    // Don't skip GPU entries that don't match — that'd desynchronize the
    // matching (GPU entries are emitted exactly in the order the bridge sees
    // them, which is the same prove order the CPU pass walked).
    const rows: MsmCsvRow[] = [];
    let gpuIdx = 0;
    for (let i = 0; i < cpus.length; i++) {
      const c = cpus[i];
      let gpu_ms = 0;
      let kind = 'cpu-only';
      if (gpuIdx < gpus.length && gpus[gpuIdx].name === c.name && gpus[gpuIdx].n === c.n) {
        gpu_ms = gpus[gpuIdx].gpu_ms;
        kind = gpus[gpuIdx].kind;
        gpuIdx++;
      }
      rows.push({ seq: i, name: c.name, n: c.n, cpu_ms: c.cpu_ms, gpu_ms, kind });
    }

    let cpuOnly = 0;
    let gpuOnly = 0;
    for (const r of rows) {
      if (r.gpu_ms === 0) cpuOnly++;
      else gpuOnly++;
    }

    const header = 'seq,name,n,cpu_ms,gpu_ms,kind\n';
    const body = rows
      .map(r => `${r.seq},${r.name},${r.n},${r.cpu_ms.toFixed(3)},${r.gpu_ms.toFixed(3)},${r.kind}`)
      .join('\n');
    const csv = header + body + '\n';

    return {
      flow,
      adapter: adapterInfo,
      csv,
      rowCount: rows.length,
      cpuOnly,
      gpuOnly,
      // Diagnostics so the test can see when capture/regex went wrong.
      cpuLinesCaptured: cpuLines.length,
      gpuLinesCaptured: gpuLines.length,
      cpuParsed: cpus.length,
      gpuParsed: gpus.length,
    };
  } finally {
    console.log = origConsoleLog;
    console.info = origConsoleInfo;
  }
}

(window as any).runChonkMsmCsv = runChonkMsmCsv;

interface MsmDistRow {
  seq: number;
  name: string;
  n: number;
  nnz: number;
  density: number;
  c: number;
  /** Max bit-length over all scalars in this MSM — the hard bound for a safe
   *  static `scalarBitLength` (small-scalar window-count optimisation). */
  maxbits: number;
  /** Mean bit-length over the nonzero scalars — the typical magnitude. */
  mean_bits: number;
  maxbucket: number;
  p99bucket: number;
  mean_nonzero_bucket: number;
}

/**
 * Run ChonkApi::prove once with msmDistributionMode enabled — every call to
 * `MSM::batch_multi_scalar_mul` emits a `[msm-dist] name=… n=… nnz=…
 * density=… c=… maxbucket=… p99bucket=… mean_nonzero_bucket=…` log line.
 * Captures those lines via the C++ logger callback, parses them, and returns
 * a per-MSM CSV.
 *
 * Used to classify each named polynomial by scalar-distribution shape — the
 * input to the column-safety analysis (see [STATUS.md][1]). The MSM path is
 * unchanged (we deliberately run with webgpu=off so every MSM still goes
 * through native Pippenger and the prove still completes correctly), so the
 * cost is just the per-MSM Booth-recode + histogram pass — negligible next
 * to the proving wall time.
 *
 * [1]: barretenberg/ts/src/msm_webgpu/integration/STATUS.md
 */
async function runChonkMsmDistribution(flow: string = 'ecdsar1+transfer_1_recursions+sponsored_fpc'): Promise<{
  flow: string;
  csv: string;
  rowCount: number;
  linesCaptured: number;
  parsed: number;
}> {
  const { bytecodes, witnesses, vks, functionNames } = await loadPinnedInputs(flow);

  const captured: string[] = [];
  const distLogger = (m: string) => {
    if (m.includes('[msm-dist]')) captured.push(m);
    logger.info(m);
  };

  await runChonkOnce(
    /*webgpuMsm=*/ false,
    bytecodes,
    witnesses,
    vks,
    functionNames,
    /*msmCsvMode=*/ false,
    distLogger,
    /*msmDistributionMode=*/ true,
  );

  // Parse: `[msm-dist] name=W_L n=88899 nnz=85240 density=0.958897 c=15
  //         maxbits=254 mean_bits=253.41 maxbucket=42 p99bucket=28
  //         mean_nonzero_bucket=2.71`.
  // One regex per field — verbose but trivially extensible when we add new
  // stats (e.g. distinct-value count) later.
  const re =
    /\[msm-dist\]\s+name=(\S+)\s+n=(\d+)\s+nnz=(\d+)\s+density=([\d.]+)\s+c=(\d+)\s+maxbits=(\d+)\s+mean_bits=([\d.]+)\s+maxbucket=(\d+)\s+p99bucket=(\d+)\s+mean_nonzero_bucket=([\d.]+)/;
  const rows: MsmDistRow[] = [];
  for (const line of captured) {
    const m = re.exec(line);
    if (!m) continue;
    rows.push({
      seq: rows.length,
      name: m[1],
      n: parseInt(m[2], 10),
      nnz: parseInt(m[3], 10),
      density: parseFloat(m[4]),
      c: parseInt(m[5], 10),
      maxbits: parseInt(m[6], 10),
      mean_bits: parseFloat(m[7]),
      maxbucket: parseInt(m[8], 10),
      p99bucket: parseInt(m[9], 10),
      mean_nonzero_bucket: parseFloat(m[10]),
    });
  }

  const header = 'seq,name,n,nnz,density,c,maxbits,mean_bits,maxbucket,p99bucket,mean_nonzero_bucket\n';
  const body = rows
    .map(
      r =>
        `${r.seq},${r.name},${r.n},${r.nnz},${r.density.toFixed(6)},${r.c},${r.maxbits},` +
        `${r.mean_bits.toFixed(2)},${r.maxbucket},${r.p99bucket},${r.mean_nonzero_bucket.toFixed(2)}`,
    )
    .join('\n');
  const csv = header + body + '\n';

  return {
    flow,
    csv,
    rowCount: rows.length,
    linesCaptured: captured.length,
    parsed: rows.length,
  };
}

(window as any).runChonkMsmDistribution = runChonkMsmDistribution;

/**
 * Differential MSM diagnostic for the WebGPU verify failures. Captures the
 * per-MSM distribution (webgpu OFF — deterministic, no GPU dependency) for a
 * failing `badFlow` and a passing `goodFlow`, then prints — into the page log
 * card via `console.log` — the MSMs that are BOTH new to `badFlow` (absent
 * from the passing flow) AND currently delegated to the GPU. That intersection
 * is the suspect set: an MSM the GPU has never been exercised against in the
 * passing flow, yet still routed to the (edge-case-free) pair-tree. Sorted by
 * bucket occupancy (`maxbucket`) so the most pair-tree-hostile shapes are on top.
 */
async function diagnoseChonkMsmDiff(
  badFlow: string,
  goodFlow: string = 'ecdsar1+transfer_1_recursions+sponsored_fpc',
): Promise<void> {
  const parse = (csv: string) =>
    csv
      .trim()
      .split('\n')
      .slice(1)
      .filter(Boolean)
      .map(line => {
        const [seq, name, n, nnz, density, c, maxbits, mean_bits, maxbucket, p99bucket, mean_nonzero_bucket] =
          line.split(',');
        return {
          key: `${name}@${n}`,
          name,
          n: parseInt(n, 10),
          density: parseFloat(density),
          c: parseInt(c, 10),
          maxbits: parseInt(maxbits, 10),
          maxbucket: parseInt(maxbucket, 10),
          p99bucket: parseInt(p99bucket, 10),
        };
      });

  console.log(`[msm-diff] capturing distributions: good=${goodFlow} bad=${badFlow} …`);
  const good = parse((await runChonkMsmDistribution(goodFlow)).csv);
  const bad = parse((await runChonkMsmDistribution(badFlow)).csv);
  const goodKeys = new Set(good.map(r => r.key));

  // New to the failing flow AND delegated to the GPU under the live blocklist.
  const suspects = bad
    .filter(r => !goodKeys.has(r.key))
    .filter(r => isWebgpuEligible(r.name, r.n, DEFAULT_WEBGPU_BLOCKLIST))
    .sort((a, b) => b.maxbucket - a.maxbucket);

  const pad = (s: string | number, w: number) => String(s).padEnd(w);
  console.log(
    `[msm-diff] good=${good.length} bad=${bad.length} MSMs; ${suspects.length} are NEW to ${badFlow} AND GPU-delegated:`,
  );
  console.log(
    `[msm-diff] ${pad('name', 34)}${pad('n', 9)}${pad('c', 4)}${pad('density', 10)}${pad('maxbits', 9)}${pad('maxbucket', 11)}p99`,
  );
  for (const r of suspects) {
    console.log(
      `[msm-diff] ${pad(r.name, 34)}${pad(r.n, 9)}${pad(r.c, 4)}${pad(r.density.toFixed(4), 10)}${pad(r.maxbits, 9)}${pad(r.maxbucket, 11)}${r.p99bucket}`,
    );
  }
  console.log('[msm-diff] done. The high-maxbucket rows are the likely pair-tree-hostile culprits.');
}

(window as any).diagnoseChonkMsmDiff = diagnoseChonkMsmDiff;

/**
 * Wire the chonk-webgpu HTML page (src/index.html) to the in-bundle bench
 * functions. Pulled out as a separate window-attached entry point so the
 * bundle stays usable as a Puppeteer test harness (the existing tests still
 * call `window.runChonkWebGpuBench` etc.) AND as an interactive page (the
 * scripts/serve-chonk-webgpu.mjs launcher).
 *
 * Wires up:
 *   - `#run-wasm` button   → `runChonkSingleMode('wasm', flow)` (CPU baseline)
 *   - `#run-webgpu` button → `runChonkSingleMode('webgpu', flow)` (89 MSMs to GPU)
 *   - `#clear-log` button  → empties the log panel
 *   - `#flow` <select>     → flow argument passed to the run
 *   - GPU adapter probe → `#adapter` text
 *   - SharedArrayBuffer detection → `#sab` text
 *   - All `console.log` / `console.info` calls during the run → `#log` panel
 *     with simple `[OK] / [WARN] / [ERR]` colour coding.
 */
function setupChonkWebGpuPage(): void {
  const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
  const status = $('status');
  const adapter = $('adapter');
  const sab = $('sab');
  const log = $('log');
  const runWasm = $<HTMLButtonElement>('run-wasm');
  const runWebgpu = $<HTMLButtonElement>('run-webgpu');
  const runWebgpuBatch = $<HTMLButtonElement>('run-webgpu-batch');
  const maskToggle = $<HTMLButtonElement>('toggle-mask');
  const warmUp = $<HTMLButtonElement>('warm-up');
  const clearLog = $<HTMLButtonElement>('clear-log');
  const flowSel = $<HTMLSelectElement>('flow');
  // All optional — absent on the minimal Puppeteer harness pages, so they're
  // looked up outside the mandatory-elements guard below.
  const runsInput = $<HTMLInputElement>('runs');
  // Single-run e2e Perfetto trace buttons (one prove with phase capture, merged
  // into one Perfetto JSON, POSTed + downloaded).
  const traceBtnWebgpu = $<HTMLButtonElement>('trace-webgpu');
  const traceBtnWasm = $<HTMLButtonElement>('trace-wasm');
  const runPerCircuit = $<HTMLButtonElement>('run-percircuit');
  const nativeVerifyWebgpu = $<HTMLButtonElement>('native-verify-webgpu');
  // All-examples interleaved sweep: prove every dropdown example round-robin,
  // N rounds, median per example; WASM and WebGPU fill a shared table.
  const allRunWasm = $<HTMLButtonElement>('run-all-wasm');
  const allRunWebgpu = $<HTMLButtonElement>('run-all-webgpu');
  const allRoundsInput = $<HTMLInputElement>('all-rounds');
  const allRunPanel = $('allrun-panel');
  const allRunTable = $('allrun-table');
  // Per-circuit breakdown: each WASM/WebGPU run does one extra traced prove and
  // the table (shown empty from the start) fills in as each mode completes.
  const pcPanel = $('percircuit-panel');
  const pcTable = $('percircuit-table');
  const phPanel = $('phase-panel');
  const phTable = $('phase-table');
  const progressEl = $('progress');
  const progBar = $<HTMLProgressElement>('prog-bar');
  const progText = $('prog-text');

  if (!status || !adapter || !sab || !log || !runWasm || !runWebgpu || !runWebgpuBatch || !clearLog || !flowSel) {
    /* Page is missing expected elements — bail; harness pages (e.g. the
     * Puppeteer test's minimal HTML) intentionally don't have them. */
    return;
  }

  // Cross-origin isolation is required for SharedArrayBuffer, which the
  // multi-threaded WASM build needs. The serve script sets the COOP/COEP
  // headers; if the user opens the bundle without them this will report
  // not-isolated and the run will fail later.
  const sabAvailable = typeof SharedArrayBuffer !== 'undefined';
  const isolated = (window as any).crossOriginIsolated === true;
  sab.textContent = sabAvailable
    ? isolated
      ? 'available, crossOriginIsolated=true'
      : 'available but crossOriginIsolated=false (run via serve-chonk-webgpu.mjs)'
    : 'unavailable — multi-threaded WASM will not work';
  if (!isolated) {
    sab.style.color = '#f85149';
  }

  // GPU adapter probe — same shape as the bench functions use.
  (async () => {
    if (!('gpu' in navigator)) {
      adapter.textContent = 'WebGPU not exposed by navigator.gpu';
      adapter.style.color = '#f85149';
      return;
    }
    try {
      const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!a) {
        adapter.textContent = 'requestAdapter returned null';
        adapter.style.color = '#f85149';
        return;
      }
      const info = (a as any).info ?? (await (a as any).requestAdapterInfo?.());
      adapter.textContent = info
        ? `${info.vendor ?? '?'} / ${info.architecture ?? '?'} / ${info.device ?? '?'} / ${info.description ?? '?'}`
        : 'unknown';
      if (/swiftshader/i.test(adapter.textContent ?? '')) {
        adapter.style.color = '#d29922';
      }
    } catch (err) {
      adapter.textContent = `error: ${err instanceof Error ? err.message : String(err)}`;
      adapter.style.color = '#f85149';
    }
  })();

  // Pipe console.log / console.info into the in-page log panel. Color by a
  // simple `[OK] / [WARN] / [ERR]` heuristic on the line contents. Each
  // append also auto-scrolls so the latest line is visible during the run.
  const append = (line: string, cls: 'info' | 'ok' | 'warn' | 'err' = 'info') => {
    const div = document.createElement('div');
    div.className = `l-${cls}`;
    div.textContent = line;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  };
  const origLog = console.log.bind(console);
  const origInfo = console.info.bind(console);
  const origWarn = console.warn.bind(console);
  const origErr = console.error.bind(console);
  const sniff =
    (orig: (...a: unknown[]) => void, defaultCls: 'info' | 'ok' | 'warn' | 'err') =>
    (...args: unknown[]) => {
      const s = args
        .map(a =>
          typeof a === 'string'
            ? a
            : (() => {
                try {
                  return JSON.stringify(a);
                } catch {
                  return String(a);
                }
              })(),
        )
        .join(' ');
      let cls = defaultCls;
      if (/\bERROR\b|\bfail|✗/i.test(s)) cls = 'err';
      else if (/\bWARN\b|⚠/i.test(s)) cls = 'warn';
      else if (/✓|\bOK\b|verified=true/i.test(s)) cls = 'ok';
      append(s, cls);
      orig(...(args as []));
    };
  console.log = sniff(origLog, 'info');
  console.info = sniff(origInfo, 'info');
  console.warn = sniff(origWarn, 'warn');
  console.error = sniff(origErr, 'err');

  const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(0)} ms`);
  const setText = (id: string, txt: string): void => {
    const el = $(id);
    if (el) el.textContent = txt;
  };
  const setSpeedup = (id: string, faster: number, baseline: number): void => {
    const el = $(id);
    if (!el || !baseline) return;
    const ratio = baseline / faster;
    el.textContent =
      ratio >= 1 ? `${ratio.toFixed(2)}× vs WASM (faster)` : `${(1 / ratio).toFixed(2)}× vs WASM (slower)`;
    el.className = ratio >= 1 ? 'speedup up' : 'speedup down';
  };
  const setPill = (id: string, state: 'ok' | 'fail' | 'skip' | 'info', text: string): void => {
    const el = $(id);
    if (!el) return;
    el.className = `pill ${state}`;
    el.textContent = text;
  };
  // Progress bar with a live elapsed timer. The page main thread is free during a prove (it only
  // services the bridge), so a setInterval ticker repaints the elapsed time; per-run progress is
  // driven by setProg(). Indeterminate (no value attr) for single runs, determinate for the median.
  let progStart = 0;
  let progTimer = 0;
  let progLabel = '';
  const fmtElapsed = (ms: number): string => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const renderProg = (): void => {
    if (progText) progText.textContent = `${progLabel} · elapsed ${fmtElapsed(performance.now() - progStart)}`;
  };
  const startProg = (label: string): void => {
    if (!progressEl || !progBar) return;
    progLabel = label;
    progStart = performance.now();
    progBar.removeAttribute('value'); // indeterminate until setProg gives a value
    progressEl.style.display = 'flex';
    renderProg();
    clearInterval(progTimer);
    progTimer = window.setInterval(renderProg, 400);
  };
  const setProg = (label: string, value?: number, max?: number): void => {
    progLabel = label;
    if (progBar) {
      if (value != null && max != null) {
        progBar.max = max;
        progBar.value = value;
      } else {
        progBar.removeAttribute('value');
      }
    }
    renderProg();
  };
  const stopProg = (): void => {
    clearInterval(progTimer);
    if (progressEl) progressEl.style.display = 'none';
  };

  const setBusy = (busy: boolean, label = 'Running…'): void => {
    for (const b of [
      runWasm,
      runWebgpu,
      runWebgpuBatch,
      warmUp,
      traceBtnWebgpu,
      traceBtnWasm,
      runPerCircuit,
      allRunWasm,
      allRunWebgpu,
      maskToggle,
    ]) {
      if (b) b.disabled = busy;
    }
    status.textContent = busy ? 'running…' : 'idle';
    if (busy) startProg(label);
    else stopProg();
  };

  // POST a built Perfetto trace JSON to the server sink under `filename`
  // (?name=…). The WASM and WebGPU runs use distinct filenames so neither
  // clobbers the other on disk.
  const postTrace = async (json: string, filename: string, spanNote: string): Promise<void> => {
    try {
      const r = await fetch(`/msm-trace?name=${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json,
      });
      const j = await r.json().catch(() => ({}));
      append(
        r.ok
          ? `✓ Perfetto trace saved → ${j.path ?? filename} (${spanNote}). Open it at ui.perfetto.dev (Open trace file).`
          : `[WARN] trace POST status ${r.status}`,
        r.ok ? 'ok' : 'warn',
      );
    } catch (e) {
      append(`[WARN] trace POST failed: ${e instanceof Error ? e.message : String(e)}`, 'warn');
    }
  };

  // Trigger a client-side download of a JSON string — the "generated on the
  // front end" path that works regardless of whether the page is served by
  // serve-chonk-webgpu.mjs (which also has the /msm-trace disk sink).
  const downloadJson = (json: string, filename: string): void => {
    try {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      append(`[WARN] download failed: ${e instanceof Error ? e.message : String(e)}`, 'warn');
    }
  };

  // The WASM baseline VK + median prove time, kept across clicks so the WebGPU
  // runs can report a speedup and a VK byte-equality check against it. A matching
  // VK is the gold-standard correctness signal: it proves the GPU-delegated MSMs
  // produced the same commitments as the all-CPU path.
  let lastWasmVk: Uint8Array | undefined;
  let lastWasmProveMs: number | undefined;
  // WebGPU-solo median, kept so the per-circuit table can show it next to the
  // (bench-on) traced totals for a consistency check.
  let lastWebgpuProveMs: number | undefined;
  // Per-circuit breakdowns + the e2e prove total of each per-circuit traced run.
  let lastWasmPerCircuit: PerCircuitRow[] | undefined;
  let lastWebgpuPerCircuit: PerCircuitRow[] | undefined;
  let lastWasmPhases: PhaseRow[] | undefined;
  let lastWebgpuPhases: PhaseRow[] | undefined;
  let lastWasmTraceMs: number | undefined;
  let lastWebgpuTraceMs: number | undefined;

  // Render the WASM-vs-WebGPU per-circuit table below the log. Shows whichever
  // columns are available; the per-circuit Δ is the GPU reduction for that
  // circuit's witness-commit phase, and "MSMs on GPU" lists the delegated
  // commitments. Joined by circuit prove order (both modes share it).
  const renderPerCircuit = (): void => {
    if (!pcPanel || !pcTable) return;
    pcPanel.style.display = 'block';
    const w = lastWasmPerCircuit;
    const g = lastWebgpuPerCircuit;
    if (!w && !g) {
      pcTable.innerHTML =
        `<div style="color:#8b949e;font-size:13px;">Run <strong>WASM</strong> and <strong>WebGPU</strong> ` +
        `to populate. Each run automatically does one extra traced prove and fills its column here: ` +
        `per-circuit witness-commit time, the WASM↔WebGPU reduction, and which MSMs ran on the GPU.</div>`;
      return;
    }
    const n = Math.max(w?.length ?? 0, g?.length ?? 0);
    const td = (s: string, extra = ''): string =>
      `<td style="padding:4px 10px;border-bottom:1px solid #21262d;${extra}">${s}</td>`;
    const head = ['#', 'circuit / phase', 'WASM', 'WebGPU', 'Δ (GPU saves)', 'MSMs on GPU']
      .map(h => `<th style="text-align:left;padding:4px 10px;border-bottom:1px solid #30363d;color:#8b949e;">${h}</th>`)
      .join('');
    let body = '';
    let totW = 0;
    let totG = 0;
    let prevTail = false;
    for (let i = 0; i < n; i++) {
      const wr = w?.[i];
      const gr = g?.[i];
      const name = gr?.name ?? wr?.name ?? `circuit ${i}`;
      if (wr) totW += wr.oinkMs;
      if (gr) totG += gr.oinkMs;
      const delta = wr && gr ? wr.oinkMs - gr.oinkMs : undefined;
      const dColor = delta == null ? '' : delta >= 0 ? 'color:#3fb950;' : 'color:#f85149;';
      const dTxt = delta == null ? '—' : `${delta >= 0 ? '−' : '+'}${fmtMs(Math.abs(delta))}`;
      const msms = gr ? (gr.gpuMsms.length ? gr.gpuMsms.join(', ') : '— (all on CPU)') : '';
      // Visually separate the once-per-prove tail phases from the per-circuit rows.
      const isTail = name.startsWith('tail');
      const sep = isTail && !prevTail ? 'border-top:2px solid #30363d;' : '';
      prevTail = isTail;
      const idCell = isTail ? '' : String(i);
      body +=
        `<tr>${td(idCell, sep)}${td(name, sep)}${td(wr ? fmtMs(wr.oinkMs) : '—', sep)}` +
        `${td(gr ? fmtMs(gr.oinkMs) : '—', sep)}${td(dTxt, sep + dColor)}${td(msms, sep + 'color:#8b949e;')}</tr>`;
    }
    const totDelta = w && g ? totW - totG : undefined;
    const totColor = totDelta == null ? '' : totDelta >= 0 ? 'color:#3fb950;' : 'color:#f85149;';
    const totTxt = totDelta == null ? '—' : `${totDelta >= 0 ? '−' : '+'}${fmtMs(Math.abs(totDelta))}`;
    body +=
      `<tr style="font-weight:600;">${td('', 'border-top:2px solid #30363d;')}${td('total (prove − verify)', 'border-top:2px solid #30363d;')}` +
      `${td(w ? fmtMs(totW) : '—', 'border-top:2px solid #30363d;')}` +
      `${td(g ? fmtMs(totG) : '—', 'border-top:2px solid #30363d;')}${td(totTxt, 'border-top:2px solid #30363d;' + totColor)}${td('', 'border-top:2px solid #30363d;')}</tr>`;
    // e2e prove totals of these traced runs, with the clean medians for a
    // consistency check. The WebGPU trace is taken after a discarded GPU warm-up
    // prove, so it's a steady-state (warm) number like the median — the only
    // residual gap is the BB_BENCH per-scope recording overhead.
    const fmtOpt = (ms?: number): string => (ms == null ? '—' : fmtMs(ms));
    const tw = lastWasmTraceMs;
    const tg = lastWebgpuTraceMs;
    let e2e = '';
    if (tw != null || tg != null) {
      const vs = tw != null && tg != null && tg > 0 ? ` (${(tw / tg).toFixed(2)}× vs WASM)` : '';
      e2e =
        `<div style="font-size:13px;margin-bottom:8px;"><strong>e2e prove — this traced run (warm, bench-on):</strong> ` +
        `<span style="font-family:ui-monospace,monospace;">WASM ${fmtOpt(tw)} · WebGPU ${fmtOpt(tg)}${vs}</span>`;
      if (lastWasmProveMs != null || lastWebgpuProveMs != null) {
        e2e +=
          `<br><span style="color:#8b949e;">median (clean runs): ` +
          `<span style="font-family:ui-monospace,monospace;">WASM ${fmtOpt(lastWasmProveMs)} · WebGPU ${fmtOpt(lastWebgpuProveMs)}</span>` +
          ` — these should track the medians closely; any residual excess is BB_BENCH recording overhead, not GPU cold-start.</span>`;
      } else {
        e2e += `<br><span style="color:#8b949e;">run the median buttons to compare against the clean (bench-off) totals.</span>`;
      }
      e2e += `</div>`;
    }
    const hint =
      w && g
        ? ''
        : `<div style="color:#8b949e;font-size:12px;margin-bottom:8px;"><em>run the other side — Per-circuit comparison traces WASM then WebGPU</em></div>`;
    pcTable.innerHTML =
      e2e +
      hint +
      `<table style="border-collapse:collapse;font-size:12.5px;font-family:ui-monospace,monospace;width:100%;">` +
      `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    pcPanel.style.display = 'block';
  };

  // Render the high-level phase breakdown (ChonkLoad/Accumulate/Prove/…) below
  // the per-circuit table, ChonkProve drilled one level deeper into its Goblin
  // sub-provers. Δ = WASM − WebGPU per phase (green = GPU gain, red = GPU loss),
  // so it reads at a glance which stage the GPU helps and which it doesn't.
  const renderPhases = (): void => {
    if (!phPanel || !phTable) return;
    phPanel.style.display = 'block';
    const w = lastWasmPhases;
    const g = lastWebgpuPhases;
    if (!w && !g) {
      phTable.innerHTML =
        `<div style="color:#8b949e;font-size:13px;">Run <strong>Per-circuit comparison</strong> to populate — ` +
        `it traces one WASM and one WebGPU prove and breaks each into the high-level Chonk phases, ` +
        `with <code>ChonkProve</code> split into its Goblin sub-provers.</div>`;
      return;
    }
    // Join by phase name in run order (both modes share the same phase sequence).
    const order = (g ?? w)!.map(p => p.name);
    const byName = (rows: PhaseRow[] | undefined): Map<string, PhaseRow> => new Map((rows ?? []).map(p => [p.name, p]));
    const wm = byName(w);
    const gm = byName(g);
    const td = (s: string, extra = ''): string =>
      `<td style="padding:4px 10px;border-bottom:1px solid #21262d;${extra}">${s}</td>`;
    const head = ['phase', 'WASM', 'WebGPU', 'Δ (GPU saves)', 'GPU MSMs']
      .map(h => `<th style="text-align:left;padding:4px 10px;border-bottom:1px solid #30363d;color:#8b949e;">${h}</th>`)
      .join('');
    let body = '';
    let totW = 0;
    let totG = 0;
    for (const name of order) {
      const wr = wm.get(name);
      const gr = gm.get(name);
      const depth = (gr ?? wr)!.depth;
      // Only the top-level (depth 0) phases sum to the e2e total; depth-1 rows are
      // a drill-down of ChonkProve and would double-count.
      if (depth === 0) {
        if (wr) totW += wr.ms;
        if (gr) totG += gr.ms;
      }
      const delta = wr && gr ? wr.ms - gr.ms : undefined;
      const dColor = delta == null ? '' : delta >= 0 ? 'color:#3fb950;' : 'color:#f85149;';
      const dTxt = delta == null ? '—' : `${delta >= 0 ? '−' : '+'}${fmtMs(Math.abs(delta))}`;
      const gpu = gr ? (gr.gpuMsms > 0 ? String(gr.gpuMsms) : '—') : '';
      const label = depth === 0 ? name : `<span style="color:#8b949e;">└ ${name}</span>`;
      const indent = depth === 0 ? '' : 'padding-left:28px;';
      const nameStyle = depth === 0 ? 'font-weight:600;' : '';
      body +=
        `<tr>${td(label, indent + nameStyle)}${td(wr ? fmtMs(wr.ms) : '—')}${td(gr ? fmtMs(gr.ms) : '—')}` +
        `${td(dTxt, dColor)}${td(gpu, 'color:#8b949e;')}</tr>`;
    }
    const totDelta = w && g ? totW - totG : undefined;
    const totColor = totDelta == null ? '' : totDelta >= 0 ? 'color:#3fb950;' : 'color:#f85149;';
    const totTxt = totDelta == null ? '—' : `${totDelta >= 0 ? '−' : '+'}${fmtMs(Math.abs(totDelta))}`;
    const tb = 'border-top:2px solid #30363d;';
    body +=
      `<tr style="font-weight:600;">${td('e2e prove (sum of phases)', tb)}${td(w ? fmtMs(totW) : '—', tb)}` +
      `${td(g ? fmtMs(totG) : '—', tb)}${td(totTxt, tb + totColor)}${td('', tb)}</tr>`;
    const hint =
      w && g
        ? ''
        : `<div style="color:#8b949e;font-size:12px;margin-bottom:8px;"><em>run the other side — Per-circuit comparison traces WASM then WebGPU</em></div>`;
    phTable.innerHTML =
      hint +
      `<table style="border-collapse:collapse;font-size:12.5px;font-family:ui-monospace,monospace;width:100%;">` +
      `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    phPanel.style.display = 'block';
  };

  const getRuns = (): number => Math.max(1, Math.min(20, parseInt(runsInput?.value ?? '5', 10) || 5));

  // The three run buttons share one N×-with-median runner; this maps each mode
  // to its result-card element ids.
  const MODES: Record<RunMode, { label: string; prefix: string; vkId?: string; speedId?: string }> = {
    wasm: { label: 'WASM', prefix: 'wasm' },
    webgpu: { label: 'WebGPU', prefix: 'webgpu', vkId: 'webgpu-vkmatch', speedId: 'webgpu-speedup' },
    batch: {
      label: 'WebGPU (batch)',
      prefix: 'webgpu-batch',
      vkId: 'webgpu-batch-vkmatch',
      speedId: 'webgpu-batch-speedup',
    },
  };

  const vkEqual = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

  const runMode = async (mode: RunMode): Promise<void> => {
    const m = MODES[mode];
    const runs = getRuns();
    setBusy(true, `${m.label} ×${runs} — starting`);
    try {
      const flow = flowSel.value;
      append(`▶ ${m.label}: ${runs}× prove on flow=${flow} (reports the median)`, 'info');
      setText(`${m.prefix}-prove-big`, '…');
      setText(`${m.prefix}-runs`, '');
      setText(`${m.prefix}-mem`, '…');
      const res: ModeMultiResult = await (window as any).runChonkModeMulti(mode, flow, runs, (p: ModeMultiProgress) => {
        if (p.phase === 'measuring') {
          setProg(`${m.label} ${p.runs}/${p.runs} done · measuring memory…`, p.done, p.total);
          return;
        }
        const tag =
          p.phase === 'done'
            ? `${m.label} run ${p.run}/${p.runs} done (${((p.lastMs ?? 0) / 1000).toFixed(1)}s)`
            : `${m.label} run ${p.run}/${p.runs} proving…`;
        setProg(`${tag} · ${p.done}/${p.total}`, p.done, p.total);
      });
      setText(`${m.prefix}-prove-big`, fmtMs(res.medianTotal));
      setText(
        `${m.prefix}-runs`,
        `${runs}× [${res.totals.map(t => (t / 1000).toFixed(2)).join(', ')}] s · min ${fmtMs(res.minTotal)} · max ${fmtMs(res.maxTotal)}`,
      );
      setPill(
        `${m.prefix}-verified`,
        res.allVerified ? 'ok' : 'fail',
        res.allVerified ? `verified: ${runs}/${runs}` : 'verified: FAILED',
      );
      setText(
        `${m.prefix}-mem`,
        mode === 'wasm'
          ? `${res.wasmHeapPeakMb.toFixed(0)} MiB heap`
          : `${res.wasmHeapPeakMb.toFixed(0)} heap + ${res.gpuPeakMb.toFixed(0)} GPU MiB`,
      );
      if (mode === 'wasm') {
        lastWasmVk = res.vk;
        lastWasmProveMs = res.medianTotal;
      } else {
        if (mode === 'webgpu') lastWebgpuProveMs = res.medianTotal;
        if (m.speedId && lastWasmProveMs) setSpeedup(m.speedId, res.medianTotal, lastWasmProveMs);
        if (m.vkId) {
          if (lastWasmVk) {
            const match = vkEqual(lastWasmVk, res.vk);
            setPill(m.vkId, match ? 'ok' : 'fail', match ? 'vk vs WASM: match' : 'vk vs WASM: MISMATCH');
            if (!match) {
              append(
                `[ERR] ${m.label} VK does not match the WASM baseline — GPU-delegated commitments diverge!`,
                'err',
              );
            }
          } else {
            setPill(m.vkId, 'skip', 'vk vs WASM: run WASM first');
          }
        }
      }
      const vsWasm =
        mode !== 'wasm' && lastWasmProveMs ? ` · ${(lastWasmProveMs / res.medianTotal).toFixed(2)}× vs WASM` : '';
      append(
        `✓ ${m.label} median=${fmtMs(res.medianTotal)} [${fmtMs(res.minTotal)}–${fmtMs(res.maxTotal)}] verified=${res.allVerified}${vsWasm}`,
        res.allVerified ? 'ok' : 'err',
      );
      append(
        `  peak memory: WASM heap ${res.wasmHeapPeakMb.toFixed(0)} MiB` +
          (mode !== 'wasm'
            ? ` + GPU ${res.gpuPeakMb.toFixed(0)} MiB = ${(res.wasmHeapPeakMb + res.gpuPeakMb).toFixed(0)} MiB total`
            : '') +
          (res.jsHeapMb > 0 ? ` · JS heap ${res.jsHeapMb.toFixed(0)} MiB` : ''),
        'info',
      );
      append(
        res.reused
          ? `  setup (not in the per-run timings): backend reused warm — 0s init this click · load inputs ${fmtMs(res.loadMs)}`
          : `  setup (not in the per-run timings): load inputs ${fmtMs(res.loadMs)} + ` +
              `init 16-thread WASM + CRS ${fmtMs(res.initMs)} — backend now warm, so the next ${m.label} click skips the init`,
        'info',
      );
    } catch (err) {
      setText(`${m.prefix}-prove-big`, '✗');
      setText(`${m.prefix}-mem`, '—');
      setPill(`${m.prefix}-verified`, 'fail', 'error');
      append(`[ERR] ${m.label} run: ${err instanceof Error ? err.message : String(err)}`, 'err');
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  runWasm.addEventListener('click', () => void runMode('wasm'));
  runWebgpu.addEventListener('click', () => void runMode('webgpu'));
  runWebgpuBatch.addEventListener('click', () => void runMode('batch'));

  // Masking toggle — arms additive scalar masking (`__bridge_mask_msms`), which
  // makes webgpuBlocklist() empty so EVERY MSM is delegated to the GPU and the
  // bridge masks structured scalars + subtracts the precomputed offset. Toggling
  // flips the blocklist, which changes the warm-backend key (so the next run
  // rebuilds anyway); we also dispose explicitly to force a clean re-init whose
  // SRS publish picks up the new masking state. Watch for the bridge's
  // `[mask] enabled …` log line on the next WebGPU run to confirm it armed.
  let maskingOn = false;
  const renderMaskToggle = (): void => {
    (window as any).__bridge_mask_msms = maskingOn;
    if (!maskToggle) return;
    maskToggle.textContent = `Masking: ${maskingOn ? 'ON' : 'off'}`;
    maskToggle.style.background = maskingOn ? '#238636' : '';
    maskToggle.style.color = maskingOn ? '#fff' : '';
  };
  renderMaskToggle();
  maskToggle?.addEventListener('click', () => {
    maskingOn = !maskingOn;
    renderMaskToggle();
    void disposeWarmBackend();
    append(
      maskingOn
        ? 'masking ON — all eligible MSMs delegated to the GPU (blocklist empty); backend rebuilds on next run'
        : 'masking off — default blocklist restored; backend rebuilds on next run',
      'info',
    );
  });

  // ── All-examples interleaved sweep ──────────────────────────────────────────
  // The dropdown's option labels are the human-readable example names; reuse them
  // verbatim in the table so the two stay in sync.
  const allFlows = (): string[] => Array.from(flowSel.options).map(o => o.value);
  const flowLabel = (flow: string): string => {
    const opt = Array.from(flowSel.options).find(o => o.value === flow);
    return opt?.textContent?.trim() || flow;
  };
  const getRounds = (): number => Math.max(1, Math.min(10, parseInt(allRoundsInput?.value ?? '3', 10) || 3));

  // Per-example sweep results, keyed by flow; each mode fills its own column so
  // a WASM sweep then a WebGPU sweep render side by side with the speedup.
  const allRunData = new Map<string, { numCircuits: number; wasm?: AllRunFlowResult; webgpu?: AllRunFlowResult }>();
  const renderAllRun = (): void => {
    if (!allRunPanel || !allRunTable) return;
    if (allRunData.size === 0) {
      allRunPanel.style.display = 'none';
      return;
    }
    const td = (html: string, style = ''): string => `<td style="padding:4px 10px;${style}">${html}</td>`;
    const th = (html: string, style = ''): string =>
      `<th style="padding:4px 10px;text-align:left;border-bottom:1px solid #30363d;${style}">${html}</th>`;
    const runsTxt = (r?: AllRunFlowResult): string =>
      r
        ? `<span style="color:#8b949e;font-size:11px;">[${r.rounds.map(t => (t / 1000).toFixed(2)).join(', ')}]</span>`
        : '';
    const head =
      th('Example') +
      th('circuits', 'text-align:right;') +
      th('WASM median', 'text-align:right;') +
      th('WebGPU median', 'text-align:right;') +
      th('speedup', 'text-align:right;') +
      th('verified', 'text-align:center;');
    let body = '';
    let sumWasm = 0;
    let sumWebgpu = 0;
    let haveWasm = false;
    let haveWebgpu = false;
    let allVerified = true;
    for (const flow of allFlows()) {
      const d = allRunData.get(flow);
      if (!d) continue;
      const w = d.wasm;
      const g = d.webgpu;
      if (w) {
        sumWasm += w.medianMs;
        haveWasm = true;
        allVerified = allVerified && w.verified;
      }
      if (g) {
        sumWebgpu += g.medianMs;
        haveWebgpu = true;
        allVerified = allVerified && g.verified;
      }
      const speed = w && g && g.medianMs > 0 ? w.medianMs / g.medianMs : undefined;
      const speedTxt =
        speed == null ? '—' : `<span style="color:${speed >= 1 ? '#3fb950' : '#f85149'};">${speed.toFixed(2)}×</span>`;
      const verified = (w?.verified ?? true) && (g?.verified ?? true);
      const verTxt =
        !w && !g ? '—' : verified ? '<span style="color:#3fb950;">✓</span>' : '<span style="color:#f85149;">✗</span>';
      body +=
        `<tr>` +
        td(`<span style="color:#c9d1d9;">${flowLabel(flow)}</span>`) +
        td(String(d.numCircuits), 'text-align:right;color:#8b949e;') +
        td(w ? `${fmtMs(w.medianMs)} ${runsTxt(w)}` : '—', 'text-align:right;') +
        td(g ? `${fmtMs(g.medianMs)} ${runsTxt(g)}` : '—', 'text-align:right;') +
        td(speedTxt, 'text-align:right;') +
        td(verTxt, 'text-align:center;') +
        `</tr>`;
    }
    const tb = 'border-top:2px solid #30363d;font-weight:600;';
    const totSpeed = haveWasm && haveWebgpu && sumWebgpu > 0 ? sumWasm / sumWebgpu : undefined;
    body +=
      `<tr>` +
      td('total (sum of medians)', tb) +
      td('', tb) +
      td(haveWasm ? fmtMs(sumWasm) : '—', tb + 'text-align:right;') +
      td(haveWebgpu ? fmtMs(sumWebgpu) : '—', tb + 'text-align:right;') +
      td(
        totSpeed == null
          ? '—'
          : `<span style="color:${totSpeed >= 1 ? '#3fb950' : '#f85149'};">${totSpeed.toFixed(2)}×</span>`,
        tb + 'text-align:right;',
      ) +
      td(
        allVerified ? '<span style="color:#3fb950;">✓</span>' : '<span style="color:#f85149;">✗</span>',
        tb + 'text-align:center;',
      ) +
      `</tr>`;
    allRunTable.innerHTML =
      `<table style="border-collapse:collapse;font-size:12.5px;font-family:ui-monospace,monospace;width:100%;">` +
      `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    allRunPanel.style.display = 'block';
  };

  const runAll = async (mode: AllRunMode): Promise<void> => {
    const flows = allFlows();
    const rounds = getRounds();
    const label = mode === 'wasm' ? 'WASM' : 'WebGPU';
    setBusy(true, `Run all ${label}: ${flows.length} examples × ${rounds} rounds`);
    try {
      append(
        `▶ Run all (${label}): ${flows.length} examples, interleaved round-robin, ${rounds} rounds each (median per example)`,
        'info',
      );
      const res: AllRunResult = await (window as any).runChonkAllExamples(mode, flows, rounds, (p: AllRunProgress) => {
        if (p.phase === 'warmup') {
          setProg(`${label}: warm-up prove (discarded — pays GPU cold-start)…`);
          return;
        }
        const done = (p.round - 1) * p.flowCount + (p.phase === 'done' ? p.flowIndex + 1 : p.flowIndex);
        const tag =
          p.phase === 'done'
            ? `${label} round ${p.round}/${p.rounds} · ${flowLabel(p.flow)} done (${((p.lastMs ?? 0) / 1000).toFixed(1)}s)`
            : `${label} round ${p.round}/${p.rounds} · ${flowLabel(p.flow)} (${p.flowIndex + 1}/${p.flowCount}) proving…`;
        setProg(`${tag} · ${done}/${p.rounds * p.flowCount}`, done, p.rounds * p.flowCount);
      });
      for (const fr of res.results) {
        const d = allRunData.get(fr.flow) ?? { numCircuits: fr.numCircuits };
        d.numCircuits = fr.numCircuits;
        d[mode] = fr;
        allRunData.set(fr.flow, d);
      }
      renderAllRun();
      const allOk = res.results.every(r => r.verified);
      append(
        `✓ Run all (${label}): ${res.results.length} examples × ${rounds} rounds, all verified=${allOk}` +
          (res.reused ? ' · backend reused warm' : ` · init ${fmtMs(res.initMs)} (then warm)`),
        allOk ? 'ok' : 'err',
      );
      for (const r of res.results) {
        append(
          `  ${flowLabel(r.flow)}: median=${fmtMs(r.medianMs)} [${fmtMs(r.minMs)}–${fmtMs(r.maxMs)}] ` +
            `rounds=[${r.rounds.map(t => (t / 1000).toFixed(2)).join(', ')}]s verified=${r.verified}`,
          r.verified ? 'info' : 'err',
        );
      }
    } catch (err) {
      append(`[ERR] run all ${label}: ${err instanceof Error ? err.message : String(err)}`, 'err');
      console.error(err);
    } finally {
      setBusy(false);
    }
  };
  allRunWasm?.addEventListener('click', () => void runAll('wasm'));
  allRunWebgpu?.addEventListener('click', () => void runAll('webgpu'));

  // Pre-build the WASM backend (16 threads + CRS) now, so the first Run WASM pays
  // no init. The backend stays warm and is reused on same-mode clicks; switching
  // mode rebuilds it (only one is held). Lazy anyway — a Run click warms if cold.
  warmUp?.addEventListener('click', async () => {
    setBusy(true, 'Warming up WASM backend (16-thread WASM + CRS)…');
    try {
      append(
        '▶ Warm up: building the WASM backend (16 threads + CRS) so the first Run WASM skips the ~13s init',
        'info',
      );
      const r = await (window as any).ensureWarmBackend(false);
      append(
        r.reused
          ? '✓ WASM backend already warm — Run WASM is instant.'
          : `✓ WASM backend warm (${fmtMs(r.initMs)}). Run WASM is now instant; WebGPU/batch build on first use (only one backend is held).`,
        'ok',
      );
      status.textContent = 'backend warm: WASM';
    } catch (err) {
      append(`[ERR] warm up: ${err instanceof Error ? err.message : String(err)}`, 'err');
      console.error(err);
    } finally {
      setBusy(false);
    }
  });

  // Single-run e2e Perfetto trace: ONE prove with phase-level BB_BENCH capture,
  // merged onto one clock, POSTed + downloaded. Separate from the N× run buttons
  // because a trace is inherently a single run.
  const captureTrace = async (webgpu: boolean): Promise<void> => {
    const label = webgpu ? 'WebGPU' : 'WASM';
    setBusy(true, `Tracing ${label} (1×)`);
    try {
      const flow = flowSel.value;
      append(`▶ Capturing e2e Perfetto trace — ${label}, single run, flow=${flow}`, 'info');
      // Free the warm median backend so the trace's fresh benchTrace instance isn't
      // shadowed by the config-blind singleton (the next median click re-warms).
      await (window as any).disposeWarmBackend?.();
      const r = await (window as any).runChonkWebGpuTrace(flow, { webgpu });
      if (webgpu && r.swiftshaderDetected) {
        append(
          '[WARN] SwiftShader/software WebGPU — trace not captured (the prove would not verify). Use a hardware GPU.',
          'warn',
        );
        return;
      }
      append(
        `  prove=${fmtMs(r.proveMs)} verified=${r.verified} lanes=${r.counts.lanes} cppEvents=${r.counts.cppEvents}` +
          (webgpu ? ` cpu=${r.counts.cpu} gpu=${r.counts.gpu} mem=${r.counts.mem}` : ''),
        r.verified ? 'ok' : 'warn',
      );
      if (r.traceJson) {
        const base = webgpu ? 'chonk-webgpu-e2e-trace' : 'chonk-wasm-e2e-trace';
        await postTrace(r.traceJson, `${base}.json`, `${r.counts.lanes} lanes, ${r.counts.cppEvents} events`);
        downloadJson(r.traceJson, `${base}.perfetto.json`);
        append(`  ⬇ downloaded ${base}.perfetto.json — open at ui.perfetto.dev`, 'ok');
      } else {
        append('[WARN] no trace JSON produced.', 'warn');
      }
    } catch (err) {
      append(`[ERR] trace ${label}: ${err instanceof Error ? err.message : String(err)}`, 'err');
      console.error(err);
    } finally {
      setBusy(false);
    }
  };
  traceBtnWebgpu?.addEventListener('click', () => void captureTrace(true));
  traceBtnWasm?.addEventListener('click', () => void captureTrace(false));

  // Native verify: ONE WebGPU prove, then POST proof+vk to the dev server's /proof
  // sink which runs the native `bb verify --scheme chonk` and returns the verdict.
  nativeVerifyWebgpu?.addEventListener('click', async () => {
    setBusy(true, 'Native verify: 1 WebGPU prove + native bb verify');
    try {
      const flow = flowSel.value;
      append(
        `▶ Native verify: proving once on WebGPU (flow=${flow}), then running native bb verify on the dev server`,
        'info',
      );
      const r = await runChonkNativeVerify('webgpu', flow);
      append(
        `  proof ${r.proofBytes} bytes · in-browser WASM verify=${r.wasmVerified} · native bb verify=${r.nativeVerified}` +
          (r.exitCode !== undefined ? ` (bb exit ${r.exitCode})` : ''),
        r.nativeVerified ? 'ok' : 'err',
      );
      append(
        r.nativeVerified
          ? '✓ The WebGPU-produced proof passes native verification.'
          : '✗ Native verification FAILED — check the dev server log (and that it is serve-chonk-webgpu.mjs with a built native bb, on a hardware GPU).',
        r.nativeVerified ? 'ok' : 'err',
      );
    } catch (err) {
      append(`[ERR] native verify: ${err instanceof Error ? err.message : String(err)}`, 'err');
      console.error(err);
    } finally {
      setBusy(false);
    }
  });

  // Dedicated per-circuit table: one traced WASM prove + one traced WebGPU prove
  // (bench on), parsed into the WASM-vs-WebGPU per-circuit breakdown. Independent
  // of the median run buttons, which stay clean (bench off, no extra prove).
  runPerCircuit?.addEventListener('click', async () => {
    setBusy(true, 'Per-circuit: tracing WASM + WebGPU (2 proves)');
    try {
      const flow = flowSel.value;
      append(`▶ Per-circuit table: 1 traced WASM prove + 1 traced WebGPU prove (bench on) on flow=${flow}`, 'info');
      // Free the warm median backend so each trace's fresh benchTrace instance isn't
      // shadowed by the config-blind singleton (the next median click re-warms).
      await (window as any).disposeWarmBackend?.();
      setProg('Per-circuit: tracing WASM (1 prove)…');
      const wr = await (window as any).runChonkWebGpuTrace(flow, { webgpu: false });
      lastWasmTraceMs = wr.proveMs;
      if (wr.perCircuit?.length) {
        lastWasmPerCircuit = wr.perCircuit;
        lastWasmPhases = wr.phases;
        renderPerCircuit();
        renderPhases();
        append(
          `  ✓ WASM traced prove=${fmtMs(wr.proveMs)} verified=${wr.verified} (${wr.perCircuit.length} circuits)`,
          'ok',
        );
      } else {
        append('  [WARN] WASM per-circuit extraction produced no rows.', 'warn');
      }
      setProg('Per-circuit: tracing WebGPU (1 prove)…');
      const gr = await (window as any).runChonkWebGpuTrace(flow, { webgpu: true });
      if (gr.swiftshaderDetected) {
        append('  [WARN] SwiftShader — WebGPU per-circuit unavailable (the prove would not verify).', 'warn');
      } else if (gr.perCircuit?.length) {
        lastWebgpuTraceMs = gr.proveMs;
        lastWebgpuPerCircuit = gr.perCircuit;
        lastWebgpuPhases = gr.phases;
        renderPerCircuit();
        renderPhases();
        append(
          `  ✓ WebGPU traced prove=${fmtMs(gr.proveMs)} verified=${gr.verified} (${gr.perCircuit.length} circuits)`,
          'ok',
        );
      } else {
        append('  [WARN] WebGPU per-circuit extraction produced no rows.', 'warn');
      }
      append('✓ Per-circuit table updated.', 'ok');
    } catch (err) {
      append(`[ERR] per-circuit: ${err instanceof Error ? err.message : String(err)}`, 'err');
      console.error(err);
    } finally {
      setBusy(false);
    }
  });

  clearLog.addEventListener('click', () => {
    log.innerHTML = '';
  });

  renderPerCircuit(); // show the empty per-circuit table from the start
  renderPhases(); // show the empty phase-breakdown table from the start
  status.textContent = 'ready — Run WASM / Run WebGPU / Run WebGPU (batch), N× each (median)';
}

(window as any).setupChonkWebGpuPage = setupChonkWebGpuPage;

/**
 * Headless autorun entry point for remote real-device benchmarking (BrowserStack
 * and equivalents). A remote device can only navigate to a URL — it can't be
 * driven by `page.evaluate` like the local Puppeteer harness — so when the page
 * is opened with `?autorun=chonk-bench`, this runs the Chonk prove on load and
 * POSTs progress heartbeats plus a final result row to the serving host
 * (scripts/serve-chonk-webgpu.mjs appends them as JSONL to CHONK_PROGRESS_FILE /
 * CHONK_RESULTS_FILE, which the runner tails).
 *
 * Query params:
 *   autorun  gate; any truthy value enables autorun (canonical value `chonk-bench`).
 *   flow     pinned flow name (default: the canonical ecdsar1 transfer).
 *   mode     `off-on` (default, off-vs-on comparison) | `on-only` | `off-only`.
 *   target   opaque label echoed back into every row (the runner's preset key).
 *
 * The result row is normalised to { state, mode, adapter, swiftshaderDetected,
 * off?, on?, vksMatch? } so the runner/report read consistent fields across modes.
 * Everything is wrapped in try/catch: a device OOM / WebGPU crash still POSTs a
 * `state:"error"` row instead of stalling the remote watchdog into a blind timeout.
 */
async function maybeAutorunChonkBench(): Promise<void> {
  const params = new URLSearchParams(location.search);
  if (!params.get('autorun')) {
    return;
  }
  const flow = params.get('flow') || 'ecdsar1+transfer_1_recursions+sponsored_fpc';
  const mode = (params.get('mode') || 'off-on') as 'off-on' | 'on-only' | 'off-only';
  const target = params.get('target') || '';
  const runId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `run-${performance.now()}-${Math.floor(performance.now() * 1000) % 1000000}`;

  // Best-effort JSONL sink POST — a sink hiccup must never abort the bench.
  const post = (path: string, payload: Record<string, unknown>): void => {
    void fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, ts: new Date().toISOString(), target, flow, ...payload }),
    }).catch(() => {});
  };
  const progress = (phase: string, pct: number): void => post('/progress', { phase, pct });

  // Time-based heartbeat so the remote idle/stall watchdogs never trip during a
  // multi-minute prove. The page main thread is free while proving (bb.js proves
  // in workers), so the interval keeps firing.
  const heartbeat = window.setInterval(() => progress('proving', -1), 7000);

  try {
    progress('loaded', 0);
    logger.info(`[autorun] runId=${runId} flow=${flow} mode=${mode} target=${target || '(none)'}`);

    progress('proving-off', 10);
    let row: Record<string, unknown>;
    if (mode === 'off-on') {
      const r = await runChonkWebGpuBench(flow);
      row = {
        adapter: r.adapter,
        swiftshaderDetected: r.swiftshaderDetected,
        numCreatorApps: r.numCreatorApps,
        off: r.off,
        on: r.on,
        vksMatch: r.vksMatch,
      };
    } else if (mode === 'on-only') {
      const r = await runChonkSingleMode('webgpu', flow);
      row = { adapter: r.adapter, swiftshaderDetected: /swiftshader/i.test(r.adapter), on: r.result };
    } else {
      const r = await runChonkSingleMode('wasm', flow);
      row = { adapter: r.adapter, swiftshaderDetected: false, off: r.result };
    }
    progress('done', 100);

    clearInterval(heartbeat);
    post('/results', { state: 'done', mode, ...row });
    logger.info(`[autorun] done runId=${runId}`);
  } catch (e) {
    clearInterval(heartbeat);
    const error = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
    post('/results', { state: 'error', mode, error });
    logger.error(`[autorun] error runId=${runId}: ${error}`);
  }
}

(window as any).maybeAutorunChonkBench = maybeAutorunChonkBench;

// Kick off the headless autorun once the DOM is ready. No-ops unless the page was
// opened with `?autorun=…`, so the interactive page and the Puppeteer test.html
// (driven by page.evaluate, no autorun param) are unaffected.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void maybeAutorunChonkBench());
} else {
  void maybeAutorunChonkBench();
}

// Function to set up the output element and redirect all console output
function setupConsoleOutput() {
  const container = document.createElement('div');
  container.style.marginBottom = '10px';
  document.body.appendChild(container);

  const copyButton = document.createElement('button');
  copyButton.innerText = 'Copy Logs to Clipboard';
  copyButton.style.marginBottom = '10px';
  copyButton.addEventListener('click', () => {
    const logContent = logContainer.textContent || ''; // Get text content of log container
    navigator.clipboard
      .writeText(logContent)
      .then(() => {
        alert('Logs copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy logs:', err);
      });
  });
  container.appendChild(copyButton);

  const logContainer = document.createElement('pre');
  logContainer.id = 'logOutput';
  logContainer.style.border = '1px solid #ccc';
  logContainer.style.padding = '10px';
  logContainer.style.maxHeight = '400px';
  logContainer.style.overflowY = 'auto';
  container.appendChild(logContainer);

  // Helper to append messages to logContainer
  function addLogMessage(message: string) {
    logContainer.textContent += message + '\n';
    logContainer.scrollTop = logContainer.scrollHeight; // Auto-scroll to the bottom
  }

  // Override console methods to output clean logs
  const originalLog = console.log;
  const originalDebug = console.debug;

  console.log = (...args: any[]) => {
    const message = args
      .map(arg =>
        typeof arg === 'string'
          ? arg
              .replace(/%c/g, '')
              .replace(/color:.*?(;|$)/g, '')
              .trim()
          : arg,
      )
      .join(' ');
    originalLog.apply(console, args); // Keep original behavior
    addLogMessage(message);
  };

  console.debug = (...args: any[]) => {
    const message = args
      .map(arg =>
        typeof arg === 'string'
          ? arg
              .replace(/%c/g, '')
              .replace(/color:.*?(;|$)/g, '')
              .trim()
          : arg,
      )
      .join(' ');
    originalDebug.apply(console, args); // Keep original behavior
    addLogMessage(message);
  };
}

// Only set up the interactive UI if this is not being used for automated testing
if (!document.getElementById('status')) {
  document.addEventListener('DOMContentLoaded', function () {
    setupConsoleOutput(); // Initialize console output capture

    // WebGPU on/off ChonkApi::prove benchmark on the pinned ECDSA-r1
    // transfer flow. Mirrors chonk_browser_webgpu_bench.test.ts; the
    // interactive entry point is useful for visually validating that
    // the GPU path actually runs (DevTools "WebGPU" panel; performance
    // ratios in the log). The msgpack of pinned inputs is served at
    // /ivc-inputs/<flow>.msgpack by the harness (see the test).
    const benchButton = document.createElement('button');
    benchButton.innerText = 'Run WebGPU Benchmark (ecdsar1 transfer)';
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    benchButton.addEventListener('click', async () => {
      const result = await runChonkWebGpuBench();
      const speedup = (result.off.proveMs / result.on.proveMs).toFixed(2);
      logger.info(
        `[bench] summary: flow=${result.flow} off=${result.off.proveMs.toFixed(0)}ms ` +
          `on=${result.on.proveMs.toFixed(0)}ms speedup=${speedup}x vks_match=${result.vksMatch}`,
      );
    });
    document.body.appendChild(benchButton);
  });
}
