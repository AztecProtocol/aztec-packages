import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { AztecLMDBStoreV2, createStore } from '@aztec/kv-store/lmdb-v2';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { ChainConfig } from '@aztec/stdlib/config';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { ClientProtocolCircuitVerifier, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { P2PClientType } from '@aztec/stdlib/p2p';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { P2PClient } from '../client/p2p_client.js';
import type { P2PConfig } from '../config.js';
import type { AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import { InMemoryAttestationPool } from '../mem_pools/attestation_pool/memory_attestation_pool.js';
import type { MemPools } from '../mem_pools/interface.js';
import { AztecKVTxPool, type TxPool } from '../mem_pools/tx_pool/index.js';
import { DummyP2PService } from '../services/dummy_service.js';
import { LibP2PService } from '../services/index.js';
import { TxCollection } from '../services/tx_collection/tx_collection.js';
import { type TxSource, createNodeRpcTxSources } from '../services/tx_collection/tx_source.js';
import { configureP2PClientAddresses, createLibP2PPeerIdFromPrivateKey, getPeerIdPrivateKey } from '../util.js';

export type P2PClientDeps<T extends P2PClientType> = {
  txPool?: TxPool;
  store?: AztecAsyncKVStore;
  attestationPool?: T extends P2PClientType.Full ? AttestationPool : undefined;
  logger?: Logger;
  txCollectionNodeSources?: TxSource[];
  p2pServiceFactory?: (...args: Parameters<(typeof LibP2PService)['new']>) => Promise<LibP2PService<T>>;
};

export const P2P_STORE_NAME = 'p2p';
export const P2P_ARCHIVE_STORE_NAME = 'p2p-archive';
export const P2P_PEER_STORE_NAME = 'p2p-peers';

export async function createP2PClient<T extends P2PClientType>(
  clientType: T,
  inputConfig: P2PConfig & DataStoreConfig & ChainConfig,
  archiver: L2BlockSource & ContractDataSource,
  proofVerifier: ClientProtocolCircuitVerifier,
  worldStateSynchronizer: WorldStateSynchronizer,
  epochCache: EpochCacheInterface,
  packageVersion: string,
  dateProvider: DateProvider = new DateProvider(),
  telemetry: TelemetryClient = getTelemetryClient(),
  deps: P2PClientDeps<T> = {},
) {
  const config = await configureP2PClientAddresses({
    ...inputConfig,
    dataStoreMapSizeKB: inputConfig.p2pStoreMapSizeKb ?? inputConfig.dataStoreMapSizeKB,
  });

  const logger = deps.logger ?? createLogger('p2p');
  const store = deps.store ?? (await createStore(P2P_STORE_NAME, 2, config, createLogger('p2p:lmdb-v2')));
  const archive = await createStore(P2P_ARCHIVE_STORE_NAME, 1, config, createLogger('p2p-archive:lmdb-v2'));
  const peerStore = await createStore(P2P_PEER_STORE_NAME, 1, config, createLogger('p2p-peer:lmdb-v2'));
  const l1Constants = await archiver.getL1Constants();

  const mempools: MemPools<T> = {
    txPool:
      deps.txPool ??
      new AztecKVTxPool(store, archive, worldStateSynchronizer, telemetry, {
        maxTxPoolSize: config.maxTxPoolSize,
        archivedTxLimit: config.archivedTxLimit,
      }),
    attestationPool:
      clientType === P2PClientType.Full
        ? ((deps.attestationPool ?? new InMemoryAttestationPool(telemetry)) as T extends P2PClientType.Full
            ? AttestationPool
            : undefined)
        : undefined,
  };

  const p2pService = await createP2PService<T>(
    config,
    clientType,
    archiver,
    proofVerifier,
    worldStateSynchronizer,
    epochCache,
    store,
    peerStore,
    mempools,
    deps.p2pServiceFactory,
    packageVersion,
    logger.createChild('libp2p_service'),
    telemetry,
  );

  const nodeSources = [
    ...createNodeRpcTxSources(config.txCollectionNodeRpcUrls, config),
    ...(deps.txCollectionNodeSources ?? []),
  ];
  if (nodeSources.length > 0) {
    logger.info(`Using ${nodeSources.length} node RPC sources for tx collection.`, {
      nodes: nodeSources.map(n => n.getInfo()),
    });
  }

  const txCollection = new TxCollection(
    p2pService,
    nodeSources,
    l1Constants,
    mempools.txPool,
    config,
    dateProvider,
    telemetry,
    logger.createChild('tx-collection'),
  );

  return new P2PClient(
    clientType,
    store,
    archiver,
    mempools,
    p2pService,
    txCollection,
    config,
    dateProvider,
    telemetry,
  );
}

async function createP2PService<T extends P2PClientType>(
  config: P2PConfig & DataStoreConfig,
  clientType: T,
  archiver: L2BlockSource & ContractDataSource,
  proofVerifier: ClientProtocolCircuitVerifier,
  worldStateSynchronizer: WorldStateSynchronizer,
  epochCache: EpochCacheInterface,
  store: AztecAsyncKVStore,
  peerStore: AztecLMDBStoreV2,
  mempools: MemPools<T>,
  p2pServiceFactory: P2PClientDeps<T>['p2pServiceFactory'],
  packageVersion: string,
  logger: Logger,
  telemetry: TelemetryClient,
) {
  if (!config.p2pEnabled) {
    logger.verbose('P2P is disabled. Using dummy P2P service.');
    return new DummyP2PService();
  }

  logger.verbose('P2P is enabled. Using LibP2P service.');

  // Create peer discovery service
  const peerIdPrivateKey = await getPeerIdPrivateKey(config, store, logger);
  const peerId = await createLibP2PPeerIdFromPrivateKey(peerIdPrivateKey.getValue());

  const p2pService = await (p2pServiceFactory ?? LibP2PService.new<T>)(clientType, config, peerId, {
    packageVersion,
    mempools,
    l2BlockSource: archiver,
    epochCache,
    proofVerifier,
    worldStateSynchronizer,
    peerStore,
    telemetry,
    logger: logger.createChild(`libp2p_service`),
  });

  return p2pService;
}
