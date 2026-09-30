#!/usr/bin/env node
// Stage a generated client package's per-platform packages: the optional dependencies its native
// resolver looks for. Run from the package root; the package name, the native files and the
// version come from its own package.json, so this is the same script for every service.
//
// The native files are the `bin` binary (a package that spawns its service) and any file listed
// in `ipcRuntime.nativeFiles` (the napi transport's addon).
//
// Usage: prepare_arch_packages [<platform>=<path> | <platform>:<file>=<path> ...]
//   platform: linux-x64 | linux-arm64 | darwin-x64 | darwin-arm64, or the build directory name
//             (amd64-linux, arm64-linux, amd64-macos, arm64-macos)
//   <platform>=<path> names the package's only native file, or its binary when it has several.
// Without an argument for a file, build/<build-dir>/<file> is used when it exists.
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
const files = [...(binaryName ? [binaryName] : []), ...(pkg.ipcRuntime?.nativeFiles ?? [])];
if (files.length === 0) {
  console.error(`prepare_arch_packages: ${pkg.name} declares no bin and no ipcRuntime.nativeFiles, so it ships nothing native`);
  process.exit(1);
}
// The file a bare `<platform>=<path>` names.
const defaultFile = binaryName ?? files[0];
// The scoped name's last segment, which is what the per-platform directories are named after.
const stem = pkg.name.split('/').pop();

// Keyed `<platform>:<file>`.
const overrides = new Map();
for (const arg of process.argv.slice(2)) {
  const eq = arg.indexOf('=');
  if (eq < 0) {
    console.error('Usage: prepare_arch_packages [<platform>=<path> | <platform>:<file>=<path> ...]');
    console.error('Platforms: linux-x64, linux-arm64, darwin-x64, darwin-arm64');
    console.error(`Files: ${files.join(', ')}`);
    process.exit(1);
  }
  const target = arg.slice(0, eq);
  const colon = target.indexOf(':');
  const [platform, file] = colon < 0 ? [target, defaultFile] : [target.slice(0, colon), target.slice(colon + 1)];
  if (!files.includes(file)) {
    console.error(`prepare_arch_packages: ${pkg.name} ships no native file '${file}' (it has: ${files.join(', ')})`);
    process.exit(1);
  }
  overrides.set(`${platform}:${file}`, arg.slice(eq + 1));
}

for (const { buildDir, suffix, os, cpu } of PLATFORMS) {
  const name = `${pkg.name}-${suffix}`;
  const outDir = join('packages', `${stem}-${suffix}`);
  const sources = files.map(file => ({
    file,
    path: overrides.get(`${suffix}:${file}`) ?? overrides.get(`${buildDir}:${file}`) ?? join('build', buildDir, file),
  }));
  const present = sources.filter(({ path }) => existsSync(path));

  if (present.length === 0) {
    console.log(`Skipping ${name}: none of ${sources.map(s => s.path).join(', ')} exists`);
    continue;
  }
  for (const { path } of sources.filter(s => !present.includes(s))) {
    console.log(`Warning: ${name} is missing ${path}; the backend that needs it will not resolve on ${suffix}`);
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const { file, path } of present) {
    copyFileSync(path, join(outDir, file));
    chmodSync(join(outDir, file), 0o755);
  }
  writeFileSync(
    join(outDir, 'package.json'),
    JSON.stringify(
      {
        name,
        version: pkg.version,
        description: `Native files for ${pkg.name} (${suffix})`,
        license: 'MIT',
        os: [os],
        cpu: [cpu],
        files: present.map(({ file }) => file),
        preferUnplugged: true,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Staged ${name} from ${present.map(({ path }) => path).join(', ')}`);
}
