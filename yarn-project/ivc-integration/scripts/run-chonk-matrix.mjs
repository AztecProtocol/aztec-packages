#!/usr/bin/env node
// Run the headless Chonk e2e WebGPU prove across a list of BrowserStack targets
// SEQUENTIALLY (each target holds a Cloudflare tunnel + a heavy device session; running
// them one at a time avoids BrowserStack parallel-session limits and host contention),
// then write a Markdown comparison table.
//
// Each target is driven by run-chonk-browserstack.mjs, whose stdout summary JSON we
// capture. Rows that errored / hit SwiftShader / lack WebGPU are rendered (not dropped)
// so an OOM phone or a missing iOS-26 image is visible rather than silently absent.
//
// Usage from yarn-project/ivc-integration:
//   yarn webpack
//   BROWSERSTACK_USERNAME=… BROWSERSTACK_ACCESS_KEY=… \
//     node scripts/run-chonk-matrix.mjs --targets macos,windows,s25-ultra,pixel-9-pro-xl,iphone-15-pro
//
//   # Lighter per-phone flow / mode (the heavy off-vs-on prove can blow the 30-min cap):
//   node scripts/run-chonk-matrix.mjs --targets s25-ultra,pixel-9-pro-xl --mode on-only \
//     --flow ecdsar1+transfer_0_recursions+sponsored_fpc
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(__dirname, 'run-chonk-browserstack.mjs');
const DEFAULT_FLOW = 'ecdsar1+transfer_1_recursions+sponsored_fpc';

const { values: argv } = parseArgs({
  options: {
    targets: { type: 'string', default: 'macos,windows,s25-ultra,pixel-9-pro-xl,iphone-15-pro' },
    flow: { type: 'string', default: DEFAULT_FLOW },
    mode: { type: 'string', default: 'off-on' },
    out: { type: 'string', default: '/tmp/zac-webgpu/chonk-bs-matrix.md' },
    'json-out': { type: 'string', default: '/tmp/zac-webgpu/chonk-bs-matrix.json' },
    port: { type: 'string', default: '8099' },
    // Dry-run the whole matrix on local headless Chrome (SwiftShader) — validates the
    // table rendering without any BrowserStack spend.
    'local-headless': { type: 'boolean', default: false },
  },
  allowPositionals: false,
});

const targets = argv.targets
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function log(msg) {
  process.stderr.write(`[run-chonk-matrix] ${msg}\n`);
}

// Run the per-target runner, capturing its stdout (the summary JSON) and streaming its
// stderr through for live progress. Resolves to the parsed summary or an error stub.
function runOne(target) {
  return new Promise(resolve => {
    const args = [
      RUNNER,
      '--target',
      target,
      '--flow',
      argv.flow,
      '--mode',
      argv.mode,
      // Distinct port per target so a lingering socket from a killed run can't collide.
      '--port',
      String(parseInt(argv.port, 10) + targets.indexOf(target)),
      ...(argv['local-headless'] ? ['--local-headless'] : []),
    ];
    log(`▶ ${target}: node ${args.join(' ')}`);
    const proc = spawn('node', args, { stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';
    proc.stdout.on('data', d => (stdout += d.toString()));
    proc.on('exit', code => {
      let summary = null;
      try {
        // The runner prints exactly one JSON object as its last stdout block.
        const start = stdout.indexOf('{');
        if (start >= 0) summary = JSON.parse(stdout.slice(start));
      } catch {
        // fall through to error stub
      }
      if (!summary) {
        summary = { target, targetLabel: target, flow: argv.flow, mode: argv.mode, final: { state: 'runner-error' } };
      }
      summary.exitCode = code;
      log(`◀ ${target}: exit=${code} state=${summary.final?.state}`);
      resolve(summary);
    });
  });
}

function fmtMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function fmtMb(mb) {
  return mb == null || !Number.isFinite(mb) ? '—' : `${Math.round(mb)}`;
}

function webgpuCell(f) {
  if (!f) return '—';
  if (f.state === 'error' || f.state === 'runner-error') return '❌ ' + f.state;
  if (f.swiftshaderDetected) return '⚠️ swiftshader';
  const a = (f.adapter ?? '').toLowerCase();
  if (a.includes('no-webgpu') || a.includes('undefined')) return '❌ no-webgpu';
  return '✅';
}

function toTable(rows) {
  const header =
    '| device | webgpu | adapter | off prove | on prove | speedup | vksMatch | wasm MiB | gpu MiB | state |\n' +
    '|---|---|---|---|---|---|---|---|---|---|';
  const body = rows
    .map(r => {
      const f = r.final ?? {};
      const adapter = (f.adapter ?? '—').replace(/\|/g, '/').slice(0, 60);
      const speedup = r.speedup != null ? `${r.speedup}×` : '—';
      const vks = f.vksMatch == null ? '—' : f.vksMatch ? '✅' : '❌';
      // Prefer the on-run heap, but fall back to off when on was skipped (its metrics
      // are 0 on SwiftShader) so the row still shows the real peak.
      const wasm = fmtMb(f.on?.wasmHeapPeakMb || f.off?.wasmHeapPeakMb);
      const gpu = fmtMb(f.on?.gpuPeakMb);
      return `| ${r.targetLabel ?? r.target} | ${webgpuCell(f)} | ${adapter} | ${fmtMs(f.off?.proveMs)} | ${fmtMs(
        f.on?.proveMs,
      )} | ${speedup} | ${vks} | ${wasm} | ${gpu} | ${f.state ?? '—'} |`;
    })
    .join('\n');
  return `${header}\n${body}\n`;
}

async function main() {
  log(`targets: ${targets.join(', ')} | flow=${argv.flow} | mode=${argv.mode}`);
  const results = [];
  for (const target of targets) {
    results.push(await runOne(target));
  }

  const stamp = new Date().toISOString();
  const md =
    `# Chonk e2e WebGPU matrix\n\n` +
    `- flow: \`${argv.flow}\`\n- mode: \`${argv.mode}\`\n- generated: ${stamp}\n\n` +
    toTable(results);

  mkdirSync(path.dirname(argv.out), { recursive: true });
  writeFileSync(argv.out, md);
  writeFileSync(argv['json-out'], JSON.stringify({ stamp, flow: argv.flow, mode: argv.mode, results }, null, 2));
  log(`wrote ${argv.out} and ${argv['json-out']}`);
  process.stdout.write(md);

  // Non-zero exit if any target didn't reach a clean done.
  const allDone = results.every(r => r.final?.state === 'done');
  process.exit(allDone ? 0 : 1);
}

main().catch(e => {
  log(`fatal: ${e.stack ?? e.message ?? String(e)}`);
  process.exit(99);
});
