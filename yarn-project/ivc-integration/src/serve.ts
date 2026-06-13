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

// WASM thread count for the prove. 16 matches the Mac M4 harness; phones with
// fewer cores can lower it via `?threads=` on the autorun URL (oversubscription
// still works but wastes context switches). Module-level so the autorun query
// handler can set it before any runChonkOnce call.
let chonkThreads = 16;

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
  oracleRouteSeqs?: number[],
): Promise<{ result: ChonkWebGpuBenchRunResult; vk: Uint8Array }> {
  const bb = await Barretenberg.initSingleton({
    threads: chonkThreads,
    logger: loggerOverride ?? ((m: string) => logger.info(m)),
    webgpuMsm,
    msmCsvMode,
    oracleRouteSeqs,
  });
  try {
    const backend = new AztecClientBackend(bytecodes, bb, functionNames);
    const t0 = performance.now();
    const { proof, vk } = await backend.prove(witnessStack, vks);
    const proveMs = performance.now() - t0;

    const t1 = performance.now();
    const verified = await backend.verify(proof, vk);
    const verifyMs = performance.now() - t1;

    return {
      result: { proveMs, verifyMs, verified, proofLength: proof.length },
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

  const { bytecodes, witnesses, vks, functionNames } = await loadPinnedInputs(flow);
  logger.info(`[bench] running webgpu=off then webgpu=on on flow=${flow} (${bytecodes.length} circuits)`);

  const off = await runChonkOnce(false, bytecodes, witnesses, vks, functionNames);
  logger.info(
    `[bench] webgpu=off: prove=${off.result.proveMs.toFixed(0)}ms verify=${off.result.verifyMs.toFixed(0)}ms`,
  );
  const on = await runChonkOnce(true, bytecodes, witnesses, vks, functionNames);
  logger.info(`[bench] webgpu=on:  prove=${on.result.proveMs.toFixed(0)}ms verify=${on.result.verifyMs.toFixed(0)}ms`);

  // Sanity check: WebGPU and native paths must produce identical VKs. A
  // divergence here would indicate the GPU MSM corrupted a commitment.
  const vksMatch = off.vk.length === on.vk.length && off.vk.every((b, i) => b === on.vk[i]);
  if (!vksMatch) {
    logger.error(`[bench] VK mismatch between webgpu off and on — GPU path may be incorrect`);
  }

  return { flow, adapter: adapterInfo, numCreatorApps: bytecodes.length, off: off.result, on: on.result, vksMatch };
}

(window as any).runChonkWebGpuBench = runChonkWebGpuBench;

/**
 * On-only ChonkApi::prove — runs the pinned flow once with the WebGPU MSM
 * bridge enabled and reports the prove/verify walls. Used as the fast phone
 * smoke-test: it answers "can this device complete a GPU-backed prove at all?"
 * without paying for the (slower, all-CPU) `off` run that the vks_match
 * cross-check in runChonkWebGpuBench requires.
 */
async function runChonkProveOn(
  flow: string = 'ecdsar1+transfer_1_recursions+sponsored_fpc',
): Promise<{ flow: string; adapter: string; proveMs: number; verifyMs: number; verified: boolean; proofLength: number }> {
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
    } catch (err) {
      adapterInfo = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  logger.info(`[smoke] GPU adapter: ${adapterInfo}`);
  const { bytecodes, witnesses, vks, functionNames } = await loadPinnedInputs(flow);
  logger.info(`[smoke] running webgpu=on on flow=${flow} (${bytecodes.length} circuits, threads=${chonkThreads})`);
  const on = await runChonkOnce(true, bytecodes, witnesses, vks, functionNames);
  logger.info(`[smoke] webgpu=on: prove=${on.result.proveMs.toFixed(0)}ms verify=${on.result.verifyMs.toFixed(0)}ms`);
  return { flow, adapter: adapterInfo, ...on.result };
}
(window as any).runChonkProveOn = runChonkProveOn;

/**
 * End-to-end ChonkApi::prove three ways in one session for a clean comparison:
 *   off    - all-CPU Pippenger (webgpu off)
 *   on     - production routing (size predicate, n >= 512)
 *   oracle - dispatch only `seqs` (the GPU-faster MSMs from a per-MSM oracle CSV)
 * Returns the three prove walls + a VK byte-identity check across all three.
 */
async function runChonkOracleProve(
  flow: string = 'ecdsar1+transfer_1_recursions+sponsored_fpc',
  seqs: number[] = [],
): Promise<{ flow: string; off: number; on: number; oracle: number; numRouted: number; verified: boolean; vksMatch: boolean }> {
  const { bytecodes, witnesses, vks, functionNames } = await loadPinnedInputs(flow);
  logger.info(`[oracle] flow=${flow} routing ${seqs.length} MSMs to GPU`);
  const off = await runChonkOnce(false, bytecodes, witnesses, vks, functionNames);
  logger.info(`[oracle] off (all-CPU):   prove=${off.result.proveMs.toFixed(0)}ms`);
  const on = await runChonkOnce(true, bytecodes, witnesses, vks, functionNames);
  logger.info(`[oracle] on  (n>=512):    prove=${on.result.proveMs.toFixed(0)}ms`);
  const oracle = await runChonkOnce(true, bytecodes, witnesses, vks, functionNames, false, undefined, seqs);
  logger.info(`[oracle] oracle (${seqs.length} MSMs): prove=${oracle.result.proveMs.toFixed(0)}ms`);
  const vksMatch =
    off.vk.length === oracle.vk.length &&
    off.vk.every((b, i) => b === oracle.vk[i]) &&
    off.vk.every((b, i) => b === on.vk[i]);
  return {
    flow,
    off: off.result.proveMs,
    on: on.result.proveMs,
    oracle: oracle.result.proveMs,
    numRouted: seqs.length,
    verified: off.result.verified && on.result.verified && oracle.result.verified,
    vksMatch,
  };
}
(window as any).runChonkOracleProve = runChonkOracleProve;

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
  const gpuLogger = (m: string) => {
    if (m.includes('[msm-csv-gpu]')) gpuCaptured.push(m);
    logger.info(m);
  };

  try {
    // CPU pass: msmCsvMode=on, webgpu=off → each commit/batchCommit MSM runs solo
    // on the native Pippenger, timed, emits [msm-csv-cpu] name=<lbl>#<seq> ... .
    await runChonkOnce(false, bytecodes, witnesses, vks, functionNames, /*msmCsvMode=*/ true, cpuLogger);
    const cpuLines = cpuCaptured.slice();

    // GPU pass: msmCsvMode=on, webgpu=on (wasm.ts sets batch_delegate(1,1) so EVERY
    // MSM, n>=1, delegates) → each commit/batchCommit MSM runs solo through the
    // bridge, timed end-to-end, emits [msm-csv-gpu] name=<lbl>#<seq> ... . The seq
    // resets per pass, so the same MSM has the same label in both → a 1:1 join.
    gpuCaptured.length = 0;
    await runChonkOnce(true, bytecodes, witnesses, vks, functionNames, /*msmCsvMode=*/ true, gpuLogger);
    const gpuLines = gpuCaptured.slice();

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

    // Parse GPU lines: `[msm-csv-gpu] name=W_L#5 n=88899 gpu_ms=12.3456` — the full
    // per-MSM round-trip cost (each MSM routed solo through the bridge).
    interface GpuEntry {
      name: string;
      n: number;
      gpu_ms: number;
    }
    const gpus: GpuEntry[] = [];
    const gpuRe = /\[msm-csv-gpu\]\s+name=(\S+)\s+n=(\d+)\s+gpu_ms=([\d.]+)/;
    for (const line of gpuLines) {
      const m = gpuRe.exec(line);
      if (m) gpus.push({ name: m[1], n: parseInt(m[2], 10), gpu_ms: parseFloat(m[3]) });
    }
    // Join 1:1 by the unique `<label>#<seq>` — both passes ran the same
    // deterministic commit sequence with the seq reset each pass, so each MSM has
    // the same label in both. `kind` records the winner for quick scanning.
    const gpuByName = new Map<string, number>();
    for (const g of gpus) gpuByName.set(g.name, g.gpu_ms);
    const rows: MsmCsvRow[] = [];
    for (let i = 0; i < cpus.length; i++) {
      const c = cpus[i];
      const gpu_ms = gpuByName.get(c.name) ?? 0;
      const kind = gpuByName.has(c.name) ? (gpu_ms < c.cpu_ms ? 'gpu-wins' : 'cpu-wins') : 'gpu-missing';
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

/**
 * Autorun dispatcher — drives a prove straight from the URL query so a phone
 * (or any headless log scraper) runs ChonkApi::prove by just loading a URL, no
 * interaction. `?autorun=chonk-on` runs the on-only smoke test (fastest "does
 * this device prove at all?" check); `?autorun=chonk-webgpu` runs the full
 * off+on vks_match bench. `?flow=` and `?threads=` override the flow and WASM
 * thread count. The terminal result is emitted as a single-line
 * `[CHONK-RESULT] {json}` console log (and an on-page <pre>) so a CDP/logcat
 * listener can detect completion; failures emit `[CHONK-ERROR] …`.
 * `document.title` is set to a terminal sentinel (CHONK-DONE-OK /
 * CHONK-DONE-FAIL / CHONK-ERROR) for pollers that watch the title.
 */
async function autorunFromQuery(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('autorun');
  if (!mode) return;
  const flow = params.get('flow') ?? 'ecdsar1+transfer_1_recursions+sponsored_fpc';
  const threadsParam = params.get('threads');
  if (threadsParam) chonkThreads = parseInt(threadsParam, 10);

  const statusEl = document.createElement('pre');
  statusEl.id = 'autorun-status';
  statusEl.style.whiteSpace = 'pre-wrap';
  document.body.appendChild(statusEl);
  const setStatus = (s: string) => {
    statusEl.textContent = s;
  };
  // Headless capture: POST the terminal result back to the serving origin so a
  // phone run (content_shell over adb reverse, no DevTools) can be scraped from
  // the server log without parsing logcat. Best-effort; the on-page <pre>,
  // console line, and document.title remain the primary signals.
  const postResult = (payload: Record<string, unknown>) => {
    try {
      navigator.sendBeacon('/result', JSON.stringify(payload));
    } catch {
      /* best effort */
    }
  };

  try {
    setStatus(`[CHONK-RUNNING] autorun=${mode} flow=${flow} threads=${chonkThreads}`);
    document.title = 'CHONK-RUNNING';
    let summary: Record<string, unknown>;
    if (mode === 'chonk-on') {
      const r = await runChonkProveOn(flow);
      summary = {
        mode,
        flow,
        adapter: r.adapter,
        prove_ms: Math.round(r.proveMs),
        verify_ms: Math.round(r.verifyMs),
        verified: r.verified,
        proof_len: r.proofLength,
      };
      document.title = r.verified ? 'CHONK-DONE-OK' : 'CHONK-DONE-FAIL';
    } else if (mode === 'chonk-webgpu' || mode === 'chonk') {
      const r = await runChonkWebGpuBench(flow);
      summary = {
        mode,
        flow,
        adapter: r.adapter,
        off_ms: Math.round(r.off.proveMs),
        on_ms: Math.round(r.on.proveMs),
        speedup: +(r.off.proveMs / r.on.proveMs).toFixed(2),
        verified_off: r.off.verified,
        verified_on: r.on.verified,
        vks_match: r.vksMatch,
      };
      document.title = r.vksMatch && r.off.verified && r.on.verified ? 'CHONK-DONE-OK' : 'CHONK-DONE-FAIL';
    } else {
      setStatus(`[CHONK-ERROR] unknown autorun mode '${mode}'`);
      document.title = 'CHONK-ERROR';
      return;
    }
    const line = '[CHONK-RESULT] ' + JSON.stringify(summary);
    console.log(line);
    logger.info(line);
    setStatus(line);
    postResult({ title: document.title, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.log('[CHONK-ERROR] ' + msg);
    setStatus('[CHONK-ERROR] ' + msg);
    document.title = 'CHONK-ERROR';
    postResult({ title: 'CHONK-ERROR', mode, flow, error: msg });
  }
}

// Only set up the interactive / autorun UI if this is not the automated
// Puppeteer harness (which serves test.html with a #status div and drives
// window.runChonk* directly via page.evaluate — it must not have console
// overridden or an autorun fire underneath it).
if (!document.getElementById('status')) {
  document.addEventListener('DOMContentLoaded', function () {
    setupConsoleOutput(); // Initialize console output capture

    // Phone / headless path: a `?autorun=` query runs a prove with no tap.
    if (new URLSearchParams(window.location.search).has('autorun')) {
      void autorunFromQuery();
      return;
    }

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
