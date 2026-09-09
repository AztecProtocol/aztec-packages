import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { ManualDateProvider } from '@aztec/foundation/timer';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import {
  type InboxMessageIntentInput,
  type InboxMessageOutcome,
  InboxStore,
  InboxStoreCorruptionError,
} from './inbox_store.js';

describe('InboxStore', () => {
  let kvStore: AztecAsyncKVStore;
  let store: InboxStore;
  let dateProvider: ManualDateProvider;

  const intent = (mode: 'public' | 'private' = 'public'): InboxMessageIntentInput => ({
    content: Fr.random().toString(),
    secret: Fr.random().toString(),
    secretHash: Fr.random().toString(),
    mode,
  });

  const outcomesFor = (messageIds: string[], firstIndex = 10n): InboxMessageOutcome[] =>
    messageIds.map((messageId, i) => ({
      messageId,
      msgHash: Fr.random().toString(),
      globalLeafIndex: firstIndex + BigInt(i),
      bucketSeq: 3n,
      sender: '0xca11bde05977b3631167028862be2a173976ca11',
    }));

  const receipt = {
    l1TxHash: '0xabc123',
    l1BlockNumber: 42n,
    l1BlockHash: '0xdeadbeef',
    l1BlockTimestamp: 1700000000n,
    gasUsed: 1234n,
    status: 'success' as const,
  };

  beforeEach(async () => {
    kvStore = await openTmpStore('inbox-store-test', true);
    dateProvider = new ManualDateProvider();
    store = new InboxStore(kvStore, createLogger('bot:inbox-store:test'), dateProvider);
  });

  afterEach(async () => {
    await kvStore.close();
  });

  describe('reserveBatch', () => {
    it('persists the batch and every message intent before anything is broadcast', async () => {
      const { batch, messages } = await store.reserveBatch({
        scenario: 'normal',
        intents: [intent(), intent('private')],
      });

      expect(batch.state).toEqual('reserved');
      expect(batch.messageCount).toEqual(2);
      expect(await store.getBatch(batch.batchId)).toEqual(batch);
      expect(await store.getBatchMessages(batch.batchId)).toEqual(messages);
      expect(messages.map(m => m.state)).toEqual(['awaiting_l1', 'awaiting_l1']);
      expect(messages.map(m => m.mode)).toEqual(['public', 'private']);
      expect(await store.getMessagesByState('awaiting_l1')).toEqual(messages);
      expect(await store.countActiveMessages()).toEqual(2);
    });

    it('rejects an empty batch', async () => {
      await expect(store.reserveBatch({ scenario: 'normal', intents: [] })).rejects.toThrow(/empty/);
    });
  });

  describe('batch lifecycle', () => {
    it('records the claimed nonce and the broadcast hash', async () => {
      const { batch } = await store.reserveBatch({ scenario: 'normal', intents: [intent()] });

      await store.recordBatchSubmitting(batch.batchId, { l1Nonce: 7, submittedAt: 1_000 });
      await store.recordBatchTxHash(batch.batchId, '0xfeed');

      const stored = await store.getBatch(batch.batchId);
      expect(stored).toMatchObject({ state: 'submitted', l1Nonce: 7, submittedAt: 1_000, l1TxHash: '0xfeed' });
      expect((await store.getBatchMessages(batch.batchId))[0].sentAt).toEqual(1_000);
      expect(await store.getUnresolvedBatches()).toEqual([stored]);
    });

    it('records a mined receipt with its per-message outcomes', async () => {
      const { batch, messages } = await store.reserveBatch({ scenario: 'normal', intents: [intent(), intent()] });
      const outcomes = outcomesFor(messages.map(m => m.messageId));

      const mined = await store.recordBatchMined(batch.batchId, receipt, outcomes);

      expect(mined).toMatchObject({
        state: 'mined',
        l1BlockNumber: '42',
        l1BlockHash: '0xdeadbeef',
        gasUsed: '1234',
        receiptStatus: 'success',
        sender: outcomes[0].sender,
      });
      const stored = await store.getBatchMessages(batch.batchId);
      expect(stored.map(m => m.globalLeafIndex)).toEqual(['10', '11']);
      expect(stored.map(m => m.sender)).toEqual([outcomes[0].sender, outcomes[1].sender]);
      expect(await store.getUnresolvedBatches()).toEqual([]);
    });

    it('leaves nothing written when a mutation fails part way through', async () => {
      const { batch, messages } = await store.reserveBatch({ scenario: 'normal', intents: [intent(), intent()] });
      const outcomes = outcomesFor([messages[0].messageId, 'not-a-message-id']);

      await expect(store.recordBatchMined(batch.batchId, receipt, outcomes)).rejects.toThrow(/Unknown inbox message/);

      expect(await store.getBatch(batch.batchId)).toMatchObject({ state: 'reserved' });
      expect((await store.getBatchMessages(batch.batchId)).map(m => m.msgHash)).toEqual([undefined, undefined]);
    });

    it('fails every message still in flight when the batch fails', async () => {
      const { batch, messages } = await store.reserveBatch({
        scenario: 'normal',
        intents: [intent(), intent(), intent()],
      });
      await store.transitionMessage(messages[0].messageId, 'completed', { completedAt: 5 });

      const failed = await store.recordBatchFailed(batch.batchId, 'l1_revert');

      expect(failed.map(m => m.messageId)).toEqual([messages[1].messageId, messages[2].messageId]);
      expect((await store.getBatchMessages(batch.batchId)).map(m => m.state)).toEqual([
        'completed',
        'failed',
        'failed',
      ]);
      expect(await store.countActiveMessages()).toEqual(0);
    });
  });

  describe('transitionMessage', () => {
    it('moves the message between state indexes', async () => {
      const { messages } = await store.reserveBatch({ scenario: 'normal', intents: [intent(), intent()] });

      await store.transitionMessage(messages[0].messageId, 'observed', { observedAt: 99 });

      expect((await store.getMessagesByState('awaiting_l1')).map(m => m.messageId)).toEqual([messages[1].messageId]);
      expect((await store.getMessagesByState('observed')).map(m => m.messageId)).toEqual([messages[0].messageId]);
      expect(await store.countActiveMessages()).toEqual(2);
    });
  });

  describe('invalidateDerivedState', () => {
    it('clears receipt-derived fields but keeps the claim secret and skips messages with an L2 tx', async () => {
      const { batch, messages } = await store.reserveBatch({ scenario: 'normal', intents: [intent(), intent()] });
      await store.recordBatchMined(batch.batchId, receipt, outcomesFor(messages.map(m => m.messageId)));
      await store.transitionMessage(messages[1].messageId, 'sent', { l2TxHash: '0xl2' });

      await store.invalidateDerivedState(batch.batchId);

      const [first, second] = await store.getBatchMessages(batch.batchId);
      expect(first).toMatchObject({ state: 'awaiting_l1', secret: messages[0].secret });
      expect(first.msgHash).toBeUndefined();
      expect(first.globalLeafIndex).toBeUndefined();
      expect(second).toMatchObject({ state: 'sent', l2TxHash: '0xl2' });
      expect(second.globalLeafIndex).toEqual('11');
    });
  });

  describe('timeOutStaleMessages', () => {
    it('turns only messages past the timeout into an explicit timed_out outcome, keeping their secrets', async () => {
      const { messages: old } = await store.reserveBatch({ scenario: 'normal', intents: [intent()] });
      dateProvider.advanceTime(60);
      const { messages: recent } = await store.reserveBatch({ scenario: 'normal', intents: [intent()] });
      dateProvider.advanceTime(60);

      const timedOut = await store.timeOutStaleMessages(90_000);

      expect(timedOut.map(m => m.messageId)).toEqual([old[0].messageId]);
      const stored = await store.getMessage(old[0].messageId);
      expect(stored).toMatchObject({ state: 'timed_out', secret: old[0].secret });
      expect(stored!.timedOutAt).toEqual(dateProvider.now());
      expect(await store.getMessage(recent[0].messageId)).toMatchObject({ state: 'awaiting_l1' });
      expect(await store.countActiveMessages()).toEqual(1);
    });

    it('does not time out a message that already reached a terminal state', async () => {
      const { messages } = await store.reserveBatch({ scenario: 'normal', intents: [intent()] });
      await store.transitionMessage(messages[0].messageId, 'completed', { completedAt: 1 });
      dateProvider.advanceTime(600);

      expect(await store.timeOutStaleMessages(1_000)).toEqual([]);
      expect(await store.getMessage(messages[0].messageId)).toMatchObject({ state: 'completed' });
    });
  });

  describe('pruneTerminalRecords', () => {
    it('drops aged terminal batches and keeps anything still in flight', async () => {
      const { batch: oldBatch, messages: oldMessages } = await store.reserveBatch({
        scenario: 'normal',
        intents: [intent(), intent()],
      });
      const { batch: liveBatch, messages: liveMessages } = await store.reserveBatch({
        scenario: 'normal',
        intents: [intent()],
      });
      await store.transitionMessage(oldMessages[0].messageId, 'completed', {});
      await store.transitionMessage(oldMessages[1].messageId, 'failed', { failureReason: 'timeout' });
      dateProvider.advanceTime(600);

      const removed = await store.pruneTerminalRecords({ maxAgeMs: 60_000, maxRecords: 100 });

      expect(removed).toEqual(2);
      expect(await store.getBatch(oldBatch.batchId)).toBeUndefined();
      expect(await store.getMessage(oldMessages[0].messageId)).toBeUndefined();
      expect(await store.getBatch(liveBatch.batchId)).toBeDefined();
      expect(await store.getMessage(liveMessages[0].messageId)).toBeDefined();
    });

    it('keeps a batch whose messages have not all reached a terminal state', async () => {
      const { batch, messages } = await store.reserveBatch({ scenario: 'normal', intents: [intent(), intent()] });
      await store.transitionMessage(messages[0].messageId, 'completed', {});
      dateProvider.advanceTime(600);

      expect(await store.pruneTerminalRecords({ maxAgeMs: 60_000, maxRecords: 100 })).toEqual(0);
      expect(await store.getBatch(batch.batchId)).toBeDefined();
    });

    it('drops the oldest terminal records once the cap is exceeded, whatever their age', async () => {
      for (let i = 0; i < 3; i++) {
        const { messages } = await store.reserveBatch({ scenario: 'normal', intents: [intent()] });
        await store.transitionMessage(messages[0].messageId, 'completed', {});
        dateProvider.advanceTime(1);
      }

      expect(await store.pruneTerminalRecords({ maxAgeMs: 60 * 60_000, maxRecords: 1 })).toEqual(2);
      expect((await store.getMessagesByState('completed')).length).toEqual(1);
    });
  });

  describe('schedule', () => {
    it('round-trips and patches the saturation schedule', async () => {
      await store.setSchedule({ enabled: true, nextDueAt: 5_000, runInFlight: false, consecutiveFailures: 0 });

      expect(await store.getSchedule()).toEqual({
        enabled: true,
        nextDueAt: 5_000,
        runInFlight: false,
        consecutiveFailures: 0,
      });

      const updated = await store.updateSchedule({ runInFlight: true, inFlightBatchId: 'b1' });
      expect(updated).toMatchObject({ nextDueAt: 5_000, runInFlight: true, inFlightBatchId: 'b1' });
      expect(await store.getSchedule()).toEqual(updated);
    });

    it('refuses to patch a schedule that was never initialized', async () => {
      await expect(store.updateSchedule({ runInFlight: true })).rejects.toThrow(/before it is initialized/);
    });
  });

  describe('validation', () => {
    it('fails loudly and names the key when a record cannot be parsed', async () => {
      const { messages } = await store.reserveBatch({ scenario: 'normal', intents: [intent()] });
      const raw = kvStore.openMap<string, string>('inbox_messages');
      await raw.set(messages[0].messageId, JSON.stringify({ messageId: messages[0].messageId, state: 'nonsense' }));

      await expect(store.getMessage(messages[0].messageId)).rejects.toThrow(InboxStoreCorruptionError);
      await expect(store.getMessage(messages[0].messageId)).rejects.toThrow(messages[0].messageId);
    });

    it('rejects a record that is not JSON at all', async () => {
      await kvStore.openSingleton<string>('inbox_schedule').set('not json');

      await expect(store.getSchedule()).rejects.toThrow(InboxStoreCorruptionError);
    });
  });
});
