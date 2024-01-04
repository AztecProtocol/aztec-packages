import { AztecKVStore } from '@aztec/kv-store';
import { L2BlockSource } from '@aztec/types';

import { P2PClient } from '../client/p2p_client.js';
import { P2PConfig } from '../config.js';
import { DummyP2PService } from '../service/dummy_service.js';
import { LibP2PService } from '../service/index.js';
import { TxPool } from '../tx_pool/index.js';

export * from './p2p_client.js';

export const createP2PClient = async (
  store: AztecKVStore,
  config: P2PConfig,
  txPool: TxPool,
  l2BlockSource: L2BlockSource,
) => {
  const p2pService = config.p2pEnabled ? await LibP2PService.new(config, txPool) : new DummyP2PService();
  return new P2PClient(store, l2BlockSource, txPool, p2pService);
};
