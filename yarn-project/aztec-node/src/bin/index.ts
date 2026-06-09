#!/usr/bin/env -S node --no-warnings
import {
  type NamespacedApiHandlers,
  createNamespacedSafeJsonRpcServer,
  startHttpRpcServer,
} from '@aztec/foundation/json-rpc/server';
import { createLogger } from '@aztec/foundation/log';
import { AztecNodeApiSchema, addLegacyNodeRpcNamespaces } from '@aztec/stdlib/interfaces/client';
import { P2PApiSchema } from '@aztec/stdlib/interfaces/server';
import { getOtelJsonRpcPropagationMiddleware } from '@aztec/telemetry-client';

import { type AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '../index.js';

const { AZTEC_NODE_PORT = 8081, API_PREFIX = '' } = process.env;

const logger = createLogger('node');

/**
 * Creates the node from provided config
 */
async function createAndDeployAztecNode() {
  const aztecNodeConfig: AztecNodeConfig = { ...getConfigEnvVars() };

  return await AztecNodeService.createAndSync(aztecNodeConfig);
}

/**
 * Create and start a new Aztec Node HTTP Server
 */
async function main() {
  logger.info(`Setting up Aztec Node...`);

  const aztecNode = await createAndDeployAztecNode();

  const shutdown = async () => {
    logger.info('Shutting down...');
    await aztecNode.stop();
    process.exit(0);
  };

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.once('SIGINT', shutdown);
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.once('SIGTERM', shutdown);

  const services: NamespacedApiHandlers = {
    aztec: [aztecNode, AztecNodeApiSchema],
    p2p: [aztecNode.getP2P(), P2PApiSchema],
  };
  addLegacyNodeRpcNamespaces(services);
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
