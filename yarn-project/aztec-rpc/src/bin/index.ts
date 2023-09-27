#!/usr/bin/env -S node --no-warnings
import { createDebugLogger } from '@aztec/foundation/log';
import { createAztecNodeRpcClient } from '@aztec/types';

import { startHttpRpcServer } from '../aztec_rpc_http/index.js';
import { createPXEService } from '../aztec_rpc_server/index.js';
import { getConfigEnvVars } from '../config/index.js';

const { SERVER_PORT = 8080, AZTEC_NODE_RPC_URL = '' } = process.env;

const logger = createDebugLogger('aztec:rpc_server');

/**
 * Create and start a new Aztec RCP HTTP Server
 */
async function main() {
  logger.info(`Setting up PXE...`);

  const rpcConfig = getConfigEnvVars();
  const nodeRpcClient = createAztecNodeRpcClient(AZTEC_NODE_RPC_URL);
  const rpcServer = await createPXEService(nodeRpcClient, rpcConfig);

  const shutdown = async () => {
    logger.info('Shutting down...');
    await rpcServer.stop();
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  startHttpRpcServer(rpcServer, SERVER_PORT);
  logger.info(`PXE listening on port ${SERVER_PORT}`);
}

main().catch(err => {
  logger.error(err);
  process.exit(1);
});
