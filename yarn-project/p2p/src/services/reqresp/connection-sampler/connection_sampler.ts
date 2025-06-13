import { AbortError, TimeoutError } from '@aztec/foundation/error';
import { createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';

import type { Libp2p, PeerId, Stream } from '@libp2p/interface';

const MAX_SAMPLE_ATTEMPTS = 4;

interface StreamAndPeerId {
  stream: Stream;
  peerId: PeerId;
}

export class RandomSampler {
  random(max: number) {
    return Math.floor(Math.random() * max);
  }
}

/**
 * A class that samples peers from the libp2p node and returns a peer that we don't already have a reqresp connection open to.
 * If we already have a connection open, we try to sample a different peer.
 * We do this MAX_SAMPLE_ATTEMPTS times, if we still don't find a peer we just go for it.
 *
 * @dev Close must always be called on connections, else memory leak
 */
export class ConnectionSampler {
  private readonly logger = createLogger('p2p:reqresp:connection-sampler');
  private cleanupInterval: NodeJS.Timeout;
  private dialAttempts: AbortController[] = [];

  private readonly activeConnectionsCount: Map<PeerId, number> = new Map();
  private readonly streams: Map<string, StreamAndPeerId> = new Map();

  // Serial queue to ensure that we only dial one peer at a time
  private dialQueue: SerialQueue = new SerialQueue();

  constructor(
    private readonly libp2p: Libp2p,
    private readonly cleanupIntervalMs: number = 60000, // Default to 1 minute
    private readonly sampler: RandomSampler = new RandomSampler(), // Allow randomness to be mocked for testing
  ) {
    this.cleanupInterval = setInterval(() => void this.cleanupStaleConnections(), this.cleanupIntervalMs);

    this.dialQueue.start();
  }

  /**
   * Stops the cleanup job and closes all active connections
   */
  async stop() {
    this.logger.info('Stopping connection sampler');
    clearInterval(this.cleanupInterval);

    for (const attempt of this.dialAttempts) {
      attempt.abort(new AbortError('Connection sampler stopped'));
    }
    this.dialAttempts = [];
    await this.dialQueue.end();

    // Close all active streams
    const closePromises = Array.from(this.streams.keys()).map(streamId => this.close(streamId));
    await Promise.all(closePromises);
    this.logger.info('Connection sampler stopped');
  }

  /**
   *
   * @param excluding - The peers to exclude from the sampling
   *        This is to prevent sampling with replacement
   * @returns
   */
  getPeer(excluding?: Map<string, boolean>): PeerId | undefined {
    // In libp2p getPeers performs a shallow copy, so this array can be sliced from safetly
    const peers = this.libp2p.getPeers();
    const { peer } = this.getPeerFromList(peers, excluding);
    return peer;
  }

  /**
   * Samples a peer from a list of peers, excluding those that have active (reqresp) connections or are in the exclusion list
   *
   * @param peers - The list of peers to sample from
   * @param excluding - The peers to exclude from the sampling
   * @returns - A peer from the list, or undefined if no peers are available,
   *          - a boolean indicating if the peer has active connections, and
   *          - all sampled peers - to enable optional resampling
   *
   * @dev The provided list peers, should be mutated by this function. This allows batch sampling
   *      to be performed without making extra copies of the list.
   */
  getPeerFromList(
    peers: PeerId[],
    excluding?: Map<string, boolean>,
  ): {
    peer: PeerId | undefined;
    sampledPeers: PeerId[];
  } {
    if (peers.length === 0) {
      return { peer: undefined, sampledPeers: [] };
    }

    const sampledPeers: PeerId[] = [];
    // Try to find a peer that has no active connections and is not in the exclusion list
    for (let attempts = 0; attempts < MAX_SAMPLE_ATTEMPTS && peers.length > 0; attempts++) {
      const randomIndex = this.sampler.random(peers.length);
      const peer = peers[randomIndex];
      const hasActiveConnections = (this.activeConnectionsCount.get(peer) ?? 0) > 0;
      const isExcluded = excluding?.get(peer.toString()) ?? false;

      // Remove this peer from consideration
      peers.splice(randomIndex, 1);

      // If peer is suitable (no active connections and not excluded), return it
      if (!hasActiveConnections && !isExcluded) {
        this.logger.trace('Sampled peer', {
          attempts,
          peer,
        });
        return { peer, sampledPeers };
      }

      // Keep track of peers that have active reqresp channels, batch sampling will use these to resample
      sampledPeers.push(peer);
    }

    // If we've exhausted our attempts or peers list is empty, return the last peer if available
    const lastPeer = peers.length > 0 ? peers[this.sampler.random(peers.length)] : undefined;

    this.logger.trace('Sampled peer', {
      attempts: MAX_SAMPLE_ATTEMPTS,
      peer: lastPeer?.toString(),
    });
    return { peer: lastPeer, sampledPeers };
  }

  /**
   * Samples a batch of unique peers from the libp2p node, prioritizing peers without active connections
   *
   * @param numberToSample - The number of peers to sample
   * @param excluding - The peers to exclude from the sampling
   * @returns Array of unique sampled peers, prioritizing those without active connections
   */
  samplePeersBatch(numberToSample: number, excluding?: Map<string, boolean>): PeerId[] {
    const peers = this.libp2p.getPeers();
    this.logger.debug('Sampling peers batch', { numberToSample, peers });

    // Only sample as many peers as we have available
    numberToSample = Math.min(numberToSample, peers.length);

    const batch: PeerId[] = [];
    const withActiveConnections: Set<PeerId> = new Set();
    for (let i = 0; i < numberToSample; i++) {
      const { peer, sampledPeers } = this.getPeerFromList(peers, excluding);
      if (peer) {
        batch.push(peer);
      }
      if (sampledPeers.length > 0) {
        sampledPeers.forEach(peer => withActiveConnections.add(peer));
      }
    }
    const lengthWithoutConnections = batch.length;

    // If we still need more peers, sample from those with connections
    while (batch.length < numberToSample && withActiveConnections.size > 0) {
      const randomIndex = this.sampler.random(withActiveConnections.size);

      const peer = Array.from(withActiveConnections)[randomIndex];
      withActiveConnections.delete(peer);
      batch.push(peer);
    }

    this.logger.trace('Batch sampled peers', {
      length: batch.length,
      peers: batch,
      withoutConnections: lengthWithoutConnections,
      withConnections: numberToSample - lengthWithoutConnections,
    });

    return batch;
  }

  // Set of passthrough functions to keep track of active connections

  /**
   * Dials a protocol and returns the stream
   *
   * @param peerId - The peer id
   * @param protocol - The protocol
   * @param timeout - Abort connection if it takes too long
   * @returns The stream
   */
  async dialProtocol(peerId: PeerId, protocol: string, timeout?: number): Promise<Stream> {
    // Dialling at the same time can cause race conditions where two different streams
    // end up with the same id, hence a serial queue
    this.logger.debug(`Dial queue length: ${this.dialQueue.length()}`);

    const abortController = new AbortController();
    this.dialAttempts.push(abortController);
    let timeoutHandle: NodeJS.Timeout | undefined;
    if (timeout) {
      timeoutHandle = setTimeout(() => abortController.abort(new TimeoutError('Dial protocol timeout')), timeout);
    }

    try {
      const stream = await this.dialQueue.put(() =>
        this.libp2p.dialProtocol(peerId, protocol, { signal: abortController.signal }),
      );

      this.streams.set(stream.id, { stream, peerId });
      const updatedActiveConnectionsCount = (this.activeConnectionsCount.get(peerId) ?? 0) + 1;
      this.activeConnectionsCount.set(peerId, updatedActiveConnectionsCount);

      this.logger.trace('Dialed protocol', {
        streamId: stream.id,
        protocol,
        peerId: peerId.toString(),
        activeConnectionsCount: updatedActiveConnectionsCount,
      });
      return stream;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      const idx = this.dialAttempts.indexOf(abortController);
      if (idx > -1) {
        this.dialAttempts.splice(idx, 1);
      }
    }
  }

  /**
   * Closes a stream and updates the active connections count
   *
   * @param streamId - The stream id
   */
  async close(streamId: string): Promise<void> {
    try {
      const streamAndPeerId = this.streams.get(streamId);
      if (!streamAndPeerId || !streamAndPeerId.stream) {
        this.logger.debug(`Stream ${streamId} not found`);
        return;
      }

      const { stream, peerId } = streamAndPeerId;

      const updatedActiveConnectionsCount = (this.activeConnectionsCount.get(peerId) ?? 1) - 1;
      this.activeConnectionsCount.set(peerId, updatedActiveConnectionsCount);

      this.logger.trace('Closing connection', {
        streamId,
        peerId: peerId.toString(),
        protocol: stream.protocol,
        activeConnectionsCount: updatedActiveConnectionsCount,
      });

      await stream!.close();
    } catch (error) {
      this.logger.error(`Failed to close connection to peer with stream id ${streamId}`, error);
    } finally {
      this.streams.delete(streamId);
    }
  }

  /**
   * Cleans up stale connections that we have lost accounting for
   */
  private async cleanupStaleConnections() {
    // Look for streams without anything in the activeConnectionsCount
    // If we find anything, close the stream
    for (const [streamId, { peerId }] of this.streams.entries()) {
      try {
        // Check if we have lost track of accounting
        if (this.activeConnectionsCount.get(peerId) === 0) {
          await this.close(streamId);
          this.logger.debug('Cleaned up stale connection', { streamId, peerId: peerId.toString() });
        }
      } catch (error) {
        this.logger.error(`Error cleaning up stale connection ${streamId}`, { error });
      }
    }
  }
}
