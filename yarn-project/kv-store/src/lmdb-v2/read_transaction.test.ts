import { bufferFrom } from '@aztec/foundation/buffer';
import { toArray } from '@aztec/foundation/iterable';
import { promiseWithResolvers } from '@aztec/foundation/promise';

import { expect } from 'chai';
import { type SinonStubbedInstance, stub } from 'sinon';

import {
  CURSOR_PAGE_SIZE,
  Database,
  type LMDBMessageChannel,
  LMDBMessageType,
  type LMDBResponseBody,
} from './message.js';
import { ReadTransaction } from './read_transaction.js';

describe('ReadTransaction', () => {
  let channel: SinonStubbedInstance<LMDBMessageChannel>;
  let tx: ReadTransaction;

  beforeEach(() => {
    channel = stub<LMDBMessageChannel>({
      sendMessage: () => {},
    } as any);
    tx = new ReadTransaction(channel);
  });

  it('sends GET requests', async () => {
    const getDeferred = promiseWithResolvers<LMDBResponseBody[LMDBMessageType.GET]>();

    channel.sendMessage.returns(getDeferred.promise);

    const resp = tx.get(bufferFrom('test_key1'));

    expect(
      channel.sendMessage.calledWith(LMDBMessageType.GET, {
        db: Database.DATA,
        keys: [bufferFrom('test_key1')],
      }),
    ).to.be.true;

    getDeferred.resolve({
      values: [[bufferFrom('foo')]],
    });

    expect(await resp).to.deep.eq(bufferFrom('foo'));
  });

  it('iterates the database', async () => {
    channel.sendMessage.onCall(0).resolves({
      cursor: 42,
      entries: [[bufferFrom('foo'), [bufferFrom('a value')]]],
      done: false,
    });
    channel.sendMessage.onCall(1).resolves({
      entries: [[bufferFrom('quux'), [bufferFrom('another value')]]],
      done: true,
    });
    channel.sendMessage.onCall(2).resolves({
      ok: true,
    });

    const iterable = tx.iterate(bufferFrom('foo'));
    const entries = await toArray(iterable);

    expect(entries).to.deep.eq([
      [bufferFrom('foo'), bufferFrom('a value')],
      [bufferFrom('quux'), bufferFrom('another value')],
    ]);

    expect(
      channel.sendMessage.calledWith(LMDBMessageType.START_CURSOR, {
        db: Database.DATA,
        key: bufferFrom('foo'),
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
      cursor: 42,
      entries: [[bufferFrom('foo'), [bufferFrom('a value')]]],
      done: false,
    });

    channel.sendMessage
      .withArgs(LMDBMessageType.ADVANCE_CURSOR, { cursor: 42, count: CURSOR_PAGE_SIZE })
      .rejects(new Error('SHOULD NOT BE CALLED'));

    channel.sendMessage.withArgs(LMDBMessageType.CLOSE_CURSOR, { cursor: 42 }).resolves({ ok: true });

    for await (const entry of tx.iterate(bufferFrom('foo'))) {
      expect(entry).to.deep.eq([bufferFrom('foo'), bufferFrom('a value')]);
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
      cursor: 42,
      entries: [[bufferFrom('foo'), [bufferFrom('a value')]]],
      done: false,
    });

    channel.sendMessage
      .withArgs(LMDBMessageType.ADVANCE_CURSOR, { cursor: 42, count: CURSOR_PAGE_SIZE })
      .rejects(new Error('SHOULD NOT BE CALLED'));

    channel.sendMessage.withArgs(LMDBMessageType.CLOSE_CURSOR, { cursor: 42 }).resolves({ ok: true });

    try {
      for await (const entry of tx.iterate(bufferFrom('foo'))) {
        expect(entry).to.deep.eq([bufferFrom('foo'), bufferFrom('a value')]);
        throw new Error();
      }
    } catch {
      // no op
    }

    expect(
      channel.sendMessage.calledWith(LMDBMessageType.CLOSE_CURSOR, {
        cursor: 42,
      }),
    ).to.be.true;
  });

  it('handles empty cursors', async () => {
    channel.sendMessage
      .withArgs(LMDBMessageType.START_CURSOR, {
        key: bufferFrom('foo'),
        reverse: false,
        count: CURSOR_PAGE_SIZE,
        db: Database.DATA,
        onePage: false,
      })
      .resolves({
        cursor: null,
        entries: [],
        done: true,
      });

    const arr = await toArray(tx.iterate(bufferFrom('foo')));
    expect(arr).to.deep.eq([]);
  });

  it('after close it does not accept requests', async () => {
    tx.close();
    await expect(tx.get(bufferFrom('foo'))).eventually.to.be.rejectedWith(Error, 'Transaction is closed');
  });
});
