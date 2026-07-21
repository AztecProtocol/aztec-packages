import { toArray } from '@aztec/foundation/iterable';

import { vi } from 'vitest';

import { type Batch, CURSOR_PAGE_SIZE, Database, type LMDBMessageChannel, LMDBMessageType } from './message.js';
import { WriteTransaction } from './write_transaction.js';

describe('WriteTransaction', () => {
  let channel: { sendMessage: ReturnType<typeof vi.fn<(...args: any[]) => any>> } & LMDBMessageChannel;
  let tx: WriteTransaction;

  beforeEach(() => {
    channel = { sendMessage: vi.fn() } as any;
    tx = new WriteTransaction(channel);

    channel.sendMessage.mockResolvedValue({ ok: true });
  });

  it('accumulatest writes', async () => {
    await tx.setIndex(Buffer.from('foo'), Buffer.from('1'), Buffer.from('2'), Buffer.from('3'));
    await tx.removeIndex(Buffer.from('bar'), Buffer.from('1'), Buffer.from('2'));
    await tx.set(Buffer.from('foo'), Buffer.from('a'));
    await tx.remove(Buffer.from('baz'));

    await tx.commit();
    expect(channel.sendMessage).toHaveBeenCalledWith(LMDBMessageType.BATCH, {
      batches: new Map<string, Batch>([
        [
          Database.INDEX,
          {
            removeEntries: [[Buffer.from('bar'), [Buffer.from('1'), Buffer.from('2')]]],
            addEntries: [[Buffer.from('foo'), [Buffer.from('1'), Buffer.from('2'), Buffer.from('3')]]],
          },
        ],
        [
          Database.DATA,
          {
            removeEntries: [[Buffer.from('baz'), null]],
            addEntries: [[Buffer.from('foo'), [Buffer.from('a')]]],
          },
        ],
      ]),
    });
  });

  it('correctly manages index batch', async () => {
    await tx.setIndex(Buffer.from('foo'), Buffer.from('1'), Buffer.from('2'), Buffer.from('3'));
    expect(tx.indexBatch).toEqual({
      removeEntries: [],
      addEntries: [[Buffer.from('foo'), [Buffer.from('1'), Buffer.from('2'), Buffer.from('3')]]],
    });

    await tx.setIndex(Buffer.from('foo'), Buffer.from('4'));
    expect(tx.indexBatch).toEqual({
      removeEntries: [],
      addEntries: [[Buffer.from('foo'), [Buffer.from('1'), Buffer.from('2'), Buffer.from('3'), Buffer.from('4')]]],
    });

    await tx.removeIndex(Buffer.from('foo'), Buffer.from('5'));
    expect(tx.indexBatch).toEqual({
      removeEntries: [[Buffer.from('foo'), [Buffer.from('5')]]],
      addEntries: [[Buffer.from('foo'), [Buffer.from('1'), Buffer.from('2'), Buffer.from('3'), Buffer.from('4')]]],
    });

    await tx.removeIndex(Buffer.from('foo'), Buffer.from('1'), Buffer.from('2'), Buffer.from('6'));
    expect(tx.indexBatch).toEqual({
      removeEntries: [[Buffer.from('foo'), [Buffer.from('1'), Buffer.from('2'), Buffer.from('5'), Buffer.from('6')]]],
      addEntries: [[Buffer.from('foo'), [Buffer.from('3'), Buffer.from('4')]]],
    });

    await tx.removeIndex(Buffer.from('foo'));
    expect(tx.indexBatch).toEqual({
      removeEntries: [[Buffer.from('foo'), null]],
      addEntries: [],
    });

    await tx.removeIndex(Buffer.from('foo'), Buffer.from('2'));
    expect(tx.indexBatch).toEqual({
      removeEntries: [[Buffer.from('foo'), [Buffer.from('2')]]],
      addEntries: [],
    });
    await tx.setIndex(Buffer.from('foo'), Buffer.from('2'));
    expect(tx.indexBatch).toEqual({
      removeEntries: [],
      addEntries: [[Buffer.from('foo'), [Buffer.from('2')]]],
    });
  });

  it('correctly meanages pending data reads', async () => {
    channel.sendMessage.mockResolvedValue({ values: [null] });
    expect(await tx.get(Buffer.from('foo'))).toEqual(undefined);

    await tx.set(Buffer.from('foo'), Buffer.from('1'));
    expect(await tx.get(Buffer.from('foo'))).toEqual(Buffer.from('1'));

    await tx.set(Buffer.from('foo'), Buffer.from('2'));
    expect(await tx.get(Buffer.from('foo'))).toEqual(Buffer.from('2'));

    await tx.remove(Buffer.from('foo'));
    expect(await tx.get(Buffer.from('foo'))).toEqual(undefined);
  });

  it('correctly meanages pending index reads', async () => {
    channel.sendMessage.mockResolvedValue({ values: [[Buffer.from('1')]] });
    expect(await tx.getIndex(Buffer.from('foo'))).toEqual([Buffer.from('1')]);

    await tx.setIndex(Buffer.from('foo'), Buffer.from('1'));
    expect(await tx.getIndex(Buffer.from('foo'))).toEqual([Buffer.from('1')]);

    await tx.setIndex(Buffer.from('foo'), Buffer.from('2'));
    expect(await tx.getIndex(Buffer.from('foo'))).toEqual([Buffer.from('1'), Buffer.from('2')]);

    await tx.removeIndex(Buffer.from('foo'), Buffer.from('1'));
    expect(await tx.getIndex(Buffer.from('foo'))).toEqual([Buffer.from('2')]);

    await tx.removeIndex(Buffer.from('foo'));
    expect(await tx.getIndex(Buffer.from('foo'))).toEqual([]);
  });

  it('correctly iterates over pending data', async () => {
    channel.sendMessage.mockImplementation((type: LMDBMessageType) => {
      if (type === LMDBMessageType.START_CURSOR) {
        return Promise.resolve({ cursor: null, entries: [] });
      }
      if (type === LMDBMessageType.ADVANCE_CURSOR) {
        return Promise.reject(new Error('Cursor empty'));
      }
      return Promise.resolve({ ok: true });
    });

    await tx.set(Buffer.from('foo'), Buffer.from('1'));
    await tx.set(Buffer.from('bar'), Buffer.from('2'));
    await tx.set(Buffer.from('baz'), Buffer.from('3'));

    const entries = await toArray(tx.iterate(Buffer.from('bar')));
    expect(entries).toEqual([
      [Buffer.from('bar'), Buffer.from('2')],
      [Buffer.from('baz'), Buffer.from('3')],
      [Buffer.from('foo'), Buffer.from('1')],
    ]);
  });

  it('correctly iterates over uncommitted and committed data', async () => {
    channel.sendMessage.mockImplementation((type: LMDBMessageType) => {
      if (type === LMDBMessageType.START_CURSOR) {
        return Promise.resolve({
          cursor: 42,
          entries: [[Buffer.from('bar'), [Buffer.from('3')]]],
        });
      }
      if (type === LMDBMessageType.ADVANCE_CURSOR) {
        return Promise.resolve({ entries: [[Buffer.from('baz'), [Buffer.from('3')]]], done: true });
      }
      return Promise.resolve({ ok: true });
    });

    await tx.set(Buffer.from('foo'), Buffer.from('1'));
    await tx.set(Buffer.from('bar'), Buffer.from('2'));

    const entries = await toArray(tx.iterate(Buffer.from('bar')));
    expect(entries).toEqual([
      [Buffer.from('bar'), Buffer.from('2')],
      [Buffer.from('baz'), Buffer.from('3')],
      [Buffer.from('foo'), Buffer.from('1')],
    ]);
    expect(channel.sendMessage).toHaveBeenCalledWith(LMDBMessageType.ADVANCE_CURSOR, {
      cursor: 42,
      count: CURSOR_PAGE_SIZE,
    });
  });

  it('correctly iterates over overritten data', async () => {
    channel.sendMessage.mockImplementation((type: LMDBMessageType) => {
      if (type === LMDBMessageType.START_CURSOR) {
        return Promise.resolve({
          cursor: 42,
          entries: [[Buffer.from('baz'), [Buffer.from('3')]]],
        });
      }
      if (type === LMDBMessageType.ADVANCE_CURSOR) {
        return Promise.resolve({ entries: [[Buffer.from('foo'), [Buffer.from('1')]]], done: true });
      }
      return Promise.resolve({ ok: true });
    });

    await tx.remove(Buffer.from('foo'));
    await tx.set(Buffer.from('bar'), Buffer.from('2'));
    await tx.set(Buffer.from('baz'), Buffer.from('42'));
    await tx.set(Buffer.from('quux'), Buffer.from('123'));

    const entries = await toArray(tx.iterate(Buffer.from('bar')));
    expect(entries).toEqual([
      [Buffer.from('bar'), Buffer.from('2')],
      [Buffer.from('baz'), Buffer.from('42')],
      [Buffer.from('quux'), Buffer.from('123')],
    ]);
    expect(channel.sendMessage).toHaveBeenCalledWith(LMDBMessageType.ADVANCE_CURSOR, {
      cursor: 42,
      count: CURSOR_PAGE_SIZE,
    });
  });

  it('correctly iterates until end key', async () => {
    channel.sendMessage.mockImplementation((type: LMDBMessageType) => {
      if (type === LMDBMessageType.START_CURSOR) {
        return Promise.resolve({
          cursor: 42,
          entries: [[Buffer.from('bar'), [Buffer.from('1')]]],
        });
      }
      if (type === LMDBMessageType.ADVANCE_CURSOR) {
        return Promise.resolve({ entries: [[Buffer.from('baz'), [Buffer.from('3')]]], done: true });
      }
      return Promise.resolve({ ok: true });
    });

    await tx.remove(Buffer.from('foo'));
    await tx.set(Buffer.from('bar'), Buffer.from('2'));
    await tx.set(Buffer.from('baz'), Buffer.from('42'));
    await tx.set(Buffer.from('quux'), Buffer.from('123'));

    const entries = await toArray(tx.iterate(Buffer.from('bar'), Buffer.from('foo')));
    expect(entries).toEqual([
      [Buffer.from('bar'), Buffer.from('2')],
      [Buffer.from('baz'), Buffer.from('42')],
    ]);
  });

  it('correctly iterates in reverse', async () => {
    channel.sendMessage.mockImplementation((type: LMDBMessageType) => {
      if (type === LMDBMessageType.START_CURSOR) {
        return Promise.resolve({
          cursor: null,
          entries: [[Buffer.from('baz'), [Buffer.from('3')]]],
        });
      }
      return Promise.resolve({ ok: true });
    });

    await tx.remove(Buffer.from('foo'));
    await tx.set(Buffer.from('bar'), Buffer.from('2'));
    await tx.set(Buffer.from('baz'), Buffer.from('42'));
    await tx.set(Buffer.from('quux'), Buffer.from('123'));

    const entries = await toArray(tx.iterate(Buffer.from('quux'), undefined, true));
    expect(entries).toEqual([
      [Buffer.from('quux'), Buffer.from('123')],
      [Buffer.from('baz'), Buffer.from('42')],
      [Buffer.from('bar'), Buffer.from('2')],
    ]);
  });

  it('correctly iterates in reverse with end key', async () => {
    channel.sendMessage.mockImplementation((type: LMDBMessageType) => {
      if (type === LMDBMessageType.START_CURSOR) {
        return Promise.resolve({
          cursor: 42,
          entries: [[Buffer.from('baz'), [Buffer.from('3')]]],
        });
      }
      if (type === LMDBMessageType.ADVANCE_CURSOR) {
        return Promise.resolve({ entries: [[Buffer.from('bar'), [Buffer.from('3')]]], done: true });
      }
      return Promise.resolve({ ok: true });
    });

    await tx.remove(Buffer.from('foo'));
    await tx.set(Buffer.from('bar'), Buffer.from('2'));
    await tx.set(Buffer.from('baz'), Buffer.from('42'));
    await tx.set(Buffer.from('quux'), Buffer.from('123'));

    const entries = await toArray(tx.iterate(Buffer.from('quux'), Buffer.from('baz'), true));
    expect(entries).toEqual([[Buffer.from('quux'), Buffer.from('123')]]);
  });

  it('correctly iterates over pending index data', async () => {
    channel.sendMessage.mockImplementation((type: LMDBMessageType) => {
      if (type === LMDBMessageType.START_CURSOR) {
        return Promise.resolve({
          cursor: 42,
          entries: [[Buffer.from('baz'), [Buffer.from('3'), Buffer.from('6')]]],
        });
      }
      if (type === LMDBMessageType.ADVANCE_CURSOR) {
        return Promise.resolve({
          entries: [[Buffer.from('foo'), [Buffer.from('2'), Buffer.from('4'), Buffer.from('8')]]],
          done: true,
        });
      }
      return Promise.resolve({ ok: true });
    });

    await tx.setIndex(Buffer.from('foo'), Buffer.from('1'));
    await tx.removeIndex(Buffer.from('foo'), Buffer.from('8'));
    await tx.setIndex(Buffer.from('bar'), Buffer.from('2'), Buffer.from('3'));
    await tx.setIndex(Buffer.from('baz'), Buffer.from('42'));

    const entries = await toArray(tx.iterateIndex(Buffer.from('bar')));
    expect(entries).toEqual([
      [Buffer.from('bar'), [Buffer.from('2'), Buffer.from('3')]],
      [Buffer.from('baz'), [Buffer.from('3'), Buffer.from('42'), Buffer.from('6')]],
      [Buffer.from('foo'), [Buffer.from('1'), Buffer.from('2'), Buffer.from('4')]],
    ]);
  });

  it('correctly iterates over pending index data up to end key', async () => {
    channel.sendMessage.mockImplementation((type: LMDBMessageType) => {
      if (type === LMDBMessageType.START_CURSOR) {
        return Promise.resolve({ cursor: null, entries: [], done: true });
      }
      if (type === LMDBMessageType.ADVANCE_CURSOR) {
        return Promise.reject(new Error('Should not bew called'));
      }
      return Promise.resolve({ ok: true });
    });

    await tx.setIndex(Buffer.from('foo'), Buffer.from('1'));
    await tx.removeIndex(Buffer.from('foo'), Buffer.from('8'));
    await tx.setIndex(Buffer.from('bar'), Buffer.from('2'), Buffer.from('3'));
    await tx.setIndex(Buffer.from('baz'), Buffer.from('42'));

    const entries = await toArray(tx.iterateIndex(Buffer.from('bar'), Buffer.from('baz')));
    expect(entries).toEqual([[Buffer.from('bar'), [Buffer.from('2'), Buffer.from('3')]]]);
  });

  it('correctly iterates over pending index data in reverse', async () => {
    channel.sendMessage.mockImplementation((type: LMDBMessageType) => {
      if (type === LMDBMessageType.START_CURSOR) {
        return Promise.resolve({
          cursor: 42,
          entries: [[Buffer.from('foo'), [Buffer.from('2'), Buffer.from('4'), Buffer.from('8')]]],
        });
      }
      if (type === LMDBMessageType.ADVANCE_CURSOR) {
        return Promise.resolve({
          entries: [[Buffer.from('baz'), [Buffer.from('3'), Buffer.from('6')]]],
          done: true,
        });
      }
      return Promise.resolve({ ok: true });
    });

    await tx.setIndex(Buffer.from('foo'), Buffer.from('1'));
    await tx.removeIndex(Buffer.from('foo'), Buffer.from('8'));
    await tx.setIndex(Buffer.from('bar'), Buffer.from('2'), Buffer.from('3'));
    await tx.setIndex(Buffer.from('baz'), Buffer.from('42'));
    await tx.setIndex(Buffer.from('quux'), Buffer.from('1123'));

    const entries = await toArray(tx.iterateIndex(Buffer.from('foo'), undefined, true));
    expect(entries).toEqual([
      [Buffer.from('foo'), [Buffer.from('1'), Buffer.from('2'), Buffer.from('4')]],
      [Buffer.from('baz'), [Buffer.from('3'), Buffer.from('42'), Buffer.from('6')]],
      [Buffer.from('bar'), [Buffer.from('2'), Buffer.from('3')]],
    ]);
  });

  it('correctly iterates over pending index data in reverse up to given end key', async () => {
    channel.sendMessage.mockImplementation((type: LMDBMessageType) => {
      if (type === LMDBMessageType.START_CURSOR) {
        return Promise.resolve({
          cursor: 42,
          entries: [[Buffer.from('foo'), [Buffer.from('2'), Buffer.from('4'), Buffer.from('8')]]],
        });
      }
      if (type === LMDBMessageType.ADVANCE_CURSOR) {
        return Promise.resolve({
          entries: [[Buffer.from('baz'), [Buffer.from('3'), Buffer.from('6')]]],
          done: true,
        });
      }
      return Promise.resolve({ ok: true });
    });

    await tx.setIndex(Buffer.from('foo'), Buffer.from('1'));
    await tx.removeIndex(Buffer.from('foo'), Buffer.from('8'));
    await tx.setIndex(Buffer.from('bar'), Buffer.from('2'), Buffer.from('3'));
    await tx.setIndex(Buffer.from('baz'), Buffer.from('42'));
    await tx.setIndex(Buffer.from('quux'), Buffer.from('1123'));

    const entries = await toArray(tx.iterateIndex(Buffer.from('foo'), Buffer.from('bar'), true));
    expect(entries).toEqual([
      [Buffer.from('foo'), [Buffer.from('1'), Buffer.from('2'), Buffer.from('4')]],
      [Buffer.from('baz'), [Buffer.from('3'), Buffer.from('42'), Buffer.from('6')]],
    ]);
  });

  it('refuses to commit if closed', async () => {
    await tx.set(Buffer.from('foo'), Buffer.from('1'));
    tx.close();
    await expect(tx.commit()).rejects.toThrow('Transaction is closed');
  });

  it('maintains sorted order in removeEntries for consistent reads', async () => {
    channel.sendMessage.mockResolvedValue({ values: [null] });

    // Set up multiple keys
    await tx.set(Buffer.from('aaa'), Buffer.from('1'));
    await tx.set(Buffer.from('bbb'), Buffer.from('2'));
    await tx.set(Buffer.from('ccc'), Buffer.from('3'));
    await tx.set(Buffer.from('ddd'), Buffer.from('4'));

    // Remove them in an order that would break sorting if using push()
    await tx.remove(Buffer.from('ddd')); // This should be inserted at end of sorted array
    await tx.remove(Buffer.from('aaa')); // This should be inserted at beginning
    await tx.remove(Buffer.from('ccc')); // This should be inserted in middle

    // Verify removeEntries is properly sorted
    expect(tx.dataBatch.removeEntries).toHaveLength(3);
    expect(tx.dataBatch.removeEntries[0][0]).toEqual(Buffer.from('aaa'));
    expect(tx.dataBatch.removeEntries[1][0]).toEqual(Buffer.from('ccc'));
    expect(tx.dataBatch.removeEntries[2][0]).toEqual(Buffer.from('ddd'));

    // All reads should return undefined due to removal
    expect(await tx.get(Buffer.from('aaa'))).toBeUndefined();
    expect(await tx.get(Buffer.from('ccc'))).toBeUndefined();
    expect(await tx.get(Buffer.from('ddd'))).toBeUndefined();

    // Existing key should still be readable
    expect(await tx.get(Buffer.from('bbb'))).toEqual(Buffer.from('2'));
  });
});
