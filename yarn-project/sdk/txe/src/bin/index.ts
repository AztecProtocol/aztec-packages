#!/usr/bin/env -S node --no-warnings
import { createLogger } from '@aztec/aztec.js/log';
import { startHttpRpcServer } from '@aztec/foundation/json-rpc/server';

import { createTXERpcServer } from '../rpc_server.js';

// Cap the native world-state thread pool before any import touches @aztec/world-state.
// `MAX_WORLD_STATE_THREADS` reads HARDWARE_CONCURRENCY at module load and defaults to 16; the
// pool's worker threads inherit `process.env`, so setting the cap here covers every worker.
//
// CAVEAT: HARDWARE_CONCURRENCY is process-global — bb prove/verify, the LMDB reader pool, and
// the world-state native thread pool all read it. Safe at 2 today because TXE never proves or
// verifies and only performs light tree updates; raise it if that ever changes.
process.env.HARDWARE_CONCURRENCY ??= '2';

/**
 * Create and start a new TXE HTTP Server
 */
async function main() {
  const { TXE_PORT = 8080 } = process.env;

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM.');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('Received SIGTERM.');
    process.exit(0);
  });

  const logger = createLogger('txe:rpc');
  logger.info(`Setting up TXE...`);

  const txeServer = await createTXERpcServer(logger);
  const { port } = await startHttpRpcServer(txeServer, {
    host: '127.0.0.1',
    port: TXE_PORT,
    timeoutMs: 1e3 * 60 * 5,
  });

  logger.info(`TXE listening on port ${port}`);
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
