import { createSafeJsonRpcServer } from '@aztec/foundation/json-rpc/server';
import type { Logger } from '@aztec/foundation/log';

import type { Socket } from 'node:net';

import { TXEDispatcherPool, buildSharedContractStore } from './dispatcher_pool.js';
import { TXEDispatcher, TXEDispatcherApiSchema } from './index.js';

/**
 * Symbol used to tag an incoming TCP socket with the `session_id` it has been associated with.
 * Hidden under a Symbol so we don't risk colliding with anything koa or http core adds.
 */
const SESSION_SYMBOL = Symbol('txeSessionId');

type TaggedSocket = Socket & { [SESSION_SYMBOL]?: number };

/**
 * Creates the TXE RPC server. With `TXE_WORKERS=1` oracle calls run on the main thread (no
 * worker_threads, no IPC overhead). With any other value oracle calls are
 * routed to a pool of worker threads sized to that value, sticky by `session_id`.
 *
 * Each incoming TCP socket is tagged with the `session_id` of the first oracle call it carries —
 * nargo uses one HTTP client per test, so the socket-to-session mapping is 1:1. When the socket
 * closes (end of test), the dispatcher disposes the session and frees its world state + LMDB.
 *
 * Lives in its own module so the worker bundle does not pull in the HTTP server stack.
 */
export async function createTXERpcServer(logger: Logger) {
  const workerCount = Number(process.env.TXE_WORKERS);
  let dispatcher: TXEDispatcher | TXEDispatcherPool;
  if (workerCount === 1) {
    const { dataDir, schnorrClassId } = await buildSharedContractStore();
    dispatcher = new TXEDispatcher(logger, { contractStoreSourceDir: dataDir, schnorrClassId });
  } else {
    dispatcher = new TXEDispatcherPool(logger, {
      workers: Number.isFinite(workerCount) && workerCount > 1 ? workerCount : undefined,
    });
  }
  const server = createSafeJsonRpcServer(dispatcher, TXEDispatcherApiSchema, {
    http200OnError: true,
    middlewares: [
      async (ctx, next) => {
        // The body parser runs further down the chain, so `ctx.request.body` is populated only
        // after `next()` resolves.
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
        socket[SESSION_SYMBOL] = sessionId;
        logger.debug(`Tagged socket with session`, {
          sessionId,
          remoteAddress: socket.remoteAddress,
          remotePort: socket.remotePort,
        });
        socket.once('close', () => {
          logger.debug(`Disposing session on socket close`, { sessionId });
          void dispatcher.disposeSession(sessionId);
        });
      },
    ],
  });
  return server;
}

// Extracts `session_id` from a JSON-RPC `params` array. Always a `number` because session_id
// comes off `JSON.parse`, which never produces BigInt; values above MAX_SAFE_INTEGER lose
// precision but still work as a Map key.
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
