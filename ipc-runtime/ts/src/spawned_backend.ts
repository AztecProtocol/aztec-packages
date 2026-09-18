import { type ChildProcess, spawn } from "node:child_process";
import { open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { threadId } from "node:worker_threads";
import { IpcError, IpcProcessExitedError, IpcSpawnError } from "./errors.js";
import {
  createNapiShmAsyncClient,
  createNapiShmSyncClient,
} from "./shm_client.js";
import { IpcClientAsync, IpcClientSync } from "./types.js";
import { UdsIpcClient } from "./uds_client.js";

export type SpawnedTransport = "uds" | "shm";

export interface SpawnedProcessBackendOptions {
  /** Absolute path of the server binary to spawn. Callers resolve it (and fail with retry=false if missing). */
  binaryPath: string;
  /** Binary name used in error messages and log labels. */
  binaryName: string;
  /** Prefix for the per-instance ipc path (socket / shm name). */
  instancePrefix: string;
  /** Argv template; each '{path}' is replaced with the backend's ipc path. */
  ipcPathArgs: string[];
  transport: SpawnedTransport;
  /** Receives the child's stdout/stderr lines. Without it, output is captured to a temp log file. */
  logger?: (msg: string) => void;
  connectTimeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  extraArgs?: string[];
  /**
   * Respawn the server on the next call() after it dies, instead of failing all
   * subsequent calls. Only safe for stateless servers: a respawned process
   * remembers nothing, so any server-side session state (forks, cursors) held
   * by callers would silently dangle. In-flight calls at the time of death
   * still reject (with retry=true); only later calls see the fresh process.
   */
  respawn?: boolean;
  /**
   * Unref the child process (and, over UDS, the idle socket) so a backend
   * that is never destroy()ed cannot hold the Node event loop open. Calls in
   * flight still keep the loop alive until their response arrives.
   */
  unref?: boolean;
  /**
   * Also unref the child's stdout/stderr pipes, which exist only when
   * `logger` is set. Separate from `unref` because those pipes are how the
   * caller sees the child's output: unref'ing them lets the process exit with
   * log lines still unread, so it is opt-in even when the child itself is
   * unref'd.
   */
  unrefStdio?: boolean;
  /** SHM only: fixed client slot id. When unset the client self-allocates a free slot. */
  clientId?: number;
  /** SHM only: override the native addon path. */
  napiPath?: string;
}

// Backstop for a spawned server that is alive but never reaches listen().
// This is a broken-process detector, not a performance expectation: servers
// create their socket before any heavy initialization, so the timed window
// covers only exec + linking + minimal init, and requests issued before the
// server is fully initialized simply wait in the socket buffer. When the
// backstop fires, the wedged process is killed rather than orphaned.
const DEFAULT_CONNECT_TIMEOUT_MS = 60_000;
// After destroy() sends SIGTERM, how long to wait before escalating to
// SIGKILL so teardown cannot hang on a server that is stuck before its signal
// handlers were installed (or is wedged inside them).
const SIGTERM_GRACE_MS = 5_000;
// How long a failed call() waits for the child's 'exit' event before deciding
// the process is still alive. The socket usually breaks before 'exit' lands,
// so without this grace a death would be misreported as a bare transport error.
const EXIT_ATTRIBUTION_GRACE_MS = 250;

/** POSIX shm segment names an shm server creates for `<name>.shm`. */
function shmSegmentPaths(ipcPath: string): string[] {
  const shmName = ipcPath.replace(/\.shm$/, "");
  return ["_request", "_response"].map((suffix) => `/dev/shm/${shmName}${suffix}`);
}

/**
 * Remove any ipc path left behind by a previous occupant of this name.
 *
 * Run before spawning as well as after teardown: a server killed outright
 * (SIGKILL, OOM) never reaches its own cleanup, and shm segments are created
 * with O_EXCL, so a leftover segment makes the next server fail at startup
 * with a bare "File exists". Instance names embed the pid, so this only bites
 * once pids recycle — which is routine in containers and CI.
 */
async function removeStaleIpcPath(
  transport: SpawnedTransport,
  ipcPath: string,
): Promise<void> {
  try {
    const paths =
      transport === "shm" ? shmSegmentPaths(ipcPath) : [ipcPath];
    await Promise.all(paths.map((p) => rm(p, { force: true })));
  } catch {
    // Best effort: a stale path we cannot remove surfaces as the server's own
    // startup error, which carries more context than anything we could throw.
  }
}

/**
 * Spawn the server process with the caller's argv/env, wiring stdio to the
 * live logger when there is one and to `logFd` otherwise. Shared by the async
 * and sync backends so process setup has exactly one implementation.
 */
function spawnServerProcess(
  options: SpawnedProcessBackendOptions,
  ipcPath: string,
  logFd?: number,
): ChildProcess {
  const child = spawn(
    options.binaryPath,
    [
      ...options.ipcPathArgs.map((arg) => (arg === "{path}" ? ipcPath : arg)),
      ...(options.extraArgs ?? []),
    ],
    {
      stdio: [
        "ignore",
        options.logger ? "pipe" : logFd!,
        options.logger ? "pipe" : logFd!,
      ],
      env: { ...process.env, ...(options.env ?? {}) },
    },
  );
  if (options.logger) {
    child.stdout?.on("data", (data: Buffer) =>
      options.logger?.(
        `[${options.binaryName} stdout] ${data.toString().trimEnd()}`,
      ),
    );
    child.stderr?.on("data", (data: Buffer) =>
      options.logger?.(
        `[${options.binaryName} stderr] ${data.toString().trimEnd()}`,
      ),
    );
  }
  if (options.unref) {
    child.unref();
  }
  if (options.unrefStdio) {
    // The stdio pipes are net.Sockets at runtime but typed as Readable.
    (child.stdout as unknown as { unref?: () => void } | null)?.unref?.();
    (child.stderr as unknown as { unref?: () => void } | null)?.unref?.();
  }
  return child;
}

/**
 * A promise that rejects if the child fails to spawn or dies before its IPC
 * endpoint is ready, for racing against the connect. Already observed, since
 * it can reject before the caller attaches a handler (spawn failures land on
 * nextTick) and would otherwise count as an unhandled rejection.
 */
function childReadyFailurePromise(
  child: ChildProcess,
  binaryName: string,
): Promise<never> {
  const failure = new Promise<never>((_, reject) => {
    // Spawn syscall failures are the one place errno distinguishes a
    // configuration error (missing/non-executable binary → retrying cannot
    // help) from an environmental one.
    child.once("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      const retry = code !== "ENOENT" && code !== "EACCES";
      reject(
        new IpcSpawnError(`Failed to spawn ${binaryName}: ${err.message}`, retry, {
          cause: err,
        }),
      );
    });
    child.once("exit", (code, signal) => {
      reject(
        new IpcSpawnError(
          `${binaryName} exited before IPC connection was ready (code=${code}, signal=${signal})`,
          /*retry=*/ true,
        ),
      );
    });
  });
  failure.catch(() => {});
  return failure;
}

let instanceCounter = 0;

/** One spawned process together with the connection into it. */
interface Incarnation {
  child: ChildProcess;
  client: IpcClientAsync;
  exitPromise: Promise<void>;
  exitInfo?: { code: number | null; signal: NodeJS.Signals | null };
}

/**
 * An IpcClientAsync backed by a spawned server process. Owns the process
 * lifecycle end to end: spawn, connect (raced against child death, with a
 * kill-on-expiry backstop), death detection, optional lazy respawn, and
 * teardown with SIGTERM→SIGKILL escalation. Failures surface as IpcError
 * subclasses whose `retry` property tells callers whether the operation may
 * be retried; no process or transport state is exposed on the API.
 */
export class SpawnedProcessBackend implements IpcClientAsync {
  private current?: Incarnation;
  private starting?: Promise<Incarnation>;
  private destroying = false;
  /** Set when the process died and respawn is disabled; fails all later calls. */
  private exitError?: IpcProcessExitedError;
  private readonly respawn: boolean;
  private readonly ipcPath: string;
  private readonly logPath?: string;

  private constructor(private readonly options: SpawnedProcessBackendOptions) {
    this.respawn = options.respawn ?? false;
    const instanceId = `${options.instancePrefix}-${process.pid}-${threadId}-${instanceCounter++}`;
    // The ipc path is per-backend, not per-incarnation, so getIpcPath() stays
    // stable across respawns for anyone who was handed the path.
    this.ipcPath =
      options.transport === "shm"
        ? `${instanceId}.shm`
        : join(tmpdir(), `${instanceId}.sock`);
    // Same for the log file: respawns append, preserving the death's last words.
    this.logPath = options.logger
      ? undefined
      : join(tmpdir(), `${instanceId}.log`);
  }

  static async spawn(
    options: SpawnedProcessBackendOptions,
  ): Promise<SpawnedProcessBackend> {
    if (options.respawn && options.transport === "shm") {
      throw new IpcError(
        `respawn is not supported over the shm transport`,
        /*retry=*/ false,
      );
    }
    const backend = new SpawnedProcessBackend(options);
    backend.current = await backend.spawnIncarnation();
    return backend;
  }

  getIpcPath(): string {
    return this.ipcPath;
  }

  async call(input: Uint8Array): Promise<Uint8Array> {
    const incarnation = await this.ensureUp();
    try {
      return await incarnation.client.call(input);
    } catch (err) {
      throw await this.attributeCallError(incarnation, err);
    }
  }

  sendProcessSignal(signal: NodeJS.Signals): void {
    const child = this.current?.child;
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  }

  async destroy(): Promise<void> {
    // Mark intentional teardown so the exit handler doesn't report it as an
    // unexpected death (or trigger a respawn).
    this.destroying = true;
    // A respawn may be mid-flight; let it settle so its child can't leak.
    await this.starting?.then(
      (incarnation) => {
        this.current = incarnation;
      },
      () => {},
    );
    const incarnation = this.current;
    this.current = undefined;
    if (!incarnation) {
      return;
    }
    await incarnation.client.destroy();
    const { child } = incarnation;
    let killTimer: NodeJS.Timeout | undefined;
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, SIGTERM_GRACE_MS);
    }
    await incarnation.exitPromise;
    if (killTimer !== undefined) {
      clearTimeout(killTimer);
    }
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.removeAllListeners();
    await this.cleanupIpcPath();
  }

  /** Return the live incarnation, lazily respawning one when allowed. */
  private async ensureUp(): Promise<Incarnation> {
    if (this.destroying) {
      throw new IpcError(
        `${this.options.binaryName} backend destroyed`,
        /*retry=*/ false,
      );
    }
    if (this.current) {
      return this.current;
    }
    if (this.exitError) {
      throw this.exitError;
    }
    // Lazy, shared respawn: the first caller after a death starts it, everyone
    // else awaits the same attempt. Lazy (rather than eager-on-exit) so a
    // crashing binary cannot respawn-loop with no one asking for it.
    this.starting ??= this.spawnIncarnation()
      .then((incarnation) => {
        if (this.destroying) {
          // destroy() raced us and already awaited this promise; it owns teardown.
          return incarnation;
        }
        this.current = incarnation;
        return incarnation;
      })
      .finally(() => {
        this.starting = undefined;
      });
    return await this.starting;
  }

  /**
   * Convert a failed call into the death of the process when that is what
   * actually happened: the socket breaks before the child's 'exit' event
   * lands, so wait a short grace for exit attribution before giving up and
   * rethrowing the transport error as-is.
   */
  private async attributeCallError(
    incarnation: Incarnation,
    err: unknown,
  ): Promise<unknown> {
    if (!incarnation.exitInfo && !this.destroying) {
      await Promise.race([
        incarnation.exitPromise,
        new Promise((resolve) =>
          setTimeout(resolve, EXIT_ATTRIBUTION_GRACE_MS),
        ),
      ]);
    }
    if (incarnation.exitInfo && !this.destroying) {
      const { code, signal } = incarnation.exitInfo;
      return new IpcProcessExitedError(
        `${this.options.binaryName} exited unexpectedly (code=${code}, signal=${signal})` +
          (this.logPath !== undefined ? `; see logs: ${this.logPath}` : ""),
        code,
        signal,
        this.logPath,
      );
    }
    return err;
  }

  /** Spawn the server process and connect to it; kills the child on any failure. */
  private async spawnIncarnation(): Promise<Incarnation> {
    const { options } = this;
    await removeStaleIpcPath(options.transport, this.ipcPath);

    // Without a live logger, capture the child's stdout/stderr to the backend's
    // log file (a plain fd, not a pipe — a pipe would keep the libuv loop
    // referenced and break clean process exit). The path is surfaced on
    // failures so the child's errors are recoverable instead of vanishing.
    // Async fs throughout: this runs on respawn under exactly the machine
    // conditions where a sync open against a struggling disk could stall the
    // whole event loop.
    const logFile =
      this.logPath !== undefined ? await open(this.logPath, "a") : undefined;
    const child = spawnServerProcess(options, this.ipcPath, logFile?.fd);

    const incarnation: Partial<Incarnation> & { child: ChildProcess } = {
      child,
    };
    const exitPromise = new Promise<void>((resolve) => {
      child.on("exit", (code, signal) => {
        incarnation.exitInfo = { code, signal };
        this.onIncarnationExit(incarnation as Incarnation, code, signal);
        resolve();
      });
    });
    incarnation.exitPromise = exitPromise;

    const childReadyFailure = childReadyFailurePromise(
      child,
      options.binaryName,
    );

    if (logFile !== undefined) {
      // spawn() dups the fd synchronously; the parent's handle isn't needed.
      // Closed only now, after the 'error'/'exit' listeners are attached: spawn
      // failures are emitted on nextTick, so an await between spawn() and the
      // listeners would let them fire unhandled.
      await logFile.close();
    }

    // Liveness-based startup: wait on the connect for as long as the process
    // is alive (the connect path retries socket-not-ready errors internally),
    // and fail immediately with the real cause if the process dies first. On
    // any failure, reap the child and its ipc path so a failed spawn cannot
    // leak an orphan process still holding sockets or database locks.
    // The connect retries on a timer until its budget expires. When the child
    // dies first the race rejects, but nothing stops that loop — so abort it,
    // or it keeps dialling a dead server and holds the event loop open.
    const connectAbort = new AbortController();
    try {
      incarnation.client = await Promise.race([
        this.connectClient(connectAbort.signal),
        childReadyFailure,
      ]);
    } catch (err) {
      connectAbort.abort();
      if (child.pid !== undefined) {
        // SIGKILL, not SIGTERM: the process never became ready, so it has no
        // state to flush, and a wedged process may not honour SIGTERM.
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
        await exitPromise;
      }
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.removeAllListeners();
      await this.cleanupIpcPath();
      throw this.asSpawnError(err);
    }
    return incarnation as Incarnation;
  }

  /** Handles an incarnation's death: reject/replace state so later calls behave per the respawn policy. */
  private onIncarnationExit(
    incarnation: Incarnation,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    // Break the connection so in-flight calls reject rather than wait forever
    // (matters over SHM, where there is no socket to break).
    void incarnation.client?.destroy();
    if (this.destroying || this.current !== incarnation) {
      return;
    }
    this.current = undefined;
    if (!this.respawn) {
      this.exitError = new IpcProcessExitedError(
        `${this.options.binaryName} exited unexpectedly (code=${code}, signal=${signal})` +
          (this.logPath !== undefined ? `; see logs: ${this.logPath}` : ""),
        code,
        signal,
        this.logPath,
      );
      console.error(this.exitError.message);
    } else {
      console.error(
        `${this.options.binaryName} exited unexpectedly (code=${code}, signal=${signal}); will respawn on next call`,
      );
    }
  }

  private async connectClient(signal?: AbortSignal): Promise<IpcClientAsync> {
    const { options } = this;
    const timeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    if (options.transport === "uds") {
      // UdsIpcClient.connect retries socket-not-ready errors (path not yet
      // created, server not yet accepting, backlog momentarily full) until the
      // budget expires, and fails immediately on hard errors. Process death is
      // raced against this by the caller, so a dead server short-circuits the
      // wait with its real exit cause.
      return await UdsIpcClient.connect(this.ipcPath, {
        connectTimeoutMs: timeoutMs,
        unref: options.unref,
        signal,
      });
    }
    // The SHM client attaches to server-created rings, so creation can race
    // server startup; retry until the backstop expires.
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() <= deadline && !signal?.aborted) {
      try {
        return createNapiShmAsyncClient(this.ipcPath.replace(/\.shm$/, ""), {
          clientId: options.clientId,
          customAddonPath: options.napiPath,
        });
      } catch (err) {
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    throw new IpcSpawnError(
      `Timed out connecting to ${this.options.binaryName}: ${message}`,
      /*retry=*/ true,
      { cause: lastError },
    );
  }

  /** Wrap a spawn/connect failure as IpcSpawnError and point at the captured log. */
  private asSpawnError(err: unknown): IpcSpawnError {
    const logHint =
      this.logPath !== undefined ? `; see logs: ${this.logPath}` : "";
    if (err instanceof IpcSpawnError) {
      // Already classified at its source (child spawn 'error', exit-before-ready).
      return new IpcSpawnError(err.message + logHint, err.retry, {
        cause: err.cause ?? err,
      });
    }
    // Everything else reaching here (connect backstop expiry, transient
    // transport errors) is environmental.
    const message = err instanceof Error ? err.message : String(err);
    return new IpcSpawnError(
      `Failed to start ${this.options.binaryName}: ${message}${logHint}`,
      /*retry=*/ true,
      { cause: err },
    );
  }

  private async cleanupIpcPath(): Promise<void> {
    await removeStaleIpcPath(this.options.transport, this.ipcPath);
  }
}

/**
 * A synchronous IpcClientSync backed by a spawned server process, for callers
 * whose API cannot await (BarretenbergSync and friends). Shares process setup,
 * stale-path removal and the connect backstop with SpawnedProcessBackend; only
 * the request path differs, blocking in the NAPI client instead of returning a
 * promise.
 *
 * SHM only: a synchronous request needs the shared-memory client, as a socket
 * round trip cannot block the event loop without deadlocking it. Construction
 * is still async — the server has to come up before the first call — so only
 * call() and destroy() are synchronous.
 */
export class SpawnedProcessBackendSync implements IpcClientSync {
  private destroyed = false;

  private constructor(
    private readonly options: SpawnedProcessBackendOptions,
    private readonly child: ChildProcess,
    private readonly client: IpcClientSync,
    private readonly ipcPath: string,
    private readonly logPath?: string,
  ) {}

  static async spawn(
    options: SpawnedProcessBackendOptions,
  ): Promise<SpawnedProcessBackendSync> {
    if (options.transport !== "shm") {
      throw new IpcError(
        `SpawnedProcessBackendSync requires the shm transport (got ${options.transport})`,
        /*retry=*/ false,
      );
    }
    const instanceId = `${options.instancePrefix}-${process.pid}-${threadId}-${instanceCounter++}`;
    const ipcPath = `${instanceId}.shm`;
    const logPath = options.logger
      ? undefined
      : join(tmpdir(), `${instanceId}.log`);

    await removeStaleIpcPath("shm", ipcPath);
    const logFile = logPath !== undefined ? await open(logPath, "a") : undefined;
    const child = spawnServerProcess(options, ipcPath, logFile?.fd);
    const childReadyFailure = childReadyFailurePromise(
      child,
      options.binaryName,
    );
    await logFile?.close();

    try {
      const client = await Promise.race([
        connectShmSyncClient(options, ipcPath),
        childReadyFailure,
      ]);
      return new SpawnedProcessBackendSync(
        options,
        child,
        client,
        ipcPath,
        logPath,
      );
    } catch (err) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
      child.removeAllListeners();
      await removeStaleIpcPath("shm", ipcPath);
      throw err instanceof IpcError
        ? err
        : new IpcSpawnError(
            `Failed to start ${options.binaryName}: ${String(err)}`,
            /*retry=*/ true,
            { cause: err },
          );
    }
  }

  call(input: Uint8Array): Uint8Array {
    if (this.destroyed) {
      throw new IpcError(
        `${this.options.binaryName} backend destroyed`,
        /*retry=*/ false,
      );
    }
    try {
      return this.client.call(input);
    } catch (err) {
      // A dead server is the likeliest cause of a failed shm call; report it as
      // such (with the log path) rather than as an opaque transport error.
      if (this.child.exitCode !== null || this.child.signalCode !== null) {
        throw new IpcProcessExitedError(
          `${this.options.binaryName} exited unexpectedly (code=${this.child.exitCode}, signal=${this.child.signalCode})` +
            (this.logPath !== undefined ? `; see logs: ${this.logPath}` : ""),
          this.child.exitCode,
          this.child.signalCode,
          this.logPath,
        );
      }
      throw err;
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.client.destroy();
    if (this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill("SIGTERM");
    }
    this.child.removeAllListeners();
    // Teardown is synchronous by contract, so the segments are reaped in the
    // background; the pre-spawn removal is what actually guarantees a clean
    // start for the next occupant.
    void removeStaleIpcPath("shm", this.ipcPath);
  }
}

/** Retry attaching the sync shm client until the server has created its rings. */
async function connectShmSyncClient(
  options: SpawnedProcessBackendOptions,
  ipcPath: string,
): Promise<IpcClientSync> {
  const deadline =
    Date.now() + (options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS);
  let lastError: unknown;
  while (Date.now() <= deadline) {
    try {
      return createNapiShmSyncClient(ipcPath.replace(/\.shm$/, ""), {
        clientId: options.clientId,
        customAddonPath: options.napiPath,
      });
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new IpcSpawnError(
    `Timed out connecting to ${options.binaryName}: ${message}`,
    /*retry=*/ true,
    { cause: lastError },
  );
}
