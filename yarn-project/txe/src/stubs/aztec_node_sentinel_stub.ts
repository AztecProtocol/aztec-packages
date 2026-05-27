// Stub for `aztec-node/dest/sentinel/sentinel.js`. `AztecNodeService` references the
// `Sentinel` class only as a constructor argument type and via `createSentinel` calls inside
// `start()` — TXE never reaches either. We export an identity-only class so the import
// resolves and instanceof / type checks compile, without bundling the ~13 KiB sentinel
// implementation and its KV-store wiring.
/* eslint-disable @typescript-eslint/no-extraneous-class */
export class Sentinel {
  constructor(..._args: unknown[]) {
    throw new Error('Sentinel is stubbed in the TXE bundle; the validator subsystem is never started');
  }
}
