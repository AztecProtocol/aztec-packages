/** Runs the proving bench off the main thread because wasm threads use Atomics.wait. */

import { Decoder } from 'msgpackr';
import { ungzip } from 'pako';
import { BarretenbergMain, ChonkStep } from './runtime/main.js';

const DEFAULT_SRS_POINTS = 1 << 20;
const GRUMPKIN_SRS_POINTS = 1 << 16;

interface RunResult {
  run: number;
  flow: string;
  proveError?: string;
  inputBytes: number;
  decodedInputBytes: number;
  configuredThreads: number;
  phases: Record<string, number>;
  proveMs: number;
  setupMs: number;
  wallMs: number;
  proofFieldCount: number | null;
  benchDump: unknown;
  traceBytes: number;
  hadTrace: boolean;
}

interface BenchStartMessage {
  kind: 'start';
  benchmark?: string;
  flow: string;
  runs: number;
  threads: number;
  threadsSource?: 'auto' | 'override';
  trace: boolean;
  smoke?: boolean;
  memMaxPages?: number;
  features: Record<string, unknown>;
  pageTimings?: Record<string, unknown>;
}

interface RawStep {
  bytecode: Uint8Array;
  witness: Uint8Array;
  vk: Uint8Array;
  functionName: string;
}

interface CrsIndex {
  g1: { path: string; bytesPerPoint: number; size: number };
  g2: { path: string; size: number };
  grumpkinG1: { path: string; bytesPerPoint: number; size: number };
}

let lastStatus: any = null;
const recentLogs: string[] = [];
function writeStatus(payload: unknown) {
  lastStatus = payload;
  (self as any).postMessage({ kind: 'status', payload });
}
function pushLog(msg: string) {
  recentLogs.push(msg);
  if (recentLogs.length > 240) recentLogs.shift();
  (self as any).postMessage({ kind: 'log', msg });
}

let progressMeta: { flow: string; runIdx: number; threads: number; trace: boolean } | null = null;
let memMaxPagesGlobal: number | null = null;
const benchStart = performance.now();
let lastPhase: string | null = null;
let lastPhaseStart = benchStart;

function emitProgress(
  phase: string,
  opts: { final?: boolean; error?: string; updatePhase?: boolean; details?: Record<string, unknown> } = {},
) {
  const now = performance.now();
  const elapsedMs = now - benchStart;
  const phaseMs = now - lastPhaseStart;
  const updatePhase = opts.updatePhase ?? true;
  const record = {
    kind: 'progress' as const,
    source: 'worker' as const,
    phase,
    prevPhase: lastPhase,
    phaseMs,
    elapsedMs,
    timestamp: new Date().toISOString(),
    flow: progressMeta?.flow ?? null,
    run: progressMeta?.runIdx ?? null,
    threads: progressMeta?.threads ?? null,
    trace: progressMeta?.trace ?? null,
    recentLogs: recentLogs.slice(-12),
    final: opts.final ?? false,
    error: opts.error,
    details: opts.details ?? {},
  };
  // Fire-and-forget; never await — we don't want to slow the bench down with network IO.
  void fetch('/progress', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    keepalive: true,
    body: JSON.stringify(record),
  }).catch(() => {});
  (self as any).postMessage({ kind: 'progress', payload: record });
  if (updatePhase) {
    lastPhase = phase;
    lastPhaseStart = now;
  }
}

const HEARTBEAT_MS = 5_000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    if (!lastPhase) return;
    emitProgress(`heartbeat:${lastPhase}`, { updatePhase: false });
  }, HEARTBEAT_MS);
}
function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

async function fetchCrsIndex(): Promise<CrsIndex> {
  const res = await fetch('/crs/index.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`fetch CRS index: HTTP ${res.status}`);
  return (await res.json()) as CrsIndex;
}

async function fetchCrsRange(path: string, nBytes: number): Promise<Uint8Array> {
  const init: RequestInit = nBytes > 0
    ? { headers: { Range: `bytes=0-${nBytes - 1}` }, cache: 'force-cache' }
    : { cache: 'force-cache' };
  const res = await fetch(path, init);
  if (!res.ok && res.status !== 206) throw new Error(`fetch ${path}: HTTP ${res.status}`);
  if (nBytes > 0 && res.status !== 206) {
    throw new Error(`fetch ${path}: expected HTTP 206 for ${nBytes}-byte range, got HTTP ${res.status}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (nBytes > 0 && bytes.byteLength !== nBytes) {
    throw new Error(`fetch ${path}: expected ${nBytes} bytes, got ${bytes.byteLength}`);
  }
  return bytes;
}

async function fetchWasmModule(): Promise<{
  module: WebAssembly.Module;
  timings: {
    fetchWasmMs: number;
    fetchWasmHeadersMs: number;
    compileStreamingMs: number;
    wasmGzipBytes: number;
    wasmBytes: number;
    compileWasmMs: number;
  };
}> {
  const startedAt = performance.now();
  emitProgress('fetch_wasm_request');
  const res = await fetch('barretenberg.wasm.gz');
  if (!res.ok) throw new Error(`fetch wasm: ${res.status}`);
  const fetchWasmHeadersMs = performance.now() - startedAt;
  const wasmGzipBytes = Number(res.headers.get('content-length') ?? 0) || 0;
  emitProgress('fetch_wasm_headers', {
    details: {
      gzipBytes: wasmGzipBytes,
      contentEncoding: res.headers.get('content-encoding') ?? '',
      contentType: res.headers.get('content-type') ?? '',
    },
  });

  let module: WebAssembly.Module;
  let wasmBytes = 0;
  let compileStreamingMs = 0;
  let compileWasmMs = 0;
  const compileStartedAt = performance.now();
  try {
    module = await WebAssembly.compileStreaming(Promise.resolve(res));
    compileStreamingMs = performance.now() - compileStartedAt;
    compileWasmMs = compileStreamingMs;
    emitProgress('wasm_compile_streaming_done', { details: { compileStreamingMs } });
  } catch (e) {
    pushLog(`compileStreaming failed, falling back to arrayBuffer compile: ${e instanceof Error ? e.message : e}`);
    const fallbackFetchStartedAt = performance.now();
    const fallbackRes = await fetch('barretenberg.wasm.gz', { cache: 'no-store' });
    if (!fallbackRes.ok) throw new Error(`fallback fetch wasm: ${fallbackRes.status}`);
    const bytes = new Uint8Array(await fallbackRes.arrayBuffer());
    wasmBytes = bytes.byteLength;
    emitProgress('fetch_wasm_body_done', { details: { wasmBytes } });
    const fallbackCompileStartedAt = performance.now();
    module = await WebAssembly.compile(bytes);
    compileWasmMs = performance.now() - fallbackCompileStartedAt;
    emitProgress('wasm_compiled', {
      details: { compileWasmMs, fallbackFetchMs: performance.now() - fallbackFetchStartedAt },
    });
  }
  return {
    module,
    timings: {
      fetchWasmMs: performance.now() - startedAt,
      fetchWasmHeadersMs,
      compileStreamingMs,
      wasmGzipBytes,
      wasmBytes,
      compileWasmMs,
    },
  };
}

function decodeInputSteps(ivcBuf: Uint8Array): {
  steps: ChonkStep[];
  timings: Record<string, number>;
  decodedBytes: number;
} {
  const timings: Record<string, number> = {};
  const startedAt = performance.now();
  const rawSteps = new Decoder({ useRecords: false }).unpack(ivcBuf) as RawStep[];
  timings.inputMsgpackDecodeMs = performance.now() - startedAt;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    throw new Error('ivc-inputs.msgpack contained no execution steps');
  }

  const inflateStartedAt = performance.now();
  let decodedBytes = 0;
  const steps = rawSteps.map((step, i) => {
    const bytecode = ungzip(step.bytecode);
    const witness = ungzip(step.witness);
    decodedBytes += bytecode.byteLength + witness.byteLength + (step.vk?.byteLength ?? 0);
    return {
      functionName: step.functionName || `circuit_${i}`,
      bytecode,
      witness,
      vk: step.vk ?? new Uint8Array(),
    };
  });
  timings.inputInflateMs = performance.now() - inflateStartedAt;
  timings.inputDecodeMs = performance.now() - startedAt;
  return { steps, timings, decodedBytes };
}

async function runOne(
  module: WebAssembly.Module,
  steps: ChonkStep[],
  inputBytes: number,
  decodedInputBytes: number,
  flow: string,
  runIdx: number,
  threads: number,
  trace: boolean,
): Promise<RunResult> {
  const phases: Record<string, number> = {};
  const wallStart = performance.now();
  progressMeta = { flow, runIdx, threads, trace };

  let mark = wallStart;
  const tick = (label: string) => {
    const now = performance.now();
    phases[label] = (phases[label] ?? 0) + (now - mark);
    mark = now;
    emitProgress(label);
  };
  emitProgress(`run_${runIdx}_start`, { details: { run: runIdx, threads, trace } });

  let bb: BarretenbergMain | undefined;
  let proveError: string | undefined;
  let proofFieldCount: number | null = null;
  let setupMs = 0;
  let proveMs = 0;
  let benchDump: unknown = null;
  let traceBytes = 0;
  let hadTrace = false;

  try {
    const memOpts = memMaxPagesGlobal != null ? { memory: { maximum: memMaxPagesGlobal } } : {};
    bb = await BarretenbergMain.create({ module, threads, logger: pushLog, ...memOpts });
    tick('init_wasm');

    emitProgress('fetch_crs_index_start');
    const crs = await fetchCrsIndex();
    emitProgress('fetch_crs_index_done');
    const srsPointsArg = DEFAULT_SRS_POINTS;
    const grumpkinPointsArg = GRUMPKIN_SRS_POINTS;
    emitProgress('fetch_crs_ranges_start', {
      details: {
        g1Bytes: srsPointsArg * crs.g1.bytesPerPoint,
        grumpkinG1Bytes: grumpkinPointsArg * crs.grumpkinG1.bytesPerPoint,
      },
    });
    const [g1Bytes, g2Bytes, grumpkinG1Bytes] = await Promise.all([
      fetchCrsRange(crs.g1.path, srsPointsArg * crs.g1.bytesPerPoint),
      fetchCrsRange(crs.g2.path, 0),
      fetchCrsRange(crs.grumpkinG1.path, grumpkinPointsArg * crs.grumpkinG1.bytesPerPoint),
    ]);
    tick('fetch_crs');

    bb.srsInitSrs(g1Bytes, srsPointsArg, g2Bytes);
    bb.srsInitGrumpkinSrs(grumpkinG1Bytes, grumpkinPointsArg);
    tick('init_srs');

    bb.benchEnableTrace(trace);
    const traceEnabled = trace;
    tick(trace ? 'enable_trace' : 'enable_bench');

    const setupStart = performance.now();
    emitProgress('chonk_setup_start');
    let setupError: string | undefined;
    try {
      const circuits = bb.chonkSetup(steps);
      emitProgress('chonk_setup_circuits', { details: { circuits }, updatePhase: false });
    } catch (e) {
      setupError = e instanceof Error ? e.message : String(e);
      pushLog(`chonk_setup failed: ${setupError}`);
    }
    setupMs = performance.now() - setupStart;
    tick('chonk_setup');

    const proveStart = performance.now();
    emitProgress('chonk_prove_start');
    if (setupError) {
      proveError = `skipped — chonk_setup failed: ${setupError}`;
    } else {
      try {
        proofFieldCount = bb.chonkProve();
        proveMs = performance.now() - proveStart;
      } catch (e) {
        proveMs = performance.now() - proveStart;
        proveError = e instanceof Error ? e.message : String(e);
      }
    }
    tick('chonk_prove');

    if (traceEnabled) {
      try { bb.benchEnableTrace(false); } catch { /* best-effort */ }
    }
    let dump: { aggregate_json: string; trace_events_json: string } | null = null;
    try {
      dump = bb.benchDump({ reset: true, includeTrace: traceEnabled });
    } catch (e) {
      pushLog(`BenchDump failed: ${e instanceof Error ? e.message : e}`);
    }
    tick('bench_dump');
    if (dump?.aggregate_json) {
      try {
        benchDump = JSON.parse(dump.aggregate_json);
      } catch {
        benchDump = { raw: dump.aggregate_json };
      }
    } else if (dump === null) {
      pushLog('BenchDump not supported by this wasm bb build; aggregate omitted.');
    }
    if (traceEnabled && dump?.trace_events_json) {
      traceBytes = dump.trace_events_json.length;
      hadTrace = traceBytes > 0;
      try {
        await fetch('/trace', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ flow, run: runIdx, trace: dump.trace_events_json }),
        });
      } catch (e) {
        pushLog(`trace POST failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      void lastStatus;
    }
  } finally {
    bb?.destroy();
    tick('destroy');
  }

  return {
    run: runIdx,
    flow,
    proveError,
    inputBytes,
    decodedInputBytes,
    configuredThreads: threads,
    phases,
    proveMs,
    setupMs,
    wallMs: performance.now() - wallStart,
    proofFieldCount,
    benchDump,
    traceBytes,
    hadTrace,
  };
}

async function main(msg: BenchStartMessage) {
  const { benchmark, flow, runs, threads, threadsSource, trace, smoke, features, pageTimings } = msg;
  progressMeta = { flow, runIdx: 0, threads, trace };
  if (typeof msg.memMaxPages === 'number' && Number.isFinite(msg.memMaxPages) && msg.memMaxPages > 0) {
    memMaxPagesGlobal = msg.memMaxPages;
  }

  writeStatus({ ok: false, phase: 'fetching-wasm', benchmark, flow, runs, threads, threadsSource, trace, smoke, features });
  const { module, timings: wasmTimings } = await fetchWasmModule();

  writeStatus({ ok: false, phase: 'fetching-inputs', benchmark, flow, runs, threads, threadsSource, trace, smoke, features });
  emitProgress('fetch_inputs_request');
  const fetchInputsStart = performance.now();
  const inputsRes = await fetch(`/inputs/${encodeURIComponent(flow)}/ivc-inputs.msgpack`);
  if (!inputsRes.ok) {
    throw new Error(`inputs fetch failed: ${inputsRes.status}`);
  }
  const ivcBuf = new Uint8Array(await inputsRes.arrayBuffer());
  const fetchInputsMs = performance.now() - fetchInputsStart;
  emitProgress('fetch_inputs_done', { details: { bytes: ivcBuf.byteLength, inputBytes: ivcBuf.byteLength } });
  emitProgress('decode_inputs_start');
  const { steps, timings: inputTimings, decodedBytes } = decodeInputSteps(ivcBuf);
  emitProgress('decode_inputs_done', {
    details: { circuits: steps.length, decodedBytes, ...inputTimings },
  });

  const mainBundle = (pageTimings as any)?.mainBundle;
  const coldStart = {
    mainBundleLoadedMs: mainBundle?.responseEndMs ?? mainBundle?.durationMs ?? null,
    mainBundleTransferSize: mainBundle?.transferSize ?? null,
    mainBundleEncodedBytes: mainBundle?.encodedBodySize ?? null,
    mainBundleDecodedBytes: mainBundle?.decodedBodySize ?? null,
    ...wasmTimings,
    inputBytes: ivcBuf.byteLength,
    inputDecodedBytes: decodedBytes,
    ...inputTimings,
  };

  if (smoke) {
    const payload = {
      ok: true,
      data: {
        benchmark,
        flow,
        smoke: true,
        runs: [],
        preamble: { fetchWasmMs: wasmTimings.fetchWasmMs, fetchInputsMs },
        coldStart,
        threadsConfig: { threads, source: threadsSource ?? 'override' },
        features,
        pageTimings,
      },
    };
    emitProgress('smoke_done', { final: true, details: { smoke: true } });
    writeStatus(payload);
    (self as any).postMessage({ kind: 'result', payload });
    return;
  }

  const results: RunResult[] = [];
  for (let i = 0; i < runs; i++) {
    writeStatus({ ok: false, phase: 'running', benchmark, flow, run: i + 1, runs, threads, threadsSource, trace, smoke, features, results });
    try {
      results.push(await runOne(module, steps, ivcBuf.byteLength, decodedBytes, flow, i + 1, threads, trace));
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      pushLog(`run ${i + 1} threw uncaught: ${err}`);
      results.push({
        run: i + 1,
        flow,
        proveError: err,
        inputBytes: ivcBuf.byteLength,
        decodedInputBytes: decodedBytes,
        configuredThreads: threads,
        phases: {},
        proveMs: 0,
        setupMs: 0,
        wallMs: 0,
        proofFieldCount: null,
        benchDump: null,
        traceBytes: 0,
        hadTrace: false,
      });
    }
  }

  const payload = {
    ok: true,
    data: {
      benchmark,
      flow,
      runs: results,
      preamble: { fetchWasmMs: wasmTimings.fetchWasmMs, fetchInputsMs },
      coldStart,
      threadsConfig: { threads, source: threadsSource ?? 'override' },
      features,
      pageTimings,
    },
  };
  emitProgress('done', { final: true });
  writeStatus(payload);
  (self as any).postMessage({ kind: 'result', payload });
}

self.onmessage = (event: MessageEvent<BenchStartMessage>) => {
  const m = event.data;
  if (m?.kind !== 'start') return;
  startHeartbeat();
  main(m)
    .catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      emitProgress('error', { error: msg, final: true });
      writeStatus({ ok: false, error: msg, stack: e instanceof Error ? e.stack : undefined });
      (self as any).postMessage({
        kind: 'result',
        payload: { ok: false, error: msg },
      });
    })
    .finally(() => stopHeartbeat());
};
