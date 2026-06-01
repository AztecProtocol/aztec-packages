import { AztecClientBackend, Barretenberg } from '@aztec/bb.js';
import { createLogger } from '@aztec/foundation/log';

import { Unpackr } from 'msgpackr';
import { ungzip } from 'pako';

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
): Promise<{ result: ChonkWebGpuBenchRunResult; vk: Uint8Array }> {
  // Capture the [msm-phase-total] line that bb.emitMsmPhase() makes the C++
  // accumulator log, so we can report the exact cumulative MSM-phase wall time
  // for this run. Wrap whatever base logger the caller wants.
  let msmPhaseMs = 0;
  const baseLog = loggerOverride ?? ((m: string) => logger.info(m));
  const capturingLog = (m: string): void => {
    const mt = /\[msm-phase-total\]\s+ms=([\d.]+)/.exec(m);
    if (mt) {
      msmPhaseMs = parseFloat(mt[1]);
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
    webgpuMsmBlocklist,
  });
  try {
    const backend = new AztecClientBackend(bytecodes, bb, functionNames);
    const t0 = performance.now();
    const { proof, vk } = await backend.prove(witnessStack, vks);
    const proveMs = performance.now() - t0;

    // Emit the cumulative MSM-phase wall time accrued during prove (the fresh
    // WASM instance starts the accumulator at 0). Emitted before verify so it
    // reflects the prove only; the [msm-phase-total] line arrives via the logger
    // proxy and is read into the result below (after verify, so it has landed).
    await bb.emitMsmPhase();

    const t1 = performance.now();
    const verified = await backend.verify(proof, vk);
    const verifyMs = performance.now() - t1;

    return {
      result: { proveMs, verifyMs, verified, proofLength: proof.length, msmPhaseMs },
      vk,
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
      on: { proveMs: 0, verifyMs: 0, verified: false, proofLength: 0 },
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

const DEFAULT_WEBGPU_BLOCKLIST: readonly string[] = [
  // Pair-tree-hostile distributions (block all sizes).
  'LOOKUP_READ_COUNTS',
  'LOOKUP_READ_TAGS',
  'VK_PRECOMPUTED_POLY',
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

// Blocklist used by the "Run WebGPU (batch)" button: the solo list with
// the 10 translator @131071 entries removed so the B=10 batch reaches the
// bridge and routes through BatchMsmV2. Keeps every other entry — the
// label-only blocks (LOOKUP_READ_*, VK_PRECOMPUTED_POLY) and the B=3
// W_L/W_R/W_O `@N` blocks are independent of BatchMsmV2 and still apply
// (B=3 doesn't qualify for the BatchMsmV2 route at chonk sizes anyway).
const TRANSLATOR_BLOCK_SET: ReadonlySet<string> = new Set<string>(TRANSLATOR_RANGE_CONSTRAINT_BLOCK_ENTRIES);
const DEFAULT_WEBGPU_BLOCKLIST_BATCH: readonly string[] = DEFAULT_WEBGPU_BLOCKLIST.filter(
  e => !TRANSLATOR_BLOCK_SET.has(e),
);

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
  return { flow, mode, adapter: adapterInfo, blocklist, result, vk, gpuPhase, traceJson };
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
  const t0 = all.length ? Math.min(...all.map(s => s.startMs)) : 0;
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

(window as any).runChonkSingleMode = runChonkSingleMode;

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
  //         maxbucket=42 p99bucket=28 mean_nonzero_bucket=2.71`.
  // One regex per field — verbose but trivially extensible when we add new
  // stats (e.g. distinct-value count) later.
  const re =
    /\[msm-dist\]\s+name=(\S+)\s+n=(\d+)\s+nnz=(\d+)\s+density=([\d.]+)\s+c=(\d+)\s+maxbucket=(\d+)\s+p99bucket=(\d+)\s+mean_nonzero_bucket=([\d.]+)/;
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
      maxbucket: parseInt(m[6], 10),
      p99bucket: parseInt(m[7], 10),
      mean_nonzero_bucket: parseFloat(m[8]),
    });
  }

  const header = 'seq,name,n,nnz,density,c,maxbucket,p99bucket,mean_nonzero_bucket\n';
  const body = rows
    .map(
      r =>
        `${r.seq},${r.name},${r.n},${r.nnz},${r.density.toFixed(6)},${r.c},${r.maxbucket},` +
        `${r.p99bucket},${r.mean_nonzero_bucket.toFixed(2)}`,
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
  const runMsmCsv = $<HTMLButtonElement>('run-msmcsv');
  const clearLog = $<HTMLButtonElement>('clear-log');
  const flowSel = $<HTMLSelectElement>('flow');
  // Optional — absent on the minimal Puppeteer harness pages, so it's looked up
  // outside the mandatory-elements guard below. When checked, the WebGPU run
  // captures an aligned CPU+GPU Perfetto trace from the bridge and POSTs it.
  const traceWebgpu = $<HTMLInputElement>('trace-webgpu');

  if (
    !status ||
    !adapter ||
    !sab ||
    !log ||
    !runWasm ||
    !runWebgpu ||
    !runWebgpuBatch ||
    !runMsmCsv ||
    !clearLog ||
    !flowSel
  ) {
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
    sab.style.color = '#cf222e';
  }

  // GPU adapter probe — same shape as the bench functions use.
  (async () => {
    if (!('gpu' in navigator)) {
      adapter.textContent = 'WebGPU not exposed by navigator.gpu';
      adapter.style.color = '#cf222e';
      return;
    }
    try {
      const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!a) {
        adapter.textContent = 'requestAdapter returned null';
        adapter.style.color = '#cf222e';
        return;
      }
      const info = (a as any).info ?? (await (a as any).requestAdapterInfo?.());
      adapter.textContent = info
        ? `${info.vendor ?? '?'} / ${info.architecture ?? '?'} / ${info.device ?? '?'} / ${info.description ?? '?'}`
        : 'unknown';
      if (/swiftshader/i.test(adapter.textContent ?? '')) {
        adapter.style.color = '#9a6700';
      }
    } catch (err) {
      adapter.textContent = `error: ${err instanceof Error ? err.message : String(err)}`;
      adapter.style.color = '#cf222e';
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
  const setBusy = (busy: boolean): void => {
    runWasm.disabled = busy;
    runWebgpu.disabled = busy;
    runWebgpuBatch.disabled = busy;
    runMsmCsv.disabled = busy;
    status.textContent = busy ? 'running…' : 'idle';
  };
  // Generic vs-baseline ratio printer (e.g. "1.12× vs WebGPU solo (faster)").
  // Hidden when baseline is missing — the card just shows the WASM ratio.
  const setRatio = (id: string, faster: number, baseline: number | undefined, label: string): void => {
    const el = $(id);
    if (!el) return;
    if (!baseline) {
      el.textContent = '';
      el.className = 'speedup';
      return;
    }
    const ratio = baseline / faster;
    el.textContent =
      ratio >= 1 ? `${ratio.toFixed(2)}× vs ${label} (faster)` : `${(1 / ratio).toFixed(2)}× vs ${label} (slower)`;
    el.className = ratio >= 1 ? 'speedup up' : 'speedup down';
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

  // The WASM baseline VK + prove time, kept across clicks so the WebGPU run can
  // report a speedup and a VK byte-equality check against it. A matching VK is
  // the gold-standard correctness signal: it proves the GPU-delegated MSMs
  // produced the same commitments as the all-CPU path.
  let lastWasmVk: Uint8Array | undefined;
  let lastWasmProveMs: number | undefined;
  let lastWasmMsmPhaseMs: number | undefined;
  // Tracked separately so the batch card can show a "vs solo" speedup —
  // the actionable signal for the production routing decision (does
  // shipping BatchMsmV2 for same-N batches in the chonk flow actually
  // beat the existing serial-solo bridge fallback).
  let lastWebgpuSoloProveMs: number | undefined;
  let lastWebgpuSoloMsmPhaseMs: number | undefined;

  runWasm.addEventListener('click', async () => {
    setBusy(true);
    try {
      const flow = flowSel.value;
      const wantTrace = !!traceWebgpu?.checked;
      append(`▶ Run WASM (multi-threaded, no GPU) on flow=${flow}`, 'info');
      if (wantTrace) {
        append(
          '  ⏺ Perfetto trace capture ON — emits a prove-relative [msm-span] per MSM batch (negligible cost).',
          'info',
        );
      }
      setText('wasm-prove-big', '…');
      const { result, vk, traceJson } = await (window as any).runChonkSingleMode('wasm', flow, wantTrace);
      lastWasmVk = vk;
      lastWasmProveMs = result.proveMs;
      lastWasmMsmPhaseMs = result.msmPhaseMs;
      setText('wasm-prove', fmtMs(result.proveMs));
      setText('wasm-verify', fmtMs(result.verifyMs));
      setText('wasm-prove-big', fmtMs(result.proveMs));
      setPill('wasm-verified', result.verified ? 'ok' : 'fail', `verified: ${result.verified}`);
      append(
        `✓ WASM: prove=${fmtMs(result.proveMs)} verify=${fmtMs(result.verifyMs)} ` +
          `MSM-phase=${fmtMs(result.msmPhaseMs)} verified=${result.verified}`,
        result.verified ? 'ok' : 'err',
      );
      if (wantTrace) {
        if (traceJson) {
          await postTrace(traceJson, 'chonk-trace-wasm.json', 'WASM MSM timeline');
        } else {
          append(
            '[WARN] no WASM trace captured — no [msm-span] lines (is the WASM built with the trace export?).',
            'warn',
          );
        }
      }
    } catch (err) {
      setText('wasm-prove-big', '✗');
      setPill('wasm-verified', 'fail', 'verified: error');
      append(`[ERR] WASM run: ${err instanceof Error ? err.message : String(err)}`, 'err');
      console.error(err);
    } finally {
      setBusy(false);
    }
  });

  runWebgpu.addEventListener('click', async () => {
    setBusy(true);
    try {
      const flow = flowSel.value;
      append(`▶ Run WebGPU (89 MSMs delegated, block-list applied) on flow=${flow}`, 'info');
      setText('webgpu-prove-big', '…');
      const win = window as any;
      const wantTrace = !!traceWebgpu?.checked;
      if (wantTrace) {
        win.__bridge_trace_reset?.();
        win.__bridge_trace_on = true;
        append(
          '  ⏺ Perfetto trace capture ON — adds per-batch GPU timestamp readback, so this run\'s prove time is slightly inflated.',
          'info',
        );
      }
      let runOut: any;
      try {
        runOut = await win.runChonkSingleMode('webgpu', flow);
      } finally {
        if (wantTrace) win.__bridge_trace_on = false;
      }
      const { result, vk, adapter: adp, gpuPhase } = runOut;
      append(`  GPU adapter: ${adp}`, 'info');
      lastWebgpuSoloProveMs = result.proveMs;
      lastWebgpuSoloMsmPhaseMs = result.msmPhaseMs;
      setText('webgpu-prove', fmtMs(result.proveMs));
      setText('webgpu-verify', fmtMs(result.verifyMs));
      setText('webgpu-prove-big', fmtMs(result.proveMs));
      setPill('webgpu-verified', result.verified ? 'ok' : 'fail', `verified: ${result.verified}`);
      if (lastWasmProveMs) {
        setSpeedup('webgpu-speedup', result.proveMs, lastWasmProveMs);
      }
      if (lastWasmVk) {
        const match = lastWasmVk.length === vk.length && lastWasmVk.every((b: number, i: number) => b === vk[i]);
        setPill('webgpu-vkmatch', match ? 'ok' : 'fail', match ? 'vk vs WASM: match' : 'vk vs WASM: MISMATCH');
      } else {
        setPill('webgpu-vkmatch', 'skip', 'vk vs WASM: run WASM first');
      }
      append(
        `✓ WebGPU: prove=${fmtMs(result.proveMs)} verify=${fmtMs(result.verifyMs)} ` +
          `MSM-phase=${fmtMs(result.msmPhaseMs)} verified=${result.verified}`,
        result.verified ? 'ok' : 'err',
      );
      if (lastWasmMsmPhaseMs) {
        append(
          `  MSM phase: WASM=${fmtMs(lastWasmMsmPhaseMs)} vs GPU=${fmtMs(result.msmPhaseMs)} ` +
            `(GPU saves ${fmtMs(lastWasmMsmPhaseMs - result.msmPhaseMs)})`,
          'ok',
        );
      }
      if (gpuPhase) {
        const g = gpuPhase;
        append(
          `  GPU phase breakdown — prepare: mixed=${g.mixedPrepareMs.toFixed(0)}ms + same-n=${g.sameNPrepareMs.toFixed(0)}ms | ` +
            `GPU compute(mixed,timestamp)=${g.mixedGpuComputeMs.toFixed(0)}ms | ` +
            `same-n gpu_wait=${g.sameNGpuWaitMs.toFixed(0)}ms (wall, upper bound) | ` +
            `encode=${(g.mixedEncodeMs + g.sameNEncodeMs).toFixed(0)}ms submit/map=${(g.mixedSubmitWaitMs + g.sameNMapAsyncMs).toFixed(0)}ms`,
          'info',
        );
        // POST the structured breakdown to the box for report generation.
        try {
          const r = await fetch('/msm-phase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              flow,
              adapter: adp,
              proveMs: result.proveMs,
              gpuPhase: g,
              wasmMsmPhaseMs: lastWasmMsmPhaseMs ?? null,
            }),
          });
          const j = await r.json().catch(() => ({}));
          append(
            r.ok ? `✓ phase breakdown saved → ${j.path ?? '/msm-phase'}` : `[WARN] phase POST status ${r.status}`,
            r.ok ? 'ok' : 'warn',
          );
        } catch (e) {
          append(`[WARN] phase POST failed: ${e instanceof Error ? e.message : String(e)}`, 'warn');
          console.log(JSON.stringify(g));
        }
      }
      if (wantTrace) {
        const json: string | undefined = win.__bridge_trace_build?.();
        const counts = win.__bridge_trace_counts?.() as { cpu: number; gpu: number } | undefined;
        if (json && counts && counts.cpu + counts.gpu > 0) {
          await postTrace(json, 'chonk-trace-webgpu.json', `${counts.cpu} cpu + ${counts.gpu} gpu spans`);
        } else {
          append(
            '[WARN] no trace captured — the WebGPU bridge module did not record any spans ' +
              '(was WebGPU actually delegating MSMs?).',
            'warn',
          );
        }
      }
    } catch (err) {
      setText('webgpu-prove-big', '✗');
      setPill('webgpu-verified', 'fail', 'verified: error');
      append(`[ERR] WebGPU run: ${err instanceof Error ? err.message : String(err)}`, 'err');
      console.error(err);
    } finally {
      setBusy(false);
    }
  });

  // WebGPU (batch) — same prove flow as the solo button, but the bridge's
  // same-N collision path routes uniform B ≥ 4 batches at n ≤ 2^17 through
  // BatchMsmV2 (the Tier 2 virtualised B·W-window dispatch — see
  // barretenberg/ts/src/msm_webgpu/BATCH_MSM_DESIGN.md). The flag is set
  // for the duration of the run only so it doesn't leak into any later
  // solo run; if it's not set the bridge falls back to the existing
  // per-MSM-submit fallback (byte-identical to the solo button).
  runWebgpuBatch.addEventListener('click', async () => {
    setBusy(true);
    try {
      const flow = flowSel.value;
      append(
        `▶ Run WebGPU (batch) on flow=${flow} — same-N B≥4 batches at n≤2^17 route through BatchMsmV2. ` +
          `Blocklist drops the 10 translator @131071 entries (re-enabled vs solo) so the B=10 ` +
          `range-constraint batch reaches the bridge.`,
        'info',
      );
      setText('webgpu-batch-prove-big', '…');
      const win = window as any;
      win.__bridge_batch_enabled = true;
      let runOut: any;
      try {
        runOut = await win.runChonkSingleMode('webgpu', flow, /*trace=*/ false, DEFAULT_WEBGPU_BLOCKLIST_BATCH);
      } finally {
        win.__bridge_batch_enabled = false;
      }
      const { result, vk, adapter: adp, gpuPhase } = runOut;
      append(`  GPU adapter: ${adp}`, 'info');
      setText('webgpu-batch-prove', fmtMs(result.proveMs));
      setText('webgpu-batch-verify', fmtMs(result.verifyMs));
      setText('webgpu-batch-prove-big', fmtMs(result.proveMs));
      setPill('webgpu-batch-verified', result.verified ? 'ok' : 'fail', `verified: ${result.verified}`);
      if (lastWasmProveMs) {
        setSpeedup('webgpu-batch-speedup', result.proveMs, lastWasmProveMs);
      }
      setRatio('webgpu-batch-vs-solo', result.proveMs, lastWebgpuSoloProveMs, 'WebGPU solo');
      if (lastWasmVk) {
        const match = lastWasmVk.length === vk.length && lastWasmVk.every((b: number, i: number) => b === vk[i]);
        setPill(
          'webgpu-batch-vkmatch',
          match ? 'ok' : 'fail',
          match ? 'vk vs WASM: match' : 'vk vs WASM: MISMATCH',
        );
        if (!match) {
          // VK mismatch is a correctness regression — log loudly. If the
          // batch route produced byte-identical commitments to the solo
          // path (which the existing WebGPU button verifies against WASM),
          // this can only mean BatchMsmV2 diverged for some same-N batch.
          append(
            '[ERR] BatchMsmV2 produced a VK that does not match the WASM baseline — same-N batched result diverges from solo!',
            'err',
          );
        }
      } else {
        setPill('webgpu-batch-vkmatch', 'skip', 'vk vs WASM: run WASM first');
      }
      append(
        `✓ WebGPU (batch): prove=${fmtMs(result.proveMs)} verify=${fmtMs(result.verifyMs)} ` +
          `MSM-phase=${fmtMs(result.msmPhaseMs)} verified=${result.verified}`,
        result.verified ? 'ok' : 'err',
      );
      if (lastWebgpuSoloProveMs) {
        const ratio = lastWebgpuSoloProveMs / result.proveMs;
        const dir = ratio >= 1 ? 'faster' : 'slower';
        append(
          `  vs solo: prove ${ratio.toFixed(2)}× ${dir} (solo=${fmtMs(lastWebgpuSoloProveMs)} → batch=${fmtMs(result.proveMs)})`,
          ratio >= 1 ? 'ok' : 'warn',
        );
        if (lastWebgpuSoloMsmPhaseMs) {
          append(
            `  MSM phase vs solo: solo=${fmtMs(lastWebgpuSoloMsmPhaseMs)} → batch=${fmtMs(result.msmPhaseMs)} ` +
              `(${(lastWebgpuSoloMsmPhaseMs / result.msmPhaseMs).toFixed(2)}× faster)`,
            'info',
          );
        }
      }
      if (lastWasmMsmPhaseMs) {
        append(
          `  MSM phase: WASM=${fmtMs(lastWasmMsmPhaseMs)} vs GPU(batch)=${fmtMs(result.msmPhaseMs)} ` +
            `(GPU saves ${fmtMs(lastWasmMsmPhaseMs - result.msmPhaseMs)})`,
          'ok',
        );
      }
      if (gpuPhase) {
        const g = gpuPhase;
        append(
          `  GPU phase breakdown — prepare: mixed=${g.mixedPrepareMs.toFixed(0)}ms + same-n=${g.sameNPrepareMs.toFixed(0)}ms | ` +
            `GPU compute(mixed,timestamp)=${g.mixedGpuComputeMs.toFixed(0)}ms | ` +
            `same-n gpu_wait=${g.sameNGpuWaitMs.toFixed(0)}ms (incl. BatchMsmV2 batches) | ` +
            `encode=${(g.mixedEncodeMs + g.sameNEncodeMs).toFixed(0)}ms submit/map=${(g.mixedSubmitWaitMs + g.sameNMapAsyncMs).toFixed(0)}ms`,
          'info',
        );
        try {
          const r = await fetch('/msm-phase?name=chonk-msm-phase-batch.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              flow,
              adapter: adp,
              proveMs: result.proveMs,
              gpuPhase: g,
              wasmMsmPhaseMs: lastWasmMsmPhaseMs ?? null,
              soloProveMs: lastWebgpuSoloProveMs ?? null,
              soloMsmPhaseMs: lastWebgpuSoloMsmPhaseMs ?? null,
              route: 'webgpu-batch',
            }),
          });
          const j = await r.json().catch(() => ({}));
          append(
            r.ok ? `✓ phase breakdown saved → ${j.path ?? '/msm-phase'}` : `[WARN] phase POST status ${r.status}`,
            r.ok ? 'ok' : 'warn',
          );
        } catch (e) {
          append(`[WARN] phase POST failed: ${e instanceof Error ? e.message : String(e)}`, 'warn');
          console.log(JSON.stringify(g));
        }
      }
    } catch (err) {
      setText('webgpu-batch-prove-big', '✗');
      setPill('webgpu-batch-verified', 'fail', 'verified: error');
      append(`[ERR] WebGPU (batch) run: ${err instanceof Error ? err.message : String(err)}`, 'err');
      console.error(err);
    } finally {
      setBusy(false);
    }
  });

  runMsmCsv.addEventListener('click', async () => {
    setBusy(true);
    try {
      const flow = flowSel.value;
      append(`▶ Per-MSM CPU-vs-GPU measurement on flow=${flow} (CPU-solo + GPU-batched, ~2 proves)`, 'info');
      const res = await (window as any).runChonkMsmCsv(flow);
      append(
        `  rows=${res.rowCount} delegated(gpu)=${res.gpuOnly} cpu-only=${res.cpuOnly} adapter=${res.adapter}`,
        'info',
      );
      // POST the CSV back to the server so it lands on the box for report
      // generation (avoids copy-pasting hundreds of rows).
      try {
        const r = await fetch('/msm-csv', { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: res.csv });
        const j = await r.json().catch(() => ({}));
        append(
          r.ok
            ? `✓ CSV saved on server: ${j.bytes ?? '?'} bytes → ${j.path ?? '/msm-csv'}`
            : `[WARN] server did not save CSV (status ${r.status})`,
          r.ok ? 'ok' : 'warn',
        );
      } catch (e) {
        append(
          `[WARN] POST /msm-csv failed: ${e instanceof Error ? e.message : String(e)} — full CSV dumped to console`,
          'warn',
        );
        console.log(res.csv);
      }
    } catch (err) {
      append(`[ERR] per-MSM CSV run: ${err instanceof Error ? err.message : String(err)}`, 'err');
      console.error(err);
    } finally {
      setBusy(false);
    }
  });

  clearLog.addEventListener('click', () => {
    log.innerHTML = '';
  });

  status.textContent = 'ready — Run WASM / Run WebGPU (solo) / Run WebGPU (batch) / Per-MSM CPU vs GPU';
}

(window as any).setupChonkWebGpuPage = setupChonkWebGpuPage;

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
