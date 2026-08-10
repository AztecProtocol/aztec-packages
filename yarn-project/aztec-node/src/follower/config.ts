import { type RpcSyncArchiverSpecificConfig, rpcSyncArchiverConfigMappings } from '@aztec/archiver/config';
import type { ConfigMappingsType } from '@aztec/foundation/config';

/**
 * Configuration of a follower node: a node that replicates all chain state from a single trusted upstream node
 * over RPC instead of syncing from L1 and gossiping over p2p, and forwards the transactions it receives to that
 * upstream. Follower mode is implied by {@link FollowerConfig.followerUpstreamUrl} being set.
 */
export type FollowerConfig = RpcSyncArchiverSpecificConfig & {
  /** URL of the upstream node's RPC interface. Setting it puts the node in follower mode. */
  followerUpstreamUrl?: string;
};

export const followerConfigMappings: ConfigMappingsType<FollowerConfig> = {
  ...rpcSyncArchiverConfigMappings,
  followerUpstreamUrl: {
    env: 'FOLLOWER_UPSTREAM_URL',
    description:
      'URL of the upstream node to replicate chain state from and forward transactions to. Setting it starts ' +
      'the node in follower mode, which requires the validator, sequencer, prover and p2p subsystems to be off.',
  },
};

/** Settings that a follower node cannot run with, since it has neither a p2p stack nor an L1 publisher. */
type FollowerIncompatibleConfig = {
  disableValidator: boolean;
  p2pEnabled: boolean;
  enableProverNode: boolean;
  enableOffenseCollection: boolean;
  fishermanMode?: boolean;
  useAutomineSequencer?: boolean;
};

/** Whether the given config puts the node in follower mode. */
export function isFollowerModeEnabled(config: Partial<FollowerConfig>): config is FollowerConfig & {
  followerUpstreamUrl: string;
} {
  return !!config.followerUpstreamUrl && config.followerUpstreamUrl.length > 0;
}

/**
 * Checks that a follower node's configuration is coherent, failing at startup rather than silently running a
 * subsystem the follower cannot support.
 * @throws If the upstream URL is malformed or an incompatible subsystem is enabled.
 */
export function assertValidFollowerConfig(config: FollowerConfig & FollowerIncompatibleConfig): void {
  const { followerUpstreamUrl } = config;
  if (!followerUpstreamUrl) {
    throw new Error('Follower mode requires an upstream node URL (FOLLOWER_UPSTREAM_URL)');
  }
  let upstream: URL;
  try {
    upstream = new URL(followerUpstreamUrl);
  } catch {
    throw new Error(`Invalid upstream node URL for follower mode: ${followerUpstreamUrl}`);
  }
  if (upstream.protocol !== 'http:' && upstream.protocol !== 'https:') {
    throw new Error(
      `Invalid upstream node URL for follower mode: ${followerUpstreamUrl} (expected an http or https URL)`,
    );
  }

  // A follower does not build blocks, does not attest, and has no L1 publisher, so every role that needs one
  // must be off. Reported together so an operator fixes the whole config in one go.
  const incompatible: string[] = [];
  if (!config.disableValidator) {
    incompatible.push('the validator/sequencer is enabled (set VALIDATOR_DISABLED=true)');
  }
  if (config.p2pEnabled) {
    incompatible.push('p2p is enabled (set P2P_ENABLED=false)');
  }
  if (config.enableProverNode) {
    incompatible.push('the prover node subsystem is enabled (set ENABLE_PROVER_NODE=false)');
  }
  if (config.enableOffenseCollection) {
    incompatible.push('offense collection is enabled (set OFFENSE_COLLECTION_ENABLED=false)');
  }
  if (config.fishermanMode) {
    incompatible.push('fisherman mode is enabled (set FISHERMAN_MODE=false)');
  }
  if (config.useAutomineSequencer) {
    incompatible.push('the automine sequencer is enabled (set USE_AUTOMINE_SEQUENCER=false)');
  }

  if (incompatible.length > 0) {
    throw new Error(`Cannot start a follower node (FOLLOWER_UPSTREAM_URL is set) because ${incompatible.join('; ')}`);
  }
}
