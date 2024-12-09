import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { type ApiSchemaFor, schemas } from '@aztec/foundation/schemas';

import cors from '@koa/cors';
import { createServer } from 'http';
import Koa from 'koa';
import Router from 'koa-router';
import { z } from 'zod';

import { type Faucet, ThrottleError } from './faucet.js';

export function createFaucetHttpServer(faucet: Faucet, apiPrefix = '', logger = createLogger('aztec:faucet:http')) {
  const router = new Router({ prefix: `${apiPrefix}` });
  router.get('/drip/:address', async ctx => {
    const { address } = ctx.params;
    const { asset } = ctx.query;

    if (typeof asset !== 'string') {
      throw new Error(`Bad asset: ${asset}`);
    }

    await faucet.send(EthAddress.fromString(address), asset);

    ctx.status = 200;
  });

  const app = new Koa();

  app.on('error', error => {
    logger.error(`Error on API handler: ${error}`);
  });

  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (err: any) {
      logger.error(err);
      ctx.status = err instanceof ThrottleError ? 429 : 400;
      ctx.body = { error: err.message };
    }
  });

  app.use(cors());
  app.use(router.routes());
  app.use(router.allowedMethods());

  return createServer(app.callback());
}

export const FaucetSchema: ApiSchemaFor<Faucet> = {
  send: z.function().args(schemas.EthAddress, z.string()).returns(z.void()),
  sendERC20: z.function().args(schemas.EthAddress, z.string()).returns(z.void()),
  sendEth: z.function().args(schemas.EthAddress).returns(z.void()),
  addL1Asset: z
    .function()
    .args(z.object({ address: schemas.EthAddress, amount: z.bigint() }))
    .returns(z.void()),
};
