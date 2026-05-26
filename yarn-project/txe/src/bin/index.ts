#!/usr/bin/env -S node --no-warnings
// Cap the native world-state thread pool *before* any import touches @aztec/world-state.
// `MAX_WORLD_STATE_THREADS` (yarn-project/world-state/src/native/native_world_state_instance.ts)
// reads HARDWARE_CONCURRENCY at module load and defaults to 16; with N workers in the pool
// each one would otherwise spin up 16 libuv threads, which is wasteful for TXE's small
// per-test workload. Workers inherit `process.env`, so setting it here is enough.
import { createLogger } from '@aztec/aztec.js/log';
import { startHttpRpcServer } from '@aztec/foundation/json-rpc/server';

import { createTXERpcServer } from '../rpc_server.js';

// Cap the native world-state thread pool *before* any import touches @aztec/world-state.
// `MAX_WORLD_STATE_THREADS` (yarn-project/world-state/src/native/native_world_state_instance.ts)
// reads HARDWARE_CONCURRENCY at module load and defaults to 16; with N workers in the pool
// each one would otherwise spin up 16 libuv threads, which is wasteful for TXE's small
// per-test workload. Workers inherit `process.env`, so setting it here is enough.
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

  const txeServer = createTXERpcServer(logger);
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
