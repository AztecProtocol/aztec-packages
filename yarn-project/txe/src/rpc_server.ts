import { createSafeJsonRpcServer } from '@aztec/foundation/json-rpc/server';
import type { Logger } from '@aztec/foundation/log';

import type { Socket } from 'node:net';

import { TXEDispatcherPool } from './dispatcher_pool.js';
// eslint-disable-next-line import-x/no-cycle
import { TXEDispatcher, TXEDispatcherApiSchema } from './index.js';

/**
 * Symbol used to tag an incoming TCP socket with the `session_id` it has been associated with.
 * Hidden under a Symbol so we don't risk colliding with anything koa or http core adds.
 */
const SESSION_SYMBOL = Symbol('txeSessionId');

type TaggedSocket = Socket & { [SESSION_SYMBOL]?: number };

/**
 * Creates an RPC server that forwards calls to the TXE.
 *
 * By default, oracle calls are dispatched to a pool of worker threads — one TXESession per worker,
 * sticky by `session_id`. Set `TXE_WORKERS=0` to fall back to running everything on the main
 * thread (the legacy behavior).
 *
 * The middleware tags each incoming TCP socket with the `session_id` of the first oracle call it
 * carries (nargo opens a fresh `HttpClient` per test, so the mapping is 1:1). When the socket
 * closes — which happens as soon as nargo's `RPCForeignCallExecutor` is dropped at end-of-test —
 * we fire `dispatcher.disposeSession()` and the worker tears down the session's
 * `NativeWorldStateService` + per-session LMDB. Without this, the `sessions` Map in `index.ts`
 * accumulates dead sessions for the lifetime of the TXE process, which makes per-session
 * `syncMs` (native world-state init) grow unboundedly under load.
 *
 * This entry point lives in its own module so that the worker bundle does not pull in the HTTP
 * server stack (koa-router, raw-body, iconv-lite, mime-db, ...) just because it imports
 * `TXEDispatcher` from `index.ts`. Only the main-thread `bin/index.ts` imports this file.
 *
 * @param logger - Logger to output to
 * @returns A TXE RPC server.
 */
export function createTXERpcServer(logger: Logger) {
  const workerCount = Number(process.env.TXE_WORKERS);
  const dispatcher =
    workerCount === 0
      ? new TXEDispatcher(logger)
      : new TXEDispatcherPool(logger, {
          workers: Number.isFinite(workerCount) && workerCount > 0 ? workerCount : undefined,
        });
  const server = createSafeJsonRpcServer(dispatcher, TXEDispatcherApiSchema, {
    http200OnError: true,
    middlewares: [
      async (ctx, next) => {
        // `extraMiddlewares` are installed BEFORE the koa-bodyparser in
        // `createSafeJsonRpcServer`, so `ctx.request.body` is empty here. Let the rest of the
        // pipeline run first, then read the parsed body to tag the socket.
        await next();
        const socket = ctx.req.socket as TaggedSocket;
        if (socket[SESSION_SYMBOL] !== undefined) {
          return;
        }
        const body = (ctx.request as { body?: unknown }).body;
        const sessionId =
          body && typeof body === 'object' && 'params' in body
            ? extractSessionId((body as { params: unknown }).params)
            : undefined;
        if (sessionId === undefined) {
          return;
        }
        // jsonrpsee opens one HttpClient (and so one TCP connection) per test, sends every
        // oracle call for that test on it, then drops the client when the test finishes —
        // closing the socket. The 1:1 mapping was confirmed empirically in /tmp/socket-spy.mjs:
        // 60 tests → 60 unique sockets → 60 unique session_ids → 60 close events.
        socket[SESSION_SYMBOL] = sessionId;
        logger.info(`Socket ${socket.remoteAddress}:${socket.remotePort} tagged with session=${sessionId}`);
        socket.once('close', () => {
          // Pool variant is fire-and-forget (void); standalone variant returns a Promise we
          // intentionally don't await — the socket is already gone, nobody is waiting on the
          // cleanup result.
          logger.info(`Disposing session ${sessionId} on socket close`);
          void dispatcher.disposeSession(sessionId);
        });
      },
    ],
  });
  return server;
}

function extractSessionId(params: unknown): number | undefined {
  if (!Array.isArray(params) || params.length === 0) {
    return undefined;
  }
  const first = params[0];
  if (first && typeof first === 'object' && 'session_id' in first) {
    const sid = (first as { session_id: unknown }).session_id;
    return typeof sid === 'number' ? sid : undefined;
  }
  return undefined;
}
