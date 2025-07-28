import { describe, expect, it, jest } from '@jest/globals';
import type { PeerId } from '@libp2p/interface';
import type { Libp2p } from 'libp2p';

import { createSecp256k1PeerId } from '../../../util.js';
import { BatchConnectionSampler } from './batch_connection_sampler.js';
import { ConnectionSampler, type RandomSampler } from './connection_sampler.js';

describe('BatchConnectionSampler', () => {
  const mockRandomSampler = {
    random: jest.fn(),
  } as jest.Mocked<RandomSampler>;

  let peers: PeerId[];
  let libp2p: jest.Mocked<Libp2p>;
  let connectionSampler: ConnectionSampler;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create a set of test peers
    peers = await Promise.all(new Array(5).fill(0).map(() => createSecp256k1PeerId()));

    // Mock libp2p to return our test peers
    libp2p = {
      getPeers: jest.fn().mockImplementation(() => [...peers]),
    } as unknown as jest.Mocked<Libp2p>;

    // Create a real connection sampler with mocked random sampling
    connectionSampler = new ConnectionSampler(libp2p, mockRandomSampler, undefined, { cleanupIntervalMs: 1000 });
  });

  afterEach(async () => {
    await connectionSampler.stop();
  });

  it('initializes with correct number of peers and request distribution', () => {
    // Mock random to return sequential indices
    mockRandomSampler.random.mockImplementation(_ => 0);

    const sampler = new BatchConnectionSampler(connectionSampler, /* batchSize */ 10, /* maxPeers */ 3);

    expect(sampler.activePeerCount).toBe(3);
    expect(sampler.requestsPerBucket).toBe(3); // floor(10/3) = 3
  });

  it('assigns requests to peers deterministically with wraparound', () => {
    // Mock to return first two peers
    mockRandomSampler.random.mockImplementation(() => 0);

    // With 5 requests and 2 peers:
    // floor(5/2) = 2 requests per peer
    // Peer 0: 0,1,4 (gets extra from wraparound)
    // Peer 1: 2,3
    const sampler = new BatchConnectionSampler(connectionSampler, /* batchSize */ 5, /* maxPeers */ 2);
    const assignments = new Array(5).fill(0).map((_, i) => sampler.getPeerForRequest(i));

    // First peer gets first bucket and wraparound
    expect(assignments[0]).toBe(peers[0]); // First bucket
    expect(assignments[1]).toBe(peers[0]); // First bucket
    expect(assignments[4]).toBe(peers[0]); // Wraparound

    // Second peer gets middle bucket
    expect(assignments[2]).toBe(peers[1]);
    expect(assignments[3]).toBe(peers[1]);
  });

  it('handles peer removal and replacement', () => {
    mockRandomSampler.random.mockImplementation(_ => 0);

    // With 4 requests and 2 peers:
    // floor(4/2) = 2 requests per peer
    // Initial distribution:
    // Peer 0: 0,1
    // Peer 1: 2,3
    const sampler = new BatchConnectionSampler(connectionSampler, /* batchSize */ 4, /* maxPeers */ 2);

    const initialPeer = sampler.getPeerForRequest(0);
    expect(initialPeer).toBe(peers[0]);

    // Mock random to return the third peer
    mockRandomSampler.random.mockImplementation(_ => 2);
    sampler.removePeerAndReplace(peers[0]);

    // After replacement:
    // Replacement peer should handle the same bucket
    const newPeer = sampler.getPeerForRequest(0);
    expect(newPeer).toBe(peers[2]);
    expect(sampler.getPeerForRequest(1)).toBe(peers[2]);

    // Other peer's bucket remains unchanged
    expect(sampler.getPeerForRequest(2)).toBe(peers[1]);
    expect(sampler.getPeerForRequest(3)).toBe(peers[1]);
  });

  it('handles peer removal and replacement - no replacement available', () => {
    mockRandomSampler.random.mockImplementation(() => 0);
    const sampler = new BatchConnectionSampler(connectionSampler, /* batchSize */ 4, /* maxPeers */ 2);

    expect(sampler.activePeerCount).toBe(2);
    expect(sampler.getPeerForRequest(0)).toBe(peers[0]);

    // Will sample no peers
    libp2p.getPeers.mockReturnValue([]);

    // Remove peer 0, its requests will be distributed to peer 1
    sampler.removePeerAndReplace(peers[0]);
    // Decrease the number of active peers
    expect(sampler.activePeerCount).toBe(1);

    expect(sampler.getPeerForRequest(0)).toBe(peers[1]);
  });

  it('distributes requests according to documentation example', () => {
    mockRandomSampler.random.mockImplementation(() => 0);

    // Example from doc comment:
    // Peers:    [P1]      [P2]     [P3]
    // Requests: 0,1,2,9 | 3,4,5 | 6,7,8
    const sampler = new BatchConnectionSampler(connectionSampler, /* batchSize */ 10, /* maxPeers */ 3);

    expect(sampler.activePeerCount).toBe(3);
    expect(sampler.requestsPerBucket).toBe(3); // floor(10/3) = 3

    // P1's bucket (0-2) plus wraparound (9)
    expect(sampler.getPeerForRequest(0)).toBe(peers[0]);
    expect(sampler.getPeerForRequest(1)).toBe(peers[0]);
    expect(sampler.getPeerForRequest(2)).toBe(peers[0]);
    expect(sampler.getPeerForRequest(9)).toBe(peers[0]); // Wraparound

    // P2's bucket (3-5)
    expect(sampler.getPeerForRequest(3)).toBe(peers[1]);
    expect(sampler.getPeerForRequest(4)).toBe(peers[1]);
    expect(sampler.getPeerForRequest(5)).toBe(peers[1]);

    // P3's bucket (6-8)
    expect(sampler.getPeerForRequest(6)).toBe(peers[2]);
    expect(sampler.getPeerForRequest(7)).toBe(peers[2]);
    expect(sampler.getPeerForRequest(8)).toBe(peers[2]);
  });

  it('same number of requests per peers', () => {
    mockRandomSampler.random.mockImplementation(() => 0);

    const sampler = new BatchConnectionSampler(connectionSampler, /* batchSize */ 2, /* maxPeers */ 2);
    expect(sampler.requestsPerBucket).toBe(1);
    expect(sampler.activePeerCount).toBe(2);

    expect(sampler.getPeerForRequest(0)).toBe(peers[0]);
    expect(sampler.getPeerForRequest(1)).toBe(peers[1]);
  });

  it('handles edge cases, 0 peers, smaller batch than max peers', () => {
    mockRandomSampler.random.mockImplementation(() => 0);
    libp2p.getPeers.mockReturnValue([]);

    const sampler = new BatchConnectionSampler(connectionSampler, /* batchSize */ 5, /* maxPeers */ 2);
    expect(sampler.activePeerCount).toBe(0);
    expect(sampler.getPeerForRequest(0)).toBeUndefined();

    mockRandomSampler.random.mockImplementation(() => 0);

    libp2p.getPeers.mockImplementation(() => [...peers]);
    const samplerWithMorePeers = new BatchConnectionSampler(connectionSampler, /* batchSize */ 2, /* maxPeers */ 3);
    expect(samplerWithMorePeers.requestsPerBucket).toBe(1); // floor(2/3) = 0
    // First two requests go to first two peers
    expect(samplerWithMorePeers.getPeerForRequest(0)).toBe(peers[0]);
    expect(samplerWithMorePeers.getPeerForRequest(1)).toBe(peers[1]);
  });
});
