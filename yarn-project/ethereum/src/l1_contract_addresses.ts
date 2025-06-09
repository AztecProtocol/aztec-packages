import type { ConfigMappingsType } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

/**
 * The names of the current L1 contract addresses.
 * NOTE: When changing this list, make sure to update CLI & CI scripts accordingly.
 * For reference: https://github.com/AztecProtocol/aztec-packages/pull/5553
 */
export const L1ContractsNames = [
  'rollupAddress',
  'registryAddress',
  'inboxAddress',
  'outboxAddress',
  'feeJuiceAddress',
  'feeJuicePortalAddress',
  'coinIssuerAddress',
  'rewardDistributorAddress',
  'governanceProposerAddress',
  'governanceAddress',
  'stakingAssetAddress',
] as const;

/** Provides the directory of current L1 contract addresses */
export type L1ContractAddresses = {
  [K in (typeof L1ContractsNames)[number]]: EthAddress;
} & {
  slashFactoryAddress?: EthAddress | undefined;
  feeAssetHandlerAddress?: EthAddress | undefined;
  stakingAssetHandlerAddress?: EthAddress | undefined;
  zkPassportVerifierAddress?: EthAddress | undefined;
  gseAddress?: EthAddress | undefined;
};

export const L1ContractAddressesSchema = z.object({
  rollupAddress: schemas.EthAddress,
  registryAddress: schemas.EthAddress,
  inboxAddress: schemas.EthAddress,
  outboxAddress: schemas.EthAddress,
  feeJuiceAddress: schemas.EthAddress,
  stakingAssetAddress: schemas.EthAddress,
  feeJuicePortalAddress: schemas.EthAddress,
  coinIssuerAddress: schemas.EthAddress,
  rewardDistributorAddress: schemas.EthAddress,
  governanceProposerAddress: schemas.EthAddress,
  governanceAddress: schemas.EthAddress,
  slashFactoryAddress: schemas.EthAddress.optional(),
  feeAssetHandlerAddress: schemas.EthAddress.optional(),
  stakingAssetHandlerAddress: schemas.EthAddress.optional(),
  zkPassportVerifierAddress: schemas.EthAddress.optional(),
  gseAddress: schemas.EthAddress.optional(),
}) satisfies ZodFor<L1ContractAddresses>;

const parseEnv = (val: string) => EthAddress.fromString(val);

export const l1ContractAddressesMapping: ConfigMappingsType<
  Omit<L1ContractAddresses, 'gseAddress' | 'zkPassportVerifierAddress'>
> = {
  rollupAddress: {
    env: 'ROLLUP_CONTRACT_ADDRESS',
    description: 'The deployed L1 rollup contract address.',
    parseEnv,
  },
  registryAddress: {
    env: 'REGISTRY_CONTRACT_ADDRESS',
    description: 'The deployed L1 registry contract address.',
    parseEnv,
  },
  inboxAddress: {
    env: 'INBOX_CONTRACT_ADDRESS',
    description: 'The deployed L1 inbox contract address.',
    parseEnv,
  },
  outboxAddress: {
    env: 'OUTBOX_CONTRACT_ADDRESS',
    description: 'The deployed L1 outbox contract address.',
    parseEnv,
  },
  feeJuiceAddress: {
    env: 'FEE_JUICE_CONTRACT_ADDRESS',
    description: 'The deployed L1 Fee Juice contract address.',
    parseEnv,
  },
  stakingAssetAddress: {
    env: 'STAKING_ASSET_CONTRACT_ADDRESS',
    description: 'The deployed L1 staking asset contract address.',
    parseEnv,
  },
  feeJuicePortalAddress: {
    env: 'FEE_JUICE_PORTAL_CONTRACT_ADDRESS',
    description: 'The deployed L1 Fee Juice portal contract address.',
    parseEnv,
  },
  coinIssuerAddress: {
    env: 'COIN_ISSUER_CONTRACT_ADDRESS',
    description: 'The deployed L1 coinIssuer contract address',
    parseEnv,
  },
  rewardDistributorAddress: {
    env: 'REWARD_DISTRIBUTOR_CONTRACT_ADDRESS',
    description: 'The deployed L1 rewardDistributor contract address',
    parseEnv,
  },
  governanceProposerAddress: {
    env: 'GOVERNANCE_PROPOSER_CONTRACT_ADDRESS',
    description: 'The deployed L1 governanceProposer contract address',
    parseEnv,
  },
  governanceAddress: {
    env: 'GOVERNANCE_CONTRACT_ADDRESS',
    description: 'The deployed L1 governance contract address',
    parseEnv,
  },
  slashFactoryAddress: {
    env: 'SLASH_FACTORY_CONTRACT_ADDRESS',
    description: 'The deployed L1 slashFactory contract address',
    parseEnv,
  },
  feeAssetHandlerAddress: {
    env: 'FEE_ASSET_HANDLER_CONTRACT_ADDRESS',
    description: 'The deployed L1 feeAssetHandler contract address',
    parseEnv,
  },
  stakingAssetHandlerAddress: {
    env: 'STAKING_ASSET_HANDLER_CONTRACT_ADDRESS',
    description: 'The deployed L1 stakingAssetHandler contract address',
    parseEnv,
  },
};
