import { bufferFrom } from '@aztec/foundation/buffer';
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
    await tx.setIndex(bufferFrom('foo'), bufferFrom('1'), bufferFrom('2'), bufferFrom('3'));
    await tx.removeIndex(bufferFrom('bar'), bufferFrom('1'), bufferFrom('2'));
    await tx.set(bufferFrom('foo'), bufferFrom('a'));
    await tx.remove(bufferFrom('baz'));

    await tx.commit();
    expect(
      channel.sendMessage.calledWith(LMDBMessageType.BATCH, {
        batches: new Map<string, Batch>([
          [
            Database.INDEX,
            {
              removeEntries: [[bufferFrom('bar'), [bufferFrom('1'), bufferFrom('2')]]],
              addEntries: [[bufferFrom('foo'), [bufferFrom('1'), bufferFrom('2'), bufferFrom('3')]]],
            },
          ],
          [
            Database.DATA,
            {
              removeEntries: [[bufferFrom('baz'), null]],
              addEntries: [[bufferFrom('foo'), [bufferFrom('a')]]],
            },
          ],
        ]),
      }),
    ).to.be.true;
  });

  it('correctly manages index batch', async () => {
    await tx.setIndex(bufferFrom('foo'), bufferFrom('1'), bufferFrom('2'), bufferFrom('3'));
    expect(tx.indexBatch).to.deep.eq({
      removeEntries: [],
      addEntries: [[bufferFrom('foo'), [bufferFrom('1'), bufferFrom('2'), bufferFrom('3')]]],
    });

    await tx.setIndex(bufferFrom('foo'), bufferFrom('4'));
    expect(tx.indexBatch).to.deep.eq({
      removeEntries: [],
      addEntries: [[bufferFrom('foo'), [bufferFrom('1'), bufferFrom('2'), bufferFrom('3'), bufferFrom('4')]]],
    });

    await tx.removeIndex(bufferFrom('foo'), bufferFrom('5'));
    expect(tx.indexBatch).to.deep.eq({
      removeEntries: [[bufferFrom('foo'), [bufferFrom('5')]]],
      addEntries: [[bufferFrom('foo'), [bufferFrom('1'), bufferFrom('2'), bufferFrom('3'), bufferFrom('4')]]],
    });

    await tx.removeIndex(bufferFrom('foo'), bufferFrom('1'), bufferFrom('2'), bufferFrom('6'));
    expect(tx.indexBatch).to.deep.eq({
      removeEntries: [[bufferFrom('foo'), [bufferFrom('1'), bufferFrom('2'), bufferFrom('5'), bufferFrom('6')]]],
      addEntries: [[bufferFrom('foo'), [bufferFrom('3'), bufferFrom('4')]]],
    });

    await tx.removeIndex(bufferFrom('foo'));
    expect(tx.indexBatch).to.deep.eq({
      removeEntries: [[bufferFrom('foo'), null]],
      addEntries: [],
    });

    await tx.removeIndex(bufferFrom('foo'), bufferFrom('2'));
    expect(tx.indexBatch).to.deep.eq({
      removeEntries: [[bufferFrom('foo'), [bufferFrom('2')]]],
      addEntries: [],
    });
    await tx.setIndex(bufferFrom('foo'), bufferFrom('2'));
    expect(tx.indexBatch).to.deep.eq({
      removeEntries: [],
      addEntries: [[bufferFrom('foo'), [bufferFrom('2')]]],
    });
  });

  it('correctly meanages pending data reads', async () => {
    channel.sendMessage.resolves({ values: [null] });
    expect(await tx.get(bufferFrom('foo'))).to.deep.eq(undefined);

    await tx.set(bufferFrom('foo'), bufferFrom('1'));
    expect(await tx.get(bufferFrom('foo'))).to.deep.eq(bufferFrom('1'));

    await tx.set(bufferFrom('foo'), bufferFrom('2'));
    expect(await tx.get(bufferFrom('foo'))).to.deep.eq(bufferFrom('2'));

    await tx.remove(bufferFrom('foo'));
    expect(await tx.get(bufferFrom('foo'))).to.deep.eq(undefined);
  });

  it('correctly meanages pending index reads', async () => {
    channel.sendMessage.resolves({ values: [[bufferFrom('1')]] });
    expect(await tx.getIndex(bufferFrom('foo'))).to.deep.eq([bufferFrom('1')]);

    await tx.setIndex(bufferFrom('foo'), bufferFrom('1'));
    expect(await tx.getIndex(bufferFrom('foo'))).to.deep.eq([bufferFrom('1')]);

    await tx.setIndex(bufferFrom('foo'), bufferFrom('2'));
    expect(await tx.getIndex(bufferFrom('foo'))).to.deep.eq([bufferFrom('1'), bufferFrom('2')]);

    await tx.removeIndex(bufferFrom('foo'), bufferFrom('1'));
    expect(await tx.getIndex(bufferFrom('foo'))).to.deep.eq([bufferFrom('2')]);

    await tx.removeIndex(bufferFrom('foo'));
    expect(await tx.getIndex(bufferFrom('foo'))).to.deep.eq([]);
  });

  it('correctly iterates over pending data', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({ cursor: null, entries: [] });
    channel.sendMessage.withArgs(LMDBMessageType.ADVANCE_CURSOR).rejects(new Error('Cursor empty'));

    await tx.set(bufferFrom('foo'), bufferFrom('1'));
    await tx.set(bufferFrom('bar'), bufferFrom('2'));
    await tx.set(bufferFrom('baz'), bufferFrom('3'));

    const entries = await toArray(tx.iterate(bufferFrom('bar')));
    expect(entries).to.deep.eq([
      [bufferFrom('bar'), bufferFrom('2')],
      [bufferFrom('baz'), bufferFrom('3')],
      [bufferFrom('foo'), bufferFrom('1')],
    ]);
  });

  it('correctly iterates over uncommitted and committed data', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({
      cursor: 42,
      entries: [[bufferFrom('bar'), [bufferFrom('3')]]],
    });
    channel.sendMessage
      .withArgs(LMDBMessageType.ADVANCE_CURSOR, { cursor: 42, count: CURSOR_PAGE_SIZE })
      .resolves({ entries: [[bufferFrom('baz'), [bufferFrom('3')]]], done: true });

    await tx.set(bufferFrom('foo'), bufferFrom('1'));
    await tx.set(bufferFrom('bar'), bufferFrom('2'));

    const entries = await toArray(tx.iterate(bufferFrom('bar')));
    expect(entries).to.deep.eq([
      [bufferFrom('bar'), bufferFrom('2')],
      [bufferFrom('baz'), bufferFrom('3')],
      [bufferFrom('foo'), bufferFrom('1')],
    ]);
  });

  it('correctly iterates over overritten data', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({
      cursor: 42,
      entries: [[bufferFrom('baz'), [bufferFrom('3')]]],
    });
    channel.sendMessage
      .withArgs(LMDBMessageType.ADVANCE_CURSOR, { cursor: 42, count: CURSOR_PAGE_SIZE })
      .resolves({ entries: [[bufferFrom('foo'), [bufferFrom('1')]]], done: true });

    await tx.remove(bufferFrom('foo'));
    await tx.set(bufferFrom('bar'), bufferFrom('2'));
    await tx.set(bufferFrom('baz'), bufferFrom('42'));
    await tx.set(bufferFrom('quux'), bufferFrom('123'));

    const entries = await toArray(tx.iterate(bufferFrom('bar')));
    expect(entries).to.deep.eq([
      [bufferFrom('bar'), bufferFrom('2')],
      [bufferFrom('baz'), bufferFrom('42')],
      [bufferFrom('quux'), bufferFrom('123')],
    ]);
  });

  it('correctly iterates until end key', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({
      cursor: 42,
      entries: [[bufferFrom('bar'), [bufferFrom('1')]]],
    });
    channel.sendMessage
      .withArgs(LMDBMessageType.ADVANCE_CURSOR)
      .resolves({ entries: [[bufferFrom('baz'), [bufferFrom('3')]]], done: true });

    await tx.remove(bufferFrom('foo'));
    await tx.set(bufferFrom('bar'), bufferFrom('2'));
    await tx.set(bufferFrom('baz'), bufferFrom('42'));
    await tx.set(bufferFrom('quux'), bufferFrom('123'));

    const entries = await toArray(tx.iterate(bufferFrom('bar'), bufferFrom('foo')));
    expect(entries).to.deep.eq([
      [bufferFrom('bar'), bufferFrom('2')],
      [bufferFrom('baz'), bufferFrom('42')],
    ]);
  });

  it('correctly iterates in reverse', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({
      cursor: null,
      entries: [[bufferFrom('baz'), [bufferFrom('3')]]],
    });

    await tx.remove(bufferFrom('foo'));
    await tx.set(bufferFrom('bar'), bufferFrom('2'));
    await tx.set(bufferFrom('baz'), bufferFrom('42'));
    await tx.set(bufferFrom('quux'), bufferFrom('123'));

    const entries = await toArray(tx.iterate(bufferFrom('quux'), undefined, true));
    expect(entries).to.deep.eq([
      [bufferFrom('quux'), bufferFrom('123')],
      [bufferFrom('baz'), bufferFrom('42')],
      [bufferFrom('bar'), bufferFrom('2')],
    ]);
  });

  it('correctly iterates in reverse with end key', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({
      cursor: 42,
      entries: [[bufferFrom('baz'), [bufferFrom('3')]]],
    });
    channel.sendMessage
      .withArgs(LMDBMessageType.ADVANCE_CURSOR)
      .resolves({ entries: [[bufferFrom('bar'), [bufferFrom('3')]]], done: true });

    await tx.remove(bufferFrom('foo'));
    await tx.set(bufferFrom('bar'), bufferFrom('2'));
    await tx.set(bufferFrom('baz'), bufferFrom('42'));
    await tx.set(bufferFrom('quux'), bufferFrom('123'));

    const entries = await toArray(tx.iterate(bufferFrom('quux'), bufferFrom('baz'), true));
    expect(entries).to.deep.eq([[bufferFrom('quux'), bufferFrom('123')]]);
  });

  it('correctly iterates over pending index data', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({
      cursor: 42,
      entries: [[bufferFrom('baz'), [bufferFrom('3'), bufferFrom('6')]]],
    });
    channel.sendMessage.withArgs(LMDBMessageType.ADVANCE_CURSOR).resolves({
      entries: [[bufferFrom('foo'), [bufferFrom('2'), bufferFrom('4'), bufferFrom('8')]]],
      done: true,
    });

    await tx.setIndex(bufferFrom('foo'), bufferFrom('1'));
    await tx.removeIndex(bufferFrom('foo'), bufferFrom('8'));
    await tx.setIndex(bufferFrom('bar'), bufferFrom('2'), bufferFrom('3'));
    await tx.setIndex(bufferFrom('baz'), bufferFrom('42'));

    const entries = await toArray(tx.iterateIndex(bufferFrom('bar')));
    expect(entries).to.deep.eq([
      [bufferFrom('bar'), [bufferFrom('2'), bufferFrom('3')]],
      [bufferFrom('baz'), [bufferFrom('3'), bufferFrom('42'), bufferFrom('6')]],
      [bufferFrom('foo'), [bufferFrom('1'), bufferFrom('2'), bufferFrom('4')]],
    ]);
  });

  it('correctly iterates over pending index data up to end key', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({ cursor: null, entries: [], done: true });
    channel.sendMessage.withArgs(LMDBMessageType.ADVANCE_CURSOR).rejects(new Error('Should not bew called'));

    await tx.setIndex(bufferFrom('foo'), bufferFrom('1'));
    await tx.removeIndex(bufferFrom('foo'), bufferFrom('8'));
    await tx.setIndex(bufferFrom('bar'), bufferFrom('2'), bufferFrom('3'));
    await tx.setIndex(bufferFrom('baz'), bufferFrom('42'));

    const entries = await toArray(tx.iterateIndex(bufferFrom('bar'), bufferFrom('baz')));
    expect(entries).to.deep.eq([[bufferFrom('bar'), [bufferFrom('2'), bufferFrom('3')]]]);
  });

  it('correctly iterates over pending index data in reverse', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({
      cursor: 42,
      entries: [[bufferFrom('foo'), [bufferFrom('2'), bufferFrom('4'), bufferFrom('8')]]],
    });
    channel.sendMessage.withArgs(LMDBMessageType.ADVANCE_CURSOR).resolves({
      entries: [[bufferFrom('baz'), [bufferFrom('3'), bufferFrom('6')]]],
      done: true,
    });

    await tx.setIndex(bufferFrom('foo'), bufferFrom('1'));
    await tx.removeIndex(bufferFrom('foo'), bufferFrom('8'));
    await tx.setIndex(bufferFrom('bar'), bufferFrom('2'), bufferFrom('3'));
    await tx.setIndex(bufferFrom('baz'), bufferFrom('42'));
    await tx.setIndex(bufferFrom('quux'), bufferFrom('1123'));

    const entries = await toArray(tx.iterateIndex(bufferFrom('foo'), undefined, true));
    expect(entries).to.deep.eq([
      [bufferFrom('foo'), [bufferFrom('1'), bufferFrom('2'), bufferFrom('4')]],
      [bufferFrom('baz'), [bufferFrom('3'), bufferFrom('42'), bufferFrom('6')]],
      [bufferFrom('bar'), [bufferFrom('2'), bufferFrom('3')]],
    ]);
  });

  it('correctly iterates over pending index data in reverse up to given end key', async () => {
    channel.sendMessage.withArgs(LMDBMessageType.START_CURSOR).resolves({
      cursor: 42,
      entries: [[bufferFrom('foo'), [bufferFrom('2'), bufferFrom('4'), bufferFrom('8')]]],
    });
    channel.sendMessage.withArgs(LMDBMessageType.ADVANCE_CURSOR).resolves({
      entries: [[bufferFrom('baz'), [bufferFrom('3'), bufferFrom('6')]]],
      done: true,
    });

    await tx.setIndex(bufferFrom('foo'), bufferFrom('1'));
    await tx.removeIndex(bufferFrom('foo'), bufferFrom('8'));
    await tx.setIndex(bufferFrom('bar'), bufferFrom('2'), bufferFrom('3'));
    await tx.setIndex(bufferFrom('baz'), bufferFrom('42'));
    await tx.setIndex(bufferFrom('quux'), bufferFrom('1123'));

    const entries = await toArray(tx.iterateIndex(bufferFrom('foo'), bufferFrom('bar'), true));
    expect(entries).to.deep.eq([
      [bufferFrom('foo'), [bufferFrom('1'), bufferFrom('2'), bufferFrom('4')]],
      [bufferFrom('baz'), [bufferFrom('3'), bufferFrom('42'), bufferFrom('6')]],
    ]);
  });

  it('refuses to commit if closed', async () => {
    await tx.set(bufferFrom('foo'), bufferFrom('1'));
    tx.close();
    await expect(tx.commit()).eventually.to.be.rejectedWith(Error, 'Transaction is closed');
  });

  it('maintains sorted order in removeEntries for consistent reads', async () => {
    channel.sendMessage.resolves({ values: [null] });

    // Set up multiple keys
    await tx.set(bufferFrom('aaa'), bufferFrom('1'));
    await tx.set(bufferFrom('bbb'), bufferFrom('2'));
    await tx.set(bufferFrom('ccc'), bufferFrom('3'));
    await tx.set(bufferFrom('ddd'), bufferFrom('4'));

    // Remove them in an order that would break sorting if using push()
    await tx.remove(bufferFrom('ddd')); // This should be inserted at end of sorted array
    await tx.remove(bufferFrom('aaa')); // This should be inserted at beginning
    await tx.remove(bufferFrom('ccc')); // This should be inserted in middle

    // Verify removeEntries is properly sorted
    expect(tx.dataBatch.removeEntries).to.have.lengthOf(3);
    expect(tx.dataBatch.removeEntries[0][0]).to.deep.equal(bufferFrom('aaa'));
    expect(tx.dataBatch.removeEntries[1][0]).to.deep.equal(bufferFrom('ccc'));
    expect(tx.dataBatch.removeEntries[2][0]).to.deep.equal(bufferFrom('ddd'));

    // All reads should return undefined due to removal
    expect(await tx.get(bufferFrom('aaa'))).to.be.undefined;
    expect(await tx.get(bufferFrom('ccc'))).to.be.undefined;
    expect(await tx.get(bufferFrom('ddd'))).to.be.undefined;

    // Existing key should still be readable
    expect(await tx.get(bufferFrom('bbb'))).to.deep.equal(bufferFrom('2'));
  });
});
