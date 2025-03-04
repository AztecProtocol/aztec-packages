import type { ConfigMappingsType } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

export const L1ContractsNames = ['registryAddress'] as const;

/** Provides the directory of current L1 contract addresses */
export type L1ContractAddresses = {
  registryAddress: EthAddress;
  slashFactoryAddress?: EthAddress | undefined;
};

export const L1ContractAddressesSchema = z.object({
  registryAddress: schemas.EthAddress,
  slashFactoryAddress: schemas.EthAddress.optional(),
}) satisfies ZodFor<L1ContractAddresses>;

const parseEnv = (val: string) => EthAddress.fromString(val);

export const l1ContractAddressesMapping: ConfigMappingsType<L1ContractAddresses> = {
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
