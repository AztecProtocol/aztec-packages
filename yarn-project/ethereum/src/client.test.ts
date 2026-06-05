import { startHttpRpcServer } from '@aztec/foundation/json-rpc/server';

import { type Server, createServer } from 'node:http';
import { createPublicClient } from 'viem';
import { foundry } from 'viem/chains';

import { L1RpcError, getL1RpcHttpStatus, isL1RpcHttpStatus, makeL1HttpTransport } from './client.js';

async function startRateLimitedL1Server(): Promise<{ server: Server; url: string }> {
  const server = createServer((_req, res) => {
    res.writeHead(429, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32005, message: 'rate limited' } }));
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected L1 test server to listen on a TCP port');
  }
  return { server, url: `http://127.0.0.1:${address.port}` };
}

describe('makeL1HttpTransport', () => {
  let l1Server: Server | undefined;
  let rpcHttpServer: Awaited<ReturnType<typeof startHttpRpcServer>> | undefined;

  afterEach(() => {
    rpcHttpServer?.close();
    l1Server?.close();
    rpcHttpServer = undefined;
    l1Server = undefined;
  });

  it('wraps transport errors while preserving the HTTP status in the cause chain', async () => {
    const l1 = await startRateLimitedL1Server();
    l1Server = l1.server;
    const l1Client = createPublicClient({
      chain: foundry,
      transport: makeL1HttpTransport([l1.url]),
    });

    let error: unknown;
    try {
      await l1Client.getChainId();
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(L1RpcError);
    expect(error).toMatchObject({ message: 'L1 RPC request failed' });
    expect(String(error)).toEqual('L1RpcError: L1 RPC request failed');
    expect(getL1RpcHttpStatus(error)).toBe(429);
    expect(isL1RpcHttpStatus(error, 429)).toBe(true);
  });
});
