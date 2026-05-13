import type { ConfigMapping, ConfigMappingsType } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

/**
 * Required L1 contract address keys.
 * NOTE: When changing this list, make sure to update CLI & CI scripts accordingly.
 * For reference: https://github.com/AztecProtocol/aztec-packages/pull/5553
 */
const REQUIRED_L1_CONTRACT_ADDRESS_KEYS = [
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

/** Optional L1 contract address keys — present only in some deployments. */
export const OPTIONAL_L1_CONTRACT_ADDRESS_KEYS = [
  'feeAssetHandlerAddress',
  'stakingAssetHandlerAddress',
  'zkPassportVerifierAddress',
  'gseAddress',
  'dateGatedRelayerAddress',
] as const;

type RequiredContractKey = (typeof REQUIRED_L1_CONTRACT_ADDRESS_KEYS)[number];
type OptionalContractKey = (typeof OPTIONAL_L1_CONTRACT_ADDRESS_KEYS)[number];

/** Provides the directory of current L1 contract addresses */
export type L1ContractAddresses = {
  [K in RequiredContractKey]: EthAddress;
} & {
  [K in OptionalContractKey]?: EthAddress;
};

/**
 * Names of required L1 contract addresses.
 * NOTE: When changing the set of contracts, update CLI & CI scripts accordingly.
 * For reference: https://github.com/AztecProtocol/aztec-packages/pull/5553
 */
export const L1ContractsNames = REQUIRED_L1_CONTRACT_ADDRESS_KEYS;

const parseEnv = (val: string) => EthAddress.fromString(val);
const addrEnv = (description: string, env?: ConfigMapping<EthAddress>['env']): ConfigMapping<EthAddress> => ({
  description,
  parseEnv,
  ...(env && { env }),
});

/**
 * Config mapping for all L1 contract addresses.
 * This is the single source of truth for which contract addresses exist and how to parse them.
 */
export const l1ContractAddressesMapping: ConfigMappingsType<L1ContractAddresses> = {
  rollupAddress: addrEnv('The deployed L1 rollup contract address.'),
  registryAddress: addrEnv('The deployed L1 registry contract address.', 'REGISTRY_CONTRACT_ADDRESS'),
  inboxAddress: addrEnv('The deployed L1 inbox contract address.'),
  outboxAddress: addrEnv('The deployed L1 outbox contract address.'),
  feeJuiceAddress: addrEnv('The deployed L1 Fee Juice contract address.'),
  feeJuicePortalAddress: addrEnv('The deployed L1 Fee Juice portal contract address.'),
  coinIssuerAddress: addrEnv('The deployed L1 coinIssuer contract address'),
  rewardDistributorAddress: addrEnv('The deployed L1 rewardDistributor contract address'),
  governanceProposerAddress: addrEnv('The deployed L1 governanceProposer contract address'),
  governanceAddress: addrEnv('The deployed L1 governance contract address'),
  stakingAssetAddress: addrEnv('The deployed L1 staking asset contract address.'),
  feeAssetHandlerAddress: addrEnv(
    'The deployed L1 feeAssetHandler contract address',
    'FEE_ASSET_HANDLER_CONTRACT_ADDRESS',
  ),
  stakingAssetHandlerAddress: addrEnv('The deployed L1 stakingAssetHandler contract address'),
  zkPassportVerifierAddress: addrEnv('The deployed L1 ZK passport verifier contract address'),
  gseAddress: addrEnv('The deployed L1 GSE contract address'),
  dateGatedRelayerAddress: addrEnv('The deployed L1 date-gated relayer contract address'),
};

/** Keys present in {@link l1ContractAddressesMapping}. */
export type L1ContractAddressMappingKey = keyof typeof l1ContractAddressesMapping;

type RequiredAddressShape = { [K in RequiredContractKey]: typeof schemas.EthAddress };
type OptionalAddressShape = { [K in OptionalContractKey]: ReturnType<typeof schemas.EthAddress.optional> };

export const L1ContractAddressesSchema = z.object({
  ...(Object.fromEntries(REQUIRED_L1_CONTRACT_ADDRESS_KEYS.map(k => [k, schemas.EthAddress])) as RequiredAddressShape),
  ...(Object.fromEntries(
    OPTIONAL_L1_CONTRACT_ADDRESS_KEYS.map(k => [k, schemas.EthAddress.optional()]),
  ) as OptionalAddressShape),
});

/**
 * Selects entries from {@link l1ContractAddressesMapping} so composed configs can reuse the same
 * env vars, descriptions, and parsers without duplicating definitions.
 *
 * @example
 * ```ts
 * const mappings = {
 *   ...pickL1ContractAddressMappings('rollupAddress'),
 *   nodeId: { ... },
 * };
 * ```
 */
export function pickL1ContractAddressMappings<const K extends readonly L1ContractAddressMappingKey[]>(
  ...keys: K
): Pick<typeof l1ContractAddressesMapping, K[number]> {
  return Object.fromEntries(keys.map(key => [key, l1ContractAddressesMapping[key]] as const)) as Pick<
    typeof l1ContractAddressesMapping,
    K[number]
  >;
}

/**
 * Like {@link pickL1ContractAddressMappings}, but returns a fragment of {@link L1ContractAddressesSchema}'s shape for
 * spreading into `z.object({ ...pickL1ContractAddressesSchemaShape('rollupAddress'), localField: z... })`.
 */
export function pickL1ContractAddressesSchema<const K extends readonly L1ContractAddressMappingKey[]>(
  ...keys: K
): Pick<typeof L1ContractAddressesSchema.shape, K[number]> {
  return Object.fromEntries(keys.map(key => [key, L1ContractAddressesSchema.shape[key]])) as Pick<
    typeof L1ContractAddressesSchema.shape,
    K[number]
  >;
}

/** Builds an {@link L1ContractAddresses} object from config that stores those fields at the top level. */
export function pickL1ContractAddresses<T extends L1ContractAddresses>(config: T): L1ContractAddresses {
  const result: Partial<L1ContractAddresses> = {};
  for (const key of REQUIRED_L1_CONTRACT_ADDRESS_KEYS) {
    result[key] = config[key];
  }
  for (const key of OPTIONAL_L1_CONTRACT_ADDRESS_KEYS) {
    const v = config[key];
    if (v !== undefined) {
      result[key] = v;
    }
  }
  return result as L1ContractAddresses;
}

export function randomL1ContractAddresses(includeOptional: boolean = false): L1ContractAddresses {
  const keys = includeOptional ? [...L1ContractsNames, ...OPTIONAL_L1_CONTRACT_ADDRESS_KEYS] : L1ContractsNames;
  return Object.fromEntries(keys.map(name => [name, EthAddress.random()])) as L1ContractAddresses;
}
