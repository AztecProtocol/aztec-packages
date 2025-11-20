import { createLogger } from '@aztec/foundation/log';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Message, PeerId } from '@libp2p/interface';
import { TopicValidatorResult } from '@libp2p/interface';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { PeerManagerInterface } from '../peer-manager/interface.js';
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
});
