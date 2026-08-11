#!/usr/bin/env -S node --no-warnings
import {
  type NamespacedApiHandlers,
  createNamespacedSafeJsonRpcServer,
  startHttpRpcServer,
} from '@aztec/foundation/json-rpc/server';
import { createLogger } from '@aztec/foundation/log';
import { getOtelJsonRpcPropagationMiddleware } from '@aztec/telemetry-client';

import {
  type AztecNodeConfig,
  createAztecNodeService,
  getConfigEnvVars,
  registerAztecNodeRpcHandlers,
} from '../index.js';

const { AZTEC_NODE_PORT = 8081, API_PREFIX = '' } = process.env;

const logger = createLogger('node');

/**
 * Create and start a new Aztec Node HTTP Server
 */
async function main() {
  logger.info(`Setting up Aztec Node...`);

  const config: AztecNodeConfig = { ...getConfigEnvVars() };
  const aztecNode = await createAztecNodeService(config);

  const shutdown = async () => {
    logger.info('Shutting down...');
    await aztecNode.stop();
    process.exit(0);
  };

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.once('SIGINT', shutdown);
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.once('SIGTERM', shutdown);

  const services: NamespacedApiHandlers = {};
  registerAztecNodeRpcHandlers(aztecNode, services, undefined, { p2pHealthMinPeers: config.p2pHealthMinPeers });
  const rpcServer = createNamespacedSafeJsonRpcServer(services, {
    middlewares: [getOtelJsonRpcPropagationMiddleware()],
  });
  await startHttpRpcServer(rpcServer, { port: +AZTEC_NODE_PORT, apiPrefix: API_PREFIX });
  logger.info(`Aztec Node JSON-RPC Server listening on port ${AZTEC_NODE_PORT}`);
}

main().catch(err => {
  logger.error(err);
  process.exit(1);
});
