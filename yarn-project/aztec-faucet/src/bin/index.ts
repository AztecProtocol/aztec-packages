#!/usr/bin/env -S node --no-warnings
import { createLogger } from '@aztec/foundation/log';

import { getFaucetConfigFromEnv } from '../config.js';
import { Faucet } from '../faucet.js';
import { createFaucetHttpServer } from '../http.js';

const logger = createLogger('aztec:faucet:http');

/**
 * Create and start a new Aztec Node HTTP Server
 */
async function main() {
  const config = getFaucetConfigFromEnv();
  const faucet = await Faucet.create(config);
  const httpServer = createFaucetHttpServer(faucet, '/', logger);
  const port = parseInt(process.env?.AZTEC_PORT ?? '', 10) || 8080;
  httpServer.listen(port);
  logger.info(`Aztec Faucet listening on port ${port}`);
  await Promise.resolve();
}

main().catch(err => {
  logger.error(err);
  process.exit(1);
});
