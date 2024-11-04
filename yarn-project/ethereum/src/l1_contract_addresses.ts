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
  'coinIssuerAddress',
  'rewardDistributorAddress',
  'governanceProposerAddress',
  'governanceAddress',
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
};
