import { createLogger } from '@aztec/foundation/log';

import type { PeerId } from '@libp2p/interface';

import type { ConnectionSampler } from './connection_sampler.js';

/**
 * Manages batches of peers for aggressive parallel request processing.
 * All peers request all transactions in the batch simultaneously and the first
 * valid response for each tx is accepted.
 *
 * TODO: add an example where the requests are larger than batch size
 *
 * All peers try to handle all requests up to the batch size simultaneously.
 * The first valid response for each request is accepted.
 */
export class AggressiveBatchConnectionSampler {
  private readonly logger = createLogger('p2p:aggressive-reqresp:batch-connection-sampler');
  private readonly peers: PeerId[] = [];

  constructor(private readonly connectionSampler: ConnectionSampler, maxPeers: number) {
    if (maxPeers <= 0) {
      throw new Error('Max peers cannot be 0');
    }

    // Sample initial peers up to maxPeers
    this.peers = this.connectionSampler.samplePeersBatch(maxPeers);

    this.logger.debug('Initialized batch connection sampler', {
      peerCount: this.peers.length,
      maxPeers,
    });
  }

  /**
   * Gets all active peers
   * @returns Array of all currently active peers
   */
  getAllPeers(): PeerId[] {
    return [...this.peers];
  }

  /**
   * Removes a peer and replaces it with a new one
   * @param peerId - The peer to remove and replace
   */
  removePeerAndReplace(peerId: PeerId): void {
    const index = this.peers.findIndex(p => p.toString() === peerId.toString());
    if (index === -1) {
      return;
    }

    // Remove the peer
    this.peers.splice(index, 1);

    // Try to find a replacement
    const excluding = new Map(this.peers.map(p => [p.toString(), true]));
    excluding.set(peerId.toString(), true);

    const newPeer = this.connectionSampler.getPeer(excluding);

    if (newPeer) {
      this.peers.push(newPeer);
      this.logger.trace('Replaced peer', {
        removedPeer: peerId.toString(),
        newPeer: newPeer.toString(),
        totalPeers: this.peers.length,
      });
    } else {
      this.logger.trace('Removed peer without replacement', {
        removedPeer: peerId.toString(),
        totalPeers: this.peers.length,
      });
    }
  }

  /**
   * Gets the number of active peers
   */
  activePeerCount(): number {
    return this.peers.length;
  }
}
