import { type ProverBrokerConfig } from '@aztec/circuit-types';
import { AztecLmdbStore } from '@aztec/kv-store/lmdb';

import { ProvingBroker } from './proving_broker.js';
import { InMemoryBrokerDatabase } from './proving_broker_database/memory.js';
import { KVBrokerDatabase } from './proving_broker_database/persisted.js';

export async function createAndStartProvingBroker(config: ProverBrokerConfig): Promise<ProvingBroker> {
  const database = config.proverBrokerDataDirectory
    ? new KVBrokerDatabase(AztecLmdbStore.open(config.proverBrokerDataDirectory))
    : new InMemoryBrokerDatabase();

  const broker = new ProvingBroker(database, {
    jobTimeoutMs: config.proverBrokerJobTimeoutMs,
    maxRetries: config.proverBrokerJobMaxRetries,
    timeoutIntervalMs: config.proverBrokerPollIntervalMs,
  });

  await broker.start();
  return broker;
}
