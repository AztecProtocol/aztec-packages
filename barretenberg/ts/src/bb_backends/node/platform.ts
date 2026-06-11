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
 * Supported platform/architecture combinations.
 */
export type Platform = 'x86_64-linux' | 'x86_64-darwin' | 'aarch64-linux' | 'aarch64-darwin';

const PLATFORM_TO_PACKAGE: Record<Platform, string> = {
  'x86_64-linux': '@aztec/bb.js-linux-x64',
  'x86_64-darwin': '@aztec/bb.js-darwin-x64',
  'aarch64-linux': '@aztec/bb.js-linux-arm64',
  'aarch64-darwin': '@aztec/bb.js-darwin-arm64',
};

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

function findArchPackageDir(platform: Platform): string | null {
  const packageName = PLATFORM_TO_PACKAGE[platform];
  try {
    const require = createRequire(path.join(getCurrentDir(), 'platform.js'));
    return path.dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    const siblingPackageDir = path.join(getCurrentDir(), '..', '..', '..', '..', 'packages', packageName.split('/').pop()!);
    return fs.existsSync(path.join(siblingPackageDir, 'package.json')) ? siblingPackageDir : null;
  }
}

function findNativeBinary(binaryName: string, customPath?: string, envVar?: string): string | null {
  if (customPath) {
    return fs.existsSync(customPath) ? path.resolve(customPath) : null;
  }

  const envPath = envVar ? process.env[envVar] : undefined;
  if (envPath) {
    return fs.existsSync(envPath) ? path.resolve(envPath) : null;
  }

  const platform = detectPlatform();
  if (!platform) {
    return null;
  }

  const archDir = findArchPackageDir(platform);
  if (!archDir) {
    return null;
  }

  const candidate = path.join(archDir, binaryName);
  return fs.existsSync(candidate) ? candidate : null;
}

/**
 * Find the bb binary for the native backend.
 * @param customPath Optional custom path to bb binary (overrides automatic detection)
 * @returns Absolute path to bb binary, or null if not found
 *
 * Search order:
 * 1. If customPath is provided and exists, return it.
 * 2. If BB_BINARY_PATH is set and exists, return it.
 * 3. Otherwise search the matching @aztec/bb.js-* arch package.
 */
export function findBbBinary(customPath?: string): string | null {
  return findNativeBinary('bb', customPath, 'BB_BINARY_PATH');
}

export function findNapiBinary(customPath?: string): string | null {
  return findNativeBinary('nodejs_module.node', customPath);
}
