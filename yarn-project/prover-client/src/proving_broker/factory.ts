import type { LoggerFactory } from '@aztec/foundation/log';
import type { TelemetryClient } from '@aztec/telemetry-client';

import type { ProverBrokerConfig } from './config.js';
import { ProvingBroker } from './proving_broker.js';
import { InMemoryBrokerDatabase } from './proving_broker_database/memory.js';
import { KVBrokerDatabase } from './proving_broker_database/persisted.js';

export async function createAndStartProvingBroker(
  _config: ProverBrokerConfig,
  client: TelemetryClient,
  loggerFactory: LoggerFactory,
): Promise<ProvingBroker> {
  const config = { ..._config, dataStoreMapSizeKb: _config.proverBrokerStoreMapSizeKb ?? _config.dataStoreMapSizeKb };
  const logger = loggerFactory.createLogger('prover:proving-broker-database');
  const database = config.dataDirectory
    ? await KVBrokerDatabase.new(config, logger, client)
    : new InMemoryBrokerDatabase();

  const broker = new ProvingBroker(database, loggerFactory, config, client);

  await broker.start();
  return broker;
}
