import http from 'http';
import Router from 'koa-router';
import cors from '@koa/cors';
import compress from 'koa-compress';
import { ClassConverterInput } from '../class_converter.js';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import { JsonProxy } from './json_proxy.js';
import { logTrace } from '../log_utils.js';

/**
 * JsonRpcServer:
 *  minimal, dev-friendly mechanism to create a server from an object
 */
export class JsonRpcServer {
  proxy: JsonProxy;
  constructor(private handler: object, input: ClassConverterInput) {
    this.proxy = new JsonProxy(handler, input);
  }

  public getApp(prefix = '') {
    const router = this.getRouter(prefix);
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
    app.use(compress({ br: false } as any));
    app.use(bodyParser());
    app.use(cors());
    app.use(exceptionHandler);
    app.use(router.routes());
    app.use(router.allowedMethods());

    return app;
  }

  private getRouter(prefix: string) {
    const router = new Router({ prefix });
    const proto = Object.getPrototypeOf(this.handler);
    // Find all our endpoints from the handler methods
    for (const method of Object.getOwnPropertyNames(proto)) {
      // Ignore if not a function
      if (method === 'constructor' || typeof proto[method] !== 'function') {
        continue;
      }
      router.post(`/${method}`, async (ctx: Koa.Context) => {
        const { params = [], jsonrpc, id } = ctx.request.body as any;
        logTrace('JsonRpcServer:getRouter', method, '<-', params);
        const result = await this.proxy.call(method, params);
        ctx.body = { jsonrpc, id, result };
        ctx.status = 200;
      });
    }
    return router;
  }

  public start(port: number, prefix = '') {
    const httpServer = http.createServer(this.getApp(prefix).callback());
    httpServer.listen(port);
  }
}
