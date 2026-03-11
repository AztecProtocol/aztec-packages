import type http from 'http';

import { makeFetch } from '../client/fetch.js';
import { createSafeJsonRpcClient } from '../client/safe_json_rpc_client.js';
import { TestNote, TestState, type TestStateApi, TestStateSchema } from '../fixtures/test_state.js';
import { getApiKeyAuthMiddleware, sha256Hash } from './api_key_auth.js';
import { createSafeJsonRpcServer, startHttpRpcServer } from './safe_json_rpc_server.js';

describe('API key auth integration', () => {
  const RAW_API_KEY = 'integration-test-api-key-0123456789abcdef0123456789abcdef';
  const API_KEY_HASH = sha256Hash(RAW_API_KEY);

  let testState: TestState;
  let httpServer: http.Server & { port: number };
  let url: string;

  beforeEach(async () => {
    testState = new TestState([new TestNote('a'), new TestNote('b')]);
    const rpcServer = createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema, {
      middlewares: [getApiKeyAuthMiddleware(API_KEY_HASH)],
    });
    httpServer = await startHttpRpcServer(rpcServer, { host: '127.0.0.1' });
    url = `http://127.0.0.1:${httpServer.port}`;
  });

  afterEach(() => {
    httpServer?.close();
  });

  const noRetryFetch = makeFetch([], true);

  function createClient(apiKey?: string) {
    return createSafeJsonRpcClient<TestStateApi>(url, TestStateSchema, {
      fetch: noRetryFetch,
      ...(apiKey ? { extraHeaders: { 'x-api-key': apiKey } } : {}),
    });
  }

  function createClientWithBearer(apiKey: string) {
    return createSafeJsonRpcClient<TestStateApi>(url, TestStateSchema, {
      fetch: noRetryFetch,
      extraHeaders: { Authorization: `Bearer ${apiKey}` },
    });
  }

  describe('with valid API key', () => {
    it('allows RPC calls via x-api-key header', async () => {
      const client = createClient(RAW_API_KEY);
      const count = await client.count();
      expect(count).toBe(2);
    });

    it('allows RPC calls via Authorization: Bearer header', async () => {
      const client = createClientWithBearer(RAW_API_KEY);
      const note = await client.getNote(0);
      expect(note?.toString()).toBe('a');
    });

    it('allows multiple sequential calls', async () => {
      const client = createClient(RAW_API_KEY);
      const count1 = await client.count();
      await client.addNotes([new TestNote('c')]);
      const count2 = await client.count();
      expect(count1).toBe(2);
      expect(count2).toBe(3);
    });
  });

  describe('with invalid API key', () => {
    it('rejects RPC calls with wrong key', async () => {
      const client = createClient('wrong-api-key');
      await expect(client.count()).rejects.toThrow();
    });

    it('rejects RPC calls with empty key header', async () => {
      const client = createClient('');
      await expect(client.count()).rejects.toThrow();
    });
  });

  describe('with no API key', () => {
    it('rejects RPC calls without any auth header', async () => {
      const client = createClient(); // no key
      await expect(client.count()).rejects.toThrow();
    });
  });

  describe('health check bypass', () => {
    it('allows GET /status without auth', async () => {
      const response = await fetch(`${url}/status`);
      expect(response.status).toBe(200);
    });
  });

  describe('full flow: generate key, authenticate, reject bad key', () => {
    it('simulates the operator flow end-to-end', async () => {
      // 1: "Generate" an API key (simulating what resolveAdminApiKey does)
      const { randomBytes } = await import('crypto');
      const generatedKey = randomBytes(32).toString('hex');
      const generatedHash = sha256Hash(generatedKey);

      // 2: Start a NEW server with the generated hash
      const freshState = new TestState([new TestNote('x'), new TestNote('y')]);
      const freshRpcServer = createSafeJsonRpcServer<TestStateApi>(freshState, TestStateSchema, {
        middlewares: [getApiKeyAuthMiddleware(generatedHash)],
      });
      const freshHttpServer = await startHttpRpcServer(freshRpcServer, { host: '127.0.0.1' });
      const freshUrl = `http://127.0.0.1:${freshHttpServer.port}`;

      try {
        // 3: Make an authenticated request — should succeed
        const goodClient = createSafeJsonRpcClient<TestStateApi>(freshUrl, TestStateSchema, {
          fetch: noRetryFetch,
          extraHeaders: { 'x-api-key': generatedKey },
        });
        const count = await goodClient.count();
        expect(count).toBe(2);

        // 4: Make a request with a bad key, should fail
        const badClient = createSafeJsonRpcClient<TestStateApi>(freshUrl, TestStateSchema, {
          fetch: noRetryFetch,
          extraHeaders: { 'x-api-key': 'definitely-not-the-right-key' },
        });
        await expect(badClient.count()).rejects.toThrow();

        // 5: Make a request with no key, should fail
        const noAuthClient = createSafeJsonRpcClient<TestStateApi>(freshUrl, TestStateSchema, {
          fetch: noRetryFetch,
        });
        await expect(noAuthClient.count()).rejects.toThrow();

        // 6: Health check should still work without auth
        const statusResp = await fetch(`${freshUrl}/status`);
        expect(statusResp.status).toBe(200);
      } finally {
        freshHttpServer.close();
      }
    });
  });
});
