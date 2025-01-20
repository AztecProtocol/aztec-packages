import { sleep } from '@aztec/foundation/sleep';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type PeerId, type Stream } from '@libp2p/interface';
import { createSecp256k1PeerId } from '@libp2p/peer-id-factory';
import { type MockProxy, mock } from 'jest-mock-extended';

import { ConnectionSampler, type RandomSampler } from './connection_sampler.js';

describe('ConnectionSampler', () => {
  let sampler: ConnectionSampler;
  let mockLibp2p: any;
  let peers: PeerId[];
  let mockRandomSampler: MockProxy<RandomSampler>;

  beforeEach(async () => {
    // Create some test peer IDs
    peers = [await createSecp256k1PeerId(), await createSecp256k1PeerId(), await createSecp256k1PeerId()];

    // Mock libp2p
    mockLibp2p = {
      getPeers: jest.fn().mockReturnValue(peers),
      dialProtocol: jest.fn(),
    };

    mockRandomSampler = mock<RandomSampler>();
    mockRandomSampler.random.mockReturnValue(0);

    sampler = new ConnectionSampler(mockLibp2p, 500, mockRandomSampler);
  });

  afterEach(async () => {
    await sampler.stop();
  });

  describe('getPeer', () => {
    it('returns a random peer from the list', () => {
      const peer = sampler.getPeer();
      expect(peers).toContain(peer);
    });

    it('attempts to find peer with no active connections', async () => {
      // Setup: Create active connection to first two peers
      const mockStream1: Partial<Stream> = { id: '1', close: jest.fn() } as Partial<Stream>;
      const mockStream2: Partial<Stream> = { id: '2', close: jest.fn() } as Partial<Stream>;

      mockLibp2p.dialProtocol.mockResolvedValueOnce(mockStream1).mockResolvedValueOnce(mockStream2);

      await sampler.dialProtocol(peers[0], 'test');
      await sampler.dialProtocol(peers[1], 'test');

      // Force Math.random to return values that would select the first two peers
      mockRandomSampler.random.mockReturnValueOnce(0).mockReturnValueOnce(1).mockReturnValueOnce(2);

      const selectedPeer = sampler.getPeer();
      // Should select peers[2] as it has no active connections
      expect(selectedPeer).toBe(peers[2]);
    });
  });

  describe('connection management', () => {
    it('correctly tracks active connections', async () => {
      const mockStream: Partial<Stream> = {
        id: '1',
        close: jest.fn().mockImplementation(() => Promise.resolve()),
      } as Partial<Stream>;

      mockLibp2p.dialProtocol.mockResolvedValue(mockStream);

      // Open connection
      const stream = await sampler.dialProtocol(peers[0], 'test');
      expect(stream).toBe(mockStream);

      // Verify internal state
      expect((sampler as any).activeConnectionsCount.get(peers[0])).toBe(1);
      expect((sampler as any).streams.has('1')).toBe(true);

      // Close connection
      await sampler.close('1');

      // Verify cleanup
      expect((sampler as any).activeConnectionsCount.get(peers[0])).toBe(0);
      expect((sampler as any).streams.has('1')).toBe(false);
      expect(mockStream.close).toHaveBeenCalled();
    });

    it('handles multiple connections to same peer', async () => {
      const mockStream1: Partial<Stream> = {
        id: '1',
        close: jest.fn(),
      } as Partial<Stream>;
      const mockStream2: Partial<Stream> = {
        id: '2',
        close: jest.fn(),
      } as Partial<Stream>;

      mockLibp2p.dialProtocol.mockResolvedValueOnce(mockStream1).mockResolvedValueOnce(mockStream2);

      await sampler.dialProtocol(peers[0], 'test');
      await sampler.dialProtocol(peers[0], 'test');

      expect((sampler as any).activeConnectionsCount.get(peers[0])).toBe(2);

      await sampler.close('1');
      expect((sampler as any).activeConnectionsCount.get(peers[0])).toBe(1);

      await sampler.close('2');
      expect((sampler as any).activeConnectionsCount.get(peers[0])).toBe(0);
    });

    it('handles errors during connection close', async () => {
      const mockStream: Partial<Stream> = {
        id: '1',
        close: jest.fn().mockImplementation(() => Promise.reject(new Error('Failed to close'))),
      } as Partial<Stream>;

      mockLibp2p.dialProtocol.mockResolvedValue(mockStream);

      await sampler.dialProtocol(peers[0], 'test');
      await sampler.close('1');

      // Should still clean up internal state even if close fails
      expect((sampler as any).activeConnectionsCount.get(peers[0])).toBe(0);
      expect((sampler as any).streams.has('1')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('cleans up stale connections', async () => {
      const mockStream: Partial<Stream> = {
        id: '1',
        close: jest.fn(),
      } as Partial<Stream>;

      mockLibp2p.dialProtocol.mockResolvedValue(mockStream);
      await sampler.dialProtocol(peers[0], 'test');

      // Manually set activeConnectionsCount to 0 to simulate lost accounting
      (sampler as any).activeConnectionsCount.set(peers[0], 0);

      // Trigger cleanup
      await sleep(600);

      expect(mockStream.close).toHaveBeenCalled();
      expect((sampler as any).streams.has('1')).toBe(false);
    });

    it('properly cleans up on stop', async () => {
      const mockStream1: Partial<Stream> = {
        id: '1',
        close: jest.fn(),
      } as Partial<Stream>;
      const mockStream2: Partial<Stream> = {
        id: '2',
        close: jest.fn(),
      } as Partial<Stream>;

      mockLibp2p.dialProtocol.mockResolvedValueOnce(mockStream1).mockResolvedValueOnce(mockStream2);

      await sampler.dialProtocol(peers[0], 'test');
      await sampler.dialProtocol(peers[1], 'test');

      await sampler.stop();

      expect(mockStream1.close).toHaveBeenCalled();
      expect(mockStream2.close).toHaveBeenCalled();
      expect((sampler as any).streams.size).toBe(0);
    });
  });
});
