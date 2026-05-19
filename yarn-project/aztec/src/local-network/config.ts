import { type AztecNodeConfig, aztecNodeConfigMappings } from '@aztec/aztec-node/config';
import { type GenesisStateConfig, genesisStateConfigMappings } from '@aztec/ethereum/config';
import {
  type ConfigMappingsType,
  type SecretValue,
  composeConfigMappings,
  secretStringConfigHelper,
} from '@aztec/foundation/config';

import { DefaultMnemonic } from '../mnemonic.js';

type OwnLocalNetworkConfig = {
  /** Mnemonic used to derive the L1 deployer private key. */
  l1Mnemonic: SecretValue<string>;
};

const ownLocalNetworkConfigMappings: ConfigMappingsType<OwnLocalNetworkConfig> = {
  l1Mnemonic: {
    env: 'MNEMONIC',
    description: 'Mnemonic used to derive the L1 deployer private key.',
    ...secretStringConfigHelper(DefaultMnemonic),
  },
};

/**
 * Local network settings. `GenesisStateConfig` keys (`testAccounts`, `sponsoredFPC`,
 * `prefundAddresses`) live on the genesis state mapping shared with the regular node config; the
 * local-network-specific default for `testAccounts` (true) is applied by callers, since the
 * generic node default is false.
 */
export type LocalNetworkConfig = AztecNodeConfig & OwnLocalNetworkConfig;

export const localNetworkConfigMappings: ConfigMappingsType<LocalNetworkConfig> = composeConfigMappings(
  ownLocalNetworkConfigMappings,
  aztecNodeConfigMappings,
);

/**
 * Narrowed mapping used to auto-generate `--local-network.*` CLI flags. Includes the
 * local-network-only fields plus genesis state config — those settings only matter when
 * initialising a fresh chain, which is exclusively a `--local-network` concern.
 *
 * Resolution at startup uses the full `localNetworkConfigMappings`; this subset is for CLI
 * registration only.
 */
export const localNetworkCliConfigMappings: ConfigMappingsType<OwnLocalNetworkConfig & GenesisStateConfig> =
  composeConfigMappings(ownLocalNetworkConfigMappings, genesisStateConfigMappings);
