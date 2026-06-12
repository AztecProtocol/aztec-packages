import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { BlockNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { getDefaultConfig } from '@aztec/foundation/config';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import type { L2Block, L2BlockSource } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { GasFees } from '@aztec/stdlib/gas';
import type { ClientProtocolCircuitVerifier } from '@aztec/stdlib/interfaces/server';
import { BlockProposal, type CheckpointAttestation, PeerErrorSeverity } from '@aztec/stdlib/p2p';
import {
  TEST_COORDINATION_SIGNATURE_CONTEXT,
  makeBlockHeader,
  makeBlockProposal,
  makeCheckpointAttestation,
  makeCheckpointHeader,
  makeCheckpointProposal,
  mockTx,
} from '@aztec/stdlib/testing';
import { TxArray, TxHashArray } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';
import { ServerWorldStateSynchronizer } from '@aztec/world-state';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Message, PeerId } from '@libp2p/interface';
import { TopicValidatorResult } from '@libp2p/interface';
import { multiaddr } from '@multiformats/multiaddr';
import EventEmitter from 'events';
import { type MockProxy, mock } from 'jest-mock-extended';

import { type P2PConfig, p2pConfigMappings } from '../../config.js';
import {
  AttestationPool,
  MAX_BLOCK_PROPOSALS_PER_POSITION,
  MAX_CHECKPOINT_PROPOSALS_PER_SLOT,
} from '../../mem_pools/attestation_pool/attestation_pool.js';
import type { MemPools } from '../../mem_pools/interface.js';
import type { TxPoolV2 } from '../../mem_pools/tx_pool_v2/interfaces.js';
import type { TransactionValidator } from '../../msg_validators/tx_validator/factory.js';
import type { PubSubLibp2p } from '../../util.js';
import type { PeerManagerInterface } from '../peer-manager/interface.js';
import type { ReqRespInterface } from '../reqresp/interface.js';
import { BitVector } from '../reqresp/protocols/block_txs/bitvector.js';
import { BlockTxsRequest, BlockTxsResponse } from '../reqresp/protocols/block_txs/block_txs_reqresp.js';
import type { PeerDiscoveryService } from '../service.js';
import { LibP2PService } from './libp2p_service.js';

describe('LibP2PService', () => {
  const MOCK_PEER_ID = 'peer-id-123';

  let service: TestLibP2PService;
  let mockPeerManager: MockProxy<PeerManagerInterface>;
  let mockPeerId: MockProxy<PeerId>;
  let mockNode: MockProxy<PubSubLibp2p>;
  let mockArchiver: MockProxy<L2BlockSource & ContractDataSource>;
  let reportMessageValidationResultSpy: jest.Mock;

  beforeEach(() => {
    mockPeerManager = mock<PeerManagerInterface>();
    mockPeerId = mock<PeerId>({
      toString: () => MOCK_PEER_ID,
    });
    reportMessageValidationResultSpy = jest.fn();
    mockNode = mock<PubSubLibp2p>();
    mockNode.services = {
      pubsub: {
        reportMessageValidationResult: reportMessageValidationResultSpy,
      },
    } as any;
    mockArchiver = mock<L2BlockSource & ContractDataSource>();

    service = createTestLibP2PService({
      peerManager: mockPeerManager,
      node: mockNode,
      archiver: mockArchiver,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleNewGossipMessage', () => {
    it('should penalize peer when P2PMessage deserialization fails', async () => {
      // Create a malformed message that will cause P2PMessage.fromMessageData to throw
      const malformedMessage: Message = {
        type: 'signed' as const,
        topic: 'test-topic',
        data: new Uint8Array([0xff, 0xff, 0xff]), // Invalid data that will fail deserialization
        sequenceNumber: BigInt(1),
        from: mockPeerId,
        signature: new Uint8Array(),
        key: new Uint8Array(),
      };

      const msgId = 'test-msg-id';

      // Call handleNewGossipMessage
      await service.handleNewGossipMessage(malformedMessage, msgId, mockPeerId);

      // Verify that reportMessageValidationResult was called with Reject
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith(msgId, MOCK_PEER_ID, TopicValidatorResult.Reject);

      // Verify that the peer was penalized
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.LowToleranceError);
    });

    it('should penalize peer when P2PMessage deserialization throws with empty data', async () => {
      // Create a message with empty data
      const emptyMessage: Message = {
        type: 'signed' as const,
        topic: 'test-topic',
        data: new Uint8Array([]), // Empty data
        sequenceNumber: BigInt(1),
        from: mockPeerId,
        signature: new Uint8Array(),
        key: new Uint8Array(),
      };

      const msgId = 'test-msg-id-2';

      // Call handleNewGossipMessage
      await service.handleNewGossipMessage(emptyMessage, msgId, mockPeerId);

      // Verify that reportMessageValidationResult was called with Reject
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith(msgId, MOCK_PEER_ID, TopicValidatorResult.Reject);

      // Verify that the peer was penalized
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.LowToleranceError);
    });
  });

  describe('handleGossipedTx - propagation based on pool acceptance', () => {
    let txService: TestLibP2PService;
    let txPeerManager: MockProxy<PeerManagerInterface>;
    let txPeerId: MockProxy<PeerId>;
    let txReportSpy: jest.Mock;
    let txPool: MockProxy<TxPoolV2>;

    beforeEach(() => {
      txPeerManager = mock<PeerManagerInterface>();
      txPeerId = mock<PeerId>({
        toString: () => MOCK_PEER_ID,
      });
      txReportSpy = jest.fn();
      txPool = mock<TxPoolV2>();

      const txNode = mock<PubSubLibp2p>();
      txNode.services = {
        pubsub: {
          reportMessageValidationResult: txReportSpy,
        },
      } as any;

      const txArchiver = mock<L2BlockSource & ContractDataSource>();
      txArchiver.getBlockNumber.mockResolvedValue(BlockNumber(1));

      const txEpochCache = mock<EpochCacheInterface>();
      txEpochCache.getEpochAndSlotInNextL1Slot.mockReturnValue({
        epoch: 0n,
        slot: 1n,
        ts: 100n,
      } as any);

      txService = createTestLibP2PService({
        peerManager: txPeerManager,
        node: txNode,
        txPool,
        archiver: txArchiver,
        epochCache: txEpochCache,
      });
      // By default, canAddPendingTx returns 'accepted' so the flow proceeds to pool add
      txPool.canAddPendingTx.mockResolvedValue('accepted');
    });

    it('should propagate (Accept) when pool accepts the transaction', async () => {
      const tx = await mockTx();
      const txHash = tx.getTxHash();

      txPool.addPendingTxs.mockResolvedValue({
        accepted: [txHash],
        ignored: [],
        rejected: [],
      });

      await txService.handleGossipedTx(tx.toBuffer(), 'test-msg-id', txPeerId);

      expect(txReportSpy).toHaveBeenCalledWith('test-msg-id', MOCK_PEER_ID, TopicValidatorResult.Accept);
      expect(txPool.addPendingTxs).toHaveBeenCalled();
    });

    it('should NOT propagate (Ignore) when pool ignores the transaction', async () => {
      const tx = await mockTx();
      const txHash = tx.getTxHash();

      txPool.addPendingTxs.mockResolvedValue({
        accepted: [],
        ignored: [txHash],
        rejected: [],
      });

      await txService.handleGossipedTx(tx.toBuffer(), 'test-msg-id', txPeerId);

      expect(txReportSpy).toHaveBeenCalledWith('test-msg-id', MOCK_PEER_ID, TopicValidatorResult.Ignore);
      expect(txPool.addPendingTxs).toHaveBeenCalled();
    });

    it('should NOT propagate (Reject) when pool rejects the transaction', async () => {
      const tx = await mockTx();
      const txHash = tx.getTxHash();

      txPool.addPendingTxs.mockResolvedValue({
        accepted: [],
        ignored: [],
        rejected: [txHash],
      });

      await txService.handleGossipedTx(tx.toBuffer(), 'test-msg-id', txPeerId);

      expect(txReportSpy).toHaveBeenCalledWith('test-msg-id', MOCK_PEER_ID, TopicValidatorResult.Reject);
      expect(txPool.addPendingTxs).toHaveBeenCalled();
    });

    it('should NOT propagate (Reject) when gossip validation fails', async () => {
      const tx = await mockTx();

      txService.firstStageValidationPasses = false;

      await txService.handleGossipedTx(tx.toBuffer(), 'test-msg-id', txPeerId);

      expect(txReportSpy).toHaveBeenCalledWith('test-msg-id', MOCK_PEER_ID, TopicValidatorResult.Reject);
      expect(txPool.addPendingTxs).not.toHaveBeenCalled();
    });

    it('should Ignore and skip proof verification when canAddPendingTx returns ignored', async () => {
      const tx = await mockTx();

      txPool.canAddPendingTx.mockResolvedValue('ignored');

      await txService.handleGossipedTx(tx.toBuffer(), 'test-msg-id', txPeerId);

      expect(txReportSpy).toHaveBeenCalledWith('test-msg-id', MOCK_PEER_ID, TopicValidatorResult.Ignore);
      // Pool pre-check was called
      expect(txPool.canAddPendingTx).toHaveBeenCalled();
      // addPendingTxs should NOT be called — we short-circuited before it
      expect(txPool.addPendingTxs).not.toHaveBeenCalled();
    });

    it('should not call canAddPendingTx when first-stage validation fails', async () => {
      const tx = await mockTx();

      txService.firstStageValidationPasses = false;

      await txService.handleGossipedTx(tx.toBuffer(), 'test-msg-id', txPeerId);

      expect(txPool.canAddPendingTx).not.toHaveBeenCalled();
      expect(txPool.addPendingTxs).not.toHaveBeenCalled();
    });

    it('should Reject and penalize peer when second-stage (proof) validation fails', async () => {
      const tx = await mockTx();

      txService.secondStageValidationPasses = false;

      await txService.handleGossipedTx(tx.toBuffer(), 'test-msg-id', txPeerId);

      expect(txReportSpy).toHaveBeenCalledWith('test-msg-id', MOCK_PEER_ID, TopicValidatorResult.Reject);
      expect(txPeerManager.penalizePeer).toHaveBeenCalledWith(txPeerId, PeerErrorSeverity.LowToleranceError);
      // canAddPendingTx was called (first stage passed), but addPendingTxs was NOT (second stage failed)
      expect(txPool.canAddPendingTx).toHaveBeenCalled();
      expect(txPool.addPendingTxs).not.toHaveBeenCalled();
    });

    it('should penalize peer with the severity from the failing first-stage validator', async () => {
      const tx = await mockTx();

      txService.firstStageValidationPasses = false;
      txService.firstStageSeverity = PeerErrorSeverity.MidToleranceError;

      await txService.handleGossipedTx(tx.toBuffer(), 'test-msg-id', txPeerId);

      expect(txPeerManager.penalizePeer).toHaveBeenCalledWith(txPeerId, PeerErrorSeverity.MidToleranceError);
    });

    it('should not penalize peer when canAddPendingTx returns ignored', async () => {
      const tx = await mockTx();

      txPool.canAddPendingTx.mockResolvedValue('ignored');

      await txService.handleGossipedTx(tx.toBuffer(), 'test-msg-id', txPeerId);

      expect(txPeerManager.penalizePeer).not.toHaveBeenCalled();
    });

    it('should call addPendingTxs only after both validation stages pass and pool pre-check accepts', async () => {
      const tx = await mockTx();
      const txHash = tx.getTxHash();

      txPool.canAddPendingTx.mockResolvedValue('accepted');
      txPool.addPendingTxs.mockResolvedValue({
        accepted: [txHash],
        ignored: [],
        rejected: [],
      });

      await txService.handleGossipedTx(tx.toBuffer(), 'test-msg-id', txPeerId);

      // Verify the full happy path: canAddPendingTx → addPendingTxs → Accept
      expect(txPool.canAddPendingTx).toHaveBeenCalled();
      expect(txPool.addPendingTxs).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({})]), {
        source: 'gossip',
      });
      expect(txReportSpy).toHaveBeenCalledWith('test-msg-id', MOCK_PEER_ID, TopicValidatorResult.Accept);
    });
  });

  describe('validateRequestedBlockTxsConsistency', () => {
    function makeRequest(archiveRoot: Fr, length: number, indices: number[], txHashes: string[] = []): BlockTxsRequest {
      const hashes = txHashes.map(h => ({ toString: () => h })) as unknown as TxHashArray;
      return new BlockTxsRequest(archiveRoot, BitVector.init(length, indices), Buffer32.random(), hashes);
    }

    function makeResponse(length: number, indices: number[], txHashes: string[]): BlockTxsResponse {
      const txs = txHashes.map(h => ({
        getTxHash: () => ({ toString: () => h }),
      })) as MockTx[];
      return new BlockTxsResponse(txs as TxArray, BitVector.init(length, indices));
    }

    /** Builds a minimal archived block whose txEffects carry the given tx hashes, for archiver-fallback tests. */
    function makeArchivedBlock(txHashes: string[]): L2Block {
      return {
        body: { txEffects: txHashes.map(h => ({ txHash: { toString: () => h } })) },
      } as unknown as L2Block;
    }

    /** Sets up the mempools with a mock attestation pool that returns a proposal with given tx hashes. */
    function setProposalTxHashes(svc: TestLibP2PService, txHashes: string[]): void {
      // Create a partial mock of the attestation pool that only implements getBlockProposalByArchive.
      // The validation code only accesses `txHashes` from the returned proposal.
      const mockAttestationPool: MockAttestationPoolForTests = {
        getBlockProposalByArchive: (_: string) =>
          Promise.resolve({
            txHashes: txHashes.map(s => ({ toString: () => s })),
          }),
      };
      svc.setAttestationPool(mockAttestationPool);
    }

    it('should penalize and reject on duplicate txs', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 5, [0, 2, 3]);
      const response = makeResponse(5, [0, 2, 3], ['0xaaa', '0xaaa']); // duplicate

      const ok = await service.validateRequestedBlockTxsConsistency(request, response, mockPeerId);
      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.MidToleranceError);
    });

    it('should penalize and reject when a returned tx is not part of the block', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 5, [0, 2, 4]);
      const response = makeResponse(5, [0, 2, 4], ['0xgood0', '0xbad']); // 0xbad is not in the block

      setProposalTxHashes(service, ['0xgood0', '0xgood2', '0xgood4', '0xother', '0xother2']);

      const ok = await service.validateRequestedBlockTxsConsistency(request, response, mockPeerId);
      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.LowToleranceError);
    });

    it('should penalize and reject when a returned tx is in the block but at an index we did not request', async () => {
      const hash = Fr.random();
      // We only request indices [0, 2], so the allowed set is {0xgood0, 0xgood2}. The peer returns
      // 0xgood1, which IS part of the block (index 1) but was never requested — neither by index nor
      // by explicit hash — so it must be rejected.
      const request = makeRequest(hash, 5, [0, 2]);
      const response = makeResponse(5, [0, 1], ['0xgood0', '0xgood1']);

      setProposalTxHashes(service, ['0xgood0', '0xgood1', '0xgood2', '0xgood3', '0xgood4']);

      const ok = await service.validateRequestedBlockTxsConsistency(request, response, mockPeerId);
      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.LowToleranceError);
    });

    it('should penalize and reject on bitvector length mismatch when the peer has the block', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 5, [0, 2]);
      // Peer claims to have the block (non-empty bitvector) but its length disagrees with the block size.
      const response = makeResponse(4, [0, 2], []);

      setProposalTxHashes(service, ['0xgood0', '0xgood1', '0xgood2', '0xgood3', '0xgood4']);

      const ok = await service.validateRequestedBlockTxsConsistency(request, response, mockPeerId);
      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.MidToleranceError);
    });

    it('should accept when all returned txs belong to the block and the bitvector length matches', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 5, [0, 2, 4]);
      const response = makeResponse(5, [0, 2, 4], ['0xgood0', '0xgood2', '0xgood4']);

      setProposalTxHashes(service, ['0xgood0', '0xother1', '0xgood2', '0xother3', '0xgood4']);

      const ok = await service.validateRequestedBlockTxsConsistency(request, response, mockPeerId);
      expect(ok).toBe(true);
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
    });

    it('should accept a partial subset when the peer advertises only the txs it returns', async () => {
      const hash = Fr.random();
      // We request [0, 2, 4] but the peer only has (and advertises) [0, 4], returning those two.
      const request = makeRequest(hash, 5, [0, 2, 4]);
      const response = makeResponse(5, [0, 4], ['0xgood0', '0xgood4']);

      setProposalTxHashes(service, ['0xgood0', '0xother1', '0xgood2', '0xother3', '0xgood4']);

      const ok = await service.validateRequestedBlockTxsConsistency(request, response, mockPeerId);
      expect(ok).toBe(true);
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
    });

    it('should accept when the peer returns only the requested txs it has, with more bits set than txs', async () => {
      const hash = Fr.random();
      // Block has txs a,b,c,d,e (indices 0..4). We ask for a,b,c ([0,1,2]); the peer has c,d,e
      // (bitvector [2,3,4]). The only requested-and-available tx is c, so the response carries a
      // single tx but advertises three available indices.
      const request = makeRequest(hash, 5, [0, 1, 2]);
      const response = makeResponse(5, [2, 3, 4], ['0xc']);

      setProposalTxHashes(service, ['0xa', '0xb', '0xc', '0xd', '0xe']);

      const ok = await service.validateRequestedBlockTxsConsistency(request, response, mockPeerId);
      expect(ok).toBe(true);
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
    });

    it('should accept txs requested by explicit hash even when they are not part of the block', async () => {
      const hash = Fr.random();
      // Block has a,b,c (indices 0,1,2). We request b via indices ([1]) and d via an explicit tx
      // hash (d is not part of the block). The peer returns b and d, advertising index 1 for b.
      const request = makeRequest(hash, 3, [1], ['0xd']);
      const response = makeResponse(3, [1], ['0xb', '0xd']);

      setProposalTxHashes(service, ['0xa', '0xb', '0xc']);

      const ok = await service.validateRequestedBlockTxsConsistency(request, response, mockPeerId);
      expect(ok).toBe(true);
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
    });

    it('should accept zero txs when the peer has the block but none of the requested indices', async () => {
      const hash = Fr.random();
      // We request [0, 2], but the peer only advertises availability for [1, 3] (txs we did not ask
      // for). The intersection of requested-and-available is empty, so returning zero txs is fine.
      const request = makeRequest(hash, 5, [0, 2]);
      const response = makeResponse(5, [1, 3], []);

      setProposalTxHashes(service, ['0xgood0', '0xother1', '0xgood2', '0xother3', '0xother4']);

      const ok = await service.validateRequestedBlockTxsConsistency(request, response, mockPeerId);
      expect(ok).toBe(true);
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
    });

    it('should penalize and reject when the peer advertises a requested tx but does not return it', async () => {
      const hash = Fr.random();
      // We request [0, 2] and the peer claims to have both (bitvector [0, 2]), but only returns the
      // tx at index 0 — withholding the one at index 2 it advertised.
      const request = makeRequest(hash, 3, [0, 2]);
      const response = makeResponse(3, [0, 2], ['0xgood0']);

      setProposalTxHashes(service, ['0xgood0', '0xother1', '0xgood2']);

      const ok = await service.validateRequestedBlockTxsConsistency(request, response, mockPeerId);
      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.LowToleranceError);
    });

    it('should reject without penalizing when the block is unknown (no proposal and not in the archiver)', async () => {
      const hash = Fr.random();
      // Simple valid shape that should pass pre-checks
      const request = makeRequest(hash, 3, [0, 2]);
      const response = makeResponse(3, [0, 2], ['0xgood0']);

      // Neither the attestation pool nor the archiver knows this block, so we cannot verify the
      // membership of the returned txs. This is not a peer fault, so no penalty is applied.
      const mockAttestationPool: MockAttestationPoolForTests = {
        getBlockProposalByArchive: (_: string) => Promise.resolve(undefined),
      };
      service.setAttestationPool(mockAttestationPool);
      mockArchiver.getBlock.mockResolvedValue(undefined);

      const ok = await service.validateRequestedBlockTxsConsistency(request, response, mockPeerId);
      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
    });

    // Regression test for the tx-collection ban-storm: a prover (or any node) collecting txs to
    // prove an already-mined block has no block proposal in its attestation pool, but it does know
    // the block via the archiver. The validator must fall back to the archiver (as the responder
    // handler does) so it can accept valid responses instead of rejecting every one and storming peers.
    it('should accept when the proposal is missing but the block is known via the archiver', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 5, [0, 2, 4]);
      const response = makeResponse(5, [0, 2, 4], ['0xgood0', '0xgood2', '0xgood4']);

      // No proposal (the prover never received it), but the mined block is in the archiver.
      service.setAttestationPool({ getBlockProposalByArchive: (_: string) => Promise.resolve(undefined) });
      mockArchiver.getBlock.mockResolvedValue(
        makeArchivedBlock(['0xgood0', '0xother1', '0xgood2', '0xother3', '0xgood4']),
      );

      const ok = await service.validateRequestedBlockTxsConsistency(request, response, mockPeerId);
      expect(ok).toBe(true);
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
      expect(mockArchiver.getBlock).toHaveBeenCalledWith({ archive: hash });
    });

    // Regression test for the former bug: a peer that lacks the block answers with an empty bitvector
    // (the "I don't have the block" signal from block_txs_handler.ts) but still ships the txs it matched
    // by hash. The old validator rejected any such response, discarding perfectly good txs. The fix
    // must accept the response (so the txs are used) while leaving the dumb-marking to the requester.
    it('should accept (and use) txs from a peer that signals it lacks the block via an empty bitvector', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 3, [0, 2]);
      // Empty bitvector -> peerHasBlock() is false, but the returned txs are valid block txs.
      const response = makeResponse(0, [], ['0xfound0', '0xfound2']);

      // We know the block locally, so we can still validate that the returned txs belong to it.
      setProposalTxHashes(service, ['0xfound0', '0xother1', '0xfound2']);

      const ok = await service.validateRequestedBlockTxsConsistency(request, response, mockPeerId);
      expect(ok).toBe(true);
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
    });

    it('should still penalize a block-lacking peer (empty bitvector) that returns a tx not in the block', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 3, [0, 2]);
      const response = makeResponse(0, [], ['0xfound0', '0xbad']); // 0xbad is not part of the block

      setProposalTxHashes(service, ['0xfound0', '0xother1', '0xfound2']);

      const ok = await service.validateRequestedBlockTxsConsistency(request, response, mockPeerId);
      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.LowToleranceError);
    });
  });

  describe('processBlockFromPeer', () => {
    let attestationPool: AttestationPool;
    let mockTxPool: MockProxy<TxPoolV2>;
    let mockEpochCache: MockProxy<EpochCacheInterface>;
    let signer: Secp256k1Signer;
    let blockReceivedCallback: jest.Mock;
    let duplicateProposalCallback: jest.Mock;

    const targetSlot = SlotNumber(100);
    const nextSlot = SlotNumber(101);

    beforeEach(() => {
      signer = Secp256k1Signer.random();
      attestationPool = new AttestationPool(openTmpStore(true));
      mockTxPool = mock<TxPoolV2>();
      mockTxPool.protectTxs.mockResolvedValue([]);

      mockEpochCache = mock<EpochCacheInterface>();
      mockEpochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
      mockEpochCache.getTargetAndNextSlot.mockReturnValue({ targetSlot: targetSlot, nextSlot });
      mockEpochCache.getTargetSlot.mockReturnValue(targetSlot);

      mockPeerManager = mock<PeerManagerInterface>();
      reportMessageValidationResultSpy = jest.fn();

      service = createTestLibP2PServiceWithPools(
        mockPeerManager,
        reportMessageValidationResultSpy,
        attestationPool,
        mockTxPool,
        mockEpochCache,
      );

      blockReceivedCallback = jest.fn().mockImplementation(() => Promise.resolve<boolean>(true));
      duplicateProposalCallback = jest.fn();
      service.registerBlockReceivedCallback(blockReceivedCallback as any);
      service.registerDuplicateProposalCallback(duplicateProposalCallback);
    });

    it('processes valid block: invokes callback and marks txs non-evictable', async () => {
      const header = makeBlockHeader(1, { slotNumber: targetSlot });
      const proposal = await makeBlockProposal({ signer, blockHeader: header });

      await service.processBlockFromPeer(proposal.toBuffer(), 'msg-1', mockPeerId);

      // Verify callback was invoked with the block and peer info
      expect(blockReceivedCallback).toHaveBeenCalledTimes(1);
      expect(blockReceivedCallback).toHaveBeenCalledWith(expect.any(Object), mockPeerId);

      // Verify txs were marked as non-evictable
      expect(mockTxPool.protectTxs).toHaveBeenCalledTimes(1);

      // Verify message was accepted
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-1', MOCK_PEER_ID, TopicValidatorResult.Accept);

      // Verify block was stored in attestation pool
      const stored = await attestationPool.getBlockProposalByArchive(proposal.archive.toString());
      expect(stored).toBeDefined();
    });

    it('equivocated block: re-broadcasts but does NOT process', async () => {
      const header = makeBlockHeader(1, { slotNumber: targetSlot });
      const indexWithinCheckpoint = IndexWithinCheckpoint(0);

      // First proposal - should be processed normally
      const proposal1 = await makeBlockProposal({
        signer,
        blockHeader: header,
        indexWithinCheckpoint,
        archiveRoot: Fr.random(),
      });
      await service.processBlockFromPeer(proposal1.toBuffer(), 'msg-1', mockPeerId);
      expect(blockReceivedCallback).toHaveBeenCalledTimes(1);

      // Reset mocks
      blockReceivedCallback.mockClear();
      reportMessageValidationResultSpy.mockClear();

      // Second proposal at same position (equivocation) - should be re-broadcast but NOT processed
      const proposal2 = await makeBlockProposal({
        signer,
        blockHeader: header,
        indexWithinCheckpoint,
        archiveRoot: Fr.random(),
      });
      await service.processBlockFromPeer(proposal2.toBuffer(), 'msg-2', mockPeerId);

      // Verify message was accepted (for re-broadcast)
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-2', MOCK_PEER_ID, TopicValidatorResult.Accept);

      // Verify callback was NOT invoked (equivocation)
      expect(blockReceivedCallback).not.toHaveBeenCalled();

      // Verify duplicate callback was invoked
      expect(duplicateProposalCallback).toHaveBeenCalledWith({
        slot: targetSlot,
        proposer: signer.address,
        type: 'block',
      });
    });

    it('duplicate exact block: returns Ignore, no processing', async () => {
      const header = makeBlockHeader(1, { slotNumber: targetSlot });
      const proposal = await makeBlockProposal({ signer, blockHeader: header });

      // First submission
      await service.processBlockFromPeer(proposal.toBuffer(), 'msg-1', mockPeerId);
      expect(blockReceivedCallback).toHaveBeenCalledTimes(1);

      // Reset mocks
      blockReceivedCallback.mockClear();
      reportMessageValidationResultSpy.mockClear();
      duplicateProposalCallback.mockClear();

      // Second submission of exact same block
      await service.processBlockFromPeer(proposal.toBuffer(), 'msg-2', mockPeerId);

      // Verify message was ignored (not re-broadcast)
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-2', MOCK_PEER_ID, TopicValidatorResult.Ignore);

      // Verify callback was NOT invoked
      expect(blockReceivedCallback).not.toHaveBeenCalled();

      // Verify duplicate callback was NOT invoked (same proposal, not equivocation)
      expect(duplicateProposalCallback).not.toHaveBeenCalled();
    });

    it('cap exceeded: penalizes peer and rejects', async () => {
      const header = makeBlockHeader(1, { slotNumber: targetSlot });
      const indexWithinCheckpoint = IndexWithinCheckpoint(0);

      // Add MAX_BLOCK_PROPOSALS_PER_POSITION proposals
      for (let i = 0; i < MAX_BLOCK_PROPOSALS_PER_POSITION; i++) {
        const individualSigner = Secp256k1Signer.random();
        mockEpochCache.getProposerAttesterAddressInSlot.mockResolvedValue(individualSigner.address);
        const proposal = await makeBlockProposal({
          signer: individualSigner,
          blockHeader: header,
          indexWithinCheckpoint,
          archiveRoot: Fr.random(),
        });
        await service.processBlockFromPeer(proposal.toBuffer(), `msg-${i}`, mockPeerId);
      }

      // Reset mocks
      blockReceivedCallback.mockClear();
      reportMessageValidationResultSpy.mockClear();
      mockPeerManager.penalizePeer.mockClear();

      // Create a proposal that would exceed the cap
      const extraSigner = Secp256k1Signer.random();
      mockEpochCache.getProposerAttesterAddressInSlot.mockResolvedValue(extraSigner.address);
      const extraProposal = await makeBlockProposal({
        signer: extraSigner,
        blockHeader: header,
        indexWithinCheckpoint,
        archiveRoot: Fr.random(),
      });

      await service.processBlockFromPeer(extraProposal.toBuffer(), 'msg-extra', mockPeerId);

      // Verify peer was penalized
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.HighToleranceError);

      // Verify message was rejected
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith(
        'msg-extra',
        MOCK_PEER_ID,
        TopicValidatorResult.Reject,
      );

      // Verify callback was NOT invoked
      expect(blockReceivedCallback).not.toHaveBeenCalled();
    });

    it('duplicateProposalCallback invoked exactly once per equivocation event', async () => {
      const header = makeBlockHeader(1, { slotNumber: targetSlot });
      const indexWithinCheckpoint = IndexWithinCheckpoint(0);

      // First proposal - callback NOT invoked
      const proposal1 = await makeBlockProposal({
        signer,
        blockHeader: header,
        indexWithinCheckpoint,
        archiveRoot: Fr.random(),
      });
      await service.processBlockFromPeer(proposal1.toBuffer(), 'msg-1', mockPeerId);
      expect(duplicateProposalCallback).not.toHaveBeenCalled();

      // Second proposal (first equivocation) - callback invoked
      const proposal2 = await makeBlockProposal({
        signer,
        blockHeader: header,
        indexWithinCheckpoint,
        archiveRoot: Fr.random(),
      });
      await service.processBlockFromPeer(proposal2.toBuffer(), 'msg-2', mockPeerId);
      expect(duplicateProposalCallback).toHaveBeenCalledTimes(1);
      expect(duplicateProposalCallback).toHaveBeenCalledWith({
        slot: targetSlot,
        proposer: signer.address,
        type: 'block',
      });

      duplicateProposalCallback.mockClear();

      // Third proposal - callback NOT invoked again (already reported)
      const proposal3 = await makeBlockProposal({
        signer,
        blockHeader: header,
        indexWithinCheckpoint,
        archiveRoot: Fr.random(),
      });
      await service.processBlockFromPeer(proposal3.toBuffer(), 'msg-3', mockPeerId);
      expect(duplicateProposalCallback).not.toHaveBeenCalled();
    });

    it('validation failure penalizes peer with correct severity', async () => {
      const header = makeBlockHeader(1, { slotNumber: targetSlot });
      // Create block signed by wrong signer
      const wrongSigner = Secp256k1Signer.random();
      const proposal = await makeBlockProposal({ signer: wrongSigner, blockHeader: header });

      await service.processBlockFromPeer(proposal.toBuffer(), 'msg-1', mockPeerId);

      // Verify peer was penalized with MidToleranceError
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.MidToleranceError);

      // Verify message was rejected
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-1', MOCK_PEER_ID, TopicValidatorResult.Reject);
    });

    it('local validation failure releases the protections it created', async () => {
      const header = makeBlockHeader(1, { slotNumber: targetSlot });
      const proposal = await makeBlockProposal({ signer, blockHeader: header });
      blockReceivedCallback.mockImplementationOnce(() => Promise.resolve(false));

      await service.processBlockFromPeer(proposal.toBuffer(), 'msg-1', mockPeerId);

      expect(mockTxPool.protectTxs).toHaveBeenCalledTimes(1);
      // The failed proposal releases exactly the txs it protected, keyed to its slot.
      expect(mockTxPool.unprotectTxs).toHaveBeenCalledTimes(1);
      expect(mockTxPool.unprotectTxs).toHaveBeenCalledWith(proposal.txHashes, targetSlot);
    });

    it('successful local validation does not release protections', async () => {
      const header = makeBlockHeader(1, { slotNumber: targetSlot });
      const proposal = await makeBlockProposal({ signer, blockHeader: header });

      await service.processBlockFromPeer(proposal.toBuffer(), 'msg-1', mockPeerId);

      expect(mockTxPool.protectTxs).toHaveBeenCalledTimes(1);
      expect(mockTxPool.unprotectTxs).not.toHaveBeenCalled();
    });

    // Regression for A-1013: payloads sharing (slot, position, archive) but differing on another
    // signed field (e.g. inHash) used to dedup by archive only and silently drop the second one.
    // The pool now dedups by signed-payload hash, so the equivocation surfaces.
    it('same archive but different signed payload triggers slash callback', async () => {
      const blockHeader = makeBlockHeader(1, { slotNumber: targetSlot });
      const indexWithinCheckpoint = IndexWithinCheckpoint(0);
      const sharedArchive = Fr.random();

      const proposal1 = await makeBlockProposal({
        signer,
        blockHeader,
        indexWithinCheckpoint,
        inHash: Fr.fromString('0x1'),
        archiveRoot: sharedArchive,
      });
      await service.processBlockFromPeer(proposal1.toBuffer(), 'msg-1', mockPeerId);
      expect(duplicateProposalCallback).not.toHaveBeenCalled();

      const proposal2 = await makeBlockProposal({
        signer,
        blockHeader,
        indexWithinCheckpoint,
        inHash: Fr.fromString('0x2'),
        archiveRoot: sharedArchive,
      });
      expect(proposal2.archive.toString()).toBe(proposal1.archive.toString());
      expect(proposal2.getPayloadHash()).not.toEqual(proposal1.getPayloadHash());

      await service.processBlockFromPeer(proposal2.toBuffer(), 'msg-2', mockPeerId);

      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-2', MOCK_PEER_ID, TopicValidatorResult.Accept);
      expect(blockReceivedCallback).toHaveBeenCalledTimes(1); // only the first one
      expect(duplicateProposalCallback).toHaveBeenCalledTimes(1);
      expect(duplicateProposalCallback).toHaveBeenCalledWith({
        slot: targetSlot,
        proposer: signer.address,
        type: 'block',
      });
    });
  });

  describe('handleGossipedCheckpointProposal', () => {
    let attestationPool: AttestationPool;
    let mockTxPool: MockProxy<TxPoolV2>;
    let mockEpochCache: MockProxy<EpochCacheInterface>;
    let signer: Secp256k1Signer;
    let blockReceivedCallback: jest.Mock;
    let validatorCheckpointReceivedCallback: jest.Mock;
    let allNodesCheckpointReceivedCallback: jest.Mock;
    let duplicateProposalCallback: jest.Mock;

    const targetSlot = SlotNumber(100);
    const nextSlot = SlotNumber(101);

    beforeEach(() => {
      signer = Secp256k1Signer.random();
      attestationPool = new AttestationPool(openTmpStore(true));
      mockTxPool = mock<TxPoolV2>();
      mockTxPool.protectTxs.mockResolvedValue([]);

      mockEpochCache = mock<EpochCacheInterface>();
      mockEpochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
      mockEpochCache.getTargetAndNextSlot.mockReturnValue({ targetSlot, nextSlot });
      mockEpochCache.getTargetSlot.mockReturnValue(targetSlot);

      mockPeerManager = mock<PeerManagerInterface>();
      reportMessageValidationResultSpy = jest.fn();

      service = createTestLibP2PServiceWithPools(
        mockPeerManager,
        reportMessageValidationResultSpy,
        attestationPool,
        mockTxPool,
        mockEpochCache,
      );

      blockReceivedCallback = jest.fn().mockImplementation(() => Promise.resolve(true));
      allNodesCheckpointReceivedCallback = jest.fn().mockImplementation(() => Promise.resolve([]));
      validatorCheckpointReceivedCallback = jest.fn().mockImplementation(() => Promise.resolve([]));
      duplicateProposalCallback = jest.fn();
      service.registerBlockReceivedCallback(blockReceivedCallback as any);
      service.registerValidatorCheckpointReceivedCallback(validatorCheckpointReceivedCallback as any);
      service.registerAllNodesCheckpointReceivedCallback(allNodesCheckpointReceivedCallback as any);
      service.registerDuplicateProposalCallback(duplicateProposalCallback);
    });

    it('processes valid checkpoint: invokes callback and propagates attestations', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: targetSlot });
      const proposal = await makeCheckpointProposal({ signer, checkpointHeader });

      await service.handleGossipedCheckpointProposal(proposal.toBuffer(), 'msg-1', mockPeerId);

      // Verify callback was invoked with checkpoint core
      expect(allNodesCheckpointReceivedCallback).toHaveBeenCalledTimes(1);
      expect(allNodesCheckpointReceivedCallback).toHaveBeenCalledWith(expect.any(Object), mockPeerId);

      expect(validatorCheckpointReceivedCallback).toHaveBeenCalledTimes(1);
      expect(validatorCheckpointReceivedCallback).toHaveBeenCalledWith(expect.any(Object), mockPeerId);

      // Verify message was accepted
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-1', MOCK_PEER_ID, TopicValidatorResult.Accept);

      // Verify checkpoint was stored in attestation pool
      const stored = await attestationPool.getCheckpointProposal(proposal.slotNumber);
      expect(stored).toBeDefined();
    });

    it('equivocated checkpoint: re-broadcasts but does NOT process', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: targetSlot });

      // First checkpoint
      const checkpoint1 = await makeCheckpointProposal({
        signer,
        checkpointHeader,
        archiveRoot: Fr.random(),
      });
      await service.handleGossipedCheckpointProposal(checkpoint1.toBuffer(), 'msg-1', mockPeerId);
      expect(allNodesCheckpointReceivedCallback).toHaveBeenCalledTimes(1);
      expect(validatorCheckpointReceivedCallback).toHaveBeenCalledTimes(1);

      // Reset mocks
      allNodesCheckpointReceivedCallback.mockClear();
      validatorCheckpointReceivedCallback.mockClear();
      reportMessageValidationResultSpy.mockClear();

      // Second checkpoint at same slot (equivocation)
      const checkpoint2 = await makeCheckpointProposal({
        signer,
        checkpointHeader: makeCheckpointHeader(1, { slotNumber: targetSlot }),
        archiveRoot: Fr.random(),
      });
      await service.handleGossipedCheckpointProposal(checkpoint2.toBuffer(), 'msg-2', mockPeerId);

      // Verify message was accepted (for re-broadcast)
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-2', MOCK_PEER_ID, TopicValidatorResult.Accept);

      // Verify callback was NOT invoked
      expect(allNodesCheckpointReceivedCallback).not.toHaveBeenCalled();
      expect(validatorCheckpointReceivedCallback).not.toHaveBeenCalled();

      // Verify duplicate callback was invoked
      expect(duplicateProposalCallback).toHaveBeenCalledWith({
        slot: targetSlot,
        proposer: signer.address,
        type: 'checkpoint',
      });
    });

    it('checkpoint with lastBlock: processes both when valid', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: targetSlot });
      const blockHeader = makeBlockHeader(1, { slotNumber: targetSlot });
      const proposal = await makeCheckpointProposal({
        signer,
        checkpointHeader,
        lastBlock: { blockHeader },
      });

      await service.handleGossipedCheckpointProposal(proposal.toBuffer(), 'msg-1', mockPeerId);

      // Verify both callbacks were invoked
      expect(blockReceivedCallback).toHaveBeenCalledTimes(1);
      expect(allNodesCheckpointReceivedCallback).toHaveBeenCalledTimes(1);
      expect(validatorCheckpointReceivedCallback).toHaveBeenCalledTimes(1);

      // Verify txs were marked as non-evictable (for the lastBlock)
      expect(mockTxPool.protectTxs).toHaveBeenCalledTimes(1);

      // Verify both were stored in attestation pool
      const storedCheckpoint = await attestationPool.getCheckpointProposal(proposal.slotNumber);
      expect(storedCheckpoint).toBeDefined();

      const storedBlock = await attestationPool.getBlockProposalByArchive(
        proposal.getBlockProposal()!.archive.toString(),
      );
      expect(storedBlock).toBeDefined();
    });

    it('skipCheckpointProposalValidation: attests before (not gated by) slow last-block processing', async () => {
      // Recreate the service in skip-validation mode and re-register the checkpoint/block callbacks on it.
      service = createTestLibP2PServiceWithPools(
        mockPeerManager,
        reportMessageValidationResultSpy,
        attestationPool,
        mockTxPool,
        mockEpochCache,
        { skipCheckpointProposalValidation: true },
      );
      service.registerBlockReceivedCallback(blockReceivedCallback as any);
      service.registerValidatorCheckpointReceivedCallback(validatorCheckpointReceivedCallback as any);
      service.registerAllNodesCheckpointReceivedCallback(allNodesCheckpointReceivedCallback as any);

      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: targetSlot });
      const blockHeader = makeBlockHeader(1, { slotNumber: targetSlot });
      const proposal = await makeCheckpointProposal({ signer, checkpointHeader, lastBlock: { blockHeader } });

      // Block processing hangs until released, simulating waiting for the parent block up to the
      // re-execution deadline. In skip mode the attestation must not be blocked behind it.
      let releaseBlock!: () => void;
      blockReceivedCallback.mockReturnValue(
        new Promise<boolean>(resolve => {
          releaseBlock = () => resolve(true);
        }),
      );

      // Resolves once the checkpoint attestation callback runs; if it were serialized behind the hung block
      // processing this would never resolve and the test would time out.
      let signalCheckpoint!: () => void;
      const checkpointInvoked = new Promise<void>(resolve => {
        signalCheckpoint = resolve;
      });
      validatorCheckpointReceivedCallback.mockImplementation(() => {
        signalCheckpoint();
        return Promise.resolve([]);
      });

      const handled = service.handleGossipedCheckpointProposal(proposal.toBuffer(), 'msg-1', mockPeerId);

      await checkpointInvoked;
      expect(validatorCheckpointReceivedCallback).toHaveBeenCalledTimes(1);

      releaseBlock();
      await handled;
      expect(blockReceivedCallback).toHaveBeenCalledTimes(1);
    });

    it('default: processes the last block before the checkpoint proposal', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: targetSlot });
      const blockHeader = makeBlockHeader(1, { slotNumber: targetSlot });
      const proposal = await makeCheckpointProposal({ signer, checkpointHeader, lastBlock: { blockHeader } });

      // Block processing hangs until released and signals when it starts; with validation enabled the
      // checkpoint callback must wait for the block to finish.
      let releaseBlock!: () => void;
      let signalBlockStarted!: () => void;
      const blockStarted = new Promise<void>(resolve => {
        signalBlockStarted = resolve;
      });
      blockReceivedCallback.mockImplementation(() => {
        signalBlockStarted();
        return new Promise<boolean>(resolve => {
          releaseBlock = () => resolve(true);
        });
      });

      let checkpointInvoked = false;
      validatorCheckpointReceivedCallback.mockImplementation(() => {
        checkpointInvoked = true;
        return Promise.resolve([]);
      });

      const handled = service.handleGossipedCheckpointProposal(proposal.toBuffer(), 'msg-1', mockPeerId);

      // Wait until block processing is in flight (hung), then flush microtasks. The checkpoint callback
      // must not have run, since it is gated behind the block.
      await blockStarted;
      await new Promise(resolve => setImmediate(resolve));
      expect(checkpointInvoked).toBe(false);

      // Once the block completes, the checkpoint proposal is processed.
      releaseBlock();
      await handled;
      expect(checkpointInvoked).toBe(true);
    });

    it('lastBlock processed even when checkpoint cap exceeded', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: targetSlot });
      const blockHeader = makeBlockHeader(1, { slotNumber: targetSlot });

      // Fill checkpoint slot to MAX_CHECKPOINT_PROPOSALS_PER_SLOT
      for (let i = 0; i < MAX_CHECKPOINT_PROPOSALS_PER_SLOT; i++) {
        const individualSigner = Secp256k1Signer.random();
        mockEpochCache.getProposerAttesterAddressInSlot.mockResolvedValue(individualSigner.address);
        const proposal = await makeCheckpointProposal({
          signer: individualSigner,
          checkpointHeader: makeCheckpointHeader(1, { slotNumber: targetSlot }),
          archiveRoot: Fr.random(),
        });
        await service.handleGossipedCheckpointProposal(proposal.toBuffer(), `msg-${i}`, mockPeerId);
      }

      // Reset mocks
      blockReceivedCallback.mockClear();
      allNodesCheckpointReceivedCallback.mockClear();
      validatorCheckpointReceivedCallback.mockClear();
      reportMessageValidationResultSpy.mockClear();
      mockTxPool.protectTxs.mockClear();
      mockPeerManager.penalizePeer.mockClear();

      // Create checkpoint with lastBlock that would exceed the cap
      const extraSigner = Secp256k1Signer.random();
      mockEpochCache.getProposerAttesterAddressInSlot.mockResolvedValue(extraSigner.address);
      const extraProposal = await makeCheckpointProposal({
        signer: extraSigner,
        checkpointHeader,
        lastBlock: { blockHeader },
        archiveRoot: Fr.random(),
      });

      await service.handleGossipedCheckpointProposal(extraProposal.toBuffer(), 'msg-extra', mockPeerId);

      // Verify checkpoint was rejected
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith(
        'msg-extra',
        MOCK_PEER_ID,
        TopicValidatorResult.Reject,
      );

      // Verify checkpoint callback was NOT invoked
      expect(allNodesCheckpointReceivedCallback).not.toHaveBeenCalled();
      expect(validatorCheckpointReceivedCallback).not.toHaveBeenCalled();

      // But the lastBlock IS processed since it was valid
      expect(blockReceivedCallback).toHaveBeenCalled();
      const receivedBlock = blockReceivedCallback.mock.calls[0][0] as BlockProposal;
      expect(receivedBlock.archive.toString()).toBe(extraProposal.getBlockProposal()!.archive.toString());

      // The lastBlock is stored in the attestation pool
      const storedBlock = await attestationPool.getBlockProposalByArchive(
        extraProposal.getBlockProposal()!.archive.toString(),
      );
      expect(storedBlock).toBeDefined();

      // Txs were marked as non-evictable since the block was processed
      expect(mockTxPool.protectTxs).toHaveBeenCalled();
    });

    it('checkpoint rejected when lastBlock is equivocated', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: targetSlot });
      const blockHeader = makeBlockHeader(1, { slotNumber: targetSlot });
      const indexWithinCheckpoint = IndexWithinCheckpoint(4);

      // Pre-add a block at same position
      const existingBlock = await makeBlockProposal({
        signer,
        blockHeader,
        indexWithinCheckpoint,
        archiveRoot: Fr.random(),
      });
      await service.processBlockFromPeer(existingBlock.toBuffer(), 'msg-0', mockPeerId);

      // Reset mocks
      blockReceivedCallback.mockClear();
      allNodesCheckpointReceivedCallback.mockClear();
      validatorCheckpointReceivedCallback.mockClear();
      reportMessageValidationResultSpy.mockClear();

      // Create checkpoint with different lastBlock at same position
      const proposal = await makeCheckpointProposal({
        signer,
        checkpointHeader,
        lastBlock: { blockHeader, indexWithinCheckpoint },
        archiveRoot: Fr.random(),
      });

      await service.handleGossipedCheckpointProposal(proposal.toBuffer(), 'msg-1', mockPeerId);

      // Verify message was rejected
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-1', MOCK_PEER_ID, TopicValidatorResult.Reject);

      // Verify neither callback was invoked
      expect(allNodesCheckpointReceivedCallback).not.toHaveBeenCalled();
      expect(validatorCheckpointReceivedCallback).not.toHaveBeenCalled();
      expect(blockReceivedCallback).not.toHaveBeenCalled();
    });

    it('validation failure penalizes peer with correct severity', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: targetSlot });
      // Create checkpoint signed by wrong signer
      const wrongSigner = Secp256k1Signer.random();
      const proposal = await makeCheckpointProposal({ signer: wrongSigner, checkpointHeader });

      await service.handleGossipedCheckpointProposal(proposal.toBuffer(), 'msg-1', mockPeerId);

      // Verify peer was penalized with MidToleranceError
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.MidToleranceError);

      // Verify message was rejected
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-1', MOCK_PEER_ID, TopicValidatorResult.Reject);
    });

    // Regression for A-1013: payloads sharing (slot, archive) but differing on feeAssetPriceModifier
    // used to dedup by archive only and silently drop the second one. The pool now dedups by
    // signed-payload hash, so the equivocation surfaces.
    it('same archive but different feeAssetPriceModifier triggers slash callback', async () => {
      const sharedHeader = makeCheckpointHeader(1, { slotNumber: targetSlot });
      const sharedArchive = Fr.random();

      const checkpoint1 = await makeCheckpointProposal({
        signer,
        checkpointHeader: sharedHeader,
        archiveRoot: sharedArchive,
        feeAssetPriceModifier: 50n,
      });
      await service.handleGossipedCheckpointProposal(checkpoint1.toBuffer(), 'msg-1', mockPeerId);
      expect(duplicateProposalCallback).not.toHaveBeenCalled();

      const checkpoint2 = await makeCheckpointProposal({
        signer,
        checkpointHeader: sharedHeader,
        archiveRoot: sharedArchive,
        feeAssetPriceModifier: -50n,
      });
      expect(checkpoint2.archive.toString()).toBe(checkpoint1.archive.toString());
      expect(checkpoint2.getPayloadHash()).not.toEqual(checkpoint1.getPayloadHash());

      await service.handleGossipedCheckpointProposal(checkpoint2.toBuffer(), 'msg-2', mockPeerId);

      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-2', MOCK_PEER_ID, TopicValidatorResult.Accept);
      expect(allNodesCheckpointReceivedCallback).toHaveBeenCalledTimes(1); // only the first one
      expect(validatorCheckpointReceivedCallback).toHaveBeenCalledTimes(1);
      expect(duplicateProposalCallback).toHaveBeenCalledTimes(1);
      expect(duplicateProposalCallback).toHaveBeenCalledWith({
        slot: targetSlot,
        proposer: signer.address,
        type: 'checkpoint',
      });
    });
  });

  describe('oversized proposals (over the consensus maxBlocksPerCheckpoint)', () => {
    let attestationPool: AttestationPool;
    let mockTxPool: MockProxy<TxPoolV2>;
    let mockEpochCache: MockProxy<EpochCacheInterface>;
    let signer: Secp256k1Signer;
    let blockReceivedCallback: jest.Mock;
    let allNodesCheckpointReceivedCallback: jest.Mock;
    let validatorCheckpointReceivedCallback: jest.Mock;
    let duplicateProposalCallback: jest.Mock;

    const targetSlot = SlotNumber(100);
    const nextSlot = SlotNumber(101);
    const MAX_BLOCKS = 5;
    // 0-based index 5 is the 6th block, one over the consensus cap of 5, but below the hard ceiling.
    const oversizedIndex = IndexWithinCheckpoint(MAX_BLOCKS);
    const secondOversizedIndex = IndexWithinCheckpoint(MAX_BLOCKS + 1);

    beforeEach(() => {
      signer = Secp256k1Signer.random();
      attestationPool = new AttestationPool(openTmpStore(true));
      mockTxPool = mock<TxPoolV2>();
      mockTxPool.protectTxs.mockResolvedValue([]);

      mockEpochCache = mock<EpochCacheInterface>();
      mockEpochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
      mockEpochCache.getTargetAndNextSlot.mockReturnValue({ targetSlot, nextSlot });
      mockEpochCache.getTargetSlot.mockReturnValue(targetSlot);

      mockPeerManager = mock<PeerManagerInterface>();
      reportMessageValidationResultSpy = jest.fn();

      service = createTestLibP2PServiceWithPools(
        mockPeerManager,
        reportMessageValidationResultSpy,
        attestationPool,
        mockTxPool,
        mockEpochCache,
        { maxBlocksPerCheckpoint: MAX_BLOCKS },
      );

      blockReceivedCallback = jest.fn().mockImplementation(() => Promise.resolve(true));
      allNodesCheckpointReceivedCallback = jest.fn().mockImplementation(() => Promise.resolve([]));
      validatorCheckpointReceivedCallback = jest.fn().mockImplementation(() => Promise.resolve([]));
      duplicateProposalCallback = jest.fn();
      service.registerBlockReceivedCallback(blockReceivedCallback as any);
      service.registerAllNodesCheckpointReceivedCallback(allNodesCheckpointReceivedCallback as any);
      service.registerValidatorCheckpointReceivedCallback(validatorCheckpointReceivedCallback as any);
      service.registerDuplicateProposalCallback(duplicateProposalCallback);
    });

    it('oversized block proposal: accepts (re-broadcast), stores as evidence, does NOT process, no penalty', async () => {
      const proposal = await makeBlockProposal({
        signer,
        blockHeader: makeBlockHeader(1, { slotNumber: targetSlot }),
        indexWithinCheckpoint: oversizedIndex,
        archiveRoot: Fr.random(),
      });

      await service.processBlockFromPeer(proposal.toBuffer(), 'msg-1', mockPeerId);

      // Accepted for re-broadcast as slashing evidence
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-1', MOCK_PEER_ID, TopicValidatorResult.Accept);
      // But never processed/attested, and the relaying peer is not penalized
      expect(blockReceivedCallback).not.toHaveBeenCalled();
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
      // Stored in the pool as evidence for the watcher
      const stored = await attestationPool.getBlockProposalByArchive(proposal.archive.toString());
      expect(stored).toBeDefined();
    });

    it('duplicate oversized block proposal: ignores, no penalty', async () => {
      const proposal = await makeBlockProposal({
        signer,
        blockHeader: makeBlockHeader(1, { slotNumber: targetSlot }),
        indexWithinCheckpoint: oversizedIndex,
        archiveRoot: Fr.random(),
      });
      await service.processBlockFromPeer(proposal.toBuffer(), 'msg-1', mockPeerId);

      reportMessageValidationResultSpy.mockClear();
      blockReceivedCallback.mockClear();
      mockPeerManager.penalizePeer.mockClear();

      await service.processBlockFromPeer(proposal.toBuffer(), 'msg-2', mockPeerId);

      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-2', MOCK_PEER_ID, TopicValidatorResult.Ignore);
      expect(blockReceivedCallback).not.toHaveBeenCalled();
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
    });

    it('equivocating oversized block proposals: accepts and fires the duplicate-proposal callback, no penalty', async () => {
      const first = await makeBlockProposal({
        signer,
        blockHeader: makeBlockHeader(1, { slotNumber: targetSlot }),
        indexWithinCheckpoint: oversizedIndex,
        archiveRoot: Fr.random(),
      });
      await service.processBlockFromPeer(first.toBuffer(), 'msg-1', mockPeerId);

      reportMessageValidationResultSpy.mockClear();
      blockReceivedCallback.mockClear();
      mockPeerManager.penalizePeer.mockClear();

      const second = await makeBlockProposal({
        signer,
        blockHeader: makeBlockHeader(1, { slotNumber: targetSlot }),
        indexWithinCheckpoint: oversizedIndex,
        archiveRoot: Fr.random(),
      });
      await service.processBlockFromPeer(second.toBuffer(), 'msg-2', mockPeerId);

      // Equivocation at an illegal index is still equivocation: re-broadcast and flag the proposer,
      // but never process the proposal or penalize the relaying peer
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-2', MOCK_PEER_ID, TopicValidatorResult.Accept);
      expect(duplicateProposalCallback).toHaveBeenCalledWith({
        slot: targetSlot,
        proposer: signer.address,
        type: 'block',
      });
      expect(blockReceivedCallback).not.toHaveBeenCalled();
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
    });

    it('distinct oversized block proposals at different indices: each accepted and stored, no penalty', async () => {
      const first = await makeBlockProposal({
        signer,
        blockHeader: makeBlockHeader(1, { slotNumber: targetSlot }),
        indexWithinCheckpoint: oversizedIndex,
        archiveRoot: Fr.random(),
      });
      await service.processBlockFromPeer(first.toBuffer(), 'msg-1', mockPeerId);

      const second = await makeBlockProposal({
        signer,
        blockHeader: makeBlockHeader(2, { slotNumber: targetSlot }),
        indexWithinCheckpoint: secondOversizedIndex,
        archiveRoot: Fr.random(),
      });
      await service.processBlockFromPeer(second.toBuffer(), 'msg-2', mockPeerId);

      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-2', MOCK_PEER_ID, TopicValidatorResult.Accept);
      expect(blockReceivedCallback).not.toHaveBeenCalled();
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
      const stored = await attestationPool.getBlockProposalByArchive(second.archive.toString());
      expect(stored).toBeDefined();
    });

    it('oversized checkpoint terminal block: accepts checkpoint (re-broadcast), processes neither block nor checkpoint, no penalty', async () => {
      const proposal = await makeCheckpointProposal({
        signer,
        checkpointHeader: makeCheckpointHeader(1, { slotNumber: targetSlot }),
        lastBlock: {
          blockHeader: makeBlockHeader(1, { slotNumber: targetSlot }),
          indexWithinCheckpoint: oversizedIndex,
        },
        archiveRoot: Fr.random(),
      });

      await service.handleGossipedCheckpointProposal(proposal.toBuffer(), 'msg-1', mockPeerId);

      // Checkpoint accepted for re-broadcast (carries the same signed evidence)
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-1', MOCK_PEER_ID, TopicValidatorResult.Accept);
      // Neither the embedded block nor the checkpoint is processed/attested
      expect(blockReceivedCallback).not.toHaveBeenCalled();
      expect(allNodesCheckpointReceivedCallback).not.toHaveBeenCalled();
      expect(validatorCheckpointReceivedCallback).not.toHaveBeenCalled();
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
      // The oversized terminal block is retained as evidence
      const storedBlock = await attestationPool.getBlockProposalByArchive(
        proposal.getBlockProposal()!.archive.toString(),
      );
      expect(storedBlock).toBeDefined();
    });

    it('duplicate oversized checkpoint: ignores, processes neither, no penalty', async () => {
      const proposal = await makeCheckpointProposal({
        signer,
        checkpointHeader: makeCheckpointHeader(1, { slotNumber: targetSlot }),
        lastBlock: {
          blockHeader: makeBlockHeader(1, { slotNumber: targetSlot }),
          indexWithinCheckpoint: oversizedIndex,
        },
        archiveRoot: Fr.random(),
      });
      await service.handleGossipedCheckpointProposal(proposal.toBuffer(), 'msg-1', mockPeerId);

      reportMessageValidationResultSpy.mockClear();
      blockReceivedCallback.mockClear();
      allNodesCheckpointReceivedCallback.mockClear();
      validatorCheckpointReceivedCallback.mockClear();
      mockPeerManager.penalizePeer.mockClear();

      await service.handleGossipedCheckpointProposal(proposal.toBuffer(), 'msg-2', mockPeerId);

      // The terminal block is an exact duplicate, so nothing new was retained: ignored, not
      // re-broadcast, not penalized, nothing processed
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-2', MOCK_PEER_ID, TopicValidatorResult.Ignore);
      expect(blockReceivedCallback).not.toHaveBeenCalled();
      expect(allNodesCheckpointReceivedCallback).not.toHaveBeenCalled();
      expect(validatorCheckpointReceivedCallback).not.toHaveBeenCalled();
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
    });

    it('oversized block proposal at the per-position cap: ignores instead of penalizing the relaying peer', async () => {
      // Fill the (slot, index) position to its cap directly in the pool.
      for (let i = 0; i < 2; i++) {
        const existing = await makeBlockProposal({
          signer,
          blockHeader: makeBlockHeader(1, { slotNumber: targetSlot }),
          indexWithinCheckpoint: oversizedIndex,
          archiveRoot: Fr.random(),
        });
        const { added } = await attestationPool.tryAddBlockProposal(existing);
        expect(added).toBe(true);
      }

      const third = await makeBlockProposal({
        signer,
        blockHeader: makeBlockHeader(1, { slotNumber: targetSlot }),
        indexWithinCheckpoint: oversizedIndex,
        archiveRoot: Fr.random(),
      });
      await service.processBlockFromPeer(third.toBuffer(), 'msg-1', mockPeerId);

      // Not retained (cap reached), so not re-broadcast either; the relaying peer is not penalized
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-1', MOCK_PEER_ID, TopicValidatorResult.Ignore);
      expect(blockReceivedCallback).not.toHaveBeenCalled();
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
      const stored = await attestationPool.getBlockProposalByArchive(third.archive.toString());
      expect(stored).toBeUndefined();
    });

    it('oversized checkpoint at the per-slot checkpoint cap: ignores instead of penalizing the relaying peer', async () => {
      // Fill the slot's checkpoint-proposal cap directly in the pool (e.g. a proposer that equivocated
      // two checkpoints before sending an oversized one).
      for (let i = 0; i < 2; i++) {
        const existing = await makeCheckpointProposal({
          signer,
          checkpointHeader: makeCheckpointHeader(1, { slotNumber: targetSlot }),
          archiveRoot: Fr.random(),
        });
        const { added } = await attestationPool.tryAddCheckpointProposal(existing.toCore());
        expect(added).toBe(true);
      }

      const oversized = await makeCheckpointProposal({
        signer,
        checkpointHeader: makeCheckpointHeader(1, { slotNumber: targetSlot }),
        lastBlock: {
          blockHeader: makeBlockHeader(1, { slotNumber: targetSlot }),
          indexWithinCheckpoint: oversizedIndex,
        },
        archiveRoot: Fr.random(),
      });
      await service.handleGossipedCheckpointProposal(oversized.toBuffer(), 'msg-1', mockPeerId);

      // The checkpoint is dropped without penalty or processing, but the oversized terminal block was
      // already retained as evidence for the watcher
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-1', MOCK_PEER_ID, TopicValidatorResult.Ignore);
      expect(blockReceivedCallback).not.toHaveBeenCalled();
      expect(allNodesCheckpointReceivedCallback).not.toHaveBeenCalled();
      expect(validatorCheckpointReceivedCallback).not.toHaveBeenCalled();
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
      const storedBlock = await attestationPool.getBlockProposalByArchive(
        oversized.getBlockProposal()!.archive.toString(),
      );
      expect(storedBlock).toBeDefined();
    });
  });

  // Regression for A-1013
  describe('validateAndStoreCheckpointAttestation', () => {
    let attestationPool: AttestationPool;
    let mockEpochCache: MockProxy<EpochCacheInterface>;
    let proposerSigner: Secp256k1Signer;
    let duplicateAttestationCallback: jest.Mock;
    let checkpointAttestationCallback: jest.Mock;

    const targetSlot = SlotNumber(100);
    const nextSlot = SlotNumber(101);

    beforeEach(() => {
      proposerSigner = Secp256k1Signer.random();
      attestationPool = new AttestationPool(openTmpStore(true));
      const mockTxPool = mock<TxPoolV2>();
      mockTxPool.protectTxs.mockResolvedValue([]);

      mockEpochCache = mock<EpochCacheInterface>();
      mockEpochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposerSigner.address);
      mockEpochCache.getTargetAndNextSlot.mockReturnValue({ targetSlot, nextSlot });
      mockEpochCache.getTargetSlot.mockReturnValue(targetSlot);
      mockEpochCache.isInCommittee.mockResolvedValue(true);

      mockPeerManager = mock<PeerManagerInterface>();
      reportMessageValidationResultSpy = jest.fn();

      service = createTestLibP2PServiceWithPools(
        mockPeerManager,
        reportMessageValidationResultSpy,
        attestationPool,
        mockTxPool,
        mockEpochCache,
      );

      duplicateAttestationCallback = jest.fn();
      service.registerDuplicateAttestationCallback(duplicateAttestationCallback);
      checkpointAttestationCallback = jest.fn();
      service.registerCheckpointAttestationCallback(checkpointAttestationCallback);
    });

    // Regression for A-1013: attestations sharing (slot, signer, archive) but differing on
    // feeAssetPriceModifier used to dedup by archive only. The pool now dedups by signed-payload
    // hash, so the equivocation surfaces.
    it('same signer + same archive + different feeAssetPriceModifier triggers slash callback', async () => {
      const attesterSigner = Secp256k1Signer.random();
      const sharedHeader = makeCheckpointHeader(1, { slotNumber: targetSlot });
      const sharedArchive = Fr.random();

      const attestation1 = makeCheckpointAttestation({
        header: sharedHeader,
        archive: sharedArchive,
        feeAssetPriceModifier: 50n,
        attesterSigner,
        proposerSigner,
      });
      await service.validateAndStoreCheckpointAttestation(mockPeerId, attestation1);
      expect(duplicateAttestationCallback).not.toHaveBeenCalled();

      const attestation2 = makeCheckpointAttestation({
        header: sharedHeader,
        archive: sharedArchive,
        feeAssetPriceModifier: -50n,
        attesterSigner,
        proposerSigner,
      });
      expect(attestation2.archive.toString()).toBe(attestation1.archive.toString());
      expect(attestation2.getPayloadHash()).not.toEqual(attestation1.getPayloadHash());

      await service.validateAndStoreCheckpointAttestation(mockPeerId, attestation2);

      expect(duplicateAttestationCallback).toHaveBeenCalledTimes(1);
      expect(duplicateAttestationCallback).toHaveBeenCalledWith({
        slot: targetSlot,
        attester: attesterSigner.address,
      });
      expect(checkpointAttestationCallback).toHaveBeenCalledTimes(2);
      expect(checkpointAttestationCallback).toHaveBeenNthCalledWith(1, attestation1);
      expect(checkpointAttestationCallback).toHaveBeenNthCalledWith(2, attestation2);
    });

    it('different signers are not equivocations and do not trigger slash callback', async () => {
      const attesterA = Secp256k1Signer.random();
      const attesterB = Secp256k1Signer.random();
      const sharedHeader = makeCheckpointHeader(1, { slotNumber: targetSlot });
      const sharedArchive = Fr.random();

      const attestationA = makeCheckpointAttestation({
        header: sharedHeader,
        archive: sharedArchive,
        feeAssetPriceModifier: 50n,
        attesterSigner: attesterA,
        proposerSigner,
      });
      await service.validateAndStoreCheckpointAttestation(mockPeerId, attestationA);

      const attestationB = makeCheckpointAttestation({
        header: sharedHeader,
        archive: sharedArchive,
        feeAssetPriceModifier: -50n,
        attesterSigner: attesterB,
        proposerSigner,
      });
      await service.validateAndStoreCheckpointAttestation(mockPeerId, attestationB);

      // Two distinct signers are not an equivocation; the pool tracks per-(slot, signer).
      expect(duplicateAttestationCallback).not.toHaveBeenCalled();
      expect(checkpointAttestationCallback).toHaveBeenCalledTimes(2);
    });

    it('does not trigger accepted-attestation callback for exact duplicates', async () => {
      const attesterSigner = Secp256k1Signer.random();
      const attestation = makeCheckpointAttestation({
        header: makeCheckpointHeader(1, { slotNumber: targetSlot }),
        archive: Fr.random(),
        attesterSigner,
        proposerSigner,
      });

      await service.validateAndStoreCheckpointAttestation(mockPeerId, attestation);
      await service.validateAndStoreCheckpointAttestation(mockPeerId, attestation);

      expect(checkpointAttestationCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('ip:changed bridge to AddressManager', () => {
    let peerDiscoveryEmitter: PeerDiscoveryService;
    let addObservedAddr: jest.Mock;
    let confirmObservedAddr: jest.Mock;
    let removeObservedAddr: jest.Mock;
    let ipNode: MockProxy<PubSubLibp2p>;

    beforeEach(() => {
      peerDiscoveryEmitter = new EventEmitter() as PeerDiscoveryService;
      peerDiscoveryEmitter.start = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      peerDiscoveryEmitter.stop = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      peerDiscoveryEmitter.getKadValues = jest.fn<() => any[]>().mockReturnValue([]);
      peerDiscoveryEmitter.runRandomNodesQuery = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      peerDiscoveryEmitter.isBootstrapPeer = jest.fn<() => boolean>().mockReturnValue(false);
      peerDiscoveryEmitter.getStatus = jest.fn().mockReturnValue('running') as any;
      peerDiscoveryEmitter.getEnr = jest.fn().mockReturnValue(undefined) as any;
      peerDiscoveryEmitter.bootstrapNodeEnrs = [];

      addObservedAddr = jest.fn();
      confirmObservedAddr = jest.fn();
      removeObservedAddr = jest.fn();

      ipNode = mock<PubSubLibp2p>();
      ipNode.services = {
        pubsub: {
          reportMessageValidationResult: jest.fn(),
          subscribe: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          getTopics: jest.fn().mockReturnValue([]),
        },
        components: {
          addressManager: { addObservedAddr, confirmObservedAddr, removeObservedAddr },
        },
      } as any;
      ipNode.start = jest.fn<() => Promise<void>>().mockResolvedValue(undefined) as any;
    });

    it('should update libp2p AddressManager when discv5 emits ip:changed', async () => {
      const ipService = createTestLibP2PService({
        peerManager: mock<PeerManagerInterface>(),
        node: ipNode,
        configOverrides: { queryForIp: true, p2pIp: '10.0.0.1', p2pPort: 40400 },
        peerDiscoveryService: peerDiscoveryEmitter,
      });

      await ipService.start();

      // Emit first IP change — should remove the initial config IP (10.0.0.1)
      peerDiscoveryEmitter.emit('ip:changed', '1.2.3.4');
      expect(addObservedAddr).toHaveBeenCalledTimes(1);
      expect(confirmObservedAddr).toHaveBeenCalledTimes(1);
      expect(removeObservedAddr).toHaveBeenCalledTimes(1);
      expect(removeObservedAddr).toHaveBeenCalledWith(multiaddr('/ip4/10.0.0.1/tcp/40400'));

      // Emit second IP change — should remove the previous discovered IP (1.2.3.4)
      peerDiscoveryEmitter.emit('ip:changed', '5.6.7.8');
      expect(addObservedAddr).toHaveBeenCalledTimes(2);
      expect(confirmObservedAddr).toHaveBeenCalledTimes(2);
      expect(removeObservedAddr).toHaveBeenCalledTimes(2);

      await ipService.stop();
    });

    it('should not wire the bridge when queryForIp is false', async () => {
      const ipService = createTestLibP2PService({
        peerManager: mock<PeerManagerInterface>(),
        node: ipNode,
        configOverrides: { queryForIp: false, p2pIp: '10.0.0.1', p2pPort: 40400 },
        peerDiscoveryService: peerDiscoveryEmitter,
      });

      await ipService.start();

      peerDiscoveryEmitter.emit('ip:changed', '1.2.3.4');
      expect(addObservedAddr).not.toHaveBeenCalled();

      await ipService.stop();
    });
  });
});

/** Mock type for tx objects used in block txs validation tests. */
interface MockTx {
  getTxHash(): { toString(): string };
}

/**
 * Minimal attestation pool interface for tests that only need getBlockProposalByArchive.
 * This allows creating partial mocks without implementing the full AttestationPool interface.
 */
interface MockAttestationPoolForTests {
  getBlockProposalByArchive(id: string): Promise<{ txHashes: { toString(): string }[] } | undefined>;
}

/** Options for creating a test LibP2PService instance. */
interface CreateTestLibP2PServiceOptions {
  peerManager: MockProxy<PeerManagerInterface>;
  node: MockProxy<PubSubLibp2p>;
  archiver?: MockProxy<L2BlockSource & ContractDataSource>;
  attestationPool?: AttestationPool;
  txPool?: MockProxy<TxPoolV2>;
  epochCache?: MockProxy<EpochCacheInterface>;
  configOverrides?: Partial<P2PConfig>;
  peerDiscoveryService?: PeerDiscoveryService;
}

/**
 * Test subclass of LibP2PService that exposes protected methods for testing
 * and allows construction with mocked dependencies.
 */
class TestLibP2PService extends LibP2PService {
  /** Controls whether first-stage gossip validation passes. Set to false to simulate first-stage failure. */
  public firstStageValidationPasses = true;

  /** Controls whether second-stage gossip validation passes. Set to false to simulate proof verification failure. */
  public secondStageValidationPasses = true;

  /** Controls the name of the failing first-stage validator (e.g., 'doubleSpendValidator' to trigger special handling). */
  public firstStageFailingValidatorName = 'failingValidator';

  /** Controls the severity returned by the failing first-stage validator. */
  public firstStageSeverity: PeerErrorSeverity = PeerErrorSeverity.LowToleranceError;

  /** Exposed epoch cache for test configuration. */
  public testEpochCache: MockProxy<EpochCacheInterface>;

  public mockPeerDiscoveryService: PeerDiscoveryService;

  constructor(
    node: PubSubLibp2p,
    peerManager: PeerManagerInterface,
    mempools: MemPools,
    archiver: L2BlockSource & ContractDataSource,
    epochCache: MockProxy<EpochCacheInterface>,
    telemetry: TelemetryClient,
    logger: Logger,
    configOverrides?: Partial<P2PConfig>,
    peerDiscoveryService?: PeerDiscoveryService,
  ) {
    // Create minimal mock dependencies for the base class
    const mockConfig: P2PConfig = {
      ...getDefaultConfig(p2pConfigMappings),
      seenMessageCacheSize: 1000,
      debugP2PInstrumentMessages: false,
      disableTransactions: false,
      l1ChainId: TEST_COORDINATION_SIGNATURE_CONTEXT.chainId,
      rollupVersion: 1,
      rollupAddress: TEST_COORDINATION_SIGNATURE_CONTEXT.rollupAddress,
      ...configOverrides,
    };

    const resolvedPeerDiscoveryService = peerDiscoveryService ?? mock<PeerDiscoveryService>();
    const mockReqResp = mock<ReqRespInterface>();
    const mockWorldStateSynchronizer = mock<ServerWorldStateSynchronizer>();
    const mockProofVerifier = mock<ClientProtocolCircuitVerifier>({
      verifyProof: () => Promise.resolve({ valid: true, durationMs: 1000, totalDurationMs: 1000 }),
    });

    super(
      mockConfig,
      node,
      resolvedPeerDiscoveryService,
      mockReqResp,
      peerManager,
      mempools,
      archiver,
      epochCache,
      mockProofVerifier,
      mockWorldStateSynchronizer,
      { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
      telemetry,
      logger,
    );

    this.mockPeerDiscoveryService = resolvedPeerDiscoveryService;

    this.testEpochCache = epochCache;
  }

  /** Exposes the protected handleNewGossipMessage for testing. */
  public override handleNewGossipMessage(msg: Message, msgId: string, source: PeerId): Promise<void> {
    return super.handleNewGossipMessage(msg, msgId, source);
  }

  /** Exposes the protected handleGossipedTx for testing. */
  public override handleGossipedTx(payloadData: Buffer, msgId: string, source: PeerId): Promise<void> {
    return super.handleGossipedTx(payloadData, msgId, source);
  }

  /** Override to use test flag for first-stage validators. Returns a failing validator when firstStageValidationPasses is false. */
  protected override createFirstStageMessageValidators(): Promise<Record<string, TransactionValidator>> {
    if (this.firstStageValidationPasses) {
      return Promise.resolve({});
    }
    return Promise.resolve({
      [this.firstStageFailingValidatorName]: {
        validator: { validateTx: () => Promise.resolve({ result: 'invalid' as const, reason: ['Test failure'] }) },
        severity: this.firstStageSeverity,
      },
    });
  }

  /** Override to use test flag for second-stage validators. Returns a failing validator when secondStageValidationPasses is false. */
  protected override createSecondStageMessageValidators(): Record<string, TransactionValidator> {
    if (this.secondStageValidationPasses) {
      return {};
    }
    return {
      proofValidator: {
        validator: { validateTx: () => Promise.resolve({ result: 'invalid' as const, reason: ['Proof failure'] }) },
        severity: PeerErrorSeverity.LowToleranceError,
      },
    };
  }

  /** Exposes the protected validateRequestedBlockTxsConsistency for testing. */
  public override validateRequestedBlockTxsConsistency(
    request: BlockTxsRequest,
    response: BlockTxsResponse,
    peerId: PeerId,
  ): Promise<boolean> {
    return super.validateRequestedBlockTxsConsistency(request, response, peerId);
  }

  /** Exposes the protected processBlockFromPeer for testing. */
  public override processBlockFromPeer(payloadData: Buffer, msgId: string, source: PeerId): Promise<void> {
    return super.processBlockFromPeer(payloadData, msgId, source);
  }

  /** Exposes the protected handleGossipedCheckpointProposal for testing. */
  public override handleGossipedCheckpointProposal(payloadData: Buffer, msgId: string, source: PeerId): Promise<void> {
    return super.handleGossipedCheckpointProposal(payloadData, msgId, source);
  }

  /** Exposes the protected validateAndStoreCheckpointAttestation for testing. */
  public override validateAndStoreCheckpointAttestation(peerId: PeerId, attestation: CheckpointAttestation) {
    return super.validateAndStoreCheckpointAttestation(peerId, attestation);
  }

  /** Sets the attestation pool on the mempools for test setup. */
  public setAttestationPool(attestationPool: MockAttestationPoolForTests): void {
    (this.mempools as any).attestationPool = attestationPool;
  }
}

/** Creates a TestLibP2PService instance with configurable mocks. */
function createTestLibP2PService(options: CreateTestLibP2PServiceOptions): TestLibP2PService {
  const {
    peerManager,
    node,
    archiver = mock<L2BlockSource & ContractDataSource>(),
    attestationPool = new AttestationPool(openTmpStore(true)),
    txPool = mock<TxPoolV2>(),
    epochCache = mock<EpochCacheInterface>(),
    configOverrides,
    peerDiscoveryService,
  } = options;

  epochCache.getL1Constants.mockReturnValue({
    l1GenesisTime: 0n,
    slotDuration: 36,
    ethereumSlotDuration: 12,
  } as any);

  // Pin wall-clock time inside the pipelined receive window for the slot the proposal tests use
  // (SlotNumber(100)). With genesis 0, S=36, E=12, slot 100 starts at 3600s, so its checkpoint
  // receive window is [3552s, 3588s] and its attestation window is [3552s, 3612s]; 3570s sits inside
  // both. The validators read `getEpochAndSlotNow().nowMs` as the current time.
  epochCache.getEpochAndSlotNow.mockReturnValue({ nowMs: 3_570_000n } as any);

  const mempools = mock<MemPools>();
  mempools.attestationPool = attestationPool;
  mempools.txPool = txPool;

  const telemetry = getTelemetryClient();
  const logger = createLogger('p2p:test');

  return new TestLibP2PService(
    node,
    peerManager,
    mempools,
    archiver,
    epochCache,
    telemetry,
    logger,
    configOverrides,
    peerDiscoveryService,
  );
}

/** Creates a TestLibP2PService instance with real attestation pool and mocked tx pool. */
function createTestLibP2PServiceWithPools(
  mockPeerManager: MockProxy<PeerManagerInterface>,
  reportMessageValidationResultSpy: jest.Mock,
  attestationPool: AttestationPool,
  mockTxPool: MockProxy<TxPoolV2>,
  mockEpochCache: MockProxy<EpochCacheInterface>,
  configOverrides?: Partial<P2PConfig>,
): TestLibP2PService {
  const mockNode = mock<PubSubLibp2p>();
  mockNode.services = {
    pubsub: {
      reportMessageValidationResult: reportMessageValidationResultSpy,
    },
  } as any;

  return createTestLibP2PService({
    peerManager: mockPeerManager,
    node: mockNode,
    attestationPool,
    txPool: mockTxPool,
    epochCache: mockEpochCache,
    configOverrides,
  });
}
