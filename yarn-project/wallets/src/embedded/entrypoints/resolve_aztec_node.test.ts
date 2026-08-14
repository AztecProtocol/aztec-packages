import type { JsonRpcFetch } from '@aztec/foundation/json-rpc/client';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import { afterEach, describe, expect, it } from '@jest/globals';

import { resolveAztecNode } from './resolve_aztec_node.js';

describe('resolveAztecNode', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns a provided node unchanged', () => {
    const node = {} as AztecNode;

    expect(resolveAztecNode(node, { fetchOptions: { credentials: 'include' }, maxBatchSize: 1 })).toBe(node);
  });

  it('passes fetch options to a node client created from a URL', async () => {
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (_input, init) => {
      requestInit = init;
      const requests = JSON.parse(init?.body as string) as Array<{ id: number }>;
      const responseBody = JSON.stringify(requests.map(({ id }) => ({ jsonrpc: '2.0', id, result: 1 })));
      return Promise.resolve(new Response(responseBody));
    };
    const node = resolveAztecNode('https://rpc.example', { fetchOptions: { credentials: 'include' } });

    await node.getBlockNumber();

    expect(requestInit?.credentials).toBe('include');
  });

  it('passes maxBatchSize to a node client created from a URL', async () => {
    const batchSizes: number[] = [];
    const fetch: JsonRpcFetch = (_host, body) => {
      const requests = body as Array<{ id: number }>;
      batchSizes.push(requests.length);
      return Promise.resolve({
        response: requests.map(({ id }) => ({ jsonrpc: '2.0', id, result: 1 })),
        headers: new Headers(),
      });
    };
    const node = resolveAztecNode('https://rpc.example', { fetch, maxBatchSize: 2 });

    await Promise.all([node.getBlockNumber(), node.getBlockNumber(), node.getBlockNumber()]);

    expect(batchSizes).toEqual([2, 1]);
  });
});
