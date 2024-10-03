import { type ConfigMappingsType, bigintConfigHelper, getConfigFromMappings } from '@aztec/foundation/config';

export type ProverBondManagerConfig = {
  proverMinimumStakeAmount: bigint;
  proverTargetStakeAmount?: bigint;
};

export const proverBondManagerConfigMappings: ConfigMappingsType<ProverBondManagerConfig> = {
  proverMinimumStakeAmount: {
    env: 'PROVER_MINIMUM_STAKE_AMOUNT',
    description:
      'Minimum amount to ensure is staked in the escrow contract for this prover. Prover node will top up whenever escrow falls below this number.',
    ...bigintConfigHelper(100000n),
  },
  proverTargetStakeAmount: {
    env: 'PROVER_TARGET_STAKE_AMOUNT',
    description:
      'Target amount to ensure is staked in the escrow contract for this prover. Prover node will top up to this value. Defaults to the minimum amount.',
    ...bigintConfigHelper(),
  },
};

export function getProverBondManagerConfigFromEnv(): ProverBondManagerConfig {
  return getConfigFromMappings<ProverBondManagerConfig>(proverBondManagerConfigMappings);
}
