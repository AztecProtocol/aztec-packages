import cors from '@koa/cors';
import http from 'http';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import compress from 'koa-compress';
import Router from 'koa-router';
import { type AddressInfo } from 'net';
import { format, inspect } from 'util';
import { ZodError } from 'zod';

import { type Logger, createLogger } from '../../log/index.js';
import { promiseWithResolvers } from '../../promise/utils.js';
import { type ApiSchema, type ApiSchemaFor, parseWithOptionals, schemaHasMethod } from '../../schemas/index.js';
import { jsonStringify } from '../convert.js';
import { assert } from '../js_utils.js';

export interface JsonRpcDiagnosticHooks {
  onJsonRpcRequest?: (rpcId: number | string | null, rpcMethod: string, headers: http.IncomingHttpHeaders) => void;
  onJsonRpcResponse?: (rpcId: number | string | null, rpcMethod: string) => void;
  onJsonRpcError?: (rpcId: number | string | null, rpcMethod: string, errorCode: number, message: string) => void;
}

export class SafeJsonRpcServer {
  /**
   * The HTTP server accepting remote requests.
   * This member field is initialized when the server is started.
   */
  private httpServer?: http.Server;

  constructor(
    /** The proxy object to delegate requests to. */
    private readonly proxy: Proxy,
    /**
     *  Return an HTTP 200 status code on errors, but include an error object
     *  as per the JSON RPC spec
     */
    private http200OnError = false,
    /** Health check function */
    private readonly healthCheck: StatusCheckFn = () => true,
    /** Export diagnostics data */
    private diagnosticsHooks: JsonRpcDiagnosticHooks = {},
    /** Logger */
    private log = createLogger('json-rpc:server'),
  ) {}

  public isHealthy(): boolean | Promise<boolean> {
    return this.healthCheck();
  }

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
        const method = (ctx.request.body as any)?.method ?? 'unknown';
        this.log.warn(`Error in JSON RPC server call ${method}: ${inspect(err)}`);
        if (err instanceof SyntaxError) {
          ctx.status = 400;
          ctx.body = { jsonrpc: '2.0', id: null, error: { code: -32700, message: `Parse error: ${err.message}` } };
        } else if (err instanceof ZodError) {
          const message = err.issues.map(e => `${e.message} (${e.path.join('.')})`).join('. ') || 'Validation error';
          ctx.status = 400;
          ctx.body = { jsonrpc: '2.0', id: null, error: { code: -32701, message } };
        } else if (this.http200OnError) {
          ctx.body = {
            jsonrpc: '2.0',
            id: null,
            error: { code: err.code || -32600, data: err.data, message: err.message },
          };
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
          ctx.body = jsonStringify(ctx.body);
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

    app.use(compress({ br: false }));
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
      this.diagnosticsHooks.onJsonRpcRequest?.(id, method, ctx.request.headers);
      // Fail if not a registered function in the proxy
      if (typeof method !== 'string' || method === 'constructor' || !this.proxy.hasMethod(method)) {
        ctx.status = 400;
        const code = -32601;
        const message = `Method not found: ${method}`;
        ctx.body = { jsonrpc, id, error: { code, message } };
        this.diagnosticsHooks.onJsonRpcError?.(id, method, code, message);
      } else {
        ctx.status = 200;
        const result = await this.proxy.call(method, params);
        ctx.body = { jsonrpc, id, result };
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

export type StatusCheckFn = () => boolean | Promise<boolean>;

interface Proxy {
  hasMethod(methodName: string): boolean;
  call(methodName: string, jsonParams?: any[]): Promise<any>;
}

/**
 * Forwards calls to a handler. Relies on a schema definition to validate and convert inputs
 * before forwarding calls, and then converts outputs into JSON using default conversions.
 */
export class SafeJsonProxy<T extends object = any> implements Proxy {
  private log = createLogger('json-rpc:proxy');
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
    const args = parseWithOptionals(jsonParams, this.schema[methodName].parameters());
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

export type ApiHandler<T extends object = any> = [T, ApiSchemaFor<T>, StatusCheckFn?];

export function makeHandler<T extends object>(handler: T, schema: ApiSchemaFor<T>): ApiHandler<T> {
  return [handler, schema];
}

function makeAggregateHealthcheck(namedHandlers: NamespacedApiHandlers, log?: Logger): StatusCheckFn {
  return async () => {
    try {
      const results = await Promise.all(
        Object.entries(namedHandlers).map(([name, [, , healthCheck]]) => [name, healthCheck ? healthCheck() : true]),
      );
      const failed = results.filter(([_, result]) => !result);
      if (failed.length > 0) {
        log?.warn(`Health check failed for ${failed.map(([name]) => name).join(', ')}`);
        return false;
      }
      return true;
    } catch (err) {
      log?.error(`Error during health check`, err);
      return false;
    }
  };
}

type SafeJsonRpcServerOptions = {
  http200OnError: boolean;
  healthCheck?: StatusCheckFn;
  log?: Logger;
  diagnosticHooks?: JsonRpcDiagnosticHooks;
};

/**
 * Creates a single SafeJsonRpcServer from multiple handlers.
 * @param servers - List of handlers to be combined.
 * @returns A single JsonRpcServer with namespaced methods.
 */
export function createNamespacedSafeJsonRpcServer(
  handlers: NamespacedApiHandlers,
  options: Omit<SafeJsonRpcServerOptions, 'healthcheck'> = {
    http200OnError: false,
    log: createLogger('json-rpc:server'),
  },
): SafeJsonRpcServer {
  const { diagnosticHooks, http200OnError, log } = options;
  const proxy = new NamespacedSafeJsonProxy(handlers);
  const healthCheck = makeAggregateHealthcheck(handlers, log);
  return new SafeJsonRpcServer(proxy, http200OnError, healthCheck, diagnosticHooks, log);
}

export function createSafeJsonRpcServer<T extends object = any>(
  handler: T,
  schema: ApiSchemaFor<T>,
  options: SafeJsonRpcServerOptions = { http200OnError: false },
) {
  const { http200OnError, log, healthCheck, diagnosticHooks } = options;
  const proxy = new SafeJsonProxy(handler, schema);
  return new SafeJsonRpcServer(proxy, http200OnError, healthCheck, diagnosticHooks, log);
}

/**
 * Creates a router for handling a plain status request that will return 200 status when running.
 * @param getCurrentStatus - List of health check functions to run.
 * @param apiPrefix - The prefix to use for all api requests
 * @returns - The router for handling status requests.
 */
export function createStatusRouter(getCurrentStatus: StatusCheckFn, apiPrefix = '') {
  const router = new Router({ prefix: `${apiPrefix}` });
  router.get('/status', async (ctx: Koa.Context) => {
    let ok: boolean;
    try {
      ok = (await getCurrentStatus()) === true;
    } catch (err) {
      ok = false;
    }

    ctx.status = ok ? 200 : 500;
  });
  return router;
}

/**
 * Wraps a JsonRpcServer in a nodejs http server and starts it.
 * Installs a status router that calls to the isHealthy method to the server.
 * Returns once starts listening unless noWait is set.
 * @returns A running http server.
 */
export async function startHttpRpcServer(
  rpcServer: Pick<SafeJsonRpcServer, 'getApp' | 'isHealthy'>,
  options: {
    host?: string;
    port?: number | string;
    apiPrefix?: string;
    timeoutMs?: number;
    noWait?: boolean;
  } = {},
): Promise<http.Server & { port: number }> {
  const app = rpcServer.getApp(options.apiPrefix);

  const statusRouter = createStatusRouter(rpcServer.isHealthy.bind(rpcServer), options.apiPrefix);
  app.use(statusRouter.routes()).use(statusRouter.allowedMethods());

  const httpServer = http.createServer(app.callback());
  if (options.timeoutMs) {
    httpServer.timeout = options.timeoutMs;
  }

  const { promise, resolve } = promiseWithResolvers<void>();
  const listenPort = options.port ? (typeof options.port === 'string' ? parseInt(options.port) : options.port) : 0;
  httpServer.listen(listenPort, options.host, () => resolve());

  // Wait until listen callback is called
  if (!options.noWait) {
    await promise;
  }

  const port = (httpServer.address() as AddressInfo).port;
  return Object.assign(httpServer, { port });
}
