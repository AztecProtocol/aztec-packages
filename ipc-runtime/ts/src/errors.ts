/**
 * Errors thrown by the ipc-runtime transports and process backends.
 *
 * The cross-layer contract is the bare `retry` property, not these classes:
 * an error with `retry === true` failed for environmental reasons (process
 * death, machine load, a broken connection) and the operation may be retried;
 * `retry === false` (or no `retry` property at all) means retrying cannot
 * help. Consumers should feature-detect the property rather than import
 * these types, so the convention survives package boundaries.
 */
export class IpcError extends Error {
  constructor(
    message: string,
    public readonly retry: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The connection to the server broke while calls were in flight or before they could be sent. */
export class IpcTransportError extends IpcError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, /*retry=*/ true, options);
  }
}

/** The spawned server process exited; carries the exit cause and, when captured, the log path. */
export class IpcProcessExitedError extends IpcError {
  constructor(
    message: string,
    public readonly code: number | null,
    public readonly signal: NodeJS.Signals | null,
    public readonly logPath?: string,
  ) {
    super(message, /*retry=*/ true);
  }
}

/**
 * The server process could not be started. Environmental failures (spawn
 * raced a loaded machine, a wedged process hit the connect backstop) are
 * retryable; configuration failures (binary not found) are not.
 */
export class IpcSpawnError extends IpcError {}
