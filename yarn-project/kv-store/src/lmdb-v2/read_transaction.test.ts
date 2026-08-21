import { toArray } from '@aztec/foundation/iterable';
import { promiseWithResolvers } from '@aztec/foundation/promise';

import { vi } from 'vitest';

import {
  CURSOR_PAGE_SIZE,
  Database,
  type LMDBMessageChannel,
  LMDBMessageType,
  type LMDBResponseBody,
} from './message.js';
import { ReadTransaction } from './read_transaction.js';

describe('ReadTransaction', () => {
  let channel: { sendMessage: ReturnType<typeof vi.fn<(...args: any[]) => any>> } & LMDBMessageChannel;
  let tx: ReadTransaction;

  beforeEach(() => {
    channel = { sendMessage: vi.fn() } as any;
    tx = new ReadTransaction(channel);
  });

  it('sends GET requests', async () => {
    const getDeferred = promiseWithResolvers<LMDBResponseBody[LMDBMessageType.GET]>();

    channel.sendMessage.mockReturnValue(getDeferred.promise);

    const resp = tx.get(Buffer.from('test_key1'));

    expect(channel.sendMessage).toHaveBeenCalledWith(LMDBMessageType.GET, {
      db: Database.DATA,
      keys: [Buffer.from('test_key1')],
      txId: null,
    });

    getDeferred.resolve({
      values: [[Buffer.from('foo')]],
    });

    expect(await resp).toEqual(Buffer.from('foo'));
  });

  it('routes reads through the read transaction it was given', async () => {
    const boundTx = new ReadTransaction(channel, 7);
    channel.sendMessage.mockResolvedValue({ values: [[Buffer.from('foo')]] });

    await expect(boundTx.get(Buffer.from('test_key1'))).resolves.toEqual(Buffer.from('foo'));
    expect(channel.sendMessage).toHaveBeenCalledWith(LMDBMessageType.GET, {
      db: Database.DATA,
      keys: [Buffer.from('test_key1')],
      txId: 7,
    });

    await expect(boundTx.getMany([Buffer.from('test_key1')])).resolves.toEqual([Buffer.from('foo')]);
    expect(channel.sendMessage).toHaveBeenLastCalledWith(LMDBMessageType.GET, {
      db: Database.DATA,
      keys: [Buffer.from('test_key1')],
      txId: 7,
    });
  });

  it('splits many keys into chunked GET requests and preserves order', async () => {
    const keys = Array.from({ length: 5 }, (_, i) => Buffer.from(`key${i}`));
    channel.sendMessage.mockImplementation((_type, body: any) =>
      Promise.resolve({ values: body.keys.map((k: Buffer) => (k.equals(keys[3]) ? null : [Buffer.from(`v-${k}`)])) }),
    );

    const result = await tx.getMany(keys, { chunkSize: 2 });

    expect(channel.sendMessage).toHaveBeenCalledTimes(3);
    expect(channel.sendMessage).toHaveBeenNthCalledWith(1, LMDBMessageType.GET, {
      db: Database.DATA,
      keys: keys.slice(0, 2),
      txId: null,
    });
    expect(channel.sendMessage).toHaveBeenNthCalledWith(3, LMDBMessageType.GET, {
      db: Database.DATA,
      keys: keys.slice(4),
      txId: null,
    });
    expect(result).toEqual(keys.map((k, i) => (i === 3 ? undefined : Buffer.from(`v-${k}`))));
  });

  it('rejects an invalid chunk size', async () => {
    await expect(tx.getMany([Buffer.from('a')], { chunkSize: 0 })).rejects.toThrow('Invalid getMany chunk size');
  });

  it('sends a single GET request for many keys', async () => {
    const getDeferred = promiseWithResolvers<LMDBResponseBody[LMDBMessageType.GET]>();

    channel.sendMessage.mockReturnValue(getDeferred.promise);

    const keys = [Buffer.from('key1'), Buffer.from('key2'), Buffer.from('key3')];
    const resp = tx.getMany(keys);

    expect(channel.sendMessage).toHaveBeenCalledTimes(1);
    expect(channel.sendMessage).toHaveBeenCalledWith(LMDBMessageType.GET, { db: Database.DATA, keys, txId: null });

    getDeferred.resolve({
      values: [[Buffer.from('foo')], null, [Buffer.from('bar')]],
    });

    expect(await resp).toEqual([Buffer.from('foo'), undefined, Buffer.from('bar')]);
  });

  it('skips the GET request when asked for no keys', async () => {
    expect(await tx.getMany([])).toEqual([]);
    expect(channel.sendMessage).not.toHaveBeenCalled();
  });

  it('refuses batched reads once closed', async () => {
    tx.close();
    await expect(tx.getMany([Buffer.from('foo')])).rejects.toThrow('Transaction is closed');
  });

  it('iterates the database', async () => {
    channel.sendMessage
      .mockResolvedValueOnce({
        cursor: 42,
        entries: [[Buffer.from('foo'), [Buffer.from('a value')]]],
        done: false,
      })
      .mockResolvedValueOnce({
        entries: [[Buffer.from('quux'), [Buffer.from('another value')]]],
        done: true,
      })
      .mockResolvedValueOnce({
        ok: true,
      });

    const iterable = tx.iterate(Buffer.from('foo'));
    const entries = await toArray(iterable);

    expect(entries).toEqual([
      [Buffer.from('foo'), Buffer.from('a value')],
      [Buffer.from('quux'), Buffer.from('another value')],
    ]);

    expect(channel.sendMessage).toHaveBeenCalledWith(LMDBMessageType.START_CURSOR, {
      db: Database.DATA,
      key: Buffer.from('foo'),
      count: CURSOR_PAGE_SIZE,
      onePage: false,
      reverse: false,
      txId: null,
    });

    expect(channel.sendMessage).toHaveBeenCalledWith(LMDBMessageType.ADVANCE_CURSOR, {
      cursor: 42,
      count: CURSOR_PAGE_SIZE,
    });

    expect(channel.sendMessage).toHaveBeenCalledWith(LMDBMessageType.CLOSE_CURSOR, {
      cursor: 42,
    });
  });

  it('closes the cursor early', async () => {
    channel.sendMessage.mockImplementation((type: LMDBMessageType, _body: any) => {
      if (type === LMDBMessageType.START_CURSOR) {
        return Promise.resolve({
          cursor: 42,
          entries: [[Buffer.from('foo'), [Buffer.from('a value')]]],
          done: false,
        });
      }
      if (type === LMDBMessageType.ADVANCE_CURSOR) {
        return Promise.reject(new Error('SHOULD NOT BE CALLED'));
      }
      if (type === LMDBMessageType.CLOSE_CURSOR) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({});
    });

    for await (const entry of tx.iterate(Buffer.from('foo'))) {
      expect(entry).toEqual([Buffer.from('foo'), Buffer.from('a value')]);
      break;
    }

    expect(channel.sendMessage).toHaveBeenCalledWith(LMDBMessageType.CLOSE_CURSOR, {
      cursor: 42,
    });
  });

  it('closes the cursor even if in the case of an error', async () => {
    channel.sendMessage.mockImplementation((type: LMDBMessageType, _body: any) => {
      if (type === LMDBMessageType.START_CURSOR) {
        return Promise.resolve({
          cursor: 42,
          entries: [[Buffer.from('foo'), [Buffer.from('a value')]]],
          done: false,
        });
      }
      if (type === LMDBMessageType.ADVANCE_CURSOR) {
        return Promise.reject(new Error('SHOULD NOT BE CALLED'));
      }
      if (type === LMDBMessageType.CLOSE_CURSOR) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({});
    });

    try {
      for await (const entry of tx.iterate(Buffer.from('foo'))) {
        expect(entry).toEqual([Buffer.from('foo'), Buffer.from('a value')]);
        throw new Error();
      }
    } catch {
      // no op
    }

    expect(channel.sendMessage).toHaveBeenCalledWith(LMDBMessageType.CLOSE_CURSOR, {
      cursor: 42,
    });
  });

  it('handles empty cursors', async () => {
    channel.sendMessage.mockImplementation((type: LMDBMessageType, body: any) => {
      if (
        type === LMDBMessageType.START_CURSOR &&
        Buffer.from('foo').equals(body.key) &&
        body.reverse === false &&
        body.count === CURSOR_PAGE_SIZE &&
        body.db === Database.DATA &&
        body.onePage === false
      ) {
        return Promise.resolve({
          cursor: null,
          entries: [],
          done: true,
        });
      }
      return Promise.resolve({});
    });

    const arr = await toArray(tx.iterate(Buffer.from('foo')));
    expect(arr).toEqual([]);
  });

  it('after close it does not accept requests', async () => {
    tx.close();
    await expect(tx.get(Buffer.from('foo'))).rejects.toThrow('Transaction is closed');
  });
});
