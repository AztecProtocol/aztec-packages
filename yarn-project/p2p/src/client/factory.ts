import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import type { L2BlockSource } from '@aztec/stdlib/block';
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
import { configureP2PClientAddresses, getPeerIdPrivateKey } from '../util.js';

export type P2PClientDeps<T extends P2PClientType> = {
  txPool?: TxPool;
  store?: AztecAsyncKVStore;
  attestationPool?: T extends P2PClientType.Full ? AttestationPool : undefined;
  logger?: Logger;
  p2pServiceFactory?: (...args: Parameters<(typeof LibP2PService)['new']>) => Promise<LibP2PService<T>>;
};

export const P2P_STORE_NAME = 'p2p';
export const P2P_ARCHIVE_STORE_NAME = 'p2p-archive';
export const P2P_PEER_STORE_NAME = 'p2p-peers';

export const createP2PClient = async <T extends P2PClientType>(
  clientType: T,
  _config: P2PConfig & DataStoreConfig,
  archiver: L2BlockSource & ContractDataSource,
  proofVerifier: ClientProtocolCircuitVerifier,
  worldStateSynchronizer: WorldStateSynchronizer,
  epochCache: EpochCacheInterface,
  packageVersion: string,
  telemetry: TelemetryClient = getTelemetryClient(),
  deps: P2PClientDeps<T> = {},
) => {
  let config = { ..._config, dataStoreMapSizeKB: _config.p2pStoreMapSizeKb ?? _config.dataStoreMapSizeKB };
  const logger = deps.logger ?? createLogger('p2p');
  const store = deps.store ?? (await createStore(P2P_STORE_NAME, 2, config, createLogger('p2p:lmdb-v2')));
  const archive = await createStore(P2P_ARCHIVE_STORE_NAME, 1, config, createLogger('p2p-archive:lmdb-v2'));
  const peerStore = await createStore(P2P_PEER_STORE_NAME, 1, config, createLogger('p2p-peer:lmdb-v2'));

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

  if (!_config.p2pEnabled) {
    logger.verbose('P2P is disabled. Using dummy P2P service.');
    return new P2PClient(clientType, store, archiver, mempools, new DummyP2PService(), config, telemetry);
  }

  logger.verbose('P2P is enabled. Using LibP2P service.');
  config = await configureP2PClientAddresses(_config);

  const peerIdPrivateKey = await getPeerIdPrivateKey(config, store, logger);

  const p2pService = await (deps.p2pServiceFactory ?? LibP2PService.new<T>)(clientType, config, peerIdPrivateKey, {
    packageVersion,
    mempools,
    l2BlockSource: archiver,
    epochCache,
    proofVerifier,
    worldStateSynchronizer,
    peerStore,
    telemetry,
    logger: createLogger(`${logger.module}:libp2p_service`),
  });

  return new P2PClient(clientType, store, archiver, mempools, p2pService, config, telemetry);
};
