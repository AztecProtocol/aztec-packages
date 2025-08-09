import type { GovernanceProposerContract, RollupContract, SlashingProposerContract } from '@aztec/ethereum';

export { type SequencerConfig } from '@aztec/stdlib/config';

export type SequencerContracts = {
  rollupContract: RollupContract;
  governanceProposerContract: GovernanceProposerContract;
  slashingProposerContract: SlashingProposerContract;
};
