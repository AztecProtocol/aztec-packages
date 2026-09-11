#!/usr/bin/env node
// Stage a generated client package's per-platform binary packages: the optional dependencies its
// binary resolver looks for. Run from the package root; the package name, binary name and version
// come from its own package.json, so this is the same script for every service.
//
// Usage: prepare_arch_packages [<platform>=<binary> ...]
//   platform: linux-x64 | linux-arm64 | darwin-x64 | darwin-arm64, or the build directory name
//             (amd64-linux, arm64-linux, amd64-macos, arm64-macos)
// Without an argument for a platform, build/<build-dir>/<binary> is used when it exists.
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PLATFORMS = [
  { buildDir: 'amd64-linux', suffix: 'linux-x64', os: 'linux', cpu: 'x64' },
  { buildDir: 'arm64-linux', suffix: 'linux-arm64', os: 'linux', cpu: 'arm64' },
  { buildDir: 'amd64-macos', suffix: 'darwin-x64', os: 'darwin', cpu: 'x64' },
  { buildDir: 'arm64-macos', suffix: 'darwin-arm64', os: 'darwin', cpu: 'arm64' },
];

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const binaryName = Object.keys(pkg.bin ?? {})[0];
if (!binaryName) {
  console.error(`prepare_arch_packages: ${pkg.name} declares no bin, so it ships no binary`);
  process.exit(1);
}
// The scoped name's last segment, which is what the per-platform directories are named after.
const stem = pkg.name.split('/').pop();

const overrides = new Map();
for (const arg of process.argv.slice(2)) {
  const eq = arg.indexOf('=');
  if (eq < 0) {
    console.error('Usage: prepare_arch_packages [<platform>=<binary> ...]');
    console.error('Platforms: linux-x64, linux-arm64, darwin-x64, darwin-arm64');
    process.exit(1);
  }
  overrides.set(arg.slice(0, eq), arg.slice(eq + 1));
}

for (const { buildDir, suffix, os, cpu } of PLATFORMS) {
  const name = `${pkg.name}-${suffix}`;
  const outDir = join('packages', `${stem}-${suffix}`);
  const binaryPath =
    overrides.get(suffix) ?? overrides.get(buildDir) ?? join('build', buildDir, binaryName);

  if (!existsSync(binaryPath)) {
    console.log(`Skipping ${name}: no binary at ${binaryPath}`);
    continue;
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  copyFileSync(binaryPath, join(outDir, binaryName));
  chmodSync(join(outDir, binaryName), 0o755);
  writeFileSync(
    join(outDir, 'package.json'),
    JSON.stringify(
      {
        name,
        version: pkg.version,
        description: `Native binary for ${pkg.name} (${suffix})`,
        license: 'MIT',
        os: [os],
        cpu: [cpu],
        files: [binaryName],
        preferUnplugged: true,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Staged ${name} from ${binaryPath}`);
}
