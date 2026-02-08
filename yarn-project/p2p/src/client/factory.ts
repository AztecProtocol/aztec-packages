import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { AztecLMDBStoreV2, createStore } from '@aztec/kv-store/lmdb-v2';
import type { BlockHash, L2BlockSource } from '@aztec/stdlib/block';
import type { ChainConfig } from '@aztec/stdlib/config';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { ClientProtocolCircuitVerifier, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { P2PClientType } from '@aztec/stdlib/p2p';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { P2PClient } from '../client/p2p_client.js';
import type { P2PConfig } from '../config.js';
import { AttestationPool, type AttestationPoolApi } from '../mem_pools/attestation_pool/attestation_pool.js';
import type { MemPools } from '../mem_pools/interface.js';
import type { TxPoolV2 } from '../mem_pools/tx_pool_v2/interfaces.js';
import type { TxMetaData } from '../mem_pools/tx_pool_v2/tx_metadata.js';
import { AztecKVTxPoolV2 } from '../mem_pools/tx_pool_v2/tx_pool_v2.js';
import { AggregateTxValidator } from '../msg_validators/tx_validator/aggregate_tx_validator.js';
import { BlockHeaderTxValidator } from '../msg_validators/tx_validator/block_header_validator.js';
import { DoubleSpendTxValidator } from '../msg_validators/tx_validator/double_spend_validator.js';
import { DummyP2PService } from '../services/dummy_service.js';
import { LibP2PService } from '../services/index.js';
import { TxCollection } from '../services/tx_collection/tx_collection.js';
import { type TxSource, createNodeRpcTxSources } from '../services/tx_collection/tx_source.js';
import { TxFileStore } from '../services/tx_file_store/tx_file_store.js';
import { configureP2PClientAddresses, createLibP2PPeerIdFromPrivateKey, getPeerIdPrivateKey } from '../util.js';

export type P2PClientDeps<T extends P2PClientType> = {
  txPool?: TxPoolV2;
  store?: AztecAsyncKVStore;
  attestationPool?: AttestationPoolApi;
  logger?: Logger;
  txCollectionNodeSources?: TxSource[];
  p2pServiceFactory?: (...args: Parameters<(typeof LibP2PService)['new']>) => Promise<LibP2PService<T>>;
};

export const P2P_STORE_NAME = 'p2p';
export const P2P_ARCHIVE_STORE_NAME = 'p2p-archive';
export const P2P_PEER_STORE_NAME = 'p2p-peers';
export const P2P_ATTESTATION_STORE_NAME = 'p2p-attestation';

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
    dataStoreMapSizeKb: inputConfig.p2pStoreMapSizeKb ?? inputConfig.dataStoreMapSizeKb,
  });

  const logger = deps.logger ?? createLogger('p2p');

  if (config.bootstrapNodes.length === 0) {
    logger.warn(
      'No bootstrap nodes have been provided. Set the BOOTSTRAP_NODES environment variable in order to join the P2P network',
    );
  }

  const bindings = logger.getBindings();
  const store = deps.store ?? (await createStore(P2P_STORE_NAME, 2, config, bindings));
  const archive = await createStore(P2P_ARCHIVE_STORE_NAME, 1, config, bindings);
  const peerStore = await createStore(P2P_PEER_STORE_NAME, 1, config, bindings);
  const attestationStore = await createStore(P2P_ATTESTATION_STORE_NAME, 1, config, bindings);
  const l1Constants = await archiver.getL1Constants();

  /** Validator factory for pool re-validation (double-spend + block header only). */
  const createPoolTxValidator = () =>
    new AggregateTxValidator<TxMetaData>(
      new DoubleSpendTxValidator<TxMetaData>(
        {
          nullifiersExist: async (nullifiers: Buffer[]) => {
            const merkleTree = worldStateSynchronizer.getCommitted();
            const indices = await merkleTree.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, nullifiers);
            return indices.map(index => index !== undefined);
          },
        },
        bindings,
      ),
      new BlockHeaderTxValidator<TxMetaData>(
        {
          getArchiveIndices: (archives: BlockHash[]) => {
            const merkleTree = worldStateSynchronizer.getCommitted();
            return merkleTree.findLeafIndices(MerkleTreeId.ARCHIVE, archives);
          },
        },
        bindings,
      ),
    );

  const txPool =
    deps.txPool ??
    new AztecKVTxPoolV2(
      store,
      archive,
      {
        l2BlockSource: archiver,
        worldStateSynchronizer,
        createTxValidator: createPoolTxValidator,
      },
      telemetry,
      {
        maxPendingTxCount: config.maxPendingTxCount,
        archivedTxLimit: config.archivedTxLimit,
      },
    );

  const mempools: MemPools = {
    txPool,
    attestationPool: deps.attestationPool ?? new AttestationPool(attestationStore, telemetry),
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
    p2pService.getBatchTxRequesterService(),
    nodeSources,
    l1Constants,
    mempools.txPool,
    config,
    dateProvider,
    telemetry,
    logger.createChild('tx-collection'),
  );

  const txFileStore = await TxFileStore.create(mempools.txPool, config, logger.createChild('tx-file-store'), telemetry);

  return new P2PClient(
    clientType,
    store,
    archiver,
    mempools,
    p2pService,
    txCollection,
    txFileStore,
    epochCache,
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
  mempools: MemPools,
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
