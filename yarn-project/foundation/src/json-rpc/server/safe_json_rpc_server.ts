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
import {
  type ApiSchema,
  type ApiSchemaFor,
  getSchemaParameters,
  parseWithOptionals,
  schemaHasMethod,
} from '../../schemas/index.js';
import { Timer } from '../../timer/index.js';
import { jsonStringify } from '../convert.js';
import { assert } from '../js_utils.js';

export type DiagnosticsData = {
  id: number | string | null;
  method: string;
  params: any[];
  headers: http.IncomingHttpHeaders;
  requestValidationDurationMs?: number;
  requestValidationSucceeded?: boolean;
};

export type DiagnosticsMiddleware = (ctx: DiagnosticsData, next: () => Promise<void>) => Promise<void>;

export type SafeJsonRpcServerConfig = {
  /** Maximum batch size for batched rpc requests */
  maxBatchSize: number;
  /** Return an HTTP 200 status code on errors, but include an error object as per the JSON RPC spec */
  http200OnError: boolean;
  /** The maximum body size the server will accept */
  maxBodySizeBytes: string;
  /** Origins allowed to make credentialed cross-origin requests. An empty list preserves wildcard CORS. */
  corsAllowedOrigins?: string[];
};

type ResolvedSafeJsonRpcServerConfig = Omit<SafeJsonRpcServerConfig, 'corsAllowedOrigins'> & {
  corsAllowedOrigins: string[];
};

const defaultServerConfig: ResolvedSafeJsonRpcServerConfig = {
  http200OnError: false,
  maxBatchSize: 100,
  maxBodySizeBytes: '1mb',
  corsAllowedOrigins: [],
};

function normalizeCorsOrigin(origin: string): string {
  if (origin === '*') {
    return origin;
  }
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Invalid CORS origin protocol: ${origin}`);
  }
  if (url.username || url.password || (url.pathname !== '' && url.pathname !== '/') || url.search || url.hash) {
    throw new Error(
      `CORS allowed origin must not include credentials, a path, query parameters, or a fragment: ${origin}`,
    );
  }
  return url.origin;
}

export class SafeJsonRpcServer {
  /**
   * The HTTP server accepting remote requests.
   * This member field is initialized when the server is started.
   */
  private httpServer?: http.Server;

  private config: ResolvedSafeJsonRpcServerConfig;

  constructor(
    /** The proxy object to delegate requests to */
    private readonly proxy: Proxy,
    config: Partial<SafeJsonRpcServerConfig> = {},
    /** Health check function */
    private readonly healthCheck: StatusCheckFn = () => true,
    /** Additional Koa middlewares */
    private extraMiddlewares: Application.Middleware[] = [],
    /** Additional per-request diagnostics middlewares */
    private diagnosticsMiddleware?: DiagnosticsMiddleware,
    /** Logger */
    private log = createLogger('json-rpc:server'),
  ) {
    this.config = { ...defaultServerConfig, ...config };
    this.config.corsAllowedOrigins = this.config.corsAllowedOrigins.map(normalizeCorsOrigin);

    // handle empty string
    if (!this.config.maxBodySizeBytes) {
      this.config.maxBodySizeBytes = defaultServerConfig.maxBodySizeBytes;
    }
  }

  /** Returns the status of this server, including per-component health when the health check reports it. */
  public getStatus(): Promise<ServerStatus> {
    return Promise.resolve(this.healthCheck()).then(result => {
      const { healthy, details } = normalizeStatusCheckResult(result);
      return { ok: healthy, ...details };
    });
  }

  public isHealthy(): boolean | Promise<boolean> {
    return this.getStatus().then(status => status.ok);
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
          ctx.body = { jsonrpc: '2.0', id: null, error: { code: -32603, message: err.message ?? 'Internal error' } };
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
    if (this.config.corsAllowedOrigins.length === 0) {
      app.use(cors());
    } else {
      const allowedOrigins = new Set(this.config.corsAllowedOrigins);
      const allowAnyOrigin = allowedOrigins.has('*');
      app.use(
        cors({
          origin: ctx => {
            const origin = ctx.get('Origin');
            if (!origin) {
              return '';
            }

            if (allowAnyOrigin) {
              return origin;
            }

            if (allowedOrigins.has(origin)) {
              return origin;
            }

            return '';
          },
          credentials: true,
        }),
      );
    }
    for (const middleware of this.extraMiddlewares) {
      app.use(middleware);
    }
    app.use(exceptionHandler);
    app.use(
      bodyParser({
        jsonLimit: this.config.maxBodySizeBytes,
        enableTypes: ['json'],
      }),
    );
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
        const resp = await this.processBatch(ctx.request.body, ctx.request.headers);
        if (Array.isArray(resp)) {
          ctx.status = 200;
          ctx.body = resp;
        } else {
          ctx.status = this.config.http200OnError ? 200 : 400;
          ctx.body = resp;
        }
      } else {
        const resp = await this.processRequest(ctx.request.body, ctx.request.headers);
        if ('error' in resp) {
          ctx.status = this.config.http200OnError ? 200 : 400;
        }

        ctx.body = resp;
      }
    });

    return router;
  }

  private async processBatch(requests: any[], headers: http.IncomingHttpHeaders = {}) {
    if (requests.length === 0) {
      return { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: null };
    }
    const results = await Promise.allSettled(requests.map(req => this.processRequest(req, headers)));
    return results.map(res => {
      if (res.status === 'fulfilled') {
        return res.value;
      }

      this.log.warn(`Uncaught error executing request in batch: ${res.reason}.`);
      return { jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null };
    });
  }

  private async processRequest(request: any, headers: http.IncomingHttpHeaders = {}) {
    if (!request || typeof request !== 'object') {
      return { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: null };
    }

    const { params = [], jsonrpc = '2.0', id, method } = request;
    if (typeof method !== 'string' || !method) {
      return { jsonrpc: '2.0', id, error: { code: -32600, message: `Invalid request` } };
    }

    // Fail if not a registered function in the proxy
    if (typeof method !== 'string' || method === 'constructor' || !this.proxy.hasMethod(method)) {
      return { jsonrpc, id, error: { code: -32601, message: `Method not found: ${method}` } };
    } else {
      try {
        let result: any;

        if (this.diagnosticsMiddleware) {
          const diagnosticsData: DiagnosticsData = { id: id ?? null, method, params, headers };
          await this.diagnosticsMiddleware(diagnosticsData, async () => {
            result = await this.proxy.call(method, params, (durationMs, succeeded) => {
              diagnosticsData.requestValidationDurationMs = durationMs;
              diagnosticsData.requestValidationSucceeded = succeeded;
            });
          });
        } else {
          result = await this.proxy.call(method, params);
        }

        // Coerce an undefined return value to null so the response always carries a `result` key.
        // JSON.stringify drops undefined-valued keys, which would otherwise produce a JSON-RPC
        // response with neither `result` nor `error` — a spec violation that leaves callers unable
        // to distinguish "not found" from a malformed response.
        return { jsonrpc, id, result: result ?? null };
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

/** Health of a single component, along with any details worth surfacing to whoever queries the status endpoint. */
export type StatusCheckResult = {
  /** Whether the component is healthy. */
  healthy: boolean;
  /** Component-specific information, reported next to the healthy flag. */
  details?: object;
};

/** Health check for a component. Returning a plain boolean is shorthand for `{ healthy: <boolean> }`. */
export type StatusCheckFn = () => boolean | StatusCheckResult | Promise<boolean | StatusCheckResult>;

/** Health of a component as reported on the status endpoint: its healthy flag flattened with its details. */
export type ComponentStatus = { healthy: boolean } & Record<string, unknown>;

/** Status of a server as reported on the status endpoint. */
export type ServerStatus = {
  /** Whether every checked component reported healthy. */
  ok: boolean;
  /** Health of each component keyed by namespace, when the server has component-level health checks. */
  components?: Record<string, ComponentStatus>;
};

/** Returns the status of a server. */
export type ServerStatusFn = () => ServerStatus | Promise<ServerStatus>;

function normalizeStatusCheckResult(result: boolean | StatusCheckResult): StatusCheckResult {
  return typeof result === 'boolean' ? { healthy: result } : result;
}

interface Proxy {
  hasMethod(methodName: string): boolean;
  call(
    methodName: string,
    jsonParams?: any[],
    onRequestValidated?: (durationMs: number, succeeded: boolean) => void,
  ): Promise<any>;
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
  public async call(
    methodName: string,
    jsonParams: any[] = [],
    onRequestValidated?: (durationMs: number, succeeded: boolean) => void,
  ) {
    this.log.debug(format(`request`, methodName, jsonParams));

    assert(schemaHasMethod(this.schema, methodName), `Method ${methodName} not found in schema`);
    const method = this.handler[methodName as keyof T];
    assert(typeof method === 'function', `Method ${methodName} is not a function`);
    const validationTimer = new Timer();
    let args: any[];
    try {
      assert(Array.isArray(jsonParams), `Params to ${methodName} is not an array: ${jsonParams}`);
      args = await parseWithOptionals(jsonParams, getSchemaParameters(this.schema[methodName]));
      onRequestValidated?.(validationTimer.ms(), true);
    } catch (error) {
      onRequestValidated?.(validationTimer.ms(), false);
      throw error;
    }
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

  public call(
    namespacedMethodName: string,
    jsonParams: any[] = [],
    onRequestValidated?: (durationMs: number, succeeded: boolean) => void,
  ) {
    const [namespace, methodName] = namespacedMethodName.split('_', 2);
    assert(namespace && methodName, `Invalid namespaced method name: ${namespacedMethodName}`);
    const handler = this.proxies[namespace];
    assert(handler, `Namespace not found: ${namespace}`);
    return handler.call(methodName, jsonParams, onRequestValidated);
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
  return async (): Promise<StatusCheckResult> => {
    try {
      const entries = await Promise.all(
        Object.entries(namedHandlers).map(async ([name, [, , healthCheck]]): Promise<[string, ComponentStatus]> => {
          const { healthy, details } = normalizeStatusCheckResult(healthCheck ? await healthCheck() : true);
          return [name, { healthy, ...details }];
        }),
      );
      const components = Object.fromEntries(entries);
      const failed = entries.filter(([, status]) => !status.healthy).map(([name]) => name);
      if (failed.length > 0) {
        log?.warn(`Health check failed for ${failed.join(', ')}`, { components });
      }
      return { healthy: failed.length === 0, details: { components } };
    } catch (err) {
      log?.error(`Error during health check`, err);
      return { healthy: false };
    }
  };
}

export type SafeJsonRpcServerOptions = Partial<
  SafeJsonRpcServerConfig & {
    healthCheck: StatusCheckFn;
    diagnostic: DiagnosticsMiddleware;
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
  const { diagnostic, middlewares, log } = options;
  const proxy = new NamespacedSafeJsonProxy(handlers);
  const healthCheck = makeAggregateHealthcheck(handlers, log);
  return new SafeJsonRpcServer(proxy, options, healthCheck, middlewares, diagnostic, log);
}

export function createSafeJsonRpcServer<T extends object = any>(
  handler: T,
  schema: ApiSchemaFor<T>,
  options: SafeJsonRpcServerOptions = {},
) {
  const { diagnostic, log, healthCheck, middlewares: extraMiddlewares } = options;
  const proxy = new SafeJsonProxy(handler, schema);
  return new SafeJsonRpcServer(proxy, options, healthCheck, extraMiddlewares, diagnostic, log);
}

/**
 * Creates a router for handling a status request that returns a 200 status code when healthy and a 500 otherwise,
 * along with the reported status as a JSON body.
 * @param getCurrentStatus - Function returning the current status of the server.
 * @param apiPrefix - The prefix to use for all api requests
 * @returns - The router for handling status requests.
 */
export function createStatusRouter(getCurrentStatus: ServerStatusFn, apiPrefix = '') {
  const router = new Router({ prefix: `${apiPrefix}` });
  router.get('/status', async (ctx: Koa.Context) => {
    let status: ServerStatus;
    try {
      status = await getCurrentStatus();
    } catch {
      status = { ok: false };
    }

    ctx.status = status.ok === true ? 200 : 500;
    ctx.type = 'application/json';
    ctx.body = status;
  });
  return router;
}

/**
 * Wraps a JsonRpcServer in a nodejs http server and starts it.
 * Installs a status router that reports the status of the server, using its getStatus method when available so that
 * per-component health is included, and falling back to isHealthy otherwise.
 * Returns once starts listening unless noWait is set.
 * @returns A running http server.
 */
export async function startHttpRpcServer(
  rpcServer: Pick<SafeJsonRpcServer, 'getApp' | 'isHealthy'> & Partial<Pick<SafeJsonRpcServer, 'getStatus'>>,
  options: {
    host?: string;
    port?: number | string;
    apiPrefix?: string;
    timeoutMs?: number;
    noWait?: boolean;
  } = {},
): Promise<http.Server & { port: number }> {
  const app = rpcServer.getApp(options.apiPrefix);

  const getStatus: ServerStatusFn = rpcServer.getStatus
    ? rpcServer.getStatus.bind(rpcServer)
    : async () => ({ ok: (await rpcServer.isHealthy()) === true });

  const statusRouter = createStatusRouter(getStatus, options.apiPrefix);
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
