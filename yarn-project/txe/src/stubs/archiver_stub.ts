// Minimal re-export of `@aztec/archiver` for the TXE worker bundle. The real package's
// barrel pulls in 18 modules including `factory.js`, `archiver.js`, `l1_synchronizer.js`,
// and every store implementation — together ~150 KiB of code that TXE's `TXEArchiver` (which
// only needs the data-store wiring + the abstract base class) never executes. esbuild can't
// tree-shake the barrel because the package doesn't mark itself `sideEffects: false`, so we
// redirect the bare specifier to this file via an esbuild `onResolve` filter.
//
// The first three exports are what TXE itself imports. `createArchiver` and
// `L1ToL2MessagesNotReadyError` come from a transitive `aztec-node/server.js` static import
// (an `AztecNodeService` method TXE never calls); we provide trap implementations so the
// module graph resolves without dragging in `archiver/factory.js` (which transitively pulls
// l1_synchronizer + the L1 stack we don't want).
//
// Add a new symbol here if TXE — or one of its transitive deps — starts to reference it;
// do NOT re-export `*` from the barrel, that would re-introduce the entire bundle.
/* eslint-disable no-restricted-imports, import-x/no-relative-packages */
export { ArchiverDataSourceBase } from '../../../archiver/dest/modules/data_source_base.js';
export { ArchiverDataStoreUpdater } from '../../../archiver/dest/modules/data_store_updater.js';
export { createArchiverDataStores } from '../../../archiver/dest/store/data_stores.js';

/** Trap: `createArchiver` is referenced by `aztec-node/server.js`'s `start()` method, which
 * TXE never invokes — `TXEStateMachine` constructs `AztecNodeService` and uses a small subset
 * of its instance methods only. Throwing rather than silently returning a noop catches the
 * mistake loudly if a future code path actually wants the real archiver.
 */
export function createArchiver(..._args: unknown[]): never {
  throw new Error('createArchiver is stubbed out in the TXE bundle; the worker does not start an archiver');
}

/** Marker class used by `aztec-node/server.js` for an `instanceof` check inside the L1->L2
 * message readiness path TXE never reaches. We export a class with the right name so the
 * import resolves; instances are never produced. */
export class L1ToL2MessagesNotReadyError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'L1ToL2MessagesNotReadyError';
  }
}
