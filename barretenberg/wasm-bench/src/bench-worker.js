import { DirectBbWasm } from './wasm-runtime.js';
import {
  computeHidingKernelVk,
  fetchAndProcessInputs,
  initSrs,
  proveChonk,
  runChonkSetup,
  summarizeProof,
  verifyChonk,
} from './chonk.js';

function now() {
  return performance.now();
}

async function timed(phases, name, fn) {
  const start = now();
  try {
    return await fn();
  } finally {
    phases[name] = now() - start;
  }
}

function progress(event, data = {}) {
  self.postMessage({ type: 'progress', event, data, at: new Date().toISOString(), elapsedMs: now() });
}

function featureReport(threads) {
  return {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    configuredThreads: threads,
    crossOriginIsolated: Boolean(self.crossOriginIsolated),
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    wasmSimd: WebAssembly.validate(
      new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 12, 26, 11]),
    ),
    wasmThreads: typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined' && threads > 1,
  };
}

function resolveThreads(raw) {
  if (raw === undefined || raw === null || raw === 'auto') {
    return Math.max(1, navigator.hardwareConcurrency || 1);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid threads value: ${raw}`);
  }
  return Math.floor(parsed);
}

async function runBench(options) {
  const wallStart = now();
  const flow = options.flow || 'ecdsar1+transfer_1_recursions+sponsored_fpc';
  const runs = Math.max(1, Number(options.runs) || 1);
  const threads = resolveThreads(options.threads);
  const inputUrl = options.inputUrl || `/inputs/${encodeURIComponent(flow)}/ivc-inputs.msgpack`;
  const phases = {};
  const logs = [];

  progress('start', { flow, runs, threads, smoke: Boolean(options.smoke) });
  const inputs = await timed(phases, 'process_inputs', () => fetchAndProcessInputs(inputUrl));
  progress('inputs_ready', {
    inputBytes: inputs.inputBytes.byteLength,
    circuits: inputs.steps.length,
    names: inputs.steps.map(step => step.functionName),
  });

  const wasm = new DirectBbWasm({
    logger: message => {
      logs.push(message);
      progress('bb_log', { message });
    },
    progress,
  });

  await timed(phases, 'init_wasm', () =>
    wasm.init({
      threads,
      wasmBaseUrl: options.wasmBaseUrl || '/wasm',
      memMaxPages: options.memMaxPages,
    }),
  );

  if (options.smoke) {
    const smoke = {
      flow,
      smoke: true,
      features: featureReport(threads),
      inputBytes: inputs.inputBytes.byteLength,
      circuits: inputs.steps.length,
      phases,
      wallMs: now() - wallStart,
    };
    await wasm.destroy();
    progress('complete', smoke);
    return smoke;
  }

  progress('crs_fetch_start', { srsSize: options.srsSize, grumpkinSrsSize: options.grumpkinSrsSize });
  const crsInfo = await timed(phases, 'fetch_crs_and_init_srs', () =>
    initSrs(wasm, {
      srsSize: options.srsSize,
      grumpkinSrsSize: options.grumpkinSrsSize,
      crsBaseUrl: options.crsBaseUrl,
      progress,
    }),
  );
  progress('srs_ready', crsInfo);

  const results = [];
  for (let i = 0; i < runs; i++) {
    const runPhases = {};
    progress('run_start', { run: i + 1, runs });
    await timed(runPhases, 'chonk_setup', () => runChonkSetup(wasm, inputs.steps));
    const proof = await timed(runPhases, 'chonk_prove', () => proveChonk(wasm));
    const vk = await timed(runPhases, 'chonk_compute_vk', () => computeHidingKernelVk(wasm, inputs.steps));
    const verified = await timed(runPhases, 'chonk_verify', () => verifyChonk(wasm, proof, vk));
    if (!verified) {
      throw new Error(`Chonk proof did not verify for ${flow}`);
    }
    const proofSummary = summarizeProof(proof, vk);
    const proveTotalMs = runPhases.chonk_setup + runPhases.chonk_prove;
    const row = {
      run: i + 1,
      phases: runPhases,
      setupMs: runPhases.chonk_setup,
      proveMs: runPhases.chonk_prove,
      proveTotalMs,
      verifyMs: runPhases.chonk_verify,
      vkMs: runPhases.chonk_compute_vk,
      verified,
      ...proofSummary,
    };
    results.push(row);
    progress('run_complete', row);
  }

  await timed(phases, 'destroy', () => wasm.destroy());
  const result = {
    benchmark: 'chonk-prove',
    flow,
    runs: results,
    features: featureReport(threads),
    crs: crsInfo,
    phases,
    logs,
    wallMs: now() - wallStart,
  };
  progress('complete', {
    flow,
    proveTotalMs: results[results.length - 1]?.proveTotalMs,
    wallMs: result.wallMs,
  });
  return result;
}

self.addEventListener('message', async event => {
  if (event.data?.type !== 'run') {
    return;
  }
  try {
    const result = await runBench(event.data.options || {});
    self.postMessage({ type: 'result', result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: {
        message: error?.message ?? String(error),
        stack: error?.stack ?? '',
      },
    });
  }
});
