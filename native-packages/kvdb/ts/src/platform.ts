import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type Platform =
  | "x86_64-linux"
  | "x86_64-darwin"
  | "aarch64-linux"
  | "aarch64-darwin";

const PLATFORM_TO_PACKAGE: Record<Platform, string> = {
  "x86_64-linux": "@aztec-foundation/kvdb-linux-x64",
  "x86_64-darwin": "@aztec-foundation/kvdb-darwin-x64",
  "aarch64-linux": "@aztec-foundation/kvdb-linux-arm64",
  "aarch64-darwin": "@aztec-foundation/kvdb-darwin-arm64",
};

const NAPI_BINARY = "nodejs_module.node";

function currentDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

function detectPlatform(): Platform | null {
  if (process.arch === "x64" && process.platform === "linux")
    return "x86_64-linux";
  if (process.arch === "x64" && process.platform === "darwin")
    return "x86_64-darwin";
  if (process.arch === "arm64" && process.platform === "linux")
    return "aarch64-linux";
  if (process.arch === "arm64" && process.platform === "darwin")
    return "aarch64-darwin";
  return null;
}

function findArchPackageDir(platform: Platform): string | null {
  const packageName = PLATFORM_TO_PACKAGE[platform];
  try {
    const require = createRequire(import.meta.url);
    return path.dirname(require.resolve(packageName + "/package.json"));
  } catch {
    const siblingPackageDir = path.join(
      currentDir(),
      "..",
      "packages",
      packageName.split("/").pop()!,
    );
    return fs.existsSync(path.join(siblingPackageDir, "package.json"))
      ? siblingPackageDir
      : null;
  }
}

/**
 * Locate the kvdb NAPI addon (nodejs_module.node) for the current platform.
 * @param customPath Optional explicit path to the addon (overrides detection).
 * @returns Absolute path to the addon, or null if not found.
 */
export function findNapiBinary(customPath?: string): string | null {
  if (customPath) {
    return fs.existsSync(customPath) ? path.resolve(customPath) : null;
  }

  const envPath = process.env.AZTEC_KVDB_NAPI_PATH;
  if (envPath) {
    return fs.existsSync(envPath) ? path.resolve(envPath) : null;
  }

  const platform = detectPlatform();
  if (!platform) {
    return null;
  }

  const archDir = findArchPackageDir(platform);
  if (archDir) {
    const candidate = path.join(archDir, NAPI_BINARY);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
