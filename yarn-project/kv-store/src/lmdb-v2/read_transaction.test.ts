import { toArray } from '@aztec/foundation/iterable';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { MsgpackChannel, RoundtripDuration } from '@aztec/native';

import { expect } from 'chai';
import { SinonStubbedInstance, createStubInstance } from 'sinon';

import { CURSOR_PAGE_SIZE, Database, LMDBMessageType, LMDBResponseBody, TypeSafeMessageChannel } from './message.js';
import { ReadTransaction } from './read_transaction.js';

const duration = { encodingUs: 0, decodingUs: 0, totalUs: 0, callUs: 0 };

describe('ReadTransaction', () => {
  let channel: SinonStubbedInstance<TypeSafeMessageChannel>;
  let tx: ReadTransaction;

  beforeEach(() => {
    channel = createStubInstance(MsgpackChannel);
    tx = new ReadTransaction(channel);
  });

  it('sends GET requests', async () => {
    const getDeferred = promiseWithResolvers<{
      duration: RoundtripDuration;
      response: LMDBResponseBody[LMDBMessageType.GET];
    }>();

    channel.sendMessage.returns(getDeferred.promise);

    const resp = tx.get(Buffer.from('test_key1'));

    expect(
      channel.sendMessage.calledWith(LMDBMessageType.GET, {
        db: Database.DATA,
        keys: [Buffer.from('test_key1')],
      }),
    ).to.be.true;

    getDeferred.resolve({
      duration,
      response: {
        values: [[Buffer.from('foo')]],
      },
    });

    expect(await resp).to.deep.eq(Buffer.from('foo'));
  });

  it('iterates the database', async () => {
    channel.sendMessage.onCall(0).resolves({
      duration,
      response: { cursor: 42, entries: [[Buffer.from('foo'), [Buffer.from('a value')]]], done: false },
    });
    channel.sendMessage.onCall(1).resolves({
      duration,
      response: { entries: [[Buffer.from('quux'), [Buffer.from('another value')]]], done: true },
    });
    channel.sendMessage.onCall(2).resolves({
      duration,
      response: { ok: true },
    });

    const iterable = tx.iterate(Buffer.from('foo'));
    const entries = await toArray(iterable);

    expect(entries).to.deep.eq([
      [Buffer.from('foo'), Buffer.from('a value')],
      [Buffer.from('quux'), Buffer.from('another value')],
    ]);

    expect(
      channel.sendMessage.calledWith(LMDBMessageType.START_CURSOR, {
        db: Database.DATA,
        key: Buffer.from('foo'),
        count: CURSOR_PAGE_SIZE,
        onePage: false,
        reverse: false,
      }),
    ).to.be.true;

    expect(
      channel.sendMessage.calledWith(LMDBMessageType.ADVANCE_CURSOR, {
        cursor: 42,
        count: CURSOR_PAGE_SIZE,
      }),
    ).to.be.true;

    expect(
      channel.sendMessage.calledWith(LMDBMessageType.CLOSE_CURSOR, {
        cursor: 42,
      }),
    ).to.be.true;
  });

  it('closes the cursor early', async () => {
    channel.sendMessage.onCall(0).resolves({
      duration,
      response: { cursor: 42, entries: [[Buffer.from('foo'), [Buffer.from('a value')]]], done: false },
    });

    channel.sendMessage
      .withArgs(LMDBMessageType.ADVANCE_CURSOR, { cursor: 42, count: CURSOR_PAGE_SIZE })
      .rejects(new Error('SHOULD NOT BE CALLED'));

    channel.sendMessage
      .withArgs(LMDBMessageType.CLOSE_CURSOR, { cursor: 42 })
      .resolves({ duration, response: { ok: true } });

    for await (const entry of tx.iterate(Buffer.from('foo'))) {
      expect(entry).to.deep.eq([Buffer.from('foo'), Buffer.from('a value')]);
      break;
    }

    expect(
      channel.sendMessage.calledWith(LMDBMessageType.CLOSE_CURSOR, {
        cursor: 42,
      }),
    ).to.be.true;
  });

  it('closes the cursor even if in the case of an error', async () => {
    channel.sendMessage.onCall(0).resolves({
      duration,
      response: { cursor: 42, entries: [[Buffer.from('foo'), [Buffer.from('a value')]]], done: false },
    });

    channel.sendMessage
      .withArgs(LMDBMessageType.ADVANCE_CURSOR, { cursor: 42, count: CURSOR_PAGE_SIZE })
      .rejects(new Error('SHOULD NOT BE CALLED'));

    channel.sendMessage
      .withArgs(LMDBMessageType.CLOSE_CURSOR, { cursor: 42 })
      .resolves({ duration, response: { ok: true } });

    try {
      for await (const entry of tx.iterate(Buffer.from('foo'))) {
        expect(entry).to.deep.eq([Buffer.from('foo'), Buffer.from('a value')]);
        throw new Error();
      }
    } catch {}

    expect(
      channel.sendMessage.calledWith(LMDBMessageType.CLOSE_CURSOR, {
        cursor: 42,
      }),
    ).to.be.true;
  });

  it('handles empty cursors', async () => {
    channel.sendMessage
      .withArgs(LMDBMessageType.START_CURSOR, {
        key: Buffer.from('foo'),
        reverse: false,
        count: CURSOR_PAGE_SIZE,
        db: Database.DATA,
        onePage: false,
      })
      .resolves({
        duration,
        response: { cursor: null, entries: [], done: true },
      });

    const arr = await toArray(tx.iterate(Buffer.from('foo')));
    expect(arr).to.deep.eq([]);
  });

  it('after close it does not accept requests', async () => {
    tx.close();
    await expect(tx.get(Buffer.from('foo'))).eventually.to.be.rejectedWith(Error, 'Transaction is closed');
  });
});
