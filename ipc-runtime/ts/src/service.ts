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

/**
 * A per-platform native file a generated package ships in its arch packages: the service binary,
 * or a Node-API addon over the service's FFI entry. Resolved the same way for both.
 */
export type ServiceNativeFile = Pick<
  ServiceBinary,
  "name" | "envVar" | "archPackages" | "packageDir"
>;

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
  /** When true, an idle backend does not keep the process alive; see SpawnedProcessBackendOptions. */
  unref?: boolean;
  clientId?: number;
  napiPath?: string;
}

function platformKey(): string {
  return `${process.arch}-${process.platform}`;
}

function archPackageDir(binary: ServiceNativeFile): string | null {
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
  binary: ServiceNativeFile,
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

/** One backend a host can offer, for pickServiceBackend. */
export interface ServiceBackendChoice<T> {
  /** Whether the default policy should try it; absent means always (it is the last resort). */
  available?: () => boolean;
  create: () => Promise<T>;
}

/**
 * Which backend to use, given what this host can offer. Unset: the first of process, napi, wasm
 * whose `available()` holds (or that has no such check), trying the next one if creating it
 * fails; the last candidate is tried regardless. A name forces one, with no fallback.
 */
export async function pickServiceBackend<
  T extends IpcClientAsync | IpcClientSync,
>(
  wanted: "process" | "napi" | "wasm" | T | undefined,
  choices: {
    label: string;
    process?: ServiceBackendChoice<T>;
    napi?: ServiceBackendChoice<T>;
    wasm?: ServiceBackendChoice<T>;
    logger?: (msg: string) => void;
  },
): Promise<T> {
  if (typeof wanted === "object") {
    return wanted;
  }
  const candidates = (["process", "napi", "wasm"] as const)
    .map((name) => ({ name, choice: choices[name] }))
    .filter(
      (c): c is { name: "process" | "napi" | "wasm"; choice: ServiceBackendChoice<T> } =>
        c.choice !== undefined,
    );
  if (wanted !== undefined) {
    const forced = candidates.find((c) => c.name === wanted);
    if (!forced) {
      throw new Error(`${choices.label}: no such backend here: ${String(wanted)}`);
    }
    return forced.choice.create();
  }
  for (let i = 0; i < candidates.length; i++) {
    const { name, choice } = candidates[i]!;
    const last = i === candidates.length - 1;
    if (!last && choice.available && !choice.available()) {
      continue;
    }
    try {
      return await choice.create();
    } catch (err) {
      if (last) {
        throw err;
      }
      choices.logger?.(
        `${choices.label} ${name} unavailable (${(err as Error).message}); falling back to ${candidates[i + 1]!.name}`,
      );
    }
  }
  throw new Error(`${choices.label}: no backend available`);
}
