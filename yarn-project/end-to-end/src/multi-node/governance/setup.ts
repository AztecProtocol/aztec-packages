import { jest } from '@jest/globals';

jest.setTimeout(1000 * 60 * 10);

/**
 * The shortened block-time timing the governance tests run on: a 12s L2 slot, 4s L1 slot, and a long
 * proof-submission window so unproven blocks are never pruned (the committee runs no prover). Spread into
 * a {@link MultiNodeTestContext.setup} call alongside {@link MOCK_GOSSIP_MULTI_VALIDATOR_OPTS} and
 * `initialValidators`.
 */
export const GOVERNANCE_TIMING = {
  aztecSlotDuration: 12,
  ethereumSlotDuration: 4,
  aztecProofSubmissionEpochs: 640,
} as const;

export { jest };
