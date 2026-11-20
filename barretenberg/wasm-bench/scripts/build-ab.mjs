#!/usr/bin/env node
// Lay out two-variant wasm bundles for paired A/B runs.
//
// Use after `node scripts/build.mjs` has produced dest/. Copies the chosen
// wasm.gz files into dest/wasm/<variant>/barretenberg-threads.wasm.gz and
// records md5sums (and an optional "same-wasm" flag for A==B harness sanity).
//
// Usage:
//   node scripts/build-ab.mjs \
//     --variant a=build-wasm-threads/bin/barretenberg.wasm.gz \
//     --variant b=build-wasm-threads/bin/barretenberg.wasm.gz
//
// For A==B harness validation, point both variants at the same file. The
// resulting manifest reports identical md5s, which downstream analyzers can
// use to assert "ground truth Δ should be zero".

import { copyFile, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { Command } from 'commander';

import { defaultDistDir } from './lib.mjs';

async function md5(path) {
  const data = await readFile(path);
  return createHash('md5').update(data).digest('hex');
}

async function main(argv) {
  const program = new Command();
  program
    .option('--dist <path>', 'Built harness directory', process.env.WASM_BENCH_DIST_DIR || defaultDistDir)
    .option('--variant <spec...>', 'Variant "name=path" pair (repeatable)', collect, [])
    .option('--single-variant-name <name>', 'When set, alias the legacy /wasm/<wasm.gz> layout to this variant name as well')
    .parse(argv);

  const options = program.opts();
  if (!options.variant?.length) {
    throw new Error('At least one --variant name=path is required');
  }

  const dist = resolve(options.dist);
  const manifest = {
    generatedAt: new Date().toISOString(),
    dist,
    variants: {},
  };

  for (const spec of options.variant) {
    const idx = spec.indexOf('=');
    if (idx <= 0) {
      throw new Error(`Malformed --variant "${spec}"; expected name=path`);
    }
    const name = spec.slice(0, idx).trim();
    if (!/^[a-z0-9_-]+$/i.test(name)) {
      throw new Error(`Invalid variant name "${name}"; allow [A-Za-z0-9_-] only`);
    }
    const source = resolve(spec.slice(idx + 1));
    const info = await stat(source);
    if (!info.isFile() || info.size === 0) {
      throw new Error(`Source wasm not readable or empty: ${source}`);
    }
    const variantDir = resolve(dist, 'wasm', name);
    const target = resolve(variantDir, 'barretenberg-threads.wasm.gz');
    await mkdir(variantDir, { recursive: true });
    await copyFile(source, target);
    const hash = await md5(target);
    manifest.variants[name] = { source, target, sizeBytes: info.size, md5: hash };
    console.log(`variant ${name}: ${source} → ${target} (${info.size} B, md5=${hash})`);
  }

  const md5s = Object.values(manifest.variants).map(v => v.md5);
  manifest.allSameMd5 = md5s.every(h => h === md5s[0]);
  manifest.note = manifest.allSameMd5
    ? 'All variant md5s are identical — A==B harness validation (ground truth Δ should be zero).'
    : 'Variant md5s differ — A/B comparison harness.';
  await writeFile(resolve(dist, 'wasm', 'variants.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(manifest.note);
}

function collect(value, previous) {
  return previous ? [...previous, value] : [value];
}

main(process.argv).catch(error => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
