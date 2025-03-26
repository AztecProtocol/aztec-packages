import { type ArchiverConfig, archiverConfigMappings } from '@aztec/archiver/config';
import { type L1ContractAddresses, l1ContractAddressesMapping } from '@aztec/ethereum';
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

import { type SentinelConfig, sentinelConfigMappings } from '../sentinel/config.js';

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
  DataStoreConfig &
  SentinelConfig & {
    /** Whether the validator is disabled for this node */
    disableValidator: boolean;
    /** Whether to populate the genesis state with initial fee juice for the test accounts */
    testAccounts: boolean;
    /** Whether to populate the genesis state with initial fee juice for the sponsored FPC */
    sponsoredFPC: boolean;
    /** L1 contracts addresses */
    l1Contracts: L1ContractAddresses;
    /** Sync mode: full to always sync via L1, fast to download a snapshot if there is no local data, replace to download even if there is local data. */
    syncMode: 'fast' | 'full' | 'replace';
    /** Base URL for snapshots index. Index file will be searched at `SNAPSHOTS_BASE_URL/aztec-L1_CHAIN_ID-VERSION-ROLLUP_ADDRESS/index.json` */
    snapshotsUrl?: string;
  };

export const aztecNodeConfigMappings: ConfigMappingsType<AztecNodeConfig> = {
  ...dataConfigMappings,
  ...archiverConfigMappings,
  ...sequencerClientConfigMappings,
  ...validatorClientConfigMappings,
  ...proverClientConfigMappings,
  ...worldStateConfigMappings,
  ...p2pConfigMappings,
  ...sentinelConfigMappings,
  l1Contracts: {
    description: 'The deployed L1 contract addresses',
    nested: l1ContractAddressesMapping,
  },
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
  sponsoredFPC: {
    env: 'SPONSORED_FPC',
    description: 'Whether to populate the genesis state with initial fee juice for the sponsored FPC.',
    ...booleanConfigHelper(false),
  },
  syncMode: {
    env: 'SYNC_MODE',
    description:
      'Set sync mode to `full` to always sync via L1, `fast` to download a snapshot if there is no local data, `replace` to download even if there is local data.',
    defaultValue: 'fast',
  },
  snapshotsUrl: {
    env: 'SYNC_SNAPSHOTS_URL',
    description: 'Base URL for snapshots index.',
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
 * Returns package version.
 */
export function getPackageVersion() {
  const releasePleaseManifestPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../.release-please-manifest.json',
  );
  const version = JSON.parse(readFileSync(releasePleaseManifestPath).toString());
  return version['.'];
}
