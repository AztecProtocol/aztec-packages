import { throwStub } from './stub_helpers.js';

/* eslint-disable no-restricted-imports, import-x/no-relative-packages */
export { ArchiverDataSourceBase } from '../../../../archiver/dest/modules/data_source_base.js';
export { ArchiverDataStoreUpdater } from '../../../../archiver/dest/modules/data_store_updater.js';
export { createArchiverDataStores } from '../../../../archiver/dest/store/data_stores.js';

export function createArchiver(..._args: unknown[]): never {
  throwStub('createArchiver');
}

export class L1ToL2MessagesNotReadyError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'L1ToL2MessagesNotReadyError';
  }
}
