import type { GovernanceProposerContract } from '@aztec/ethereum/contracts';
import type { RollupContract } from '@aztec/ethereum/contracts/rollup';

export { type SequencerConfig } from '@aztec/stdlib/config';

export type SequencerContracts = {
  rollupContract: RollupContract;
  governanceProposerContract: GovernanceProposerContract;
};
