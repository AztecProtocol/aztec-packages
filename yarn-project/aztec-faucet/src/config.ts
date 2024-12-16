import { type L1ReaderConfig, l1ReaderConfigMappings } from '@aztec/ethereum';
import { type ConfigMappingsType, getConfigFromMappings, numberConfigHelper } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';

export type L1AssetConfig = {
  address: EthAddress;
  amount: bigint;
};

export type FaucetConfig = L1ReaderConfig & {
  l1Mnemonic: string;
  mnemonicAccountIndex: number;
  interval: number;
  ethAmount: string;
  l1Assets: L1AssetConfig[];
};

export const faucetConfigMapping: ConfigMappingsType<FaucetConfig> = {
  ...l1ReaderConfigMappings,
  l1Mnemonic: {
    env: 'MNEMONIC',
    description: 'The mnemonic for the faucet account',
  },
  mnemonicAccountIndex: {
    env: 'FAUCET_MNEMONIC_ACCOUNT_INDEX',
    description: 'The account to use',
    ...numberConfigHelper(0),
  },
  interval: {
    env: 'FAUCET_INTERVAL_MS',
    description: 'How often the faucet can be dripped',
    ...numberConfigHelper(1 * 60 * 60 * 1000), // 1 hour
  },
  ethAmount: {
    env: 'FAUCET_ETH_AMOUNT',
    description: 'How much eth the faucet should drip per call',
    defaultValue: '1.0',
  },
  l1Assets: {
    env: 'FAUCET_L1_ASSETS',
    description: 'Which other L1 assets the faucet is able to drip',
    defaultValue: '',
    parseEnv(val): L1AssetConfig[] {
      const assetConfigs = val.split(',');
      return assetConfigs.flatMap(assetConfig => {
        if (!assetConfig) {
          return [];
        }
        const [address, amount = '1e9'] = assetConfig.split(':');
        return [{ address: EthAddress.fromString(address), amount: BigInt(amount) }];
      });
    },
  },
};

export function getFaucetConfigFromEnv(): FaucetConfig {
  return getConfigFromMappings(faucetConfigMapping);
}
