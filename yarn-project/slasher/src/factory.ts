import type { L1ReaderConfig, ViemClient } from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';

import type { Watcher } from './config.js';
import { SlasherClient } from './slasher_client.js';
import { SCHEMA_VERSION, SlasherOffensesStore, SlasherPayloadsStore } from './slasher_store.js';

export async function createSlasher(
  config: Omit<SlasherConfig, 'slasherPrivateKey'> & DataStoreConfig & { slasherEnabled?: boolean },
  l1Contracts: Pick<L1ReaderConfig['l1Contracts'], 'rollupAddress' | 'slashFactoryAddress'>,
  l1Client: ViemClient,
  watchers: Watcher[],
  dateProvider: DateProvider,
  logger = createLogger('slasher'),
): Promise<SlasherClient | undefined> {
  if (!config.slasherEnabled) {
    return undefined;
  }

  if (!config.dataDirectory) {
    throw new Error('Slasher requires a data directory to store offenses and payloads');
  }

  const kvStore = await createStore('slasher', SCHEMA_VERSION, config, createLogger('slasher:lmdb'));
  const offensesStore = new SlasherOffensesStore(kvStore);
  const payloadsStore = new SlasherPayloadsStore(kvStore);

  return SlasherClient.new(config, l1Contracts, l1Client, watchers, dateProvider, offensesStore, payloadsStore, logger);
}
