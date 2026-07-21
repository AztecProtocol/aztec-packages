#!/usr/bin/env -S node --no-warnings
import { createLogger } from '@aztec/aztec.js/log';
import { startHttpRpcServer } from '@aztec/foundation/json-rpc/server';

import { createOracleTestRpcServer } from '../oracle/test-resolver/index.js';

/**
 * Starts an HTTP RPC server that resolves oracle foreign calls using auto-synthesized fixture scenarios. Used by
 * `nargo test --oracle-resolver` to run `#[generate_oracle_tests]` serialization tests against a dedicated resolver.
 * Logs fixture coverage on shutdown.
 */
async function main() {
  const { ORACLE_TEST_PORT = 14830 } = process.env;

  const logger = createLogger('txe:oracle-test');

  logger.info('Setting up oracle test resolver...');
  const { server, resolver } = createOracleTestRpcServer(logger);

  function logCoverageAndExit() {
    const uncalled = resolver.getUncalledFixtures();
    const missing = resolver.getMissingFixtures();
    if (uncalled.length > 0) {
      logger.warn(`Fixtures never called by any test: ${uncalled.join(', ')}`);
    }
    if (missing.length > 0) {
      logger.debug(`Oracles with no fixture defined: ${missing.join(', ')}`);
    }
    if (uncalled.length === 0) {
      logger.info('All fixture oracles were called.');
    }
    process.exit(0);
  }

  process.on('SIGTERM', logCoverageAndExit);
  process.on('SIGINT', logCoverageAndExit);

  const { port } = await startHttpRpcServer(server, {
    host: '127.0.0.1',
    port: ORACLE_TEST_PORT,
    timeoutMs: 1e3 * 60 * 5,
  });

  logger.info(`Oracle test resolver listening on port ${port}`);
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
