// Stub for `aztec-node/dest/sentinel/factory.js`. The real factory pulls in the full
// `Sentinel` class (~13 KiB) and the sentinel KV store. `AztecNodeService.start()`
// statically imports `createSentinel` from this file; TXE never calls `.start()`, so the
// function is unreachable at runtime — providing a throw-stub keeps the import shape
// resolvable without bundling the sentinel.
export function createSentinel(..._args: unknown[]): never {
  throw new Error('createSentinel is stubbed in the TXE bundle; AztecNodeService.start() is never invoked');
}
