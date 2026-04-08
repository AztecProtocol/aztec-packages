// Custom Jest resolver. When CONTRACT_ARTIFACTS_VERSION is set, redirects imports of @aztec/noir-contracts.js and
// @aztec/noir-test-contracts.js (and their subpaths) into a local cache of the pinned legacy versions. The cache is
// populated on demand by running `npm install` into .legacy-contracts/<version>/.
//
// Activated by env var; passthrough otherwise.

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
    let v = '<missing>';
    try {
      v = JSON.parse(fs.readFileSync(pkgJsonPath(p), 'utf8')).version;
    } catch {}
    if (v !== version) {
      lines.push(`[legacy-contracts][jest] ERROR: ${p} on disk is ${v}, expected ${version}`);
      lines.push('='.repeat(60));
      process.stderr.write(lines.join('\n') + '\n');
      throw new Error('[legacy-contracts] cache version mismatch');
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
