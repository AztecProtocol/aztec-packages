import { type ConfigMappingsType, booleanConfigHelper } from '@aztec/foundation/config';

export type SharedNodeConfig = {
  /** Whether to populate the genesis state with initial fee juice for the test accounts */
  testAccounts: boolean;
  /** Whether to populate the genesis state with initial fee juice for the sponsored FPC */
  sponsoredFPC: boolean;
  /** Additional addresses to prefund with fee juice at genesis */
  prefundAddresses: string[];
  /** Sync mode: full to always sync via L1, snapshot to download a snapshot if there is no local data, force-snapshot to download even if there is local data. */
  syncMode: 'full' | 'snapshot' | 'force-snapshot';
  /** Base URLs for snapshots index. Index file will be searched at `SNAPSHOTS_BASE_URL/aztec-L1_CHAIN_ID-VERSION-ROLLUP_ADDRESS/index.json` */
  snapshotsUrls?: string[];
  /** URL of the Web3Signer instance */
  web3SignerUrl?: string;
  /** Whether to run in fisherman mode */
  fishermanMode?: boolean;

  /** Force verification of tx Chonk proofs. Only used for testnet */
  debugForceTxProofVerification: boolean;

  /** Soft-shutdown the node when the canonical rollup is no longer compatible, keeping the health server up for K8s probes */
  enableAutoShutdown: boolean;
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
  prefundAddresses: {
    env: 'PREFUND_ADDRESSES',
    description: 'Comma-separated list of Aztec addresses to prefund with fee juice at genesis (local network only).',
    parseEnv: (val: string) =>
      val
        .split(',')
        .map(a => a.trim())
        .filter(a => a.length > 0),
    defaultValue: [],
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
  web3SignerUrl: {
    env: 'WEB3_SIGNER_URL',
    description: 'URL of the Web3Signer instance',
    parseEnv: (val: string) => val.trim(),
  },
  fishermanMode: {
    env: 'FISHERMAN_MODE',
    description: 'Whether to run in fisherman mode.',
    ...booleanConfigHelper(false),
  },
  debugForceTxProofVerification: {
    env: 'DEBUG_FORCE_TX_PROOF_VERIFICATION',
    description: 'Whether to force tx proof verification. Only has an effect if real proving is turned off',
    ...booleanConfigHelper(false),
  },

  enableAutoShutdown: {
    env: 'ENABLE_AUTO_SHUTDOWN',
    description:
      'Soft-shutdown the node when the canonical rollup is no longer compatible (protocol constants diverge), keeping the health server up so K8s probes keep passing. Only applies to nodes following the canonical rollup.',
    ...booleanConfigHelper(false),
  },
};
