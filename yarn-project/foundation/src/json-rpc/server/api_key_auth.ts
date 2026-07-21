import { timingSafeEqual } from 'crypto';
import type Koa from 'koa';

import { sha256 } from '../../crypto/sha256/index.js';
import { createLogger } from '../../log/index.js';

const log = createLogger('json-rpc:api-key-auth');

/**
 * Computes the SHA-256 hash of a string and returns it as a Buffer.
 * @param input - The input string to hash.
 * @returns The SHA-256 hash as a Buffer.
 */
export function sha256Hash(input: string): Buffer {
  return sha256(Buffer.from(input));
}

/**
 * Creates a Koa middleware that enforces API key authentication on all requests
 * except the health check endpoint (GET /status).
 *
 * The API key can be provided via the `x-api-key` header or the `Authorization: Bearer <key>` header.
 * Comparison is done by hashing the provided key with SHA-256 and comparing against the stored hash.
 *
 * @param apiKeyHash - The SHA-256 hash of the expected API key as a Buffer.
 * @returns A Koa middleware that rejects requests without a valid API key.
 */
export function getApiKeyAuthMiddleware(
  apiKeyHash: Buffer,
): (ctx: Koa.Context, next: () => Promise<void>) => Promise<void> {
  return async (ctx: Koa.Context, next: () => Promise<void>) => {
    // Allow health check through without auth
    if (ctx.path === '/status' && ctx.method === 'GET') {
      return next();
    }

    const providedKey = ctx.get('x-api-key') || ctx.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!providedKey) {
      log.warn(`Rejected admin RPC request from ${ctx.ip}: missing API key`);
      ctx.status = 401;
      ctx.body = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message: 'Unauthorized: invalid or missing API key' },
      };
      return;
    }

    const providedHashBuf = sha256Hash(providedKey);
    if (!timingSafeEqual(apiKeyHash, providedHashBuf)) {
      log.warn(`Rejected admin RPC request from ${ctx.ip}: invalid API key`);
      ctx.status = 401;
      ctx.body = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message: 'Unauthorized: invalid or missing API key' },
      };
      return;
    }

    await next();
  };
}
