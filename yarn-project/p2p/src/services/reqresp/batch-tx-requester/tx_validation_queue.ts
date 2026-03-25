import type { Logger } from '@aztec/foundation/log';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import type { Tx } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

import type { IPeerCollection } from './peer_collection.js';
import type { IBatchRequestTxValidator } from './tx_validator.js';

/** A tx received from a peer, pending validation. */
type PendingTx = {
  tx: Tx;
  peerId: PeerId;
  resolve: (outcome: TxValidationOutcome) => void;
};

/** Result of submitting a tx for validation. */
export type TxValidationOutcome = {
  tx: Tx;
  peerId: PeerId;
  /** 'accepted' = validated and passed, 'invalid' = validated and failed, 'skipped' = already accepted from another peer. */
  status: 'accepted' | 'invalid' | 'skipped';
};

/**
 * Queues received txs by hash and validates them serially per hash.
 *
 * For each tx hash, copies from different peers are validated one at a time.
 * The first valid copy is accepted; all subsequent copies for that hash are
 * silently ignored. Invalid copies cause the sending peer to be penalized.
 * Different tx hashes are validated in parallel.
 */
export class TxValidationQueue {
  /** Per-hash queue of pending txs awaiting validation. */
  private readonly pendingByHash = new Map<string, PendingTx[]>();
  /** Hashes that already have an active validation loop running. */
  private readonly activeHashes = new Set<string>();
  /** Hashes that have been accepted (valid tx received and processed). */
  private readonly acceptedHashes = new Set<string>();

  constructor(
    private readonly txValidator: IBatchRequestTxValidator,
    private readonly peers: IPeerCollection,
    private readonly logger: Logger,
  ) {}

  /**
   * Submits txs from a peer for validation. Returns a promise that resolves
   * when all submitted txs have been processed (validated, accepted, or skipped).
   */
  async submit(peerId: PeerId, txs: Tx[]): Promise<TxValidationOutcome[]> {
    const promises: Promise<TxValidationOutcome>[] = [];

    for (const tx of txs) {
      const hash = tx.txHash.toString();

      // Already accepted — skip immediately, no penalty.
      if (this.acceptedHashes.has(hash)) {
        promises.push(Promise.resolve({ tx, peerId, status: 'skipped' as const }));
        continue;
      }

      // Create a deferred promise so the caller can await this specific entry.
      let resolve: (outcome: TxValidationOutcome) => void;
      const promise = new Promise<TxValidationOutcome>(r => {
        resolve = r;
      });
      promises.push(promise);

      // Enqueue the entry.
      if (!this.pendingByHash.has(hash)) {
        this.pendingByHash.set(hash, []);
      }
      this.pendingByHash.get(hash)!.push({ tx, peerId, resolve: resolve! });

      // If no validation loop is running for this hash, start one.
      if (!this.activeHashes.has(hash)) {
        this.activeHashes.add(hash);
        void this.processHash(hash).catch(err => {
          this.logger.error(`Validation loop for hash ${hash} failed: ${err.message}`, { error: err });
        });
      }
    }

    return await Promise.all(promises);
  }

  /** Processes all pending entries for a single tx hash, serially. */
  private async processHash(hash: string): Promise<void> {
    try {
      while (true) {
        const queue = this.pendingByHash.get(hash);
        if (!queue || queue.length === 0) {
          break;
        }

        const entry = queue.shift()!;

        // Check again — another entry may have been accepted while we were waiting.
        if (this.acceptedHashes.has(hash)) {
          entry.resolve({ tx: entry.tx, peerId: entry.peerId, status: 'skipped' });
          continue;
        }

        let isValid = false;
        try {
          const result = await this.txValidator.validateRequestedTx(entry.tx);
          isValid = result.result === 'valid';
        } catch (err: any) {
          this.logger.warn(`Validation threw for tx ${hash} from peer ${entry.peerId.toString()}: ${err.message}`);
        }

        if (isValid) {
          this.acceptedHashes.add(hash);
          entry.resolve({ tx: entry.tx, peerId: entry.peerId, status: 'accepted' });

          // Drain remaining entries for this hash — they are silently ignored.
          this.drainRemaining(hash);
        } else {
          this.logger.warn(
            `Penalizing peer ${entry.peerId.toString()} for sending invalid tx ${hash} in batch response`,
            { peerId: entry.peerId },
          );
          this.peers.penalisePeer(entry.peerId, PeerErrorSeverity.LowToleranceError);
          entry.resolve({ tx: entry.tx, peerId: entry.peerId, status: 'invalid' });
        }
      }
    } finally {
      this.activeHashes.delete(hash);
      this.pendingByHash.delete(hash);
    }
  }

  /** Resolves all remaining pending entries for a hash as not accepted. */
  private drainRemaining(hash: string): void {
    const queue = this.pendingByHash.get(hash);
    if (!queue) {
      return;
    }
    for (const entry of queue) {
      entry.resolve({ tx: entry.tx, peerId: entry.peerId, status: 'skipped' });
    }
    queue.length = 0;
  }
}
