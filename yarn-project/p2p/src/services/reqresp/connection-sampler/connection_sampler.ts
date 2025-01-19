import { createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { RunningPromise } from '@aztec/foundation/running-promise';

import { type Libp2p, type PeerId, type Stream } from '@libp2p/interface';

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
 * A class that samples peers from the libp2p node and returns a peer that we don't already have a connection open to.
 * If we already have a connection open, we try to sample a different peer.
 * We do this MAX_SAMPLE_ATTEMPTS times, if we still don't find a peer we just go for it.
 *
 * @dev Close must always be called on connections, else memory leak
 */
export class ConnectionSampler {
  private readonly logger = createLogger('p2p:reqresp:connection-sampler');
  private cleanupJob?: RunningPromise;

  private readonly activeConnectionsCount: Map<PeerId, number> = new Map();
  private readonly streams: Map<string, StreamAndPeerId> = new Map();

  // Serial queue to ensure that we only dial one peer at a time
  private dialQueue: SerialQueue = new SerialQueue();

  constructor(
    private readonly libp2p: Libp2p,
    private readonly cleanupIntervalMs: number = 60000, // Default to 1 minute
    private readonly sampler: RandomSampler = new RandomSampler(), // Allow randomness to be mocked for testing
  ) {
    this.cleanupJob = new RunningPromise(() => this.cleanupStaleConnections(), this.logger, this.cleanupIntervalMs);
    this.cleanupJob.start();

    this.dialQueue.start();
  }

  /**
   * Stops the cleanup job and closes all active connections
   */
  async stop() {
    await this.cleanupJob?.stop();
    await this.dialQueue.end();

    // Close all active streams
    const closePromises = Array.from(this.streams.keys()).map(streamId => this.close(streamId));
    await Promise.all(closePromises);
  }

  getPeer(): PeerId {
    const peers = this.libp2p.getPeers();
    let randomIndex = this.sampler.random(peers.length);
    let attempts = 0;

    // If the active connections count is greater than 0, then we already have a connection open
    // So we try to sample a different peer, but only MAX_SAMPLE_ATTEMPTS times
    while ((this.activeConnectionsCount.get(peers[randomIndex]) ?? 0) > 0 && attempts < MAX_SAMPLE_ATTEMPTS) {
      randomIndex = this.sampler.random(peers.length);
      attempts++;
    }

    this.logger.trace(`Sampled peer in ${attempts} attempts`, {
      attempts,
      peer: peers[randomIndex]?.toString(),
    });
    return peers[randomIndex];
  }

  /**
   * Samples a batch of unique peers from the libp2p node, prioritizing peers without active connections
   *
   * @param numberToSample - The number of peers to sample
   * @returns Array of unique sampled peers, prioritizing those without active connections
   */
  samplePeersBatch(numberToSample: number): PeerId[] {
    const peers = this.libp2p.getPeers();
    const sampledPeers: PeerId[] = [];
    const peersWithConnections: PeerId[] = []; // Hold onto peers with active connections incase we need to sample more

    for (const peer of peers) {
      const activeConnections = this.activeConnectionsCount.get(peer) ?? 0;
      if (activeConnections === 0) {
        if (sampledPeers.push(peer) === numberToSample) {
          return sampledPeers;
        }
      } else {
        peersWithConnections.push(peer);
      }
    }

    // If we still need more peers, sample from those with connections
    while (sampledPeers.length < numberToSample && peersWithConnections.length > 0) {
      const randomIndex = this.sampler.random(peersWithConnections.length);
      const [peer] = peersWithConnections.splice(randomIndex, 1);
      sampledPeers.push(peer);
    }

    this.logger.trace(`Batch sampled ${sampledPeers.length} unique peers`, {
      peers: sampledPeers,
      withoutConnections: sampledPeers.length - peersWithConnections.length,
      withConnections: peersWithConnections.length,
    });

    return sampledPeers;
  }

  // Set of passthrough functions to keep track of active connections

  /**
   * Dials a protocol and returns the stream
   *
   * @param peerId - The peer id
   * @param protocol - The protocol
   * @returns The stream
   */
  async dialProtocol(peerId: PeerId, protocol: string): Promise<Stream> {
    // Dialling at the same time can cause race conditions where two different streams
    // end up with the same id, hence a serial queue
    const stream = await this.dialQueue.put(() => this.libp2p.dialProtocol(peerId, protocol));

    this.streams.set(stream.id, { stream, peerId });
    const updatedActiveConnectionsCount = (this.activeConnectionsCount.get(peerId) ?? 0) + 1;
    this.activeConnectionsCount.set(peerId, updatedActiveConnectionsCount);

    this.logger.trace(`Dialed protocol ${protocol} with peer ${peerId.toString()}`, {
      streamId: stream.id,
      peerId: peerId.toString(),
      activeConnectionsCount: updatedActiveConnectionsCount,
    });
    return stream;
  }

  /**
   * Closes a stream and updates the active connections count
   *
   * @param streamId - The stream id
   */
  async close(streamId: string): Promise<void> {
    try {
      const { stream, peerId } = this.streams.get(streamId)!;

      const updatedActiveConnectionsCount = (this.activeConnectionsCount.get(peerId) ?? 1) - 1;
      this.activeConnectionsCount.set(peerId, updatedActiveConnectionsCount);

      this.logger.trace(`Closing connection to peer ${peerId.toString()}`, {
        streamId,
        peerId: peerId.toString(),
        protocol: stream.protocol,
        activeConnectionsCount: updatedActiveConnectionsCount,
      });

      await stream?.close();
    } catch (error) {
      this.logger.error(`Failed to close connection to peer ${streamId}`, { error });
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
          this.logger.debug(`Cleaned up stale connection ${streamId} to peer ${peerId.toString()}`);
        }
      } catch (error) {
        this.logger.error(`Error cleaning up stale connection ${streamId}`, { error });
      }
    }
  }
}
