import { createLogger } from '@aztec/foundation/log';
import { createStore } from '@aztec/kv-store/lmdb';
import { type BootnodeConfig, BootstrapNode } from '@aztec/p2p';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import Koa from 'koa';
import Router from 'koa-router';

const debugLogger = createLogger('p2p-bootstrap:bootstrap_node');

const { HTTP_PORT } = process.env;

/**
 * The application entry point.
 */
async function main(
  config: BootnodeConfig,
  telemetryClient: TelemetryClient = getTelemetryClient(),
  logger = debugLogger,
) {
  const store = await createStore('p2p-bootstrap', config, logger);

  const bootstrapNode = new BootstrapNode(store, telemetryClient, logger);
  await bootstrapNode.start(config);
  logger.info('DiscV5 Bootnode started');

  const httpApp = new Koa();
  const router = new Router();
  router.get('/health', (ctx: Koa.Context) => {
    ctx.status = 200;
  });

  httpApp.use(router.routes()).use(router.allowedMethods());
  httpApp.listen(HTTP_PORT, () => {
    logger.info(`HTTP server listening on port ${HTTP_PORT}`);
  });

  const stop = async () => {
    logger.debug('Stopping bootstrap node...');
    await bootstrapNode.stop();
    logger.info('Node stopped');
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

export default main;
