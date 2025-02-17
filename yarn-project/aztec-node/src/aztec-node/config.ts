import { type ArchiverConfig, archiverConfigMappings } from '@aztec/archiver/config';
import { type ConfigMappingsType, booleanConfigHelper, getConfigFromMappings } from '@aztec/foundation/config';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';
import { type P2PConfig, p2pConfigMappings } from '@aztec/p2p/config';
import { type ProverClientConfig, proverClientConfigMappings } from '@aztec/prover-client/config';
import { type SequencerClientConfig, sequencerClientConfigMappings } from '@aztec/sequencer-client/config';
import { type ValidatorClientConfig, validatorClientConfigMappings } from '@aztec/validator-client/config';
import { type WorldStateConfig, worldStateConfigMappings } from '@aztec/world-state/config';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

export { sequencerClientConfigMappings, type SequencerClientConfig };

/**
 * The configuration the aztec node.
 */
export type AztecNodeConfig = ArchiverConfig &
  SequencerClientConfig &
  ValidatorClientConfig &
  ProverClientConfig &
  WorldStateConfig &
  Pick<ProverClientConfig, 'bbBinaryPath' | 'bbWorkingDirectory' | 'realProofs'> &
  P2PConfig &
  DataStoreConfig & {
    /** Whether the validator is disabled for this node */
    disableValidator: boolean;
    /** Whether to populate the genesis state with initial fee juice for the test accounts */
    testAccounts: boolean;
  };

export const aztecNodeConfigMappings: ConfigMappingsType<AztecNodeConfig> = {
  ...archiverConfigMappings,
  ...sequencerClientConfigMappings,
  ...validatorClientConfigMappings,
  ...proverClientConfigMappings,
  ...worldStateConfigMappings,
  ...p2pConfigMappings,
  ...dataConfigMappings,
  disableValidator: {
    env: 'VALIDATOR_DISABLED',
    description: 'Whether the validator is disabled for this node.',
    ...booleanConfigHelper(),
  },
  testAccounts: {
    env: 'TEST_ACCOUNTS',
    description: 'Whether to populate the genesis state with initial fee juice for the test accounts.',
    ...booleanConfigHelper(),
  },
};

/**
 * Returns the config of the aztec node from environment variables with reasonable defaults.
 * @returns A valid aztec node config.
 */
export function getConfigEnvVars(): AztecNodeConfig {
  return getConfigFromMappings<AztecNodeConfig>(aztecNodeConfigMappings);
}

/**
 * Returns package name and version.
 */
export function getPackageInfo() {
  const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json');
  const { version, name } = JSON.parse(readFileSync(packageJsonPath).toString());
  return { version, name };
}
