import {
  createL1TxUtilsFromEthSigner as createL1TxUtilsFromEthSignerBase,
  createL1TxUtilsFromViemWallet as createL1TxUtilsFromViemWalletBase,
} from '@aztec/ethereum';
import type { EthSigner, ExtendedViemWalletClient, L1TxUtilsConfig, ViemClient } from '@aztec/ethereum';
import {
  createL1TxUtilsWithBlobsFromEthSigner as createL1TxUtilsWithBlobsFromEthSignerBase,
  createL1TxUtilsWithBlobsFromViemWallet as createL1TxUtilsWithBlobsFromViemWalletBase,
} from '@aztec/ethereum/l1-tx-utils-with-blobs';
import { createLogger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import type { TelemetryClient } from '@aztec/telemetry-client';

import type { L1TxScope } from '../metrics/l1_tx_metrics.js';
import { L1TxMetrics } from '../metrics/l1_tx_metrics.js';
import { L1TxStore } from '../stores/l1_tx_store.js';

const L1_TX_STORE_NAME = 'l1-tx-utils';

/**
 * Creates L1TxUtils with blobs from a Viem wallet, including store and metrics.
 */
export async function createL1TxUtilsWithBlobsFromViemWallet(
  client: ExtendedViemWalletClient,
  config: DataStoreConfig & Partial<L1TxUtilsConfig> & { debugMaxGasLimit?: boolean; scope?: L1TxScope },
  deps: {
    telemetry: TelemetryClient;
    logger?: ReturnType<typeof createLogger>;
    dateProvider?: DateProvider;
  },
) {
  const logger = deps.logger ?? createLogger('l1-tx-utils');
  const kvStore = await createStore(L1_TX_STORE_NAME, L1TxStore.SCHEMA_VERSION, config, logger);
  const store = new L1TxStore(kvStore, logger);
  const meter = deps.telemetry.getMeter('L1TxUtils');
  const metrics = new L1TxMetrics(meter, config.scope ?? 'other', logger);

  return createL1TxUtilsWithBlobsFromViemWalletBase(
    client,
    {
      logger,
      dateProvider: deps.dateProvider,
      store,
      metrics,
    },
    config,
    config.debugMaxGasLimit,
  );
}

/**
 * Creates L1TxUtils with blobs from an EthSigner, including store and metrics.
 */
export async function createL1TxUtilsWithBlobsFromEthSigner(
  client: ViemClient,
  signer: EthSigner,
  config: DataStoreConfig & Partial<L1TxUtilsConfig> & { debugMaxGasLimit?: boolean; scope?: L1TxScope },
  deps: {
    telemetry: TelemetryClient;
    logger?: ReturnType<typeof createLogger>;
    dateProvider?: DateProvider;
  },
) {
  const logger = deps.logger ?? createLogger('l1-tx-utils');
  const kvStore = await createStore(L1_TX_STORE_NAME, L1TxStore.SCHEMA_VERSION, config, logger);
  const store = new L1TxStore(kvStore, logger);
  const meter = deps.telemetry.getMeter('L1TxUtils');
  const metrics = new L1TxMetrics(meter, config.scope ?? 'other', logger);

  return createL1TxUtilsWithBlobsFromEthSignerBase(
    client,
    signer,
    {
      logger,
      dateProvider: deps.dateProvider,
      store,
      metrics,
    },
    config,
    config.debugMaxGasLimit,
  );
}

/**
 * Creates L1TxUtils (without blobs) from a Viem wallet, including store and metrics.
 */
export async function createL1TxUtilsFromViemWalletWithStore(
  client: ExtendedViemWalletClient,
  config: DataStoreConfig & Partial<L1TxUtilsConfig> & { debugMaxGasLimit?: boolean; scope?: L1TxScope },
  deps: {
    telemetry: TelemetryClient;
    logger?: ReturnType<typeof createLogger>;
    dateProvider?: DateProvider;
    scope?: L1TxScope;
  },
) {
  const logger = deps.logger ?? createLogger('l1-tx-utils');
  const kvStore = await createStore(L1_TX_STORE_NAME, L1TxStore.SCHEMA_VERSION, config, logger);
  const store = new L1TxStore(kvStore, logger);
  const meter = deps.telemetry.getMeter('L1TxUtils');
  const metrics = new L1TxMetrics(meter, config.scope ?? 'other', logger);

  return createL1TxUtilsFromViemWalletBase(client, { logger, dateProvider: deps.dateProvider, store, metrics }, config);
}

/**
 * Creates L1TxUtils (without blobs) from an EthSigner, including store and metrics.
 */
export async function createL1TxUtilsFromEthSignerWithStore(
  client: ViemClient,
  signer: EthSigner,
  config: DataStoreConfig & Partial<L1TxUtilsConfig> & { debugMaxGasLimit?: boolean; scope?: L1TxScope },
  deps: {
    telemetry: TelemetryClient;
    logger?: ReturnType<typeof createLogger>;
    dateProvider?: DateProvider;
    scope?: L1TxScope;
  },
) {
  const logger = deps.logger ?? createLogger('l1-tx-utils');
  const kvStore = await createStore(L1_TX_STORE_NAME, L1TxStore.SCHEMA_VERSION, config, logger);
  const store = new L1TxStore(kvStore, logger);
  const meter = deps.telemetry.getMeter('L1TxUtils');
  const metrics = new L1TxMetrics(meter, config.scope ?? 'other', logger);

  return createL1TxUtilsFromEthSignerBase(
    client,
    signer,
    { logger, dateProvider: deps.dateProvider, store, metrics },
    config,
  );
}
