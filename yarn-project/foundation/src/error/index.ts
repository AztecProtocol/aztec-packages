/**
 * Represents an error thrown when an operation is interrupted unexpectedly.
 * This custom error class extends the built-in Error class in JavaScript and
 * can be used to handle cases where a process or task is terminated before completion.
 */
export class InterruptError extends Error {
  public override readonly name = 'InterruptError';
}

/**
 * An error thrown when an action times out.
 */
export class TimeoutError extends Error {
  public override readonly name = 'TimeoutError';
}

/**
 * Represents an error thrown when an operation is aborted.
 */
export class AbortError extends Error {
  public override readonly name = 'AbortError';
}

/**
 * Throws a uniform "unreachable" error. Use in stub implementations whose only purpose is to
 * satisfy an import shape — calling the stubbed code path should never happen and indicates the
 * stub is being used outside its intended bundle context.
 */
export function throwTrap(name: string): never {
  throw new Error(`${name} is stubbed in this bundle; this code path should never run`);
}
