import http from 'http';
import Router from 'koa-router';
import { ClassConverterInput } from '../ClassConverter.js';
import { JsonRpcProxy } from './index.js';
import Koa, { Context, DefaultState } from 'koa';
import bodyParser from 'koa-bodyparser';

/**
 * JsonRpcServer:
 *  minimal, dev-friendly mechanism to
 */
export class JsonRpcServer<T extends object> {
  proxy: JsonRpcProxy;
  constructor(private handler: T, input: ClassConverterInput) {
    this.proxy = new JsonRpcProxy(handler, input);
  }

  private getApp(prefix: string) {
    const router = new Router({ prefix });
    for (const method of Object.keys(this.handler)) {
      // Make sure this is a function
      if (typeof (this.handler as any)[method] !== 'function') {
        continue;
      }
      router.post(`/${method}`, async (ctx: Koa.Context) => {
        const { params = [], jsonrpc, id } = ctx.request.body as any;
        const result = await this.proxy.call(method, params);
        ctx.body = { jsonrpc, id, result };
        ctx.status = 200;
      });
    }
    const exceptionHandler = async (ctx: Koa.Context, next: () => Promise<void>) => {
      try {
        await next();
      } catch (err: any) {
        console.log(err);
        ctx.status = 400;
        ctx.body = { error: err.message };
      }
    };
    const app = new Koa();
    app.on('error', error => {
      console.log(`KOA app-level error. ${JSON.stringify({ error })}`);
    });
    app.proxy = true;

    // TODO use?
    // app.use(compress({ br: false } as any));
    app.use(bodyParser());
    // TODO use?
    // app.use(cors());
    app.use(exceptionHandler);
    app.use(router.routes());
    app.use(router.allowedMethods());

    return app;
  }

  start(port: number, prefix = '') {
    const httpServer = http.createServer(this.getApp(prefix).callback());
    httpServer.listen(port);
  }
}
