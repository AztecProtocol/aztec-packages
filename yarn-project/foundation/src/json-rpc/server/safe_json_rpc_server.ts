import { format } from 'util';

import { createDebugLogger } from '../../log/index.js';
import { toJSON } from '../convert.js';
import { assert, hasOwnProperty } from '../js_utils.js';
import { JsonRpcServer } from './json_rpc_server.js';

/** Overrides the JsonRpcServer with a SafeJsonProxy that delegates input conversion to the handler. */
export class SafeJsonRpcServer extends JsonRpcServer {
  constructor(handler: ApiBranded, log = createDebugLogger('json-rpc:server')) {
    super(handler, {}, {}, [], log);
    this.proxy = new SafeJsonProxy(handler);
  }
}

/** Forwards calls to a handler. Converts only outputs into JSON, expecting the handler to validate and convert inputs. */
export class SafeJsonProxy {
  private log = createDebugLogger('json-rpc:proxy');

  constructor(private handler: object) {}

  /**
   * Call an RPC method.
   * @param methodName - The RPC method.
   * @param jsonParams - The RPC parameters.
   * @returns The remote result.
   */
  public async call(methodName: string, jsonParams: any[] = []) {
    this.log.debug(format(`JsonProxy:call`, methodName, jsonParams));
    // Get access to our class members
    const proto = Object.getPrototypeOf(this.handler);
    assert(hasOwnProperty(proto, methodName), `JsonProxy: Method ${methodName} not found!`);
    assert(Array.isArray(jsonParams), `JsonProxy: ${methodName} params not an array: ${jsonParams}`);
    this.log.debug(format('JsonProxy:call', methodName, '<-', jsonParams));
    const rawRet = await (this.handler as any)[methodName](...jsonParams);
    const ret = toJSON(rawRet);
    this.log.debug(format('JsonProxy:call', methodName, '->', ret));
    return ret;
  }
}

/**
 * Creates a single SafeJsonRpcServer from multiple handlers.
 * @param servers - List of handlers to be combined.
 * @returns A single JsonRpcServer with namespaced methods.
 */
export function createNamespacedSafeJsonRpcServer(
  handlers: Record<string, ApiHandler>,
  log = createDebugLogger('json-rpc:server'),
): JsonRpcServer {
  const namespacedHandler = { __branding: ApiBrand } as ApiHandler;
  for (const [namespace, handler] of Object.entries(handlers)) {
    const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(handler));
    for (const methodName of methodNames) {
      if (typeof handler[methodName] === 'function') {
        const namespacedMethod = `${namespace}_${methodName}`;
        namespacedHandler[namespacedMethod] = (...args: any[]) => handler[methodName](...args);
      }
    }
  }

  return new SafeJsonRpcServer(namespacedHandler, log);
}

/** Identifier for Api classes. Prevents from accidentally exposing something that is not an API behind a JsonRpcServer. */
export const ApiBrand = 'Api' as const;

type ApiBranded = { __branding: typeof ApiBrand };

/**
 * Maps a given interface to a set of functions with unknown arguments.
 * Use `parse(arguments, schemas)` to validate and convert them.
 * Note that all functions in the interface must be async.
 */
export type ApiHandlerFor<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => Promise<infer R> ? () => Promise<R> : never;
} & ApiBranded;

type ApiHandler = ApiBranded & { [key: string]: (...args: any[]) => any };
