import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { BlockNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { getDefaultConfig } from '@aztec/foundation/config';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import { L2Block, type L2BlockSource } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { ClientProtocolCircuitVerifier } from '@aztec/stdlib/interfaces/server';
import { BlockProposal, P2PClientType, PeerErrorSeverity } from '@aztec/stdlib/p2p';
import {
  makeBlockHeader,
  makeBlockProposal,
  makeCheckpointHeader,
  makeCheckpointProposal,
} from '@aztec/stdlib/testing';
import { type Tx, TxArray, TxHashArray, type TxValidator } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';
import { ServerWorldStateSynchronizer } from '@aztec/world-state';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Message, PeerId } from '@libp2p/interface';
import { TopicValidatorResult } from '@libp2p/interface';
import { type MockProxy, mock } from 'jest-mock-extended';

import { type P2PConfig, p2pConfigMappings } from '../../config.js';
import {
  AttestationPool,
  MAX_PROPOSALS_PER_POSITION,
  MAX_PROPOSALS_PER_SLOT,
} from '../../mem_pools/attestation_pool/attestation_pool.js';
import type { MemPools } from '../../mem_pools/interface.js';
import type { TxPoolV2 } from '../../mem_pools/tx_pool_v2/interfaces.js';
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

  describe('validateRequestedBlock', () => {
    it('should return false and penalize on number mismatch', async () => {
      const requested = new Fr(10);
      const resp = await L2Block.random(BlockNumber(9));

      const ok = await service.validateRequestedBlock(requested, resp, mockPeerId);

      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.LowToleranceError);
    });

    it('should return false (no penalty) when numbers match and no local block', async () => {
      mockArchiver.getBlock.mockResolvedValue(undefined);
      const requested = new Fr(10);
      const resp = await L2Block.random(BlockNumber(10));

      const ok = await service.validateRequestedBlock(requested, resp, mockPeerId);

      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
    });

    it('should return true when numbers match and hashes match', async () => {
      const requested = new Fr(10);
      const local = await L2Block.random(BlockNumber(10));

      const resp = L2Block.fromBuffer(local.toBuffer());
      mockArchiver.getBlock.mockResolvedValue(local);

      const ok = await service.validateRequestedBlock(requested, resp, mockPeerId);

      expect(ok).toBe(true);
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
    });

    it('should return false and penalize when hashes mismatch', async () => {
      const requested = new Fr(10);
      const local = await L2Block.random(BlockNumber(10));

      const resp = L2Block.fromBuffer(local.toBuffer());
      resp.header.globalVariables.coinbase = EthAddress.random();
      mockArchiver.getBlock.mockResolvedValue(local);

      const ok = await service.validateRequestedBlock(requested, resp, mockPeerId);

      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.MidToleranceError);
    });

    it('should return false on archiver error', async () => {
      mockArchiver.getBlock.mockRejectedValue(new Error('boom'));
      const requested = new Fr(10);
      const resp = await L2Block.random(BlockNumber(10));

      const ok = await service.validateRequestedBlock(requested, resp, mockPeerId);

      expect(ok).toBe(false);
    });
  });

  describe('validateRequestedBlockTxs', () => {
    function makeRequest(archiveRoot: Fr, length: number, indices: number[]): BlockTxsRequest {
      return new BlockTxsRequest(archiveRoot, new TxHashArray(), BitVector.init(length, indices));
    }

    function makeResponse(archiveRoot: Fr, length: number, indices: number[], txHashes: string[]): BlockTxsResponse {
      const txs = txHashes.map(h => ({
        getTxHash: () => ({ toString: () => h }),
      })) as MockTx[];
      return new BlockTxsResponse(archiveRoot, txs as TxArray, BitVector.init(length, indices));
    }

    /** Sets up the mempools with a mock attestation pool that returns a proposal with given tx hashes. */
    function setProposalTxHashes(svc: TestLibP2PService, txHashes: string[]): void {
      // Create a partial mock of the attestation pool that only implements getBlockProposal.
      // The validation code only accesses `txHashes` from the returned proposal.
      const mockAttestationPool: MockAttestationPoolForTests = {
        getBlockProposal: (_: string) =>
          Promise.resolve({
            txHashes: txHashes.map(s => ({ toString: () => s })),
          }),
      };
      svc.setAttestationPool(mockAttestationPool);
    }

    it('should penalize and reject on archive root mismatch', async () => {
      const reqHash = Fr.random();
      const otherHash = Fr.random();
      const request = makeRequest(reqHash, 5, [0, 2]);
      const response = makeResponse(otherHash, 5, [0, 2], []);

      const ok = await service.validateRequestedBlockTxs(request, response, mockPeerId);
      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.MidToleranceError);
    });

    it('should penalize and reject on bitvector length mismatch', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 5, [0, 2]);
      const response = makeResponse(hash, 4, [0, 2], []);

      const ok = await service.validateRequestedBlockTxs(request, response, mockPeerId);
      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.MidToleranceError);
    });

    it('should penalize and reject on duplicate txs', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 5, [0, 2, 3]);
      const response = makeResponse(hash, 5, [0, 2, 3], ['0xaaa', '0xaaa']); // duplicate

      const ok = await service.validateRequestedBlockTxs(request, response, mockPeerId);
      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.MidToleranceError);
    });

    it('should penalize and reject when returned txs exceed requested intersect available', async () => {
      const hash = Fr.random();
      // requested indices [0,2], available [0] -> maxReturnable 1, but return 2
      const request = makeRequest(hash, 3, [0, 2]);
      const response = makeResponse(hash, 3, [0], ['0x1', '0x2']);

      const ok = await service.validateRequestedBlockTxs(request, response, mockPeerId);
      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.MidToleranceError);
    });

    it('should penalize and reject when proposal exists and a tx is not part of requested indices of proposal', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 5, [0, 2, 4]); // requested 0,2,4
      const response = makeResponse(hash, 5, [0, 2, 4], ['0xgood0', '0xbad']); // one bad

      setProposalTxHashes(service, ['0xgood0', '0xgood2', '0xgood4', '0xother', '0xother2']);

      const ok = await service.validateRequestedBlockTxs(request, response, mockPeerId);
      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.LowToleranceError);
    });

    it('should penalize and reject when proposal exists and a tx is from an unrequested index', async () => {
      const hash = Fr.random();
      // Requested indices [0,2,4]; response advertises availability for [0,2,4]
      const request = makeRequest(hash, 5, [0]);
      // Return a tx that exists in the proposal but at an unrequested index (1)
      const response = makeResponse(hash, 5, [0], ['0xother1']);

      setProposalTxHashes(service, ['0xgood0', '0xother1', '0xgood2', '0xother3', '0xgood4']);

      const ok = await service.validateRequestedBlockTxs(request, response, mockPeerId);
      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.LowToleranceError);
    });

    it('should accept when shapes match, count matches, and order matches proposal/requested indices', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 5, [0, 2, 4]); // requested 0,2,4
      const response = makeResponse(hash, 5, [0, 2, 4], ['0xgood0', '0xgood2', '0xgood4']); // all and in order

      setProposalTxHashes(service, ['0xgood0', '0xother1', '0xgood2', '0xother3', '0xgood4']);

      const ok = await service.validateRequestedBlockTxs(request, response, mockPeerId);
      expect(ok).toBe(true);
      expect(service.validateRequestedTxMock).toHaveBeenCalledTimes(3);
    });

    it('should accept partial subset when proposal exists and order matches requested indices', async () => {
      const hash = Fr.random();
      // Request indices [0,2,4] but only return a subset [0,4]
      const request = makeRequest(hash, 5, [0, 2, 4]);
      const response = makeResponse(hash, 5, [0, 2, 4], ['0xgood0', '0xgood4']); // partial, ordered 0 < 4

      setProposalTxHashes(service, ['0xgood0', '0xother1', '0xgood2', '0xother3', '0xgood4']);

      const ok = await service.validateRequestedBlockTxs(request, response, mockPeerId);
      expect(ok).toBe(true);
      expect(service.validateRequestedTxMock).toHaveBeenCalledTimes(2);
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
    });

    it('should accept when requested intersect available is non-empty but zero txs are returned', async () => {
      const hash = Fr.random();
      // requested [0,2], available [0,2] -> intersection size 2, but return 0 txs
      const request = makeRequest(hash, 5, [0, 2]);
      const response = makeResponse(hash, 5, [0, 2], []); // empty response.txs

      setProposalTxHashes(service, ['0xgood0', '0xother1', '0xgood2', '0xother3', '0xother4']);

      const ok = await service.validateRequestedBlockTxs(request, response, mockPeerId);
      expect(ok).toBe(true);
      expect(service.validateRequestedTxMock).toHaveBeenCalledTimes(0);
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
    });

    it('penalizes and rejects when requested intersect available is empty but response returns txs', async () => {
      const hash = Fr.random();
      // requested [1], available [] -> intersection 0, but non-empty txs returned
      const request = makeRequest(hash, 3, [1]);
      const response = makeResponse(hash, 3, [], ['0xsome']);

      const ok = await service.validateRequestedBlockTxs(request, response, mockPeerId);
      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.MidToleranceError);
    });

    it('should penalize and reject when order does not match proposal/requested indices', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 5, [0, 2, 4]); // requested 0,2,4
      // Out of order relative to indices [0,2,4]
      const response = makeResponse(hash, 5, [0, 2, 4], ['0xgood4', '0xgood0', '0xgood2']);

      setProposalTxHashes(service, ['0xgood0', '0xother1', '0xgood2', '0xother3', '0xgood4']);

      const ok = await service.validateRequestedBlockTxs(request, response, mockPeerId);
      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.LowToleranceError);
    });

    it('should penalize and reject when partial subset is unordered relative to requested indices', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 5, [0, 2, 4]); // requested 0,2,4
      // Return only a subset but swap order (4 before 0)
      const response = makeResponse(hash, 5, [0, 2, 4], ['0xgood4', '0xgood0']);

      setProposalTxHashes(service, ['0xgood0', '0xother1', '0xgood2', '0xother3', '0xgood4']);

      const ok = await service.validateRequestedBlockTxs(request, response, mockPeerId);
      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.LowToleranceError);
    });

    it('should reject without penalizing when proposal is missing', async () => {
      const hash = Fr.random();
      // Simple valid shape that should pass pre-checks
      const request = makeRequest(hash, 3, [0, 2]);
      const response = makeResponse(hash, 3, [0, 2], ['0xgood0']);

      // No proposal available - mock attestationPool to return undefined
      const mockAttestationPool: MockAttestationPoolForTests = {
        getBlockProposal: (_: string) => Promise.resolve(undefined),
      };
      service.setAttestationPool(mockAttestationPool);

      const ok = await service.validateRequestedBlockTxs(request, response, mockPeerId);
      expect(ok).toBe(false);
      expect(mockPeerManager.penalizePeer).not.toHaveBeenCalled();
    });
  });

  describe('processBlockFromPeer', () => {
    let attestationPool: AttestationPool;
    let mockTxPool: MockProxy<TxPoolV2>;
    let mockEpochCache: MockProxy<EpochCacheInterface>;
    let signer: Secp256k1Signer;
    let blockReceivedCallback: jest.Mock;
    let duplicateProposalCallback: jest.Mock;

    const currentSlot = SlotNumber(100);
    const nextSlot = SlotNumber(101);

    beforeEach(() => {
      signer = Secp256k1Signer.random();
      attestationPool = new AttestationPool(openTmpStore(true));
      mockTxPool = mock<TxPoolV2>();
      mockTxPool.protectTxs.mockResolvedValue([]);

      mockEpochCache = mock<EpochCacheInterface>();
      mockEpochCache.getCurrentAndNextSlot.mockReturnValue({ currentSlot, nextSlot });
      mockEpochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
      mockEpochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: currentSlot,
        ts: 1000n,
        nowMs: 1000100n, // 100ms elapsed, within tolerance
      });

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
      duplicateProposalCallback = jest.fn();
      service.registerBlockReceivedCallback(blockReceivedCallback as any);
      service.registerDuplicateProposalCallback(duplicateProposalCallback);
    });

    it('processes valid block: invokes callback and marks txs non-evictable', async () => {
      const header = makeBlockHeader(1, { slotNumber: currentSlot });
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
      const stored = await attestationPool.getBlockProposal(proposal.archive.toString());
      expect(stored).toBeDefined();
    });

    it('equivocated block: re-broadcasts but does NOT process', async () => {
      const header = makeBlockHeader(1, { slotNumber: currentSlot });
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
        slot: currentSlot,
        proposer: signer.address,
        type: 'block',
      });
    });

    it('duplicate exact block: returns Ignore, no processing', async () => {
      const header = makeBlockHeader(1, { slotNumber: currentSlot });
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
      const header = makeBlockHeader(1, { slotNumber: currentSlot });
      const indexWithinCheckpoint = IndexWithinCheckpoint(0);

      // Add MAX_PROPOSALS_PER_POSITION proposals
      for (let i = 0; i < MAX_PROPOSALS_PER_POSITION; i++) {
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
      const header = makeBlockHeader(1, { slotNumber: currentSlot });
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
        slot: currentSlot,
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
      const header = makeBlockHeader(1, { slotNumber: currentSlot });
      // Create block signed by wrong signer
      const wrongSigner = Secp256k1Signer.random();
      const proposal = await makeBlockProposal({ signer: wrongSigner, blockHeader: header });

      await service.processBlockFromPeer(proposal.toBuffer(), 'msg-1', mockPeerId);

      // Verify peer was penalized with MidToleranceError
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.MidToleranceError);

      // Verify message was rejected
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-1', MOCK_PEER_ID, TopicValidatorResult.Reject);
    });
  });

  describe('handleGossipedCheckpointProposal', () => {
    let attestationPool: AttestationPool;
    let mockTxPool: MockProxy<TxPoolV2>;
    let mockEpochCache: MockProxy<EpochCacheInterface>;
    let signer: Secp256k1Signer;
    let blockReceivedCallback: jest.Mock;
    let checkpointReceivedCallback: jest.Mock;
    let duplicateProposalCallback: jest.Mock;

    const currentSlot = SlotNumber(100);
    const nextSlot = SlotNumber(101);

    beforeEach(() => {
      signer = Secp256k1Signer.random();
      attestationPool = new AttestationPool(openTmpStore(true));
      mockTxPool = mock<TxPoolV2>();
      mockTxPool.protectTxs.mockResolvedValue([]);

      mockEpochCache = mock<EpochCacheInterface>();
      mockEpochCache.getCurrentAndNextSlot.mockReturnValue({ currentSlot, nextSlot });
      mockEpochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
      mockEpochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: currentSlot,
        ts: 1000n,
        nowMs: 1000100n,
      });

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
      checkpointReceivedCallback = jest.fn().mockImplementation(() => Promise.resolve([]));
      duplicateProposalCallback = jest.fn();
      service.registerBlockReceivedCallback(blockReceivedCallback as any);
      service.registerCheckpointReceivedCallback(checkpointReceivedCallback as any);
      service.registerDuplicateProposalCallback(duplicateProposalCallback);
    });

    it('processes valid checkpoint: invokes callback and propagates attestations', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: currentSlot });
      const proposal = await makeCheckpointProposal({ signer, checkpointHeader });

      await service.handleGossipedCheckpointProposal(proposal.toBuffer(), 'msg-1', mockPeerId);

      // Verify callback was invoked with checkpoint core
      expect(checkpointReceivedCallback).toHaveBeenCalledTimes(1);
      expect(checkpointReceivedCallback).toHaveBeenCalledWith(expect.any(Object), mockPeerId);

      // Verify message was accepted
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-1', MOCK_PEER_ID, TopicValidatorResult.Accept);

      // Verify checkpoint was stored in attestation pool
      const stored = await attestationPool.getCheckpointProposal(proposal.archive.toString());
      expect(stored).toBeDefined();
    });

    it('equivocated checkpoint: re-broadcasts but does NOT process', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: currentSlot });

      // First checkpoint
      const checkpoint1 = await makeCheckpointProposal({
        signer,
        checkpointHeader,
        archiveRoot: Fr.random(),
      });
      await service.handleGossipedCheckpointProposal(checkpoint1.toBuffer(), 'msg-1', mockPeerId);
      expect(checkpointReceivedCallback).toHaveBeenCalledTimes(1);

      // Reset mocks
      checkpointReceivedCallback.mockClear();
      reportMessageValidationResultSpy.mockClear();

      // Second checkpoint at same slot (equivocation)
      const checkpoint2 = await makeCheckpointProposal({
        signer,
        checkpointHeader: makeCheckpointHeader(1, { slotNumber: currentSlot }),
        archiveRoot: Fr.random(),
      });
      await service.handleGossipedCheckpointProposal(checkpoint2.toBuffer(), 'msg-2', mockPeerId);

      // Verify message was accepted (for re-broadcast)
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-2', MOCK_PEER_ID, TopicValidatorResult.Accept);

      // Verify callback was NOT invoked
      expect(checkpointReceivedCallback).not.toHaveBeenCalled();

      // Verify duplicate callback was invoked
      expect(duplicateProposalCallback).toHaveBeenCalledWith({
        slot: currentSlot,
        proposer: signer.address,
        type: 'checkpoint',
      });
    });

    it('checkpoint with lastBlock: processes both when valid', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: currentSlot });
      const blockHeader = makeBlockHeader(1, { slotNumber: currentSlot });
      const proposal = await makeCheckpointProposal({
        signer,
        checkpointHeader,
        lastBlock: { blockHeader },
      });

      await service.handleGossipedCheckpointProposal(proposal.toBuffer(), 'msg-1', mockPeerId);

      // Verify both callbacks were invoked
      expect(blockReceivedCallback).toHaveBeenCalledTimes(1);
      expect(checkpointReceivedCallback).toHaveBeenCalledTimes(1);

      // Verify txs were marked as non-evictable (for the lastBlock)
      expect(mockTxPool.protectTxs).toHaveBeenCalledTimes(1);

      // Verify both were stored in attestation pool
      const storedCheckpoint = await attestationPool.getCheckpointProposal(proposal.archive.toString());
      expect(storedCheckpoint).toBeDefined();

      const storedBlock = await attestationPool.getBlockProposal(proposal.getBlockProposal()!.archive.toString());
      expect(storedBlock).toBeDefined();
    });

    it('lastBlock processed even when checkpoint cap exceeded', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: currentSlot });
      const blockHeader = makeBlockHeader(1, { slotNumber: currentSlot });

      // Fill checkpoint slot to MAX_PROPOSALS_PER_SLOT
      for (let i = 0; i < MAX_PROPOSALS_PER_SLOT; i++) {
        const individualSigner = Secp256k1Signer.random();
        mockEpochCache.getProposerAttesterAddressInSlot.mockResolvedValue(individualSigner.address);
        const proposal = await makeCheckpointProposal({
          signer: individualSigner,
          checkpointHeader: makeCheckpointHeader(1, { slotNumber: currentSlot }),
          archiveRoot: Fr.random(),
        });
        await service.handleGossipedCheckpointProposal(proposal.toBuffer(), `msg-${i}`, mockPeerId);
      }

      // Reset mocks
      blockReceivedCallback.mockClear();
      checkpointReceivedCallback.mockClear();
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
      expect(checkpointReceivedCallback).not.toHaveBeenCalled();

      // But the lastBlock IS processed since it was valid
      expect(blockReceivedCallback).toHaveBeenCalled();
      const receivedBlock = blockReceivedCallback.mock.calls[0][0] as BlockProposal;
      expect(receivedBlock.archive.toString()).toBe(extraProposal.getBlockProposal()!.archive.toString());

      // The lastBlock is stored in the attestation pool
      const storedBlock = await attestationPool.getBlockProposal(extraProposal.getBlockProposal()!.archive.toString());
      expect(storedBlock).toBeDefined();

      // Txs were marked as non-evictable since the block was processed
      expect(mockTxPool.protectTxs).toHaveBeenCalled();
    });

    it('checkpoint rejected when lastBlock is equivocated', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: currentSlot });
      const blockHeader = makeBlockHeader(1, { slotNumber: currentSlot });
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
      checkpointReceivedCallback.mockClear();
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
      expect(checkpointReceivedCallback).not.toHaveBeenCalled();
      expect(blockReceivedCallback).not.toHaveBeenCalled();
    });

    it('validation failure penalizes peer with correct severity', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: currentSlot });
      // Create checkpoint signed by wrong signer
      const wrongSigner = Secp256k1Signer.random();
      const proposal = await makeCheckpointProposal({ signer: wrongSigner, checkpointHeader });

      await service.handleGossipedCheckpointProposal(proposal.toBuffer(), 'msg-1', mockPeerId);

      // Verify peer was penalized with MidToleranceError
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockPeerId, PeerErrorSeverity.MidToleranceError);

      // Verify message was rejected
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith('msg-1', MOCK_PEER_ID, TopicValidatorResult.Reject);
    });
  });
});

/** Mock type for tx objects used in block txs validation tests. */
interface MockTx {
  getTxHash(): { toString(): string };
}

/**
 * Minimal attestation pool interface for tests that only need getBlockProposal.
 * This allows creating partial mocks without implementing the full AttestationPool interface.
 */
interface MockAttestationPoolForTests {
  getBlockProposal(id: string): Promise<{ txHashes: { toString(): string }[] } | undefined>;
}

/** Options for creating a test LibP2PService instance. */
interface CreateTestLibP2PServiceOptions {
  peerManager: MockProxy<PeerManagerInterface>;
  node: MockProxy<PubSubLibp2p>;
  archiver?: MockProxy<L2BlockSource & ContractDataSource>;
  attestationPool?: AttestationPool;
  txPool?: MockProxy<TxPoolV2>;
  epochCache?: MockProxy<EpochCacheInterface>;
}

/**
 * Test subclass of LibP2PService that exposes protected methods for testing
 * and allows construction with mocked dependencies.
 */
class TestLibP2PService extends LibP2PService {
  /** Mocked validateRequestedTx for testing. */
  public validateRequestedTxMock: jest.Mock;

  /** Stub validator returned by createRequestedTxValidator. */
  private stubValidator: TxValidator;

  /** Exposed epoch cache for test configuration. */
  public testEpochCache: MockProxy<EpochCacheInterface>;

  constructor(
    node: PubSubLibp2p,
    peerManager: PeerManagerInterface,
    mempools: MemPools,
    archiver: L2BlockSource & ContractDataSource,
    epochCache: MockProxy<EpochCacheInterface>,
    telemetry: TelemetryClient,
    logger: Logger,
  ) {
    // Create minimal mock dependencies for the base class
    const mockConfig: P2PConfig = {
      ...getDefaultConfig(p2pConfigMappings),
      seenMessageCacheSize: 1000,
      debugP2PInstrumentMessages: false,
      disableTransactions: false,
      l1ChainId: 1,
      rollupVersion: 1,
      l1Contracts: {
        rollupAddress: EthAddress.random(),
      },
    };

    const mockPeerDiscoveryService = mock<PeerDiscoveryService>();
    const mockReqResp = mock<ReqRespInterface>();
    const mockWorldStateSynchronizer = mock<ServerWorldStateSynchronizer>();
    const mockProofVerifier = mock<ClientProtocolCircuitVerifier>({
      verifyProof: () => Promise.resolve({ valid: true, durationMs: 1000, totalDurationMs: 1000 }),
    });

    super(
      P2PClientType.Full,
      mockConfig,
      node,
      mockPeerDiscoveryService,
      mockReqResp,
      peerManager,
      mempools,
      archiver,
      epochCache,
      mockProofVerifier,
      mockWorldStateSynchronizer,
      telemetry,
      logger,
    );

    this.testEpochCache = epochCache;
    this.validateRequestedTxMock = jest.fn(() => Promise.resolve());
    this.stubValidator = {
      validateTx: () => Promise.resolve({ result: 'valid' as const }),
    };
  }

  /** Exposes the protected handleNewGossipMessage for testing. */
  public override handleNewGossipMessage(msg: Message, msgId: string, source: PeerId): Promise<void> {
    return super.handleNewGossipMessage(msg, msgId, source);
  }

  /** Exposes the protected validateRequestedBlock for testing. */
  public override validateRequestedBlock(requested: Fr, response: L2Block, peerId: PeerId): Promise<boolean> {
    return super.validateRequestedBlock(requested, response, peerId);
  }

  /** Exposes the protected validateRequestedBlockTxs for testing. */
  public override validateRequestedBlockTxs(
    request: BlockTxsRequest,
    response: BlockTxsResponse,
    peerId: PeerId,
  ): Promise<boolean> {
    return super.validateRequestedBlockTxs(request, response, peerId);
  }

  /** Exposes the protected processBlockFromPeer for testing. */
  public override processBlockFromPeer(payloadData: Buffer, msgId: string, source: PeerId): Promise<void> {
    return super.processBlockFromPeer(payloadData, msgId, source);
  }

  /** Exposes the protected handleGossipedCheckpointProposal for testing. */
  public override handleGossipedCheckpointProposal(payloadData: Buffer, msgId: string, source: PeerId): Promise<void> {
    return super.handleGossipedCheckpointProposal(payloadData, msgId, source);
  }

  /** Override to use the mock. */
  protected override async validateRequestedTx(
    tx: Tx,
    peerId: PeerId,
    _txValidator: TxValidator,
    _requested?: Set<`0x${string}`>,
  ): Promise<void> {
    await this.validateRequestedTxMock(tx, peerId);
  }

  /** Override to return the stub validator. */
  protected override createRequestedTxValidator(): TxValidator {
    return this.stubValidator;
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
  } = options;

  const mempools = mock<MemPools>();
  mempools.attestationPool = attestationPool;
  mempools.txPool = txPool;

  const telemetry = getTelemetryClient();
  const logger = createLogger('p2p:test');

  return new TestLibP2PService(node, peerManager, mempools, archiver, epochCache, telemetry, logger);
}

/** Creates a TestLibP2PService instance with real attestation pool and mocked tx pool. */
function createTestLibP2PServiceWithPools(
  mockPeerManager: MockProxy<PeerManagerInterface>,
  reportMessageValidationResultSpy: jest.Mock,
  attestationPool: AttestationPool,
  mockTxPool: MockProxy<TxPoolV2>,
  mockEpochCache: MockProxy<EpochCacheInterface>,
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
  });
}
