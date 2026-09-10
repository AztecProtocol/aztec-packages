import { AztecAddress } from '@aztec/aztec.js/addresses';
import {
  DroppedTxReceipt,
  MinedTxReceipt,
  PendingTxReceipt,
  TxExecutionResult,
  TxHash,
  type TxReceipt,
  TxStatus,
} from '@aztec/aztec.js/tx';
import { MULTI_CALL_3_ADDRESS } from '@aztec/ethereum/contracts';
import {
  BlockNumber,
  CheckpointNumber,
  EpochNumber,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { ManualDateProvider } from '@aztec/foundation/timer';
import { SiblingPath, computeRootFromSiblingPath } from '@aztec/foundation/trees';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { type BlockData, BlockHash } from '@aztec/stdlib/block';
import { computeMerkleHash, siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { computeFeeJuiceMessageNullifier } from '@aztec/stdlib/messaging';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, PartialStateReference, StateReference, TxEffect } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';
import type { EmbeddedWallet } from '@aztec/wallets/embedded';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type BotConfig, MAX_INBOX_MESSAGES_PER_BATCH, applyInboxModeDefaults, getBotDefaultConfig } from './config.js';
import { InboxBot } from './inbox_bot.js';
import type { InboxL1Producer } from './inbox_l1_producer.js';
import type { InboxConsumptionRequest, InboxL2Consumer } from './inbox_l2_consumer.js';
import type {
  L1ToL2MessageBatchMismatch,
  L1ToL2MessageBatchReceipt,
  L1ToL2MessageIntent,
  SentInboxMessage,
} from './l1_to_l2_seeding.js';
import { type InboxMessageRecord, InboxStore } from './store/inbox_store.js';

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

/**
 * L2 side of the bot under the test's control. Records every attempt and every replay simulation, and can be told
 * to fail either one, or to hold an attempt open so a test can observe the bot while a proof is in flight.
 */
class FakeInboxL2Consumer implements InboxL2Consumer {
  public readonly sent: InboxConsumptionRequest[] = [];
  public readonly simulated: InboxConsumptionRequest[] = [];
  /** Errors thrown by successive sends; entries are consumed in order, then `sendError` applies. */
  public sendErrors: (Error | undefined)[] = [];
  public sendError?: Error;
  public simulateError?: Error;
  /** When set, a send waits on this before resolving, holding the attempt in flight. */
  public gate?: Promise<void>;
  private nextTx = 1;

  public async send(request: InboxConsumptionRequest): Promise<TxHash> {
    this.sent.push(request);
    if (this.gate) {
      await this.gate;
    }
    const error = this.sendErrors.length > 0 ? this.sendErrors.shift() : this.sendError;
    if (error) {
      throw error;
    }
    return TxHash.fromString(hash(0x2000 + this.nextTx++));
  }

  public simulate(request: InboxConsumptionRequest): Promise<void> {
    this.simulated.push(request);
    return this.simulateError ? Promise.reject(this.simulateError) : Promise.resolve();
  }
}

/** Height the node serves L1→L2 membership witnesses at. */
const MESSAGE_TREE_HEIGHT = 36;

/** A block as the fake chain models it: how many messages it had consumed, and the root proving them. */
interface FakeBlock {
  number: number;
  leaves: number;
  root: Fr;
  blockHash: BlockHash;
}

/**
 * The chain the node mock answers from: which messages it has ingested, what its blocks look like, which
 * nullifiers exist, and what receipts its transactions have.
 */
class FakeChain {
  public readonly node: MockProxy<AztecNode> = mock<AztecNode>();
  public readonly indexed = new Map<string, bigint>();
  public readonly witnesses = new Map<string, { index: bigint; path: Buffer[] }>();
  public readonly receipts = new Map<string, TxReceipt>();
  public readonly nullifiers = new Set<string>();
  public readonly blocks: FakeBlock[] = [];
  /** Called on every block read, so a test can move the chain under a check that is already running. */
  public onBlockRead?: (blockNumber: number) => void;

  constructor() {
    this.node.getL1ToL2MessageIndex.mockImplementation(msgHash =>
      Promise.resolve(this.indexed.get(msgHash.toString())),
    );
    this.node.getBlockData.mockImplementation(param => Promise.resolve(this.readBlock(param)));
    this.node.getL1ToL2MessageMembershipWitness.mockImplementation((_reference, msgHash) => {
      const witness = this.witnesses.get(msgHash.toString());
      return Promise.resolve(
        witness === undefined
          ? undefined
          : ([witness.index, new SiblingPath<typeof MESSAGE_TREE_HEIGHT>(MESSAGE_TREE_HEIGHT, witness.path)] as const),
      );
    });
    this.node.getTxReceipt.mockImplementation(txHash =>
      Promise.resolve(
        this.receipts.get(txHash.toString()) ??
          PendingTxReceipt.from({ txHash, tx: undefined, status: TxStatus.PENDING }),
      ),
    );
    this.node.findLeavesIndexes.mockImplementation((_reference, _treeId, leaves) =>
      Promise.resolve(
        leaves.map(leaf =>
          this.nullifiers.has(leaf.toString())
            ? { data: 0n, l2BlockNumber: BlockNumber(this.tip().number), l2BlockHash: this.tip().blockHash }
            : undefined,
        ),
      ),
    );
  }

  public tip(): FakeBlock {
    return this.blocks[this.blocks.length - 1];
  }

  public blockAt(blockNumber: number): FakeBlock | undefined {
    return this.blocks.find(block => block.number === blockNumber);
  }

  /** Appends a block that has consumed `leaves` messages in total. */
  public appendBlock(leaves: number, root = Fr.ZERO): FakeBlock {
    const block = { number: this.blocks.length + 1, leaves, root, blockHash: BlockHash.random() };
    this.blocks.push(block);
    return block;
  }

  /** Tells the node about a message without inserting it into any block, which is what observation sees. */
  public observe(message: InboxMessageRecord): void {
    this.indexed.set(message.msgHash!, BigInt(message.globalLeafIndex!));
  }

  /**
   * Inserts a message into a new block: registers a witness for it and gives the block the root that witness
   * hashes up to, so a readiness check against that block verifies.
   */
  public async insert(message: InboxMessageRecord): Promise<FakeBlock> {
    this.observe(message);
    const index = BigInt(message.globalLeafIndex!);
    const path = Array.from({ length: MESSAGE_TREE_HEIGHT }, (_, i) => new Fr(BigInt(i + 1)).toBuffer());
    this.witnesses.set(message.msgHash!, { index, path });
    const root = Fr.fromBuffer(
      await computeRootFromSiblingPath(
        Fr.fromHexString(message.msgHash!).toBuffer(),
        path,
        Number(index),
        async (l, r) => (await computeMerkleHash(Fr.fromBuffer(l), Fr.fromBuffer(r))).toBuffer(),
      ),
    );
    return this.appendBlock(Number(index) + 1, root);
  }

  /** Registers a mined receipt for the transaction the bot last sent for this message. */
  public mine(
    message: InboxMessageRecord,
    args: {
      blockNumber: number;
      nullifiers?: Fr[];
      reverted?: boolean;
      status?: TxStatus.PROPOSED | TxStatus.CHECKPOINTED | TxStatus.PROVEN | TxStatus.FINALIZED;
      blockHash?: BlockHash;
    },
  ): void {
    const txEffect = TxEffect.empty();
    txEffect.nullifiers = args.nullifiers ?? [];
    const txHash = TxHash.fromString(message.l2TxHash!);
    this.receipts.set(
      txHash.toString(),
      MinedTxReceipt.from({
        txHash,
        status: args.status ?? TxStatus.PROPOSED,
        executionResult: args.reverted ? TxExecutionResult.REVERTED : TxExecutionResult.SUCCESS,
        transactionFee: 0n,
        blockHash: args.blockHash ?? this.blockAt(args.blockNumber)!.blockHash,
        blockNumber: BlockNumber(args.blockNumber),
        slotNumber: SlotNumber(args.blockNumber),
        txIndexInBlock: 0,
        epochNumber: EpochNumber(0),
        txEffect,
      }),
    );
  }

  /** Marks the transaction the bot sent for this message as dropped from the mempool. */
  public drop(message: InboxMessageRecord): void {
    const txHash = TxHash.fromString(message.l2TxHash!);
    this.receipts.set(txHash.toString(), DroppedTxReceipt.from({ txHash, status: TxStatus.DROPPED }));
  }

  private readBlock(param: unknown): BlockData | undefined {
    const blockNumber =
      typeof param === 'number'
        ? param
        : typeof param === 'string'
          ? this.tip()?.number
          : typeof param === 'object' && param !== null && 'number' in param
            ? (param as { number: number }).number
            : typeof param === 'object' && param !== null && 'tag' in param
              ? this.tip()?.number
              : undefined;
    if (blockNumber === undefined) {
      return undefined;
    }
    this.onBlockRead?.(blockNumber);
    const block = this.blockAt(blockNumber);
    return block === undefined ? undefined : buildBlockData(block);
  }
}

function buildBlockData(block: FakeBlock): BlockData {
  return {
    header: BlockHeader.empty({
      globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(block.number) }),
      state: new StateReference(new AppendOnlyTreeSnapshot(block.root, block.leaves), PartialStateReference.empty()),
    }),
    archive: AppendOnlyTreeSnapshot.empty(),
    blockHash: block.blockHash,
    checkpointNumber: CheckpointNumber(1),
    indexWithinCheckpoint: IndexWithinCheckpoint(0),
  };
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
  let consumer: FakeInboxL2Consumer;
  let chain: FakeChain;
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
      node: chain.node,
      wallet: mock<EmbeddedWallet>(),
      defaultAccountAddress: recipient,
      contractAddress: recipient,
      producer,
      consumer,
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
    consumer = new FakeInboxL2Consumer();
    chain = new FakeChain();
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

  describe('consumption', () => {
    /** Produces one batch and tells the node about every message in it, which is what observation sees. */
    const produceObservedBatch = async (bot: InboxBot): Promise<InboxMessageRecord[]> => {
      await bot.produceStep();
      const messages = await store.getActiveMessages();
      for (const message of messages) {
        chain.observe(message);
      }
      return messages;
    };

    /** Runs one consumption poll and waits for the attempts it started. */
    const consume = async (bot: InboxBot): Promise<void> => {
      await bot.consumeStep();
      await bot.waitForBackgroundWork();
    };

    const reload = async (message: InboxMessageRecord) => (await store.getMessage(message.messageId))!;

    const nullifierOf = async (message: InboxMessageRecord) =>
      await siloNullifier(
        recipient,
        await computeFeeJuiceMessageNullifier(Fr.fromHexString(message.msgHash!), Fr.fromHexString(message.secret)),
      );

    const notConsumableYet = new Error('Assertion failed: Tried to consume nonexistent L1-to-L2 message');
    const alreadyNullified = new Error('Assertion failed: L1-to-L2 message is already nullified');

    it('starts a public consumption on observation alone, without waiting for historical readiness', async () => {
      const bot = buildBot({ inboxConsumeMode: 'public', inboxMessagesPerBatch: 1 });
      const [message] = await produceObservedBatch(bot);
      chain.appendBlock(0);

      await consume(bot);

      expect(consumer.sent.length).toEqual(1);
      expect(consumer.sent[0]).toMatchObject({ mode: 'public', sender: EthAddress.fromString(MULTI_CALL_3_ADDRESS) });
      const updated = await reload(message);
      expect(updated.state).toEqual('sent');
      expect(updated.readyAt).toBeUndefined();
      expect(updated.attempts).toEqual(1);
      expect(bot.recorded.get('check:index_match:passed')).toEqual(1);
    });

    it('holds a private consumption until the message is in the pinned block and its witness verifies', async () => {
      const bot = buildBot({ inboxConsumeMode: 'private', inboxMessagesPerBatch: 1 });
      const [message] = await produceObservedBatch(bot);
      chain.appendBlock(0);

      await consume(bot);

      expect(consumer.sent).toEqual([]);
      expect((await reload(message)).state).toEqual('awaiting_anchor');

      const block = await chain.insert(message);
      await consume(bot);

      expect(consumer.sent.length).toEqual(1);
      const updated = await reload(message);
      expect(updated.state).toEqual('sent');
      expect(updated.readyBlockNumber).toEqual(block.number.toString());
      expect(bot.recorded.get('check:readiness_witness:passed')).toEqual(1);
    });

    it('reports a witness that does not reconstruct the pinned block root, and still attempts the message', async () => {
      const bot = buildBot({ inboxConsumeMode: 'private', inboxMessagesPerBatch: 1 });
      const [message] = await produceObservedBatch(bot);
      await chain.insert(message);
      chain.witnesses.set(message.msgHash!, {
        index: BigInt(message.globalLeafIndex!),
        path: Array.from({ length: 36 }, () => Fr.random().toBuffer()),
      });

      await consume(bot);

      expect(bot.recorded.get('check:readiness_witness:failed')).toEqual(1);
      expect(bot.recorded.get('failure:invalid_witness')).toEqual(1);
      expect(consumer.sent.length).toEqual(1);
    });

    it('treats a readiness check whose block was re-mined underneath it as inconclusive', async () => {
      const bot = buildBot({ inboxConsumeMode: 'private', inboxMessagesPerBatch: 1 });
      const [message] = await produceObservedBatch(bot);
      const block = await chain.insert(message);
      let reads = 0;
      chain.onBlockRead = () => {
        // Re-mine the block being checked partway through, which is exactly what a reorg looks like to the check.
        if (++reads === 3) {
          block.blockHash = BlockHash.random();
        }
      };

      await consume(bot);

      expect(bot.recorded.get('check:readiness_witness:failed')).toBeUndefined();
      expect(bot.recorded.get('check:readiness_witness:passed')).toBeUndefined();
      expect((await reload(message)).readyAt).toBeUndefined();
      expect(consumer.sent).toEqual([]);
    });

    it('fails a message whose index the node reports differently from the Inbox event', async () => {
      const bot = buildBot({ inboxMessagesPerBatch: 1 });
      await bot.produceStep();
      const [message] = await store.getActiveMessages();
      chain.indexed.set(message.msgHash!, BigInt(message.globalLeafIndex!) + 7n);

      await consume(bot);

      const updated = await reload(message);
      expect(updated).toMatchObject({ state: 'failed', failureReason: 'api_inconsistency' });
      expect(bot.recorded.get('check:index_match:failed')).toEqual(1);
      expect(consumer.sent).toEqual([]);
    });

    it('probes an unknown message hash once per batch and expects the node not to know it', async () => {
      const bot = buildBot({ inboxMessagesPerBatch: 2 });
      await produceObservedBatch(bot);

      await consume(bot);
      await consume(bot);

      expect(bot.recorded.get('check:unknown_message:passed')).toEqual(1);
    });

    it('retries a message that is not consumable yet without spending an attempt or reporting a failure', async () => {
      const bot = buildBot({ inboxConsumeMode: 'public', inboxMessagesPerBatch: 1 });
      const [message] = await produceObservedBatch(bot);
      consumer.sendErrors = [notConsumableYet];

      await consume(bot);

      const retrying = await reload(message);
      expect(retrying).toMatchObject({ state: 'observed', attempts: 0 });
      expect(bot.recorded.get('simulation:not_ready')).toEqual(1);
      expect(bot.recorded.get('failure:simulation')).toBeUndefined();
      expect(bot.isHealthy()).toBe(true);

      await consume(bot);

      expect(consumer.sent.length).toEqual(2);
      expect((await reload(message)).state).toEqual('sent');
    });

    it('does not let an unrelated simulation error masquerade as a message that is not ready yet', async () => {
      const bot = buildBot({ inboxConsumeMode: 'public', inboxMessagesPerBatch: 1 });
      const [message] = await produceObservedBatch(bot);
      consumer.sendError = new Error('Assertion failed: Invalid secret hash');

      await consume(bot);

      expect(bot.recorded.get('simulation:error')).toEqual(1);
      expect(bot.recorded.get('simulation:not_ready')).toBeUndefined();
      expect(await reload(message)).toMatchObject({ state: 'observed', attempts: 1 });

      for (let i = 0; i < 5; i++) {
        await consume(bot);
      }

      expect(await reload(message)).toMatchObject({ state: 'failed', failureReason: 'simulation' });
    });

    it('never starts a second attempt for a message while one is in flight', async () => {
      const bot = buildBot({ inboxConsumeMode: 'public', inboxMessagesPerBatch: 1 });
      await produceObservedBatch(bot);
      const { promise, resolve } = promiseWithResolvers<void>();
      consumer.gate = promise;

      await bot.consumeStep();
      await bot.consumeStep();
      await bot.consumeStep();
      resolve();
      await bot.waitForBackgroundWork();

      expect(consumer.sent.length).toEqual(1);
    });

    it('keeps observing other messages while an attempt is held in flight', async () => {
      const bot = buildBot({ inboxConsumeMode: 'public', inboxMessagesPerBatch: 1 });
      const [first] = await produceObservedBatch(bot);
      const { promise, resolve } = promiseWithResolvers<void>();
      consumer.gate = promise;
      await bot.consumeStep();

      dateProvider.advanceTime(1);
      await bot.produceStep();
      const second = (await store.getActiveMessages()).find(m => m.messageId !== first.messageId)!;
      chain.observe(second);
      await bot.consumeStep();

      expect((await reload(second)).state).not.toEqual('awaiting_l1');
      resolve();
      await bot.waitForBackgroundWork();
    });

    it('retries a dropped transaction with a fresh one and never reuses its hash', async () => {
      const bot = buildBot({ inboxConsumeMode: 'public', inboxMessagesPerBatch: 1 });
      const [message] = await produceObservedBatch(bot);
      await consume(bot);
      const sent = await reload(message);
      chain.drop(sent);

      await consume(bot);

      expect(bot.recorded.get('failure:l2_drop')).toEqual(1);
      const retried = await reload(message);
      expect(retried.state).toEqual('sent');
      expect(retried.l2TxHash).not.toEqual(sent.l2TxHash);
      expect(consumer.sent.length).toEqual(2);
    });

    it('completes a consumption once its receipt reaches the completion policy, with the expected nullifier', async () => {
      const bot = buildBot({ inboxConsumeMode: 'public', inboxMessagesPerBatch: 1, followChain: 'CHECKPOINTED' });
      const [message] = await produceObservedBatch(bot);
      await consume(bot);
      const sent = await reload(message);
      const insertion = await chain.insert(sent);
      chain.mine(sent, {
        blockNumber: insertion.number,
        nullifiers: [await nullifierOf(sent)],
        status: TxStatus.PROPOSED,
      });

      await consume(bot);

      const included = await reload(message);
      expect(included.state).toEqual('sent');
      expect(included.proposedInclusionBlockNumber).toEqual(insertion.number.toString());
      expect(included.blockRelation).toEqual('same_block');
      expect(bot.recorded.get('check:consumption_nullifier:passed')).toEqual(1);
      expect(bot.recorded.get('public_execution:success')).toEqual(1);

      chain.mine(sent, {
        blockNumber: insertion.number,
        nullifiers: [await nullifierOf(sent)],
        status: TxStatus.CHECKPOINTED,
      });
      await consume(bot);

      expect(await reload(message)).toMatchObject({
        state: 'completed',
        completionBlockNumber: insertion.number.toString(),
      });
    });

    it('reports a later block relation without treating the lost race as a failure', async () => {
      const bot = buildBot({ inboxConsumeMode: 'public', inboxMessagesPerBatch: 1 });
      const [message] = await produceObservedBatch(bot);
      await consume(bot);
      const sent = await reload(message);
      const insertion = await chain.insert(sent);
      const consuming = chain.appendBlock(insertion.leaves, insertion.root);
      chain.mine(sent, { blockNumber: consuming.number, nullifiers: [await nullifierOf(sent)] });

      await consume(bot);

      expect(await reload(message)).toMatchObject({
        blockRelation: 'later_block',
        insertionBlockNumber: insertion.number.toString(),
      });
      expect(bot.recorded.get('failure:l2_revert')).toBeUndefined();
    });

    it('reports an unknown relation when the consuming block is no longer canonical', async () => {
      const bot = buildBot({ inboxConsumeMode: 'public', inboxMessagesPerBatch: 1 });
      const [message] = await produceObservedBatch(bot);
      await consume(bot);
      const sent = await reload(message);
      const insertion = await chain.insert(sent);
      chain.mine(sent, {
        blockNumber: insertion.number,
        nullifiers: [await nullifierOf(sent)],
        blockHash: BlockHash.random(),
      });

      await consume(bot);

      expect((await reload(message)).blockRelation).toEqual('unknown');
    });

    it('calls a revert a correctness failure only when the block did carry the unspent message', async () => {
      const bot = buildBot({ inboxConsumeMode: 'public', inboxMessagesPerBatch: 1 });
      const [message] = await produceObservedBatch(bot);
      await consume(bot);
      const sent = await reload(message);
      const insertion = await chain.insert(sent);
      chain.mine(sent, { blockNumber: insertion.number, reverted: true });

      await consume(bot);

      expect(await reload(message)).toMatchObject({ state: 'failed', failureReason: 'invalid_consumption' });
      expect(bot.recorded.get('public_execution:reverted')).toEqual(1);
      expect(bot.recorded.get('prediction_mismatch')).toEqual(1);
    });

    it('calls a revert an ordinary one when the executing block did not carry the message', async () => {
      const bot = buildBot({ inboxConsumeMode: 'public', inboxMessagesPerBatch: 1 });
      const [message] = await produceObservedBatch(bot);
      await consume(bot);
      const sent = await reload(message);
      const block = chain.appendBlock(0);
      chain.mine(sent, { blockNumber: block.number, reverted: true });

      await consume(bot);

      expect(await reload(message)).toMatchObject({ state: 'failed', failureReason: 'l2_revert' });
    });

    it('abandons an attempt a restart interrupted rather than risking a second spend', async () => {
      const bot = buildBot({ inboxConsumeMode: 'public', inboxMessagesPerBatch: 1 });
      const [message] = await produceObservedBatch(bot);
      await store.transitionMessage(message.messageId, 'preparing');

      await consume(bot);

      expect(await reload(message)).toMatchObject({ state: 'failed', failureReason: 'l2_drop' });
      expect(consumer.sent).toEqual([]);
    });

    it('continues the mixed-mode alternation across a restart', async () => {
      const first = buildBot({ inboxMessagesPerBatch: 1 });
      await first.produceStep();
      dateProvider.advanceTime(1);
      const second = buildBot({ inboxMessagesPerBatch: 1 });
      await second.produceStep();

      expect((await store.getActiveMessages()).map(m => m.mode)).toEqual(['public', 'private']);
    });

    describe('replay probe', () => {
      /** Drives one message all the way to completion, which is what the probe needs before it can run. */
      const completeOneMessage = async (bot: InboxBot): Promise<InboxMessageRecord> => {
        const [message] = await produceObservedBatch(bot);
        await consume(bot);
        const sent = await reload(message);
        const insertion = await chain.insert(sent);
        chain.mine(sent, { blockNumber: insertion.number, nullifiers: [await nullifierOf(sent)] });
        await consume(bot);
        return await reload(message);
      };

      it('waits for the spending nullifier to be visible at the anchor before simulating', async () => {
        const bot = buildBot({ inboxConsumeMode: 'public', inboxMessagesPerBatch: 1 });
        const completed = await completeOneMessage(bot);
        expect(completed.state).toEqual('completed');

        dateProvider.advanceTime(30);
        await consume(bot);

        expect(consumer.simulated).toEqual([]);

        chain.nullifiers.add((await nullifierOf(completed)).toString());
        consumer.simulateError = alreadyNullified;
        dateProvider.advanceTime(30);
        await consume(bot);

        expect(consumer.simulated.length).toEqual(1);
        expect(consumer.simulated[0].mode).toEqual('private');
        expect(bot.recorded.get('check:replay_rejection:passed')).toEqual(1);
      });

      it('reports a replay that was accepted', async () => {
        const bot = buildBot({ inboxConsumeMode: 'public', inboxMessagesPerBatch: 1 });
        const completed = await completeOneMessage(bot);
        chain.nullifiers.add((await nullifierOf(completed)).toString());

        dateProvider.advanceTime(30);
        await consume(bot);

        expect(bot.recorded.get('check:replay_rejection:failed')).toEqual(1);
        expect(bot.recorded.get('failure:replay_accepted')).toEqual(1);
      });

      it('does not accept an unrelated rejection as replay protection, and tries again', async () => {
        const bot = buildBot({ inboxConsumeMode: 'public', inboxMessagesPerBatch: 1 });
        const completed = await completeOneMessage(bot);
        chain.nullifiers.add((await nullifierOf(completed)).toString());
        consumer.simulateError = new Error('Assertion failed: Invalid secret hash');

        dateProvider.advanceTime(30);
        await consume(bot);

        expect(bot.recorded.get('check:replay_rejection:passed')).toBeUndefined();
        expect(bot.recorded.get('check:replay_rejection:failed')).toBeUndefined();

        consumer.simulateError = alreadyNullified;
        dateProvider.advanceTime(30);
        await consume(bot);

        expect(bot.recorded.get('check:replay_rejection:passed')).toEqual(1);
        expect(consumer.simulated.length).toEqual(2);
      });
    });
  });
});
