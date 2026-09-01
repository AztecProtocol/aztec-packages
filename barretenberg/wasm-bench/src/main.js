const logEl = document.querySelector('#log');
const form = document.querySelector('#bench-form');
const runButton = document.querySelector('#run');

function appendLog(value) {
  if (!logEl) return;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  logEl.textContent += `${text}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function decodeBenchParam(raw) {
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), c => c.charCodeAt(0))));
}

async function postJson(path, body) {
  try {
    await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Posting progress to the local harness is best effort.
  }
}

function setRunButton(disabled) {
  if (runButton) runButton.disabled = disabled;
}

function runWorker(workerOptions, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./bench-worker.js', import.meta.url), { type: 'module' });
    const terminate = () => worker.terminate();
    worker.onmessage = event => {
      const message = event.data;
      if (message.type === 'progress') {
        onProgress?.(message);
        return;
      }
      if (message.type === 'result') {
        terminate();
        resolve(message.result);
        return;
      }
      if (message.type === 'error') {
        terminate();
        const err = new Error(message.error?.message || 'worker error');
        err.stack = message.error?.stack || err.stack;
        reject(err);
      }
    };
    worker.onerror = event => {
      terminate();
      const err = new Error(event.message || 'worker top-level error');
      reject(err);
    };
    worker.postMessage({ type: 'run', options: workerOptions });
  });
}

async function runSingle(options) {
  setRunButton(true);
  if (logEl) logEl.textContent = '';
  window.__wasmBenchStatus = { state: 'running', options };
  window.__wasmBenchResult = undefined;
  window.__wasmBenchError = undefined;

  try {
    const result = await runWorker(options, {
      onProgress: async msg => {
        const row = { ...msg, options };
        window.__wasmBenchStatus = { state: 'progress', event: msg.event, data: msg.data };
        appendLog(row);
        await postJson('/progress', row);
      },
    });
    window.__wasmBenchStatus = { state: 'complete' };
    window.__wasmBenchResult = result;
    appendLog(result);
    await postJson('/result', result);
  } catch (error) {
    const errObj = { message: error.message || String(error), stack: error.stack || '' };
    window.__wasmBenchStatus = { state: 'error', error: errObj };
    window.__wasmBenchError = errObj;
    appendLog(errObj);
    await postJson('/progress', { type: 'error', error: errObj, options });
  } finally {
    setRunButton(false);
  }
}

export function buildABSchedule(variants, pairs) {
  if (!Array.isArray(variants) || variants.length !== 2) {
    throw new Error(`A/B mode requires exactly 2 variants (got ${JSON.stringify(variants)})`);
  }
  const schedule = [];
  for (let p = 0; p < pairs; p++) {
    schedule.push(p % 2 === 0 ? [variants[0], variants[1]] : [variants[1], variants[0]]);
  }
  return schedule;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAB(options) {
  setRunButton(true);
  if (logEl) logEl.textContent = '';
  const variants = options.variants || ['a', 'b'];
  const pairs = Math.max(1, Number(options.pairs) || 11);
  const warmupPairs = Math.max(0, Number(options.warmupPairs ?? options.warmupRuns ?? 1));
  const wasmBaseUrls = options.wasmBaseUrls || {
    [variants[0]]: `/wasm/${variants[0]}`,
    [variants[1]]: `/wasm/${variants[1]}`,
  };
  const interRunSleepMs = Math.max(0, Number(options.interRunSleepMs) || 0);

  window.__wasmBenchStatus = { state: 'running-ab', options, pairs, variants };
  window.__wasmBenchResult = undefined;
  window.__wasmBenchError = undefined;

  const schedule = buildABSchedule(variants, pairs);
  const collected = [];
  let features;

  appendLog({ event: 'ab_start', variants, pairs, warmupPairs, wasmBaseUrls });
  await postJson('/progress', { type: 'ab_start', variants, pairs, warmupPairs, wasmBaseUrls, options });

  try {
    for (let p = 0; p < pairs; p++) {
      const order = schedule[p];
      const pairRuns = [];
      for (let position = 0; position < order.length; position++) {
        const variant = order[position];
        const wasmBaseUrl = wasmBaseUrls[variant];
        if (!wasmBaseUrl) {
          throw new Error(`No wasmBaseUrl configured for variant "${variant}"`);
        }
        const workerOptions = {
          benchmark: 'chonk-prove',
          flow: options.flow,
          runs: 1,
          threads: options.threads,
          smoke: false,
          wasmBaseUrl,
          ...(options.memMaxPages ? { memMaxPages: options.memMaxPages } : {}),
          ...(options.srsSize ? { srsSize: options.srsSize } : {}),
          ...(options.grumpkinSrsSize ? { grumpkinSrsSize: options.grumpkinSrsSize } : {}),
          ...(options.crsBaseUrl ? { crsBaseUrl: options.crsBaseUrl } : {}),
        };
        await postJson('/progress', { type: 'pair_start', pair: p, variant, position, warmup: p < warmupPairs });
        appendLog({ event: 'pair_start', pair: p, variant, position });
        const result = await runWorker(workerOptions, {
          onProgress: async msg => {
            window.__wasmBenchStatus = { state: 'pair_progress', pair: p, variant, event: msg.event };
            await postJson('/progress', { type: 'worker_progress', pair: p, variant, position, inner: msg });
          },
        });
        if (!features) features = result.features;
        const run = result.runs && result.runs[0];
        if (!run) {
          throw new Error(`Worker produced no run for variant=${variant} pair=${p}`);
        }
        const pairRun = {
          pair: p,
          warmup: p < warmupPairs,
          variant,
          position,
          run,
          phases: result.phases,
          crs: result.crs,
          wallMs: result.wallMs,
          wasmBaseUrl,
          features: result.features,
        };
        pairRuns.push(pairRun);
        collected.push(pairRun);
        await postJson('/progress', {
          type: 'pair_run',
          pair: p,
          variant,
          position,
          warmup: p < warmupPairs,
          proveTotalMs: run.proveTotalMs,
          setupMs: run.setupMs,
          proveMs: run.proveMs,
          verified: run.verified,
          proofFieldCount: run.proofFieldCount,
          verificationKeyBytes: run.verificationKeyBytes,
        });
        appendLog({
          event: 'pair_run',
          pair: p,
          variant,
          position,
          proveTotalMs: Math.round(run.proveTotalMs),
          setupMs: Math.round(run.setupMs),
          proveMs: Math.round(run.proveMs),
        });
        if (interRunSleepMs > 0) {
          await sleep(interRunSleepMs);
        }
      }
      await postJson('/progress', { type: 'pair_complete', pair: p, runs: pairRuns });
    }

    const result = {
      benchmark: 'chonk-ab',
      flow: options.flow,
      variants,
      wasmBaseUrls,
      pairs: collected,
      pairsCount: pairs,
      warmupPairs,
      features,
    };
    window.__wasmBenchStatus = { state: 'complete' };
    window.__wasmBenchResult = result;
    appendLog({ event: 'ab_complete', collected: collected.length });
    await postJson('/result', result);
  } catch (error) {
    const errObj = { message: error.message || String(error), stack: error.stack || '' };
    window.__wasmBenchStatus = { state: 'error', error: errObj };
    window.__wasmBenchError = errObj;
    appendLog({ event: 'ab_error', error: errObj });
    await postJson('/progress', { type: 'ab_error', error: errObj });
  } finally {
    setRunButton(false);
  }
}

async function run(options) {
  if (options?.benchmark === 'chonk-ab') {
    return runAB(options);
  }
  return runSingle(options);
}

if (form) {
  form.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(form);
    void run({
      benchmark: 'chonk-prove',
      flow: String(formData.get('flow')),
      threads: String(formData.get('threads')),
      runs: Number(formData.get('runs')),
      smoke: String(formData.get('smoke')) === 'true',
    });
  });
}

const params = new URLSearchParams(location.search);
const benchParam = params.get('bench');
if (benchParam) {
  void run(decodeBenchParam(benchParam));
}
