import http from 'http';
import request from 'supertest';

import { times } from '../../collection/array.js';
import { TestNote, TestState, type TestStateApi, TestStateSchema } from '../fixtures/test_state.js';
import {
  type NamespacedApiHandlers,
  type SafeJsonRpcServer,
  createNamespacedSafeJsonRpcServer,
  createSafeJsonRpcServer,
  makeHandler,
  startHttpRpcServer,
} from './safe_json_rpc_server.js';

const jsonrpc = '2.0';

describe('SafeJsonRpcServer', () => {
  let testState: TestState;
  let testNotes: TestNote[];
  let server: SafeJsonRpcServer;

  beforeEach(() => {
    testNotes = [new TestNote('a'), new TestNote('b')];
    testState = new TestState(testNotes);
  });

  const send = (body: any, contentType = 'application/json') =>
    request(server.getApp().callback()).post('/').send(body).set({ 'content-type': contentType });
  const sendBatch = (...body: any[]) => request(server.getApp().callback()).post('/').send(body);

  const expectError = (response: request.Response, httpCode: number, message: string) => {
    expect(JSON.parse(response.text)).toMatchObject({ error: { message } });
    expect(response.status).toBe(httpCode);
  };

  describe('CORS', () => {
    beforeEach(() => {
      server = createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema);
    });

    it('preserves wildcard non-credentialed CORS by default', async () => {
      const response = await send({ method: 'count', params: [] }).set('origin', 'https://app.example.com');

      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('allows credentialed requests from configured origins', async () => {
      server = createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema, {
        corsAllowedOrigins: ['https://app.example.com/'],
      });

      const response = await send({ method: 'count', params: [] }).set('origin', 'https://app.example.com');

      expect(response.headers['access-control-allow-origin']).toBe('https://app.example.com');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers.vary).toContain('Origin');
    });

    it('reflects any request origin when the wildcard policy is configured', async () => {
      server = createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema, {
        corsAllowedOrigins: ['*'],
      });

      const response = await send({ method: 'count', params: [] }).set('origin', 'https://public-app.example.com');

      expect(response.headers['access-control-allow-origin']).toBe('https://public-app.example.com');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers.vary).toContain('Origin');
    });

    it('does not allow requests from origins outside the allowlist', async () => {
      server = createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema, {
        corsAllowedOrigins: ['https://app.example.com'],
      });

      const response = await send({ method: 'count', params: [] }).set('origin', 'https://other.example.com');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('rejects invalid configured origins', () => {
      expect(() =>
        createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema, {
          corsAllowedOrigins: ['https://app.example.com/path'],
        }),
      ).toThrow('CORS allowed origin must not include credentials, a path, query parameters, or a fragment');
    });

    it('handles allowed preflight requests before additional middleware', async () => {
      let middlewareCalled = false;
      server = createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema, {
        corsAllowedOrigins: ['https://app.example.com'],
        middlewares: [
          async (_ctx, next) => {
            middlewareCalled = true;
            await next();
          },
        ],
      });

      const response = await request(server.getApp().callback())
        .options('/')
        .set('origin', 'https://app.example.com')
        .set('access-control-request-method', 'POST')
        .set('access-control-request-headers', 'content-type,x-api-key');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('https://app.example.com');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-allow-headers']).toBe('content-type,x-api-key');
      expect(middlewareCalled).toBe(false);
    });

    it('restricts preflight requests to configured headers', async () => {
      server = createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema, {
        corsAllowedHeaders: ['content-type', 'x-api-key'],
      });

      const response = await request(server.getApp().callback())
        .options('/')
        .set('origin', 'https://app.example.com')
        .set('access-control-request-method', 'POST')
        .set('access-control-request-headers', 'content-type,x-api-key,x-unauthorized');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-headers']).toBe('content-type,x-api-key');
    });

    it('reflects any request origin on preflight under the wildcard policy', async () => {
      server = createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema, {
        corsAllowedOrigins: ['*'],
      });

      const response = await request(server.getApp().callback())
        .options('/')
        .set('origin', 'https://public-app.example.com')
        .set('access-control-request-method', 'POST')
        .set('access-control-request-headers', 'content-type,x-api-key');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('https://public-app.example.com');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('HTTP timeouts', () => {
    beforeEach(() => {
      server = createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema);
    });

    it('preserves the Node.js defaults', async () => {
      const defaultHttpServer = http.createServer();
      await using httpServer = await startHttpRpcServer(server);

      expect(httpServer.keepAliveTimeout).toBe(defaultHttpServer.keepAliveTimeout);
      expect(httpServer.headersTimeout).toBe(defaultHttpServer.headersTimeout);
    });

    it('configures keep-alive and headers timeouts', async () => {
      await using httpServer = await startHttpRpcServer(server, {
        keepAliveTimeoutMs: 65_000,
        headersTimeoutMs: 66_000,
      });

      expect(httpServer.keepAliveTimeout).toBe(65_000);
      expect(httpServer.headersTimeout).toBe(66_000);
    });
  });

  describe('single', () => {
    beforeEach(() => {
      server = createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema);
    });

    it.each([
      [JSON.stringify({ method: 'getNote', params: [1] }), ''],
      [JSON.stringify({ method: 'getNote', params: [1] }), 'text/plain'],
      [JSON.stringify({ method: 'getNote', params: [1] }), 'text/javascript'],
      [new URLSearchParams({ method: 'count' }).toString(), 'application/x-www-formurlencoded'],
      ['foo', 'text/plain'],
      [Buffer.from([0x42]), 'application/octet-stream'],
    ])('rejects non json request bodies', async (body, contentType) => {
      const response = await send(body, contentType);
      expect(response.text).toContain('Invalid request');
      expect(response.status).toBe(400);
    });

    it('calls an RPC function with a primitive parameter', async () => {
      const response = await send({ method: 'getNote', params: [1] });
      expect(response.text).toEqual(JSON.stringify({ jsonrpc, result: { data: 'b' } }));
      expect(response.status).toBe(200);
    });

    it('calls an RPC function with incorrect parameter type', async () => {
      const response = await send({ method: 'getNote', params: [{ index: 1 }] });
      expectError(response, 400, expect.stringContaining('Invalid input: expected number, received object'));
    });

    it('calls an RPC function with a primitive return type', async () => {
      const response = await send({ method: 'count', params: [] });
      expect(response.text).toEqual(JSON.stringify({ jsonrpc, result: 2 }));
      expect(response.status).toBe(200);
    });

    it('calls an RPC function with an array of classes', async () => {
      const response = await send({ method: 'addNotes', params: [[{ data: 'c' }, { data: 'd' }]] });
      expect(response.status).toBe(200);
      expect(response.text).toBe(JSON.stringify({ jsonrpc, result: ['a', 'b', 'c', 'd'].map(data => ({ data })) }));
      expect(testState.notes).toEqual([new TestNote('a'), new TestNote('b'), new TestNote('c'), new TestNote('d')]);
      expect(testState.notes.every(note => note instanceof TestNote)).toBe(true);
    });

    it('calls an RPC function with no inputs nor outputs', async () => {
      const response = await send({ method: 'clear', params: [] });
      expect(response.status).toBe(200);
      expect(response.text).toEqual(JSON.stringify({ jsonrpc, result: null }));
      expect(testState.notes).toEqual([]);
    });

    it('returns an explicit null result (not an omitted field) when a handler returns undefined', async () => {
      const response = await send({ method: 'getNote', params: [99] });
      expect(response.status).toBe(200);
      expect(response.text).toEqual(JSON.stringify({ jsonrpc, result: null }));
      expect(JSON.parse(response.text)).toHaveProperty('result', null);
    });

    it('calls an RPC function that returns a primitive object and a bigint', async () => {
      const response = await send({ method: 'getStatus', params: [] });
      expect(response.status).toBe(200);
      expect(response.text).toEqual(JSON.stringify({ jsonrpc, result: { status: 'ok', count: '2' } }));
    });

    it('calls an RPC function that throws an error', async () => {
      const response = await send({ method: 'fail', params: [] });
      expectError(response, 400, 'Test state failed');
    });

    it('runs diagnostics around the dispatched RPC function', async () => {
      const calls: string[] = [];
      server = createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema, {
        diagnostic: async (ctx, next) => {
          calls.push(`start:${ctx.method}:${ctx.id}:${ctx.headers['x-test-header']}`);
          await next();
          calls.push(`end:${ctx.method}`);
        },
      });

      const response = await request(server.getApp().callback())
        .post('/')
        .send({ jsonrpc: '2.0', method: 'count', params: [], id: 42 })
        .set({ 'content-type': 'application/json', 'x-test-header': 'test-value' });

      expect(response.status).toBe(200);
      expect(response.text).toEqual(JSON.stringify({ jsonrpc, id: 42, result: 2 }));
      expect(calls).toEqual(['start:count:42:test-value', 'end:count']);
    });

    it('reports request validation duration and outcome to diagnostics', async () => {
      const validations: Array<{ durationMs: number | undefined; succeeded: boolean | undefined }> = [];
      server = createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema, {
        diagnostic: async (ctx, next) => {
          try {
            await next();
          } finally {
            validations.push({
              durationMs: ctx.requestValidationDurationMs,
              succeeded: ctx.requestValidationSucceeded,
            });
          }
        },
      });

      await send({ method: 'count', params: [] });
      await send({ method: 'getNote', params: ['invalid'] });
      await send({ method: 'count', params: {} });

      expect(validations).toHaveLength(3);
      expect(validations[0]?.durationMs).toBeGreaterThanOrEqual(0);
      expect(validations[0]?.succeeded).toBe(true);
      expect(validations[1]?.durationMs).toBeGreaterThanOrEqual(0);
      expect(validations[1]?.succeeded).toBe(false);
      expect(validations[2]?.durationMs).toBeGreaterThanOrEqual(0);
      expect(validations[2]?.succeeded).toBe(false);
    });

    it('runs diagnostics for each request in a batch', async () => {
      const methods: string[] = [];
      server = createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema, {
        diagnostic: async (ctx, next) => {
          methods.push(ctx.method);
          await next();
        },
        maxBatchSize: 10,
      });

      const response = await sendBatch(
        { jsonrpc: '2.0', method: 'getStatus', params: [], id: 42 },
        { jsonrpc: '2.0', method: 'clear', params: [], id: 43 },
      );

      expect(response.status).toBe(200);
      expect(methods).toEqual(['getStatus', 'clear']);
    });

    it('lets diagnostics observe handler failures', async () => {
      const errors: string[] = [];
      server = createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema, {
        diagnostic: async (ctx, next) => {
          try {
            await next();
          } catch (err) {
            errors.push(`${ctx.method}:${err instanceof Error ? err.message : String(err)}`);
            throw err;
          }
        },
      });

      const response = await send({ method: 'fail', params: [] });

      expectError(response, 400, 'Test state failed');
      expect(errors).toEqual(['fail:Test state failed']);
    });

    it('fails if sends invalid JSON', async () => {
      const response = await send('{');
      expectError(response, 400, expect.stringContaining('Parse error'));
    });

    it('fails if calls non-existing method in handler', async () => {
      const response = await send({ jsonrpc: '2.0', method: 'invalid', params: [], id: 42 });
      expectError(response, 400, 'Method not found: invalid');
    });

    it('does not run diagnostics for non-existing methods', async () => {
      const methods: string[] = [];
      server = createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema, {
        diagnostic: async (ctx, next) => {
          methods.push(ctx.method);
          await next();
        },
      });

      await send({ jsonrpc: '2.0', method: 'invalid', params: [], id: 42 });

      expect(methods).toEqual([]);
    });

    it('fails if calls method in handler non defined in schema', async () => {
      const response = await send({ jsonrpc: '2.0', method: 'forceClear', params: [], id: 42 });
      expectError(response, 400, 'Method not found: forceClear');
    });

    it('fails if calls base object method', async () => {
      const response = await send({ jsonrpc: '2.0', method: 'toString', params: [], id: 42 });
      expectError(response, 400, 'Method not found: toString');
    });
  });

  describe('batch', () => {
    beforeEach(() => {
      server = createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema, { maxBatchSize: 10 });
    });

    it('handles multiple requests', async () => {
      const resp = await sendBatch(
        { jsonrpc: '2.0', method: 'getStatus', params: [], id: 42 },
        { jsonrpc: '2.0', method: 'clear', params: [], id: 43 },
      );

      expect(resp.status).toEqual(200);
      expect(resp.text).toEqual(
        JSON.stringify([
          { jsonrpc: '2.0', id: 42, result: { status: 'ok', count: '2' } },
          { jsonrpc: '2.0', id: 43, result: null },
        ]),
      );
    });

    it('rejects empty requests array', async () => {
      const resp = await sendBatch();
      expect(resp.status).toEqual(400);
    });

    it('rejects batch exceeding max size', async () => {
      const resp = await sendBatch(...times(11, i => ({ jsonrpc: '2.0', method: 'getNote', params: [i], id: i })));
      expect(resp.status).toEqual(400);
    });

    it('handles partial errors', async () => {
      const resp = await sendBatch(
        { jsonrpc: '2.0', method: 'toString', params: [], id: 42 },
        { jsonrpc: '2.0', method: 'clear', params: [], id: 43 },
      );

      expect(resp.status).toEqual(200);
      expect(resp.text).toEqual(
        JSON.stringify([
          { jsonrpc: '2.0', id: 42, error: { code: -32601, message: 'Method not found: toString' } },
          { jsonrpc: '2.0', id: 43, result: null },
        ]),
      );
    });

    it('handles partial syntax errors', async () => {
      const resp = await sendBatch({ jsonrpc: '2.0', method: 'clear', params: [], id: 43 }, 1);

      expect(resp.status).toEqual(200);
      expect(resp.text).toEqual(
        JSON.stringify([
          { jsonrpc: '2.0', id: 43, result: null },
          { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: null },
        ]),
      );
    });

    it('reports unexpected batch dispatch failures as internal errors', async () => {
      Object.defineProperty(testState, 'count', {
        get: () => {
          throw new Error('Unexpected dispatch failure');
        },
      });

      const resp = await sendBatch({ jsonrpc: '2.0', method: 'count', params: [], id: 42 });

      expect(resp.status).toEqual(200);
      expect(resp.text).toEqual(
        JSON.stringify([{ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null }]),
      );
    });
  });

  describe('namespaced', () => {
    let lettersState: TestState;
    let numbersState: TestState;

    beforeEach(() => {
      lettersState = testState;
      numbersState = new TestState([new TestNote('1'), new TestNote('2')]);
      server = createNamespacedSafeJsonRpcServer({
        letters: makeHandler<TestStateApi>(lettersState, TestStateSchema),
        numbers: makeHandler<TestStateApi>(numbersState, TestStateSchema),
      });
    });

    it('routes to the correct namespace', async () => {
      const response = await send({ method: 'letters_getNote', params: [1] });
      expect(response.status).toBe(200);
      expect(response.text).toEqual(JSON.stringify({ jsonrpc, result: { data: 'b' } }));

      const response2 = await send({ method: 'numbers_getNote', params: [1] });
      expect(response2.status).toBe(200);
      expect(response2.text).toEqual(JSON.stringify({ jsonrpc, result: { data: '2' } }));
    });

    it('fails if namespace is not found', async () => {
      const response = await send({ method: 'invalid_getNote', params: [1] });
      expectError(response, 400, 'Method not found: invalid_getNote');
    });

    it('fails if method is not found in namespace', async () => {
      const response = await send({ method: 'letters_invalid', params: [1] });
      expectError(response, 400, 'Method not found: letters_invalid');
    });

    it('fails if no namespace is provided', async () => {
      const response = await send({ method: 'getNote', params: [1] });
      expectError(response, 400, 'Method not found: getNote');
    });
  });

  describe('status', () => {
    let httpServer: http.Server & { port: number };

    const startServer = async (rpcServer: SafeJsonRpcServer) => {
      httpServer = await startHttpRpcServer(rpcServer, { host: '127.0.0.1' });
      return `http://127.0.0.1:${httpServer.port}`;
    };

    const startNamespacedServer = (handlers: NamespacedApiHandlers) =>
      startServer(createNamespacedSafeJsonRpcServer(handlers));

    afterEach(() => {
      httpServer?.close();
    });

    it('returns 200 with per-component details when all components are healthy', async () => {
      const url = await startNamespacedServer({
        letters: [testState, TestStateSchema, () => ({ healthy: true, details: { connectedPeers: 3 } })],
        numbers: [new TestState([new TestNote('1')]), TestStateSchema, () => true],
      });

      const response = await fetch(`${url}/status`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
      await expect(response.json()).resolves.toEqual({
        ok: true,
        components: { letters: { healthy: true, connectedPeers: 3 }, numbers: { healthy: true } },
      });
    });

    it('returns 500 with the failing component when a component is unhealthy', async () => {
      const url = await startNamespacedServer({
        letters: [testState, TestStateSchema, () => ({ healthy: false, details: { connectedPeers: 0 } })],
        numbers: [new TestState([new TestNote('1')]), TestStateSchema, () => true],
      });

      const response = await fetch(`${url}/status`);
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        components: { letters: { healthy: false, connectedPeers: 0 }, numbers: { healthy: true } },
      });
    });

    it('returns 500 when a component health check returns false', async () => {
      const url = await startNamespacedServer({
        letters: [testState, TestStateSchema, () => false],
      });

      const response = await fetch(`${url}/status`);
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ ok: false, components: { letters: { healthy: false } } });
    });

    it('returns 200 with no components for a server without health checks', async () => {
      const url = await startServer(createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema));

      const response = await fetch(`${url}/status`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
    });
  });
});
