import type { InboxContract } from '@aztec/ethereum/contracts';
import type { Fr } from '@aztec/foundation/curves/bn254';

/** The identity of the L1 block a read was made at: a height alone is not one, since a fork answers at it too. */
type L1View = { number: bigint; hash: string };

/**
 * The L1 reads the checkpoint endpoint check makes: the bucket resolution itself, and the block it is made at,
 * read before and after so a verdict names the L1 view that produced it instead of mixing results from a `latest`
 * that moves between reads. {@link InboxContract} and a viem client satisfy it directly; nothing else needs to be
 * fetched to answer the question.
 */
export type InboxEndpointReader = Pick<InboxContract, 'getBucketAtOrBeforeTotal'> & {
  client: {
    getBlock(args: {
      blockNumber?: bigint;
      includeTransactions: false;
    }): Promise<{ number: bigint | null; hash: string | null } | undefined>;
  };
};

/** Why a checkpoint's final message position is not a live Inbox bucket endpoint in the L1 view that was read. */
export type InboxEndpointRejection =
  /** No live bucket ends at or below the position: the ring has evicted every bucket that could have matched. */
  | 'no_live_endpoint'
  /** The closest live boundary ends earlier, so the position falls inside a bucket rather than closing one. */
  | 'interior_position'
  /** A live bucket ends exactly there, but commits to a different message prefix than the checkpoint signed. */
  | 'rolling_hash_mismatch';

/**
 * The outcome of one endpoint check. A rejection describes the L1 view that was read at `l1BlockNumber`, not the
 * proposer: the bucket ring, this node's provider and the chain itself all move independently of the moment the
 * checkpoint was signed. The last two are views this node could not obtain, or could not identify, at all.
 */
export type InboxEndpointCheckResult =
  | { verified: true; l1BlockNumber: bigint; bucketSeq: bigint }
  | { verified: false; reason: InboxEndpointRejection; l1BlockNumber: bigint; endpointTotal?: bigint }
  /** A read threw, or answered without a block identity: the provider is unreachable, erroring or unsynced. */
  | { verified: false; reason: 'unreadable'; l1BlockNumber?: bigint; err: unknown }
  /** The block the resolution was read at is no longer the one at that height, so the answer names no view. */
  | { verified: false; reason: 'view_replaced'; l1BlockNumber: bigint };

/** What an L1 block read answers with when it names no block: no verdict can be bound to a view like that. */
const UNIDENTIFIED_BLOCK = 'the L1 block was returned without a number or a hash';

/**
 * Confirms through L1 that `totalMsgCount` is the end of a live Inbox bucket committing to `inboxRollingHash`.
 *
 * A checkpoint may consume an arbitrary prefix of the message log across its blocks, but the position it finishes
 * at has to be a live bucket boundary for L1 to accept it. The resolver answers with the newest boundary at or
 * below the bound, so only an exact total is a match: a lower one means the position sits inside a bucket. The
 * bucket's own rolling hash then has to be the one the checkpoint signed, or the boundary commits to different
 * message content than the checkpoint was built on.
 *
 * The resolution is read at one captured block and bound to that block's identity: a provider serving a stale
 * fork, or one the chain reorged under, answers a call by height as readily as the canonical chain does. Re-reading
 * the block at that height afterwards is what names the view the answer came from, and a view that cannot be shown
 * to be the one queried yields a refusal rather than a pass.
 */
export async function checkInboxEndpoint(
  inbox: InboxEndpointReader,
  totalMsgCount: bigint,
  inboxRollingHash: Fr,
): Promise<InboxEndpointCheckResult> {
  let queried: L1View | undefined;
  try {
    queried = await readL1View(inbox.client);
    if (queried === undefined) {
      return { verified: false, reason: 'unreadable', err: UNIDENTIFIED_BLOCK };
    }
    const l1BlockNumber = queried.number;
    const found = await inbox.getBucketAtOrBeforeTotal(totalMsgCount, { blockNumber: l1BlockNumber });

    const confirmed = await readL1View(inbox.client, l1BlockNumber);
    if (confirmed === undefined) {
      return { verified: false, reason: 'unreadable', l1BlockNumber, err: UNIDENTIFIED_BLOCK };
    }
    if (confirmed.hash !== queried.hash) {
      return { verified: false, reason: 'view_replaced', l1BlockNumber };
    }

    if (found === undefined) {
      return { verified: false, reason: 'no_live_endpoint', l1BlockNumber };
    }
    const endpointTotal = found.bucket.totalMsgCount;
    if (endpointTotal !== totalMsgCount) {
      return { verified: false, reason: 'interior_position', l1BlockNumber, endpointTotal };
    }
    if (!found.bucket.rollingHash.equals(inboxRollingHash)) {
      return { verified: false, reason: 'rolling_hash_mismatch', l1BlockNumber, endpointTotal };
    }
    return { verified: true, l1BlockNumber, bucketSeq: found.seq };
  } catch (err) {
    return { verified: false, reason: 'unreadable', l1BlockNumber: queried?.number, err };
  }
}

/** Reads the block at `blockNumber`, or the head when it is omitted, as a number and hash that identify it. */
async function readL1View(client: InboxEndpointReader['client'], blockNumber?: bigint): Promise<L1View | undefined> {
  const block = await client.getBlock({ blockNumber, includeTransactions: false });
  return block?.number == null || block.hash == null ? undefined : { number: block.number, hash: block.hash };
}
