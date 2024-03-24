import { EthAddress } from '@aztec/foundation/eth-address';
import { optionalEthAddress, z } from '@aztec/foundation/zod';

export const l1ContractsNames = [
  'availabilityOracleAddress',
  'rollupAddress',
  'registryAddress',
  'inboxAddress',
  'outboxAddress',
  'gasTokenAddress',
  'gasPortalAddress',
] as const;

/**
 * Provides the directory of current L1 contract addresses
 */
export type L1ContractAddresses = {
  [K in (typeof l1ContractsNames)[number]]: EthAddress;
};

export const l1ContractAddresses = z
  .object<Record<(typeof l1ContractsNames)[number], typeof optionalEthAddress>>({
    availabilityOracleAddress: optionalEthAddress,
    rollupAddress: optionalEthAddress,
    registryAddress: optionalEthAddress,
    inboxAddress: optionalEthAddress,
    outboxAddress: optionalEthAddress,
    gasTokenAddress: optionalEthAddress,
    gasPortalAddress: optionalEthAddress,
  })
  .default({});
