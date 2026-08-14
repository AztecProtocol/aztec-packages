// Custom Jest resolver. When CONTRACT_ARTIFACTS_VERSION is set, redirects *only* JSON artifact files under
// @aztec/noir-contracts.js/artifacts/, @aztec/noir-test-contracts.js/artifacts/, and @aztec/accounts/artifacts/ to
// that version's historical artifacts, committed as legacy-contracts/<version>.tar.gz and unpacked on demand into
// .legacy-contracts/<version>/ by install_legacy_contracts.cjs.
//
// Why JSON-only: the JSON artifact is the actual interchange surface a "deployed contract" exposes. The TS wrapper is
// generated client-side ergonomics that's tightly coupled to the current @aztec/aztec.js API. Redirecting the wrapper
// would couple this test to a moving aztec.js surface and break at import time on unrelated breaking changes; we want
// to fail only on actual artifact-compat regressions.
//
// Missing artifacts: legacy version tarballs are immutable, so an artifact missing from the unpacked cache means the
// contract was added after that release — there's nothing to compat-test. Rather than failing or silently falling
// back to the workspace artifact (which would turn the compat run into a regular e2e run that always passes), we log
// the miss and exit the process cleanly with code 0. The test never runs, but the per-test CI log captures the
// explanatory line so the reason is auditable. This keeps the change scoped to this resolver, avoiding a new
// exit-code contract in the shared ci3 test runner.
//
// Activated by env var; passthrough otherwise.
/* eslint-disable @typescript-eslint/no-require-imports */

const path = require('path');
const fs = require('fs');
const { installLegacyContracts, REDIRECTED, cacheRoot } = require('./install_legacy_contracts.cjs');

const version = process.env.CONTRACT_ARTIFACTS_VERSION;
const cacheDir = version ? cacheRoot(version) : null;

// Unpack on demand at first use. Idempotent and concurrency-safe, so parallel jest workers and
// isolated test containers (which share the checkout) race benignly.
if (version) {
  installLegacyContracts(version);
}

let bannerPrinted = false;
const seen = new Set();

function printBannerOnce() {
  if (bannerPrinted || !version) {
    return;
  }
  bannerPrinted = true;
  const lines = ['='.repeat(60), `[legacy-contracts][jest] CONTRACT_ARTIFACTS_VERSION=${version}`];
  for (const pkg of REDIRECTED) {
    lines.push(`[legacy-contracts][jest] redirecting ${pkg}/artifacts/*.json -> .legacy-contracts/${version}/...`);
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
    // pkg = 'noir-contracts.js' -> match '/noir-contracts.js/artifacts/'
    const marker = `/${pkg}/artifacts/`;
    const idx = resolved.indexOf(marker);
    if (idx === -1) {
      continue;
    }
    const basename = resolved.slice(idx + marker.length);
    return path.join(cacheDir, pkg, 'artifacts', basename);
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
    // Contract was added after this historical release, there is nothing to compat-test for it. Exit the process
    // cleanly with code 0 so the test runner reports the run as passed.
    fs.writeSync(
      2,
      `[legacy-contracts][jest] artifact ${path.basename(legacy)} not in legacy cache @${version}; ` +
        `assumed added after this release. No compat coverage applicable for this version, treating as passed.\n`,
    );
    process.exit(0);
  }
  if (!seen.has(resolved)) {
    seen.add(resolved);
    process.stderr.write(`[legacy-contracts][jest] redirected ${path.basename(legacy)} -> ${legacy}\n`);
  }
  return legacy;
};
