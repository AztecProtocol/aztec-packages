#!/usr/bin/env -S node --no-warnings
import { createLogger } from '@aztec/aztec.js';
import { startHttpRpcServer } from '@aztec/foundation/json-rpc/server';

import { createTXERpcServer } from '../index.js';

/**
 * Create and start a new TXE HTTP Server
 */
async function main() {
  const { TXE_PORT = 8080 } = process.env;

  const logger = createLogger('txe:service');
  logger.info(`Setting up TXE...`);

  const txeServer = createTXERpcServer(logger);
  const { port } = await startHttpRpcServer(txeServer, {
    port: TXE_PORT,
    timeoutMs: 1e3 * 60 * 5,
  });

  logger.info(`TXE listening on port ${port}`);

  // Handle SIGTERM signal to exit with code 0
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM signal, shutting down gracefully');
    process.exit(0);
  });
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
