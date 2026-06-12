// Minimal validation page: generate the ba_stream_walker WGSL via
// ShaderManager and try to compile it through Chrome's Tint. Reports
// the result via console + /results so playwright can scrape it.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';

const $status = document.getElementById('status')!;
const $log = document.getElementById('log')!;
const lines: string[] = [];
function log(level: 'info' | 'ok' | 'err', msg: string) {
  const tag = level === 'ok' ? '[OK]' : level === 'err' ? '[ERR]' : '[..]';
  const line = `${tag} ${msg}`;
  console.log(line);
  lines.push(line);
  $log.textContent = lines.join('\n');
}
function setStatus(text: string, cls?: 'ok' | 'err') {
  $status.textContent = text;
  if (cls) {
    $status.className = cls;
  }
}

async function postResult(payload: Record<string, unknown>) {
  try {
    await fetch('/results', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    log('err', `POST /results failed: ${(e as Error).message}`);
  }
}

(async () => {
  try {
    log('info', 'requesting WebGPU adapter...');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      setStatus('no adapter', 'err');
      await postResult({ state: 'error', error: 'no adapter' });
      return;
    }
    log('info', `adapter: ${adapter.info?.vendor ?? 'unknown'} / ${adapter.info?.architecture ?? 'unknown'}`);
    log('info', `limits.maxStorageBuffersPerShaderStage = ${adapter.limits.maxStorageBuffersPerShaderStage}`);
    log('info', `limits.maxComputeWorkgroupStorageSize = ${adapter.limits.maxComputeWorkgroupStorageSize}`);

    const device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBuffersPerShaderStage: Math.min(adapter.limits.maxStorageBuffersPerShaderStage, 10),
        maxComputeWorkgroupStorageSize: Math.min(adapter.limits.maxComputeWorkgroupStorageSize, 32768),
      },
    });

    // Capture uncaptured errors as they surface.
    const captured: string[] = [];
    device.addEventListener('uncapturederror', (ev: Event) => {
      const e = ev as GPUUncapturedErrorEvent;
      captured.push(e.error.message);
    });

    log('info', 'instantiating ShaderManager (chunk=4, n=131072)...');
    const sm = new ShaderManager(4, 131072, BN254_CURVE_CONFIG, false);

    log('info', 'generating ba_stream_walker source (TPB=64, S=8 — KNOB 1)...');
    const walkerSrc = sm.gen_ba_stream_walker_shader(64, 8, 4352, 4096, 81920, true);
    log('info', `walker source: ${walkerSrc.length} bytes`);

    log('info', 'generating ba_planner_partition_task source (KNOB 2)...');
    const packSrc = sm.gen_ba_planner_partition_task_shader(64, 8);
    log('info', `partition_task source: ${packSrc.length} bytes`);

    // Tint compiles via createShaderModule. compilationInfo gives validator output.
    log('info', 'createShaderModule(walker)...');
    const walkerMod = device.createShaderModule({ code: walkerSrc, label: 'walker' });
    const wInfo = await walkerMod.getCompilationInfo();
    const wErrors = wInfo.messages.filter(m => m.type === 'error');
    const wWarnings = wInfo.messages.filter(m => m.type === 'warning');
    log('info', `walker compilation: ${wErrors.length} errors, ${wWarnings.length} warnings`);
    for (const m of wInfo.messages) {
      log(m.type === 'error' ? 'err' : 'info',
        `  ${m.type} L${m.lineNum}:${m.linePos} — ${m.message}`);
    }

    log('info', 'createShaderModule(pack)...');
    const packMod = device.createShaderModule({ code: packSrc, label: 'pack' });
    const pInfo = await packMod.getCompilationInfo();
    const pErrors = pInfo.messages.filter(m => m.type === 'error');
    const pWarnings = pInfo.messages.filter(m => m.type === 'warning');
    log('info', `pack compilation: ${pErrors.length} errors, ${pWarnings.length} warnings`);
    for (const m of pInfo.messages) {
      log(m.type === 'error' ? 'err' : 'info',
        `  ${m.type} L${m.lineNum}:${m.linePos} — ${m.message}`);
    }

    // Try to actually instantiate the pipelines (catches some validation
    // errors that compilationInfo misses).
    if (wErrors.length === 0 && pErrors.length === 0) {
      log('info', 'createComputePipeline(walker)...');
      try {
        await device.createComputePipelineAsync({
          layout: 'auto',
          compute: { module: walkerMod, entryPoint: 'main' },
        });
        log('ok', 'walker pipeline created');
      } catch (e) {
        log('err', `walker pipeline failed: ${(e as Error).message}`);
      }
      log('info', 'createComputePipeline(pack)...');
      try {
        await device.createComputePipelineAsync({
          layout: 'auto',
          compute: { module: packMod, entryPoint: 'main' },
        });
        log('ok', 'pack pipeline created');
      } catch (e) {
        log('err', `pack pipeline failed: ${(e as Error).message}`);
      }
    }

    // Drain any uncaptured errors that fired async.
    await new Promise<void>(r => setTimeout(r, 200));
    for (const m of captured) { log('err', `uncaptured: ${m}`); }

    const ok = wErrors.length === 0 && pErrors.length === 0 && captured.length === 0;
    setStatus(ok ? 'OK' : 'FAIL', ok ? 'ok' : 'err');
    await postResult({
      state: ok ? 'done' : 'error',
      walker: { length: walkerSrc.length, errors: wErrors.length, warnings: wWarnings.length },
      pack: { length: packSrc.length, errors: pErrors.length, warnings: pWarnings.length },
      uncaptured: captured.length,
      messages: [
        ...wInfo.messages.map(m => ({ kernel: 'walker', type: m.type, line: m.lineNum, col: m.linePos, msg: m.message })),
        ...pInfo.messages.map(m => ({ kernel: 'pack', type: m.type, line: m.lineNum, col: m.linePos, msg: m.message })),
      ],
      uncapturedMessages: captured,
      log: lines,
      adapter: { vendor: adapter.info?.vendor, architecture: adapter.info?.architecture },
    });
  } catch (e) {
    const msg = (e as Error).message;
    log('err', `top-level: ${msg}`);
    setStatus(`THROW: ${msg}`, 'err');
    await postResult({ state: 'error', error: msg, log: lines });
  }
})();
