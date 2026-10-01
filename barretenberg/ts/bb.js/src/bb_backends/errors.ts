/**
 * The cross-layer contract for a failed call is the bare `retry` property, not this class.
 *
 * An error with `retry === true` failed for environmental reasons — the bb process died, its
 * connection broke, the machine was too loaded to start one — and the operation may be retried.
 * `retry === false`, or no such property, means retrying cannot help: the command itself is the
 * problem, or the backend was destroyed by its owner.
 *
 * Consumers feature-detect the property rather than importing this class, so the convention
 * survives package boundaries:
 *
 *   if (err instanceof Error && (err as Error & { retry?: unknown }).retry === true) { ... }
 *
 * This is deliberately the same convention the ipc-runtime transports use, so a caller written
 * against one works unchanged against the other.
 */
export class BackendUnavailableError extends Error {
  readonly retry = true;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BackendUnavailableError';
  }
}

/** Whether a failure was environmental, and so may be retried. */
export function isRetryable(err: unknown): boolean {
  return err instanceof Error && (err as Error & { retry?: unknown }).retry === true;
}
