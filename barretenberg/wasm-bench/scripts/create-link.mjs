import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Command } from 'commander';

import {
  createLinkPlan,
  defaultHtmlPreviewBase,
  formatLinkPlanText,
  listTargetLines,
  loadConfig,
  parseBoolean,
  parsePositiveInteger,
  renderPreviewHtml,
} from './lib.mjs';

function parseThreads(value) {
  if (value === 'auto') {
    return value;
  }
  return parsePositiveInteger(value, 'threads');
}

async function writeTextFile(path, body) {
  if (!path) {
    return;
  }
  const resolved = resolve(path);
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, body);
}

export async function main(argv = process.argv) {
  const config = loadConfig();
  const program = new Command();
  program
    .option('--url <url>', 'Served wasm-bench origin or index.html URL')
    .option('--target <target>', 'Target name, comma list, matrix name, or "true" to list targets', 'macos')
    .option('--matrix <matrix>', 'Matrix name or comma-separated target list')
    .option('--flow <flow>', 'Pinned Chonk input flow', config.defaultFlow)
    .option('--runs <runs>', 'Runs per target', value => parsePositiveInteger(value, 'runs'), config.defaultRuns)
    .option('--threads <threads>', 'Thread count or "auto"', parseThreads, config.defaultThreads)
    .option('--smoke <bool>', 'Stop after wasm/input initialization', value => parseBoolean(value), parseBoolean(process.env.WASM_BENCH_SMOKE, false))
    .option('--mem-max-pages <pages>', 'Override WebAssembly.Memory maximum pages', value => parsePositiveInteger(value, 'mem-max-pages'))
    .option('--srs-size <points>', 'Override BN254 SRS point count', value => parsePositiveInteger(value, 'srs-size'))
    .option('--grumpkin-srs-size <points>', 'Override Grumpkin SRS point count', value => parsePositiveInteger(value, 'grumpkin-srs-size'))
    .option('--timeout <seconds>', 'BrowserStack /5/worker timeout', value => parsePositiveInteger(value, 'timeout'), 1800)
    .option('--name <name>', 'BrowserStack worker name')
    .option('--build <name>', 'BrowserStack worker build name')
    .option('--html <path>', 'Write gist-preview HTML link page')
    .option('--json <path>', 'Write bot-friendly JSON link plan')
    .option('--gist-raw-url <url>', 'Raw gist URL for the generated HTML file')
    .option('--preview-base <url>', 'HTML preview service prefix', defaultHtmlPreviewBase)
    .option('--format <format>', 'Stdout format: text or json', 'text')
    .parse(argv);

  const options = program.opts();
  if (options.target === 'true') {
    console.log(listTargetLines(config).join('\n'));
    return undefined;
  }

  const htmlPath = options.html ? resolve(options.html) : undefined;
  const plan = createLinkPlan(config, { ...options, htmlPath, previewBase: options.previewBase });
  const json = `${JSON.stringify(plan, null, 2)}\n`;
  await writeTextFile(options.json, json);
  await writeTextFile(htmlPath, renderPreviewHtml(plan));

  if (options.format === 'json') {
    process.stdout.write(json);
  } else if (options.format === 'text') {
    process.stdout.write(formatLinkPlanText(plan));
  } else {
    throw new Error(`Unknown --format ${options.format}; expected text or json`);
  }
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
