import type { BlobKzgInstance } from '@aztec/blob-lib/types';
import type { EthSigner } from '@aztec/ethereum/eth-signer';
import { createDelayer, createL1TxUtils as createL1TxUtilsBase } from '@aztec/ethereum/l1-tx-utils';
import type { L1TxUtilsConfig } from '@aztec/ethereum/l1-tx-utils';
import { createForwarderL1TxUtils as createForwarderL1TxUtilsBase } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import type { ExtendedViemWalletClient, ViemClient } from '@aztec/ethereum/types';
import { omit } from '@aztec/foundation/collection';
import type { EthAddress } from '@aztec/foundation/eth-address';
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
 * Creates shared dependencies (logger, store, metrics, delayer) for L1TxUtils instances.
 * When enableDelayer is set in config, a single shared delayer is created and passed to all instances.
 */
async function createSharedDeps(
  config: DataStoreConfig & Partial<L1TxUtilsConfig> & { scope?: L1TxScope },
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

  // Create a single shared delayer for all L1TxUtils instances in this group
  const delayer =
    config.enableDelayer && config.ethereumSlotDuration !== undefined && deps.dateProvider
      ? createDelayer(deps.dateProvider, { ethereumSlotDuration: config.ethereumSlotDuration })
      : undefined;

  return { logger, store, metrics, dateProvider: deps.dateProvider, delayer };
}

/**
 * Creates L1TxUtils from multiple Viem wallet clients, sharing store, metrics, and delayer.
 * When kzg is provided in deps, blob support is enabled.
 */
export async function createL1TxUtilsFromWallets(
  clients: ExtendedViemWalletClient[],
  config: DataStoreConfig & Partial<L1TxUtilsConfig> & { debugMaxGasLimit?: boolean; scope?: L1TxScope },
  deps: {
    telemetry: TelemetryClient;
    logger?: ReturnType<typeof createLogger>;
    dateProvider?: DateProvider;
    kzg?: BlobKzgInstance;
  },
) {
  const sharedDeps = await createSharedDeps(config, deps);

  return clients.map(client => createL1TxUtilsBase(client, { ...sharedDeps, kzg: deps.kzg }, config));
}

/**
 * Creates L1TxUtils from multiple EthSigners, sharing store, metrics, and delayer.
 * When kzg is provided in deps, blob support is enabled.
 * Deduplicates signers by address to avoid creating multiple instances for the same publisher.
 */
export async function createL1TxUtilsFromSigners(
  client: ViemClient,
  signers: EthSigner[],
  config: DataStoreConfig & Partial<L1TxUtilsConfig> & { debugMaxGasLimit?: boolean; scope?: L1TxScope },
  deps: {
    telemetry: TelemetryClient;
    logger?: ReturnType<typeof createLogger>;
    dateProvider?: DateProvider;
    kzg?: BlobKzgInstance;
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

  return uniqueSigners.map(signer => createL1TxUtilsBase({ client, signer }, { ...sharedDeps, kzg: deps.kzg }, config));
}

/**
 * Creates ForwarderL1TxUtils from multiple Viem wallet clients, sharing store, metrics, and delayer.
 * Wraps all transactions through a forwarder contract for testing purposes.
 * When kzg is provided in deps, blob support is enabled.
 */
export async function createForwarderL1TxUtilsFromWallets(
  clients: ExtendedViemWalletClient[],
  forwarderAddress: EthAddress,
  config: DataStoreConfig & Partial<L1TxUtilsConfig> & { debugMaxGasLimit?: boolean; scope?: L1TxScope },
  deps: {
    telemetry: TelemetryClient;
    logger?: ReturnType<typeof createLogger>;
    dateProvider?: DateProvider;
    kzg?: BlobKzgInstance;
  },
) {
  const sharedDeps = await createSharedDeps(config, deps);

  return clients.map(client =>
    createForwarderL1TxUtilsBase(client, forwarderAddress, { ...sharedDeps, kzg: deps.kzg }, config),
  );
}

/**
 * Creates ForwarderL1TxUtils from multiple EthSigners, sharing store, metrics, and delayer.
 * Wraps all transactions through a forwarder contract for testing purposes.
 * When kzg is provided in deps, blob support is enabled.
 */
export async function createForwarderL1TxUtilsFromSigners(
  client: ViemClient,
  signers: EthSigner[],
  forwarderAddress: EthAddress,
  config: DataStoreConfig & Partial<L1TxUtilsConfig> & { debugMaxGasLimit?: boolean; scope?: L1TxScope },
  deps: {
    telemetry: TelemetryClient;
    logger?: ReturnType<typeof createLogger>;
    dateProvider?: DateProvider;
    kzg?: BlobKzgInstance;
  },
) {
  const sharedDeps = await createSharedDeps(config, deps);

  return signers.map(signer =>
    createForwarderL1TxUtilsBase({ client, signer }, forwarderAddress, { ...sharedDeps, kzg: deps.kzg }, config),
  );
}
