import type { L2BlockSource } from '@aztec/stdlib/block';
import { WorldStateRunningState, type WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';

/**
 * How far the world state may trail the archiver's latest replicated block and still count as ready. A couple of
 * blocks of lag is normal (world state processes blocks the archiver just stored), so the threshold only has to
 * catch a world state that stopped making progress altogether.
 */
export const DEFAULT_WORLD_STATE_READINESS_LAG_BLOCKS = 3;

/** The archiver surface the readiness probe reads. */
export type FollowerReadinessArchiver = Pick<L2BlockSource, 'getBlockNumber'> & {
  getHealth(): { initialSyncComplete: boolean };
};

/**
 * Builds the readiness probe of a follower node. A follower is ready once it has replicated the whole chain at
 * least once, its world state is running, and its world state agrees with the archiver on the chain tip.
 *
 * The archiver side is deliberately latched on the initial sync rather than on its `caughtUp` flag: `caughtUp`
 * goes false whenever the upstream is a block ahead mid-cycle, which would flap a load balancer's health check
 * on every block. Ongoing staleness is reported by the archiver's health surface instead.
 *
 * The world-state side is *not* latched: a world state that wedged (e.g. because it cannot get the L1-to-L2
 * messages of a checkpoint) keeps reporting `RUNNING` while falling further and further behind the archiver, and
 * a node in that state serves stale reads. Tip agreement is what catches it.
 */
export function createFollowerReadinessProbe(
  archiver: FollowerReadinessArchiver,
  worldStateSynchronizer: Pick<WorldStateSynchronizer, 'status'>,
  maxLagBlocks: number = DEFAULT_WORLD_STATE_READINESS_LAG_BLOCKS,
): () => Promise<boolean> {
  return async () => {
    if (!archiver.getHealth().initialSyncComplete) {
      return false;
    }
    const { state, syncSummary } = await worldStateSynchronizer.status();
    if (state !== WorldStateRunningState.RUNNING) {
      return false;
    }
    const archiverTip = (await archiver.getBlockNumber()) ?? 0;
    // World state can legitimately sit ahead of the archiver for an instant while a prune is being applied, so
    // only lagging counts against readiness.
    return archiverTip - syncSummary.latestBlockNumber <= maxLagBlocks;
  };
}
