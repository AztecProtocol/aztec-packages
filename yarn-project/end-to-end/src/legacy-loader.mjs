// Node module resolver hook that redirects imports of @aztec/noir-contracts.js and
// @aztec/noir-test-contracts.js (and their subpaths) to a pinned legacy version installed
// under .legacy-contracts/<version>/node_modules/ by ensure_legacy_contracts.mjs.
//
// Activated when CONTRACT_ARTIFACTS_VERSION is set. Otherwise this is a passthrough.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const version = process.env.CONTRACT_ARTIFACTS_VERSION;
const REDIRECTED = ['@aztec/noir-contracts.js', '@aztec/noir-test-contracts.js'];

const here = dirname(fileURLToPath(import.meta.url));
// src/legacy-loader.mjs -> end-to-end root
const e2eRoot = resolvePath(here, '..');
const cacheRoot = version ? join(e2eRoot, '.legacy-contracts', version) : null;

const seenSpecifiers = new Set();

function readVersion(pkgName) {
  try {
    const pj = JSON.parse(readFileSync(join(cacheRoot, 'node_modules', pkgName, 'package.json'), 'utf8'));
    return pj.version;
  } catch {
    return null;
  }
}

if (version) {
  const banner = ['='.repeat(60), `[legacy-contracts] CONTRACT_ARTIFACTS_VERSION=${version}`];
  let ok = true;
  for (const p of REDIRECTED) {
    const v = readVersion(p);
    if (v !== version) {
      banner.push(`[legacy-contracts] ERROR: ${p} on disk is ${v ?? '<missing>'}, expected ${version}`);
      ok = false;
    } else {
      banner.push(
        `[legacy-contracts] redirecting ${p} -> .legacy-contracts/${version}/node_modules/${p} (version: ${v})`,
      );
    }
  }
  banner.push('='.repeat(60));
  process.stderr.write(banner.join('\n') + '\n');
  if (!ok) {
    throw new Error('[legacy-contracts] cache version mismatch — run scripts/ensure_legacy_contracts.mjs');
  }
}

function matchRedirected(specifier) {
  for (const pkg of REDIRECTED) {
    if (specifier === pkg) {
      return { pkg, sub: '' };
    }
    if (specifier.startsWith(pkg + '/')) {
      return { pkg, sub: specifier.slice(pkg.length) };
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (!version) {
    return nextResolve(specifier, context);
  }
  const m = matchRedirected(specifier);
  if (!m) {
    return nextResolve(specifier, context);
  }
  // Resolve as if importing from inside the cache directory so node walks
  // .legacy-contracts/<version>/node_modules first.
  const parentURL = pathToFileURL(join(cacheRoot, 'package.json')).href;
  const result = await nextResolve(m.pkg + m.sub, { ...context, parentURL });

  if (!seenSpecifiers.has(specifier)) {
    seenSpecifiers.add(specifier);
    const resolvedPath = result.url.startsWith('file://') ? fileURLToPath(result.url) : result.url;
    process.stderr.write(`[legacy-contracts] resolved ${specifier} -> ${resolvedPath}\n`);
  }
  return result;
}
