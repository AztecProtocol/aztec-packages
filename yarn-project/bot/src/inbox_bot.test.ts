import { AztecAddress } from '@aztec/aztec.js/addresses';
import { MULTI_CALL_3_ADDRESS } from '@aztec/ethereum/contracts';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { ManualDateProvider } from '@aztec/foundation/timer';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { getTelemetryClient } from '@aztec/telemetry-client';
import type { EmbeddedWallet } from '@aztec/wallets/embedded';

import { mock } from 'jest-mock-extended';

import { type BotConfig, MAX_INBOX_MESSAGES_PER_BATCH, applyInboxModeDefaults, getBotDefaultConfig } from './config.js';
import { InboxBot } from './inbox_bot.js';
import type { InboxL1Producer } from './inbox_l1_producer.js';
import type {
  L1ToL2MessageBatchMismatch,
  L1ToL2MessageBatchReceipt,
  L1ToL2MessageIntent,
  SentInboxMessage,
} from './l1_to_l2_seeding.js';
import { InboxStore } from './store/inbox_store.js';

/**
 * L1 side of the producer under the test's control. It records every batch it was asked to send and can be told
 * to throw, revert, hang without a receipt, or lie about what the Inbox emitted.
 */
class FakeInboxL1Producer implements InboxL1Producer {
  public readonly expectedSender = MULTI_CALL_3_ADDRESS;
  public readonly sent: { intents: readonly L1ToL2MessageIntent[]; txHash: string }[] = [];

  public behaviour: 'success' | 'throw' | 'revert' = 'success';
  public confirmedNonce = 0;
  public nextIndex = 0n;
  public bucketSeq = 0n;
  /** Receipts keyed by tx hash, so a reconciling step can look up a submission the previous run left behind. */
  public readonly receipts = new Map<string, L1ToL2MessageBatchReceipt>();
  public nonCanonicalBlocks = new Set<string>();
  /** Applied to the events of the next batch, to model a receipt that does not match the persisted intent. */
  public corruptNextReceipt?: (messages: SentInboxMessage[]) => SentInboxMessage[];

  public assertReady(): Promise<void> {
    return Promise.resolve();
  }

  public async sendBatch(args: {
    intents: readonly L1ToL2MessageIntent[];
    onNonceClaimed: (nonce: number) => Promise<void>;
    onBroadcast: (txHash: string) => Promise<void>;
  }): Promise<L1ToL2MessageBatchReceipt> {
    const nonce = this.confirmedNonce;
    await args.onNonceClaimed(nonce);
    if (this.behaviour === 'throw') {
      throw new Error('L1 send failed');
    }
    const txHash = hash(this.sent.length + 1);
    await args.onBroadcast(txHash);
    this.sent.push({ intents: args.intents, txHash });
    this.confirmedNonce++;
    const receipt = this.buildReceipt(txHash, args.intents);
    this.receipts.set(txHash, receipt);
    return receipt;
  }

  public buildReceipt(txHash: string, intents: readonly L1ToL2MessageIntent[]): L1ToL2MessageBatchReceipt {
    let messages = intents.map(intent => {
      const message: SentInboxMessage = {
        msgHash: Fr.random().toString(),
        globalLeafIndex: this.nextIndex++,
        bucketSeq: this.bucketSeq,
        content: intent.content.toString(),
        secretHash: intent.secretHash.toString(),
        sender: this.expectedSender,
        recipient: recipient.toString(),
        version: rollupVersion,
      };
      return message;
    });
    if (this.corruptNextReceipt) {
      messages = this.corruptNextReceipt(messages);
      this.corruptNextReceipt = undefined;
    }
    return {
      txHash,
      l1BlockNumber: BigInt(this.sent.length),
      l1BlockHash: hash(1000 + this.sent.length),
      l1BlockTimestamp: 1_700_000_000n + BigInt(this.sent.length),
      gasUsed: 1_000_000n,
      status: this.behaviour === 'revert' ? 'reverted' : 'success',
      messages,
    };
  }

  public getBatchOutcome(txHash: string): Promise<L1ToL2MessageBatchReceipt | undefined> {
    return Promise.resolve(this.receipts.get(txHash));
  }

  public getConfirmedNonce(): Promise<number> {
    return Promise.resolve(this.confirmedNonce);
  }

  public isBlockCanonical(_blockNumber: bigint, blockHash: string): Promise<boolean> {
    return Promise.resolve(!this.nonCanonicalBlocks.has(blockHash));
  }

  public validateBatch(
    intents: readonly L1ToL2MessageIntent[],
    messages: readonly SentInboxMessage[],
  ): L1ToL2MessageBatchMismatch[] {
    const mismatches: L1ToL2MessageBatchMismatch[] = [];
    if (messages.length !== intents.length) {
      return [{ kind: 'count', detail: `${messages.length} vs ${intents.length}` }];
    }
    for (const [i, message] of messages.entries()) {
      if (message.content !== intents[i].content.toString()) {
        mismatches.push({ kind: 'content', detail: `position ${i}` });
      }
      if (i > 0 && message.globalLeafIndex !== messages[i - 1].globalLeafIndex + 1n) {
        mismatches.push({ kind: 'indices', detail: `position ${i}` });
      }
    }
    return mismatches;
  }
}

let recipient: AztecAddress;
const rollupVersion = 1n;

/** The store validates hashes as hex on read, so test fixtures must look like real ones. */
const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
const RECOVERED_TX = hash(0xfeed);

describe('InboxBot', () => {
  let kvStore: AztecAsyncKVStore;
  let store: InboxStore;
  let producer: FakeInboxL1Producer;
  let dateProvider: ManualDateProvider;

  const buildConfig = (overrides: Partial<BotConfig> = {}): BotConfig =>
    applyInboxModeDefaults({
      ...getBotDefaultConfig(),
      botMode: 'inbox',
      followChain: 'PROPOSED',
      txIntervalSeconds: 10,
      l1ToL2MessageTimeoutSeconds: 600,
      inboxMessagesPerBatch: 4,
      inboxConsumeMode: 'mixed',
      inboxSaturationIntervalSeconds: 0,
      ...overrides,
    });

  const buildBot = (overrides: Partial<BotConfig> = {}) =>
    new InboxBot({
      node: mock<AztecNode>(),
      wallet: mock<EmbeddedWallet>(),
      defaultAccountAddress: recipient,
      contract: mock<TestContract>(),
      producer,
      store,
      telemetry: getTelemetryClient(),
      config: buildConfig(overrides),
      dateProvider,
    });

  beforeAll(async () => {
    recipient = await AztecAddress.random();
  });

  beforeEach(async () => {
    kvStore = await openTmpStore('inbox-bot-test', true);
    dateProvider = new ManualDateProvider();
    store = new InboxStore(kvStore, createLogger('bot:inbox-store:test'), dateProvider);
    producer = new FakeInboxL1Producer();
  });

  afterEach(async () => {
    await kvStore.close();
  });

  describe('production', () => {
    it('produces one atomic batch per step and records its receipt', async () => {
      const bot = buildBot();

      await bot.produceStep();

      expect(producer.sent.length).toEqual(1);
      expect(producer.sent[0].intents.length).toEqual(4);
      const messages = await store.getMessagesByState('awaiting_l1');
      expect(messages.length).toEqual(4);
      expect(messages.map(m => m.globalLeafIndex)).toEqual(['0', '1', '2', '3']);
      expect(messages.every(m => m.sender === MULTI_CALL_3_ADDRESS)).toBe(true);
      expect(messages.every(m => m.sentAt === dateProvider.now())).toBe(true);
      expect(await bot.countOutstandingMessages()).toEqual(4);
    });

    it('alternates the consumption domain across messages and across batches', async () => {
      const bot = buildBot({ inboxMessagesPerBatch: 1 });

      for (let i = 0; i < 3; i++) {
        await bot.produceStep();
        // Batches reserved in the same millisecond sort by a random id suffix, so separate them on the clock.
        dateProvider.advanceTime(1);
      }

      const modes = (await store.getActiveMessages()).map(m => m.mode);
      expect(modes).toEqual(['public', 'private', 'public']);
    });

    it('honours a forced consumption domain', async () => {
      const bot = buildBot({ inboxConsumeMode: 'private' });

      await bot.produceStep();

      expect((await store.getActiveMessages()).map(m => m.mode)).toEqual(Array(4).fill('private'));
    });

    it('stops producing once the outstanding message cap leaves no room for a full batch', async () => {
      const bot = buildBot({ l1ToL2SeedCount: 10 });

      await bot.produceStep();
      await bot.produceStep();
      await bot.produceStep();

      expect(producer.sent.length).toEqual(2);
      expect(await bot.countOutstandingMessages()).toEqual(8);
    });

    it('resumes producing once outstanding messages drain', async () => {
      const bot = buildBot({ l1ToL2SeedCount: 4 });
      await bot.produceStep();
      expect(producer.sent.length).toEqual(1);

      for (const message of await store.getActiveMessages()) {
        await store.transitionMessage(message.messageId, 'completed', {});
      }
      await bot.produceStep();

      expect(producer.sent.length).toEqual(2);
    });

    it('keeps at most one submission in flight when steps overlap', async () => {
      const bot = buildBot();

      await Promise.all([bot.produceStep(), bot.produceStep()]);

      expect(producer.sent.length).toEqual(1);
    });

    it('defers a send that threw after claiming a nonce, then fails it once the nonce is known unused', async () => {
      const bot = buildBot();
      producer.behaviour = 'throw';

      await bot.produceStep();

      // The send may still land, so the batch is not written off while its nonce is unresolved.
      expect((await store.getUnresolvedBatches()).map(b => b.state)).toEqual(['submitted']);
      expect(await bot.countOutstandingMessages()).toEqual(4);

      await bot.produceStep();

      // The nonce is still unconsumed on the next step, so the first batch is written off. The step then defers a
      // fresh one of its own, which is why four messages remain outstanding.
      expect((await store.getMessagesByState('failed')).map(m => m.failureReason)).toEqual(
        Array(4).fill('l1_submission'),
      );
      expect(await bot.countOutstandingMessages()).toEqual(4);
    });

    it('fails the batch when the L1 transaction reverts', async () => {
      const bot = buildBot();
      producer.behaviour = 'revert';

      await bot.produceStep();

      expect((await store.getMessagesByState('failed')).map(m => m.failureReason)).toEqual(Array(4).fill('l1_revert'));
    });

    it('refuses to trust a receipt whose events do not match the persisted intent', async () => {
      const bot = buildBot();
      producer.corruptNextReceipt = messages => [
        { ...messages[0], content: Fr.random().toString() },
        ...messages.slice(1),
      ];

      await bot.produceStep();

      const failed = await store.getMessagesByState('failed');
      expect(failed.length).toEqual(4);
      expect(failed.every(m => m.failureReason === 'api_inconsistency')).toBe(true);
      expect(failed.every(m => m.msgHash === undefined)).toBe(true);
    });

    it('reports non-contiguous indices as a bucket mismatch', async () => {
      const bot = buildBot();
      producer.corruptNextReceipt = messages =>
        messages.map((message, i) =>
          i === 2 ? { ...message, globalLeafIndex: message.globalLeafIndex + 5n } : message,
        );

      await bot.produceStep();

      expect((await store.getMessagesByState('failed')).every(m => m.failureReason === 'bucket_mismatch')).toBe(true);
    });
  });

  describe('recovery', () => {
    it('abandons a batch that was reserved but never broadcast, without resending it', async () => {
      await store.reserveBatch({
        scenario: 'normal',
        intents: [
          {
            content: Fr.random().toString(),
            secret: Fr.random().toString(),
            secretHash: Fr.random().toString(),
            mode: 'public',
          },
        ],
      });
      const bot = buildBot();

      await bot.produceStep();

      const failed = await store.getMessagesByState('failed');
      expect(failed.length).toEqual(1);
      expect(failed[0].failureReason).toEqual('l1_submission');
      expect(producer.sent.length).toEqual(1); // the ordinary batch for this step, not a resend
      expect(producer.sent[0].intents.length).toEqual(4);
    });

    it('adopts the receipt of a submission that was in flight when the bot stopped', async () => {
      const intents: L1ToL2MessageIntent[] = [{ content: Fr.random(), secret: Fr.random(), secretHash: Fr.random() }];
      const { batch } = await store.reserveBatch({
        scenario: 'normal',
        intents: intents.map(i => ({
          content: i.content.toString(),
          secret: i.secret.toString(),
          secretHash: i.secretHash.toString(),
          mode: 'public',
        })),
      });
      await store.recordBatchSubmitting(batch.batchId, { l1Nonce: 0, submittedAt: dateProvider.now() });
      await store.recordBatchTxHash(batch.batchId, RECOVERED_TX);
      producer.receipts.set(RECOVERED_TX, producer.buildReceipt(RECOVERED_TX, intents));
      const bot = buildBot();

      await bot.produceStep();

      expect(await store.getBatch(batch.batchId)).toMatchObject({ state: 'mined' });
      expect((await store.getBatchMessages(batch.batchId))[0].globalLeafIndex).toEqual('0');
      expect(producer.sent.map(s => s.txHash)).not.toContain(RECOVERED_TX);
    });

    it('abandons a submission whose nonce was consumed by another transaction', async () => {
      const { batch } = await store.reserveBatch({
        scenario: 'normal',
        intents: [
          {
            content: Fr.random().toString(),
            secret: Fr.random().toString(),
            secretHash: Fr.random().toString(),
            mode: 'public',
          },
        ],
      });
      await store.recordBatchSubmitting(batch.batchId, { l1Nonce: 0, submittedAt: dateProvider.now() });
      await store.recordBatchTxHash(batch.batchId, hash(0xa1));
      producer.confirmedNonce = 1;
      const bot = buildBot();

      await bot.produceStep();

      expect(await store.getBatch(batch.batchId)).toMatchObject({ state: 'failed', failureReason: 'l1_submission' });
    });

    it('leaves a still-pending submission alone until its nonce resolves', async () => {
      const { batch } = await store.reserveBatch({
        scenario: 'normal',
        intents: [
          {
            content: Fr.random().toString(),
            secret: Fr.random().toString(),
            secretHash: Fr.random().toString(),
            mode: 'public',
          },
        ],
      });
      await store.recordBatchSubmitting(batch.batchId, { l1Nonce: 3, submittedAt: dateProvider.now() });
      await store.recordBatchTxHash(batch.batchId, hash(0xb2));
      producer.confirmedNonce = 3;
      const bot = buildBot();

      await bot.produceStep();

      expect(await store.getBatch(batch.batchId)).toMatchObject({ state: 'submitted' });
    });

    it('abandons a batch that claimed a nonce but never recorded a transaction hash', async () => {
      const { batch } = await store.reserveBatch({
        scenario: 'normal',
        intents: [
          {
            content: Fr.random().toString(),
            secret: Fr.random().toString(),
            secretHash: Fr.random().toString(),
            mode: 'public',
          },
        ],
      });
      await store.recordBatchSubmitting(batch.batchId, { l1Nonce: 0, submittedAt: dateProvider.now() });
      const bot = buildBot();

      await bot.produceStep();

      expect(await store.getBatch(batch.batchId)).toMatchObject({ state: 'failed', failureReason: 'l1_submission' });
    });

    it('drops a mined batch that was reorged out and whose transaction is gone', async () => {
      const bot = buildBot();
      await bot.produceStep();
      const [message] = await store.getActiveMessages();
      const mined = (await store.getBatch(message.batchId))!;
      producer.nonCanonicalBlocks.add(mined.l1BlockHash!);
      producer.receipts.delete(mined.l1TxHash!);

      await bot.produceStep();

      expect(await store.getBatch(message.batchId)).toMatchObject({ state: 'failed', failureReason: 'reorg' });
    });

    it('re-reads the receipt of a batch that was re-mined at different indices', async () => {
      const bot = buildBot({ inboxMessagesPerBatch: 2 });
      await bot.produceStep();
      const [message] = await store.getActiveMessages();
      const mined = (await store.getBatch(message.batchId))!;
      producer.nonCanonicalBlocks.add(mined.l1BlockHash!);
      producer.nextIndex = 50n;
      producer.receipts.set(mined.l1TxHash!, {
        ...producer.buildReceipt(mined.l1TxHash!, producer.sent[0].intents),
        l1BlockNumber: 99n,
        l1BlockHash: hash(99),
      });

      await bot.produceStep();

      const remined = await store.getBatchMessages(message.batchId);
      expect(remined.map(m => m.globalLeafIndex)).toEqual(['50', '51']);
    });
  });

  describe('retention', () => {
    it('times out messages that outlived the message timeout and frees their capacity', async () => {
      const bot = buildBot({ l1ToL2SeedCount: 4, l1ToL2MessageTimeoutSeconds: 60 });
      await bot.produceStep();
      expect(await bot.countOutstandingMessages()).toEqual(4);

      dateProvider.advanceTime(120);
      await bot.produceStep();

      const timedOut = await store.getMessagesByState('timed_out');
      expect(timedOut.length).toEqual(4);
      expect(timedOut.every(m => m.secret.length > 0)).toBe(true);
      expect(producer.sent.length).toEqual(2);
    });
  });

  describe('saturation schedule', () => {
    // The message timeout has to outlast the saturation interval, or the messages a run is waiting on time out
    // before the next run is even due.
    const saturationConfig = {
      inboxSaturationIntervalSeconds: 3600,
      l1ToL2SeedCount: 300,
      l1ToL2MessageTimeoutSeconds: 86_400,
    };

    it('persists the first due time as startup plus the interval and does not run early', async () => {
      const bot = buildBot(saturationConfig);
      const startedAt = dateProvider.now();

      await bot.produceStep();

      expect(await store.getSchedule()).toMatchObject({ enabled: true, nextDueAt: startedAt + 3_600_000 });
      expect(producer.sent[0].intents.length).toEqual(4);
    });

    it('runs a full-bucket batch when due and schedules the next run from the submission time', async () => {
      const bot = buildBot(saturationConfig);
      await bot.produceStep();
      dateProvider.advanceTime(3600);
      const dueAt = dateProvider.now();

      await bot.produceStep();

      expect(producer.sent.at(-1)!.intents.length).toEqual(MAX_INBOX_MESSAGES_PER_BATCH);
      expect(await store.getSchedule()).toMatchObject({
        nextDueAt: dueAt + 3_600_000,
        runInFlight: true,
      });
      const saturationMessages = (await store.getActiveMessages()).filter(m => m.scenario === 'saturation');
      expect(saturationMessages.length).toEqual(MAX_INBOX_MESSAGES_PER_BATCH);
    });

    it('does not burst after downtime: one run, then the next due time is measured from now', async () => {
      const bot = buildBot(saturationConfig);
      await bot.produceStep();
      dateProvider.advanceTime(3600 * 50);
      const resumedAt = dateProvider.now();

      await bot.produceStep();
      await bot.produceStep();
      await bot.produceStep();

      const saturationBatches = producer.sent.filter(sent => sent.intents.length === MAX_INBOX_MESSAGES_PER_BATCH);
      expect(saturationBatches.length).toEqual(1);
      expect(await store.getSchedule()).toMatchObject({ nextDueAt: resumedAt + 3_600_000 });
    });

    it('holds ordinary production while it waits for room for a full bucket', async () => {
      const bot = buildBot({ ...saturationConfig, l1ToL2SeedCount: MAX_INBOX_MESSAGES_PER_BATCH });
      await bot.produceStep();
      expect(await bot.countOutstandingMessages()).toEqual(4);
      dateProvider.advanceTime(3600);

      await bot.produceStep();

      expect(producer.sent.length).toEqual(1);
      expect(await bot.countOutstandingMessages()).toEqual(4);

      for (const message of await store.getActiveMessages()) {
        await store.transitionMessage(message.messageId, 'completed', {});
      }
      await bot.produceStep();

      expect(producer.sent.at(-1)!.intents.length).toEqual(MAX_INBOX_MESSAGES_PER_BATCH);
    });

    it('never starts a second run while the previous one is unresolved', async () => {
      const bot = buildBot({ ...saturationConfig, l1ToL2SeedCount: 600 });
      await bot.produceStep();
      dateProvider.advanceTime(3600);
      await bot.produceStep();
      dateProvider.advanceTime(3600 * 2);

      await bot.produceStep();

      expect(producer.sent.filter(sent => sent.intents.length === MAX_INBOX_MESSAGES_PER_BATCH).length).toEqual(1);
      expect(await store.getSchedule()).toMatchObject({ runInFlight: true });
    });

    it('closes out a run once all its messages resolve, advancing the success timestamp only on a full success', async () => {
      const bot = buildBot({ ...saturationConfig, l1ToL2SeedCount: 600 });
      await bot.produceStep();
      dateProvider.advanceTime(3600);
      await bot.produceStep();
      const batchId = (await store.getSchedule())!.inFlightBatchId!;
      for (const message of await store.getBatchMessages(batchId)) {
        await store.transitionMessage(message.messageId, 'completed', {});
      }

      await bot.produceStep();

      const schedule = await store.getSchedule();
      expect(schedule).toMatchObject({ runInFlight: false, lastSuccessAt: dateProvider.now() });
      expect(schedule!.inFlightBatchId).toBeUndefined();
    });

    it('does not advance the success timestamp when a run had a failed message', async () => {
      const bot = buildBot({ ...saturationConfig, l1ToL2SeedCount: 600 });
      await bot.produceStep();
      dateProvider.advanceTime(3600);
      await bot.produceStep();
      const batchId = (await store.getSchedule())!.inFlightBatchId!;
      const messages = await store.getBatchMessages(batchId);
      await store.transitionMessage(messages[0].messageId, 'failed', { failureReason: 'l2_revert' });
      for (const message of messages.slice(1)) {
        await store.transitionMessage(message.messageId, 'completed', {});
      }

      await bot.produceStep();

      const schedule = await store.getSchedule();
      expect(schedule).toMatchObject({ runInFlight: false });
      expect(schedule!.lastSuccessAt).toBeUndefined();
    });

    it('backs off before retrying a run whose L1 send failed', async () => {
      const bot = buildBot(saturationConfig);
      await bot.produceStep();
      dateProvider.advanceTime(3600);
      producer.behaviour = 'throw';

      await bot.produceStep();

      const schedule = await store.getSchedule();
      expect(schedule).toMatchObject({ runInFlight: false, consecutiveFailures: 1 });
      expect(schedule!.retryAfterAt).toEqual(dateProvider.now() + 10_000);

      producer.behaviour = 'success';
      await bot.produceStep();
      expect(producer.sent.filter(sent => sent.intents.length === MAX_INBOX_MESSAGES_PER_BATCH).length).toEqual(0);

      dateProvider.advanceTime(10);
      await bot.produceStep();
      expect(producer.sent.filter(sent => sent.intents.length === MAX_INBOX_MESSAGES_PER_BATCH).length).toEqual(1);
    });

    it('never runs and reports a zero due time when saturation is disabled', async () => {
      const bot = buildBot({ inboxSaturationIntervalSeconds: 0 });

      await bot.produceStep();
      dateProvider.advanceTime(3600 * 100);
      await bot.produceStep();

      expect(await store.getSchedule()).toMatchObject({ enabled: false, nextDueAt: 0 });
      expect(producer.sent.every(sent => sent.intents.length === 4)).toBe(true);
    });
  });

  describe('health', () => {
    it('reports unhealthy after the configured number of consecutive production failures', async () => {
      const bot = buildBot({ maxConsecutiveErrors: 2 });
      producer.behaviour = 'throw';

      await bot.produceStep();
      expect(bot.isHealthy()).toBe(true);
      await bot.produceStep();
      expect(bot.isHealthy()).toBe(false);

      producer.behaviour = 'success';
      await bot.produceStep();
      expect(bot.isHealthy()).toBe(true);
    });
  });
});
