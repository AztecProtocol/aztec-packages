import { type EthAddress } from '@aztec/foundation/eth-address';
import { type Logger } from '@aztec/foundation/log';

import { type AztecAsyncSingleton, type AztecSingleton } from './interfaces/singleton.js';
import { type AztecAsyncKVStore, type AztecKVStore } from './interfaces/store.js';
import { isSyncStore } from './interfaces/utils.js';

/**
 * Clears the store if the rollup address does not match the one stored in the database.
 * This is to prevent data from being accidentally shared between different rollup instances.
 * @param store - The store to check
 * @param rollupAddress - The ETH address of the rollup contract
 * @returns A promise that resolves when the store is cleared, or rejects if the rollup address does not match
 */
export async function initStoreForRollup<T extends AztecKVStore | AztecAsyncKVStore>(
  store: T,
  rollupAddress: EthAddress,
  log?: Logger,
): Promise<T> {
  if (!rollupAddress) {
    throw new Error('Rollup address is required');
  }
  const rollupAddressValue = store.openSingleton<ReturnType<EthAddress['toString']>>('rollupAddress');
  const rollupAddressString = rollupAddress.toString();
  const storedRollupAddressString = isSyncStore(store)
    ? (rollupAddressValue as AztecSingleton<ReturnType<EthAddress['toString']>>).get()
    : await (rollupAddressValue as AztecAsyncSingleton<ReturnType<EthAddress['toString']>>).getAsync();

  if (typeof storedRollupAddressString !== 'undefined' && storedRollupAddressString !== rollupAddressString) {
    log?.warn(`Rollup address mismatch. Clearing entire database...`, {
      expected: rollupAddressString,
      found: storedRollupAddressString,
    });

    await store.clear();
  }

  await rollupAddressValue.set(rollupAddressString);
  return store;
}
