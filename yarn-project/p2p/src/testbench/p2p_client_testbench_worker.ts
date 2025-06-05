/**
 * A testbench worker that creates a p2p client and listens for commands from the parent.
 *
 * Used when running testbench commands
 */
import { MockL2BlockSource } from '@aztec/archiver/test';
import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { ClientProtocolCircuitVerifier, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { P2PClientType, P2PMessage } from '@aztec/stdlib/p2p';
import { Tx, TxStatus } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import type { Message, PeerId } from '@libp2p/interface';
import { TopicValidatorResult } from '@libp2p/interface';

import type { P2PConfig } from '../config.js';
import { createP2PClient } from '../index.js';
import type { AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import type { MemPools } from '../mem_pools/interface.js';
import type { TxPool } from '../mem_pools/tx_pool/index.js';
import { LibP2PService } from '../services/libp2p/libp2p_service.js';
import type { PeerDiscoveryService } from '../services/service.js';
import { AlwaysTrueCircuitVerifier } from '../test-helpers/reqresp-nodes.js';
import type { PubSubLibp2p } from '../util.js';

// Simple mock implementation
function mockTxPool(): TxPool {
  // Mock all methods
  return {
    isEmpty: () => Promise.resolve(false),
    addTxs: () => Promise.resolve(1),
    getTxByHash: () => Promise.resolve(undefined),
    getArchivedTxByHash: () => Promise.resolve(undefined),
    markAsMined: () => Promise.resolve(),
    markMinedAsPending: () => Promise.resolve(),
    deleteTxs: () => Promise.resolve(),
    getAllTxs: () => Promise.resolve([]),
    getAllTxHashes: () => Promise.resolve([]),
    getPendingTxHashes: () => Promise.resolve([]),
    getPendingTxCount: () => Promise.resolve(0),
    getMinedTxHashes: () => Promise.resolve([]),
    getTxStatus: () => Promise.resolve(TxStatus.PENDING),
    getTxsByHash: () => Promise.resolve([]),
    hasTxs: () => Promise.resolve([]),
    updateConfig: () => {},
    markTxsAsNonEvictable: () => Promise.resolve(),
  };
}

function mockAttestationPool(): AttestationPool {
  return {
    isEmpty: () => Promise.resolve(false),
    addAttestations: () => Promise.resolve(),
    deleteAttestations: () => Promise.resolve(),
    deleteAttestationsOlderThan: () => Promise.resolve(),
    deleteAttestationsForSlot: () => Promise.resolve(),
    deleteAttestationsForSlotAndProposal: () => Promise.resolve(),
    getAttestationsForSlot: () => Promise.resolve([]),
    getAttestationsForSlotAndProposal: () => Promise.resolve([]),
  };
}

function mockEpochCache(): EpochCacheInterface {
  return {
    getCommittee: () => Promise.resolve({ committee: [], seed: 1n, epoch: 0n }),
    getProposerIndexEncoding: () => '0x' as `0x${string}`,
    getEpochAndSlotNow: () => ({ epoch: 0n, slot: 0n, ts: 0n }),
    computeProposerIndex: () => 0n,
    getProposerAttesterAddressInCurrentOrNextSlot: () =>
      Promise.resolve({
        currentProposer: EthAddress.ZERO,
        nextProposer: EthAddress.ZERO,
        currentSlot: 0n,
        nextSlot: 0n,
      }),
    isInCommittee: () => Promise.resolve(false),
  };
}

function mockWorldStateSynchronizer(): WorldStateSynchronizer {
  return {
    status: () =>
      Promise.resolve({
        syncSummary: {
          latestBlockNumber: 0,
          latestBlockHash: '',
          finalisedBlockNumber: 0,
          treesAreSynched: false,
          oldestHistoricBlockNumber: 0,
        },
      }),
  } as WorldStateSynchronizer;
}

class TestLibP2PService<T extends P2PClientType = P2PClientType.Full> extends LibP2PService<T> {
  private disableTxValidation: boolean;
  private gossipMessageCount: number = 0;

  constructor(
    clientType: T,
    config: P2PConfig,
    node: PubSubLibp2p,
    peerDiscoveryService: PeerDiscoveryService,
    mempools: MemPools<T>,
    archiver: L2BlockSource & ContractDataSource,
    epochCache: EpochCacheInterface,
    proofVerifier: ClientProtocolCircuitVerifier,
    worldStateSynchronizer: WorldStateSynchronizer,
    telemetry: TelemetryClient,
    logger = createLogger('p2p:test:libp2p_service'),
    disableTxValidation = true,
  ) {
    super(
      clientType,
      config,
      node,
      peerDiscoveryService,
      mempools,
      archiver,
      epochCache,
      proofVerifier,
      worldStateSynchronizer,
      telemetry,
      logger,
    );
    this.disableTxValidation = disableTxValidation;
  }

  public getGossipMessageCount(): number {
    return this.gossipMessageCount;
  }

  public setDisableTxValidation(disable: boolean): void {
    this.disableTxValidation = disable;
  }

  protected override async handleGossipedTx(payload: Buffer, msgId: string, source: PeerId) {
    if (this.disableTxValidation) {
      const p2pMessage = P2PMessage.fromMessageData(payload);
      const tx = Tx.fromBuffer(p2pMessage.payload);
      this.node.services.pubsub.reportMessageValidationResult(msgId, source.toString(), TopicValidatorResult.Accept);

      const txHash = await tx.getTxHash();
      const txHashString = txHash.toString();
      this.logger.verbose(`Received tx ${txHashString} from external peer ${source.toString()}.`);
      await this.mempools.txPool.addTxs([tx]);
    } else {
      await super.handleGossipedTx(payload, msgId, source);
    }
  }

  protected override async handleNewGossipMessage(msg: Message, msgId: string, source: PeerId) {
    this.gossipMessageCount++;
    process.send!({
      type: 'GOSSIP_RECEIVED',
      count: this.gossipMessageCount,
    });
    await super.handleNewGossipMessage(msg, msgId, source);
  }
}

// eslint-disable-next-line @typescript-eslint/no-misused-promises
process.on('message', async msg => {
  const { type, config, clientIndex } = msg as { type: string; config: P2PConfig; clientIndex: number };
  try {
    if (type === 'START') {
      const txPool = mockTxPool();
      const attestationPool = mockAttestationPool();
      const epochCache = mockEpochCache();
      const worldState = mockWorldStateSynchronizer();
      const l2BlockSource = new MockL2BlockSource();

      const proofVerifier = new AlwaysTrueCircuitVerifier();
      const kvStore = await openTmpStore(`test-${clientIndex}`);
      const logger = createLogger(`p2p:${clientIndex}`);
      const telemetry = getTelemetryClient();

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
        'test-p2p-bench-worker',
        telemetry,
        deps,
      );

      const _client = client as any;

      // Create test service with validation disabled
      const testService = new TestLibP2PService(
        P2PClientType.Full,
        config,
        (client as any).p2pService.node,
        (client as any).p2pService.peerDiscoveryService,
        (client as any).p2pService.mempools,
        (client as any).p2pService.archiver,
        epochCache,
        proofVerifier,
        worldState,
        telemetry,
        logger,
        true, // disable validation
      );

      // Replace the existing p2pService with our test version
      (client as any).p2pService = testService;

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
