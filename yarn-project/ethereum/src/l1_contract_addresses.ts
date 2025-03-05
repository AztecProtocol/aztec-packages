import type { ConfigMappingsType } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

export const AllL1ContractsNames = [
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

export type AllL1ContractAddresses = {
  [K in (typeof AllL1ContractsNames)[number]]: EthAddress;
} & { slashFactoryAddress?: EthAddress | undefined };

export const AllL1ContractAddressesSchema = z.object({
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
}) satisfies ZodFor<AllL1ContractAddresses>;

/** Provides the directory of current L1 contract addresses */
export type CoreL1ContractAddresses = Pick<AllL1ContractAddresses, 'registryAddress' | 'slashFactoryAddress'>;

export const L1ContractAddressesSchema = z.object({
  registryAddress: schemas.EthAddress,
  slashFactoryAddress: schemas.EthAddress.optional(),
}) satisfies ZodFor<CoreL1ContractAddresses>;

const parseEnv = (val: string) => EthAddress.fromString(val);

export const l1ContractAddressesMapping: ConfigMappingsType<CoreL1ContractAddresses> = {
  registryAddress: {
    env: 'REGISTRY_CONTRACT_ADDRESS',
    description: 'The deployed L1 registry contract address.',
    parseEnv,
  },
  slashFactoryAddress: {
    env: 'SLASH_FACTORY_CONTRACT_ADDRESS',
    description: 'The deployed L1 slashFactory contract address',
    parseEnv,
  },
};
