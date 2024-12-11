import { createSafeJsonRpcClient } from '../client/safe_json_rpc_client.js';
import { TestNote, TestState, type TestStateApi, TestStateSchema } from '../fixtures/test_state.js';
import { startHttpRpcServer } from '../server/safe_json_rpc_server.js';
import {
  type SafeJsonRpcServer,
  createNamespacedSafeJsonRpcServer,
  makeHandler,
} from '../server/safe_json_rpc_server.js';
import { createJsonRpcTestSetup } from './integration.js';

describe('JsonRpc integration', () => {
  let testState: TestState;
  let testNotes: TestNote[];

  let server: SafeJsonRpcServer;
  let httpServer: Awaited<ReturnType<typeof startHttpRpcServer>>;

  beforeEach(() => {
    testNotes = [new TestNote('a'), new TestNote('b')];
    testState = new TestState(testNotes);
  });

  afterEach(() => {
    httpServer?.close();
  });

  describe('single', () => {
    let client: TestStateApi;

    beforeEach(async () => {
      ({ server, httpServer, client } = await createJsonRpcTestSetup(testState, TestStateSchema));
    });

    it('calls an RPC function with a primitive parameter', async () => {
      const note = await client.getNote(1);
      expect(note).toEqual(testNotes[1]);
      expect(note).toBeInstanceOf(TestNote);
    });

    it('calls an RPC function without an optional parameter', async () => {
      const notes = await client.getNotes();
      expect(notes).toEqual(testNotes);
      expect(notes.every(note => note instanceof TestNote)).toBe(true);
    });

    it('calls an RPC function with an optional parameter', async () => {
      const notes = await client.getNotes(1);
      expect(notes).toEqual([testNotes[0]]);
      expect(notes.every(note => note instanceof TestNote)).toBe(true);
    });

    it('calls an RPC function with a bigint parameter', async () => {
      const notes = await client.getNotes2(1n);
      expect(notes).toEqual([testNotes[0]]);
      expect(notes.every(note => note instanceof TestNote)).toBe(true);
    });

    it('calls an RPC function with an undefined parameter', async () => {
      const notes = await client.getNotes2(undefined);
      expect(notes).toEqual(testNotes);
      expect(notes.every(note => note instanceof TestNote)).toBe(true);
    });

    it('calls an RPC function with a default parameter', async () => {
      const notes = await client.getNotes3();
      expect(notes).toEqual([testNotes[0]]);
      expect(notes.every(note => note instanceof TestNote)).toBe(true);
    });

    it('calls an RPC function with a default parameter with explicit undefined', async () => {
      const notes = await client.getNotes3(undefined);
      expect(notes).toEqual([testNotes[0]]);
      expect(notes.every(note => note instanceof TestNote)).toBe(true);
    });

    it('calls an RPC function overriding the default parameter', async () => {
      const notes = await client.getNotes3(5);
      expect(notes).toEqual(testNotes);
      expect(notes.every(note => note instanceof TestNote)).toBe(true);
    });

    it('calls an RPC function with incorrect parameter type', async () => {
      await expect(() => client.getNote('foo' as any)).rejects.toThrow('Expected number, received string');
    });

    it('calls an RPC function with a primitive return type', async () => {
      const count = await client.count();
      expect(count).toBe(2);
    });

    it('calls an RPC function with an array of classes', async () => {
      const notes = await client.addNotes(['c', 'd'].map(data => new TestNote(data)));
      expect(notes).toEqual(['a', 'b', 'c', 'd'].map(data => new TestNote(data)));
      expect(notes.every(note => note instanceof TestNote)).toBe(true);
    });

    it('calls an RPC function with no inputs nor outputs', async () => {
      await client.clear();
      expect(testState.notes).toEqual([]);
    });

    it('calls an RPC function that returns a primitive object with a bigint', async () => {
      const status = await client.getStatus();
      expect(status).toEqual({ status: 'ok', count: 2n });
    });

    it('calls an RPC function that returns a tuple', async () => {
      const status = await client.getTuple();
      expect(status).toEqual(['a', undefined, 1]);
    });

    it('calls an RPC function that returns undefined', async () => {
      const note = await client.getNote(10);
      expect(note).toBeUndefined();
    });

    it('calls an RPC function that throws an error', async () => {
      await expect(() => client.fail()).rejects.toThrow('Test state failed');
    });

    it('fails if calls non-existing method in handler', () => {
      expect(() => (client as TestState).forceClear()).toThrow(/not a function/i);
    });
  });

  describe('namespaced', () => {
    let lettersState: TestState;
    let numbersState: TestState;

    let lettersClient: TestStateApi;
    let numbersClient: TestStateApi;

    let url: string;

    beforeEach(async () => {
      lettersState = testState;
      numbersState = new TestState([new TestNote('1'), new TestNote('2')]);
      server = createNamespacedSafeJsonRpcServer({
        letters: makeHandler<TestStateApi>(lettersState, TestStateSchema),
        numbers: makeHandler<TestStateApi>(numbersState, TestStateSchema),
      });

      httpServer = await startHttpRpcServer(server, { host: '127.0.0.1' });
      url = `http://127.0.0.1:${httpServer.port}`;
      lettersClient = createSafeJsonRpcClient<TestStateApi>(url, TestStateSchema, false, 'letters');
      numbersClient = createSafeJsonRpcClient<TestStateApi>(url, TestStateSchema, false, 'numbers');
    });

    it('calls correct namespace', async () => {
      const note = await lettersClient.getNote(1);
      expect(note).toEqual(testNotes[1]);
      expect(note).toBeInstanceOf(TestNote);

      const numberNote = await numbersClient.getNote(1);
      expect(numberNote).toEqual(new TestNote('2'));
      expect(numberNote).toBeInstanceOf(TestNote);
    });

    it('fails if calls without namespace', async () => {
      const client = createSafeJsonRpcClient<TestStateApi>(url, TestStateSchema, false);
      await expect(() => client.getNote(1)).rejects.toThrow('Method not found: getNote');
    });
  });
});
