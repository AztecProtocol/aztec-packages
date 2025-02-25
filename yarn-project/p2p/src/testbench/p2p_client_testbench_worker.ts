/**
 * A testbench worker that creates a p2p client and listens for commands from the parent.
 *
 * Used when running testbench commands
 */
import { MockL2BlockSource } from '@aztec/archiver/test';
import { P2PClientType, Tx, TxStatus } from '@aztec/circuits.js';
import { type WorldStateSynchronizer } from '@aztec/circuits.js/interfaces/server';
import { type EpochCacheInterface } from '@aztec/epoch-cache';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { type DataStoreConfig } from '@aztec/kv-store/config';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import type { Message, PeerId } from '@libp2p/interface';

import { type P2PConfig } from '../config.js';
import { createP2PClient } from '../index.js';
import { type AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import { type TxPool } from '../mem_pools/tx_pool/index.js';
import { AlwaysTrueCircuitVerifier } from '../test-helpers/reqresp-nodes.js';

// Simple mock implementation
function mockTxPool(): TxPool {
  // Mock all methods
  return {
    addTxs: () => Promise.resolve(),
    getTxByHash: () => Promise.resolve(undefined),
    getArchivedTxByHash: () => Promise.resolve(undefined),
    markAsMined: () => Promise.resolve(),
    markMinedAsPending: () => Promise.resolve(),
    deleteTxs: () => Promise.resolve(),
    getAllTxs: () => Promise.resolve([]),
    getAllTxHashes: () => Promise.resolve([]),
    getPendingTxHashes: () => Promise.resolve([]),
    getMinedTxHashes: () => Promise.resolve([]),
    getTxStatus: () => Promise.resolve(TxStatus.PENDING),
  };
}

function mockAttestationPool(): AttestationPool {
  return {
    addAttestations: () => Promise.resolve(),
    deleteAttestations: () => Promise.resolve(),
    deleteAttestationsOlderThan: () => Promise.resolve(),
    deleteAttestationsForSlot: () => Promise.resolve(),
    deleteAttestationsForSlotAndProposal: () => Promise.resolve(),
    getAttestationsForSlot: () => Promise.resolve([]),
  };
}

function mockEpochCache(): EpochCacheInterface {
  return {
    getCommittee: () => Promise.resolve([] as EthAddress[]),
    getProposerIndexEncoding: () => '0x' as `0x${string}`,
    getEpochAndSlotNow: () => ({ epoch: 0n, slot: 0n, ts: 0n }),
    computeProposerIndex: () => 0n,
    getProposerInCurrentOrNextSlot: () =>
      Promise.resolve({
        currentProposer: EthAddress.ZERO,
        nextProposer: EthAddress.ZERO,
        currentSlot: 0n,
        nextSlot: 0n,
      }),
    isInCommittee: () => Promise.resolve(false),
  };
}

// eslint-disable-next-line @typescript-eslint/no-misused-promises
process.on('message', async msg => {
  const { type, config, clientIndex } = msg as { type: string; config: P2PConfig; clientIndex: number };

  try {
    if (type === 'START') {
      const txPool = mockTxPool();
      const attestationPool = mockAttestationPool();
      const epochCache = mockEpochCache();
      const worldState = {} as WorldStateSynchronizer;
      const l2BlockSource = new MockL2BlockSource();
      await l2BlockSource.createBlocks(100);

      const proofVerifier = new AlwaysTrueCircuitVerifier();
      const kvStore = await openTmpStore(`test-${clientIndex}`);
      const logger = createLogger(`p2p:${clientIndex}`);

      const deps = {
        txPool,
        attestationPool,
        store: kvStore,
        logger,
      };

      const client = await createP2PClient(
        P2PClientType.Full,
        config as P2PConfig & DataStoreConfig,
        l2BlockSource,
        proofVerifier,
        worldState,
        epochCache,
        undefined,
        deps,
      );

      // Create spy for gossip messages
      let gossipMessageCount = 0;
      (client as any).p2pService.handleNewGossipMessage = (msg: Message, msgId: string, source: PeerId) => {
        gossipMessageCount++;
        process.send!({
          type: 'GOSSIP_RECEIVED',
          count: gossipMessageCount,
        });
        return (client as any).p2pService.constructor.prototype.handleNewGossipMessage.apply(
          (client as any).p2pService,
          [msg, msgId, source],
        );
      };

      await client.start();
      // Wait until the client is ready
      for (let i = 0; i < 100; i++) {
        const isReady = client.isReady();
        logger.debug(`Client ${clientIndex} isReady: ${isReady}`);
        if (isReady) {
          break;
        }
        await sleep(1000);
      }

      // Listen for commands from parent
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      process.on('message', async (cmd: any) => {
        switch (cmd.type) {
          case 'STOP':
            await client.stop();
            process.exit(0);
            break;
          case 'SEND_TX':
            await client.sendTx(Tx.fromBuffer(Buffer.from(cmd.tx)));
            process.send!({ type: 'TX_SENT' });
            break;
        }
      });

      process.send!({ type: 'READY' });
    }
  } catch (err: any) {
    process.send!({ type: 'ERROR', error: err.message });
    process.exit(1);
  }
});
