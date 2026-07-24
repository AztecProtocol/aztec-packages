import { createLogger } from '@aztec/aztec.js/log';

import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const logger = createLogger('e2e:latency-proxy');

/**
 * A small HTTP JSON-RPC reverse proxy that forwards requests to a target RPC, optionally after a configurable
 * per-request delay, while counting requests per JSON-RPC method. Used by benchmarks to inject L1 latency and
 * to observe how many L1 requests a code path issues. Not for production use.
 */
export interface LatencyProxy extends AsyncDisposable {
  /** The URL callers should point their L1 client at. */
  readonly url: string;
  /** Sets the artificial per-request delay applied before forwarding. */
  setDelayMs(ms: number): void;
  /** Returns the request count for a specific JSON-RPC method, or the total across all methods when omitted. */
  getRequestCount(method?: string): number;
  /** Resets all per-method counters to zero. */
  resetCounts(): void;
  /** Stops the proxy server. */
  stop(): Promise<void>;
}

/**
 * Starts a latency proxy in front of `targetUrl`.
 * @param targetUrl - The upstream JSON-RPC endpoint to forward to.
 * @param initialDelayMs - The initial artificial delay applied to each request (default 0).
 */
export async function startLatencyProxy(targetUrl: string, initialDelayMs = 0): Promise<LatencyProxy> {
  let delayMs = initialDelayMs;
  const counts = new Map<string, number>();

  const record = (body: string) => {
    try {
      const parsed = JSON.parse(body);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        const method = typeof entry?.method === 'string' ? entry.method : 'unknown';
        counts.set(method, (counts.get(method) ?? 0) + 1);
      }
    } catch {
      counts.set('unparseable', (counts.get('unparseable') ?? 0) + 1);
    }
  };

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk as Buffer));
    req.on('end', () => {
      void (async () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        record(body);
        if (delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        try {
          const upstream = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
          });
          const text = await upstream.text();
          res.writeHead(upstream.status, { 'content-type': 'application/json' });
          res.end(text);
        } catch (err) {
          logger.error(`Latency proxy upstream request failed`, err);
          res.writeHead(502, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'proxy upstream error' } }));
        }
      })();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  logger.info(`Latency proxy listening`, { url, targetUrl, initialDelayMs });

  const stop = () =>
    new Promise<void>((resolve, reject) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close(err => (err ? reject(err) : resolve()));
    });

  return {
    url,
    setDelayMs(ms: number) {
      delayMs = ms;
    },
    getRequestCount(method?: string) {
      if (method === undefined) {
        return [...counts.values()].reduce((a, b) => a + b, 0);
      }
      return counts.get(method) ?? 0;
    },
    resetCounts() {
      counts.clear();
    },
    stop,
    async [Symbol.asyncDispose]() {
      await stop();
    },
  };
}
