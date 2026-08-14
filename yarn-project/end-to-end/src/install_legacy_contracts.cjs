#!/usr/bin/env node
// Unpacks the committed legacy artifact tarballs (legacy-contracts/<version>.tar.gz) into the
// gitignored .legacy-contracts/<version>/ cache. See legacy-contracts/README.md for the tarball
// layout and how versions are added.
//
// Called from legacy-jest-resolver.cjs, which unpacks on demand at first use — both locally and in
// the isolated CI test containers (which bind-mount the checkout read-write).
//
// Idempotent and concurrency-safe: extraction goes to a temp dir and is renamed into place, so
// parallel callers (e.g. compat test containers starting together) race benignly.
/* eslint-disable @typescript-eslint/no-require-imports */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

// Package dir names whose artifacts/*.json the jest resolver redirects to historical versions.
const REDIRECTED = ['noir-contracts.js', 'noir-test-contracts.js', 'accounts'];

const e2eRoot = path.resolve(__dirname, '..');
const tarballDir = path.join(e2eRoot, 'legacy-contracts');
const cacheBase = path.join(e2eRoot, '.legacy-contracts');

function cacheRoot(version) {
  return path.join(cacheBase, version);
}

/** Versions with committed artifacts, derived from the tarballs present. */
function listVersions() {
  if (!fs.existsSync(tarballDir)) {
    return [];
  }
  return fs
    .readdirSync(tarballDir)
    .filter(f => f.endsWith('.tar.gz'))
    .map(f => f.slice(0, -'.tar.gz'.length))
    .sort();
}

function installLegacyContracts(version) {
  if (!version) {
    throw new Error('installLegacyContracts: version is required');
  }
  const dest = cacheRoot(version);
  if (fs.existsSync(dest)) {
    return;
  }
  const tarball = path.join(tarballDir, `${version}.tar.gz`);
  if (!fs.existsSync(tarball)) {
    throw new Error(`[legacy-contracts] no committed artifacts for ${version} (expected ${tarball})`);
  }

  fs.mkdirSync(cacheBase, { recursive: true });
  // Extract to a temp sibling and rename into place: rename is atomic on the same filesystem, so a
  // concurrent caller either sees the complete cache or none of it.
  const tmp = fs.mkdtempSync(path.join(cacheBase, `.${version}.tmp-`));
  try {
    process.stderr.write(`[legacy-contracts] unpacking ${path.basename(tarball)} -> ${dest}\n`);
    execFileSync('tar', ['-xzf', tarball, '-C', tmp], { stdio: ['ignore', 'ignore', 'inherit'] });
    for (const pkg of REDIRECTED) {
      if (!fs.existsSync(path.join(tmp, version, pkg, 'artifacts'))) {
        throw new Error(`[legacy-contracts] ${path.basename(tarball)} is missing ${pkg}/artifacts`);
      }
    }
    try {
      fs.renameSync(path.join(tmp, version), dest);
    } catch (err) {
      if (!fs.existsSync(dest)) {
        throw err;
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { installLegacyContracts, listVersions, cacheRoot, REDIRECTED };

if (require.main === module) {
  installLegacyContracts(process.argv[2]);
}
