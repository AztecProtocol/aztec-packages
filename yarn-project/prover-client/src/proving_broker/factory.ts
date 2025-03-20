import type { TelemetryClient } from '@aztec/telemetry-client';

import type { ProverBrokerConfig } from './config.js';
import { ProvingBroker } from './proving_broker.js';
import { InMemoryBrokerDatabase } from './proving_broker_database/memory.js';
import { KVBrokerDatabase } from './proving_broker_database/persisted.js';

export async function createAndStartProvingBroker(
  _config: ProverBrokerConfig,
  client: TelemetryClient,
): Promise<ProvingBroker> {
  const config = { ..._config, dataStoreMapSizeKB: _config.proverBrokerStoreMapSizeKB ?? _config.dataStoreMapSizeKB };
  const database = config.dataDirectory ? await KVBrokerDatabase.new(config, client) : new InMemoryBrokerDatabase();

  const broker = new ProvingBroker(database, config, client);

  await broker.start();
  return broker;
}
