import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { CheckpointId, L2BlockId, L2TipId, L2Tips } from '@aztec/stdlib/block';
import {
  type InboxMessagePosition,
  type InboxMessageRange,
  type L1ToL2MessageSource,
  updateInboxRollingHash,
} from '@aztec/stdlib/messaging';

import { InboxMessageRangeNotSyncedError } from '../errors.js';

/**
 * A mocked implementation of L1ToL2MessageSource to be used in tests.
 */
export class MockL1ToL2MessageSource implements L1ToL2MessageSource {
  /** The canonical message log, keyed by compact global index; positions and count ranges derive from it alone. */
  private leavesByIndex = new Map<bigint, Fr>();

  constructor(private blockNumber: number) {}

  /** Replaces the whole indexed message log with the given leaves, as a fresh sync or a content-changing reorg does. */
  public setL1ToL2Messages(msgs: Fr[]) {
    this.leavesByIndex = new Map(msgs.map((msg, i) => [BigInt(i), msg]));
  }

  /** Removes every indexed leaf from `index` on, as an L1 reorg that drops a message suffix does. */
  public removeL1ToL2MessagesFrom(index: bigint) {
    for (const key of [...this.leavesByIndex.keys()]) {
      if (key >= index) {
        this.leavesByIndex.delete(key);
      }
    }
  }

  /** Appends leaves to the indexed message log at its synced tip. */
  public appendL1ToL2Messages(msgs: Fr[]) {
    const firstIndex = this.getSyncedMessageCount();
    msgs.forEach((msg, i) => this.leavesByIndex.set(firstIndex + BigInt(i), msg));
  }

  public setBlockNumber(blockNumber: number) {
    this.blockNumber = blockNumber;
  }

  /** The number of leaves indexed contiguously from zero: the mocked synced tip. */
  private getSyncedMessageCount(): bigint {
    let count = 0n;
    while (this.leavesByIndex.has(count)) {
      count++;
    }
    return count;
  }

  /** Recomputes the rolling hash over the first `totalMessageCount` indexed leaves, as the archiver stores per message. */
  private computeRollingHash(totalMessageCount: bigint): Fr {
    let hash = Fr.ZERO;
    for (let index = 0n; index < totalMessageCount; index++) {
      hash = updateInboxRollingHash(hash, this.leavesByIndex.get(index)!);
    }
    return hash;
  }

  getL1ToL2MessageIndex(_l1ToL2Message: Fr): Promise<bigint | undefined> {
    throw new Error('Method not implemented.');
  }

  /**
   * Slices the indexed leaf log, enforcing the same range contract as the archiver's message store: invalid bounds and
   * ranges past the synced tip are rejected, the latter with the archiver's typed availability error. Every failure is
   * a rejection rather than a synchronous throw, so callers see this stand-in behave like the async source it mocks.
   */
  getL1ToL2MessagesBetweenLeafCounts(startLeafCount: bigint, endLeafCount: bigint): Promise<Fr[]> {
    try {
      return Promise.resolve(this.readLeafCountRange(startLeafCount, endLeafCount));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  getMessagePosition(totalMessageCount: bigint): Promise<InboxMessagePosition | undefined> {
    if (totalMessageCount < 0n) {
      return Promise.reject(new Error(`Invalid Inbox message count ${totalMessageCount}`));
    }
    if (totalMessageCount > this.getSyncedMessageCount()) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve({ totalMessageCount, rollingHash: this.computeRollingHash(totalMessageCount) });
  }

  getSyncedMessagePosition(): Promise<InboxMessagePosition> {
    const totalMessageCount = this.getSyncedMessageCount();
    return Promise.resolve({ totalMessageCount, rollingHash: this.computeRollingHash(totalMessageCount) });
  }

  /**
   * Reads the range and both positions synchronously from the current leaf log, so a test that mutates the log while
   * a range read is pending cannot pair leaves of one version with hashes of another, as the archiver's single-transaction
   * read cannot either.
   */
  getL1ToL2MessageRange(startLeafCount: bigint, endLeafCount: bigint): Promise<InboxMessageRange> {
    try {
      const messages = this.readLeafCountRange(startLeafCount, endLeafCount);
      return Promise.resolve({
        messages,
        start: { totalMessageCount: startLeafCount, rollingHash: this.computeRollingHash(startLeafCount) },
        end: { totalMessageCount: endLeafCount, rollingHash: this.computeRollingHash(endLeafCount) },
      });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  private readLeafCountRange(startLeafCount: bigint, endLeafCount: bigint): Fr[] {
    if (startLeafCount < 0n || endLeafCount < 0n || startLeafCount > endLeafCount) {
      throw new Error(`Invalid Inbox leaf count range [${startLeafCount}, ${endLeafCount})`);
    }
    const syncedCount = this.getSyncedMessageCount();
    if (endLeafCount > syncedCount) {
      const available = syncedCount > startLeafCount ? syncedCount - startLeafCount : 0n;
      throw new InboxMessageRangeNotSyncedError(
        startLeafCount,
        endLeafCount,
        `only ${available} of ${endLeafCount - startLeafCount} messages are mocked`,
      );
    }
    const leaves: Fr[] = [];
    for (let index = startLeafCount; index < endLeafCount; index++) {
      leaves.push(this.leavesByIndex.get(index)!);
    }
    return leaves;
  }

  getBlockNumber() {
    return Promise.resolve(BlockNumber(this.blockNumber));
  }

  getL2Tips(): Promise<L2Tips> {
    const number = this.blockNumber;
    const blockId: L2BlockId = { number: BlockNumber(number), hash: new Fr(number).toString() };
    const checkpointId: CheckpointId = {
      number: CheckpointNumber(number),
      hash: new Fr(number + 1).toString(),
    };
    const tip: L2TipId = { block: blockId, checkpoint: checkpointId };
    return Promise.resolve({
      proposed: blockId,
      checkpointed: tip,
      proven: tip,
      finalized: tip,
    });
  }
}
