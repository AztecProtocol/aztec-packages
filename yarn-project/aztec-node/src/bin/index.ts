#!/usr/bin/env -S node --no-warnings
import { createLogger } from '@aztec/foundation/log';
import { AztecNodeApiSchema } from '@aztec/stdlib/interfaces/client';
import { createTracedJsonRpcServer } from '@aztec/telemetry-client';

import http from 'http';

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

  const rpcServer = createTracedJsonRpcServer(aztecNode, AztecNodeApiSchema);
  const app = rpcServer.getApp(API_PREFIX);

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  const httpServer = http.createServer(app.callback());
  httpServer.listen(+AZTEC_NODE_PORT);
  logger.info(`Aztec Node JSON-RPC Server listening on port ${AZTEC_NODE_PORT}`);
}

main().catch(err => {
  logger.error(err);
  process.exit(1);
});
