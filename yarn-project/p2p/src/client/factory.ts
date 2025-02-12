import {
  type ClientProtocolCircuitVerifier,
  type L2BlockSource,
  P2PClientType,
  type WorldStateSynchronizer,
} from '@aztec/circuit-types';
import { type EpochCacheInterface } from '@aztec/epoch-cache';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type AztecAsyncKVStore } from '@aztec/kv-store';
import { type DataStoreConfig } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { P2PClient } from '../client/p2p_client.js';
import { type P2PConfig } from '../config.js';
import { type AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import { InMemoryAttestationPool } from '../mem_pools/attestation_pool/memory_attestation_pool.js';
import { type MemPools } from '../mem_pools/interface.js';
import { AztecKVTxPool, type TxPool } from '../mem_pools/tx_pool/index.js';
import { DiscV5Service } from '../services/discv5/discV5_service.js';
import { DummyP2PService } from '../services/dummy_service.js';
import { LibP2PService } from '../services/index.js';
import { configureP2PClientAddresses, createLibP2PPeerIdFromPrivateKey, getPeerIdPrivateKey } from '../util.js';

type P2PClientDeps<T extends P2PClientType> = {
  txPool?: TxPool;
  store?: AztecAsyncKVStore;
  attestationPool?: T extends P2PClientType.Full ? AttestationPool : undefined;
  logger?: Logger;
};

export const createP2PClient = async <T extends P2PClientType>(
  clientType: T,
  _config: P2PConfig & DataStoreConfig,
  l2BlockSource: L2BlockSource,
  proofVerifier: ClientProtocolCircuitVerifier,
  worldStateSynchronizer: WorldStateSynchronizer,
  epochCache: EpochCacheInterface,
  telemetry: TelemetryClient = getTelemetryClient(),
  deps: P2PClientDeps<T> = {},
) => {
  let config = { ..._config };
  const logger = deps.logger ?? createLogger('p2p');
  const store = deps.store ?? (await createStore('p2p', config, createLogger('p2p:lmdb-v2')));
  const archive = await createStore('p2p-archive', config, createLogger('p2p-archive:lmdb-v2'));

  const mempools: MemPools<T> = {
    txPool: deps.txPool ?? new AztecKVTxPool(store, archive, telemetry, config.archivedTxLimit),
    attestationPool:
      clientType === P2PClientType.Full
        ? ((deps.attestationPool ?? new InMemoryAttestationPool(telemetry)) as T extends P2PClientType.Full
            ? AttestationPool
            : undefined)
        : undefined,
  };

  let p2pService;

  if (_config.p2pEnabled) {
    logger.verbose('P2P is enabled. Using LibP2P service.');
    config = await configureP2PClientAddresses(_config);

    // Create peer discovery service
    const peerIdPrivateKey = await getPeerIdPrivateKey(config, store);
    const peerId = await createLibP2PPeerIdFromPrivateKey(peerIdPrivateKey);
    const discoveryService = new DiscV5Service(
      peerId,
      config,
      telemetry,
      createLogger(`${logger.module}:discv5_service`),
    );

    p2pService = await LibP2PService.new<T>(
      clientType,
      config,
      discoveryService,
      peerId,
      mempools,
      l2BlockSource,
      epochCache,
      proofVerifier,
      worldStateSynchronizer,
      store,
      telemetry,
      createLogger(`${logger.module}:libp2p_service`),
    );
  } else {
    logger.verbose('P2P is disabled. Using dummy P2P service');
    p2pService = new DummyP2PService();
  }
  return new P2PClient(clientType, store, l2BlockSource, mempools, p2pService, config, telemetry);
};
