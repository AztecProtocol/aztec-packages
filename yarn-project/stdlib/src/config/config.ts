import { l1ContractAddressesMapping } from '@aztec/ethereum/l1-contract-addresses';
import { type ConfigMappingsType, numberConfigHelper } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';

export { type AllowedElement, type SequencerConfig, SequencerConfigSchema } from '../interfaces/configs.js';

export const emptyChainConfig: ChainConfig = {
  l1ChainId: 0,
  l1Contracts: { rollupAddress: EthAddress.ZERO },
  version: 0,
};

export const chainConfigMappings: ConfigMappingsType<ChainConfig> = {
  l1ChainId: {
    env: 'L1_CHAIN_ID',
    parseEnv: (val: string) => +val,
    defaultValue: 31337,
    description: 'The chain ID of the ethereum host.',
  },
  version: {
    env: 'VERSION',
    description: 'The version of the rollup.',
    ...numberConfigHelper(1),
  },
  l1Contracts: {
    description: 'The deployed L1 contract addresses',
    nested: l1ContractAddressesMapping,
  },
};

/** Chain configuration. */
export type ChainConfig = {
  /** The chain id of the ethereum host. */
  l1ChainId: number;
  /** The version of the rollup. */
  version: number;
  /** The address to the L1 contracts. */
  l1Contracts: {
    /** The address to rollup */
    rollupAddress: EthAddress;
  };
};
