// Screenshot-readable benchmark banner overlay for the WebGPU MSM dev page.
//
// Importing this module (BEFORE ./main.ts) does two things:
//   1. Pre-creates the hidden DOM control elements main.ts grabs at module
//      load via getElementById(...) and immediately calls addEventListener /
//      .value / .textContent on. Without them main.ts throws a null-deref at
//      import time on a minimal host page. They are created display:none so
//      the page shows only the banner.
//   2. Installs a fixed full-screen high-contrast banner that polls
//      window.__MSM_RESULTS__ (set by results_post.ts via postResults) and,
//      once present, renders the key fields large enough to read off a
//      BrowserStack screenshot. Uncaught errors / rejections render as
//      STATUS=ERR so a screenshot always shows something diagnostic.
//
// Dependency-free: raw DOM only.

// Element ids main.ts reads at module scope (see dev/msm-webgpu/main.ts
// getElementById block + the input/value/textContent touches that run on
// import). Buttons get type=button; logn/mt-threads are number inputs;
// noble is a checkbox; the rest are spans/divs. Created hidden.
const STUB_BUTTON_IDS = ['run', 'run-bench', 'run-sweep', 'run-sanity', 'probe-gpu', 'stop', 'toggle-coi'];
const STUB_SPAN_IDS = ['status', 'n-display', 'hw-threads'];
const STUB_DIV_IDS = ['srs-progress', 'log', 'results'];

function ensureStubDom(): void {
  const host = document.createElement('div');
  host.id = '__msm_stub_controls';
  host.style.display = 'none';

  for (const id of STUB_BUTTON_IDS) {
    if (document.getElementById(id)) continue;
    const b = document.createElement('button');
    b.id = id;
    b.type = 'button';
    host.appendChild(b);
  }
  for (const id of STUB_SPAN_IDS) {
    if (document.getElementById(id)) continue;
    const s = document.createElement('span');
    s.id = id;
    host.appendChild(s);
  }
  for (const id of STUB_DIV_IDS) {
    if (document.getElementById(id)) continue;
    const d = document.createElement('div');
    d.id = id;
    host.appendChild(d);
  }
  if (!document.getElementById('logn')) {
    const i = document.createElement('input');
    i.type = 'number';
    i.id = 'logn';
    i.value = '16';
    host.appendChild(i);
  }
  if (!document.getElementById('mt-threads')) {
    const i = document.createElement('input');
    i.type = 'number';
    i.id = 'mt-threads';
    host.appendChild(i);
  }
  if (!document.getElementById('noble')) {
    const i = document.createElement('input');
    i.type = 'checkbox';
    i.id = 'noble';
    host.appendChild(i);
  }
  document.body.appendChild(host);
}

let bannerEl: HTMLDivElement | null = null;

function ensureBanner(): HTMLDivElement {
  if (bannerEl) return bannerEl;
  const el = document.createElement('div');
  el.id = '__msm_bench_banner';
  el.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'right:0',
    'z-index:99999',
    'background:#000',
    'color:#9eff00',
    'font-family:monospace',
    'font-weight:bold',
    'font-size:32px',
    'line-height:1.25',
    'padding:16px',
    'white-space:pre',
    'overflow-wrap:anywhere',
  ].join(';');
  document.body.appendChild(el);
  bannerEl = el;
  return el;
}

function render(lines: string[]): void {
  ensureBanner().textContent = lines.join('\n');
}

// Pull a numeric field from a possibly-nested results object. The msm-bench
// payload nests timing under results.averages; we also accept top-level
// fallbacks so the banner survives shape tweaks.
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function readResults(r: Record<string, unknown>): string[] {
  const params = (r.params ?? {}) as Record<string, unknown>;
  const results = (r.results ?? {}) as Record<string, unknown>;
  const averages = (results.averages ?? {}) as Record<string, unknown>;

  // Correctness: msm-bench has no cross-check field, so OK is derived from
  // state==='done'. msm-cross-check exposes results.cross_ok.
  const state = typeof r.state === 'string' ? (r.state as string) : undefined;
  const crossOk = typeof results.cross_ok === 'boolean' ? (results.cross_ok as boolean) : undefined;
  const match = crossOk !== undefined ? crossOk : state === 'done';
  const status = match ? 'OK' : 'BAD';
  const matchVal = crossOk !== undefined ? String(crossOk) : (state ?? 'undefined');

  // Wall-clock median/avg ms. msm-bench reports averages.wallMs (mean of the
  // per-rep wall samples — the wall-clock figure; gpuMs is the summed
  // per-pass GPU time, not wall). Fall back to top-level wallMs/ms.
  const ms =
    num(averages.wallMs) ?? num(results.wallMs) ?? num(r.wallMs) ?? num(results.ms) ?? num(r.ms);

  // Peak GPU memory: this page's postResults payload does NOT currently
  // include a peak-GPU-memory field, so search a few plausible names and
  // show n/a if absent.
  const memBytes =
    num(results.peakGpuBytes) ??
    num(results.peak_gpu_bytes) ??
    num(results.peakBytes) ??
    num(results.gpuPeakBytes) ??
    num(r.peakGpuBytes) ??
    num(r.peak_gpu_bytes);

  const logn = num(params.logN) ?? num(params.logn) ?? num(r.logN);
  const algo =
    (typeof params.page === 'string' ? (params.page as string) : undefined) ??
    (typeof r.page === 'string' ? (r.page as string) : undefined) ??
    'webgpu';
  const s = num(params.s) ?? num(params.S);
  const tpb = num(params.tpb) ?? num(params.wgi) ?? num(params.workers);

  return [
    `STATUS=${status}`,
    `MATCH=${matchVal}`,
    `MS=${ms !== undefined ? ms.toFixed(2) : 'n/a'}`,
    `MEM_MB=${memBytes !== undefined ? (memBytes / 1048576).toFixed(2) : 'n/a'}`,
    `LOGN=${logn !== undefined ? logn : 'n/a'}`,
    `ALGO=${algo}`,
    `S=${s !== undefined ? s : 'n/a'}`,
    `TPB=${tpb !== undefined ? tpb : 'n/a'}`,
    `=== DONE ===`,
  ];
}

let captured: Record<string, unknown> | null = null;
let onErrRef: (msg: string) => void = () => {};

function tryRender(r: Record<string, unknown>): void {
  try {
    render(readResults(r));
  } catch (err) {
    onErrRef(err instanceof Error ? err.message : String(err));
  }
}

// main.ts's results client (results_post.ts) reports the final payload by
// POSTing JSON to `${origin}/results`. On a static host that endpoint 404s,
// but the payload still flows through fetch(). Intercept it so the banner
// works without main.ts setting any global. We also poll
// window.__MSM_RESULTS__ as a fallback for variants that set it.
function patchFetch(): void {
  const orig = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      if (url && /\/results(\?|$)/.test(url) && init?.method === 'POST' && typeof init.body === 'string') {
        const parsed = JSON.parse(init.body) as Record<string, unknown>;
        captured = parsed;
        tryRender(parsed);
      }
    } catch {
      // ignore parse/inspection failures — never break the real fetch.
    }
    return orig(input as RequestInfo, init);
  }) as typeof window.fetch;
}

function install(): void {
  ensureStubDom();
  render(['STATUS=RUNNING']);

  onErrRef = (msg: string): void => {
    render([`STATUS=ERR`, msg.slice(0, 400), `=== DONE ===`]);
  };
  window.addEventListener('error', e => {
    onErrRef(e.message || String(e.error ?? 'error'));
  });
  window.addEventListener('unhandledrejection', e => {
    const reason = (e as PromiseRejectionEvent).reason;
    onErrRef(reason instanceof Error ? reason.message : String(reason));
  });

  patchFetch();

  const timer = window.setInterval(() => {
    if (captured) {
      window.clearInterval(timer);
      return;
    }
    const r = (window as unknown as { __MSM_RESULTS__?: Record<string, unknown> }).__MSM_RESULTS__;
    if (r && typeof r === 'object') {
      window.clearInterval(timer);
      tryRender(r);
    }
  }, 250);
}

if (document.body) {
  install();
} else {
  window.addEventListener('DOMContentLoaded', install);
}
