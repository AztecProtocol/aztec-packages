#!/usr/bin/env -S node --no-warnings
import { type SafeJsonRpcServerOptions, createNamespacedSafeJsonRpcServer } from '@aztec/foundation/json-rpc/server';
import { createLogger } from '@aztec/foundation/log';
import { type PXE, PXESchema, createAztecNodeClient } from '@aztec/stdlib/interfaces/client';

import http from 'http';

import { getPXEServiceConfig } from '../config/index.js';
import { createPXEService } from '../entrypoints/server/utils.js';

const { PXE_PORT = 8080, AZTEC_NODE_URL = 'http://localhost:8079' } = process.env;

const logger = createLogger('pxe:service');

/**
 * Creates an http server that forwards calls to the PXE and starts it on the given port.
 * @param pxeService - PXE that answers queries to the created HTTP server.
 * @param port - Port to listen in.
 * @param maxBatchSize - Maximum allowed batch size for JSON RPC batch requests.
 * @returns A running http server.
 */
function startPXEHttpServer(
  pxeService: PXE,
  port: string | number,
  opts: Pick<SafeJsonRpcServerOptions, 'maxBatchSize'> = {},
): http.Server {
  const rpcServer = createNamespacedSafeJsonRpcServer({ pxe: [pxeService, PXESchema] }, opts);

  const app = rpcServer.getApp();
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  const httpServer = http.createServer(app.callback());
  httpServer.listen(port);

  return httpServer;
}

/**
 * Create and start a new PXE HTTP Server
 */
async function main() {
  logger.info(`Setting up PXE...`);

  const pxeConfig = getPXEServiceConfig();
  const nodeRpcClient = createAztecNodeClient(AZTEC_NODE_URL, {});
  const pxeService = await createPXEService(nodeRpcClient, pxeConfig);

  const shutdown = () => {
    logger.info('Shutting down...');
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  startPXEHttpServer(pxeService, PXE_PORT);
  logger.info(`PXE listening on port ${PXE_PORT}`);
}

main().catch(err => {
  logger.error(err);
  process.exit(1);
});
