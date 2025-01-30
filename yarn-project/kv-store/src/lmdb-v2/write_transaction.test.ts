import { toArray } from '@aztec/foundation/iterable';

import { expect } from 'chai';
import { type SinonStubbedInstance, stub } from 'sinon';

import { type Batch, CURSOR_PAGE_SIZE, Database, type LMDBMessageChannel, LMDBMessageType } from './message.js';
import { WriteTransaction } from './write_transaction.js';

describe('WriteTransaction', () => {
  let channel: SinonStubbedInstance<LMDBMessageChannel>;
  let tx: WriteTransaction;

  beforeEach(() => {
    channel = stub<LMDBMessageChannel>({
      sendMessage: () => {},
    } as any);
    tx = new WriteTransaction(channel);

    channel.sendMessage.resolves({ ok: true });
  });

  it('accumulatest writes', async () => {
    await tx.setIndex(Buffer.from('foo'), Buffer.from('1'), Buffer.from('2'), Buffer.from('3'));
    await tx.removeIndex(Buffer.from('bar'), Buffer.from('1'), Buffer.from('2'));
    await tx.set(Buffer.from('foo'), Buffer.from('a'));
    await tx.remove(Buffer.from('baz'));

    await tx.commit();
    expect(
      channel.sendMessage.calledWith(LMDBMessageType.BATCH, {
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
      }),
    ).to.be.true;
  });

  it('correctly manages index batch', async () => {
    await tx.setIndex(Buffer.from('foo'), Buffer.from('1'), Buffer.from('2'), Buffer.from('3'));
    expect(tx.indexBatch).to.deep.eq({
      removeEntries: [],
      addEntries: [[Buffer.from('foo'), [Buffer.from('1'), Buffer.from('2'), Buffer.from('3')]]],
    });

    await tx.setIndex(Buffer.from('foo'), Buffer.from('4'));
    expect(tx.indexBatch).to.deep.eq({
      removeEntries: [],
      addEntries: [[Buffer.from('foo'), [Buffer.from('1'), Buffer.from('2'), Buffer.from('3'), Buffer.from('4')]]],
    });

    await tx.removeIndex(Buffer.from('foo'), Buffer.from('5'));
    expect(tx.indexBatch).to.deep.eq({
      removeEntries: [[Buffer.from('foo'), [Buffer.from('5')]]],
      addEntries: [[Buffer.from('foo'), [Buffer.from('1'), Buffer.from('2'), Buffer.from('3'), Buffer.from('4')]]],
    });

    await tx.removeIndex(Buffer.from('foo'), Buffer.from('1'), Buffer.from('2'), Buffer.from('6'));
    expect(tx.indexBatch).to.deep.eq({
      removeEntries: [[Buffer.from('foo'), [Buffer.from('1'), Buffer.from('2'), Buffer.from('5'), Buffer.from('6')]]],
      addEntries: [[Buffer.from('foo'), [Buffer.from('3'), Buffer.from('4')]]],
    });

    await tx.removeIndex(Buffer.from('foo'));
    expect(tx.indexBatch).to.deep.eq({
      removeEntries: [[Buffer.from('foo'), null]],
      addEntries: [],
    });

    await tx.removeIndex(Buffer.from('foo'), Buffer.from('2'));
    expect(tx.indexBatch).to.deep.eq({
      removeEntries: [[Buffer.from('foo'), [Buffer.from('2')]]],
      addEntries: [],
    });
    await tx.setIndex(Buffer.from('foo'), Buffer.from('2'));
    expect(tx.indexBatch).to.deep.eq({
      removeEntries: [],
      addEntries: [[Buffer.from('foo'), [Buffer.from('2')]]],
    });
  });

  it('correctly meanages pending data reads', async () => {
    channel.sendMessage.resolves({ values: [null] });
    expect(await tx.get(Buffer.from('foo'))).to.deep.eq(undefined);

    await tx.set(Buffer.from('foo'), Buffer.from('1'));
    expect(await tx.get(Buffer.from('foo'))).to.deep.eq(Buffer.from('1'));

    await tx.set(Buffer.from('foo'), Buffer.from('2'));
    expect(await tx.get(Buffer.from('foo'))).to.deep.eq(Buffer.from('2'));

    await tx.remove(Buffer.from('foo'));
    expect(await tx.get(Buffer.from('foo'))).to.deep.eq(undefined);
  });

  it('correctly meanages pending index reads', async () => {
    channel.sendMessage.resolves({ values: [[Buffer.from('1')]] });
    expect(await tx.getIndex(Buffer.from('foo'))).to.deep.eq([Buffer.from('1')]);

    await tx.setIndex(Buffer.from('foo'), Buffer.from('1'));
    expect(await tx.getIndex(Buffer.from('foo'))).to.deep.eq([Buffer.from('1')]);

    await tx.setIndex(Buffer.from('foo'), Buffer.from('2'));
    expect(await tx.getIndex(Buffer.from('foo'))).to.deep.eq([Buffer.from('1'), Buffer.from('2')]);

    await tx.removeIndex(Buffer.from('foo'), Buffer.from('1'));
    expect(await tx.getIndex(Buffer.from('foo'))).to.deep.eq([Buffer.from('2')]);

    await tx.removeIndex(Buffer.from('foo'));
    expect(await tx.getIndex(Buffer.from('foo'))).to.deep.eq([]);
  });

  it('correctly iterates over pending data', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({ cursor: null, entries: [] });
    channel.sendMessage.withArgs(LMDBMessageType.ADVANCE_CURSOR).rejects(new Error('Cursor empty'));

    await tx.set(Buffer.from('foo'), Buffer.from('1'));
    await tx.set(Buffer.from('bar'), Buffer.from('2'));
    await tx.set(Buffer.from('baz'), Buffer.from('3'));

    const entries = await toArray(tx.iterate(Buffer.from('bar')));
    expect(entries).to.deep.eq([
      [Buffer.from('bar'), Buffer.from('2')],
      [Buffer.from('baz'), Buffer.from('3')],
      [Buffer.from('foo'), Buffer.from('1')],
    ]);
  });

  it('correctly iterates over uncommitted and committed data', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({
      cursor: 42,
      entries: [[Buffer.from('bar'), [Buffer.from('3')]]],
    });
    channel.sendMessage
      .withArgs(LMDBMessageType.ADVANCE_CURSOR, { cursor: 42, count: CURSOR_PAGE_SIZE })
      .resolves({ entries: [[Buffer.from('baz'), [Buffer.from('3')]]], done: true });

    await tx.set(Buffer.from('foo'), Buffer.from('1'));
    await tx.set(Buffer.from('bar'), Buffer.from('2'));

    const entries = await toArray(tx.iterate(Buffer.from('bar')));
    expect(entries).to.deep.eq([
      [Buffer.from('bar'), Buffer.from('2')],
      [Buffer.from('baz'), Buffer.from('3')],
      [Buffer.from('foo'), Buffer.from('1')],
    ]);
  });

  it('correctly iterates over overritten data', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({
      cursor: 42,
      entries: [[Buffer.from('baz'), [Buffer.from('3')]]],
    });
    channel.sendMessage
      .withArgs(LMDBMessageType.ADVANCE_CURSOR, { cursor: 42, count: CURSOR_PAGE_SIZE })
      .resolves({ entries: [[Buffer.from('foo'), [Buffer.from('1')]]], done: true });

    await tx.remove(Buffer.from('foo'));
    await tx.set(Buffer.from('bar'), Buffer.from('2'));
    await tx.set(Buffer.from('baz'), Buffer.from('42'));
    await tx.set(Buffer.from('quux'), Buffer.from('123'));

    const entries = await toArray(tx.iterate(Buffer.from('bar')));
    expect(entries).to.deep.eq([
      [Buffer.from('bar'), Buffer.from('2')],
      [Buffer.from('baz'), Buffer.from('42')],
      [Buffer.from('quux'), Buffer.from('123')],
    ]);
  });

  it('correctly iterates until end key', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({
      cursor: 42,
      entries: [[Buffer.from('bar'), [Buffer.from('1')]]],
    });
    channel.sendMessage
      .withArgs(LMDBMessageType.ADVANCE_CURSOR)
      .resolves({ entries: [[Buffer.from('baz'), [Buffer.from('3')]]], done: true });

    await tx.remove(Buffer.from('foo'));
    await tx.set(Buffer.from('bar'), Buffer.from('2'));
    await tx.set(Buffer.from('baz'), Buffer.from('42'));
    await tx.set(Buffer.from('quux'), Buffer.from('123'));

    const entries = await toArray(tx.iterate(Buffer.from('bar'), Buffer.from('foo')));
    expect(entries).to.deep.eq([
      [Buffer.from('bar'), Buffer.from('2')],
      [Buffer.from('baz'), Buffer.from('42')],
    ]);
  });

  it('correctly iterates in reverse', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({
      cursor: null,
      entries: [[Buffer.from('baz'), [Buffer.from('3')]]],
    });

    await tx.remove(Buffer.from('foo'));
    await tx.set(Buffer.from('bar'), Buffer.from('2'));
    await tx.set(Buffer.from('baz'), Buffer.from('42'));
    await tx.set(Buffer.from('quux'), Buffer.from('123'));

    const entries = await toArray(tx.iterate(Buffer.from('quux'), undefined, true));
    expect(entries).to.deep.eq([
      [Buffer.from('quux'), Buffer.from('123')],
      [Buffer.from('baz'), Buffer.from('42')],
      [Buffer.from('bar'), Buffer.from('2')],
    ]);
  });

  it('correctly iterates in reverse with end key', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({
      cursor: 42,
      entries: [[Buffer.from('baz'), [Buffer.from('3')]]],
    });
    channel.sendMessage
      .withArgs(LMDBMessageType.ADVANCE_CURSOR)
      .resolves({ entries: [[Buffer.from('bar'), [Buffer.from('3')]]], done: true });

    await tx.remove(Buffer.from('foo'));
    await tx.set(Buffer.from('bar'), Buffer.from('2'));
    await tx.set(Buffer.from('baz'), Buffer.from('42'));
    await tx.set(Buffer.from('quux'), Buffer.from('123'));

    const entries = await toArray(tx.iterate(Buffer.from('quux'), Buffer.from('baz'), true));
    expect(entries).to.deep.eq([[Buffer.from('quux'), Buffer.from('123')]]);
  });

  it('correctly iterates over pending index data', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({
      cursor: 42,
      entries: [[Buffer.from('baz'), [Buffer.from('3'), Buffer.from('6')]]],
    });
    channel.sendMessage.withArgs(LMDBMessageType.ADVANCE_CURSOR).resolves({
      entries: [[Buffer.from('foo'), [Buffer.from('2'), Buffer.from('4'), Buffer.from('8')]]],
      done: true,
    });

    await tx.setIndex(Buffer.from('foo'), Buffer.from('1'));
    await tx.removeIndex(Buffer.from('foo'), Buffer.from('8'));
    await tx.setIndex(Buffer.from('bar'), Buffer.from('2'), Buffer.from('3'));
    await tx.setIndex(Buffer.from('baz'), Buffer.from('42'));

    const entries = await toArray(tx.iterateIndex(Buffer.from('bar')));
    expect(entries).to.deep.eq([
      [Buffer.from('bar'), [Buffer.from('2'), Buffer.from('3')]],
      [Buffer.from('baz'), [Buffer.from('3'), Buffer.from('42'), Buffer.from('6')]],
      [Buffer.from('foo'), [Buffer.from('1'), Buffer.from('2'), Buffer.from('4')]],
    ]);
  });

  it('correctly iterates over pending index data up to end key', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({ cursor: null, entries: [], done: true });
    channel.sendMessage.withArgs(LMDBMessageType.ADVANCE_CURSOR).rejects(new Error('Should not bew called'));

    await tx.setIndex(Buffer.from('foo'), Buffer.from('1'));
    await tx.removeIndex(Buffer.from('foo'), Buffer.from('8'));
    await tx.setIndex(Buffer.from('bar'), Buffer.from('2'), Buffer.from('3'));
    await tx.setIndex(Buffer.from('baz'), Buffer.from('42'));

    const entries = await toArray(tx.iterateIndex(Buffer.from('bar'), Buffer.from('baz')));
    expect(entries).to.deep.eq([[Buffer.from('bar'), [Buffer.from('2'), Buffer.from('3')]]]);
  });

  it('correctly iterates over pending index data in reverse', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({
      cursor: 42,
      entries: [[Buffer.from('foo'), [Buffer.from('2'), Buffer.from('4'), Buffer.from('8')]]],
    });
    channel.sendMessage.withArgs(LMDBMessageType.ADVANCE_CURSOR).resolves({
      entries: [[Buffer.from('baz'), [Buffer.from('3'), Buffer.from('6')]]],
      done: true,
    });

    await tx.setIndex(Buffer.from('foo'), Buffer.from('1'));
    await tx.removeIndex(Buffer.from('foo'), Buffer.from('8'));
    await tx.setIndex(Buffer.from('bar'), Buffer.from('2'), Buffer.from('3'));
    await tx.setIndex(Buffer.from('baz'), Buffer.from('42'));
    await tx.setIndex(Buffer.from('quux'), Buffer.from('1123'));

    const entries = await toArray(tx.iterateIndex(Buffer.from('foo'), undefined, true));
    expect(entries).to.deep.eq([
      [Buffer.from('foo'), [Buffer.from('1'), Buffer.from('2'), Buffer.from('4')]],
      [Buffer.from('baz'), [Buffer.from('3'), Buffer.from('42'), Buffer.from('6')]],
      [Buffer.from('bar'), [Buffer.from('2'), Buffer.from('3')]],
    ]);
  });

  it('correctly iterates over pending index data in reverse up to given end key', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({
      cursor: 42,
      entries: [[Buffer.from('foo'), [Buffer.from('2'), Buffer.from('4'), Buffer.from('8')]]],
    });
    channel.sendMessage.withArgs(LMDBMessageType.ADVANCE_CURSOR).resolves({
      entries: [[Buffer.from('baz'), [Buffer.from('3'), Buffer.from('6')]]],
      done: true,
    });

    await tx.setIndex(Buffer.from('foo'), Buffer.from('1'));
    await tx.removeIndex(Buffer.from('foo'), Buffer.from('8'));
    await tx.setIndex(Buffer.from('bar'), Buffer.from('2'), Buffer.from('3'));
    await tx.setIndex(Buffer.from('baz'), Buffer.from('42'));
    await tx.setIndex(Buffer.from('quux'), Buffer.from('1123'));

    const entries = await toArray(tx.iterateIndex(Buffer.from('foo'), Buffer.from('bar'), true));
    expect(entries).to.deep.eq([
      [Buffer.from('foo'), [Buffer.from('1'), Buffer.from('2'), Buffer.from('4')]],
      [Buffer.from('baz'), [Buffer.from('3'), Buffer.from('42'), Buffer.from('6')]],
    ]);
  });

  it('refuses to commit if closed', async () => {
    await tx.set(Buffer.from('foo'), Buffer.from('1'));
    tx.close();
    await expect(tx.commit()).eventually.to.be.rejectedWith(Error, 'Transaction is closed');
  });
});
