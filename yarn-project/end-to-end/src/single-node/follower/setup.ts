import {
  type AztecNodeConfig,
  type AztecNodeService,
  createAztecNodeService,
  registerAztecNodeRpcHandlers,
} from '@aztec/aztec-node';
import { SecretValue } from '@aztec/foundation/config';
import { randomBytes } from '@aztec/foundation/crypto/random';
import {
  type NamespacedApiHandlers,
  createNamespacedSafeJsonRpcServer,
  startHttpRpcServer,
} from '@aztec/foundation/json-rpc/server';
import type { Logger } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { getPackageVersion } from '@aztec/stdlib/update-checker';
import { getComponentsVersionsFromConfig, getVersioningMiddleware } from '@aztec/stdlib/versioning';
import type { GenesisData } from '@aztec/stdlib/world-state';

import { join } from 'path';

import type { SingleNodeTestContext } from '../single_node_test_context.js';

/** How often the follower under test polls its upstream. Tightened from the 1s default to keep waits short. */
const FOLLOWER_SYNC_POLLING_INTERVAL_MS = 100;

/** An upstream node exposed over HTTP JSON-RPC, as a follower node reaches it in production. */
export type UpstreamRpcServer = {
  /** Base URL to point `FOLLOWER_UPSTREAM_URL` at. */
  url: string;
  stop: () => Promise<void>;
};

/**
 * Serves an in-process node over HTTP JSON-RPC on an ephemeral port, registering the same namespaces the
 * `aztec start` entrypoint does — including the read-only `archiver_*` namespace a follower replicates from —
 * behind the same versioning middleware, so the follower's startup handshake is exercised over the wire
 * rather than short-circuited by an in-process object.
 */
export async function startUpstreamRpcServer(
  node: AztecNodeService,
  config: AztecNodeConfig,
  log: Logger,
): Promise<UpstreamRpcServer> {
  const services: NamespacedApiHandlers = {};
  registerAztecNodeRpcHandlers(node, services);

  const versions = getComponentsVersionsFromConfig(config, protocolContractsHash, getVKTreeRoot());
  const rpcServer = createNamespacedSafeJsonRpcServer(services, {
    http200OnError: false,
    log,
    middlewares: [getVersioningMiddleware(versions, { packageVersion: getPackageVersion() })],
    // Transactions carry proofs, which comfortably exceed the default body limit.
    maxBodySizeBytes: '50mb',
  });

  const httpServer = await startHttpRpcServer(rpcServer, { host: '127.0.0.1' });
  log.info(`Upstream node RPC server listening on port ${httpServer.port}`);

  return {
    url: `http://127.0.0.1:${httpServer.port}`,
    stop: () => new Promise<void>(resolve => httpServer.close(() => resolve())),
  };
}

/**
 * Creates a follower node replicating from `upstreamUrl`. Deliberately built through the production
 * `createAztecNodeService` entrypoint (rather than the context's `createNonValidatorNode`) so the follower
 * branch of the factory is what the test exercises, and with **no L1 RPC URLs at all**: everything a follower
 * needs — contract addresses, rollup constants, min fees — must come from its upstream.
 */
export function createFollowerNode(
  test: SingleNodeTestContext,
  upstreamUrl: string,
  overrides: Partial<AztecNodeConfig> = {},
  options: { genesis?: GenesisData } = {},
): Promise<AztecNodeService> {
  const { config, dateProvider } = test.context;
  const genesis = 'genesis' in options ? options.genesis : test.context.genesis;
  return createAztecNodeService(
    {
      ...config,
      dataDirectory: join(config.dataDirectory!, `follower-${randomBytes(8).toString('hex')}`),
      nodeId: 'follower-1',
      followerUpstreamUrl: upstreamUrl,
      followerSyncPollingIntervalMs: FOLLOWER_SYNC_POLLING_INTERVAL_MS,
      l1RpcUrls: [],
      p2pEnabled: false,
      disableValidator: true,
      enableProverNode: false,
      enableOffenseCollection: false,
      fishermanMode: false,
      useAutomineSequencer: false,
      validatorPrivateKeys: new SecretValue([]),
      ...overrides,
    },
    { dateProvider },
    { genesis },
  );
}
