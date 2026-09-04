import { type L1ContractAddresses, pickL1ContractAddressMappings } from '@aztec/ethereum/l1-contract-addresses';
import { type ConfigMappingsType, numberConfigHelper } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';

export { type InboxL1Confirmations, type SequencerConfig, SequencerConfigSchema } from '../interfaces/configs.js';
export { type AllowedElement } from '../interfaces/allowed_element.js';

export const emptyChainConfig: ChainConfig = {
  l1ChainId: 0,
  rollupVersion: 0,
  rollupAddress: EthAddress.ZERO,
};

export const chainConfigMappings: ConfigMappingsType<ChainConfig> = {
  l1ChainId: {
    env: 'L1_CHAIN_ID',
    ...numberConfigHelper(31337),
    description: 'The chain ID of the ethereum host.',
  },
  rollupVersion: {
    env: 'ROLLUP_VERSION',
    description: 'The version of the rollup.',
    parseEnv: (val: string) => {
      const parsed = parseInt(val, 10);
      if (!Number.isSafeInteger(parsed)) {
        throw new Error(`Invalid rollup version: ${val}`);
      }
      return parsed;
    },
  },
  ...pickL1ContractAddressMappings('rollupAddress'),
};

/** Chain configuration. */
export type ChainConfig = {
  /** The chain id of the ethereum host. */
  l1ChainId: number;
  /** The version of the rollup. */
  rollupVersion: number;
} & Pick<L1ContractAddresses, 'rollupAddress'>;
