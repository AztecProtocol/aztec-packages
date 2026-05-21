/** Page entry for BrowserStack-visible status and worker orchestration. */

const status = document.getElementById('status') as HTMLPreElement;
const pageStart = performance.now();
let lastProgressPhase: string | null = null;
let lastProgressAt = pageStart;

function writeStatus(payload: unknown) {
  status.textContent = JSON.stringify(payload, null, 2);
  console.log('WASM_BENCH_STATUS', JSON.stringify(payload));
}

function emitPageProgress(phase: string, details: Record<string, unknown> = {}) {
  const now = performance.now();
  const record = {
    kind: 'progress' as const,
    source: 'page',
    phase,
    prevPhase: lastProgressPhase,
    phaseMs: now - lastProgressAt,
    elapsedMs: now - pageStart,
    timestamp: new Date().toISOString(),
    details,
  };
  console.log('WASM_BENCH_PROGRESS', JSON.stringify(record));
  void fetch('/progress', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    keepalive: true,
    body: JSON.stringify(record),
  }).catch(() => {});
  lastProgressPhase = phase;
  lastProgressAt = now;
}

async function postResult(payload: unknown) {
  try {
    await fetch('/results', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        payload,
        href: window.location.href,
        completedAt: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.warn('POST /results failed', e);
  }
}

function autoThreads(): number {
  const hc = navigator.hardwareConcurrency;
  if (typeof hc === 'number' && Number.isFinite(hc) && hc > 0) return hc;
  return 8;
}

function parseParams() {
  const url = new URL(window.location.href);
  let flow = url.searchParams.get('flow');
  let runs = Number(url.searchParams.get('runs') ?? '1');
  let benchmark = url.searchParams.get('benchmark') ?? undefined;
  const rawThreadsParam = url.searchParams.get('threads');
  let threadsSource: 'auto' | 'override' = 'auto';
  let threads = autoThreads();
  if (rawThreadsParam !== null && rawThreadsParam !== 'auto') {
    const n = Number(rawThreadsParam);
    if (Number.isFinite(n) && n > 0) {
      threads = n;
      threadsSource = 'override';
    }
  }
  let trace = url.searchParams.get('trace') === '1' || url.searchParams.get('trace') === 'true';
  let smoke = url.searchParams.get('smoke') === '1' || url.searchParams.get('smoke') === 'true';
  const bench = url.searchParams.get('bench');
  let decoded: any = {};
  if (bench) {
    decoded = JSON.parse(atob(bench));
    benchmark = decoded.benchmark ?? benchmark;
    flow = decoded.flow ?? flow;
    runs = Number(decoded.runs ?? runs);
    if (decoded.threads !== undefined && decoded.threads !== null && decoded.threads !== 'auto') {
      const n = Number(decoded.threads);
      if (Number.isFinite(n) && n > 0) {
        threads = n;
        threadsSource = 'override';
      }
    }
    if (typeof decoded.trace === 'boolean') trace = decoded.trace;
    if (typeof decoded.smoke === 'boolean') smoke = decoded.smoke;
  }
  let memMaxPages: number | undefined;
  const rawMemMax = url.searchParams.get('memMax');
  if (rawMemMax != null) {
    const m = Number(rawMemMax);
    if (Number.isFinite(m) && m > 0) memMaxPages = m;
  }
  if (decoded.memMaxPages !== undefined && decoded.memMaxPages !== null) {
    const m = Number(decoded.memMaxPages);
    if (Number.isFinite(m) && m > 0) memMaxPages = m;
  }
  return {
    benchmark,
    flow,
    runs: Number.isFinite(runs) ? runs : 1,
    threads,
    threadsSource,
    trace,
    smoke,
    memMaxPages,
  };
}

function resourceTiming(namePart: string) {
  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const entry = resources.find((r) => r.name.includes(namePart));
  if (!entry) return null;
  return {
    name: entry.name,
    durationMs: entry.duration,
    responseEndMs: entry.responseEnd,
    transferSize: entry.transferSize,
    encodedBodySize: entry.encodedBodySize,
    decodedBodySize: entry.decodedBodySize,
  };
}

async function main() {
  emitPageProgress('page_script_start', { href: window.location.href });
  const { benchmark, flow, runs, threads, threadsSource, trace, smoke, memMaxPages } = parseParams();
  if (!flow) {
    const payload = { ok: false, error: 'missing ?flow=<id> or ?bench=<base64> param' };
    writeStatus(payload);
    await postResult(payload);
    return;
  }
  emitPageProgress('params_parsed', { benchmark, flow, runs, threads, threadsSource, trace, smoke });
  const features = {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    wasmSimd: await WebAssembly.validate(
      new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, 0x03, 0x02, 0x01,
        0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00, 0xfd, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x0b,
      ]),
    ),
    pageLoadOrigin: window.location.origin,
  };
  const pageTimings = {
    scriptStartMs: performance.now() - pageStart,
    mainBundle: resourceTiming('main.js'),
  };
  emitPageProgress('features_checked', {
    crossOriginIsolated: features.crossOriginIsolated,
    sharedArrayBuffer: features.sharedArrayBuffer,
    hardwareConcurrency: features.hardwareConcurrency,
    wasmSimd: features.wasmSimd,
  });

  if (!features.crossOriginIsolated || !features.sharedArrayBuffer) {
    const payload = {
      ok: false,
      error: 'browser feature preflight failed',
      data: { benchmark, flow, smoke, features, pageTimings },
    };
    emitPageProgress('feature_preflight_failed', {
      crossOriginIsolated: features.crossOriginIsolated,
      sharedArrayBuffer: features.sharedArrayBuffer,
    });
    writeStatus(payload);
    await postResult(payload);
    return;
  }

  writeStatus({ ok: false, phase: 'spawning-bench-worker', benchmark, flow, runs, threads, threadsSource, trace, smoke, features, pageTimings });
  emitPageProgress('worker_create_start');
  const worker = new Worker(new URL('./bench.worker.ts', import.meta.url));
  emitPageProgress('worker_created');

  const result = await new Promise<unknown>((resolve, reject) => {
    let workerFirstMessageSeen = false;
    worker.onmessage = (event: MessageEvent<{ kind: string; payload?: unknown; msg?: string }>) => {
      const data = event.data;
      if (!workerFirstMessageSeen) {
        workerFirstMessageSeen = true;
        emitPageProgress('worker_first_message', { kind: data?.kind });
      }
      if (data?.kind === 'status') writeStatus(data.payload);
      else if (data?.kind === 'log' && typeof data.msg === 'string') console.log(data.msg);
      else if (data?.kind === 'result') {
        resolve(data.payload);
        worker.terminate();
      }
    };
    worker.onerror = (e) => {
      reject(new Error(`worker error: ${e.message ?? 'unknown'}`));
    };
    emitPageProgress('worker_start_post');
    worker.postMessage({ kind: 'start', benchmark, flow, runs, threads, threadsSource, trace, smoke, memMaxPages, features, pageTimings });
  });

  emitPageProgress('posting_result');
  await postResult(result);
  emitPageProgress('result_posted');
}

main().catch((e) => {
  const payload = {
    ok: false,
    error: e instanceof Error ? e.message : String(e),
    stack: e instanceof Error ? e.stack : undefined,
  };
  emitPageProgress('page_error', { error: payload.error });
  writeStatus(payload);
  void postResult(payload);
});
