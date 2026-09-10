import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  SpawnedProcessBackend,
  SpawnedProcessBackendSync,
} from "./spawned_backend.js";
import { IpcSpawnError } from "./errors.js";
import type { IpcClientAsync, IpcClientSync } from "./types.js";

/**
 * How a generated client package reaches its service as a spawned process. Everything here is
 * fixed at generation time from the schema and the flags: the package supplies it, this module
 * does the work, so the same logic is not regenerated into every package.
 */
export interface ServiceBinary {
  /** Binary name, used for the arch-package lookup, log labels and errors. */
  name: string;
  /** Environment variable that overrides the binary's path. */
  envVar: string;
  /** npm package holding the binary, per platform (`process.arch`-`process.platform`). */
  archPackages: Record<string, string>;
  /** Argv template; each '{path}' is replaced with the backend's ipc path. */
  ipcPathArgs: string[];
  /** Prefix for the per-instance ipc path. */
  instancePrefix: string;
  /** Directory of the package that owns the arch packages, for the sibling fallback. */
  packageDir: string;
}

/** Options a caller may give when the service runs as a spawned process. */
export interface ServiceProcessOptions {
  binaryPath?: string;
  transport?: "uds" | "shm";
  /** Threads the service may use, exported to it as HARDWARE_CONCURRENCY and RAYON_NUM_THREADS. */
  threads?: number;
  logger?: (msg: string) => void;
  connectTimeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  extraArgs?: string[];
  respawn?: boolean;
  unref?: boolean;
  unrefStdio?: boolean;
  clientId?: number;
  napiPath?: string;
}

function platformKey(): string {
  return `${process.arch}-${process.platform}`;
}

function archPackageDir(binary: ServiceBinary): string | null {
  const packageName = binary.archPackages[platformKey()];
  if (!packageName) {
    return null;
  }
  try {
    const require = createRequire(import.meta.url);
    return path.dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    // Not installed as a dependency: fall back to a copy prepared inside the owning package,
    // which is how a repository checkout runs before anything is published.
    const sibling = path.join(
      binary.packageDir,
      "packages",
      packageName.split("/").pop()!,
    );
    return fs.existsSync(path.join(sibling, "package.json")) ? sibling : null;
  }
}

/**
 * The binary to run: `customPath` if given, else the package's environment variable, else the
 * installed arch package for this platform. Null when none of those yields an existing file.
 */
export function findServiceBinary(
  binary: ServiceBinary,
  customPath?: string,
): string | null {
  const explicit = customPath ?? process.env[binary.envVar];
  if (explicit) {
    return fs.existsSync(explicit) ? path.resolve(explicit) : null;
  }
  const dir = archPackageDir(binary);
  if (dir) {
    const candidate = path.join(dir, binary.name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** The child's environment: the caller's, plus the thread count under both names services read. */
export function serviceProcessEnv(
  options: Pick<ServiceProcessOptions, "threads" | "env">,
): NodeJS.ProcessEnv | undefined {
  if (options.threads === undefined) {
    return options.env;
  }
  const threads = String(options.threads);
  return {
    HARDWARE_CONCURRENCY: threads,
    RAYON_NUM_THREADS: threads,
    ...options.env,
  };
}

function resolveOrThrow(
  binary: ServiceBinary,
  binaryPath: string | undefined,
): string {
  const resolved = findServiceBinary(binary, binaryPath);
  if (!resolved) {
    throw new IpcSpawnError(
      `${binary.name} binary not found`,
      /*retry=*/ false,
    );
  }
  return resolved;
}

/**
 * Spawn the service and connect to it. Process lifecycle — connectivity, death detection,
 * optional respawn, teardown — is owned by the backend and never leaks onto the caller's API.
 */
export function spawnServiceBackend(
  binary: ServiceBinary,
  defaultTransport: "uds" | "shm",
  options: ServiceProcessOptions = {},
): Promise<SpawnedProcessBackend> {
  return SpawnedProcessBackend.spawn({
    binaryPath: resolveOrThrow(binary, options.binaryPath),
    binaryName: binary.name,
    instancePrefix: binary.instancePrefix,
    ipcPathArgs: binary.ipcPathArgs,
    transport: options.transport ?? defaultTransport,
    logger: options.logger,
    connectTimeoutMs: options.connectTimeoutMs,
    env: serviceProcessEnv(options),
    extraArgs: options.extraArgs,
    respawn: options.respawn,
    unref: options.unref,
    unrefStdio: options.unrefStdio,
    clientId: options.clientId,
    napiPath: options.napiPath,
  });
}

/** The synchronous form: shared memory is the one transport with a synchronous client. */
export function spawnServiceBackendSync(
  binary: ServiceBinary,
  options: ServiceProcessOptions = {},
): Promise<SpawnedProcessBackendSync> {
  if (options.transport !== undefined && options.transport !== "shm") {
    throw new Error(
      `${binary.name}: the synchronous backend needs the shm transport`,
    );
  }
  return SpawnedProcessBackendSync.spawn({
    binaryPath: resolveOrThrow(binary, options.binaryPath),
    binaryName: binary.name,
    instancePrefix: `${binary.instancePrefix}-sync`,
    ipcPathArgs: binary.ipcPathArgs,
    transport: "shm",
    logger: options.logger,
    connectTimeoutMs: options.connectTimeoutMs,
    env: serviceProcessEnv(options),
    extraArgs: options.extraArgs,
    unref: options.unref,
    unrefStdio: options.unrefStdio,
    clientId: options.clientId ?? 0,
    napiPath: options.napiPath,
  });
}

/** Run the service binary as a CLI, forwarding argv and exit status. Backs a package's `bin`. */
export function runServiceBinary(
  binary: ServiceBinary,
  packageName: string,
  argv: string[],
): never {
  const binaryPath = findServiceBinary(binary);
  if (!binaryPath) {
    console.error(
      `${binary.name}: native binary not found. Install the matching ` +
        `'${packageName}-<platform>' package, set ${binary.envVar}, or pass its path.`,
    );
    process.exit(1);
  }
  const result = spawnSync(binaryPath, argv, { stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

/**
 * Which backend to use, given what this host can offer. Unset: the process when its binary
 * resolves, else wasm. A name forces one, with no fallback to the other.
 */
export async function pickServiceBackend<
  T extends IpcClientAsync | IpcClientSync,
>(
  wanted: "process" | "wasm" | T | undefined,
  choices: {
    label: string;
    process?: { available: () => boolean; create: () => Promise<T> };
    wasm?: { create: () => Promise<T> };
    logger?: (msg: string) => void;
  },
): Promise<T> {
  if (typeof wanted === "object") {
    return wanted;
  }
  const { process: proc, wasm } = choices;
  if (
    proc &&
    (wanted === "process" ||
      (wanted === undefined && (!wasm || proc.available())))
  ) {
    try {
      return await proc.create();
    } catch (err) {
      if (wanted === "process" || !wasm) {
        throw err;
      }
      choices.logger?.(
        `${choices.label} process unavailable (${(err as Error).message}); falling back to wasm`,
      );
    }
  }
  if (wasm && (wanted === undefined || wanted === "wasm")) {
    return wasm.create();
  }
  throw new Error(`${choices.label}: no such backend here: ${String(wanted)}`);
}
