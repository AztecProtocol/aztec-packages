import { afterEach, describe, expect, it } from '@jest/globals';

import { defaultFetch, makeFetch } from './fetch.js';

describe('JSON-RPC fetch', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('preserves the native fetch credentials default', async () => {
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (_input, init) => {
      requestInit = init;
      return Promise.resolve(new Response('{}'));
    };

    await defaultFetch('https://rpc.example', {});

    expect(requestInit?.credentials).toBeUndefined();
  });

  it('passes configured credentials through retrying fetch', async () => {
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (_input, init) => {
      requestInit = init;
      return Promise.resolve(new Response('{}'));
    };

    await makeFetch([], false, undefined, { credentials: 'include' })('https://rpc.example', {});

    expect(requestInit?.credentials).toBe('include');
  });
});
