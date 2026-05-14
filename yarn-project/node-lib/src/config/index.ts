import { type GenesisStateConfig, genesisStateConfigMappings } from '@aztec/ethereum/config';
import { type ConfigMappingsType, booleanConfigHelper, composeConfigMappings } from '@aztec/foundation/config';
import { type FishermanModeConfig, fishermanModeConfigMappings } from '@aztec/stdlib/config';

export type OwnSharedNodeConfig = {
  /** Sync mode: full to always sync via L1, snapshot to download a snapshot if there is no local data, force-snapshot to download even if there is local data. */
  syncMode: 'full' | 'snapshot' | 'force-snapshot';
  /** Base URLs for snapshots index. Index file will be searched at `SNAPSHOTS_BASE_URL/aztec-L1_CHAIN_ID-VERSION-ROLLUP_ADDRESS/index.json` */
  snapshotsUrls?: string[];
  /** URL of the Web3Signer instance */
  web3SignerUrl?: string;
  /** Force verification of tx Chonk proofs. Only used for testnet */
  debugForceTxProofVerification: boolean;
  /** Check if the node version matches the latest version for the network */
  enableVersionCheck: boolean;
};
export type SharedNodeConfig = OwnSharedNodeConfig & FishermanModeConfig & GenesisStateConfig;

const ownSharedNodeConfigMappings: ConfigMappingsType<OwnSharedNodeConfig> = {
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
  debugForceTxProofVerification: {
    env: 'DEBUG_FORCE_TX_PROOF_VERIFICATION',
    description: 'Whether to force tx proof verification. Only has an effect if real proving is turned off',
    ...booleanConfigHelper(false),
  },

  enableVersionCheck: {
    env: 'ENABLE_VERSION_CHECK',
    description: 'Check if the node is running the latest version and is following the latest rollup',
    ...booleanConfigHelper(true),
  },
};

export const sharedNodeConfigMappings: ConfigMappingsType<SharedNodeConfig> = composeConfigMappings(
  ownSharedNodeConfigMappings,
  genesisStateConfigMappings,
  fishermanModeConfigMappings,
);
