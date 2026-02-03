import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

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
 * @param startDir Starting directory to search from
 * @returns Absolute path to package root, or null if not found
 */
export function findPackageRoot(): string | null {
  let currentDir = getCurrentDir();
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      // Check if this is the actual package root by verifying it has a 'build' directory
      // This ensures we skip intermediate package.json files (e.g., in dest/node-cjs/)
      const buildDir = path.join(currentDir, 'build');
      if (fs.existsSync(buildDir)) {
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
 * Map from Platform to build directory name.
 */
const PLATFORM_TO_BUILD_DIR: Record<Platform, string> = {
  'x86_64-linux': 'amd64-linux',
  'x86_64-darwin': 'amd64-macos',
  'aarch64-linux': 'arm64-linux',
  'aarch64-darwin': 'arm64-macos',
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

/**
 * Find the bb binary for the native backend.
 * @param customPath Optional custom path to bb binary (overrides automatic detection)
 * @returns Absolute path to bb binary, or null if not found
 *
 * Search order:
 * 1. If customPath is provided and exists, return it
 * 2. Otherwise search in <package-root>/build/<platform>/bb
 */
export function findBbBinary(customPath?: string): string | null {
  // Check custom path first if provided
  if (customPath) {
    if (fs.existsSync(customPath)) {
      return path.resolve(customPath);
    }
    // Custom path provided but doesn't exist - return null
    return null;
  }

  // Automatic detection
  const platform = detectPlatform();
  if (!platform) {
    return null;
  }

  const buildDir = PLATFORM_TO_BUILD_DIR[platform];

  // Get package root by climbing directory tree to find package.json
  const packageRoot = findPackageRoot();

  if (!packageRoot) {
    return null;
  }

  // Check in build/<platform>/bb
  const bbPath = path.join(packageRoot, 'build', buildDir, 'bb');

  if (fs.existsSync(bbPath)) {
    return bbPath;
  }

  return null;
}

export function findNapiBinary(customPath?: string): string | null {
  // Check custom path first if provided
  if (customPath) {
    if (fs.existsSync(customPath)) {
      return path.resolve(customPath);
    }
    // Custom path provided but doesn't exist - return null
    return null;
  }

  // Automatic detection
  const platform = detectPlatform();
  if (!platform) {
    return null;
  }

  const buildDir = PLATFORM_TO_BUILD_DIR[platform];

  // Get package root by climbing directory tree to find package.json
  const packageRoot = findPackageRoot();

  if (!packageRoot) {
    return null;
  }

  // Check in build/<platform>/nodejs_module.node
  const bbPath = path.join(packageRoot, 'build', buildDir, 'nodejs_module.node');

  if (fs.existsSync(bbPath)) {
    return bbPath;
  }

  return null;
}
