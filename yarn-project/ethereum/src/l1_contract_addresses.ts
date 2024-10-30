import { type ConfigMappingsType } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';

/**
 * The names of the current L1 contract addresses.
 * NOTE: When changing this list, make sure to update CLI & CI scripts accordingly.
 * For reference: https://github.com/AztecProtocol/aztec-packages/pull/5553
 */
export const l1ContractsNames = [
  'rollupAddress',
  'registryAddress',
  'inboxAddress',
  'outboxAddress',
  'feeJuiceAddress',
  'feeJuicePortalAddress',
  'nomismatokopioAddress',
  'sysstiaAddress',
  'gerousiaAddress',
  'apellaAddress',
] as const;

/**
 * Provides the directory of current L1 contract addresses
 */
export type L1ContractAddresses = {
  [K in (typeof l1ContractsNames)[number]]: EthAddress;
};

const parseEnv = (val: string) => EthAddress.fromString(val);

export const l1ContractAddressesMapping: ConfigMappingsType<L1ContractAddresses> = {
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
  feeJuicePortalAddress: {
    env: 'FEE_JUICE_PORTAL_CONTRACT_ADDRESS',
    description: 'The deployed L1 Fee Juice portal contract address.',
    parseEnv,
  },
  nomismatokopioAddress: {
    env: 'NOMISMATOKOPIO_CONTRACT_ADDRESS',
    description: 'The deployed L1 nomismatokopio contract address',
    parseEnv,
  },
  sysstiaAddress: {
    env: 'SYSSTIA_CONTRACT_ADDRESS',
    description: 'The deployed L1 sysstia contract address',
    parseEnv,
  },
  gerousiaAddress: {
    env: 'GEROUSIA_CONTRACT_ADDRESS',
    description: 'The deployed L1 gerousia contract address',
    parseEnv,
  },
  apellaAddress: {
    env: 'APELLA_CONTRACT_ADDRESS',
    description: 'The deployed L1 apella contract address',
    parseEnv,
  },
};
