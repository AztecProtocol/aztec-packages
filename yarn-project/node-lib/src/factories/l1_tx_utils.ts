import type { EthSigner } from '@aztec/ethereum/eth-signer';
import {
  createL1TxUtilsFromEthSigner as createL1TxUtilsFromEthSignerBase,
  createL1TxUtilsFromViemWallet as createL1TxUtilsFromViemWalletBase,
} from '@aztec/ethereum/l1-tx-utils';
import type { L1TxUtilsConfig } from '@aztec/ethereum/l1-tx-utils';
import {
  createForwarderL1TxUtilsFromEthSigner as createForwarderL1TxUtilsFromEthSignerBase,
  createForwarderL1TxUtilsFromViemWallet as createForwarderL1TxUtilsFromViemWalletBase,
  createL1TxUtilsWithBlobsFromEthSigner as createL1TxUtilsWithBlobsFromEthSignerBase,
  createL1TxUtilsWithBlobsFromViemWallet as createL1TxUtilsWithBlobsFromViemWalletBase,
} from '@aztec/ethereum/l1-tx-utils-with-blobs';
import type { ExtendedViemWalletClient, ViemClient } from '@aztec/ethereum/types';
import { omit } from '@aztec/foundation/collection';
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
 * Creates shared dependencies (logger, store, metrics) for L1TxUtils instances.
 */
async function createSharedDeps(
  config: DataStoreConfig & { scope?: L1TxScope },
  deps: {
    telemetry: TelemetryClient;
    logger?: ReturnType<typeof createLogger>;
    dateProvider?: DateProvider;
  },
) {
  const logger = deps.logger ?? createLogger('l1-tx-utils');

  // Note that we do NOT bind them to the rollup address, since we still need to
  // monitor and cancel txs for previous rollups to free up our nonces.
  const noRollupConfig = omit(config, 'l1Contracts');
  const kvStore = await createStore(L1_TX_STORE_NAME, L1TxStore.SCHEMA_VERSION, noRollupConfig, logger.getBindings());
  const store = new L1TxStore(kvStore, logger);

  const meter = deps.telemetry.getMeter('L1TxUtils');
  const metrics = new L1TxMetrics(meter, config.scope ?? 'other', logger);

  return { logger, store, metrics, dateProvider: deps.dateProvider };
}

/**
 * Creates L1TxUtils with blobs from multiple Viem wallets, sharing store and metrics.
 */
export async function createL1TxUtilsWithBlobsFromViemWallet(
  clients: ExtendedViemWalletClient[],
  config: DataStoreConfig & Partial<L1TxUtilsConfig> & { debugMaxGasLimit?: boolean; scope?: L1TxScope },
  deps: {
    telemetry: TelemetryClient;
    logger?: ReturnType<typeof createLogger>;
    dateProvider?: DateProvider;
  },
) {
  const sharedDeps = await createSharedDeps(config, deps);

  return clients.map(client =>
    createL1TxUtilsWithBlobsFromViemWalletBase(client, sharedDeps, config, config.debugMaxGasLimit),
  );
}

/**
 * Creates L1TxUtils with blobs from multiple EthSigners, sharing store and metrics. Removes duplicates
 */
export async function createL1TxUtilsWithBlobsFromEthSigner(
  client: ViemClient,
  signers: EthSigner[],
  config: DataStoreConfig & Partial<L1TxUtilsConfig> & { debugMaxGasLimit?: boolean; scope?: L1TxScope },
  deps: {
    telemetry: TelemetryClient;
    logger?: ReturnType<typeof createLogger>;
    dateProvider?: DateProvider;
  },
) {
  const sharedDeps = await createSharedDeps(config, deps);

  // Deduplicate signers by address to avoid creating multiple L1TxUtils instances
  // for the same publisher address (e.g., when multiple attesters share the same publisher key)
  const signersByAddress = new Map<string, EthSigner>();
  for (const signer of signers) {
    const addressKey = signer.address.toString().toLowerCase();
    if (!signersByAddress.has(addressKey)) {
      signersByAddress.set(addressKey, signer);
    }
  }

  const uniqueSigners = Array.from(signersByAddress.values());

  if (uniqueSigners.length < signers.length) {
    sharedDeps.logger.info(
      `Deduplicated ${signers.length} signers to ${uniqueSigners.length} unique publisher addresses`,
    );
  }

  return uniqueSigners.map(signer =>
    createL1TxUtilsWithBlobsFromEthSignerBase(client, signer, sharedDeps, config, config.debugMaxGasLimit),
  );
}

/**
 * Creates L1TxUtils (without blobs) from multiple Viem wallets, sharing store and metrics.
 */
export async function createL1TxUtilsFromViemWalletWithStore(
  clients: ExtendedViemWalletClient[],
  config: DataStoreConfig & Partial<L1TxUtilsConfig> & { debugMaxGasLimit?: boolean; scope?: L1TxScope },
  deps: {
    telemetry: TelemetryClient;
    logger?: ReturnType<typeof createLogger>;
    dateProvider?: DateProvider;
    scope?: L1TxScope;
  },
) {
  const sharedDeps = await createSharedDeps(config, deps);

  return clients.map(client => createL1TxUtilsFromViemWalletBase(client, sharedDeps, config));
}

/**
 * Creates L1TxUtils (without blobs) from multiple EthSigners, sharing store and metrics. Removes duplicates.
 */
export async function createL1TxUtilsFromEthSignerWithStore(
  client: ViemClient,
  signers: EthSigner[],
  config: DataStoreConfig & Partial<L1TxUtilsConfig> & { debugMaxGasLimit?: boolean; scope?: L1TxScope },
  deps: {
    telemetry: TelemetryClient;
    logger?: ReturnType<typeof createLogger>;
    dateProvider?: DateProvider;
    scope?: L1TxScope;
  },
) {
  const sharedDeps = await createSharedDeps(config, deps);

  // Deduplicate signers by address to avoid creating multiple L1TxUtils instances
  // for the same publisher address (e.g., when multiple attesters share the same publisher key)
  const signersByAddress = new Map<string, EthSigner>();
  for (const signer of signers) {
    const addressKey = signer.address.toString().toLowerCase();
    if (!signersByAddress.has(addressKey)) {
      signersByAddress.set(addressKey, signer);
    }
  }

  const uniqueSigners = Array.from(signersByAddress.values());

  if (uniqueSigners.length < signers.length) {
    sharedDeps.logger.info(
      `Deduplicated ${signers.length} signers to ${uniqueSigners.length} unique publisher addresses`,
    );
  }

  return uniqueSigners.map(signer => createL1TxUtilsFromEthSignerBase(client, signer, sharedDeps, config));
}

/**
 * Creates ForwarderL1TxUtils from multiple Viem wallets, sharing store and metrics.
 * This wraps all transactions through a forwarder contract for testing purposes.
 */
export async function createForwarderL1TxUtilsFromViemWallet(
  clients: ExtendedViemWalletClient[],
  forwarderAddress: import('@aztec/foundation/eth-address').EthAddress,
  config: DataStoreConfig & Partial<L1TxUtilsConfig> & { debugMaxGasLimit?: boolean; scope?: L1TxScope },
  deps: {
    telemetry: TelemetryClient;
    logger?: ReturnType<typeof createLogger>;
    dateProvider?: DateProvider;
  },
) {
  const sharedDeps = await createSharedDeps(config, deps);

  return clients.map(client =>
    createForwarderL1TxUtilsFromViemWalletBase(client, forwarderAddress, sharedDeps, config, config.debugMaxGasLimit),
  );
}

/**
 * Creates ForwarderL1TxUtils from multiple EthSigners, sharing store and metrics.
 * This wraps all transactions through a forwarder contract for testing purposes.
 */
export async function createForwarderL1TxUtilsFromEthSigner(
  client: ViemClient,
  signers: EthSigner[],
  forwarderAddress: import('@aztec/foundation/eth-address').EthAddress,
  config: DataStoreConfig & Partial<L1TxUtilsConfig> & { debugMaxGasLimit?: boolean; scope?: L1TxScope },
  deps: {
    telemetry: TelemetryClient;
    logger?: ReturnType<typeof createLogger>;
    dateProvider?: DateProvider;
  },
) {
  const sharedDeps = await createSharedDeps(config, deps);

  return signers.map(signer =>
    createForwarderL1TxUtilsFromEthSignerBase(
      client,
      signer,
      forwarderAddress,
      sharedDeps,
      config,
      config.debugMaxGasLimit,
    ),
  );
}
