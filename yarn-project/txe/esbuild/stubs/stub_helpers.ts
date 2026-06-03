/**
 * Error thrown when a stubbed code path that must never run is invoked. Stubs exist only to satisfy
 * an import shape for the bundled TXE; reaching one means the stubbed module is being used outside
 * its intended context.
 */
export class StubInvocationError extends Error {
  public override readonly name = 'StubInvocationError';

  constructor(symbol: string) {
    super(`${symbol} is stubbed in this bundle; this code path should never run`);
  }
}

/** Throws a {@link StubInvocationError} for `symbol`. Use for stubbed APIs that must never run. */
export function throwStub(symbol: string): never {
  throw new StubInvocationError(symbol);
}

/** No-op for stubbed APIs that are exercised in the bundle but should intentionally do nothing. */
export function noop(): void {}
