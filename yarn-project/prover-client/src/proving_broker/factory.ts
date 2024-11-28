import { type ProverBrokerConfig } from '@aztec/circuit-types';
import { AztecLmdbStore } from '@aztec/kv-store/lmdb';
import { type TelemetryClient } from '@aztec/telemetry-client';

import { join } from 'path';

import { ProvingBroker } from './proving_broker.js';
import { ProvingBrokerDatabase } from './proving_broker_database.js';
import { InMemoryBrokerDatabase } from './proving_broker_database/memory.js';
import { KVBrokerDatabase } from './proving_broker_database/persisted.js';

export async function createAndStartProvingBroker(
  config: ProverBrokerConfig,
  client: TelemetryClient,
): Promise<ProvingBroker> {
  let database: ProvingBrokerDatabase;
  if (config.dataDirectory) {
    const dataDir = join(config.dataDirectory, 'prover_broker');
    const store = AztecLmdbStore.open(dataDir, config.dataStoreMapSizeKB);
    database = new KVBrokerDatabase(store, client);
  } else {
    database = new InMemoryBrokerDatabase();
  }

  const broker = new ProvingBroker(database, client, {
    jobTimeoutMs: config.proverBrokerJobTimeoutMs,
    maxRetries: config.proverBrokerJobMaxRetries,
    timeoutIntervalMs: config.proverBrokerPollIntervalMs,
  });

  await broker.start();
  return broker;
}
