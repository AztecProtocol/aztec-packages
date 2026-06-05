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
    expect(r.on.verified).toBe(true);
    expect(r.vksMatch).toBe(true);

    const labels = { backend: 'wasm-browser', flow };
    writeBenchmark('chonk-prove-webgpu-off', r.off.proveMs, labels);
    writeBenchmark('chonk-prove-webgpu-on', r.on.proveMs, labels);
    writeBenchmark('chonk-verify-webgpu-off', r.off.verifyMs, labels);
    writeBenchmark('chonk-verify-webgpu-on', r.on.verifyMs, labels);
  });

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

  it(`oracle prove (route only the oracle-selected MSMs) for ${DEFAULT_FLOW}`, async () => {
    const seqsPath = process.env.MSM_ORACLE_SEQS;
    if (!seqsPath || !existsSync(seqsPath)) {
      logger.warn(`[oracle] MSM_ORACLE_SEQS unset/missing (${seqsPath}); skipping. Run the CSV test first.`);
      return;
    }
    const seqs = JSON.parse(readFileSync(seqsPath, 'utf8')) as number[];
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
      await page.waitForFunction('typeof window.runChonkOracleProve !== "undefined"', { timeout: 60_000 });
      logger.info(`[oracle] running off/on/oracle for flow=${flow}, routing ${seqs.length} MSMs…`);

      const r = (await page.evaluate(
        async (f: string, ss: number[]) => (window as any).runChonkOracleProve(f, ss),
        flow,
        seqs,
      )) as { flow: string; off: number; on: number; oracle: number; numRouted: number; verified: boolean; vksMatch: boolean };

      logger.info(
        `[oracle-result] off=${r.off.toFixed(0)}ms  on=${r.on.toFixed(0)}ms  oracle=${r.oracle.toFixed(0)}ms  ` +
          `(routed ${r.numRouted}, verified=${r.verified}, vks_match=${r.vksMatch})`,
      );
      expect(r.verified).toBe(true);
      expect(r.vksMatch).toBe(true);
      const labels = { backend: 'wasm-browser', flow };
      writeBenchmark('chonk-prove-webgpu-off', r.off, labels);
      writeBenchmark('chonk-prove-webgpu-on', r.on, labels);
      writeBenchmark('chonk-prove-oracle', r.oracle, labels);
    } finally {
      if (page) await page.close();
    }
  }, 900_000);

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
