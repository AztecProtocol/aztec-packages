import { sleep } from '@aztec/foundation/sleep';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { PeerId, Stream } from '@libp2p/interface';
import { createSecp256k1PeerId } from '@libp2p/peer-id-factory';
import { type MockProxy, mock } from 'jest-mock-extended';

import { ConnectionSampler, type RandomSampler } from './connection_sampler.js';

describe('ConnectionSampler', () => {
  let sampler: ConnectionSampler;
  let mockLibp2p: any;
  let peers: PeerId[];
  let excluding: Map<string, boolean>;
  let mockRandomSampler: MockProxy<RandomSampler>;

  beforeEach(async () => {
    // Create some test peer IDs
    peers = [await createSecp256k1PeerId(), await createSecp256k1PeerId(), await createSecp256k1PeerId()];

    // Mock libp2p
    mockLibp2p = {
      getPeers: jest.fn().mockImplementation(() => [...peers]),
      dialProtocol: jest.fn(),
    };

    mockRandomSampler = mock<RandomSampler>();
    mockRandomSampler.random.mockReturnValue(0);

    sampler = new ConnectionSampler(mockLibp2p, mockRandomSampler, undefined, { cleanupIntervalMs: 500 });
    excluding = new Map();
  });

  afterEach(async () => {
    await sampler.stop();
  });

  const makeStream = (id: string) =>
    ({
      id,
      status: 'open',
      metadata: {},
      close: jest.fn().mockImplementation(() => Promise.resolve()),
    }) as Partial<Stream>;

  describe('getPeer', () => {
    it('returns a random peer from the list', () => {
      const peer = sampler.getPeer(excluding);
      expect(peers).toContain(peer);
    });

    it('returns undefined if no peers are available', () => {
      mockLibp2p.getPeers.mockReturnValue([]);
      const peer = sampler.getPeer(excluding);
      expect(peer).toBeUndefined();
    });

    it('attempts to find peer with no active connections', async () => {
      // Setup: Create active connection to first two peers
      const mockStream1 = makeStream('1');
      const mockStream2 = makeStream('2');

      mockLibp2p.dialProtocol.mockResolvedValueOnce(mockStream1).mockResolvedValueOnce(mockStream2);

      await sampler.dialProtocol(peers[0], 'test');
      await sampler.dialProtocol(peers[1], 'test');

      // Force Math.random to return values that would select the first two peers
      mockRandomSampler.random.mockReturnValueOnce(0).mockReturnValueOnce(1).mockReturnValueOnce(2);

      const selectedPeer = sampler.getPeer(excluding);
      // Should select peers[2] as it has no active connections
      expect(selectedPeer).toBe(peers[2]);
    });

    it('should not sample a peer that is being excluded', () => {
      // Sample the excluded peer multiple times, but it should not be selected
      mockRandomSampler.random
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(1);

      excluding.set(peers[0].toString(), true);
      const selectedPeer = sampler.getPeer(excluding);
      expect(selectedPeer).toBe(peers[1]);
    });
  });

  describe('connection management', () => {
    it('correctly tracks active connections', async () => {
      const mockStream = makeStream('1');

      mockLibp2p.dialProtocol.mockResolvedValue(mockStream);

      // Open connection
      const stream = await sampler.dialProtocol(peers[0], 'test');
      expect(stream).toBe(mockStream);

      // Verify internal state
      expect((sampler as any).activeConnectionsCount.get(peers[0])).toBe(1);
      expect((sampler as any).streams.has(mockStream)).toBe(true);

      // Close connection
      await sampler.close(stream);

      // Verify cleanup
      expect((sampler as any).activeConnectionsCount.get(peers[0])).toBe(0);
      expect((sampler as any).streams.has(mockStream)).toBe(false);
      expect(mockStream.close).toHaveBeenCalled();
    });

    it('handles multiple connections to same peer', async () => {
      const mockStream1 = makeStream('1');
      const mockStream2 = makeStream('2');

      mockLibp2p.dialProtocol.mockResolvedValueOnce(mockStream1).mockResolvedValueOnce(mockStream2);

      await sampler.dialProtocol(peers[0], 'test');
      await sampler.dialProtocol(peers[0], 'test');

      expect((sampler as any).activeConnectionsCount.get(peers[0])).toBe(2);

      await sampler.close(mockStream1 as Stream);
      expect((sampler as any).activeConnectionsCount.get(peers[0])).toBe(1);

      await sampler.close(mockStream2 as Stream);
      expect((sampler as any).activeConnectionsCount.get(peers[0])).toBe(0);
    });

    it('handles errors during connection close', async () => {
      const mockStream = makeStream('1');

      mockLibp2p.dialProtocol.mockResolvedValue(mockStream);

      await sampler.dialProtocol(peers[0], 'test');
      await sampler.close(mockStream as Stream);

      // Should still clean up internal state even if close fails
      expect((sampler as any).activeConnectionsCount.get(peers[0])).toBe(0);
      expect((sampler as any).streams.has(mockStream)).toBe(false);
    });

    it('does not accidentally close a stream for another peer', async () => {
      // We make two streams for different peers but with the same id
      const mockStream1 = makeStream('1');
      const mockStream2 = makeStream('1');

      mockLibp2p.dialProtocol.mockResolvedValueOnce(mockStream1).mockResolvedValueOnce(mockStream2);

      const stream1 = await sampler.dialProtocol(peers[0], 'test');
      const stream2 = await sampler.dialProtocol(peers[1], 'test');
      expect(stream1).toBe(mockStream1);
      expect(stream2).toBe(mockStream2);

      await sampler.close(stream1 as Stream);
      expect(mockStream1.close).toHaveBeenCalled();
      expect(mockStream2.close).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('cleans up stale connections', async () => {
      const mockStream = makeStream('1');

      mockLibp2p.dialProtocol.mockResolvedValue(mockStream);
      await sampler.dialProtocol(peers[0], 'test');

      // Manually set activeConnectionsCount to 0 to simulate lost accounting
      (sampler as any).activeConnectionsCount.set(peers[0], 0);

      // Trigger cleanup
      await sleep(600);

      expect(mockStream.close).toHaveBeenCalled();
      expect((sampler as any).streams.has(mockStream)).toBe(false);
    });

    it('properly cleans up on stop', async () => {
      const mockStream1 = makeStream('1');
      const mockStream2 = makeStream('2');

      mockLibp2p.dialProtocol.mockResolvedValueOnce(mockStream1).mockResolvedValueOnce(mockStream2);

      await sampler.dialProtocol(peers[0], 'test');
      await sampler.dialProtocol(peers[1], 'test');

      await sampler.stop();

      expect(mockStream1.close).toHaveBeenCalled();
      expect(mockStream2.close).toHaveBeenCalled();
      expect((sampler as any).streams.size).toBe(0);
    });
  });

  describe('samplePeersBatch', () => {
    beforeEach(async () => {
      // Create test peers
      peers = await Promise.all(new Array(5).fill(0).map(() => createSecp256k1PeerId()));

      // Mock libp2p
      mockLibp2p = {
        getPeers: jest.fn().mockImplementation(() => [...peers]),
        dialProtocol: jest.fn(),
      };

      mockRandomSampler = mock<RandomSampler>();
      mockRandomSampler.random.mockReturnValue(0);
      sampler = new ConnectionSampler(mockLibp2p, mockRandomSampler, undefined, { cleanupIntervalMs: 1000 });
    });

    it('should only return samples as many peers as available', () => {
      const sampledPeers = sampler.samplePeersBatch(100);

      expect(sampledPeers).toHaveLength(peers.length);
    });

    it('prioritizes peers without active connections', () => {
      mockRandomSampler.random
        // Will pick the peers with active connections
        .mockReturnValueOnce(3)
        .mockReturnValueOnce(3)
        .mockReturnValue(0);

      // Set up some peers with active connections
      sampler['activeConnectionsCount'].set(peers[3], 1);
      sampler['activeConnectionsCount'].set(peers[4], 2);

      // Sample 3 peers
      const sampledPeers = sampler.samplePeersBatch(3);

      // Should get peers[0,1,2] first as they have no connections
      expect(sampledPeers).toHaveLength(3);
      expect(sampledPeers).toContain(peers[0]);
      expect(sampledPeers).toContain(peers[1]);
      expect(sampledPeers).toContain(peers[2]);
      // Should not include peers with active connections when enough peers without connections exist
      expect(sampledPeers).not.toContain(peers[3]);
      expect(sampledPeers).not.toContain(peers[4]);
    });

    it('falls back to peers with connections when needed', () => {
      // Set up most peers with active connections
      sampler['activeConnectionsCount'].set(peers[1], 1);
      sampler['activeConnectionsCount'].set(peers[2], 1);
      sampler['activeConnectionsCount'].set(peers[3], 1);
      sampler['activeConnectionsCount'].set(peers[4], 1);

      mockRandomSampler.random.mockReturnValue(0); // Always pick first available peer

      const sampledPeers = sampler.samplePeersBatch(3);

      // Should get peers[0] first (no connections), then some with connections
      expect(sampledPeers).toHaveLength(3);
      expect(sampledPeers[0]).toBe(peers[0]); // The only peer without connections
      expect(sampledPeers.slice(1)).toEqual(expect.arrayContaining([peers[1]])); // Should include some peers with connections
    });

    it('handles case when all peers have active connections', () => {
      // Set up all peers with active connections
      peers.forEach(peer => sampler['activeConnectionsCount'].set(peer, 1));

      mockRandomSampler.random.mockReturnValue(0); // Always pick first available peer

      const sampledPeers = sampler.samplePeersBatch(3);

      expect(sampledPeers).toHaveLength(3);
      // The last one will be picked first, then the first one, then the second one
      expect(sampledPeers).toEqual(expect.arrayContaining([peers[4], peers[0], peers[1]]));
    });

    it('handles case when fewer peers available than requested', () => {
      // Mock libp2p to return fewer peers
      const fewPeers = peers.slice(0, 2);
      mockLibp2p.getPeers.mockReturnValue(fewPeers);

      const sampledPeers = sampler.samplePeersBatch(5);

      expect(sampledPeers).toHaveLength(2); // Should only return available peers
      expect(sampledPeers).toEqual(expect.arrayContaining(fewPeers));
    });

    it('handles case when no peers available', () => {
      mockLibp2p.getPeers.mockReturnValue([]);

      const sampledPeers = sampler.samplePeersBatch(3);

      expect(sampledPeers).toHaveLength(0);
    });

    it('returns exactly the number of peers requested when available', () => {
      const sampledPeers = sampler.samplePeersBatch(3);

      expect(sampledPeers).toHaveLength(3);
      // Verify all peers are unique
      const uniquePeers = new Set(sampledPeers);
      expect(uniquePeers.size).toBe(3);
    });
  });
});
