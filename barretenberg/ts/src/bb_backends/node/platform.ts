import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

function getCurrentDir() {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  } else {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return path.dirname(fileURLToPath(import.meta.url));
  }
}

/**
 * Find package root by climbing directory tree until package.json is found.
 * @returns Absolute path to package root, or null if not found
 */
export function findPackageRoot(): string | null {
  let currentDir = getCurrentDir();
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      // Check if this is the actual package root by verifying it has a 'build' or 'dest' directory.
      // 'build' exists in local dev; 'dest' exists in published packages (which no longer ship 'build').
      // This ensures we skip intermediate package.json files (e.g., in dest/node-cjs/).
      const buildDir = path.join(currentDir, 'build');
      const destDir = path.join(currentDir, 'dest');
      if (fs.existsSync(buildDir) || fs.existsSync(destDir)) {
        return currentDir;
      }
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * Supported platform/architecture combinations.
 */
export type Platform = 'x86_64-linux' | 'x86_64-darwin' | 'aarch64-linux' | 'aarch64-darwin';

/**
 * Map from Platform to build directory name (for local dev fallback).
 */
const PLATFORM_TO_BUILD_DIR: Record<Platform, string> = {
  'x86_64-linux': 'amd64-linux',
  'x86_64-darwin': 'amd64-macos',
  'aarch64-linux': 'arm64-linux',
  'aarch64-darwin': 'arm64-macos',
};

/**
 * Map from Platform to the architecture-specific npm package name.
 */
const PLATFORM_TO_PACKAGE: Record<Platform, string> = {
  'x86_64-linux': '@aztec/bb.js-linux-x64',
  'x86_64-darwin': '@aztec/bb.js-darwin-x64',
  'aarch64-linux': '@aztec/bb.js-linux-arm64',
  'aarch64-darwin': '@aztec/bb.js-darwin-arm64',
};

/**
 * Try to find the directory of the architecture-specific npm package.
 * Uses require.resolve to locate the package regardless of hoisting or PnP.
 */
function findArchPackageDir(platform: Platform): string | null {
  const packageName = PLATFORM_TO_PACKAGE[platform];
  try {
    const require = createRequire(getCurrentDir() + '/');
    const pkgJsonPath = require.resolve(`${packageName}/package.json`);
    return path.dirname(pkgJsonPath);
  } catch {
    return null;
  }
}

/**
 * Detect the current platform and architecture.
 * @returns Platform identifier or null if unsupported
 */
export function detectPlatform(): Platform | null {
  const arch = process.arch; // 'x64' | 'arm64' | ...
  const platform = process.platform; // 'linux' | 'darwin' | 'win32' | ...

  if (arch === 'x64' && platform === 'linux') {
    return 'x86_64-linux';
  }
  if (arch === 'x64' && platform === 'darwin') {
    return 'x86_64-darwin';
  }
  if (arch === 'arm64' && platform === 'linux') {
    return 'aarch64-linux';
  }
  if (arch === 'arm64' && platform === 'darwin') {
    return 'aarch64-darwin';
  }

  return null;
}

/**
 * Find a native binary by name, searching arch-specific packages first, then local build/.
 *
 * Search order:
 * 1. If customPath is provided and exists, return it
 * 2. Architecture-specific npm package (e.g., @aztec/bb.js-linux-x64)
 * 3. Local build directory fallback (for local development)
 */
function findNativeBinary(binaryName: string, customPath?: string): string | null {
  if (customPath) {
    return fs.existsSync(customPath) ? path.resolve(customPath) : null;
  }

  const platform = detectPlatform();
  if (!platform) {
    return null;
  }

  // Try arch-specific npm package first
  const archDir = findArchPackageDir(platform);
  if (archDir) {
    const binPath = path.join(archDir, binaryName);
    if (fs.existsSync(binPath)) {
      return binPath;
    }
  }

  // Fall back to local build/ directory (local development)
  const packageRoot = findPackageRoot();
  if (packageRoot) {
    const buildDir = PLATFORM_TO_BUILD_DIR[platform];
    const binPath = path.join(packageRoot, 'build', buildDir, binaryName);
    if (fs.existsSync(binPath)) {
      return binPath;
    }
  }

  return null;
}

/**
 * Find the bb binary for the native backend.
 * @param customPath Optional custom path to bb binary (overrides automatic detection)
 * @returns Absolute path to bb binary, or null if not found
 */
export function findBbBinary(customPath?: string): string | null {
  return findNativeBinary('bb', customPath);
}

export function findNapiBinary(customPath?: string): string | null {
  return findNativeBinary('nodejs_module.node', customPath);
}
