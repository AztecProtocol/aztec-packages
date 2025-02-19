import { type TelemetryClient } from '@aztec/telemetry-client';

import { type ProverBrokerConfig } from './config.js';
import { ProvingBroker } from './proving_broker.js';
import { InMemoryBrokerDatabase } from './proving_broker_database/memory.js';
import { KVBrokerDatabase } from './proving_broker_database/persisted.js';

export async function createAndStartProvingBroker(
  config: ProverBrokerConfig,
  client: TelemetryClient,
): Promise<ProvingBroker> {
  const database = config.dataDirectory ? await KVBrokerDatabase.new(config, client) : new InMemoryBrokerDatabase();

  const broker = new ProvingBroker(
    database,
    {
      jobTimeoutMs: config.proverBrokerJobTimeoutMs,
      maxRetries: config.proverBrokerJobMaxRetries,
      timeoutIntervalMs: config.proverBrokerPollIntervalMs,
    },
    client,
  );

  await broker.start();
  return broker;
}
