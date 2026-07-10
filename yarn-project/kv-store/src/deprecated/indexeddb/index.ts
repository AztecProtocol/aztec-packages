import { createLogger } from '@aztec/foundation/log';

import { AztecIndexedDBStore } from './store.js';

export { AztecIndexedDBStore } from './store.js';

/**
 * @deprecated The IndexedDB backend is being retired. Use `@aztec/kv-store/sqlite-opfs` instead.
 */
export function openTmpStore(ephemeral: boolean = false): Promise<AztecIndexedDBStore> {
  return AztecIndexedDBStore.open(createLogger('kv-store:indexeddb'), undefined, ephemeral);
}
