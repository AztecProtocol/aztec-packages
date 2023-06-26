import Koa from 'koa';
import Router from 'koa-router';
import { AztecNodeConfig } from '@aztec/aztec-node';

/**
 * Creates a router for helper API endpoints of the Aztec RPC Server.
 * @param aztecNode - An instance of the aztec node.
 * @param config - The aztec node's configuration variables.
 */
export function createApiRouter(config: AztecNodeConfig) {
  const router = new Router({ prefix: '/api' });
  router.get('/status', (ctx: Koa.Context) => {
    // TODO: add `status` to Aztec node.
    ctx.status = 200;
  });

  router.get('/l1-contract-addresses', (ctx: Koa.Context) => {
    ctx.body = {
      rollup: config.rollupContract.toString(),
      contractDeploymentEmitter: config.contractDeploymentEmitterContract.toString(),
      inbox: config.inboxContract.toString(),
    };
    ctx.status = 200;
  });

  return router;
}
