import { PeerErrorSeverity } from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { Attributes, getTelemetryClient } from '@aztec/telemetry-client';

import { type ENR, SignableENR } from '@chainsafe/enr';
import { jest } from '@jest/globals';
import { createSecp256k1PeerId } from '@libp2p/peer-id-factory';
import { multiaddr } from '@multiformats/multiaddr';

import { type P2PConfig, getP2PDefaultConfig } from '../../config.js';
import { ReqRespSubProtocol } from '../reqresp/interface.js';
import { GoodByeReason } from '../reqresp/protocols/index.js';
import { PeerEvent } from '../types.js';
import { PeerManager } from './peer_manager.js';
import { PeerScoring } from './peer_scoring.js';

describe('PeerManager', () => {
  const mockLibP2PNode: any = {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    getPeers: jest.fn().mockReturnValue([]),
    getDialQueue: jest.fn().mockReturnValue([]),
    getConnections: jest.fn().mockReturnValue([]),
    peerStore: {
      merge: jest.fn(),
    },
    dial: jest.fn(),
    hangUp: jest.fn(),
  };

  const mockPeerDiscoveryService: any = {
    on: jest.fn(),
    off: jest.fn(),
    isBootstrapPeer: jest.fn().mockReturnValue(false),
    runRandomNodesQuery: jest.fn(),
  };

  const mockReqResp: any = {
    sendRequestToPeer: jest.fn(),
  };

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
      if (event === PeerEvent.DISCOVERED) {
        discoveredPeerCallback = callback;
      }
    });

    peerScoring = new PeerScoring({} as P2PConfig);
    peerManager = new PeerManager(
      mockLibP2PNode,
      mockPeerDiscoveryService,
      getP2PDefaultConfig(),
      getTelemetryClient(),
      createLogger('test'),
      peerScoring,
      mockReqResp,
    );
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

    it('should handle heartbeat', () => {
      // Mock some connected peers
      const connections = [{ remotePeer: 'peer1' }, { remotePeer: 'peer2' }];
      mockLibP2PNode.getConnections.mockReturnValue(connections);

      peerManager.heartbeat();

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
      peerManager.heartbeat();

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
      peerManager.heartbeat();

      await sleep(100);

      // Verify that hangUp and a goodbye was sent for both unhealthy peers
      expect(mockLibP2PNode.hangUp).toHaveBeenCalledWith(bannedPeerId);
      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledWith(
        bannedPeerId,
        ReqRespSubProtocol.GOODBYE,
        Buffer.from([GoodByeReason.BANNED]),
      );

      expect(mockLibP2PNode.hangUp).toHaveBeenCalledWith(disconnectPeerId);
      expect(mockReqResp.sendRequestToPeer).toHaveBeenCalledWith(
        disconnectPeerId,
        ReqRespSubProtocol.GOODBYE,
        Buffer.from([GoodByeReason.DISCONNECTED]),
      );

      // Verify that hangUp was not called for the healthy peer
      expect(mockLibP2PNode.hangUp).not.toHaveBeenCalledWith(healthyPeerId);

      // Verify hangUp was called exactly twice (once for each unhealthy peer)
      expect(mockLibP2PNode.hangUp).toHaveBeenCalledTimes(2);
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

  describe('goodbye metrics', () => {
    it('should record metrics when receiving goodbye messages', async () => {
      const peerId = await createSecp256k1PeerId();

      // Get reference to the counter's add function
      const goodbyeReceivedMetric = jest.spyOn((peerManager as any).metrics.receivedGoodbyes, 'add');

      // Test receiving goodbye for different reasons
      peerManager.goodbyeReceived(peerId, GoodByeReason.BANNED);
      expect(goodbyeReceivedMetric).toHaveBeenCalledWith(1, { [Attributes.P2P_GOODBYE_REASON]: 'banned' });

      peerManager.goodbyeReceived(peerId, GoodByeReason.DISCONNECTED);
      expect(goodbyeReceivedMetric).toHaveBeenCalledWith(1, { [Attributes.P2P_GOODBYE_REASON]: 'disconnected' });

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
      peerManager.heartbeat();
      expect(goodbyeSentMetric).toHaveBeenCalledWith(1, { [Attributes.P2P_GOODBYE_REASON]: 'banned' });

      // Reset mocks
      mockLibP2PNode.getPeers.mockReturnValue([{ remotePeer: peerId }]);

      // Test shutdown scenario
      await peerManager.stop();
      expect(goodbyeSentMetric).toHaveBeenCalledWith(1, { [Attributes.P2P_GOODBYE_REASON]: 'shutdown' });
    });
  });
});
