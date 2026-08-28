import type { ViemPublicClient } from '@aztec/ethereum/types';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { InboxBucket } from '@aztec/stdlib/messaging';

import { BlockNotFoundError } from 'viem';

/**
 * Whether a proposer may consume an Inbox bucket in the sub-slot anchored at `nowSeconds`. Eligibility is proposer
 * policy, not a consensus rule: L1 accepts any bucket at or below the censorship cutoff, and validators only check
 * what L1 checks. A proposer that consumes an Inbox bucket whose L1 block is later reorged out builds a checkpoint
 * its own archiver will disown, so it delays consumption until the opening block looks settled.
 */
export type InboxBucketEligibility = (bucket: InboxBucket, nowSeconds: bigint) => Promise<boolean>;

/** Consumes every bucket the archiver has, with no L1 confirmation wait. Used by automine, which never waits. */
export const immediateEligibility: InboxBucketEligibility = () => Promise.resolve(true);

/** The single L1 read the confirmation tracker performs: a block by number. */
export type L1BlockReader = Pick<ViemPublicClient, 'getBlock'>;

/** Dependencies of an {@link InboxBucketConfirmationTracker}. */
export type InboxBucketConfirmationTrackerDeps = {
  /** L1 client used to look up the bucket's opening block and its child. */
  l1Client: L1BlockReader;
  /** Configured Ethereum slot duration in seconds; the unit the confirmation deadlines are expressed in. */
  ethereumSlotDuration: number;
  /** Wall-clock tolerance in seconds, applied in the permissive direction only. Defaults to 0. */
  clockToleranceSeconds?: number;
  log?: Logger;
};

/**
 * Decides when an Inbox bucket's opening L1 block is safe from the common one-block reorg, using only EL block reads.
 *
 * A bucket opened in L1 block `N` (number `h`, hash `H`, timestamp `T`) is eligible once either
 *
 * - block `h + 1` is visible and its `parentHash` is `H` — `N` then survives even if that child is itself reorged,
 *   since the replacement builds on the same parent; or
 * - slot `S + 1` has fully elapsed (`now >= T + 2E`) and block `h` still hashes to `H`, which covers a missed slot
 *   `S + 1`. Past that point the honest fork-choice reorg mechanism can no longer displace `N`, as it only ever
 *   reorgs the head's immediate successor slot.
 *
 * A child with a different parent, or a block `h` with a different hash, means `N` is already orphaned: the bucket is
 * permanently ineligible under this tracker, and the archiver will roll it back shortly.
 *
 * Age in seconds is deliberately not the rule. A replacement block lands at roughly `T + 13..15`, which is *after*
 * the `T + 12` tick an age-of-one-Ethereum-slot rule would have released the bucket at, so that rule buys no safety
 * at all; and with a missed slot a bucket can be a full Ethereum slot old while still sitting in the latest L1 block.
 * Waiting for evidence of a descendant is both cheaper (usually ~`T + 14`) and actually sound.
 *
 * One tracker is meant to live for one proposal job (one slot). It is frugal with RPCs: it performs no call before a
 * child could exist, caches confirmations for its lifetime, caches rejections for the sub-slot they were computed in,
 * and decides each branch from a single response — behind a load-balanced RPC two calls may see different heads, so
 * no branch ever compares two responses.
 */
export class InboxBucketConfirmationTracker {
  private readonly l1Client: L1BlockReader;
  private readonly ethereumSlotDuration: bigint;
  private readonly clockToleranceSeconds: bigint;
  private readonly log: Logger;

  /** Buckets whose opening block has a confirmed descendant. Confirmed never becomes unconfirmed. */
  private readonly confirmed = new Set<string>();

  /** Buckets known to be ineligible, keyed to the sub-slot clock the answer was computed at. */
  private readonly rejectedAt = new Map<string, bigint>();

  constructor(deps: InboxBucketConfirmationTrackerDeps) {
    this.l1Client = deps.l1Client;
    this.ethereumSlotDuration = BigInt(deps.ethereumSlotDuration);
    this.clockToleranceSeconds = BigInt(deps.clockToleranceSeconds ?? 0);
    this.log = deps.log ?? createLogger('sequencer:inbox-bucket-confirmation');
  }

  /**
   * Eligibility function for the Inbox bucket selector, bound to this tracker's caches. An L1 read that fails leaves
   * the bucket ineligible for now rather than aborting the block: a bucket at or below the censorship cutoff is
   * consumed by the checkpoint's last block regardless of eligibility, so a flaky L1 endpoint costs latency, not
   * liveness.
   */
  public readonly isEligible: InboxBucketEligibility = async (bucket, nowSeconds) => {
    try {
      return await this.check(bucket, nowSeconds);
    } catch (err) {
      this.log.warn(`Failed to check L1 confirmation for Inbox bucket ${bucket.seq}: ${err}`, {
        bucketSeq: bucket.seq,
        l1BlockNumber: bucket.l1BlockNumber,
      });
      return false;
    }
  };

  private async check(bucket: InboxBucket, nowSeconds: bigint): Promise<boolean> {
    // The genesis sentinel holds no messages and was never opened by an L1 block, so there is nothing to confirm.
    if (bucket.seq === 0n) {
      return true;
    }

    const key = `${bucket.seq}:${bucket.l1BlockHash.toString()}`;
    if (this.confirmed.has(key)) {
      return true;
    }
    if (this.rejectedAt.get(key) === nowSeconds) {
      return false;
    }

    const openedAt = bucket.timestamp;
    const permissiveNow = nowSeconds + this.clockToleranceSeconds;

    // Slot S+1 has not started, so no child can exist yet and block h cannot have settled either.
    if (permissiveNow < openedAt + this.ethereumSlotDuration) {
      return this.reject(key, nowSeconds);
    }

    const child = await this.getBlockByNumber(bucket.l1BlockNumber + 1n);
    if (child !== undefined) {
      if (this.hashMatches(child.parentHash, bucket)) {
        this.confirmed.add(key);
        return true;
      }
      this.log.debug(`Inbox bucket ${bucket.seq} sits on an orphaned L1 block`, {
        reason: 'bucket_l1_block_orphaned',
        bucketSeq: bucket.seq,
        l1BlockNumber: bucket.l1BlockNumber,
        expectedParent: bucket.l1BlockHash.toString(),
        actualParent: child.parentHash,
      });
      return this.reject(key, nowSeconds);
    }

    // No child: slot S+1 was missed. Once it has fully elapsed, block h being canonical is enough.
    if (permissiveNow >= openedAt + 2n * this.ethereumSlotDuration) {
      const current = await this.getBlockByNumber(bucket.l1BlockNumber);
      if (current !== undefined && this.hashMatches(current.hash, bucket)) {
        this.confirmed.add(key);
        return true;
      }
      this.log.debug(`Inbox bucket ${bucket.seq} is no longer on the canonical L1 chain`, {
        reason: 'bucket_l1_block_orphaned',
        bucketSeq: bucket.seq,
        l1BlockNumber: bucket.l1BlockNumber,
        expectedHash: bucket.l1BlockHash.toString(),
        actualHash: current?.hash,
      });
    }

    return this.reject(key, nowSeconds);
  }

  private reject(key: string, nowSeconds: bigint): false {
    this.rejectedAt.set(key, nowSeconds);
    return false;
  }

  private hashMatches(hash: string | null, bucket: InboxBucket): boolean {
    return hash !== null && hash.toLowerCase() === bucket.l1BlockHash.toString().toLowerCase();
  }

  private async getBlockByNumber(blockNumber: bigint) {
    try {
      return await this.l1Client.getBlock({ blockNumber, includeTransactions: false });
    } catch (err) {
      if (err instanceof BlockNotFoundError) {
        return undefined;
      }
      throw err;
    }
  }
}
