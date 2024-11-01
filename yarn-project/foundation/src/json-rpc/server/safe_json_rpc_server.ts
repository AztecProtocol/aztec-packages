import cors from '@koa/cors';
import http from 'http';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import compress from 'koa-compress';
import Router from 'koa-router';
import { format } from 'util';
import { ZodError } from 'zod';

import { createDebugLogger } from '../../log/index.js';
import { promiseWithResolvers } from '../../promise/utils.js';
import { type ApiSchema, type ApiSchemaFor, schemaHasMethod } from '../../schemas/index.js';
import { jsonStringify2 } from '../convert.js';
import { assert } from '../js_utils.js';

export class SafeJsonRpcServer {
  /**
   * The HTTP server accepting remote requests.
   * This member field is initialized when the server is started.
   */
  private httpServer?: http.Server;

  constructor(
    /** The proxy object to delegate requests to. */
    private readonly proxy: Proxy,
    /** Logger */
    private log = createDebugLogger('json-rpc:server'),
  ) {}

  /**
   * Get an express app object.
   * @param prefix - Our server prefix.
   * @returns The app object.
   */
  public getApp(prefix = '') {
    const router = this.getRouter(prefix);

    const exceptionHandler = async (ctx: Koa.Context, next: () => Promise<void>) => {
      try {
        await next();
      } catch (err: any) {
        this.log.error(err);
        if (err instanceof SyntaxError) {
          ctx.status = 400;
          ctx.body = { jsonrpc: '2.0', id: null, error: { code: -32700, message: `Parse error: ${err.message}` } };
        } else if (err instanceof ZodError) {
          const message = err.issues.map(e => e.message).join(', ') || 'Validation error';
          ctx.status = 400;
          ctx.body = { jsonrpc: '2.0', id: null, error: { code: -32701, message } };
        } else {
          ctx.status = 500;
          ctx.body = { jsonrpc: '2.0', id: null, error: { code: -32600, message: err.message ?? 'Internal error' } };
        }
      }
    };

    const jsonResponse = async (ctx: Koa.Context, next: () => Promise<void>) => {
      try {
        await next();
        if (ctx.body && typeof ctx.body === 'object') {
          ctx.body = jsonStringify2(ctx.body);
        }
      } catch (err: any) {
        ctx.status = 500;
        ctx.body = { jsonrpc: '2.0', error: { code: -32700, message: `Unable to serialize response: ${err.message}` } };
      }
    };

    const app = new Koa();
    app.on('error', error => {
      this.log.error(`Error on API handler: ${error}`);
    });

    app.use(compress({ br: false } as any));
    app.use(jsonResponse);
    app.use(exceptionHandler);
    app.use(bodyParser({ jsonLimit: '50mb', enableTypes: ['json'], detectJSON: () => true }));
    app.use(cors());
    app.use(router.routes());
    app.use(router.allowedMethods());

    return app;
  }

  /**
   * Get a router object wrapping our RPC class.
   * @param prefix - The server prefix.
   * @returns The router object.
   */
  private getRouter(prefix: string) {
    const router = new Router({ prefix });
    // "JSON RPC mode" where a single endpoint is used and the method is given in the request body
    router.post('/', async (ctx: Koa.Context) => {
      const { params = [], jsonrpc, id, method } = ctx.request.body as any;
      // Fail if not a registered function in the proxy
      if (typeof method !== 'string' || method === 'constructor' || !this.proxy.hasMethod(method)) {
        ctx.status = 400;
        ctx.body = { jsonrpc, id, error: { code: -32601, message: `Method not found: ${method}` } };
      } else {
        const result = await this.proxy.call(method, params);
        ctx.body = { jsonrpc, id, result };
        ctx.status = 200;
      }
    });

    return router;
  }

  /**
   * Start this server with koa.
   * @param port - Port number.
   * @param prefix - Prefix string.
   */
  public start(port: number, prefix = ''): void {
    if (this.httpServer) {
      throw new Error('Server is already listening');
    }

    this.httpServer = http.createServer(this.getApp(prefix).callback());
    this.httpServer.listen(port);
  }

  /**
   * Stops the HTTP server
   */
  public stop(): Promise<void> {
    if (!this.httpServer) {
      return Promise.resolve();
    }

    const { promise, resolve, reject } = promiseWithResolvers<void>();
    this.httpServer.close(err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
    return promise;
  }

  /**
   * Explicitly calls an RPC method.
   * @param methodName - The RPC method.
   * @param jsonParams - The RPC parameters.
   * @returns The remote result.
   */
  public async call(methodName: string, jsonParams: any[] = []) {
    return await this.proxy.call(methodName, jsonParams);
  }
}

interface Proxy {
  hasMethod(methodName: string): boolean;
  call(methodName: string, jsonParams?: any[]): Promise<any>;
}

/**
 * Forwards calls to a handler. Relies on a schema definition to validate and convert inputs
 * before forwarding calls, and then converts outputs into JSON using default conversions.
 */
export class SafeJsonProxy<T extends object = any> implements Proxy {
  private log = createDebugLogger('json-rpc:proxy');
  private schema: ApiSchema;

  constructor(private handler: T, schema: ApiSchemaFor<T>) {
    this.schema = schema;
  }

  /**
   * Call an RPC method.
   * @param methodName - The RPC method.
   * @param jsonParams - The RPC parameters.
   * @returns The remote result.
   */
  public async call(methodName: string, jsonParams: any[] = []) {
    this.log.debug(format(`request`, methodName, jsonParams));

    assert(Array.isArray(jsonParams), `Params to ${methodName} is not an array: ${jsonParams}`);
    assert(schemaHasMethod(this.schema, methodName), `Method ${methodName} not found in schema`);
    const method = this.handler[methodName as keyof T];
    assert(typeof method === 'function', `Method ${methodName} is not a function`);

    const args = this.schema[methodName].parameters().parse(jsonParams);
    const ret = await method.apply(this.handler, args);
    this.log.debug(format('response', methodName, ret));
    return ret;
  }

  public hasMethod(methodName: string): boolean {
    return schemaHasMethod(this.schema, methodName) && typeof this.handler[methodName as keyof T] === 'function';
  }
}

class NamespacedSafeJsonProxy implements Proxy {
  private readonly proxies: Record<string, Proxy> = {};

  constructor(handlers: NamespacedApiHandlers) {
    for (const [namespace, [handler, schema]] of Object.entries(handlers)) {
      this.proxies[namespace] = new SafeJsonProxy(handler, schema);
    }
  }

  public call(namespacedMethodName: string, jsonParams: any[] = []) {
    const [namespace, methodName] = namespacedMethodName.split('_', 2);
    assert(namespace && methodName, `Invalid namespaced method name: ${namespacedMethodName}`);
    const handler = this.proxies[namespace];
    assert(handler, `Namespace not found: ${namespace}`);
    return handler.call(methodName, jsonParams);
  }

  public hasMethod(namespacedMethodName: string): boolean {
    const [namespace, methodName] = namespacedMethodName.split('_', 2);
    const handler = this.proxies[namespace];
    return handler?.hasMethod(methodName);
  }
}

export type NamespacedApiHandlers = Record<string, ApiHandler>;

export type ApiHandler<T extends object = any> = [T, ApiSchemaFor<T>];

export function makeHandler<T extends object>(handler: T, schema: ApiSchemaFor<T>): ApiHandler<T> {
  return [handler, schema];
}

/**
 * Creates a single SafeJsonRpcServer from multiple handlers.
 * @param servers - List of handlers to be combined.
 * @returns A single JsonRpcServer with namespaced methods.
 */
export function createNamespacedSafeJsonRpcServer(
  handlers: NamespacedApiHandlers,
  log = createDebugLogger('json-rpc:server'),
): SafeJsonRpcServer {
  const proxy = new NamespacedSafeJsonProxy(handlers);
  return new SafeJsonRpcServer(proxy, log);
}

export function createSafeJsonRpcServer<T extends object = any>(handler: T, schema: ApiSchemaFor<T>) {
  const proxy = new SafeJsonProxy(handler, schema);
  return new SafeJsonRpcServer(proxy);
}
