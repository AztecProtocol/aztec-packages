#!/usr/bin/env -S node --no-warnings
import { createDebugLogger } from '@aztec/foundation/log';

import { startTXEHttpServer } from '../index.js';
import { TXEService } from '../txe_service/txe_service.js';

const { TXE_PORT = 8080 } = process.env;

const logger = createDebugLogger('aztec:txe_service');

/**
 * Create and start a new PXE HTTP Server
 */
async function main() {
  logger.info(`Setting up TXE...`);

  const txeService = await TXEService.init(logger);

  startTXEHttpServer(txeService, TXE_PORT);

  logger.info(`TXE listening on port ${TXE_PORT}`);
}

main().catch(err => {
  logger.error(err);
  process.exit(1);
});
