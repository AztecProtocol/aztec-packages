import type { GovernanceProposerContract, RollupContract } from '@aztec/ethereum/contracts';

export { type SequencerConfig } from '@aztec/stdlib/config';

export type SequencerContracts = {
  rollupContract: RollupContract;
  governanceProposerContract: GovernanceProposerContract;
};
