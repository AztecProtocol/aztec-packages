#!/usr/bin/env node
// Installs pinned legacy versions of @aztec/noir-contracts.js and @aztec/noir-test-contracts.js
// into a local cache so that the legacy-loader can redirect imports to them.
//
// Activated by setting CONTRACT_ARTIFACTS_VERSION=<x.y.z>. No-op if unset.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.env.CONTRACT_ARTIFACTS_VERSION;
if (!version) {
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const e2eRoot = resolve(here, '..');
const cacheRoot = join(e2eRoot, '.legacy-contracts', version);
const packages = ['@aztec/noir-contracts.js', '@aztec/noir-test-contracts.js'];

function pkgJsonPath(name) {
  return join(cacheRoot, 'node_modules', name, 'package.json');
}

function alreadyInstalled() {
  return packages.every(p => existsSync(pkgJsonPath(p)));
}

if (!alreadyInstalled()) {
  mkdirSync(cacheRoot, { recursive: true });
  // Seed a standalone package.json so `npm install --prefix` treats cacheRoot as its own project. Without this, npm
  // walks up and finds the yarn-project workspace root, which breaks on `workspace:` protocol deps and risks
  // clobbering the monorepo's node_modules.
  const seed = join(cacheRoot, 'package.json');
  if (!existsSync(seed)) {
    const fs = await import('node:fs');
    fs.writeFileSync(seed, JSON.stringify({ name: 'legacy-contracts-cache', private: true }));
  }

  const specs = packages.map(p => `${p}@${version}`).join(' ');
  console.error(`[legacy-contracts] installing ${specs} into ${cacheRoot}`);
  try {
    // --prefix: install into cacheRoot instead of cwd, so the cache is isolated from the monorepo.
    // --no-save: don't write the installed packages back to the seeded package.json.
    // --ignore-scripts: skip lifecycle scripts (preinstall/postinstall) of the legacy packages and their
    //   transitive deps; we only want the files on disk, not to run any build steps.
    // --legacy-peer-deps: tolerate peer-dependency mismatches between the pinned legacy @aztec/* graph
    //   and whatever current versions npm would otherwise try to reconcile.
    execSync(`npm install --prefix "${cacheRoot}" --no-save --ignore-scripts --legacy-peer-deps ${specs}`, {
      stdio: 'inherit',
    });
  } catch (err) {
    console.error(`[legacy-contracts] failed to install ${specs}`);
    process.exit(1);
  }
}

// Verify versions on disk match the requested version.
for (const p of packages) {
  const pj = JSON.parse(readFileSync(pkgJsonPath(p), 'utf8'));
  if (pj.version !== version) {
    console.error(`[legacy-contracts] ${p} on disk is ${pj.version}, expected ${version}`);
    process.exit(1);
  }
}

console.error(`[legacy-contracts] cache ready at ${cacheRoot}`);
