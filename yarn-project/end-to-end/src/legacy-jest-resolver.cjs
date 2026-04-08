// Custom Jest resolver. When CONTRACT_ARTIFACTS_VERSION is set, redirects
// imports of @aztec/noir-contracts.js and @aztec/noir-test-contracts.js (and
// their subpaths) into the cache populated by scripts/ensure_legacy_contracts.mjs.
//
// Activated by env var; passthrough otherwise.

const path = require('path');
const fs = require('fs');

const version = process.env.CONTRACT_ARTIFACTS_VERSION;
const REDIRECTED = ['@aztec/noir-contracts.js', '@aztec/noir-test-contracts.js'];

// scripts/test_simple.sh cd's to the end-to-end package root before invoking jest.
const e2eRoot = process.cwd();
const cacheRoot = version ? path.join(e2eRoot, '.legacy-contracts', version) : null;

let bannerPrinted = false;
const seen = new Set();

function printBannerOnce() {
  if (bannerPrinted || !version) {
    return;
  }
  bannerPrinted = true;
  const lines = ['='.repeat(60), `[legacy-contracts][jest] CONTRACT_ARTIFACTS_VERSION=${version}`];
  for (const p of REDIRECTED) {
    let v = '<missing>';
    try {
      v = JSON.parse(fs.readFileSync(path.join(cacheRoot, 'node_modules', p, 'package.json'), 'utf8')).version;
    } catch {}
    if (v !== version) {
      lines.push(`[legacy-contracts][jest] ERROR: ${p} on disk is ${v}, expected ${version}`);
      lines.push('='.repeat(60));
      process.stderr.write(lines.join('\n') + '\n');
      throw new Error('[legacy-contracts] cache version mismatch — run scripts/ensure_legacy_contracts.mjs');
    }
    lines.push(
      `[legacy-contracts][jest] redirecting ${p} -> .legacy-contracts/${version}/node_modules/${p} (version: ${v})`,
    );
  }
  lines.push('='.repeat(60));
  process.stderr.write(lines.join('\n') + '\n');
}

function matchRedirected(request) {
  for (const pkg of REDIRECTED) {
    if (request === pkg) {
      return { pkg, sub: '' };
    }
    if (request.startsWith(pkg + '/')) {
      return { pkg, sub: request.slice(pkg.length) };
    }
  }
  return null;
}

module.exports = function legacyResolver(request, options) {
  if (!version) {
    return options.defaultResolver(request, options);
  }
  printBannerOnce();
  const m = matchRedirected(request);
  if (!m) {
    return options.defaultResolver(request, options);
  }
  // Resolve from inside the cache so node_modules walks find the legacy package first.
  const newOptions = {
    ...options,
    basedir: path.join(cacheRoot, 'node_modules', m.pkg),
    paths: [path.join(cacheRoot, 'node_modules')],
  };
  const resolved = options.defaultResolver(request, newOptions);
  if (!seen.has(request)) {
    seen.add(request);
    process.stderr.write(`[legacy-contracts][jest] resolved ${request} -> ${resolved}\n`);
  }
  return resolved;
};
