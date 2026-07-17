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
  /**
   * Latest epoch by which a committee is guaranteed to exist, assuming the validator set stays at or above
   * the target. Only set when enough validators are already staked (`awaiting-sampling-lag`).
   */
  expectedByEpoch?: EpochNumber;
}

/**
 * Classifies why no committee exists for a slot, using only cheap live signals: the current attester count
 * and whether the chain has ever produced a block. See {@link MissingCommitteeCause} for the reasoning.
 */
export function classifyMissingCommittee(args: {
  attesterCount: number;
  targetCommitteeSize: number;
  currentEpoch: EpochNumber;
  lagInEpochsForValidatorSet: number;
  hasProducedBlocks: boolean;
}): MissingCommitteeDiagnosis {
  const { attesterCount, targetCommitteeSize, currentEpoch, lagInEpochsForValidatorSet, hasProducedBlocks } = args;

  if (attesterCount >= targetCommitteeSize) {
    // A committee for epoch E samples the set at E - lag, so once the set is full every epoch from
    // current + lag + 1 onwards samples a full set and is guaranteed a committee.
    return {
      cause: 'awaiting-sampling-lag',
      severity: 'info',
      expectedByEpoch: EpochNumber(currentEpoch + lagInEpochsForValidatorSet + 1),
    };
  }

  if (hasProducedBlocks) {
    return { cause: 'validator-set-shrank', severity: 'warn' };
  }

  return { cause: 'awaiting-first-validators', severity: 'info' };
}
