import { type ChildProcess, spawn } from "node:child_process";
import { open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { threadId } from "node:worker_threads";
import { IpcError, IpcProcessExitedError, IpcSpawnError } from "./errors.js";
import { createNapiShmAsyncClient } from "./shm_client.js";
import { IpcClientAsync } from "./types.js";
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
    if (options.transport === "uds") {
      await rm(this.ipcPath, { force: true });
    }

    // Without a live logger, capture the child's stdout/stderr to the backend's
    // log file (a plain fd, not a pipe — a pipe would keep the libuv loop
    // referenced and break clean process exit). The path is surfaced on
    // failures so the child's errors are recoverable instead of vanishing.
    // Async fs throughout: this runs on respawn under exactly the machine
    // conditions where a sync open against a struggling disk could stall the
    // whole event loop.
    const logFile =
      this.logPath !== undefined ? await open(this.logPath, "a") : undefined;
    const child = spawn(
      options.binaryPath,
      [
        ...options.ipcPathArgs.map((arg) =>
          arg === "{path}" ? this.ipcPath : arg,
        ),
        ...(options.extraArgs ?? []),
      ],
      {
        stdio: [
          "ignore",
          options.logger ? "pipe" : logFile!.fd,
          options.logger ? "pipe" : logFile!.fd,
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

    const childReadyFailure = new Promise<never>((_, reject) => {
      // Spawn syscall failures are the one place errno distinguishes a
      // configuration error (missing/non-executable binary → retrying cannot
      // help) from an environmental one.
      child.once("error", (err) => {
        const code = (err as NodeJS.ErrnoException).code;
        const retry = code !== "ENOENT" && code !== "EACCES";
        reject(
          new IpcSpawnError(
            `Failed to spawn ${options.binaryName}: ${err.message}`,
            retry,
            { cause: err },
          ),
        );
      });
      child.once("exit", (code, signal) => {
        reject(
          new IpcSpawnError(
            `${options.binaryName} exited before IPC connection was ready (code=${code}, signal=${signal})`,
            /*retry=*/ true,
          ),
        );
      });
    });

    // Observe immediately: childReadyFailure can reject during the awaits
    // below (spawn failures land on nextTick), before Promise.race attaches
    // its handler — without this it would count as an unhandled rejection.
    childReadyFailure.catch(() => {});

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
    try {
      incarnation.client = await Promise.race([
        this.connectClient(),
        childReadyFailure,
      ]);
    } catch (err) {
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

  private async connectClient(): Promise<IpcClientAsync> {
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
      });
    }
    // The SHM client attaches to server-created rings, so creation can race
    // server startup; retry until the backstop expires.
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() <= deadline) {
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
    try {
      if (this.options.transport === "uds") {
        await rm(this.ipcPath, { force: true });
      }
      if (this.options.transport === "shm") {
        const shmName = this.ipcPath.replace(/\.shm$/, "");
        for (const suffix of ["_request", "_response"]) {
          await rm(`/dev/shm/${shmName}${suffix}`, { force: true });
        }
      }
    } catch {
      // Cleanup is best-effort; the paths live under tmpdir.
    }
  }
}
