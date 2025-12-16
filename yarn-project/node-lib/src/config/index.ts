import { type ConfigMappingsType, booleanConfigHelper } from '@aztec/foundation/config';

export type SharedNodeConfig = {
  /** Whether to populate the genesis state with initial fee juice for the test accounts */
  testAccounts: boolean;
  /** Whether to populate the genesis state with initial fee juice for the sponsored FPC */
  sponsoredFPC: boolean;
  /** Sync mode: full to always sync via L1, snapshot to download a snapshot if there is no local data, force-snapshot to download even if there is local data. */
  syncMode: 'full' | 'snapshot' | 'force-snapshot';
  /** Base URLs for snapshots index. Index file will be searched at `SNAPSHOTS_BASE_URL/aztec-L1_CHAIN_ID-VERSION-ROLLUP_ADDRESS/index.json` */
  snapshotsUrls?: string[];

  /** Auto update mode: disabled - to completely ignore remote signals to update the node. enabled - to respect the signals (potentially shutting this node down). log - check for updates but log a warning instead of applying them*/
  autoUpdate?: 'disabled' | 'notify' | 'config' | 'config-and-version';
  /** The base URL against which to check for updates */
  autoUpdateUrl?: string;

  /** URL of the Web3Signer instance */
  web3SignerUrl?: string;
};

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
  syncMode: {
    env: 'SYNC_MODE',
    description:
      'Set sync mode to `full` to always sync via L1, `snapshot` to download a snapshot if there is no local data, `force-snapshot` to download even if there is local data.',
    defaultValue: 'snapshot',
  },
  snapshotsUrls: {
    env: 'SYNC_SNAPSHOTS_URLS',
    description: 'Base URLs for snapshots index, comma-separated.',
    parseEnv: (val: string) =>
      val
        .split(',')
        .map(url => url.trim())
        .filter(url => url.length > 0),
    fallback: ['SYNC_SNAPSHOTS_URL'],
    defaultValue: [],
  },
  autoUpdate: {
    env: 'AUTO_UPDATE',
    description: 'The auto update mode for this node',
    defaultValue: 'disabled',
  },
  autoUpdateUrl: {
    env: 'AUTO_UPDATE_URL',
    description: 'Base URL to check for updates',
  },
  web3SignerUrl: {
    env: 'WEB3_SIGNER_URL',
    description: 'URL of the Web3Signer instance',
    parseEnv: (val: string) => val.trim(),
  },
};
