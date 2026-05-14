import { type L1ContractAddresses, pickL1ContractAddressMappings } from '@aztec/ethereum/l1-contract-addresses';
import { type L1ChainIdConfig, l1ChainIdConfigMappings } from '@aztec/ethereum/l1-reader';
import { type ConfigMappingsType, composeConfigMappings } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';

export { type SequencerConfig, SequencerConfigSchema } from '../interfaces/configs.js';
export { type AllowedElement } from '../interfaces/allowed_element.js';

/** Chain configuration. */
export type ChainConfig = L1ChainIdConfig & {
  /** The version of the rollup. */
  rollupVersion: number;
} & Pick<L1ContractAddresses, 'rollupAddress'>;

export const emptyChainConfig: ChainConfig = {
  l1ChainId: 0,
  rollupVersion: 0,
  rollupAddress: EthAddress.ZERO,
};

/** Re-exported for configs that only need l1ChainId without the full chain config. */
export { type L1ChainIdConfig, l1ChainIdConfigMappings as l1ChainIdConfigMapping };

type OwnChainConfig = Pick<ChainConfig, 'rollupVersion'>;

const ownChainConfigMappings: ConfigMappingsType<OwnChainConfig> = {
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
};

export const chainConfigMappings: ConfigMappingsType<ChainConfig> = composeConfigMappings(
  ownChainConfigMappings,
  l1ChainIdConfigMappings,
  pickL1ContractAddressMappings('rollupAddress'),
);
