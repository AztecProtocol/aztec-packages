/**
 * Default configuration values (matching Solidity defaults).
 */

import {
  hours,
  days,
  type RollupConfiguration,
  type GovernanceConfiguration,
  type GseConfiguration,
  type GovernanceProposerConfiguration,
  type ZkPassportConfiguration,
} from "./types.ts";

export const DEFAULT_ROLLUP_CONFIG: RollupConfiguration = {
  aztecSlotDuration: 36,
  aztecEpochDuration: 32,
  targetCommitteeSize: 48,
  lagInEpochsForValidatorSet: 2,
  lagInEpochsForRandao: 2,
  aztecProofSubmissionEpochs: 1,
  localEjectionThreshold: 198n * 10n ** 18n,
  slashingQuorum: 65, // (32 * 4) / 2 + 1
  slashingRoundSize: 128, // 4 * 32
  slashingLifetimeInRounds: 5,
  slashingExecutionDelayInRounds: 0,
  slashAmounts: {
    small: 10n * 10n ** 18n,
    medium: 20n * 10n ** 18n,
    large: 50n * 10n ** 18n,
  },
  slashingOffsetInRounds: 2,
  slasherFlavor: "tally",
  slashingDisableDuration: days(5),
  manaTarget: 100_000_000,
  exitDelaySeconds: days(2),
  provingCostPerMana: 100,
  reward: {
    sequencerBps: 7000,
    checkpointReward: 400n * 10n ** 18n,
  },
  rewardBoost: {
    increment: 125_000,
    maxScore: 15_000_000,
    a: 1000,
    minimum: 100_000,
    k: 1_000_000,
  },
  stakingQueue: {
    bootstrapValidatorSetSize: 0,
    bootstrapFlushSize: 0,
    normalFlushSizeMin: 48,
    normalFlushSizeQuotient: 2,
    maxQueueFlushSize: 48,
  },
};

export const DEFAULT_GOVERNANCE_CONFIG: GovernanceConfiguration = {
  proposeConfig: {
    lockDelay: days(30),
    lockAmount: 10n ** 24n,
  },
  votingDelay: 60,
  votingDuration: hours(1),
  executionDelay: 60,
  gracePeriod: days(7),
  quorum: 10n ** 17n, // 0.1e18 = 10%
  requiredYeaMargin: 4n * 10n ** 16n, // 0.04e18 = 4%
  minimumVotes: 400n * 10n ** 18n,
};

export const DEFAULT_GSE_CONFIG: GseConfiguration = {
  activationThreshold: 100n * 10n ** 18n,
  ejectionThreshold: 50n * 10n ** 18n,
};

export const DEFAULT_GOVERNANCE_PROPOSER_CONFIG: GovernanceProposerConfiguration = {
  roundSize: 300,
  quorum: 151, // roundSize / 2 + 1
};

export const DEFAULT_ZKPASSPORT_CONFIG: ZkPassportConfiguration = {
  domain: "sequencer.alpha-testnet.aztec.network",
  scope: "personhood",
};
