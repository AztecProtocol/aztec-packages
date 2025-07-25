import type { EpochCache } from '@aztec/epoch-cache';
import { Buffer32 } from '@aztec/foundation/buffer';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer, randomBytes } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import type {
  WorldStateSyncStatus,
  WorldStateSynchronizer,
  WorldStateSynchronizerStatus,
} from '@aztec/stdlib/interfaces/server';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { Attributes, getTelemetryClient } from '@aztec/telemetry-client';

import { type ENR, SignableENR } from '@chainsafe/enr';
import { jest } from '@jest/globals';
import type { Libp2p, PeerId } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';
import { createSecp256k1PeerId } from '@libp2p/peer-id-factory';
import { multiaddr } from '@multiformats/multiaddr';
import { type MockProxy, mock } from 'jest-mock-extended';
import { generatePrivateKey } from 'viem/accounts';

import { type P2PConfig, getP2PDefaultConfig } from '../../config.js';
import { PeerEvent } from '../../types/index.js';
import { ReqRespSubProtocol } from '../reqresp/interface.js';
import { AuthRequest, AuthResponse, GoodByeReason, StatusMessage } from '../reqresp/protocols/index.js';
import { ReqResp } from '../reqresp/reqresp.js';
import { ReqRespStatus } from '../reqresp/status.js';
import { PeerManager } from './peer_manager.js';
import { PeerScoring } from './peer_scoring.js';

describe('PeerManager', () => {
  const mockLibP2PNode: any = createMockLibP2PNode();

  const mockPeerDiscoveryService: any = {
    on: jest.fn(),
    off: jest.fn(),
    isBootstrapPeer: jest.fn().mockReturnValue(false),
    runRandomNodesQuery: jest.fn(),
  };

  const mockEpochCache = mock<EpochCache>();
  mockEpochCache.getRegisteredValidators.mockResolvedValue([]);

  let mockReqResp: MockProxy<ReqResp>;

  let peerScoring: PeerScoring;

  let peerManager: PeerManager;
  // The function provided to the discovery servive callback will be run here
  let discoveredPeerCallback: (enr: ENR) => Promise<void>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock returns
    mockLibP2PNode.getPeers.mockReturnValue([]);
    mockLibP2PNode.getDialQueue.mockReturnValue([]);
    mockLibP2PNode.getConnections.mockReturnValue([]);

    // Capture the callback for discovered peers
    mockPeerDiscoveryService.on.mockImplementation((event: string, callback: any) => {
      if ((event as PeerEvent) === PeerEvent.DISCOVERED) {
        discoveredPeerCallback = callback;
      }
    });

    mockReqResp = mock<ReqResp>();

    peerManager = createMockPeerManager('test', mockLibP2PNode, 3);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const createMockENR = async () => {
    const peerId = await createSecp256k1PeerId();
    const enr = SignableENR.createFromPeerId(peerId);
    // Add required TCP multiaddr
    enr.setLocationMultiaddr(multiaddr('/ip4/127.0.0.1/tcp/8000'));
    return enr.toENR();
  };

  describe('peer management', () => {
    it('should return connected peers', async () => {
      const peerId = await createSecp256k1PeerId();
      mockLibP2PNode.getPeers.mockReturnValue([peerId]);

      const peers = peerManager.getPeers();
      expect(peers).toHaveLength(1);
      expect(peers[0].id).toBe(peerId.toString());
      expect(peers[0].status).toBe('connected');
    });

    it('should return peers in dial queue', async () => {
      const peerId = await createSecp256k1PeerId();
      mockLibP2PNode.getDialQueue.mockReturnValue([
        {
          peerId,
          status: 'queued',
          multiaddrs: [multiaddr('/ip4/127.0.0.1/tcp/8000')],
        },
      ]);

      const peers = peerManager.getPeers(true);
      expect(peers).toHaveLength(1);
      expect(peers[0].id).toBe(peerId.toString());
      expect(peers[0].status).toBe('dialing');
    });

    it('should penalize peers', async () => {
      const peerId = await createSecp256k1PeerId();

      peerManager.penalizePeer(peerId, PeerErrorSeverity.LowToleranceError);

      const score = peerManager.getPeerScore(peerId.toString());
      expect(score).toBeLessThan(0);
    });

    it('should handle heartbeat', async () => {
      // Mock some connected peers
      const connections = [{ remotePeer: 'peer1' }, { remotePeer: 'peer2' }];
      mockLibP2PNode.getConnections.mockReturnValue(connections);

      await peerManager.heartbeat();

      // Verify that discover was called
      expect(mockPeerDiscoveryService.runRandomNodesQuery).toHaveBeenCalled();
    });

    it('should send goodbye to peers on shutdown', async () => {
      const peerId = await createSecp256k1PeerId();
      const peerId2 = await createSecp256k1PeerId();
      mockLibP2PNode.getPeers.mockReturnValue([peerId, peerId2]);

      const goodbyeAndDisconnectPeerSpy = jest.spyOn(peerManager as any, 'goodbyeAndDisconnectPeer');

      await peerManager.stop();

      // Both peers were sent goodbyes on shutdown
      expect(goodbyeAndDisconnectPeerSpy).toHaveBeenCalledWith(peerId, GoodByeReason.SHUTDOWN);
      expect(goodbyeAndDisconnectPeerSpy).toHaveBeenCalledWith(peerId2, GoodByeReason.SHUTDOWN);
    });
  });

  describe('peer timeout functionality', () => {
    it('should attempt to dial a discovered peer', async () => {
      const enr = await createMockENR();
      await discoveredPeerCallback(enr);

      expect(mockLibP2PNode.dial).toHaveBeenCalled();
    });

    it('should report peer count metric', async () => {
      const recordPeerCountSpy = jest.spyOn((peerManager as any).metrics, 'recordPeerCount');
      const peerId = await createSecp256k1PeerId();

      mockLibP2PNode.getConnections.mockReturnValue([{ remotePeer: peerId }]);

      await (peerManager as any).discover();

      await sleep(100);

      expect(recordPeerCountSpy).toHaveBeenCalledWith(1);
    });

    it('should retry failed dials up to MAX_DIAL_ATTEMPTS', async () => {
      const enr = await createMockENR();
      mockLibP2PNode.dial.mockRejectedValue(new Error('Connection failed'));

      // First attempt - adds it to the cache
      await discoveredPeerCallback(enr);
      expect(mockLibP2PNode.dial).toHaveBeenCalledTimes(1);

      // dial peer happens asynchronously, so we need to wait
      await sleep(100);

      // Second attempt
      await (peerManager as any).discover();
      expect(mockLibP2PNode.dial).toHaveBeenCalledTimes(2);

      // dial peer happens asynchronously, so we need to wait
      await sleep(100);

      // Third attempt
      await (peerManager as any).discover();
      expect(mockLibP2PNode.dial).toHaveBeenCalledTimes(3);

      // dial peer happens asynchronously, so we need to wait
      await sleep(100);

      // After the third attempt, the peer should be removed from
      // the cache, and placed in timeout
      await discoveredPeerCallback(enr);
      expect(mockLibP2PNode.dial).toHaveBeenCalledTimes(3);
    });

    const triggerTimeout = async (enr: ENR) => {
      // First attempt - adds it to the cache
      await discoveredPeerCallback(enr);
      await sleep(100);
      // Second attempt - on heartbeat
      await (peerManager as any).discover();
      await sleep(100);
      // Third attempt - on heartbeat
      await (peerManager as any).discover();
    };

    it('should timeout a peer after max dial attempts and ignore it for the timeout period', async () => {
      const enr = await createMockENR();
      mockLibP2PNode.dial.mockRejectedValue(new Error('Connection failed'));

      // Fail three times to trigger timeout
      await triggerTimeout(enr);

      expect(mockLibP2PNode.dial).toHaveBeenCalledTimes(3);

      jest.useFakeTimers();

      // Try to dial immediately after timeout - should be ignored
      mockLibP2PNode.dial.mockClear();
      await discoveredPeerCallback(enr);
      expect(mockLibP2PNode.dial).not.toHaveBeenCalled();

      // Advance time by 4 minutes (less than timeout period)
      jest.advanceTimersByTime(4 * 60 * 1000);
      await discoveredPeerCallback(enr);
      expect(mockLibP2PNode.dial).not.toHaveBeenCalled();

      // Advance time to complete 5 minute timeout
      jest.advanceTimersByTime(1 * 60 * 1000);
      await discoveredPeerCallback(enr);
      expect(mockLibP2PNode.dial).toHaveBeenCalled();
    });

    it('should cleanup expired timeouts during heartbeat', async () => {
      const enr = await createMockENR();
      mockLibP2PNode.dial.mockRejectedValue(new Error('Connection failed'));

      // Fail three times to trigger timeout
      await triggerTimeout(enr);

      // Verify peer is timed out
      mockLibP2PNode.dial.mockClear();
      await discoveredPeerCallback(enr);
      expect(mockLibP2PNode.dial).not.toHaveBeenCalled();

      jest.useFakeTimers();

      // Advance time past timeout period and trigger heartbeat
      jest.advanceTimersByTime(5 * 60 * 1000);
      await peerManager.heartbeat();

      // Peer should now be allowed to dial again
      await discoveredPeerCallback(enr);
      expect(mockLibP2PNode.dial).toHaveBeenCalled();
    });

    it('should include timed out peers in getPeers when includePending is true', async () => {
      const enr = await createMockENR();
      const peerId = await enr.peerId();
      mockLibP2PNode.dial.mockRejectedValue(new Error('Connection failed'));

      // Fail three times to trigger timeout
      for (let i = 0; i < 3; i++) {
        await discoveredPeerCallback(enr);
      }

      const peers = peerManager.getPeers(true);
      const timedOutPeer = peers.find(p => p.id === peerId.toString());
      expect(timedOutPeer).toBeDefined();
      expect(timedOutPeer?.status).toBe('cached');
    });

    it('should handle multiple peer discoveries and timeouts', async () => {
      const enr1 = await createMockENR();
      const enr2 = await createMockENR();
      const peerId1 = await enr1.peerId();
      const peerId2 = await enr2.peerId();
      mockLibP2PNode.dial.mockRejectedValue(new Error('Connection failed'));

      // Fail peer1 three times
      for (let i = 0; i < 3; i++) {
        await discoveredPeerCallback(enr1);
      }

      // Try peer2 once
      await discoveredPeerCallback(enr2);
      await sleep(100);

      const peers = peerManager.getPeers(true);
      expect(peers).toHaveLength(2);

      const peer1 = peers.find(p => p.id === peerId1.toString());
      const peer2 = peers.find(p => p.id === peerId2.toString());

      expect(peer1?.status).toBe('cached'); // timed out
      expect(peer2?.status).toBe('cached'); // in dial queue
    });

    it('should disconnect from unhealthy peers during heartbeat', async () => {
      // Create two peers with different states
      const bannedPeerId = await createSecp256k1PeerId();
      const disconnectPeerId = await createSecp256k1PeerId();
      const healthyPeerId = await createSecp256k1PeerId();

      // Mock the connections to return our test peers
      mockLibP2PNode.getConnections.mockReturnValue([
        { remotePeer: bannedPeerId },
        { remotePeer: disconnectPeerId },
        { remotePeer: healthyPeerId },
      ]);

      // Set the peer scores to trigger different states
      peerManager.penalizePeer(bannedPeerId, PeerErrorSeverity.LowToleranceError); // Will set score below -100
      peerManager.penalizePeer(bannedPeerId, PeerErrorSeverity.LowToleranceError); // Additional penalty to ensure banned state
      peerManager.penalizePeer(bannedPeerId, PeerErrorSeverity.HighToleranceError);

      peerManager.penalizePeer(disconnectPeerId, PeerErrorSeverity.LowToleranceError); // Will set score between -100 and -50
      peerManager.penalizePeer(disconnectPeerId, PeerErrorSeverity.HighToleranceError);

      // Trigger heartbeat which should call pruneUnhealthyPeers
      await peerManager.heartbeat();
      // We need second heartbeat to actually disconnect  - the first one just marks peers to disconnect
      await peerManager.heartbeat();

      await sleep(100);

      // Verify that hangUp and a goodbye was sent for both unhealthy peers
      expect(mockLibP2PNode.hangUp).toHaveBeenCalledWith(peerIdFromString(bannedPeerId.toString()));
      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledWith(
        bannedPeerId,
        ReqRespSubProtocol.GOODBYE,
        Buffer.from([GoodByeReason.BANNED]),
        1000,
      );

      expect(mockLibP2PNode.hangUp).toHaveBeenCalledWith(peerIdFromString(disconnectPeerId.toString()));
      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledWith(
        disconnectPeerId,
        ReqRespSubProtocol.GOODBYE,
        Buffer.from([GoodByeReason.LOW_SCORE]),
        1000,
      );

      // Verify that hangUp was not called for the healthy peer
      expect(mockLibP2PNode.hangUp).not.toHaveBeenCalledWith(peerIdFromString(healthyPeerId.toString()));

      // Verify hangUp was called exactly twice (once for each unhealthy peer)
      expect(mockLibP2PNode.hangUp).toHaveBeenCalledTimes(2);
    });

    it('should disconnect from low scoring peers above the max peer limit during heartbeat', async () => {
      // Set the maxPeerCount to 3 in the mock peer manager
      peerManager = createMockPeerManager('test', mockLibP2PNode, 3);

      const peerId1 = await createSecp256k1PeerId();
      const peerId2 = await createSecp256k1PeerId();
      const peerId3 = await createSecp256k1PeerId();
      const lowScoringPeerId1 = await createSecp256k1PeerId();
      const lowScoringPeerId2 = await createSecp256k1PeerId();

      // Mock the connections to return our test peers
      mockLibP2PNode.getConnections.mockReturnValue([
        { remotePeer: lowScoringPeerId1 },
        { remotePeer: peerId1 },
        { remotePeer: peerId2 },
        { remotePeer: lowScoringPeerId2 },
        { remotePeer: peerId3 },
      ]);

      // Set the peer scores to trigger different states
      peerManager.penalizePeer(lowScoringPeerId1, PeerErrorSeverity.MidToleranceError);
      peerManager.penalizePeer(lowScoringPeerId2, PeerErrorSeverity.HighToleranceError);
      peerManager.penalizePeer(lowScoringPeerId2, PeerErrorSeverity.HighToleranceError);
      peerManager.penalizePeer(peerId1, PeerErrorSeverity.HighToleranceError);

      // Trigger heartbeat which should remove low scoring peers to satisfy max peer limit
      await peerManager.heartbeat();
      // We need second heartbeat to actually disconnect  - the first one just marks peers to disconnect
      await peerManager.heartbeat();

      await sleep(100);

      // Verify that hangUp and a goodbye was sent for low scoring peers to satisfy max peer limit
      expect(mockLibP2PNode.hangUp).toHaveBeenCalledWith(peerIdFromString(lowScoringPeerId1.toString()));
      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledWith(
        lowScoringPeerId1,
        ReqRespSubProtocol.GOODBYE,
        Buffer.from([GoodByeReason.MAX_PEERS]),
        1000,
      );

      expect(mockLibP2PNode.hangUp).toHaveBeenCalledWith(peerIdFromString(lowScoringPeerId2.toString()));
      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledWith(
        lowScoringPeerId2,
        ReqRespSubProtocol.GOODBYE,
        Buffer.from([GoodByeReason.MAX_PEERS]),
        1000,
      );

      // Verify that hangUp was not called for connected peers
      expect(mockLibP2PNode.hangUp).not.toHaveBeenCalledWith(peerIdFromString(peerId1.toString()));
      expect(mockLibP2PNode.hangUp).not.toHaveBeenCalledWith(peerIdFromString(peerId2.toString()));
      expect(mockLibP2PNode.hangUp).not.toHaveBeenCalledWith(peerIdFromString(peerId3.toString()));

      // Verify hangUp was called exactly twice (once for each purged peer to satisfy max peer limit)
      expect(mockLibP2PNode.hangUp).toHaveBeenCalledTimes(2);
    });

    it('should disconnect from duplicate peers during heartbeat', async () => {
      // Create a peer that will have duplicate connections
      const peerId = await createSecp256k1PeerId();

      // Create mock connections with different timestamps to simulate connections opened at different times
      const oldestConnection = {
        remotePeer: peerId,
        timeline: { open: 1000 },
        close: jest.fn(),
      };
      const duplicateConnection1 = {
        remotePeer: peerId,
        timeline: { open: 2000 },
        close: jest.fn(),
      };
      const duplicateConnection2 = {
        remotePeer: peerId,
        timeline: { open: 3000 },
        close: jest.fn(),
      };
      mockLibP2PNode.getConnections.mockReturnValue([duplicateConnection1, oldestConnection, duplicateConnection2]);

      // Trigger heartbeat which should call pruneDuplicatePeers
      await peerManager.heartbeat();

      await sleep(100);

      // Verify that the duplicate connections were closed
      expect(duplicateConnection1.close).toHaveBeenCalled();
      expect(duplicateConnection2.close).toHaveBeenCalled();
      // Verify that the oldest connection was not closed
      expect(oldestConnection.close).not.toHaveBeenCalled();
    });

    it('should properly clean up peers on stop', async () => {
      mockLibP2PNode.getPeers.mockReturnValue([await createSecp256k1PeerId(), await createSecp256k1PeerId()]);

      await peerManager.stop();

      expect(mockLibP2PNode.removeEventListener).toHaveBeenCalledWith(PeerEvent.CONNECTED, expect.any(Function));
      expect(mockLibP2PNode.removeEventListener).toHaveBeenCalledWith(PeerEvent.DISCONNECTED, expect.any(Function));
      expect(mockPeerDiscoveryService.off).toHaveBeenCalledWith(PeerEvent.DISCOVERED, expect.any(Function));

      // Verify that goodbyes were sent to all peers
      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledTimes(2);
    });
  });

  describe('trusted peers', () => {
    it('should not prune trusted peers', async () => {
      const peerId = await createSecp256k1PeerId();
      peerManager.addTrustedPeer(peerId);

      // Penalize the peer to give it a low score
      peerManager.penalizePeer(peerId, PeerErrorSeverity.LowToleranceError);
      expect(peerManager.getPeerScore(peerId.toString())).toBeLessThan(0);

      // Mock connections to include the trusted peer
      mockLibP2PNode.getConnections.mockReturnValue([{ remotePeer: peerId }]);

      // Trigger heartbeat which should call pruneUnhealthyPeers
      await peerManager.heartbeat();

      await sleep(100);

      // Verify that hangUp was not called for the trusted peer
      expect(mockLibP2PNode.hangUp).not.toHaveBeenCalled();
    });

    it('should prune untrusted peers and not trusted peers', async () => {
      const untrustedPeerId = await createSecp256k1PeerId();
      const trustedPeerId = await createSecp256k1PeerId();

      peerManager.addTrustedPeer(trustedPeerId);

      // Penalize the untrusted peer to give it a low score
      peerManager.penalizePeer(untrustedPeerId, PeerErrorSeverity.LowToleranceError);
      peerManager.penalizePeer(untrustedPeerId, PeerErrorSeverity.LowToleranceError);

      // Penalize the trusted peer to give it a low score
      peerManager.penalizePeer(trustedPeerId, PeerErrorSeverity.LowToleranceError);
      peerManager.penalizePeer(trustedPeerId, PeerErrorSeverity.LowToleranceError);

      // Mock connections to include both peers
      mockLibP2PNode.getConnections.mockReturnValue([{ remotePeer: untrustedPeerId }, { remotePeer: trustedPeerId }]);

      // Trigger heartbeat which should call pruneUnhealthyPeers
      await peerManager.heartbeat();

      await sleep(100);
      // We need second heartbeat to actually disconnect  - the first one just marks peers to disconnect
      await peerManager.heartbeat();

      // Verify that hangUp was called only for the untrusted peer, not the trusted peer
      expect(mockLibP2PNode.hangUp).toHaveBeenCalledWith(peerIdFromString(untrustedPeerId.toString()));
      expect(mockLibP2PNode.hangUp).not.toHaveBeenCalledWith(peerIdFromString(trustedPeerId.toString()));
      expect(mockLibP2PNode.hangUp).toHaveBeenCalledTimes(1);
    });

    it('should not disconnect trusted peers with low scores', async () => {
      // Create a trusted peer and a regular peer
      const trustedPeerId = await createSecp256k1PeerId();
      const regularPeerId = await createSecp256k1PeerId();

      // Add the trusted peer
      peerManager.addTrustedPeer(trustedPeerId);

      // Mock connections to include both peers
      mockLibP2PNode.getConnections.mockReturnValue([{ remotePeer: trustedPeerId }, { remotePeer: regularPeerId }]);

      // Penalize both peers to give them low scores
      peerManager.penalizePeer(trustedPeerId, PeerErrorSeverity.LowToleranceError);
      peerManager.penalizePeer(trustedPeerId, PeerErrorSeverity.LowToleranceError);
      peerManager.penalizePeer(regularPeerId, PeerErrorSeverity.LowToleranceError);
      peerManager.penalizePeer(regularPeerId, PeerErrorSeverity.LowToleranceError);

      // Trigger heartbeat which should call pruneUnhealthyPeers
      await peerManager.heartbeat();

      await sleep(100);
      // We need second heartbeat to actually disconnect  - the first one just marks peers to disconnect
      await peerManager.heartbeat();

      // Verify that hangUp was called only for the regular peer, not the trusted peer
      expect(mockLibP2PNode.hangUp).toHaveBeenCalledWith(peerIdFromString(regularPeerId.toString()));
      expect(mockLibP2PNode.hangUp).not.toHaveBeenCalledWith(peerIdFromString(trustedPeerId.toString()));
      expect(mockLibP2PNode.hangUp).toHaveBeenCalledTimes(1);
    });

    it('should not remove trusted peers from the cache during pruning', async () => {
      // Create a trusted peer and multiple regular peers
      const trustedPeerId = await createSecp256k1PeerId();

      // Add the trusted peer
      peerManager.addTrustedPeer(trustedPeerId);

      // Create a mock cached peer for the trusted peer
      const trustedEnr = await createMockENR();
      const trustedCachedPeer = {
        peerId: trustedPeerId,
        enr: trustedEnr,
        multiaddrTcp: multiaddr('/ip4/127.0.0.1/tcp/8000'),
        dialAttempts: 0,
        addedUnixMs: Date.now() - 1000, // Added 1 second ago
      };

      // Access the private cachedPeers map using type assertion
      const cachedPeersMap = (peerManager as any).cachedPeers;
      cachedPeersMap.set(trustedPeerId.toString(), trustedCachedPeer);

      // Add many regular peers to the cache to trigger pruning
      for (let i = 0; i < 101; i++) {
        // More than MAX_CACHED_PEERS (100)
        const regularPeerId = await createSecp256k1PeerId();
        const regularEnr = await createMockENR();
        const regularCachedPeer = {
          peerId: regularPeerId,
          enr: regularEnr,
          multiaddrTcp: multiaddr('/ip4/127.0.0.1/tcp/8000'),
          dialAttempts: 0,
          addedUnixMs: Date.now(),
        };
        cachedPeersMap.set(regularPeerId.toString(), regularCachedPeer);
      }

      // Trigger pruning of cached peers
      (peerManager as any).pruneCachedPeers();

      // Verify that the trusted peer is still in the cache
      expect(cachedPeersMap.has(trustedPeerId.toString())).toBe(true);

      // Verify that the cache size is at most MAX_CACHED_PEERS (100)
      expect(cachedPeersMap.size).toBeLessThanOrEqual(100);
    });

    it('should not remove trusted peers from the cache even when all peers are trusted', async () => {
      // Create multiple trusted peers exceeding the MAX_CACHED_PEERS limit
      const trustedPeerIds: PeerId[] = [];
      const cachedPeersMap = (peerManager as any).cachedPeers;

      // Clear the cache first
      cachedPeersMap.clear();

      // Create and add 110 trusted peers (exceeding the MAX_CACHED_PEERS limit of 100)
      for (let i = 0; i < 110; i++) {
        const trustedPeerId = await createSecp256k1PeerId();
        trustedPeerIds.push(trustedPeerId);
        peerManager.addTrustedPeer(trustedPeerId);

        // Create a mock cached peer for each trusted peer
        const trustedEnr = await createMockENR();
        const trustedCachedPeer = {
          peerId: trustedPeerId,
          enr: trustedEnr,
          multiaddrTcp: multiaddr('/ip4/127.0.0.1/tcp/8000'),
          dialAttempts: 0,
          addedUnixMs: Date.now() - i * 100, // Stagger the addition times
        };

        cachedPeersMap.set(trustedPeerId.toString(), trustedCachedPeer);
      }

      // Verify that we have 110 peers in the cache before pruning
      expect(cachedPeersMap.size).toBe(110);

      // Trigger pruning of cached peers
      (peerManager as any).pruneCachedPeers();

      // Verify that all trusted peers are still in the cache (no pruning occurred)
      for (const trustedPeerId of trustedPeerIds) {
        expect(cachedPeersMap.has(trustedPeerId.toString())).toBe(true);
      }

      // Verify that the cache size is still 110 (all trusted peers are kept)
      expect(cachedPeersMap.size).toBe(110);
    });

    it('should return false from isTrustedPeer when trusted peers are not initialized', async () => {
      // Create a new PeerManager instance without initializing trusted peers
      const newPeerManager = createMockPeerManager('test', mockLibP2PNode, 3);

      // Create a peer ID
      const peerId = await createSecp256k1PeerId();

      // Access the private isTrustedPeer method using type assertion
      const isTrustedPeer = (newPeerManager as any).isTrustedPeer.bind(newPeerManager);

      // Verify that isTrustedPeer returns false when trusted peers are not initialized
      expect(isTrustedPeer(peerId)).toBe(false);
    });

    it('should not disconnect trusted peers when max peer count is reached', async () => {
      // Set the maxPeerCount to 3 in the mock peer manager
      peerManager = createMockPeerManager('test', mockLibP2PNode, 3);

      // Create 2 trusted peers and 3 regular peers (total 5 peers, exceeding maxPeerCount of 3)
      const trustedPeerId1 = await createSecp256k1PeerId();
      const trustedPeerId2 = await createSecp256k1PeerId();
      const regularPeerId1 = await createSecp256k1PeerId();
      const regularPeerId2 = await createSecp256k1PeerId();
      const regularPeerId3 = await createSecp256k1PeerId();

      // Add the trusted peers
      peerManager.addTrustedPeer(trustedPeerId1);
      peerManager.addTrustedPeer(trustedPeerId2);

      // Add the regular peers
      mockLibP2PNode.getPeers.mockReturnValue([
        regularPeerId1,
        regularPeerId2,
        regularPeerId3,
        trustedPeerId1,
        trustedPeerId2,
      ]);

      // Give different scores to the regular peers
      peerScoring.updateScore(regularPeerId1.toString(), 100); // Higher score
      peerScoring.updateScore(regularPeerId2.toString(), 50); // Medium score
      // Leave regularPeerId3 with default score (lowest)

      // Penalize the trusted peers to give them a low score
      peerManager.penalizePeer(trustedPeerId1, PeerErrorSeverity.LowToleranceError);
      peerManager.penalizePeer(trustedPeerId2, PeerErrorSeverity.LowToleranceError);

      // Mock connections to include all peers
      mockLibP2PNode.getConnections.mockReturnValue([
        { remotePeer: trustedPeerId1 },
        { remotePeer: trustedPeerId2 },
        { remotePeer: regularPeerId1 },
        { remotePeer: regularPeerId2 },
        { remotePeer: regularPeerId3 },
      ]);

      // Mock the pruneUnhealthyPeers method to return the connections unchanged
      // This ensures prioritizePeers gets the correct connections
      jest.spyOn(peerManager as any, 'pruneUnhealthyPeers').mockImplementation(connections => connections);

      // Mock the pruneDuplicatePeers method to return the connections unchanged
      jest.spyOn(peerManager as any, 'pruneDuplicatePeers').mockImplementation(connections => connections);

      // Trigger heartbeat which should call prioritizePeers
      await peerManager.heartbeat();

      // Wait for async operations to complete
      await sleep(100);
      // We need second heartbeat to actually disconnect  - the first one just marks peers to disconnect
      await peerManager.heartbeat();

      // Verify that hangUp was called for the lowest scoring regular peers
      // Since we have 2 trusted peers and maxPeerCount is 3, we can only keep 1 regular peer
      // So regularPeerId2 and regularPeerId3 should be disconnected
      expect(mockLibP2PNode.hangUp).toHaveBeenCalledWith(peerIdFromString(regularPeerId2.toString()));
      expect(mockLibP2PNode.hangUp).toHaveBeenCalledWith(peerIdFromString(regularPeerId3.toString()));

      // Verify that hangUp was not called for the trusted peers and the highest scoring regular peer
      expect(mockLibP2PNode.hangUp).not.toHaveBeenCalledWith(peerIdFromString(trustedPeerId1.toString()));
      expect(mockLibP2PNode.hangUp).not.toHaveBeenCalledWith(peerIdFromString(trustedPeerId2.toString()));
      expect(mockLibP2PNode.hangUp).not.toHaveBeenCalledWith(peerIdFromString(regularPeerId1.toString()));

      // Verify that goodbye messages were sent to the disconnected peers
      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledWith(
        regularPeerId2,
        ReqRespSubProtocol.GOODBYE,
        Buffer.from([GoodByeReason.MAX_PEERS]),
        1000,
      );
      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledWith(
        regularPeerId3,
        ReqRespSubProtocol.GOODBYE,
        Buffer.from([GoodByeReason.MAX_PEERS]),
        1000,
      );
    });
  });

  describe('private peers', () => {
    it('should not prune private peers with low scores', async () => {
      const privatePeerId = await createSecp256k1PeerId();
      const regularPeerId = await createSecp256k1PeerId();

      peerManager.addPrivatePeer(privatePeerId);

      mockLibP2PNode.getConnections.mockReturnValue([{ remotePeer: privatePeerId }, { remotePeer: regularPeerId }]);

      peerManager.penalizePeer(privatePeerId, PeerErrorSeverity.LowToleranceError);
      peerManager.penalizePeer(privatePeerId, PeerErrorSeverity.LowToleranceError);
      peerManager.penalizePeer(regularPeerId, PeerErrorSeverity.LowToleranceError);
      peerManager.penalizePeer(regularPeerId, PeerErrorSeverity.LowToleranceError);

      await peerManager.heartbeat();

      await sleep(100);
      // We need second heartbeat to actually disconnect  - the first one just marks peers to disconnect
      await peerManager.heartbeat();

      expect(mockLibP2PNode.hangUp).toHaveBeenCalledWith(peerIdFromString(regularPeerId.toString()));
      expect(mockLibP2PNode.hangUp).not.toHaveBeenCalledWith(peerIdFromString(privatePeerId.toString()));
      expect(mockLibP2PNode.hangUp).toHaveBeenCalledTimes(1);
    });

    it('should not remove private peers from the cache during pruning', async () => {
      const privatePeerId = await createSecp256k1PeerId();

      peerManager.addPrivatePeer(privatePeerId);

      const privateEnr = await createMockENR();
      const privateCachedPeer = {
        peerId: privatePeerId,
        enr: privateEnr,
        multiaddrTcp: multiaddr('/ip4/127.0.0.1/tcp/8000'),
        dialAttempts: 0,
        addedUnixMs: Date.now() - 1000,
      };

      const cachedPeersMap = (peerManager as any).cachedPeers;
      cachedPeersMap.set(privatePeerId.toString(), privateCachedPeer);

      for (let i = 0; i < 101; i++) {
        const regularPeerId = await createSecp256k1PeerId();
        const regularEnr = await createMockENR();
        const regularCachedPeer = {
          peerId: regularPeerId,
          enr: regularEnr,
          multiaddrTcp: multiaddr('/ip4/127.0.0.1/tcp/8000'),
          dialAttempts: 0,
          addedUnixMs: Date.now(),
        };
        cachedPeersMap.set(regularPeerId.toString(), regularCachedPeer);
      }

      (peerManager as any).pruneCachedPeers();

      expect(cachedPeersMap.has(privatePeerId.toString())).toBe(true);
      expect(cachedPeersMap.size).toBeLessThanOrEqual(100);
    });

    it('should return false from isPrivatePeer when private peers are not initialized', async () => {
      const newPeerManager = createMockPeerManager('test', mockLibP2PNode, 3);

      const peerId = await createSecp256k1PeerId();

      const isPrivatePeer = (newPeerManager as any).isPrivatePeer.bind(newPeerManager);

      expect(isPrivatePeer(peerId)).toBe(false);
    });

    it('should initialize private peers from config', async () => {
      const peerId = await createSecp256k1PeerId();
      const enr = SignableENR.createFromPeerId(peerId);
      enr.setLocationMultiaddr(multiaddr('/ip4/127.0.0.1/tcp/8000'));

      const newPeerManager = createMockPeerManager('test', mockLibP2PNode, 3, [], [enr]);

      await newPeerManager.initializePeers();

      const isPrivatePeer = (newPeerManager as any).isPrivatePeer.bind(newPeerManager);

      expect(isPrivatePeer(peerId)).toBe(true);
    });

    it('should handle a peer being both trusted and private', async () => {
      const trustedAndPrivatePeerId = await createSecp256k1PeerId();

      peerManager.addTrustedPeer(trustedAndPrivatePeerId);
      peerManager.addPrivatePeer(trustedAndPrivatePeerId);

      mockLibP2PNode.getConnections.mockReturnValue([{ remotePeer: trustedAndPrivatePeerId }]);

      mockLibP2PNode.getPeers.mockReturnValue([trustedAndPrivatePeerId]);

      peerManager.penalizePeer(trustedAndPrivatePeerId, PeerErrorSeverity.LowToleranceError);
      peerManager.penalizePeer(trustedAndPrivatePeerId, PeerErrorSeverity.LowToleranceError);
      await peerManager.heartbeat();

      await sleep(100);

      expect(mockLibP2PNode.hangUp).not.toHaveBeenCalled();

      const peers = peerManager.getPeers();

      expect(peers.length).toBe(1);
      expect(peers[0].id).toBe(trustedAndPrivatePeerId.toString());
    });
  });

  describe('preferred peers', () => {
    it('should not prune preferred peers with low scores', async () => {
      const preferredPeerId = await createSecp256k1PeerId();
      const regularPeerId = await createSecp256k1PeerId();

      peerManager.addPreferredPeer(preferredPeerId);

      mockLibP2PNode.getConnections.mockReturnValue([{ remotePeer: preferredPeerId }, { remotePeer: regularPeerId }]);

      peerManager.penalizePeer(preferredPeerId, PeerErrorSeverity.LowToleranceError);
      peerManager.penalizePeer(preferredPeerId, PeerErrorSeverity.LowToleranceError);
      peerManager.penalizePeer(regularPeerId, PeerErrorSeverity.LowToleranceError);
      peerManager.penalizePeer(regularPeerId, PeerErrorSeverity.LowToleranceError);

      await peerManager.heartbeat();

      await sleep(100);
      // We need second heartbeat to actually disconnect  - the first one just marks peers to disconnect
      await peerManager.heartbeat();

      expect(mockLibP2PNode.hangUp).toHaveBeenCalledWith(peerIdFromString(regularPeerId.toString()));
      expect(mockLibP2PNode.hangUp).not.toHaveBeenCalledWith(peerIdFromString(preferredPeerId.toString()));
      expect(mockLibP2PNode.hangUp).toHaveBeenCalledTimes(1);
    });

    it('should not remove preferred peers from the cache during pruning', async () => {
      const preferredPeerId = await createSecp256k1PeerId();

      peerManager.addPreferredPeer(preferredPeerId);

      const preferredEnr = await createMockENR();
      const preferredCachePeer = {
        peerId: preferredPeerId,
        enr: preferredEnr,
        multiaddrTcp: multiaddr('/ip4/127.0.0.1/tcp/8000'),
        dialAttempts: 0,
        addedUnixMs: Date.now() - 1000,
      };

      const cachedPeersMap = (peerManager as any).cachedPeers;
      cachedPeersMap.set(preferredPeerId.toString(), preferredCachePeer);

      for (let i = 0; i < 101; i++) {
        const regularPeerId = await createSecp256k1PeerId();
        const regularEnr = await createMockENR();
        const regularCachedPeer = {
          peerId: regularPeerId,
          enr: regularEnr,
          multiaddrTcp: multiaddr('/ip4/127.0.0.1/tcp/8000'),
          dialAttempts: 0,
          addedUnixMs: Date.now(),
        };
        cachedPeersMap.set(regularPeerId.toString(), regularCachedPeer);
      }

      (peerManager as any).pruneCachedPeers();

      expect(cachedPeersMap.has(preferredPeerId.toString())).toBe(true);
      expect(cachedPeersMap.size).toBeLessThanOrEqual(100);
    });

    it('should return false from isPreferredPeer when preferred peers are not initialized', async () => {
      const newPeerManager = createMockPeerManager('test', mockLibP2PNode, 3);

      const peerId = await createSecp256k1PeerId();

      const isPreferredPeer = (newPeerManager as any).isPreferredPeer.bind(newPeerManager);

      expect(isPreferredPeer(peerId)).toBe(false);
    });

    it('should initialize preferred peers from config', async () => {
      const peerId = await createSecp256k1PeerId();
      const enr = SignableENR.createFromPeerId(peerId);
      enr.setLocationMultiaddr(multiaddr('/ip4/127.0.0.1/tcp/8000'));

      const newPeerManager = createMockPeerManager('test', mockLibP2PNode, 3, [], [], [enr]);

      await newPeerManager.initializePeers();

      const isPreferredPeer = (newPeerManager as any).isPreferredPeer.bind(newPeerManager);

      expect(isPreferredPeer(peerId)).toBe(true);
    });
  });

  describe('authentication', () => {
    const mockStatusMessage = () => new StatusMessage('Test Version', 4, randomBytes(32).toString('hex'), 2);

    it('should fail to construct with disabled status handshake and validators only', () => {
      expect(() =>
        createMockPeerManager('test', mockLibP2PNode, 3, [], [], [], {
          p2pDisableStatusHandshake: true,
          p2pAllowOnlyValidators: true,
        }),
      ).toThrow();
    });

    it('should accept auth from preferred peer', async () => {
      const peerId = await createSecp256k1PeerId();
      const enr = SignableENR.createFromPeerId(peerId);
      enr.setLocationMultiaddr(multiaddr('/ip4/127.0.0.1/tcp/8000'));

      const protocolVersion = '1.2.3';
      const blockHash = randomBytes(32).toString('hex');

      const newPeerManager = createMockPeerManager(
        'test',
        mockLibP2PNode,
        3,
        [],
        [],
        [enr],
        {},
        protocolVersion,
        blockHash,
      );

      await newPeerManager.initializePeers();

      // We should return a valid status message as this is a preferred peer
      const authRequest = new AuthRequest(mockStatusMessage(), Fr.random());
      await expect(newPeerManager.handleAuthRequestFromPeer(authRequest, peerId)).resolves.not.toThrow();
      const statusMessage = await newPeerManager.handleAuthRequestFromPeer(authRequest, peerId);
      expect(statusMessage.compressedComponentsVersion).toEqual(protocolVersion);
      expect(statusMessage.latestBlockHash).toEqual(blockHash);
    });

    it('should not accept auth from non-preferred peer', async () => {
      const peerId = await createSecp256k1PeerId();
      const enr = SignableENR.createFromPeerId(peerId);
      enr.setLocationMultiaddr(multiaddr('/ip4/127.0.0.1/tcp/8000'));

      const protocolVersion = '1.2.3';
      const blockHash = randomBytes(32).toString('hex');

      const newPeerManager = createMockPeerManager(
        'test',
        mockLibP2PNode,
        3,
        [],
        [],
        [enr],
        {},
        protocolVersion,
        blockHash,
      );

      await newPeerManager.initializePeers();

      const someOtherPeer = await createSecp256k1PeerId();

      // Should reject as this is not a preferred peer
      const authRequest = new AuthRequest(mockStatusMessage(), Fr.random());
      await expect(newPeerManager.handleAuthRequestFromPeer(authRequest, someOtherPeer)).rejects.toThrow();
    });

    it('should not request auth from private peer', async () => {
      const protocolVersion = '1.2.3';
      const blockHash = randomBytes(32).toString('hex');

      const privatePeerId = await createSecp256k1PeerId();
      const privatePeerEnr = SignableENR.createFromPeerId(privatePeerId);
      privatePeerEnr.setLocationMultiaddr(multiaddr('/ip4/127.0.0.1/tcp/8001'));

      const newPeerManager = createMockPeerManager(
        'test',
        mockLibP2PNode,
        3,
        [],
        [privatePeerEnr],
        [],
        { p2pAllowOnlyValidators: true },
        protocolVersion,
        blockHash,
      );

      await newPeerManager.initializePeers();

      mockReqResp.sendRequestToPeer.mockImplementation(
        (_peerId: PeerId, _subProtocol: ReqRespSubProtocol, payload: Buffer, _dialTimeout?: number) => {
          const returnData = {
            status: ReqRespStatus.SUCCESS,
            data: payload, // Reflect the payload back for now
          };
          return Promise.resolve(returnData);
        },
      );

      // Our private peer connects
      const ev = {
        detail: privatePeerId,
      };
      (newPeerManager as any).handleConnectedPeerEvent(ev);

      await sleep(100);

      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledTimes(1);
      expect(mockReqResp.sendRequestToPeer).toHaveBeenLastCalledWith(
        privatePeerId,
        ReqRespSubProtocol.STATUS,
        expect.any(Buffer),
      );

      // The private peer's score should be >= 0 and the peer should be considered authenticated
      expect(newPeerManager.getPeerScore(privatePeerId.toString())).toBeGreaterThanOrEqual(0);

      // should remain authenticated
      await newPeerManager.heartbeat();

      expect(newPeerManager.isAuthenticatedPeer(privatePeerId)).toBe(true);
    });

    it('should not request auth from trusted peer', async () => {
      const protocolVersion = '1.2.3';
      const blockHash = randomBytes(32).toString('hex');

      const trustedPeerId = await createSecp256k1PeerId();
      const trustedPeerEnr = SignableENR.createFromPeerId(trustedPeerId);
      trustedPeerEnr.setLocationMultiaddr(multiaddr('/ip4/127.0.0.1/tcp/8001'));

      const newPeerManager = createMockPeerManager(
        'test',
        mockLibP2PNode,
        3,
        [trustedPeerEnr],
        [],
        [],
        { p2pAllowOnlyValidators: true },
        protocolVersion,
        blockHash,
      );

      await newPeerManager.initializePeers();

      mockReqResp.sendRequestToPeer.mockImplementation(
        (_peerId: PeerId, _subProtocol: ReqRespSubProtocol, payload: Buffer, _dialTimeout?: number) => {
          const returnData = {
            status: ReqRespStatus.SUCCESS,
            data: payload, // Reflect the payload back for now
          };
          return Promise.resolve(returnData);
        },
      );

      // Our private peer connects
      const ev = {
        detail: trustedPeerId,
      };
      (newPeerManager as any).handleConnectedPeerEvent(ev);

      await sleep(100);

      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledTimes(1);
      expect(mockReqResp.sendRequestToPeer).toHaveBeenLastCalledWith(
        trustedPeerId,
        ReqRespSubProtocol.STATUS,
        expect.any(Buffer),
      );

      // The trusted peer's score should be >= 0 and the peer should be considered authenticated
      expect(newPeerManager.getPeerScore(trustedPeerId.toString())).toBeGreaterThanOrEqual(0);

      // should remain authenticated
      await newPeerManager.heartbeat();

      expect(newPeerManager.isAuthenticatedPeer(trustedPeerId)).toBe(true);
    });

    it('should not request auth from preferred peer', async () => {
      const protocolVersion = '1.2.3';
      const blockHash = randomBytes(32).toString('hex');

      const preferredPeerId = await createSecp256k1PeerId();
      const preferredPeerEnr = SignableENR.createFromPeerId(preferredPeerId);
      preferredPeerEnr.setLocationMultiaddr(multiaddr('/ip4/127.0.0.1/tcp/8001'));

      const newPeerManager = createMockPeerManager(
        'test',
        mockLibP2PNode,
        3,
        [],
        [],
        [preferredPeerEnr],
        { p2pAllowOnlyValidators: true },
        protocolVersion,
        blockHash,
      );

      await newPeerManager.initializePeers();

      mockReqResp.sendRequestToPeer.mockImplementation(
        (_peerId: PeerId, _subProtocol: ReqRespSubProtocol, payload: Buffer, _dialTimeout?: number) => {
          const returnData = {
            status: ReqRespStatus.SUCCESS,
            data: payload, // Reflect the payload back for now
          };
          return Promise.resolve(returnData);
        },
      );

      // Our private peer connects
      const ev = {
        detail: preferredPeerId,
      };
      (newPeerManager as any).handleConnectedPeerEvent(ev);

      await sleep(100);

      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledTimes(1);
      expect(mockReqResp.sendRequestToPeer).toHaveBeenLastCalledWith(
        preferredPeerId,
        ReqRespSubProtocol.STATUS,
        expect.any(Buffer),
      );

      // The preferred peer's score should be >= 0 and the peer should be considered authenticated
      expect(newPeerManager.getPeerScore(preferredPeerId.toString())).toBeGreaterThanOrEqual(0);

      // should remain authenticated
      await newPeerManager.heartbeat();

      expect(newPeerManager.isAuthenticatedPeer(preferredPeerId)).toBe(true);
    });

    it('should send auth request', async () => {
      const peerId = await createSecp256k1PeerId();
      const enr = SignableENR.createFromPeerId(peerId);
      enr.setLocationMultiaddr(multiaddr('/ip4/127.0.0.1/tcp/8000'));

      const protocolVersion = '1.2.3';
      const blockHash = randomBytes(32).toString('hex');

      const newPeerManager = createMockPeerManager(
        'test',
        mockLibP2PNode,
        3,
        [],
        [],
        [],
        { p2pAllowOnlyValidators: true },
        protocolVersion,
        blockHash,
      );

      await newPeerManager.initializePeers();

      let receivedAuth: AuthRequest | undefined;

      mockReqResp.sendRequestToPeer.mockImplementation(
        (_peerId: PeerId, _subProtocol: ReqRespSubProtocol, payload: Buffer, _dialTimeout?: number) => {
          receivedAuth = AuthRequest.fromBuffer(payload);
          const returnData = {
            status: ReqRespStatus.FAILURE,
            data: Buffer.alloc(0),
          };
          return Promise.resolve(returnData);
        },
      );

      // Adding a connection should trigger the auth request as we are configured to only allow validators
      const ev = {
        detail: peerId,
      };
      (newPeerManager as any).handleConnectedPeerEvent(ev);

      await sleep(100);

      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledTimes(1);
      expect(mockReqResp.sendRequestToPeer).toHaveBeenLastCalledWith(
        peerId,
        ReqRespSubProtocol.AUTH,
        expect.any(Buffer),
      );
      expect(receivedAuth?.status.compressedComponentsVersion).toEqual(protocolVersion);
      expect(receivedAuth?.status.latestBlockHash).toEqual(blockHash);
    });

    it('should not authenticate peer if auth handshake request fails', async () => {
      const peerId = await createSecp256k1PeerId();
      const enr = SignableENR.createFromPeerId(peerId);
      enr.setLocationMultiaddr(multiaddr('/ip4/127.0.0.1/tcp/8000'));

      const protocolVersion = '1.2.3';
      const blockHash = randomBytes(32).toString('hex');

      const newPeerManager = createMockPeerManager(
        'test',
        mockLibP2PNode,
        3,
        [],
        [],
        [],
        { p2pAllowOnlyValidators: true },
        protocolVersion,
        blockHash,
      );

      await newPeerManager.initializePeers();

      // Mock the auth request to fail
      mockReqResp.sendRequestToPeer.mockImplementation(
        (_peerId: PeerId, _subProtocol: ReqRespSubProtocol, _payload: Buffer, _dialTimeout?: number) => {
          const returnData = {
            status: ReqRespStatus.FAILURE,
            data: Buffer.alloc(0),
          };
          return Promise.resolve(returnData);
        },
      );

      const ev = {
        detail: peerId,
      };
      (newPeerManager as any).handleConnectedPeerEvent(ev);

      await sleep(100);

      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledTimes(1);
      expect(mockReqResp.sendRequestToPeer).toHaveBeenLastCalledWith(
        peerId,
        ReqRespSubProtocol.AUTH,
        expect.any(Buffer),
      );
      expect(newPeerManager.isAuthenticatedPeer(peerId)).toBe(false);

      //For an unauthenticated peer, the peer we should disable gossiping
      expect(newPeerManager.shouldDisableP2PGossip(peerId.toString())).toBeTruthy();
    });

    it('should authenticate peer if auth handshake succeeds', async () => {
      const peerId = await createSecp256k1PeerId();
      const enr = SignableENR.createFromPeerId(peerId);
      enr.setLocationMultiaddr(multiaddr('/ip4/127.0.0.1/tcp/8000'));

      const protocolVersion = '1.2.3';
      const blockHash = randomBytes(32).toString('hex');

      const newPeerManager = createMockPeerManager(
        'test',
        mockLibP2PNode,
        3,
        [],
        [],
        [],
        { p2pAllowOnlyValidators: true },
        protocolVersion,
        blockHash,
      );

      await newPeerManager.initializePeers();

      // create an ethereum private key and sign the challenge using it
      const ethPrivateKey = generatePrivateKey();
      const signer = new Secp256k1Signer(Buffer32.fromString(ethPrivateKey));

      mockEpochCache.getRegisteredValidators.mockResolvedValue([signer.address]);

      let receivedAuth: AuthRequest | undefined;

      // Mock the auth request to return a valid signature
      mockReqResp.sendRequestToPeer.mockImplementation(
        (_peerId: PeerId, _subProtocol: ReqRespSubProtocol, payload: Buffer, _dialTimeout?: number) => {
          receivedAuth = AuthRequest.fromBuffer(payload);
          const payloadToSign = receivedAuth.getPayloadToSign();
          const signature = signer.signMessage(payloadToSign);
          const authResponse = new AuthResponse(receivedAuth.status, signature);
          const returnData = {
            status: ReqRespStatus.SUCCESS,
            data: authResponse.toBuffer(),
          };
          return Promise.resolve(returnData);
        },
      );

      const ev = {
        detail: peerId,
      };
      (newPeerManager as any).handleConnectedPeerEvent(ev);

      await sleep(100);

      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledTimes(1);
      expect(mockReqResp.sendRequestToPeer).toHaveBeenLastCalledWith(
        peerId,
        ReqRespSubProtocol.AUTH,
        expect.any(Buffer),
      );
      expect(receivedAuth?.status.compressedComponentsVersion).toEqual(protocolVersion);
      expect(receivedAuth?.status.latestBlockHash).toEqual(blockHash);
      expect(newPeerManager.isAuthenticatedPeer(peerId)).toBe(true);

      // The peer's score should be >= 0
      expect(newPeerManager.getPeerScore(peerId.toString())).toBeGreaterThanOrEqual(0);

      // should remain authenticated
      await newPeerManager.heartbeat();

      expect(newPeerManager.isAuthenticatedPeer(peerId)).toBe(true);
    });

    it('should fail to authenticate peer if signer address is not a validator', async () => {
      const peerId = await createSecp256k1PeerId();
      const enr = SignableENR.createFromPeerId(peerId);
      enr.setLocationMultiaddr(multiaddr('/ip4/127.0.0.1/tcp/8000'));

      const protocolVersion = '1.2.3';
      const blockHash = randomBytes(32).toString('hex');

      const newPeerManager = createMockPeerManager(
        'test',
        mockLibP2PNode,
        3,
        [],
        [],
        [],
        { p2pAllowOnlyValidators: true },
        protocolVersion,
        blockHash,
      );

      await newPeerManager.initializePeers();

      // create an ethereum private key and sign the challenge using it
      const ethPrivateKey = generatePrivateKey();
      const signer = new Secp256k1Signer(Buffer32.fromString(ethPrivateKey));

      // The signer address is not a validator
      mockEpochCache.getRegisteredValidators.mockResolvedValue(
        times(10, () => new Secp256k1Signer(Buffer32.fromString(generatePrivateKey())).address),
      );

      let receivedAuth: AuthRequest | undefined;

      // Mock returning a valid signature, but it won't be a registered validator
      mockReqResp.sendRequestToPeer.mockImplementation(
        (_peerId: PeerId, _subProtocol: ReqRespSubProtocol, payload: Buffer, _dialTimeout?: number) => {
          receivedAuth = AuthRequest.fromBuffer(payload);
          const payloadToSign = receivedAuth.getPayloadToSign();
          const signature = signer.signMessage(payloadToSign);
          const authResponse = new AuthResponse(receivedAuth.status, signature);
          const returnData = {
            status: ReqRespStatus.SUCCESS,
            data: authResponse.toBuffer(),
          };
          return Promise.resolve(returnData);
        },
      );

      const ev = {
        detail: peerId,
      };
      (newPeerManager as any).handleConnectedPeerEvent(ev);

      await sleep(100);

      // Peer should not be authenticated as it is not registered as a validator
      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledTimes(1);
      expect(mockReqResp.sendRequestToPeer).toHaveBeenLastCalledWith(
        peerId,
        ReqRespSubProtocol.AUTH,
        expect.any(Buffer),
      );
      expect(receivedAuth?.status.compressedComponentsVersion).toEqual(protocolVersion);
      expect(receivedAuth?.status.latestBlockHash).toEqual(blockHash);
      expect(newPeerManager.isAuthenticatedPeer(peerId)).toBe(false);

      //For an unauthenticated peer, the peer we should disable gossiping
      expect(newPeerManager.shouldDisableP2PGossip(peerId.toString())).toBeTruthy();
    });

    it('should remove authentication if peer is no longer a registered validator', async () => {
      const peerId = await createSecp256k1PeerId();
      const enr = SignableENR.createFromPeerId(peerId);
      enr.setLocationMultiaddr(multiaddr('/ip4/127.0.0.1/tcp/8000'));

      const protocolVersion = '1.2.3';
      const blockHash = randomBytes(32).toString('hex');

      const newPeerManager = createMockPeerManager(
        'test',
        mockLibP2PNode,
        3,
        [],
        [],
        [],
        { p2pAllowOnlyValidators: true },
        protocolVersion,
        blockHash,
      );

      await newPeerManager.initializePeers();

      // create an ethereum private key and sign the challenge using it
      const ethPrivateKey = generatePrivateKey();
      const signer = new Secp256k1Signer(Buffer32.fromString(ethPrivateKey));

      mockEpochCache.getRegisteredValidators.mockResolvedValue([signer.address]);

      let receivedAuth: AuthRequest | undefined;

      // Mock returning a valid signature
      mockReqResp.sendRequestToPeer.mockImplementation(
        (_peerId: PeerId, _subProtocol: ReqRespSubProtocol, payload: Buffer, _dialTimeout?: number) => {
          receivedAuth = AuthRequest.fromBuffer(payload);
          const payloadToSign = receivedAuth.getPayloadToSign();
          const signature = signer.signMessage(payloadToSign);
          const authResponse = new AuthResponse(receivedAuth.status, signature);
          const returnData = {
            status: ReqRespStatus.SUCCESS,
            data: authResponse.toBuffer(),
          };
          return Promise.resolve(returnData);
        },
      );

      const ev = {
        detail: peerId,
      };
      (newPeerManager as any).handleConnectedPeerEvent(ev);

      await sleep(100);

      // Should be authenticated
      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledTimes(1);
      expect(mockReqResp.sendRequestToPeer).toHaveBeenLastCalledWith(
        peerId,
        ReqRespSubProtocol.AUTH,
        expect.any(Buffer),
      );
      expect(receivedAuth?.status.compressedComponentsVersion).toEqual(protocolVersion);
      expect(receivedAuth?.status.latestBlockHash).toEqual(blockHash);
      expect(newPeerManager.isAuthenticatedPeer(peerId)).toBe(true);

      // The peer's score should be >= 0
      expect(newPeerManager.getPeerScore(peerId.toString())).toBeGreaterThanOrEqual(0);

      // After the nest heartbeat the peer should no longer be authenticated
      mockEpochCache.getRegisteredValidators.mockResolvedValue(
        times(10, () => new Secp256k1Signer(Buffer32.fromString(generatePrivateKey())).address),
      );

      await newPeerManager.heartbeat();

      expect(newPeerManager.isAuthenticatedPeer(peerId)).toBe(false);

      //For an unauthenticated peer, the peer we should disable gossiping
      expect(newPeerManager.shouldDisableP2PGossip(peerId.toString())).toBeTruthy();
    });

    it('should remove authentication if peer is disconnected', async () => {
      const peerId = await createSecp256k1PeerId();
      const enr = SignableENR.createFromPeerId(peerId);
      enr.setLocationMultiaddr(multiaddr('/ip4/127.0.0.1/tcp/8000'));

      const protocolVersion = '1.2.3';
      const blockHash = randomBytes(32).toString('hex');

      const newPeerManager = createMockPeerManager(
        'test',
        mockLibP2PNode,
        3,
        [],
        [],
        [],
        { p2pAllowOnlyValidators: true },
        protocolVersion,
        blockHash,
      );

      await newPeerManager.initializePeers();

      // create an ethereum private key and sign the challenge using it
      const ethPrivateKey = generatePrivateKey();
      const signer = new Secp256k1Signer(Buffer32.fromString(ethPrivateKey));

      mockEpochCache.getRegisteredValidators.mockResolvedValue([signer.address]);

      let receivedAuth: AuthRequest | undefined;

      // Mock returning a valid signature
      mockReqResp.sendRequestToPeer.mockImplementation(
        (_peerId: PeerId, _subProtocol: ReqRespSubProtocol, payload: Buffer, _dialTimeout?: number) => {
          receivedAuth = AuthRequest.fromBuffer(payload);
          const payloadToSign = receivedAuth.getPayloadToSign();
          const signature = signer.signMessage(payloadToSign);
          const authResponse = new AuthResponse(receivedAuth.status, signature);
          const returnData = {
            status: ReqRespStatus.SUCCESS,
            data: authResponse.toBuffer(),
          };
          return Promise.resolve(returnData);
        },
      );

      const ev = {
        detail: peerId,
      };
      (newPeerManager as any).handleConnectedPeerEvent(ev);

      await sleep(100);

      // Should be authenticated
      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledTimes(1);
      expect(mockReqResp.sendRequestToPeer).toHaveBeenLastCalledWith(
        peerId,
        ReqRespSubProtocol.AUTH,
        expect.any(Buffer),
      );
      expect(receivedAuth?.status.compressedComponentsVersion).toEqual(protocolVersion);
      expect(receivedAuth?.status.latestBlockHash).toEqual(blockHash);
      expect(newPeerManager.isAuthenticatedPeer(peerId)).toBe(true);

      // The peer's score should be >= 0
      expect(newPeerManager.getPeerScore(peerId.toString())).toBeGreaterThanOrEqual(0);

      // Now the peer becomes disconnected
      const ev2 = {
        detail: peerId,
      };
      (newPeerManager as any).handleDisconnectedPeerEvent(ev2);

      // Peer should no longer be authenticated
      expect(newPeerManager.isAuthenticatedPeer(peerId)).toBe(false);

      // Reconnecting should trigger a new auth process
      (newPeerManager as any).handleConnectedPeerEvent(ev);

      await sleep(100);

      // Should be authenticated
      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledTimes(2);
      expect(mockReqResp.sendRequestToPeer).toHaveBeenLastCalledWith(
        peerId,
        ReqRespSubProtocol.AUTH,
        expect.any(Buffer),
      );
      expect(receivedAuth?.status.compressedComponentsVersion).toEqual(protocolVersion);
      expect(receivedAuth?.status.latestBlockHash).toEqual(blockHash);
      expect(newPeerManager.isAuthenticatedPeer(peerId)).toBe(true);
    });

    it('only one peer can authenticate with a given validator key', async () => {
      const peerId = await createSecp256k1PeerId();
      const enr = SignableENR.createFromPeerId(peerId);
      enr.setLocationMultiaddr(multiaddr('/ip4/127.0.0.1/tcp/8000'));

      // This second peer will attempt to use the same validator key
      const peerId2 = await createSecp256k1PeerId();
      const enr2 = SignableENR.createFromPeerId(peerId2);
      enr2.setLocationMultiaddr(multiaddr('/ip4/127.0.0.1/tcp/8001'));

      const protocolVersion = '1.2.3';
      const blockHash = randomBytes(32).toString('hex');

      const newPeerManager = createMockPeerManager(
        'test',
        mockLibP2PNode,
        3,
        [],
        [],
        [],
        { p2pAllowOnlyValidators: true },
        protocolVersion,
        blockHash,
      );

      await newPeerManager.initializePeers();

      // create an ethereum private key and sign the challenge using it
      const ethPrivateKey = generatePrivateKey();
      const signer = new Secp256k1Signer(Buffer32.fromString(ethPrivateKey));

      mockEpochCache.getRegisteredValidators.mockResolvedValue([signer.address]);

      let receivedAuth: AuthRequest | undefined;

      // Mock returning a valid signature
      mockReqResp.sendRequestToPeer.mockImplementation(
        (_peerId: PeerId, _subProtocol: ReqRespSubProtocol, payload: Buffer, _dialTimeout?: number) => {
          receivedAuth = AuthRequest.fromBuffer(payload);
          const payloadToSign = receivedAuth.getPayloadToSign();
          const signature = signer.signMessage(payloadToSign);
          const authResponse = new AuthResponse(receivedAuth.status, signature);
          const returnData = {
            status: ReqRespStatus.SUCCESS,
            data: authResponse.toBuffer(),
          };
          return Promise.resolve(returnData);
        },
      );

      const ev = {
        detail: peerId,
      };
      (newPeerManager as any).handleConnectedPeerEvent(ev);

      await sleep(100);

      // Should be authenticated
      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledTimes(1);
      expect(mockReqResp.sendRequestToPeer).toHaveBeenLastCalledWith(
        peerId,
        ReqRespSubProtocol.AUTH,
        expect.any(Buffer),
      );
      expect(receivedAuth?.status.compressedComponentsVersion).toEqual(protocolVersion);
      expect(receivedAuth?.status.latestBlockHash).toEqual(blockHash);
      expect(newPeerManager.isAuthenticatedPeer(peerId)).toBe(true);

      // Now a second peer will attempt to auth with the same validator key
      const ev2 = {
        detail: peerId2,
      };
      (newPeerManager as any).handleConnectedPeerEvent(ev2);

      await sleep(100);

      // Should not be authenticated as the validator key is already in use
      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledTimes(2);
      expect(mockReqResp.sendRequestToPeer).toHaveBeenLastCalledWith(
        peerId2,
        ReqRespSubProtocol.AUTH,
        expect.any(Buffer),
      );
      expect(receivedAuth?.status.compressedComponentsVersion).toEqual(protocolVersion);
      expect(receivedAuth?.status.latestBlockHash).toEqual(blockHash);
      expect(newPeerManager.isAuthenticatedPeer(peerId2)).toBe(false);

      // Now, both peers disconnect
      (newPeerManager as any).handleDisconnectedPeerEvent(ev);
      (newPeerManager as any).handleDisconnectedPeerEvent(ev2);

      // Now the second peer should be able to connect and auth
      (newPeerManager as any).handleConnectedPeerEvent(ev2);

      await sleep(100);

      // Should not be authenticated as the validator key is already in use
      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledTimes(3);
      expect(mockReqResp.sendRequestToPeer).toHaveBeenLastCalledWith(
        peerId2,
        ReqRespSubProtocol.AUTH,
        expect.any(Buffer),
      );
      expect(receivedAuth?.status.compressedComponentsVersion).toEqual(protocolVersion);
      expect(receivedAuth?.status.latestBlockHash).toEqual(blockHash);
      expect(newPeerManager.isAuthenticatedPeer(peerId2)).toBe(true);
    });
  });

  describe('goodbye metrics', () => {
    it('should record metrics when receiving goodbye messages', async () => {
      const peerId = await createSecp256k1PeerId();

      // Get reference to the counter's add function
      const goodbyeReceivedMetric = jest.spyOn((peerManager as any).metrics.receivedGoodbyes, 'add');

      // Test receiving goodbye for different reasons
      peerManager.goodbyeReceived(peerId, GoodByeReason.BANNED);
      expect(goodbyeReceivedMetric).toHaveBeenCalledWith(1, { [Attributes.P2P_GOODBYE_REASON]: 'banned' });

      peerManager.goodbyeReceived(peerId, GoodByeReason.LOW_SCORE);
      expect(goodbyeReceivedMetric).toHaveBeenCalledWith(1, { [Attributes.P2P_GOODBYE_REASON]: 'low_score' });

      peerManager.goodbyeReceived(peerId, GoodByeReason.SHUTDOWN);
      expect(goodbyeReceivedMetric).toHaveBeenCalledWith(1, { [Attributes.P2P_GOODBYE_REASON]: 'shutdown' });
    });

    it('should record metrics when sending goodbye messages', async () => {
      const peerId = await createSecp256k1PeerId();

      // Get reference to the counter's add function
      const goodbyeSentMetric = jest.spyOn((peerManager as any).metrics.sentGoodbyes, 'add');

      // Mock connections to include our test peer
      mockLibP2PNode.getConnections.mockReturnValue([{ remotePeer: peerId }]);

      // Test sending goodbye for different scenarios

      // Test banned scenario
      peerManager.penalizePeer(peerId, PeerErrorSeverity.LowToleranceError); // Set score below -100
      peerManager.penalizePeer(peerId, PeerErrorSeverity.LowToleranceError);
      peerManager.penalizePeer(peerId, PeerErrorSeverity.HighToleranceError);
      await peerManager.heartbeat();
      expect(goodbyeSentMetric).toHaveBeenCalledWith(1, { [Attributes.P2P_GOODBYE_REASON]: 'banned' });

      // Reset mocks
      mockLibP2PNode.getPeers.mockReturnValue([{ remotePeer: peerId }]);

      // Test shutdown scenario
      await peerManager.stop();
      expect(goodbyeSentMetric).toHaveBeenCalledWith(1, { [Attributes.P2P_GOODBYE_REASON]: 'shutdown' });
    });
  });

  function createMockLibP2PNode(peers?: PeerId[], connections?: any[]): any {
    return {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      getPeers: jest.fn().mockReturnValue(peers),
      getDialQueue: jest.fn().mockReturnValue([]),
      getConnections: jest.fn().mockReturnValue(connections),
      peerStore: { merge: jest.fn() },
      dial: jest.fn().mockImplementation(() => Promise.resolve()),
      hangUp: jest.fn(),
    };
  }

  function createMockPeerManager(
    name: string,
    node: Libp2p,
    maxPeerCount: number,
    trustedPeers?: SignableENR[],
    privatePeers?: SignableENR[],
    preferredPeers?: SignableENR[],
    additionalConfig: Partial<P2PConfig> = {},
    protocolVersion = 'Version 1.2',
    latestBlockHash = '0x1234567890abcdef',
  ): PeerManager {
    const config = {
      ...getP2PDefaultConfig(),
      ...additionalConfig,
      trustedPeers: trustedPeers ? trustedPeers.map(peer => peer.encodeTxt()) : [],
      privatePeers: privatePeers ? privatePeers.map(peer => peer.encodeTxt()) : [],
      preferredPeers: preferredPeers ? preferredPeers.map(peer => peer.encodeTxt()) : [],
      maxPeerCount: maxPeerCount,
    };
    peerScoring = new PeerScoring(config);
    const mockWorldStateSynchronizer = {
      status: () =>
        Promise.resolve({
          syncSummary: {
            latestBlockHash,
            latestBlockNumber: 100,
            finalisedBlockNumber: 90,
            oldestHistoricBlockNumber: 43,
            treesAreSynched: true,
          } as WorldStateSyncStatus,
        } as WorldStateSynchronizerStatus),
    };

    return new PeerManager(
      node,
      mockPeerDiscoveryService,
      config,
      getTelemetryClient(),
      createLogger(name),
      peerScoring,
      mockReqResp,
      mockWorldStateSynchronizer as WorldStateSynchronizer,
      protocolVersion,
      mockEpochCache,
    );
  }
});
