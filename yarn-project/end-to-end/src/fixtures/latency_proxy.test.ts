import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { type LatencyProxy, startLatencyProxy } from './latency_proxy.js';

describe('latency proxy', () => {
  let upstream: Server;
  let upstreamUrl: string;
  let upstreamRequests: string[];
  let proxy: LatencyProxy;

  beforeEach(async () => {
    upstreamRequests = [];
    upstream = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', c => chunks.push(c as Buffer));
      req.on('end', () => {
        upstreamRequests.push(Buffer.concat(chunks).toString('utf-8'));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x2a' }));
      });
    });
    await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
    upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await proxy?.stop();
    await new Promise<void>(resolve => upstream.close(() => resolve()));
  });

  async function rpc(url: string, body: unknown): Promise<unknown> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  it('forwards requests to the upstream and returns its response', async () => {
    proxy = await startLatencyProxy(upstreamUrl);
    const result = await rpc(proxy.url, { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] });
    expect(result).toEqual({ jsonrpc: '2.0', id: 1, result: '0x2a' });
    expect(upstreamRequests).toHaveLength(1);
  });

  it('applies the configured per-request delay before forwarding', async () => {
    proxy = await startLatencyProxy(upstreamUrl, 0);
    proxy.setDelayMs(150);
    const start = Date.now();
    await rpc(proxy.url, { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [] });
    expect(Date.now() - start).toBeGreaterThanOrEqual(140);
  });

  it('counts requests per JSON-RPC method, including batches, and resets counters', async () => {
    proxy = await startLatencyProxy(upstreamUrl);
    await rpc(proxy.url, { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [] });
    await rpc(proxy.url, { jsonrpc: '2.0', id: 2, method: 'eth_call', params: [] });
    await rpc(proxy.url, [
      { jsonrpc: '2.0', id: 3, method: 'eth_getBlockByNumber', params: [] },
      { jsonrpc: '2.0', id: 4, method: 'eth_call', params: [] },
    ]);

    expect(proxy.getRequestCount('eth_call')).toBe(3);
    expect(proxy.getRequestCount('eth_getBlockByNumber')).toBe(1);
    expect(proxy.getRequestCount()).toBe(4);

    proxy.resetCounts();
    expect(proxy.getRequestCount()).toBe(0);
    expect(proxy.getRequestCount('eth_call')).toBe(0);
  });

  it('supports async-disposable teardown', async () => {
    let url: string;
    {
      await using disposable = await startLatencyProxy(upstreamUrl);
      url = disposable.url;
      const result = await rpc(url, { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] });
      expect(result).toEqual({ jsonrpc: '2.0', id: 1, result: '0x2a' });
    }
    // After disposal the server is closed and no longer accepts connections.
    await expect(fetch(url, { method: 'POST', body: '{}' })).rejects.toThrow();
  });
});
