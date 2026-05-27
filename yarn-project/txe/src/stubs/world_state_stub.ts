// Stub for the `@aztec/world-state` package barrel. The barrel re-exports `synchronizer/*`
// and `world-state-db/*`, none of which TXE invokes — TXE has its own `TXESynchronizer`
// and never starts a real `ServerWorldStateSynchronizer`. `aztec-node/server.js`
// statically imports `createWorldState` + `createWorldStateSynchronizer` factories from
// this barrel; both are referenced only inside `AztecNodeService.start()`, which TXE never
// calls. We provide throw-stubs so the import resolves without bundling the synchronizer.
//
// `ForkCheckpoint` (the one thing TXE actually uses from world-state) is reached via the
// `/native` subpath directly — see `oracle/txe_oracle_top_level_context.ts`.
export function createWorldState(..._args: unknown[]): never {
  throw new Error('createWorldState is stubbed in the TXE bundle; the worker uses TXESynchronizer instead');
}

export function createWorldStateSynchronizer(..._args: unknown[]): never {
  throw new Error('createWorldStateSynchronizer is stubbed in the TXE bundle');
}
