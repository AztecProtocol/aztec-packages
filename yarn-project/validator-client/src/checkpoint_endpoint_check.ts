import type { InboxContract } from '@aztec/ethereum/contracts';
import type { ViemClient } from '@aztec/ethereum/types';
import type { Fr } from '@aztec/foundation/curves/bn254';

/**
 * The L1 reads the checkpoint endpoint check makes: the bucket resolution itself, and the head it is made at, so a
 * verdict names the L1 view that produced it instead of mixing results from a `latest` that moves between reads.
 * {@link InboxContract} satisfies it directly; nothing else needs to be fetched to answer the question.
 */
export type InboxEndpointReader = Pick<InboxContract, 'getBucketAtOrBeforeTotal'> & {
  client: Pick<ViemClient, 'getBlockNumber'>;
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
 * checkpoint was signed. `unreadable` is a view this node could not obtain at all.
 */
export type InboxEndpointCheckResult =
  | { verified: true; l1BlockNumber: bigint; bucketSeq: bigint }
  | { verified: false; reason: InboxEndpointRejection; l1BlockNumber: bigint; endpointTotal?: bigint }
  | { verified: false; reason: 'unreadable'; err: unknown };

/**
 * Confirms through L1 that `totalMsgCount` is the end of a live Inbox bucket committing to `inboxRollingHash`.
 *
 * A checkpoint may consume an arbitrary prefix of the message log across its blocks, but the position it finishes
 * at has to be a live bucket boundary for L1 to accept it. The resolver answers with the newest boundary at or
 * below the bound, so only an exact total is a match: a lower one means the position sits inside a bucket. The
 * bucket's own rolling hash then has to be the one the checkpoint signed, or the boundary commits to different
 * message content than the checkpoint was built on.
 */
export async function checkInboxEndpoint(
  inbox: InboxEndpointReader,
  totalMsgCount: bigint,
  inboxRollingHash: Fr,
): Promise<InboxEndpointCheckResult> {
  try {
    const l1BlockNumber = await inbox.client.getBlockNumber();
    const found = await inbox.getBucketAtOrBeforeTotal(totalMsgCount, { blockNumber: l1BlockNumber });
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
    return { verified: false, reason: 'unreadable', err };
  }
}
