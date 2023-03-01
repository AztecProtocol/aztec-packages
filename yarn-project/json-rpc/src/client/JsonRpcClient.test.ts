import request from 'supertest';
import { JsonRpcServer } from '../server/JsonRpcServer.js';
import { TestState, TestNote } from '../test/TestState.js';
import { JsonRpcClient } from './JsonRpcClient.js';

test('test an RPC function over client', async () => {
  const client = new JsonRpcClient<TestState>('', { TestNote });
  // Mock the method
  (client as any).fetch = async (method: string, body: any) => {
    const server = new JsonRpcServer(new TestState([new TestNote('a'), new TestNote('b')]), { TestNote });
    const result = await request(server.getApp().callback()).post(`/${method}`).send(body);
    return JSON.parse(result.text);
  };
  const result = await client.rpc.addNotes([new TestNote('c')]);
  expect(result[0]).toBeInstanceOf(TestNote);
  expect(result[1]).toBeInstanceOf(TestNote);
  expect(result[2]).toBeInstanceOf(TestNote);
  expect(result[0].toString()).toBe('a');
  expect(result[1].toString()).toBe('b');
  expect(result[2].toString()).toBe('c');
});
