import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { type ApiSchemaFor, schemas } from '@aztec/foundation/schemas';

import cors from '@koa/cors';
import { createServer } from 'http';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import Router from 'koa-router';
import { z } from 'zod';

import { type Faucet, ThrottleError } from './faucet.js';

export function createFaucetHttpServer(faucet: Faucet, apiPrefix = '', logger = createLogger('aztec:faucet:http')) {
  const router = new Router({ prefix: `${apiPrefix}` });
  router.get('/drip/:address', async ctx => {
    const { address } = ctx.params;
    const { asset } = ctx.query;

    if (typeof asset !== 'string') {
      throw new Error(`Bad asset: [${asset}]`);
    }

    await faucet.send(EthAddress.fromString(address), asset);

    ctx.status = 200;
  });

  const L1AssetRequestSchema = z.object({
    address: z.string().transform(str => EthAddress.fromString(str)),
    amount: z.string().transform(str => BigInt(str)),
  });

  router.post('/l1-asset', async ctx => {
    if (!ctx.request.body) {
      throw new Error('Invalid request body');
    }

    const result = L1AssetRequestSchema.safeParse(ctx.request.body);

    if (!result.success) {
      throw new Error(`Invalid request: ${result.error.message}`);
    }

    const { address, amount } = result.data;

    await faucet.addL1Asset({ address, amount });

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
  app.use(bodyParser());
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
