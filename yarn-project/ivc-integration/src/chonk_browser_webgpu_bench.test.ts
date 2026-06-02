/**
 * Browser-based ChonkApi::Prove benchmark on the canonical pinned ECDSA-r1
 * transfer flow: WebGPU off vs on.
 *
 * Wraps the same Puppeteer harness as chonk_browser.test.ts and drives
 * window.runChonkWebGpuBench (defined in serve.ts), which fetches the
 * pinned ivc-inputs.msgpack served at /ivc-inputs/<flow>.msgpack, decodes
 * it (gunzip per step), and runs the full proving pipeline twice — once
 * with `webgpuMsm: false`, once with true.
 *
 * Pinned inputs come from `./scripts/test_chonk_standalone_vks_havent_changed.sh
 * --download_pinned_inputs` (see profile-chonk skill) and live at
 * yarn-project/end-to-end/example-app-ivc-inputs-out/<flow>/ivc-inputs.msgpack.
 *
 * Asserts:
 *   - both runs verify
 *   - both runs produce byte-identical verification keys (sanity that
 *     the WebGPU MSM path doesn't corrupt commitments)
 *
 * Emits a JSONL line per measurement via writeBenchmark when BENCHMARK_FD
 * is set.
 *
 * Requires WASM built with -DBBERG_WEBGPU_MSM_HOOK=ON (see
 * barretenberg/cpp/CMakeLists.txt). Without it the on/off paths run the
 * same native Pippenger and the speedup ratio collapses to ~1.
 */
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import { execSync } from 'child_process';
import * as fs from 'fs';
import { existsSync, readFileSync } from 'fs';
import { createServer } from 'http';
import { dirname, join } from 'path';
import { Browser, launch } from 'puppeteer';
import { fileURLToPath } from 'url';

const logger = createLogger('ivc-integration:test:webgpu-bench');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const pinnedInputsRoot = join(projectRoot, '..', 'end-to-end', 'example-app-ivc-inputs-out');

// The canonical Chonk benchmark flow per the profile-chonk skill.
const DEFAULT_FLOW = 'ecdsar1+transfer_1_recursions+sponsored_fpc';

// Two ChonkApi::prove runs end-to-end (real ECDSA flow ~minute on M-class
// hardware) plus browser launch + msgpack fetch/decode.
jest.setTimeout(15 * 60_000);

// JSONL benchmark emitter — mirrors barretenberg/ts/src/benchmark/index.ts.
const benchmarkFd = (() => {
  const raw = process.env.BENCHMARK_FD;
  const fd = raw ? parseInt(raw, 10) : -1;
  if (fd >= 0) {
    try {
      fs.fstatSync(fd);
    } catch {
      throw new Error('BENCHMARK_FD is not open. Did you redirect in your shell?');
    }
  }
  return fd;
})();

function writeBenchmark(name: string, value: number, labels: Record<string, unknown> = {}): void {
  if (benchmarkFd === -1) return;
  const data = {
    timestamp: new Date().toISOString(),
    name,
    type: 'number' as const,
    value,
    ...labels,
  };
  fs.writeSync(benchmarkFd, JSON.stringify(data) + '\n');
}

interface ChonkWebGpuBenchRunResult {
  proveMs: number;
  verifyMs: number;
  verified: boolean;
  proofLength: number;
}

interface ChonkWebGpuBenchResult {
  flow: string;
  /** GPU adapter info from navigator.gpu.requestAdapter — used to verify the
   *  real hardware backend was selected (vs SwiftShader software). */
  adapter: string;
  numCreatorApps: number;
  off: ChonkWebGpuBenchRunResult;
  on: ChonkWebGpuBenchRunResult;
  vksMatch: boolean;
  swiftshaderDetected: boolean;
}

interface ChonkWebGpuBenchPartialResult {
  flow: string;
  adapter: string;
  numCreatorApps: number;
  swiftshaderDetected: boolean;
  off: ChonkWebGpuBenchRunResult;
  onAll?: ChonkWebGpuBenchRunResult;
  onPartial?: ChonkWebGpuBenchRunResult;
  vksMatchOffOnAll?: boolean;
  vksMatchOffOnPartial?: boolean;
  blocklist: readonly string[];
}

describe('Chonk WebGPU MSM benchmark - Browser (ECDSA-r1 transfer)', () => {
  let server: ReturnType<typeof createServer>;
  let browser: Browser;
  let serverUrl: string;
  const flow = process.env.CHONK_BENCH_FLOW ?? DEFAULT_FLOW;

  beforeAll(async () => {
    const pinnedPath = join(pinnedInputsRoot, flow, 'ivc-inputs.msgpack');
    if (!existsSync(pinnedPath)) {
      throw new Error(
        `Pinned inputs not found at ${pinnedPath}. Run from barretenberg/cpp:\n` +
          `  ./scripts/test_chonk_standalone_vks_havent_changed.sh --download_pinned_inputs`,
      );
    }
    logger.info(`Pinned inputs ready: ${pinnedPath}`);

    const distPath = join(projectRoot, 'dist');
    if (!existsSync(join(distPath, 'index.js'))) {
      logger.info('Building browser bundle with webpack...');
      execSync('yarn webpack', { cwd: projectRoot, stdio: 'inherit' });
    }

    const port = await startTestServer();
    serverUrl = `http://localhost:${port}`;
    logger.info(`Test server started on ${serverUrl}`);

    // WebGPU on the real M4 Apple GPU (Metal). The previous Vulkan flag was
    // forcing the SwiftShader software backend on Mac. `--enable-unsafe-webgpu`
    // alone is enough on Chromium 122+ — it picks Metal as the default backend
    // on macOS. Headless still works in the new headless mode (puppeteer's
    // `headless: true` since v22) which has full hardware-accelerated GPU.
    //
    // NB: `--use-vulkan=swiftshader` and `--enable-features=Vulkan` would force
    // software; don't set them. `--use-angle=metal` is for WebGL, not WebGPU,
    // and is unnecessary.
    const launchOptions: any = {
      headless: true,
      // Default puppeteer protocolTimeout (180s) is fine for the 2-run bench
      // but too tight for the 3-mode comparative test (off / on-all /
      // on-blocklist). Bump to 10 minutes — the test's `jest.setTimeout` is
      // already 15 minutes, so 10 here keeps page.evaluate alive for the full
      // three-Chonk-prove sequence.
      protocolTimeout: 10 * 60_000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--enable-unsafe-webgpu',
        '--enable-webgpu-developer-features',
        // Reset any GPU-software fallbacks the test harness might inherit.
        '--disable-vulkan-fallback-to-gl-for-testing',
      ],
    };
    // Prefer puppeteer's full Chrome (with hardware GPU support) over the
    // chrome-headless-shell variant that ships pre-stripped of GPU drivers.
    // Playwright's chromium also works but is built without the WebGPU
    // command flags some adapters need.
    logger.info("Using Puppeteer's default Chrome (full build, hardware GPU)");

    browser = await launch(launchOptions);
    logger.info('Browser launched');
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (server) {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  async function runBenchInBrowser(flowName: string): Promise<ChonkWebGpuBenchResult> {
    const page = await browser.newPage();
    let pageError: Error | null = null;

    try {
      page.on('console', msg => {
        const text = msg.text();
        if (msg.type() === 'error') {
          logger.error(`Browser[error]: ${text}`);
        } else {
          logger.info(`Browser: ${text}`);
        }
      });
      page.on('pageerror', error => {
        logger.error(`Page error: ${error.message}`);
        pageError = error;
      });

      await page.goto(`${serverUrl}/test.html`, { waitUntil: 'networkidle0', timeout: 60_000 });
      if (pageError) throw new Error(`Page error during load: ${String(pageError)}`);

      await page.waitForFunction('typeof window.runChonkWebGpuBench !== "undefined"', { timeout: 60_000 });
      logger.info(`Bench environment ready; running flow=${flowName}…`);

      const result = (await page.evaluate(
        async (f: string) => (window as any).runChonkWebGpuBench(f),
        flowName,
      )) as ChonkWebGpuBenchResult;
      logger.info(
        `Bench done: adapter=[${result.adapter}], off prove=${result.off.proveMs.toFixed(0)}ms, ` +
          `on prove=${result.on.proveMs.toFixed(0)}ms, speedup=${(result.off.proveMs / result.on.proveMs).toFixed(2)}x, ` +
          `vks_match=${result.vksMatch}`,
      );
      return result;
    } finally {
      await page.close();
    }
  }

  it(`runs ChonkApi::prove on ${DEFAULT_FLOW} with WebGPU off and on, reports wall-time delta`, async () => {
    const r = await runBenchInBrowser(flow);
    expect(r.off.verified).toBe(true);

    if (r.swiftshaderDetected) {
      // SwiftShader's BN254 affine arithmetic is not bit-exact; vks_match
      // only holds on real hardware. Run this test on Apple Metal / discrete
      // NVIDIA to validate the on-mode invariant.
      logger.warn(`[bench] adapter=[${r.adapter}] — SwiftShader, skipping on-mode assertions.`);
      return;
    }

    expect(r.on.verified).toBe(true);
    expect(r.vksMatch).toBe(true);

    const labels = { backend: 'wasm-browser', flow };
    writeBenchmark('chonk-prove-webgpu-off', r.off.proveMs, labels);
    writeBenchmark('chonk-prove-webgpu-on', r.on.proveMs, labels);
    writeBenchmark('chonk-verify-webgpu-off', r.off.verifyMs, labels);
    writeBenchmark('chonk-verify-webgpu-on', r.on.verifyMs, labels);
  });

  it(`3-mode comparison (off / on-all / on-blocklist) on ${DEFAULT_FLOW} produces matching VKs`, async () => {
    // The partial-delegation mode asserts that with `webgpuMsmBlocklist` excluding
    // the 23 columns flagged 🟡/🔴 by the distribution analysis
    // (LOOKUP_READ_COUNTS, LOOKUP_READ_TAGS, VK_PRECOMPUTED_POLY), the remaining
    // 89 delegate-eligible MSMs running on the GPU still produce the
    // bit-identical VK that the CPU-only path produces. Three modes total:
    //   off       — webgpu=false, everything native
    //   onAll     — webgpu=true, every MSM at or above WEBGPU_MSM_THRESHOLD
    //               delegates to the GPU (the existing default)
    //   onPartial — webgpu=true, but the three risky labels stay on CPU via
    //               the new C++-side `bb_set_webgpu_msm_blocklist`
    //
    // A passing `vksMatchOffOnPartial` is the actionable signal: it shows the
    // block-list correctly excludes the unsafe columns and the rest of the
    // delegate set computes correct commitments. The `prove` wall times also
    // get logged so we can see whether keeping 23 of 112 MSMs on CPU costs or
    // saves overall time vs the all-GPU path.
    const page = await browser.newPage();
    let pageError: Error | null = null;
    try {
      page.on('console', msg => {
        const text = msg.text();
        if (msg.type() === 'error') logger.error(`Browser[error]: ${text}`);
        else logger.info(`Browser: ${text}`);
      });
      page.on('pageerror', error => {
        logger.error(`Page error: ${error.message}`);
        pageError = error;
      });
      await page.goto(`${serverUrl}/test.html`, { waitUntil: 'networkidle0', timeout: 60_000 });
      if (pageError) throw new Error(`Page error during load: ${String(pageError)}`);
      await page.waitForFunction('typeof window.runChonkWebGpuBenchPartial !== "undefined"', { timeout: 60_000 });

      const result = (await page.evaluate(
        async (f: string) => (window as any).runChonkWebGpuBenchPartial(f),
        flow,
      )) as ChonkWebGpuBenchPartialResult;

      // The off-mode prove must always succeed; that's the native baseline.
      expect(result.off.verified).toBe(true);

      if (result.swiftshaderDetected) {
        // SwiftShader is software WebGPU (used by Chromium on Linux CI boxes
        // without a hardware GPU). Its BN254 affine arithmetic is not
        // bit-exact, so the VK-match invariant only holds on real hardware.
        // The partial-delegation plumbing is still validated end-to-end by
        // the off-mode prove going through the new C++ block-list code path
        // (which is a no-op when webgpu=false, but exercises the option
        // plumbing through bb.js). Run the test on a hardware-GPU host
        // (Apple Metal, discrete NVIDIA) to validate the GPU semantics.
        logger.warn(
          `[bench-partial] adapter=[${result.adapter}] — SwiftShader detected, GPU runs skipped. ` +
            `Run on hardware GPU to validate vks_match invariant.`,
        );
        return;
      }

      logger.info(
        `[bench-partial] off=${result.off.proveMs.toFixed(0)}ms ` +
          `onAll=${result.onAll!.proveMs.toFixed(0)}ms ` +
          `onPartial=${result.onPartial!.proveMs.toFixed(0)}ms ` +
          `vks_match: off↔onAll=${result.vksMatchOffOnAll} off↔onPartial=${result.vksMatchOffOnPartial}`,
      );

      expect(result.onAll!.verified).toBe(true);
      expect(result.onPartial!.verified).toBe(true);
      expect(result.vksMatchOffOnAll).toBe(true);
      expect(result.vksMatchOffOnPartial).toBe(true);

      const labels = { backend: 'wasm-browser', flow };
      writeBenchmark('chonk-prove-webgpu-off', result.off.proveMs, labels);
      writeBenchmark('chonk-prove-webgpu-on-all', result.onAll!.proveMs, labels);
      writeBenchmark('chonk-prove-webgpu-on-blocklist', result.onPartial!.proveMs, labels);
    } finally {
      await page.close();
    }
  });

  it(`captures per-MSM scalar distribution for ${DEFAULT_FLOW} as CSV`, async () => {
    const csvOutPath = process.env.MSM_DIST_CSV_OUT ?? '/tmp/zac-webgpu/chonk-msm-dist.csv';
    let page: any;
    try {
      page = await browser.newPage();
      let pageError: Error | null = null;
      page.on('console', (msg: any) => {
        const text = msg.text();
        if (msg.type() === 'error') logger.error(`Browser[error]: ${text}`);
        else logger.info(`Browser: ${text}`);
      });
      page.on('pageerror', (error: Error) => {
        logger.error(`Page error: ${error.message}`);
        pageError = error;
      });
      await page.goto(`${serverUrl}/test.html`, { waitUntil: 'networkidle0', timeout: 60_000 });
      if (pageError) throw new Error(`Page error during load: ${String(pageError)}`);
      await page.waitForFunction('typeof window.runChonkMsmDistribution !== "undefined"', { timeout: 60_000 });
      logger.info(`Capturing per-MSM scalar distribution for flow=${flow}…`);

      const result = (await page.evaluate(
        async (f: string) => (window as any).runChonkMsmDistribution(f),
        flow,
      )) as {
        flow: string;
        csv: string;
        rowCount: number;
        linesCaptured: number;
        parsed: number;
      };

      const { writeFileSync, mkdirSync } = await import('fs');
      const { dirname } = await import('path');
      mkdirSync(dirname(csvOutPath), { recursive: true });
      writeFileSync(csvOutPath, result.csv);
      logger.info(
        `[msm-dist] rows=${result.rowCount} lines_captured=${result.linesCaptured} parsed=${result.parsed} → ${csvOutPath}`,
      );
      expect(result.rowCount).toBeGreaterThan(0);
    } finally {
      if (page) await page.close();
    }
  }, 600_000);

  it(`captures per-MSM (named) CPU vs GPU times for ${DEFAULT_FLOW} as CSV`, async () => {
    const csvOutPath = process.env.MSM_CSV_OUT ?? '/tmp/chonk-msm-times.csv';
    let page: any;
    try {
      page = await browser.newPage();
      let pageError: Error | null = null;
      page.on('console', (msg: any) => {
        const text = msg.text();
        if (msg.type() === 'error') logger.error(`Browser[error]: ${text}`);
        else logger.info(`Browser: ${text}`);
      });
      page.on('pageerror', (error: Error) => {
        logger.error(`Page error: ${error.message}`);
        pageError = error;
      });
      await page.goto(`${serverUrl}/test.html`, { waitUntil: 'networkidle0', timeout: 60_000 });
      if (pageError) throw new Error(`Page error during load: ${String(pageError)}`);
      await page.waitForFunction('typeof window.runChonkMsmCsv !== "undefined"', { timeout: 60_000 });
      logger.info(`Capturing per-MSM CSV for flow=${flow}…`);

      const result = (await page.evaluate(async (f: string) => (window as any).runChonkMsmCsv(f), flow)) as {
        flow: string;
        adapter: string;
        csv: string;
        rowCount: number;
        cpuOnly: number;
        gpuOnly: number;
        cpuLinesCaptured: number;
        gpuLinesCaptured: number;
        cpuParsed: number;
        gpuParsed: number;
      };

      const { writeFileSync, mkdirSync } = await import('fs');
      const { dirname } = await import('path');
      mkdirSync(dirname(csvOutPath), { recursive: true });
      writeFileSync(csvOutPath, result.csv);
      logger.info(
        `[msm-csv] adapter=[${result.adapter}] rows=${result.rowCount} ` +
          `cpu_only=${result.cpuOnly} gpu_and_cpu=${result.gpuOnly} → ${csvOutPath}`,
      );
      logger.info(
        `[msm-csv] capture diagnostics: cpu_lines=${result.cpuLinesCaptured} parsed=${result.cpuParsed}; ` +
          `gpu_lines=${result.gpuLinesCaptured} parsed=${result.gpuParsed}`,
      );
      expect(result.rowCount).toBeGreaterThan(0);
    } finally {
      if (page) await page.close();
    }
  }, 600_000);

  it(`captures the end-to-end WebGPU Perfetto trace for ${DEFAULT_FLOW}`, async () => {
    // One Perfetto-loadable JSON (ui.perfetto.dev) of ONE webgpu-on Chonk prove, overlaying on
    // one clock: C++/WASM prove phases (one lane per worker), the host MSM bridge phases, the GPU
    // passes, and host↔GPU memory transfers. Requires a hardware-WebGPU host (SwiftShader is not
    // BN254 bit-exact → the prove's own verify fails); detects + skips on software.
    const traceOutPath = process.env.WEBGPU_TRACE_OUT ?? '/tmp/zac-webgpu/chonk-webgpu-e2e-trace.perfetto.json';
    let page: any;
    try {
      page = await browser.newPage();
      let pageError: Error | null = null;
      page.on('console', (msg: any) => {
        const text = msg.text();
        if (msg.type() === 'error') logger.error(`Browser[error]: ${text}`);
        else logger.info(`Browser: ${text}`);
      });
      page.on('pageerror', (error: Error) => {
        logger.error(`Page error: ${error.message}`);
        pageError = error;
      });
      await page.goto(`${serverUrl}/test.html`, { waitUntil: 'networkidle0', timeout: 60_000 });
      if (pageError) throw new Error(`Page error during load: ${String(pageError)}`);
      await page.waitForFunction('typeof window.runChonkWebGpuTrace !== "undefined"', { timeout: 60_000 });
      logger.info(`Capturing e2e WebGPU Perfetto trace for flow=${flow}…`);

      const result = (await page.evaluate(async (f: string) => (window as any).runChonkWebGpuTrace(f), flow)) as {
        flow: string;
        adapter: string;
        swiftshaderDetected: boolean;
        traceJson?: string;
        proveMs: number;
        verified: boolean;
        alignment?: { b: number; bMinus1: number; maxResidualMs: number; rmsResidualMs: number; anchors: number };
        counts: { cppEvents: number; cpu: number; gpu: number; mem: number; untracked: number; lanes: number };
        validation: {
          gpuPassSumMs: number;
          bridgeSubmitWaitSumMs: number;
          cppRootMs: number;
          proveMs: number;
          untrackedMs: number;
        };
      };

      if (result.swiftshaderDetected) {
        logger.warn(
          `[trace] adapter=[${result.adapter}] — SwiftShader/software WebGPU; a valid trace can't be ` +
            `captured (verify would fail). Run on a hardware GPU (Apple Metal / discrete NVIDIA).`,
        );
        return;
      }

      expect(result.verified).toBe(true);
      expect(result.traceJson).toBeTruthy();

      const { writeFileSync, mkdirSync } = await import('fs');
      const { dirname } = await import('path');
      mkdirSync(dirname(traceOutPath), { recursive: true });
      writeFileSync(traceOutPath, result.traceJson!);

      logger.info(
        `[trace] adapter=[${result.adapter}] prove=${result.proveMs.toFixed(0)}ms verified=${result.verified} ` +
          `lanes=${result.counts.lanes} cppEvents=${result.counts.cppEvents} ` +
          `cpu=${result.counts.cpu} gpu=${result.counts.gpu} mem=${result.counts.mem} → ${traceOutPath}`,
      );
      if (result.alignment) {
        logger.info(
          `[trace] alignment: anchors=${result.alignment.anchors} b-1=${result.alignment.bMinus1.toExponential(2)} ` +
            `maxResidual=${(result.alignment.maxResidualMs * 1000).toFixed(0)}µs ` +
            `rmsResidual=${(result.alignment.rmsResidualMs * 1000).toFixed(0)}µs`,
        );
        // Date.now() is 1ms-quantized so a per-event/anchor floor of ~0.5ms is expected; 1.5ms gives
        // slack. A larger residual indicates tab backgrounding (divergently throttled clocks).
        expect(result.alignment.maxResidualMs).toBeLessThan(1.5);
      }
      logger.info(
        `[trace] validation: Σgpu_passes=${result.validation.gpuPassSumMs.toFixed(1)}ms ` +
          `Σbridge_submit_wait=${result.validation.bridgeSubmitWaitSumMs.toFixed(1)}ms ` +
          `cpp_prove_root=${result.validation.cppRootMs.toFixed(0)}ms prove_wall=${result.validation.proveMs.toFixed(0)}ms ` +
          `untracked=${result.validation.untrackedMs.toFixed(0)}ms`,
      );

      expect(result.counts.cppEvents).toBeGreaterThan(0);
      expect(result.counts.gpu).toBeGreaterThan(0);
      // The C++ prove root maps to roughly the host-measured prove wall — the cross-clock fit landed
      // the WASM lanes on the right timeline (not off by a factor or sign). Wide bounds: backend.prove
      // wall includes msgpack encode/decode + the JS↔WASM round-trip around ChonkAPI::prove.
      expect(result.validation.cppRootMs).toBeGreaterThan(result.proveMs * 0.5);
      expect(result.validation.cppRootMs).toBeLessThan(result.proveMs * 1.5);
    } finally {
      if (page) await page.close();
    }
  }, 600_000);

  function startTestServer(): Promise<number> {
    return new Promise((resolve, reject) => {
      const distPath = join(projectRoot, 'dist');

      server = createServer((req, res) => {
        // COOP/COEP for SharedArrayBuffer (multi-threaded WASM).
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Cache-Control', 'no-store');

        const url = req.url ?? '/';

        if (url === '/test.html') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(createBenchHtml());
          return;
        }
        if (url === '/') {
          res.writeHead(302, { Location: '/test.html' });
          res.end();
          return;
        }
        // /ivc-inputs/<flow>.msgpack — read straight from the pinned inputs dir.
        if (url.startsWith('/ivc-inputs/') && url.endsWith('.msgpack')) {
          const flowName = url.slice('/ivc-inputs/'.length, -'.msgpack'.length);
          const filePath = join(pinnedInputsRoot, flowName, 'ivc-inputs.msgpack');
          if (existsSync(filePath)) {
            const content = readFileSync(filePath);
            res.writeHead(200, {
              'Content-Type': 'application/octet-stream',
              'Content-Length': content.length,
            });
            res.end(content);
          } else {
            res.writeHead(404);
            res.end(`Pinned inputs not found for flow '${flowName}' at ${filePath}`);
          }
          return;
        }
        // Static files from dist/ (the webpack bundle).
        const filePath = join(distPath, url);
        try {
          if (existsSync(filePath)) {
            const content = readFileSync(filePath);
            const ext = filePath.split('.').pop() || '';
            const contentTypes: Record<string, string> = {
              js: 'application/javascript; charset=utf-8',
              wasm: 'application/wasm',
              json: 'application/json',
              css: 'text/css',
              html: 'text/html; charset=utf-8',
            };
            res.writeHead(200, {
              'Content-Type': contentTypes[ext] || 'application/octet-stream',
              'Content-Length': content.length,
            });
            res.end(content);
          } else {
            res.writeHead(404);
            res.end('Not found: ' + url);
          }
        } catch (error: any) {
          res.writeHead(500);
          res.end('Server error: ' + error.message);
        }
      });

      server.listen(8081, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          resolve(addr.port);
        } else {
          reject(new Error('Failed to get server port'));
        }
      });

      server.on('error', reject);
    });
  }

  function createBenchHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Chonk WebGPU MSM Benchmark — ${DEFAULT_FLOW}</title>
</head>
<body>
  <h1>Chonk WebGPU MSM Benchmark</h1>
  <p>Flow: <code>${DEFAULT_FLOW}</code></p>
  <div id="status">Initializing…</div>
  <script src="index.js"></script>
</body>
</html>`;
  }
});
