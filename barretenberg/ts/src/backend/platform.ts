import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

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
 * Find the bb binary in the build directory for the current platform.
 * Searches in <package-root>/build/<platform>/bb
 * @returns Absolute path to bb binary, or null if not found
 */
export function findBbBinary(): string | null {
  const platform = detectPlatform();
  if (!platform) {
    return null;
  }

  const buildDir = PLATFORM_TO_BUILD_DIR[platform];

  // Get package root (barretenberg/ts directory)
  // This file is at src/backend/platform.ts, so go up to package root
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const packageRoot = path.resolve(__dirname, '../..');

  // Check in build/<platform>/bb
  const bbPath = path.join(packageRoot, 'build', buildDir, 'bb');

  if (fs.existsSync(bbPath)) {
    return bbPath;
  }

  return null;
}
