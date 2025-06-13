import { jest } from '@jest/globals';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import request, { type SuperTest, type Test } from 'supertest';
import { z } from 'zod';

import type { ApiSchemaFor } from '../../schemas/api.js';
import { sleep } from '../../sleep/index.js';
import type { JsonRpcFetch } from './fetch.js';
import { batch, createSafeJsonRpcClient } from './safe_json_rpc_client.js';

interface TestService {
  setValue: (val: string) => Promise<string>;
  getValue: () => Promise<string | undefined>;
  badReturn: () => Promise<number>;
}

const schema: ApiSchemaFor<TestService> = {
  setValue: z.function().args(z.string()).returns(z.string()),
  getValue: z.function().args().returns(z.string().optional()),
  badReturn: z.function().args().returns(z.number()),
};

describe('SafeJsonRpcClient', () => {
  jest.setTimeout(5_000);

  let st: SuperTest<Test>;
  let stFetch: jest.Mock<JsonRpcFetch>;
  let handler: jest.Mock<(calls: Array<{ id: string; method: string; params: any[] }>) => any>;

  beforeEach(() => {
    handler = jest.fn(calls =>
      calls.map(({ id, method, params }) => {
        let msg = 'foo';
        switch (method) {
          case 'setValue':
            msg = params[0];
            return { id, result: msg };
          case 'getValue':
            return { id, result: msg };
          case 'badReturn':
            return { id, result: '42' };

          default:
            return { id, error: { code: -32601, message: 'Method not found' } };
        }
      }),
    );

    const app = new Koa();
    app.use(bodyParser());
    app.use(async ctx => {
      const reqBody = ctx.request.body as any;
      const calls = Array.isArray(reqBody) ? reqBody : [reqBody];
      ctx.body = JSON.stringify(await handler(calls));
      ctx.headers['content-type'] = 'application/json';
    });

    st = request(app.callback());
    stFetch = jest.fn(async (_host: string, body: any) => {
      const response = await st.post('').set('content-type', 'application/json').send(JSON.stringify(body));
      const parsed = JSON.parse(response.text);
      return { response: parsed, headers: new Headers(response.headers) };
    });
  });

  describe.each([0, 1, 10, 25, 100])('batching window %d', ms => {
    let client: TestService;

    beforeEach(() => {
      client = createSafeJsonRpcClient('http://localhost', schema, {
        batchWindowMS: ms,
        fetch: stFetch,
      });
    });

    it('sends single requests', async () => {
      await expect(client.setValue('bar')).resolves.toEqual('bar');
      expect(handler).toHaveBeenCalledWith([{ jsonrpc: '2.0', id: 0, method: 'setValue', params: ['bar'] }]);
    });

    it('sends multiple requests in the same batch in order', async () => {
      const p1 = client.setValue('1');
      const p2 = client.setValue('2');
      const p3 = client.setValue('3');

      await Promise.all([p1, p2, p3]);
      expect(handler).toHaveBeenCalledWith([
        { jsonrpc: '2.0', id: 0, method: 'setValue', params: ['1'] },
        { jsonrpc: '2.0', id: 1, method: 'setValue', params: ['2'] },
        { jsonrpc: '2.0', id: 2, method: 'setValue', params: ['3'] },
      ]);
    });

    // test disabled because sometimesit hangs in supertest..
    it.skip('breaks batches up after window closes', async () => {
      const p1 = client.setValue('a');
      await sleep(ms);
      const p2 = client.setValue('b');
      const p3 = client.setValue('c');

      const first = await Promise.race([p1, p2, p3]);
      expect(first).toEqual('a');

      await Promise.all([p1, p2, p3]);
      expect(handler).toHaveBeenNthCalledWith(1, [{ jsonrpc: '2.0', id: 0, method: 'setValue', params: ['a'] }]);
      expect(handler).toHaveBeenNthCalledWith(2, [
        { jsonrpc: '2.0', id: 1, method: 'setValue', params: ['b'] },
        { jsonrpc: '2.0', id: 2, method: 'setValue', params: ['c'] },
      ]);
    });

    it('handles errors in some requests', async () => {
      const p1 = client.setValue('1');
      const p2 = client.getValue();
      const p3 = client.badReturn();

      const results = await Promise.allSettled([p1, p2, p3]);
      expect(handler).toHaveBeenCalledWith([
        { jsonrpc: '2.0', id: 0, method: 'setValue', params: ['1'] },
        { jsonrpc: '2.0', id: 1, method: 'getValue', params: [] },
        { jsonrpc: '2.0', id: 2, method: 'badReturn', params: [] },
      ]);

      expect(results).toEqual([
        {
          status: 'fulfilled',
          value: '1',
        },
        { status: 'fulfilled', value: expect.stringMatching(/^foo|1$/) },
        { status: 'rejected', reason: expect.objectContaining({ name: 'ZodError' }) },
      ]);
    });

    it('handles fetch errors', async () => {
      stFetch.mockRejectedValueOnce(new Error('test error'));
      const p1 = client.setValue('1');
      const p2 = client.getValue();
      const p3 = client.badReturn();

      const results = await Promise.allSettled([p1, p2, p3]);
      expect(results).toEqual([
        { status: 'rejected', reason: expect.objectContaining({ name: 'Error' }) },
        { status: 'rejected', reason: expect.objectContaining({ name: 'Error' }) },
        { status: 'rejected', reason: expect.objectContaining({ name: 'Error' }) },
      ]);
    });
  });

  describe('manual batching', () => {
    let client: TestService;

    beforeEach(() => {
      client = createSafeJsonRpcClient('http://localhost', schema, {
        batchWindowMS: 100,
        fetch: stFetch,
      });
    });

    it('splits into batches', async () => {
      const b1 = batch([client.getValue(), client.setValue('1')]);
      const b2 = batch([client.setValue('bar')]);

      await expect(b1).resolves.toEqual(['foo', '1']);
      await expect(b2).resolves.toEqual(['bar']);

      expect(handler).toHaveBeenNthCalledWith(1, [
        { jsonrpc: '2.0', id: 0, method: 'getValue', params: [] },
        { jsonrpc: '2.0', id: 1, method: 'setValue', params: ['1'] },
      ]);

      expect(handler).toHaveBeenNthCalledWith(2, [{ jsonrpc: '2.0', id: 2, method: 'setValue', params: ['bar'] }]);
    });

    it('splits into batches inside Promise.all', async () => {
      const [b1, b2] = await Promise.all([
        batch([client.getValue(), client.setValue('1')]),
        batch([client.setValue('bar')]),
      ]);

      expect(b1).toEqual(['foo', '1']);
      expect(b2).toEqual(['bar']);

      expect(handler).toHaveBeenNthCalledWith(1, [
        { jsonrpc: '2.0', id: 0, method: 'getValue', params: [] },
        { jsonrpc: '2.0', id: 1, method: 'setValue', params: ['1'] },
      ]);

      expect(handler).toHaveBeenNthCalledWith(2, [{ jsonrpc: '2.0', id: 2, method: 'setValue', params: ['bar'] }]);
    });

    it('accepts normal promises', async () => {
      const res = await batch([client.getValue(), Promise.resolve(42)]);
      expect(res).toEqual(['foo', 42]);
      expect(handler).toHaveBeenNthCalledWith(1, [{ jsonrpc: '2.0', id: 0, method: 'getValue', params: [] }]);
    });
  });

  describe('specifying max batch size', () => {
    let client: TestService;
    let maxBatchSize: number;
    let batchWindowMS: number;

    beforeEach(() => {
      maxBatchSize = 3;
      batchWindowMS = 100;
      client = createSafeJsonRpcClient('http://localhost', schema, {
        batchWindowMS,
        maxBatchSize,
        fetch: stFetch,
      });
    });

    it('splits into batches', async () => {
      const promises: Promise<any>[] = [];

      // leave the last batch incomplete
      for (let i = 0; i < Math.floor(9.5 * maxBatchSize); i++) {
        promises.push(client.getValue());
      }

      // send a couple of batchs through
      await sleep(2.5 * batchWindowMS);
      expect(handler).toHaveBeenCalledTimes(2);

      // complete the last batch
      for (let i = Math.floor(0.5) * maxBatchSize; i < maxBatchSize - 1; i++) {
        promises.push(client.getValue());
      }

      await Promise.all(promises);
      expect(handler).toHaveBeenCalledTimes(10);

      // check we can still send
      await client.getValue();
      expect(handler).toHaveBeenCalledTimes(11);
    });
  });

  describe('specifying max body size', () => {
    let client: TestService;
    let batchWindowMS: number;
    let maxRequestBodySize: number;

    beforeEach(() => {
      maxRequestBodySize = 512;
      batchWindowMS = 100;
      client = createSafeJsonRpcClient('http://localhost', schema, {
        batchWindowMS,
        maxRequestBodySize,
        fetch: stFetch,
      });
    });

    it('splits into batches', async () => {
      const promises: Promise<any>[] = [];
      promises.push(client.setValue('0'.repeat(maxRequestBodySize / 2)));
      promises.push(client.setValue('0'.repeat(maxRequestBodySize / 2)));
      promises.push(client.setValue('0'.repeat(maxRequestBodySize / 2)));

      await Promise.all(promises);
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });
});
