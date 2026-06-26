import { jest } from '@jest/globals';

const TEST_TIMEOUT = 600_000; // 10 minutes

jest.setTimeout(TEST_TIMEOUT);

export const NUM_VALIDATORS = 4;
export const COMMITTEE_SIZE = NUM_VALIDATORS;
export const ETHEREUM_SLOT_DURATION = 8;
export const AZTEC_SLOT_DURATION = ETHEREUM_SLOT_DURATION * 3;
export const BLOCK_DURATION = 4;

// Small slashing unit so we don't kick anyone out.
export const slashingUnit = BigInt(1e14);
export const slashingQuorum = 3;
export const slashingRoundSize = 4;
export const aztecEpochDuration = 2;

/**
 * The shared per-test slashing config for the offense-detection suites (`duplicate_proposal`,
 * `duplicate_attestation`). Spread into a {@link MultiNodeTestContext.setup} call alongside
 * {@link SLASHER_ENABLED_MULTI_VALIDATOR_OPTS} and `initialValidators` (from `buildMockGossipValidators`).
 */
export const baseSlashingOpts = {
  anvilSlotsInAnEpoch: 4,
  listenAddress: '127.0.0.1',
  aztecEpochDuration,
  ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
  aztecSlotDuration: AZTEC_SLOT_DURATION,
  aztecTargetCommitteeSize: COMMITTEE_SIZE,
  aztecProofSubmissionEpochs: 1024, // effectively do not reorg
  slashInactivityConsecutiveEpochThreshold: 32, // effectively do not slash for inactivity
  minTxsPerBlock: 0, // always be building
  slashingQuorum,
  slashingRoundSizeInEpochs: slashingRoundSize / aztecEpochDuration,
  slashAmountSmall: slashingUnit,
  slashAmountMedium: slashingUnit * 2n,
  slashAmountLarge: slashingUnit * 3n,
  blockDurationMs: BLOCK_DURATION * 1000,
  slashDuplicateProposalPenalty: slashingUnit,
  slashingOffsetInRounds: 1,
};

export { jest };
