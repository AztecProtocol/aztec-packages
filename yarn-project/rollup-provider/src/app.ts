import { AztecNode } from '@aztec/aztec-node';
import { KernelCircuitPublicInputs, SignedTxRequest } from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation';
import { Tx, TxHash, UnverifiedData } from '@aztec/types';
import Koa, { Context, DefaultState } from 'koa';
import Router from 'koa-router';
import { PromiseReadable } from 'promise-readable';

function txFromJson(json: any) {
  const publicInputs = KernelCircuitPublicInputs.fromBuffer(Buffer.from(json.tx.data, 'hex'));
  const unverified = UnverifiedData.fromBuffer(Buffer.from(json.unverified, 'hex'));
  const txRequest = SignedTxRequest.fromBuffer(Buffer.from(json.txRequest, 'hex'));
  return Tx.create(publicInputs, undefined, unverified, txRequest);
}

export function appFactory(node: AztecNode, prefix: string) {
  const router = new Router<DefaultState, Context>({ prefix });

  const checkReady = async (ctx: Context, next: () => Promise<void>) => {
    if (!(await node.isReady())) {
      ctx.status = 503;
      ctx.body = { error: 'Server not ready. Try again later.' };
    } else {
      await next();
    }
  };

  const exceptionHandler = async (ctx: Koa.Context, next: () => Promise<void>) => {
    try {
      await next();
    } catch (err: any) {
      console.log(err);
      ctx.status = 400;
      ctx.body = { error: err.message };
    }
  };

  router.get('/', async (ctx: Koa.Context) => {
    console.log('root');
    ctx.body = {
      serviceName: 'aztec rollup',
      isReady: await node.isReady(),
    };
    ctx.set('content-type', 'application/json');
    ctx.status = 200;
  });

  router.get('/get-blocks', async (ctx: Koa.Context) => {
    console.log('get-blocks');
    const from = +ctx.query.from!;
    const take = +ctx.query.take!;
    const blocks = await node.getBlocks(from, take);
    const strs = blocks.map(x => x.encode().toString('hex'));
    ctx.set('content-type', 'application/json');
    ctx.body = {
      blocks: strs,
    };
    ctx.status = 200;
  });

  router.get('/get-block-height', async (ctx: Koa.Context) => {
    console.log('get-block-height');
    ctx.set('content-type', 'application/json');
    ctx.body = {
      blockHeight: await node.getBlockHeight(),
    };
    ctx.status = 200;
  });

  router.get('/contract-data', async (ctx: Koa.Context) => {
    console.log('get-contract-data');
    const address = ctx.query.address;
    ctx.set('content-type', 'application/json');
    ctx.body = {
      contractData: await node.getContractData(AztecAddress.fromString(address as string)),
    };
    ctx.status = 200;
  });

  router.get('/contract-info', async (ctx: Koa.Context) => {
    console.log('get-contract-info');
    const address = ctx.query.address;
    ctx.set('content-type', 'application/json');
    ctx.body = {
      contractInfo: await node.getContractData(AztecAddress.fromString(address as string)),
    };
    ctx.status = 200;
  });

  router.get('/get-unverified', async (ctx: Koa.Context) => {
    console.log('get-unverified');
    const from = +ctx.query.from!;
    const take = +ctx.query.take!;
    const blocks = await node.getUnverifiedData(from, take);
    const strs = blocks.map(x => x.toBuffer().toString('hex'));
    ctx.set('content-type', 'application/json');
    ctx.body = {
      unverified: strs,
    };
    ctx.status = 200;
  });

  router.get('/get-pending-tx', async (ctx: Koa.Context) => {
    const hash = ctx.query.hash!;
    console.log('get-pending-tx');
    const txHash = new TxHash(Buffer.from(hash as string, 'hex'));
    const tx = await node.getPendingTxByHash(txHash);
    ctx.set('content-type', 'application/json');
    ctx.body = {
      tx: {
        data: tx?.data?.toBuffer().toString('hex'),
        unverified: tx?.unverifiedData?.toBuffer().toString('hex'),
        txRequest: tx?.txRequest?.toBuffer().toString('hex'),
      },
    };
    ctx.status = 200;
  });

  router.get('/contract-index', async (ctx: Koa.Context) => {
    console.log('contract-index');
    const leaf = ctx.query.leaf!;
    const index = await node.findContractIndex(Buffer.from(leaf as string, 'hex'));
    ctx.set('content-type', 'application/json');
    ctx.body = {
      index,
    };
    ctx.status = 200;
  });

  router.get('/contract-path', async (ctx: Koa.Context) => {
    console.log('contract-path');
    const leaf = ctx.query.leaf!;
    const path = await node.getContractPath(BigInt(leaf as string));
    ctx.set('content-type', 'application/json');
    ctx.body = {
      path: path.toString(),
    };
    ctx.status = 200;
  });

  router.get('/data-path', async (ctx: Koa.Context) => {
    console.log('data-path');
    const leaf = ctx.query.leaf!;
    const path = await node.getDataTreePath(BigInt(leaf as string));
    ctx.set('content-type', 'application/json');
    ctx.body = {
      path: path.toString(),
    };
    ctx.status = 200;
  });

  router.get('/storage-at', async (ctx: Koa.Context) => {
    console.log('storage-at');
    const address = ctx.query.address!;
    const slot = ctx.query.slot!;
    const value = await node.getStorageAt(AztecAddress.fromString(address as string), BigInt(slot as string));
    ctx.set('content-type', 'application/json');
    ctx.body = {
      value: value?.toString('hex'),
    };
    ctx.status = 200;
  });

  router.post('/tx', checkReady, async (ctx: Koa.Context) => {
    console.log('Received Tx');
    const stream = new PromiseReadable(ctx.req);
    const postData = JSON.parse((await stream.readAll()) as string);
    const tx = postData.map(txFromJson);
    console.log(`Tx `, tx);
    await node.sendTx(tx);
    ctx.status = 200;
  });

  const app = new Koa();
  app.on('error', error => {
    console.log(`KOA app-level error. ${JSON.stringify({ error })}`);
  });
  app.proxy = true;
  app.use(exceptionHandler);
  app.use(router.routes());
  app.use(router.allowedMethods());

  return app;
}
