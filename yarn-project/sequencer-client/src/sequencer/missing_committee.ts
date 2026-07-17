import type { EpochCache } from '@aztec/epoch-cache';
import type { RollupContract } from '@aztec/ethereum/contracts';
import { EpochNumber, type SlotNumber } from '@aztec/foundation/branded-types';
import { timesParallel } from '@aztec/foundation/collection';
import type { Logger } from '@aztec/foundation/log';
import { formatSeconds } from '@aztec/foundation/string';
import type { DateProvider } from '@aztec/foundation/timer';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { type L1RollupConstants, getStartTimestampForEpoch } from '@aztec/stdlib/epoch-helpers';

/** Collaborators {@link logMissingCommittee} needs to diagnose and report why no committee exists. */
export interface MissingCommitteeContext {
  epochCache: Pick<EpochCache, 'getL1Constants' | 'getLagInEpochsForValidatorSet'>;
  rollupContract: Pick<RollupContract, 'getActiveAttesterCount' | 'getAttesterCountAtTime'>;
  l2BlockSource: Pick<L2BlockSource, 'getBlockNumber'>;
  l1Constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'epochDuration'>;
  dateProvider: Pick<DateProvider, 'nowInSeconds'>;
  logger: Pick<Logger, 'info' | 'warn' | 'debug'>;
}

/**
 * Why the sequencer cannot find a validator committee for an upcoming slot. A committee for an epoch is
 * sampled from the validator set as of `lagInEpochsForValidatorSet` epochs earlier, and L1 refuses to
 * produce one until at least `targetCommitteeSize` validators were staked at that sampling time.
 */
export type MissingCommitteeCause =
  /** Enough validators are staked now; the committee is just waiting for the sampling window to advance. */
  | 'awaiting-sampling-lag'
  /** The chain has not produced any block yet and too few validators are staked: normal bootstrap state. */
  | 'awaiting-first-validators'
  /** The chain has produced blocks before but the validator set has since dropped below the required size. */
  | 'validator-set-shrank';

export interface MissingCommitteeDiagnosis {
  cause: MissingCommitteeCause;
  /** Log severity: bootstrap and lag are expected (`info`); a shrunken set on a live chain is not (`warn`). */
  severity: 'info' | 'warn';
}

/**
 * Logs why no validator committee exists for the given slot. Rather than the cryptic "committee does not
 * exist on L1", it diagnoses the cause from the live attester count and whether the chain has ever produced
 * a block: a bootstrapping chain waiting for validators to stake, a full set still waiting for the sampling
 * lag to elapse, or a validator set that has shrunk below the required size on a live chain. Only the last is
 * a genuine problem, so only it is logged at `warn`.
 *
 * Best-effort: if the diagnostic L1 reads fail we fall back to a neutral message so this never throws on the
 * propose path.
 */
export async function logMissingCommittee(
  targetSlot: SlotNumber,
  targetEpoch: EpochNumber,
  ctx: MissingCommitteeContext,
): Promise<void> {
  const targetCommitteeSize = ctx.epochCache.getL1Constants().targetCommitteeSize;
  const lag = ctx.epochCache.getLagInEpochsForValidatorSet();

  let attesterCount: number;
  let hasProducedBlocks: boolean;
  try {
    [attesterCount, hasProducedBlocks] = await Promise.all([
      ctx.rollupContract.getActiveAttesterCount(),
      ctx.l2BlockSource.getBlockNumber().then(n => n > 0),
    ]);
  } catch (err) {
    ctx.logger.warn(`No committee found for slot ${targetSlot}; could not determine validator set size`, {
      targetSlot,
      targetEpoch,
      targetCommitteeSize,
      err,
    });
    return;
  }

  const diagnosis = classifyMissingCommittee({ attesterCount, targetCommitteeSize, hasProducedBlocks });
  const logCtx = { targetSlot, targetEpoch, attesterCount, targetCommitteeSize, cause: diagnosis.cause };

  switch (diagnosis.cause) {
    case 'awaiting-sampling-lag': {
      const firstCommitteeEpoch = await estimateFirstCommitteeEpoch(targetEpoch, lag, targetCommitteeSize, ctx);
      const staked = `${attesterCount} validators are staked (>= ${targetCommitteeSize} required)`;
      const forming = `the committee is still forming as the ${lag}-epoch sampling window advances`;
      // When we could not pin the exact epoch, report the safe upper bound rather than a misleading ETA.
      const epoch = firstCommitteeEpoch ?? EpochNumber(targetEpoch + lag + 1);
      const expectation =
        firstCommitteeEpoch === undefined
          ? `A committee should exist no later than epoch ${epoch}.`
          : `The first committee is expected at epoch ${epoch}${formatEpochEta(epoch, ctx)}.`;
      ctx.logger.info(`No committee for slot ${targetSlot} yet: ${staked}, ${forming}. ${expectation}`, {
        ...logCtx,
        firstCommitteeEpoch: epoch,
      });
      break;
    }
    case 'awaiting-first-validators':
      ctx.logger.info(
        `No committee for slot ${targetSlot}: the chain has not started producing blocks and only ${attesterCount} ` +
          `of the ${targetCommitteeSize} required validators are staked. Block production begins once at least ` +
          `${targetCommitteeSize} validators stake and the ${lag}-epoch sampling lag elapses.`,
        logCtx,
      );
      break;
    case 'validator-set-shrank':
      ctx.logger.warn(
        `No committee for slot ${targetSlot}: the validator set has dropped to ${attesterCount}, below the ` +
          `${targetCommitteeSize} required to form a committee. The chain cannot progress until enough validators ` +
          `are staked again — check for validators exiting or being slashed.`,
        logCtx,
      );
      break;
  }
}

/**
 * Classifies why no committee exists for a slot, using only cheap live signals: the current attester count
 * and whether the chain has ever produced a block. See {@link MissingCommitteeCause} for the reasoning.
 */
export function classifyMissingCommittee(args: {
  attesterCount: number;
  targetCommitteeSize: number;
  hasProducedBlocks: boolean;
}): MissingCommitteeDiagnosis {
  const { attesterCount, targetCommitteeSize, hasProducedBlocks } = args;

  if (attesterCount >= targetCommitteeSize) {
    return { cause: 'awaiting-sampling-lag', severity: 'info' };
  }

  if (hasProducedBlocks) {
    return { cause: 'validator-set-shrank', severity: 'warn' };
  }

  return { cause: 'awaiting-first-validators', severity: 'info' };
}

/**
 * Given each candidate epoch after the one we failed to propose at, paired with the attester count staked at
 * that epoch's validator-set sample time (`undefined` when the sample time is still in the future), returns
 * the earliest epoch that will have a committee, or `undefined` if none qualifies.
 *
 * Candidates must be ordered ascending by epoch. A committee for epoch `E` exists iff at least
 * `targetCommitteeSize` validators were staked at `E`'s sample time, so the first candidate whose sampled
 * count meets the target is the answer; a candidate whose sample time is still in the future is assumed to
 * have a committee if the set holds and wins as soon as it is reached. The predicate is not monotone in `E`
 * (the set can dip below target between sample times), so this must scan ascending rather than binary-search.
 */
export function findFirstEpochWithCommittee(args: {
  candidates: { epoch: EpochNumber; sampledAttesterCount: number | undefined }[];
  targetCommitteeSize: number;
}): EpochNumber | undefined {
  return args.candidates.find(
    c => c.sampledAttesterCount === undefined || c.sampledAttesterCount >= args.targetCommitteeSize,
  )?.epoch;
}

/**
 * Earliest epoch expected to have a committee, replaying L1's validator-set sampling rule: a committee for
 * epoch `E` exists iff at least `targetCommitteeSize` attesters were staked at `E`'s sample time
 * (`epochStart(E) - lag * epochDuration`). Only epochs after the one we failed at can qualify, and the set
 * must have crossed the target within the last `lag` epochs' sample window, so the answer lies in
 * `(targetEpoch, targetEpoch + lag + 1]`. Reads the historical attester count at each candidate's sample time
 * (at most `lag` on-chain reads; future sample times are assumed to hold). Returns `undefined` if no candidate
 * qualifies or the reads fail, leaving the caller to report a bound instead of an ETA.
 */
async function estimateFirstCommitteeEpoch(
  targetEpoch: EpochNumber,
  lag: number,
  targetCommitteeSize: number,
  ctx: MissingCommitteeContext,
): Promise<EpochNumber | undefined> {
  try {
    const epochDurationSeconds = BigInt(ctx.l1Constants.epochDuration * ctx.l1Constants.slotDuration);
    const nowSeconds = BigInt(ctx.dateProvider.nowInSeconds());
    const candidates = await timesParallel(lag + 1, async i => {
      const epoch = EpochNumber(targetEpoch + 1 + i);
      const sampleTime = getStartTimestampForEpoch(epoch, ctx.l1Constants) - epochDurationSeconds * BigInt(lag);
      const sampledAttesterCount =
        sampleTime > nowSeconds ? undefined : await ctx.rollupContract.getAttesterCountAtTime(sampleTime);
      return { epoch, sampledAttesterCount };
    });
    return findFirstEpochWithCommittee({ candidates, targetCommitteeSize });
  } catch (err) {
    ctx.logger.debug(`Could not estimate first committee epoch after epoch ${targetEpoch}`, { targetEpoch, err });
    return undefined;
  }
}

/** Formats the ETA to the start of the given epoch as ` (~12m from now)`, or empty if it is in the past. */
function formatEpochEta(epoch: EpochNumber, ctx: MissingCommitteeContext): string {
  const secondsUntil = Number(getStartTimestampForEpoch(epoch, ctx.l1Constants)) - ctx.dateProvider.nowInSeconds();
  return secondsUntil > 0 ? ` (~${formatSeconds(secondsUntil)} from now)` : '';
}
