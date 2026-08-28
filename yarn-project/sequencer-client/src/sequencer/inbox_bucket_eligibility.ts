import { type Logger, createLogger } from '@aztec/foundation/log';
import { executeTimeout } from '@aztec/foundation/timer';
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

/** What the confirmation tracker reads off an L1 block: its own identity and its parent link. */
export type L1BlockRef = { hash: string | null; parentHash: string };

/**
 * The single L1 read the confirmation tracker performs: a block by number. Narrower than viem's `getBlock` on
 * purpose, so tests and any other caller can supply a plain object instead of a whole public client; a viem public
 * client satisfies it as-is.
 */
export interface L1BlockReader {
  /** Fetches an L1 block header by number; rejects with viem's `BlockNotFoundError` when the block does not exist. */
  getBlock(args: { blockNumber: bigint; includeTransactions?: false }): Promise<L1BlockRef>;
}

/** Dependencies of an {@link InboxBucketConfirmationTracker}. */
export type InboxBucketConfirmationTrackerDeps = {
  /** L1 client used to look up the bucket's opening block and its child. */
  l1Client: L1BlockReader;
  /** Configured Ethereum slot duration in seconds; the unit the confirmation deadlines are expressed in. */
  ethereumSlotDuration: number;
  /** Wall-clock tolerance in seconds, applied in the permissive direction only. Defaults to 0. */
  clockToleranceSeconds?: number;
  /**
   * How long a single L1 block read may take before the bucket is treated as unconfirmed for now.
   * Defaults to {@link DEFAULT_L1_READ_TIMEOUT_MS}. These reads sit on the block-building path, where the viem
   * default (10s plus retries) would eat the sub-slot.
   */
  l1ReadTimeoutMs?: number;
  log?: Logger;
};

/** Default cap on a single confirmation read, well under a sub-slot. */
const DEFAULT_L1_READ_TIMEOUT_MS = 2_000;

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
 * child could exist, caches confirmations for its lifetime, caches rejections for the second they were computed in,
 * answers every bucket a given L1 block opened from one read, and decides each branch from a single response —
 * behind a load-balanced RPC two calls may see different heads, so no branch ever compares two responses. Every read
 * is time-boxed: an L1 endpoint that hangs must not cost the proposer its sub-slot.
 */
export class InboxBucketConfirmationTracker {
  private readonly l1Client: L1BlockReader;
  private readonly ethereumSlotDuration: bigint;
  private readonly clockToleranceSeconds: bigint;
  private readonly l1ReadTimeoutMs: number;
  private readonly log: Logger;

  /**
   * Opening L1 blocks known to have a canonical descendant. Confirmed never becomes unconfirmed. Keyed by block
   * identity rather than by bucket, so the many buckets a busy L1 block opens all resolve from one read.
   */
  private readonly confirmed = new Set<string>();

  /**
   * Opening L1 blocks known to be unconfirmed, keyed to the `nowSeconds` the answer was computed at: a repeat call
   * within the same second reuses it, a later one re-reads L1.
   */
  private readonly rejectedAt = new Map<string, bigint>();

  constructor(deps: InboxBucketConfirmationTrackerDeps) {
    this.l1Client = deps.l1Client;
    this.ethereumSlotDuration = BigInt(deps.ethereumSlotDuration);
    this.clockToleranceSeconds = BigInt(deps.clockToleranceSeconds ?? 0);
    this.l1ReadTimeoutMs = deps.l1ReadTimeoutMs ?? DEFAULT_L1_READ_TIMEOUT_MS;
    this.log = deps.log ?? createLogger('sequencer:inbox-bucket-confirmation');
  }

  /**
   * Eligibility function for the Inbox bucket selector, bound to this tracker's caches. An L1 read that fails leaves
   * the bucket ineligible for now rather than aborting the block: a bucket at or below the censorship cutoff is
   * consumed by the checkpoint's last block regardless of eligibility, so a flaky L1 endpoint costs latency, not
   * liveness.
   */
  public readonly isEligible: InboxBucketEligibility = async (bucket, nowSeconds) => {
    // The genesis sentinel holds no messages and was never opened by an L1 block, so there is nothing to confirm.
    if (bucket.seq === 0n) {
      return true;
    }

    const key = `${bucket.l1BlockNumber}:${bucket.l1BlockHash.toString()}`;
    try {
      return await this.check(bucket, key, nowSeconds);
    } catch (err) {
      // A read that times out or fails leaves the block neither confirmed nor orphaned; it is pending, and the
      // rejection is cached so a flaky endpoint costs one read per second rather than one per bucket.
      this.log.debug(`Could not read L1 to confirm Inbox bucket ${bucket.seq}, treating it as pending: ${err}`, {
        bucketSeq: bucket.seq,
        l1BlockNumber: bucket.l1BlockNumber,
      });
      return this.reject(key, nowSeconds);
    }
  };

  private async check(bucket: InboxBucket, key: string, nowSeconds: bigint): Promise<boolean> {
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
      return await executeTimeout(
        () => this.l1Client.getBlock({ blockNumber, includeTransactions: false }),
        this.l1ReadTimeoutMs,
        `L1 getBlock(${blockNumber})`,
      );
    } catch (err) {
      if (err instanceof BlockNotFoundError) {
        return undefined;
      }
      throw err;
    }
  }
}
