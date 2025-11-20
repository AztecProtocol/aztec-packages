import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { L2Block } from '@aztec/stdlib/block';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import type { TxValidator } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Message, PeerId } from '@libp2p/interface';
import { TopicValidatorResult } from '@libp2p/interface';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { PeerManagerInterface } from '../peer-manager/interface.js';
import { BitVector } from '../reqresp/protocols/block_txs/bitvector.js';
import type { BlockTxsRequest, BlockTxsResponse } from '../reqresp/protocols/block_txs/block_txs_reqresp.js';
import { LibP2PService } from './libp2p_service.js';

describe('LibP2PService', () => {
  const MOCK_PEER_ID = 'peer-id-123';

  let libp2pService: any;
  let mockPeerManager: MockProxy<PeerManagerInterface>;
  let mockNode: any;
  let mockSource: MockProxy<PeerId>;
  let reportMessageValidationResultSpy: jest.Mock;

  beforeEach(() => {
    // Create mocks
    mockPeerManager = mock<PeerManagerInterface>();
    mockSource = mock<PeerId>({
      toString: () => MOCK_PEER_ID,
    });

    // Mock the node with gossipsub service
    reportMessageValidationResultSpy = jest.fn();
    mockNode = {
      services: {
        pubsub: {
          reportMessageValidationResult: reportMessageValidationResultSpy,
        },
      },
    };

    // Create a minimal LibP2PService instance for testing
    // We're creating a partial instance since we only need to test handleNewGossipMessage
    libp2pService = Object.create(LibP2PService.prototype);
    libp2pService.peerManager = mockPeerManager;
    libp2pService.node = mockNode;
    libp2pService.logger = createLogger('p2p:test');
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
        from: mockSource,
        signature: new Uint8Array(),
        key: new Uint8Array(),
      };

      const msgId = 'test-msg-id';

      // Call handleNewGossipMessage
      await libp2pService.handleNewGossipMessage(malformedMessage, msgId, mockSource);

      // Verify that reportMessageValidationResult was called with Reject
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith(msgId, MOCK_PEER_ID, TopicValidatorResult.Reject);

      // Verify that the peer was penalized
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockSource, PeerErrorSeverity.LowToleranceError);
    });

    it('should penalize peer when P2PMessage deserialization throws with empty data', async () => {
      // Create a message with empty data
      const emptyMessage: Message = {
        type: 'signed' as const,
        topic: 'test-topic',
        data: new Uint8Array([]), // Empty data
        sequenceNumber: BigInt(1),
        from: mockSource,
        signature: new Uint8Array(),
        key: new Uint8Array(),
      };

      const msgId = 'test-msg-id-2';

      // Call handleNewGossipMessage
      await libp2pService.handleNewGossipMessage(emptyMessage, msgId, mockSource);

      // Verify that reportMessageValidationResult was called with Reject
      expect(reportMessageValidationResultSpy).toHaveBeenCalledWith(msgId, MOCK_PEER_ID, TopicValidatorResult.Reject);

      // Verify that the peer was penalized
      expect(mockPeerManager.penalizePeer).toHaveBeenCalledWith(mockSource, PeerErrorSeverity.LowToleranceError);
    });
  });

  describe('validateRequestedBlock', () => {
    let service: any;
    type GetBlockFn = (n: number) => Promise<L2Block | undefined>;
    let archiver: { getBlock: jest.MockedFunction<GetBlockFn> };
    let peerManager: MockProxy<PeerManagerInterface>;
    let peerId: PeerId;

    beforeEach(() => {
      archiver = { getBlock: jest.fn<GetBlockFn>() as jest.MockedFunction<GetBlockFn> };
      peerManager = mock<PeerManagerInterface>();
      peerId = mock<PeerId>({
        toString: () => 'peer-id',
      });

      service = Object.create(LibP2PService.prototype);
      service.archiver = archiver;
      service.peerManager = peerManager;
      service.logger = createLogger('p2p:test');
      service.tracer = getTelemetryClient().getTracer('p2p:test');
    });

    it('should return false and penalize on number mismatch', async () => {
      const requested = new Fr(10);
      const resp = await L2Block.random(9);

      const ok = await service.validateRequestedBlock(requested, resp, peerId);

      expect(ok).toBe(false);
      expect(peerManager.penalizePeer).toHaveBeenCalledWith(peerId, PeerErrorSeverity.LowToleranceError);
    });

    it('should return false (no penalty) when numbers match and no local block', async () => {
      archiver.getBlock.mockResolvedValue(undefined);
      const requested = new Fr(10);
      const resp = await L2Block.random(10);

      const ok = await service.validateRequestedBlock(requested, resp, peerId);

      expect(ok).toBe(false);
      expect(peerManager.penalizePeer).not.toHaveBeenCalled();
    });

    it('should return true when numbers match and hashes match', async () => {
      const requested = new Fr(10);
      const local = await L2Block.random(10);

      const resp = L2Block.fromBuffer(local.toBuffer());
      archiver.getBlock.mockResolvedValue(local);

      const ok = await service.validateRequestedBlock(requested, resp, peerId);

      expect(ok).toBe(true);
      expect(peerManager.penalizePeer).not.toHaveBeenCalled();
    });

    it('should return false and penalize when hashes mismatch', async () => {
      const requested = new Fr(10);
      const local = await L2Block.random(10);

      const resp = L2Block.fromBuffer(local.toBuffer());
      resp.header.globalVariables.coinbase = EthAddress.random();
      archiver.getBlock.mockResolvedValue(local);

      const ok = await service.validateRequestedBlock(requested, resp, peerId);

      expect(ok).toBe(false);
      expect(peerManager.penalizePeer).toHaveBeenCalledWith(peerId, PeerErrorSeverity.MidToleranceError);
    });

    it('should return false on archiver error', async () => {
      archiver.getBlock.mockRejectedValue(new Error('boom'));
      const requested = new Fr(10);
      const resp = await L2Block.random(10);

      const ok = await service.validateRequestedBlock(requested, resp, peerId);

      expect(ok).toBe(false);
    });
  });

  describe('validateRequestedBlockTxs', () => {
    let service: any;
    let peerManager: MockProxy<PeerManagerInterface>;
    let peerId: PeerId;

    beforeEach(() => {
      peerManager = mock<PeerManagerInterface>();
      peerId = mock<PeerId>({
        toString: () => 'peer-id',
      });

      service = Object.create(LibP2PService.prototype);
      service.peerManager = peerManager;
      service.logger = createLogger('p2p:test');
      // Avoid heavy tx validations, track calls
      service.validateRequestedTx = jest.fn(() => Promise.resolve());
      service.mempools = {};
      service.tracer = getTelemetryClient().getTracer('p2p:test');

      const stubValidator: TxValidator = {
        validateTx: () => Promise.resolve({ result: 'valid' as const }),
      };
      service.createRequestedTxValidator = () => stubValidator;
    });

    function makeRequest(blockHash: Fr, length: number, indices: number[]): BlockTxsRequest {
      return {
        blockHash,
        txIndices: BitVector.init(length, indices),
      } as BlockTxsRequest;
    }

    function makeResponse(blockHash: Fr, length: number, indices: number[], txHashes: string[]): BlockTxsResponse {
      const txs = txHashes.map(h => ({
        getTxHash: () => ({ toString: () => h }),
      })) as any[];
      return {
        blockHash,
        txs,
        txIndices: BitVector.init(length, indices),
      } as BlockTxsResponse;
    }

    function setProposalTxHashes(
      svc: {
        mempools: {
          attestationPool?: {
            getBlockProposal: (id: string) => Promise<{ txHashes: { toString(): string }[] } | undefined>;
          };
        };
      },
      txHashes: string[],
    ) {
      svc.mempools = {
        attestationPool: {
          getBlockProposal: (_: string) =>
            Promise.resolve({
              txHashes: txHashes.map(s => ({ toString: () => s })),
            }),
        },
      };
    }

    it('should penalize and reject on block hash mismatch', async () => {
      const reqHash = Fr.random();
      const otherHash = Fr.random();
      const request = makeRequest(reqHash, 5, [0, 2]);
      const response = makeResponse(otherHash, 5, [0, 2], []);

      const ok = await service.validateRequestedBlockTxs(request, response, peerId);
      expect(ok).toBe(false);
      expect(peerManager.penalizePeer).toHaveBeenCalledWith(peerId, PeerErrorSeverity.MidToleranceError);
    });

    it('should penalize and reject on bitvector length mismatch', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 5, [0, 2]);
      const response = makeResponse(hash, 4, [0, 2], []);

      const ok = await service.validateRequestedBlockTxs(request, response, peerId);
      expect(ok).toBe(false);
      expect(peerManager.penalizePeer).toHaveBeenCalledWith(peerId, PeerErrorSeverity.MidToleranceError);
    });

    it('should penalize and reject on duplicate txs', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 5, [0, 2, 3]);
      const response = makeResponse(hash, 5, [0, 2, 3], ['0xaaa', '0xaaa']); // duplicate

      const ok = await service.validateRequestedBlockTxs(request, response, peerId);
      expect(ok).toBe(false);
      expect(peerManager.penalizePeer).toHaveBeenCalledWith(peerId, PeerErrorSeverity.MidToleranceError);
    });

    it('should penalize and reject when returned txs exceed requested ∩ available', async () => {
      const hash = Fr.random();
      // requested indices [0,2], available [0] -> maxReturnable 1, but return 2
      const request = makeRequest(hash, 3, [0, 2]);
      const response = makeResponse(hash, 3, [0], ['0x1', '0x2']);

      const ok = await service.validateRequestedBlockTxs(request, response, peerId);
      expect(ok).toBe(false);
      expect(peerManager.penalizePeer).toHaveBeenCalledWith(peerId, PeerErrorSeverity.MidToleranceError);
    });

    it('should penalize and reject when proposal exists and a tx is not part of requested indices of proposal', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 5, [0, 2, 4]); // requested 0,2,4
      const response = makeResponse(hash, 5, [0, 2, 4], ['0xgood0', '0xbad']); // one bad

      setProposalTxHashes(service, ['0xgood0', '0xgood2', '0xgood4', '0xother', '0xother2']);

      const ok = await service.validateRequestedBlockTxs(request, response, peerId);
      expect(ok).toBe(false);
      expect(peerManager.penalizePeer).toHaveBeenCalledWith(peerId, PeerErrorSeverity.LowToleranceError);
    });

    it('should penalize and reject when proposal exists and a tx is from an unrequested index', async () => {
      const hash = Fr.random();
      // Requested indices [0,2,4]; response advertises availability for [0,2,4]
      const request = makeRequest(hash, 5, [0]);
      // Return a tx that exists in the proposal but at an unrequested index (1)
      const response = makeResponse(hash, 5, [0], ['0xother1']);

      setProposalTxHashes(service, ['0xgood0', '0xother1', '0xgood2', '0xother3', '0xgood4']);

      const ok = await service.validateRequestedBlockTxs(request, response, peerId);
      expect(ok).toBe(false);
      expect(peerManager.penalizePeer).toHaveBeenCalledWith(peerId, PeerErrorSeverity.LowToleranceError);
    });

    it('should accept when shapes match, count matches, and order matches proposal/requested indices', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 5, [0, 2, 4]); // requested 0,2,4
      const response = makeResponse(hash, 5, [0, 2, 4], ['0xgood0', '0xgood2', '0xgood4']); // all and in order

      setProposalTxHashes(service, ['0xgood0', '0xother1', '0xgood2', '0xother3', '0xgood4']);

      const ok = await service.validateRequestedBlockTxs(request, response, peerId);
      expect(ok).toBe(true);
      expect(service.validateRequestedTx).toHaveBeenCalledTimes(3);
    });

    it('should accept partial subset when proposal exists and order matches requested indices', async () => {
      const hash = Fr.random();
      // Request indices [0,2,4] but only return a subset [0,4]
      const request = makeRequest(hash, 5, [0, 2, 4]);
      const response = makeResponse(hash, 5, [0, 2, 4], ['0xgood0', '0xgood4']); // partial, ordered 0 < 4

      setProposalTxHashes(service, ['0xgood0', '0xother1', '0xgood2', '0xother3', '0xgood4']);

      const ok = await service.validateRequestedBlockTxs(request, response, peerId);
      expect(ok).toBe(true);
      expect(service.validateRequestedTx).toHaveBeenCalledTimes(2);
      expect(peerManager.penalizePeer).not.toHaveBeenCalled();
    });

    it('should accept when requested ∩ available is non-empty but zero txs are returned', async () => {
      const hash = Fr.random();
      // requested [0,2], available [0,2] -> intersection size 2, but return 0 txs
      const request = makeRequest(hash, 5, [0, 2]);
      const response = makeResponse(hash, 5, [0, 2], []); // empty response.txs

      setProposalTxHashes(service, ['0xgood0', '0xother1', '0xgood2', '0xother3', '0xother4']);

      const ok = await service.validateRequestedBlockTxs(request, response, peerId);
      expect(ok).toBe(true);
      expect(service.validateRequestedTx).toHaveBeenCalledTimes(0);
      expect(peerManager.penalizePeer).not.toHaveBeenCalled();
    });

    it('penalizes and rejects when requested ∩ available is empty but response returns txs', async () => {
      const hash = Fr.random();
      // requested [1], available [] -> intersection 0, but non-empty txs returned
      const request = makeRequest(hash, 3, [1]);
      const response = makeResponse(hash, 3, [], ['0xsome']);

      const ok = await service.validateRequestedBlockTxs(request, response, peerId);
      expect(ok).toBe(false);
      expect(peerManager.penalizePeer).toHaveBeenCalledWith(peerId, PeerErrorSeverity.MidToleranceError);
    });

    it('should penalize and reject when order does not match proposal/requested indices', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 5, [0, 2, 4]); // requested 0,2,4
      // Out of order relative to indices [0,2,4]
      const response = makeResponse(hash, 5, [0, 2, 4], ['0xgood4', '0xgood0', '0xgood2']);

      setProposalTxHashes(service, ['0xgood0', '0xother1', '0xgood2', '0xother3', '0xgood4']);

      const ok = await service.validateRequestedBlockTxs(request, response, peerId);
      expect(ok).toBe(false);
      expect(peerManager.penalizePeer).toHaveBeenCalledWith(peerId, PeerErrorSeverity.LowToleranceError);
    });

    it('should penalize and reject when partial subset is unordered relative to requested indices', async () => {
      const hash = Fr.random();
      const request = makeRequest(hash, 5, [0, 2, 4]); // requested 0,2,4
      // Return only a subset but swap order (4 before 0)
      const response = makeResponse(hash, 5, [0, 2, 4], ['0xgood4', '0xgood0']);

      setProposalTxHashes(service, ['0xgood0', '0xother1', '0xgood2', '0xother3', '0xgood4']);

      const ok = await service.validateRequestedBlockTxs(request, response, peerId);
      expect(ok).toBe(false);
      expect(peerManager.penalizePeer).toHaveBeenCalledWith(peerId, PeerErrorSeverity.LowToleranceError);
    });

    it('should reject without penalizing when proposal is missing', async () => {
      const hash = Fr.random();
      // Simple valid shape that should pass pre-checks
      const request = makeRequest(hash, 3, [0, 2]);
      const response = makeResponse(hash, 3, [0, 2], ['0xgood0']);

      // No proposal available
      service.mempools = {};

      const ok = await service.validateRequestedBlockTxs(request, response, peerId);
      expect(ok).toBe(false);
      expect(peerManager.penalizePeer).not.toHaveBeenCalled();
    });
  });
});
