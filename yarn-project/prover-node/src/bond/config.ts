import { type ConfigMappingsType, bigintConfigHelper, getConfigFromMappings } from '@aztec/foundation/config';

export type ProverBondManagerConfig = {
  proverMinimumEscrowAmount: bigint;
  proverTargetEscrowAmount?: bigint;
};

export const proverBondManagerConfigMappings: ConfigMappingsType<ProverBondManagerConfig> = {
  proverMinimumEscrowAmount: {
    env: 'PROVER_MINIMUM_ESCROW_AMOUNT',
    description:
      'Minimum amount to ensure is staked in the escrow contract for this prover. Prover node will top up whenever escrow falls below this number.',
    ...bigintConfigHelper(100000n),
  },
  proverTargetEscrowAmount: {
    env: 'PROVER_TARGET_ESCROW_AMOUNT',
    description:
      'Target amount to ensure is staked in the escrow contract for this prover. Prover node will top up to this value. Defaults to twice the minimum amount.',
    ...bigintConfigHelper(),
  },
};

export function getProverBondManagerConfigFromEnv(): ProverBondManagerConfig {
  return getConfigFromMappings<ProverBondManagerConfig>(proverBondManagerConfigMappings);
}
