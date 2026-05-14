#!/usr/bin/env node
// Installs pinned legacy @aztec/* contract-artifact packages into .legacy-contracts/<version>/.
//
// Called from two places:
//   - bootstrap.sh ci-compat-e2e: pre-populates the cache on the host before hermetic test
//     containers launch. The containers run with --net=none (see ci3/docker_isolate), so on-demand
//     installs from inside them fail with EAI_AGAIN.
//   - legacy-jest-resolver.cjs: on-demand install for local dev, where jest runs with network.
//
// Idempotent: no-op when all packages are already present.
/* eslint-disable @typescript-eslint/no-require-imports */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const REDIRECTED = ['@aztec/noir-contracts.js', '@aztec/noir-test-contracts.js', '@aztec/accounts'];

const e2eRoot = path.resolve(__dirname, '..');

function cacheRoot(version) {
  return path.join(e2eRoot, '.legacy-contracts', version);
}

function pkgJsonPath(version, pkg) {
  return path.join(cacheRoot(version), 'node_modules', pkg, 'package.json');
}

function installLegacyContracts(version) {
  if (!version) {
    throw new Error('installLegacyContracts: version is required');
  }
  if (REDIRECTED.every(pkg => fs.existsSync(pkgJsonPath(version, pkg)))) {
    return;
  }

  const cacheDir = cacheRoot(version);
  fs.mkdirSync(cacheDir, { recursive: true });

  // Seed a standalone package.json so `npm install --prefix` treats cacheRoot as its own project. Without this, npm
  // walks up and finds the yarn-project workspace root, which breaks on `workspace:` protocol deps and risks
  // clobbering the monorepo's node_modules.
  const seed = path.join(cacheDir, 'package.json');
  if (!fs.existsSync(seed)) {
    fs.writeFileSync(seed, JSON.stringify({ name: 'legacy-contracts-cache', private: true }));
  }

  const specs = REDIRECTED.map(pkg => `${pkg}@${version}`);
  process.stderr.write(`[legacy-contracts] installing ${specs.join(' ')} into ${cacheDir}\n`);
  // --prefix: install into cacheRoot instead of cwd, so the cache is isolated from the monorepo.
  // --no-save: don't write the installed packages back to the seeded package.json.
  // --ignore-scripts: skip lifecycle scripts (preinstall/postinstall) of the legacy packages and their transitive
  //   deps; we only want the files on disk, not to run any build steps.
  // --legacy-peer-deps: tolerate peer-dependency mismatches between the pinned legacy @aztec/* graph and whatever
  //   current versions npm would otherwise try to reconcile.
  execFileSync(
    'npm',
    ['install', '--prefix', cacheDir, '--no-save', '--ignore-scripts', '--legacy-peer-deps', ...specs],
    { stdio: 'inherit' },
  );

  // Verify versions on disk match the requested version.
  for (const pkg of REDIRECTED) {
    const onDisk = JSON.parse(fs.readFileSync(pkgJsonPath(version, pkg), 'utf8')).version;
    if (onDisk !== version) {
      throw new Error(`[legacy-contracts] ${pkg} on disk is ${onDisk}, expected ${version}`);
    }
  }
}

module.exports = { installLegacyContracts, REDIRECTED, cacheRoot };

if (require.main === module) {
  installLegacyContracts(process.argv[2]);
}
