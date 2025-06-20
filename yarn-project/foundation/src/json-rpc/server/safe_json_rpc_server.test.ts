import request from 'supertest';

import { TestNote, TestState, type TestStateApi, TestStateSchema } from '../fixtures/test_state.js';
import {
  type SafeJsonRpcServer,
  createNamespacedSafeJsonRpcServer,
  createSafeJsonRpcServer,
  makeHandler,
} from './safe_json_rpc_server.js';

describe('SafeJsonRpcServer', () => {
  let testState: TestState;
  let testNotes: TestNote[];
  let server: SafeJsonRpcServer;

  beforeEach(() => {
    testNotes = [new TestNote('a'), new TestNote('b')];
    testState = new TestState(testNotes);
  });

  const send = (body: any) => request(server.getApp().callback()).post('/').send(body);
  const sendBatch = (...body: any[]) => request(server.getApp().callback()).post('/').send(body);

  const expectError = (response: request.Response, httpCode: number, message: string) => {
    expect(JSON.parse(response.text)).toMatchObject({ error: { message } });
    expect(response.status).toBe(httpCode);
  };

  describe('single', () => {
    beforeEach(() => {
      server = createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema);
    });

    it('calls an RPC function with a primitive parameter', async () => {
      const response = await send({ method: 'getNote', params: [1] });
      expect(response.text).toEqual(JSON.stringify({ result: { data: 'b' } }));
      expect(response.status).toBe(200);
    });

    it('calls an RPC function with incorrect parameter type', async () => {
      const response = await send({ method: 'getNote', params: [{ index: 1 }] });
      expectError(response, 400, expect.stringContaining('Expected number, received object'));
    });

    it('calls an RPC function with a primitive return type', async () => {
      const response = await send({ method: 'count', params: [] });
      expect(response.text).toEqual(JSON.stringify({ result: 2 }));
      expect(response.status).toBe(200);
    });

    it('calls an RPC function with an array of classes', async () => {
      const response = await send({ method: 'addNotes', params: [[{ data: 'c' }, { data: 'd' }]] });
      expect(response.status).toBe(200);
      expect(response.text).toBe(JSON.stringify({ result: ['a', 'b', 'c', 'd'].map(data => ({ data })) }));
      expect(testState.notes).toEqual([new TestNote('a'), new TestNote('b'), new TestNote('c'), new TestNote('d')]);
      expect(testState.notes.every(note => note instanceof TestNote)).toBe(true);
    });

    it('calls an RPC function with no inputs nor outputs', async () => {
      const response = await send({ method: 'clear', params: [] });
      expect(response.status).toBe(200);
      expect(response.text).toEqual(JSON.stringify({}));
      expect(testState.notes).toEqual([]);
    });

    it('calls an RPC function that returns a primitive object and a bigint', async () => {
      const response = await send({ method: 'getStatus', params: [] });
      expect(response.status).toBe(200);
      expect(response.text).toEqual(JSON.stringify({ result: { status: 'ok', count: '2' } }));
    });

    it('calls an RPC function that throws an error', async () => {
      const response = await send({ method: 'fail', params: [] });
      expectError(response, 400, 'Test state failed');
    });

    it('fails if sends invalid JSON', async () => {
      const response = await send('{');
      expectError(response, 400, expect.stringContaining('Parse error'));
    });

    it('fails if calls non-existing method in handler', async () => {
      const response = await send({ jsonrpc: '2.0', method: 'invalid', params: [], id: 42 });
      expectError(response, 400, 'Method not found: invalid');
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
      server = createSafeJsonRpcServer<TestStateApi>(testState, TestStateSchema);
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
          { jsonrpc: '2.0', id: 43 },
        ]),
      );
    });

    it('rejects empty requests array', async () => {
      const resp = await sendBatch();
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
          { jsonrpc: '2.0', id: 43 },
        ]),
      );
    });

    it('handles partial syntax errors', async () => {
      const resp = await sendBatch({ jsonrpc: '2.0', method: 'clear', params: [], id: 43 }, 1);

      expect(resp.status).toEqual(200);
      expect(resp.text).toEqual(
        JSON.stringify([
          { jsonrpc: '2.0', id: 43 },
          { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: null },
        ]),
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
      expect(response.text).toEqual(JSON.stringify({ result: { data: 'b' } }));

      const response2 = await send({ method: 'numbers_getNote', params: [1] });
      expect(response2.status).toBe(200);
      expect(response2.text).toEqual(JSON.stringify({ result: { data: '2' } }));
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
});
