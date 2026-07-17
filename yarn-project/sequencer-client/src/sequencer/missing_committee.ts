import { EpochNumber } from '@aztec/foundation/branded-types';

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

/** How the first-committee epoch estimate was derived; drives the log wording and confidence. */
export type FirstCommitteeEpochProvenance =
  /** The set was already full at this epoch's (past) sample time, so its committee is guaranteed. */
  | 'historical'
  /** This epoch's sample time is still in the future; a committee is expected assuming the set holds. */
  | 'projected-future'
  /** No candidate qualified from the on-chain reads; the epoch is a safe upper bound, not an ETA. */
  | 'fallback';

/** The earliest epoch expected to have a committee, together with how confident that estimate is. */
export interface FirstCommitteeEpoch {
  epoch: EpochNumber;
  provenance: FirstCommitteeEpochProvenance;
}

/**
 * Given each candidate epoch after the one we failed to propose at, paired with the attester count that was
 * staked at that epoch's validator-set sample time (`undefined` when the sample time is still in the future),
 * returns the earliest epoch that will have a committee.
 *
 * The candidates must be ordered ascending by epoch. A committee for epoch `E` exists iff at least
 * `targetCommitteeSize` validators were staked at `E`'s sample time, so the first candidate whose sampled
 * count meets the target is the first epoch with a committee. A candidate whose sample time lies in the
 * future (`sampledAttesterCount === undefined`) is assumed to have a committee if the set holds, so it wins
 * as soon as it is reached. If nothing qualifies, `fallbackEpoch` is returned as an upper bound. The
 * predicate is not monotone in `E` (the set can dip below target between sample times), so this must scan
 * ascending rather than binary-search.
 */
export function findFirstEpochWithCommittee(args: {
  candidates: { epoch: EpochNumber; sampledAttesterCount: number | undefined }[];
  targetCommitteeSize: number;
  fallbackEpoch: EpochNumber;
}): FirstCommitteeEpoch {
  const { candidates, targetCommitteeSize, fallbackEpoch } = args;
  for (const { epoch, sampledAttesterCount } of candidates) {
    if (sampledAttesterCount === undefined) {
      return { epoch, provenance: 'projected-future' };
    }
    if (sampledAttesterCount >= targetCommitteeSize) {
      return { epoch, provenance: 'historical' };
    }
  }
  return { epoch: fallbackEpoch, provenance: 'fallback' };
}
