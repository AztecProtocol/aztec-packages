import cors from '@koa/cors';
import http from 'http';
import { type default as Application, default as Koa } from 'koa';
import bodyParser from 'koa-bodyparser';
import compress from 'koa-compress';
import Router from 'koa-router';
import type { AddressInfo } from 'net';
import { format, inspect } from 'util';
import { ZodError } from 'zod';

import { type Logger, createLogger } from '../../log/index.js';
import { promiseWithResolvers } from '../../promise/utils.js';
import { type ApiSchema, type ApiSchemaFor, parseWithOptionals, schemaHasMethod } from '../../schemas/index.js';
import { jsonStringify } from '../convert.js';
import { assert } from '../js_utils.js';

export type DiagnosticsData = {
  id: number | string | null;
  method: string;
  params: any[];
  headers: http.IncomingHttpHeaders;
};

export type DiagnosticsMiddleware = (ctx: DiagnosticsData, next: () => Promise<void>) => Promise<void>;

export type SafeJsonRpcServerConfig = {
  /** Maximum batch size for batched rpc requests */
  maxBatchSize: number;
  /** Return an HTTP 200 status code on errors, but include an error object as per the JSON RPC spec */
  http200OnError: boolean;
  /** The maximum body size the server will accept */
  maxBodySizeBytes: string;
};

const defaultServerConfig: SafeJsonRpcServerConfig = {
  http200OnError: false,
  maxBatchSize: 100,
  maxBodySizeBytes: '50mb',
};

export class SafeJsonRpcServer {
  /**
   * The HTTP server accepting remote requests.
   * This member field is initialized when the server is started.
   */
  private httpServer?: http.Server;

  private config: SafeJsonRpcServerConfig;

  constructor(
    /** The proxy object to delegate requests to */
    private readonly proxy: Proxy,
    config: Partial<SafeJsonRpcServerConfig> = {},
    /** Health check function */
    private readonly healthCheck: StatusCheckFn = () => true,
    /** Additional middlewares */
    private extraMiddlewares: Application.Middleware[] = [],
    /** Logger */
    private log = createLogger('json-rpc:server'),
  ) {
    this.config = { ...defaultServerConfig, ...config };

    // handle empty string
    if (!this.config.maxBodySizeBytes) {
      this.config.maxBodySizeBytes = defaultServerConfig.maxBodySizeBytes;
    }
  }

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
        this.log.warn(`Uncaught error in JSON RPC server call ${method}: ${inspect(err)}`);
        if (err && 'name' in err && err.name === 'BadRequestError') {
          ctx.status = 400;
          ctx.body = { jsonrpc: '2.0', id: null, error: { code: -32000, message: `Bad request: ${err.message}` } };
        } else if (err && err instanceof SyntaxError) {
          ctx.status = 400;
          ctx.body = { jsonrpc: '2.0', id: null, error: { code: -32700, message: `Parse error: ${err.message}` } };
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
    for (const middleware of this.extraMiddlewares) {
      app.use(middleware);
    }
    app.use(exceptionHandler);
    app.use(bodyParser({ jsonLimit: this.config.maxBodySizeBytes, enableTypes: ['json'], detectJSON: () => true }));
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
      if (Array.isArray(ctx.request.body)) {
        if (ctx.request.body.length > this.config.maxBatchSize) {
          ctx.status = this.config.http200OnError ? 200 : 400;
          ctx.body = {
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: `Batch request exceeds maximum allowed size of ${this.config.maxBatchSize}`,
            },
            id: null,
          };
          return;
        }
        const resp = await this.processBatch(ctx.request.body);
        if (Array.isArray(resp)) {
          ctx.status = 200;
          ctx.body = resp;
        } else {
          ctx.status = this.config.http200OnError ? 200 : 400;
          ctx.body = resp;
        }
      } else {
        const resp = await this.processRequest(ctx.request.body);
        if ('error' in resp) {
          ctx.status = this.config.http200OnError ? 200 : 400;
        }

        ctx.body = resp;
      }
    });

    return router;
  }

  private async processBatch(requests: any[]) {
    if (requests.length === 0) {
      return { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: null };
    }
    const results = await Promise.allSettled(requests.map(req => this.processRequest(req)));
    return results.map(res => {
      if (res.status === 'fulfilled') {
        return res.value;
      }

      this.log.warn(`Uncaught error executing request in batch: ${res.reason}.`);
      return { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: null };
    });
  }

  private async processRequest(request: any) {
    if (!request || typeof request !== 'object') {
      return { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: null };
    }

    const { params = [], jsonrpc, id, method } = request;
    // Fail if not a registered function in the proxy
    if (typeof method !== 'string' || method === 'constructor' || !this.proxy.hasMethod(method)) {
      return { jsonrpc, id, error: { code: -32601, message: `Method not found: ${method}` } };
    } else {
      try {
        const result = await this.proxy.call(method, params);
        return { jsonrpc, id, result };
      } catch (err: any) {
        if (err && err instanceof ZodError) {
          const message = err.issues.map(e => `${e.message} (${e.path.join('.')})`).join('. ') || 'Validation error';
          return { jsonrpc: '2.0', id, error: { code: -32701, message } };
        } else if (err) {
          return {
            jsonrpc,
            id,
            error: { code: -32702, data: err.data, message: err.message },
          };
        } else {
          return {
            jsonrpc,
            id,
            error: { code: -32702, message: 'Error executing request' },
          };
        }
      }
    }
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

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
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

  constructor(
    private handler: T,
    schema: ApiSchemaFor<T>,
  ) {
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
    const args = await parseWithOptionals(jsonParams, this.schema[methodName].parameters());
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
        Object.entries(namedHandlers).map(async ([name, [, , healthCheck]]) => [
          name,
          healthCheck ? await healthCheck() : true,
        ]),
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

export type SafeJsonRpcServerOptions = Partial<
  SafeJsonRpcServerConfig & {
    healthCheck: StatusCheckFn;
    log: Logger;
    middlewares: Application.Middleware[];
  }
>;

/**
 * Creates a single SafeJsonRpcServer from multiple handlers.
 * @param servers - List of handlers to be combined.
 * @returns A single JsonRpcServer with namespaced methods.
 */
export function createNamespacedSafeJsonRpcServer(
  handlers: NamespacedApiHandlers,
  options: Omit<SafeJsonRpcServerOptions, 'healthcheck'> = {},
): SafeJsonRpcServer {
  const { middlewares, log } = options;
  const proxy = new NamespacedSafeJsonProxy(handlers);
  const healthCheck = makeAggregateHealthcheck(handlers, log);
  return new SafeJsonRpcServer(proxy, options, healthCheck, middlewares, log);
}

export function createSafeJsonRpcServer<T extends object = any>(
  handler: T,
  schema: ApiSchemaFor<T>,
  options: SafeJsonRpcServerOptions = {},
) {
  const { log, healthCheck, middlewares: extraMiddlewares } = options;
  const proxy = new SafeJsonProxy(handler, schema);
  return new SafeJsonRpcServer(proxy, options, healthCheck, extraMiddlewares, log);
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
    } catch {
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

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  const httpServer = http.createServer(app.callback());
  if (options.timeoutMs) {
    httpServer.timeout = options.timeoutMs;
  }

  const { promise, resolve } = promiseWithResolvers<void>();
  const listenPort = options.port ? (typeof options.port === 'string' ? parseInt(options.port) : options.port) : 0;
  httpServer.listen({ host: options.host, port: listenPort, reuseAddress: true }, () => resolve());

  // Wait until listen callback is called
  if (!options.noWait) {
    await promise;
  }

  const port = (httpServer.address() as AddressInfo).port;
  return Object.assign(httpServer, { port });
}
