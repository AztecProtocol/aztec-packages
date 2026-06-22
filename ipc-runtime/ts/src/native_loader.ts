// Locate the prebuilt ipc_runtime_napi.node addon shipped with this package.
//
// The addon is built by `ipc-runtime/bootstrap.sh` (CMake target
// `ipc_runtime_napi`) and copied into `build/<arch>-<os>/` next to this
// package's `package.json`. Resolution walks up from this file's URL to the
// first `package.json` adjacent to a `build/` directory — that's the
// package root in both `file:`-linked and published consumption.

import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type Platform =
  | "x86_64-linux"
  | "x86_64-darwin"
  | "aarch64-linux"
  | "aarch64-darwin";

const PLATFORM_TO_BUILD_DIR: Record<Platform, string> = {
  "x86_64-linux": "amd64-linux",
  "x86_64-darwin": "amd64-macos",
  "aarch64-linux": "arm64-linux",
  "aarch64-darwin": "arm64-macos",
};

function detectPlatform(): Platform | null {
  const arch = process.arch;
  const platform = process.platform;
  if (arch === "x64" && platform === "linux") return "x86_64-linux";
  if (arch === "x64" && platform === "darwin") return "x86_64-darwin";
  if (arch === "arm64" && platform === "linux") return "aarch64-linux";
  if (arch === "arm64" && platform === "darwin") return "aarch64-darwin";
  return null;
}

function findPackageRoot(): string | null {
  // `import.meta.url` after tsc compile points at the .js file under
  // <pkg>/dest/...; climb until we find package.json with a sibling build/.
  let currentDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.parse(currentDir).root;
  while (currentDir !== root) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const buildDir = path.join(currentDir, "build");
      if (fs.existsSync(buildDir)) {
        return currentDir;
      }
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}

/**
 * Resolve the path of `ipc_runtime_napi.node` for the current platform.
 * Returns null if either the platform is unsupported or the artifact is
 * absent (typical reason: ipc-runtime/bootstrap.sh hasn't run yet).
 */
export function findIpcRuntimeNapi(customPath?: string): string | null {
  if (customPath) {
    return fs.existsSync(customPath) ? path.resolve(customPath) : null;
  }
  const platform = detectPlatform();
  if (!platform) return null;
  const packageRoot = findPackageRoot();
  if (!packageRoot) return null;
  const buildDir = PLATFORM_TO_BUILD_DIR[platform];
  const candidate = path.join(
    packageRoot,
    "build",
    buildDir,
    "ipc_runtime_napi.node",
  );
  return fs.existsSync(candidate) ? candidate : null;
}

/**
 * Load `ipc_runtime_napi.node` and return its native exports
 * (`MsgpackClient`, `MsgpackClientAsync`). Throws a descriptive error when
 * the addon cannot be located or fails to dlopen.
 */
export function loadIpcRuntimeNapi(customPath?: string): {
  MsgpackClient: new (shmName: string, clientId?: number) => any;
  MsgpackClientAsync: new (shmName: string, clientId?: number) => any;
} {
  const addonPath = findIpcRuntimeNapi(customPath);
  if (!addonPath) {
    throw new Error(
      "Could not locate ipc_runtime_napi.node. Build with `ipc-runtime/bootstrap.sh` " +
        "or set the optional `customPath` argument to point at a prebuilt addon.",
    );
  }
  // createRequire so this works in both ESM and CJS callers.
  const require = createRequire(import.meta.url);
  return require(addonPath);
}
