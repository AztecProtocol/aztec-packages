import {
  type ClientProtocolCircuitVerifier,
  type L2BlockSource,
  P2PClientType,
  type WorldStateSynchronizer,
} from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';
import { type AztecKVStore } from '@aztec/kv-store';
import { type DataStoreConfig } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { P2PClient } from '../client/p2p_client.js';
import { type P2PConfig } from '../config.js';
import { type AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import { KvAttestationPool } from '../mem_pools/attestation_pool/kv_attestation_pool.js';
import { type EpochProofQuotePool } from '../mem_pools/epoch_proof_quote_pool/epoch_proof_quote_pool.js';
import { MemoryEpochProofQuotePool } from '../mem_pools/epoch_proof_quote_pool/memory_epoch_proof_quote_pool.js';
import { type MemPools } from '../mem_pools/interface.js';
import { AztecKVTxPool, type TxPool } from '../mem_pools/tx_pool/index.js';
import { DiscV5Service } from '../services/discv5/discV5_service.js';
import { DummyP2PService } from '../services/dummy_service.js';
import { LibP2PService } from '../services/index.js';
import { configureP2PClientAddresses, createLibP2PPeerIdFromPrivateKey, getPeerIdPrivateKey } from '../util.js';

export * from './p2p_client.js';

type P2PClientDeps<T extends P2PClientType> = {
  txPool?: TxPool;
  store?: AztecKVStore;
  attestationPool?: T extends P2PClientType.Full ? AttestationPool : undefined;
  epochProofQuotePool?: EpochProofQuotePool;
};

export const createP2PClient = async <T extends P2PClientType>(
  clientType: T,
  _config: P2PConfig & DataStoreConfig,
  l2BlockSource: L2BlockSource,
  proofVerifier: ClientProtocolCircuitVerifier,
  worldStateSynchronizer: WorldStateSynchronizer,
  telemetry: TelemetryClient = new NoopTelemetryClient(),
  deps: P2PClientDeps<T> = {},
) => {
  let config = { ..._config };
  const logger = createLogger('p2p');
  const store = deps.store ?? (await createStore('p2p', config, createLogger('p2p:lmdb')));

  const mempools: MemPools<T> = {
    txPool: deps.txPool ?? new AztecKVTxPool(store, telemetry),
    epochProofQuotePool: deps.epochProofQuotePool ?? new MemoryEpochProofQuotePool(telemetry),
    attestationPool:
      clientType === P2PClientType.Full
        ? ((deps.attestationPool ?? new KvAttestationPool(store, telemetry)) as T extends P2PClientType.Full
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
    const discoveryService = new DiscV5Service(peerId, config, telemetry);

    p2pService = await LibP2PService.new<T>(
      clientType,
      config,
      discoveryService,
      peerId,
      mempools,
      l2BlockSource,
      proofVerifier,
      worldStateSynchronizer,
      store,
      telemetry,
    );
  } else {
    logger.verbose('P2P is disabled. Using dummy P2P service');
    p2pService = new DummyP2PService();
  }
  return new P2PClient(
    clientType,
    store,
    l2BlockSource,
    mempools,
    p2pService,
    config.keepProvenTxsInPoolFor,
    telemetry,
  );
};
