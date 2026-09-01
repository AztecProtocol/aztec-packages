import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const scriptDir = dirname(fileURLToPath(import.meta.url));
export const packageRoot = resolve(scriptDir, '..');
export const repoRoot = resolve(packageRoot, '../..');
export const configPath = resolve(packageRoot, 'wasm-bench.config.json');
export const defaultDistDir = resolve(packageRoot, 'dest');
export const defaultInputsDir = resolve(repoRoot, 'yarn-project/end-to-end/example-app-ivc-inputs-out');
export const defaultHtmlPreviewBase = 'https://htmlpreview.github.io/?';

export function loadConfig(path = configPath) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value: ${value}`);
}

export function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got ${value}`);
  }
  return parsed;
}

export function encodeBenchParam(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeBenchParam(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

export function safeResolve(root, requestPath) {
  if (requestPath.includes('\0')) {
    throw new Error('Path contains a NUL byte');
  }
  const normalizedRoot = resolve(root);
  const relativeRequest = requestPath.startsWith('/') ? `.${requestPath}` : requestPath;
  const resolved = resolve(normalizedRoot, decodeURIComponent(relativeRequest));
  const diff = relative(normalizedRoot, resolved);
  if (diff === '' || (diff !== '..' && !diff.startsWith(`..${sep}`) && !isAbsolute(diff))) {
    return resolved;
  }
  throw new Error(`Path escapes root: ${requestPath}`);
}

export function getTarget(config, targetName) {
  const target = config.targets[targetName];
  if (!target) {
    const available = Object.keys(config.targets).sort().join(', ');
    throw new Error(`Unknown target "${targetName}". Available targets: ${available}`);
  }
  return target;
}

export function listTargetLines(config) {
  return Object.entries(config.targets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, target]) => `${name}\t${target.label}\t${target.chip}`);
}

export function resolveTargetNames(config, { target, matrix }) {
  if (matrix) {
    const configured = config.matrices[matrix];
    if (configured) {
      return configured;
    }
    return matrix.split(',').map(value => value.trim()).filter(Boolean);
  }
  const raw = target || 'macos';
  if (config.matrices[raw]) {
    return config.matrices[raw];
  }
  return raw.split(',').map(value => value.trim()).filter(Boolean);
}

export function withBenchParam(baseUrl, benchOptions) {
  const url = new URL(baseUrl);
  if (url.pathname === '' || url.pathname === '/') {
    url.pathname = '/index.html';
  }
  url.searchParams.set('bench', encodeBenchParam(benchOptions));
  return url.toString();
}

export function htmlPreviewUrlForRawUrl(rawUrl, previewBase = defaultHtmlPreviewBase) {
  if (!rawUrl) {
    return undefined;
  }
  if (previewBase.endsWith('?')) {
    return `${previewBase}${rawUrl}`;
  }
  if (previewBase.endsWith('=')) {
    return `${previewBase}${encodeURIComponent(rawUrl)}`;
  }
  const joiner = previewBase.includes('?') ? '&url=' : '?url=';
  return `${previewBase}${joiner}${encodeURIComponent(rawUrl)}`;
}

export function createBenchOptions(config, targetName, options = {}) {
  const target = getTarget(config, targetName);
  return {
    benchmark: config.defaultBenchmark,
    flow: options.flow ?? config.defaultFlow,
    runs: options.runs ?? config.defaultRuns,
    threads: options.threads ?? config.defaultThreads,
    smoke: Boolean(options.smoke),
    ...(options.srsSize ? { srsSize: options.srsSize } : {}),
    ...(options.grumpkinSrsSize ? { grumpkinSrsSize: options.grumpkinSrsSize } : {}),
    ...(target.benchOverrides ?? {}),
    ...(options.memMaxPages ? { memMaxPages: options.memMaxPages } : {}),
  };
}

export function createBrowserStackWorkerBody(targetName, target, benchUrl, options = {}) {
  if (!target.browserstackWorker) {
    return undefined;
  }
  return {
    ...structuredClone(target.browserstackWorker),
    url: benchUrl,
    timeout: options.timeout ?? 1800,
    name: options.name ?? `wasm-bench ${targetName}`,
    build: options.build ?? `wasm-bench-${new Date().toISOString().slice(0, 10)}`,
  };
}

export function createLinkPlan(config, options = {}) {
  const targetNames = resolveTargetNames(config, options);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const baseUrl = options.url;
  if (!baseUrl) {
    throw new Error('Pass --url with the served wasm-bench origin.');
  }
  const htmlPreviewUrl = htmlPreviewUrlForRawUrl(options.gistRawUrl, options.previewBase);
  return {
    generatedAt,
    baseUrl,
    html: {
      ...(options.htmlPath ? { path: options.htmlPath } : {}),
      ...(options.gistRawUrl ? { rawUrl: options.gistRawUrl } : {}),
      ...(htmlPreviewUrl ? { previewUrl: htmlPreviewUrl } : {}),
    },
    targets: targetNames.map(targetName => {
      const target = getTarget(config, targetName);
      const benchOptions = createBenchOptions(config, targetName, options);
      const benchUrl = withBenchParam(baseUrl, benchOptions);
      return {
        target: targetName,
        label: target.label,
        chip: target.chip,
        firstProgressMs: target.firstProgressMs,
        benchOptions,
        benchUrl,
        browserstackWorker: createBrowserStackWorkerBody(targetName, target, benchUrl, options),
      };
    }),
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function jsonForScript(value) {
  return JSON.stringify(value, null, 2).replaceAll('<', '\\u003c');
}

export function renderPreviewHtml(plan) {
  const rows = plan.targets
    .map(row => `
        <article>
          <h2>${escapeHtml(row.target)}</h2>
          <p>${escapeHtml(row.label)} - ${escapeHtml(row.chip)}</p>
          <a href="${escapeHtml(row.benchUrl)}">Open bench link</a>
          <details>
            <summary>BrowserStack worker JSON</summary>
            <pre>${escapeHtml(JSON.stringify(row.browserstackWorker, null, 2))}</pre>
          </details>
        </article>`)
    .join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Barretenberg Wasm Bench Links</title>
    <style>
      :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; background: #101417; color: #eef2f4; }
      main { max-width: 940px; margin: 0 auto; padding: 28px 18px; }
      h1 { margin: 0 0 8px; font-size: 24px; letter-spacing: 0; }
      article { border-top: 1px solid #33404a; padding: 18px 0; }
      h2 { margin: 0 0 4px; font-size: 17px; letter-spacing: 0; }
      p { margin: 0 0 10px; color: #b7c0c7; }
      a { color: #d4f05f; overflow-wrap: anywhere; }
      summary { cursor: pointer; margin-top: 12px; color: #b7c0c7; }
      pre { overflow: auto; padding: 12px; border-radius: 6px; background: #070a0c; font-size: 12px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Barretenberg Wasm Bench Links</h1>
      <p>Generated ${escapeHtml(plan.generatedAt)} from ${escapeHtml(plan.baseUrl)}</p>
${rows}
    </main>
    <script type="application/json" id="wasm-bench-link-plan">${jsonForScript(plan)}</script>
  </body>
</html>
`;
}

export function formatLinkPlanText(plan) {
  const lines = [];
  if (plan.html.previewUrl) {
    lines.push(`preview\t${plan.html.previewUrl}`);
  }
  for (const row of plan.targets) {
    lines.push(`${row.target}\t${row.benchUrl}`);
  }
  return `${lines.join('\n')}\n`;
}

export function proveTotalMs(run) {
  if (Number.isFinite(run?.proveTotalMs)) {
    return run.proveTotalMs;
  }
  return Number(run?.setupMs ?? 0) + Number(run?.proveMs ?? 0);
}

export function formatHeadline(targetName, result) {
  if (result?.smoke) {
    return `${targetName}\tsmoke\twallMs=${Math.round(result.wallMs)}`;
  }
  const rows = result?.runs ?? [];
  if (rows.length === 0) {
    return `${targetName}\tno-runs`;
  }
  return rows
    .map(run => `${targetName}\trun=${run.run}\tproveTotalMs=${Math.round(proveTotalMs(run))}\tsetupMs=${Math.round(run.setupMs)}\tproveMs=${Math.round(run.proveMs)}`)
    .join('\n');
}

export function requireExistingFile(path, message) {
  if (!existsSync(path)) {
    throw new Error(message);
  }
  return path;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
