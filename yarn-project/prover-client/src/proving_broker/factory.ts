import { type ProverBrokerConfig } from '@aztec/circuit-types';
import { AztecLmdbStore } from '@aztec/kv-store/lmdb';
import { type TelemetryClient } from '@aztec/telemetry-client';

import { ProvingBroker } from './proving_broker.js';
import { InMemoryBrokerDatabase } from './proving_broker_database/memory.js';
import { KVBrokerDatabase } from './proving_broker_database/persisted.js';

export async function createAndStartProvingBroker(
  config: ProverBrokerConfig,
  client: TelemetryClient,
): Promise<ProvingBroker> {
  const database = config.proverBrokerDataDirectory
    ? new KVBrokerDatabase(AztecLmdbStore.open(config.proverBrokerDataDirectory), client)
    : new InMemoryBrokerDatabase();

  const broker = new ProvingBroker(database, client, {
    jobTimeoutMs: config.proverBrokerJobTimeoutMs,
    maxRetries: config.proverBrokerJobMaxRetries,
    timeoutIntervalMs: config.proverBrokerPollIntervalMs,
  });

  await broker.start();
  return broker;
}
