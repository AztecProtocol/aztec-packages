// Custom Jest resolver. When CONTRACT_ARTIFACTS_VERSION is set, redirects *only* JSON artifact files under
// @aztec/noir-contracts.js/artifacts/ and @aztec/noir-test-contracts.js/artifacts/ to a local cache of the pinned
// legacy versions. TypeScript wrapper classes (e.g. Token.ts) continue to load from the current workspace and use the
// current @aztec/aztec.js — only the artifact JSON (the deployed-contract ABI / bytecode / notes surface) is swapped.
//
// Why JSON-only: the JSON artifact is the actual interchange surface a "deployed contract" exposes. The TS wrapper is
// generated client-side ergonomics that's tightly coupled to the current @aztec/aztec.js API. Redirecting the wrapper
// would couple this test to a moving aztec.js surface and break at import time on unrelated breaking changes; we want
// to fail only on actual artifact-compat regressions.
//
// The cache is populated on demand by running `npm install` into .legacy-contracts/<version>/.
//
// Activated by env var; passthrough otherwise.
/* eslint-disable @typescript-eslint/no-require-imports */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const version = process.env.CONTRACT_ARTIFACTS_VERSION;
const REDIRECTED = ['@aztec/noir-contracts.js', '@aztec/noir-test-contracts.js'];

// Jest sets rootDir to <e2e>/src; this file lives there too.
const e2eRoot = path.resolve(__dirname, '..');
const cacheRoot = version ? path.join(e2eRoot, '.legacy-contracts', version) : null;

function pkgJsonPath(name) {
  return path.join(cacheRoot, 'node_modules', name, 'package.json');
}

function ensureCache() {
  const missing = REDIRECTED.some(p => !fs.existsSync(pkgJsonPath(p)));
  if (!missing) {
    return;
  }
  fs.mkdirSync(cacheRoot, { recursive: true });
  // Seed a standalone package.json so `npm install --prefix` treats cacheRoot as its own project. Without this, npm
  // walks up and finds the yarn-project workspace root, which breaks on `workspace:` protocol deps and risks
  // clobbering the monorepo's node_modules.
  const seed = path.join(cacheRoot, 'package.json');
  if (!fs.existsSync(seed)) {
    fs.writeFileSync(seed, JSON.stringify({ name: 'legacy-contracts-cache', private: true }));
  }

  const specs = REDIRECTED.map(p => `${p}@${version}`).join(' ');
  process.stderr.write(`[legacy-contracts] installing ${specs} into ${cacheRoot}\n`);
  // --prefix: install into cacheRoot instead of cwd, so the cache is isolated from the monorepo.
  // --no-save: don't write the installed packages back to the seeded package.json.
  // --ignore-scripts: skip lifecycle scripts (preinstall/postinstall) of the legacy packages and their transitive
  //   deps; we only want the files on disk, not to run any build steps.
  // --legacy-peer-deps: tolerate peer-dependency mismatches between the pinned legacy @aztec/* graph and whatever
  //   current versions npm would otherwise try to reconcile.
  execSync(`npm install --prefix "${cacheRoot}" --no-save --ignore-scripts --legacy-peer-deps ${specs}`, {
    stdio: 'inherit',
  });

  // Verify versions on disk match the requested version.
  for (const p of REDIRECTED) {
    const onDisk = JSON.parse(fs.readFileSync(pkgJsonPath(p), 'utf8')).version;
    if (onDisk !== version) {
      throw new Error(`[legacy-contracts] ${p} on disk is ${onDisk}, expected ${version}`);
    }
  }
}

if (version) {
  ensureCache();
}

let bannerPrinted = false;
const seen = new Set();

function printBannerOnce() {
  if (bannerPrinted || !version) {
    return;
  }
  bannerPrinted = true;
  const lines = ['='.repeat(60), `[legacy-contracts][jest] CONTRACT_ARTIFACTS_VERSION=${version}`];
  for (const p of REDIRECTED) {
    const v = JSON.parse(fs.readFileSync(pkgJsonPath(p), 'utf8')).version;
    if (v !== version) {
      throw new Error(`[legacy-contracts] ${p} on disk is ${v}, expected ${version}`);
    }
    lines.push(`[legacy-contracts][jest] redirecting ${p}/artifacts/*.json -> .legacy-contracts/${version}/...`);
  }
  lines.push('='.repeat(60));
  process.stderr.write(lines.join('\n') + '\n');
}

// Match a resolved absolute path against the workspace artifacts dirs and return the legacy cache equivalent, or null
// if it's not an artifact path we should redirect.
function legacyArtifactPath(resolved) {
  if (!resolved.endsWith('.json')) {
    return null;
  }
  for (const pkg of REDIRECTED) {
    // pkg = '@aztec/noir-contracts.js' -> match '/noir-contracts.js/artifacts/'
    const dirName = pkg.split('/')[1];
    const marker = `/${dirName}/artifacts/`;
    const idx = resolved.indexOf(marker);
    if (idx === -1) {
      continue;
    }
    const basename = resolved.slice(idx + marker.length);
    return path.join(cacheRoot, 'node_modules', pkg, 'artifacts', basename);
  }
  return null;
}

module.exports = function legacyResolver(request, options) {
  // Always run the default resolver first. We only inspect (and possibly rewrite) the *result*; this catches both
  // bare-specifier imports of `@aztec/noir-contracts.js/artifacts/foo.json` and the relative `../artifacts/foo.json`
  // imports inside the workspace TS wrapper classes — both resolve to the same workspace artifact path that we then
  // redirect.
  const resolved = options.defaultResolver(request, options);
  if (!version) {
    return resolved;
  }
  printBannerOnce();
  const legacy = legacyArtifactPath(resolved);
  if (!legacy) {
    return resolved;
  }
  if (!fs.existsSync(legacy)) {
    throw new Error(
      `[legacy-contracts] artifact ${path.basename(legacy)} not present in legacy cache @${version}; ` +
        `the contract may have been added after that release. Pin a newer CONTRACT_ARTIFACTS_VERSION or skip this test.`,
    );
  }
  if (!seen.has(resolved)) {
    seen.add(resolved);
    process.stderr.write(`[legacy-contracts][jest] redirected ${path.basename(legacy)} -> ${legacy}\n`);
  }
  return legacy;
};
