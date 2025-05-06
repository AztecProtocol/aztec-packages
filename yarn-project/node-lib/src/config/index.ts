import { type ConfigMappingsType, booleanConfigHelper } from '@aztec/foundation/config';
import { type BaseSnapshotConfig, baseSnapshotConfigMappings } from '@aztec/stdlib/snapshots';

export type SharedNodeConfig = {
  /** Whether to populate the genesis state with initial fee juice for the test accounts */
  testAccounts: boolean;
  /** Whether to populate the genesis state with initial fee juice for the sponsored FPC */
  sponsoredFPC: boolean;
} & BaseSnapshotConfig;

export const sharedNodeConfigMappings: ConfigMappingsType<SharedNodeConfig> = {
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
  ...baseSnapshotConfigMappings,
};
