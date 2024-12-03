import type { ClientProtocolCircuitVerifier, L2BlockSource, WorldStateSynchronizer } from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';
import { type AztecKVStore } from '@aztec/kv-store';
import { type DataStoreConfig } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { P2PClient } from '../client/p2p_client.js';
import { type P2PConfig } from '../config.js';
import { type AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import { InMemoryAttestationPool } from '../mem_pools/attestation_pool/memory_attestation_pool.js';
import { type EpochProofQuotePool } from '../mem_pools/epoch_proof_quote_pool/epoch_proof_quote_pool.js';
import { MemoryEpochProofQuotePool } from '../mem_pools/epoch_proof_quote_pool/memory_epoch_proof_quote_pool.js';
import { type MemPools } from '../mem_pools/interface.js';
import { AztecKVTxPool, type TxPool } from '../mem_pools/tx_pool/index.js';
import { DiscV5Service } from '../service/discV5_service.js';
import { DummyP2PService } from '../service/dummy_service.js';
import { LibP2PService } from '../service/index.js';
import { configureP2PClientAddresses, createLibP2PPeerIdFromPrivateKey, getPeerIdPrivateKey } from '../util.js';

export * from './p2p_client.js';

export const createP2PClient = async (
  _config: P2PConfig & DataStoreConfig,
  l2BlockSource: L2BlockSource,
  proofVerifier: ClientProtocolCircuitVerifier,
  worldStateSynchronizer: WorldStateSynchronizer,
  telemetry: TelemetryClient = new NoopTelemetryClient(),
  deps: {
    txPool?: TxPool;
    store?: AztecKVStore;
    attestationPool?: AttestationPool;
    epochProofQuotePool?: EpochProofQuotePool;
  } = {},
) => {
  let config = { ..._config };
  const store = deps.store ?? (await createStore('p2p', config, createDebugLogger('aztec:p2p:lmdb')));

  const mempools: MemPools = {
    txPool: deps.txPool ?? new AztecKVTxPool(store, telemetry),
    attestationPool: deps.attestationPool ?? new InMemoryAttestationPool(telemetry),
    epochProofQuotePool: deps.epochProofQuotePool ?? new MemoryEpochProofQuotePool(telemetry),
  };

  let p2pService;

  if (_config.p2pEnabled) {
    config = await configureP2PClientAddresses(_config);

    // Create peer discovery service
    const peerIdPrivateKey = await getPeerIdPrivateKey(config, store);
    const peerId = await createLibP2PPeerIdFromPrivateKey(peerIdPrivateKey);
    const discoveryService = new DiscV5Service(peerId, config, telemetry);

    p2pService = await LibP2PService.new(
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
    p2pService = new DummyP2PService();
  }
  return new P2PClient(store, l2BlockSource, mempools, p2pService, config.keepProvenTxsInPoolFor, telemetry);
};
