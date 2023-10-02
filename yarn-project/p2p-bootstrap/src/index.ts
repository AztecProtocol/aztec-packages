import { createDebugLogger } from '@aztec/foundation/log';
import { BootstrapNode, getP2PConfigEnvVars } from '@aztec/p2p';

import cors from '@koa/cors';
import 'dotenv/config';
import http from 'http';
import Koa from 'koa';
import Router from 'koa-router';

const logger = createDebugLogger('aztec:bootstrap_node');

const { SERVER_PORT = 8082, API_PREFIX = '', HTTP_SERVER_ENABLED = 'false' } = process.env;

/**
 * Create an http server to provide a 'status' endpoint
 * @param port - The port on which to host the htp server
 * @param prefix - An optional opi prefix to put in the api route.
 * @returns The http server instance
 */
function createHttpServer(port: number, prefix = '') {
  const router = new Router({ prefix });
  router.get('/status', (ctx: Koa.Context) => {
    ctx.status = 200;
  });
  const exceptionHandler = async (ctx: Koa.Context, next: () => Promise<void>) => {
    try {
      await next();
    } catch (err: any) {
      logger.error(err);
      ctx.status = 400;
      ctx.body = { error: err.message };
    }
  };
  const app = new Koa();
  app.on('error', error => {
    logger.error(`Error on API handler: ${error}`);
  });
  app.use(cors());
  app.use(exceptionHandler);
  app.use(router.routes());
  app.use(router.allowedMethods());

  const httpServer = http.createServer(app.callback());
  httpServer.listen(port);

  logger(`Created HTTP Server on port ${SERVER_PORT}`);

  return httpServer;
}

/**
 * The application entry point.
 */
async function main() {
  const config = getP2PConfigEnvVars();
  const bootstrapNode = new BootstrapNode(logger);
  await bootstrapNode.start(config);
  logger('Node started');

  if (HTTP_SERVER_ENABLED === 'true') {
    createHttpServer(+SERVER_PORT, API_PREFIX);
  }

  const stop = async () => {
    logger('Stopping bootstrap node...');
    await bootstrapNode.stop();
    logger('Node stopped');
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch(err => {
  logger.error(err);
});
