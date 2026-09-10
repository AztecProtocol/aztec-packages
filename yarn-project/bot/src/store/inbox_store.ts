import { randomBytes } from '@aztec/foundation/crypto/random';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncSingleton } from '@aztec/kv-store';

import { z } from 'zod';

import {
  InboxBotBlockRelations,
  InboxBotChecks,
  InboxBotMilestones,
  InboxBotModes,
  InboxBotReasons,
  InboxBotScenarios,
  InboxBotStages,
} from '../inbox_bot_metrics.js';
import type {
  InboxBotCheck,
  InboxBotMilestone,
  InboxBotMode,
  InboxBotReason,
  InboxBotScenario,
  InboxBotStage,
} from '../inbox_bot_metrics.js';

/**
 * State of a single L1→L2 message the inbox bot produced.
 *
 * `awaiting_l1` covers everything up to the node acknowledging the message: the L1 transaction may still be
 * unmined, or mined and not yet indexed. The message's batch record carries the L1 receipt, so the two cases are
 * distinguishable without a separate state.
 */
export const InboxMessageStates = [
  'awaiting_l1',
  'observed',
  'awaiting_anchor',
  'preparing',
  'sent',
  'completed',
  'timed_out',
  'failed',
] as const;
export type InboxMessageState = (typeof InboxMessageStates)[number];

/** States a message never leaves. */
export const InboxTerminalMessageStates = ['completed', 'timed_out', 'failed'] as const;
export type InboxTerminalMessageState = (typeof InboxTerminalMessageStates)[number];

/** Returns whether a message in this state can still change. */
export function isTerminalInboxMessageState(state: InboxMessageState): state is InboxTerminalMessageState {
  return (InboxTerminalMessageStates as readonly string[]).includes(state);
}

/**
 * State of an atomic Multicall3 batch.
 *
 * `reserved` means the intent is durable but nothing was broadcast; `submitted` means an L1 nonce was claimed and
 * a broadcast was attempted, so the outcome is uncertain until the receipt is reconciled.
 */
export const InboxBatchStates = ['reserved', 'submitted', 'mined', 'failed'] as const;
export type InboxBatchState = (typeof InboxBatchStates)[number];

/** Status the L1 receipt reported for a batch. */
export const InboxBatchReceiptStatuses = ['success', 'reverted'] as const;
export type InboxBatchReceiptStatus = (typeof InboxBatchReceiptStatuses)[number];

const hexString = z.string().regex(/^0x[0-9a-fA-F]+$/, 'expected a 0x-prefixed hex string');
const decimalString = z.string().regex(/^\d+$/, 'expected a decimal integer string');
const timestampMs = z.number().int().nonnegative();

/**
 * A message the bot sent, or is about to send, through the Inbox. Everything needed to consume it later and to
 * reconstruct its latency samples after a restart lives here; the record is only removed once it has reached a
 * terminal state and aged out of retention.
 */
export const InboxMessageRecordSchema = z.object({
  messageId: z.string().min(1),
  batchId: z.string().min(1),
  scenario: z.enum(InboxBotScenarios),
  /** L2 domain this message is assigned to be consumed through. */
  mode: z.enum(InboxBotModes),
  content: hexString,
  secret: hexString,
  secretHash: hexString,
  state: z.enum(InboxMessageStates),
  createdAt: timestampMs,
  /** L1 sender the receipt reported, which is the Multicall3 contract rather than the signing account. */
  sender: hexString.optional(),
  msgHash: hexString.optional(),
  globalLeafIndex: decimalString.optional(),
  bucketSeq: decimalString.optional(),
  l2TxHash: z.string().optional(),
  /** Number of L2 consumption attempts started for this message. */
  attempts: z.number().int().nonnegative().default(0),
  /** Local timestamp at which the batch's L1 broadcast started. */
  sentAt: timestampMs.optional(),
  /** First observation of a canonical L1 receipt for the batch. */
  minedAt: timestampMs.optional(),
  /** First time the node returned an index for the message. */
  observedAt: timestampMs.optional(),
  /** First positive historical readiness check under the configured anchor policy. */
  readyAt: timestampMs.optional(),
  /** Block that readiness check was pinned to, so a later anchor can be compared against it. */
  readyBlockNumber: decimalString.optional(),
  /** First proposed inclusion of the consuming transaction. */
  includedAt: timestampMs.optional(),
  /** Block that first carried the consuming transaction, regardless of the completion policy. */
  proposedInclusionBlockNumber: decimalString.optional(),
  /** Completion under the configured `followChain` policy, which can lag proposed inclusion by a long way. */
  completedAt: timestampMs.optional(),
  completionBlockNumber: decimalString.optional(),
  /** First block whose L1→L2 message tree covered this message, when the search for it was conclusive. */
  insertionBlockNumber: decimalString.optional(),
  /** How the consuming block relates to the block that inserted the message. */
  blockRelation: z.enum(InboxBotBlockRelations).optional(),
  timedOutAt: timestampMs.optional(),
  failedAt: timestampMs.optional(),
  failureReason: z.enum(InboxBotReasons).optional(),
  /** Milestones already exported to telemetry, so a restart does not re-emit them. */
  exportedMilestones: z.array(z.enum(InboxBotMilestones)).default([]),
  /** Stage latencies already exported to telemetry. */
  exportedStages: z.array(z.enum(InboxBotStages)).default([]),
});
export type InboxMessageRecord = z.infer<typeof InboxMessageRecordSchema>;

/** An atomic Multicall3 submission of one or more `sendL2Message` calls. */
export const InboxBatchRecordSchema = z.object({
  batchId: z.string().min(1),
  scenario: z.enum(InboxBotScenarios),
  state: z.enum(InboxBatchStates),
  messageIds: z.array(z.string().min(1)),
  /** Number of messages the batch was built to carry. */
  messageCount: z.number().int().positive(),
  createdAt: timestampMs,
  /** Local timestamp at which the broadcast started. */
  submittedAt: timestampMs.optional(),
  l1TxHash: hexString.optional(),
  /** Nonce claimed for the broadcast, used to reconcile an uncertain submission after a restart. */
  l1Nonce: z.number().int().nonnegative().optional(),
  l1BlockNumber: decimalString.optional(),
  l1BlockHash: hexString.optional(),
  /** L1 block timestamp in seconds, kept for logs. Metrics use bot-observed local timestamps. */
  l1BlockTimestamp: decimalString.optional(),
  minedAt: timestampMs.optional(),
  receiptStatus: z.enum(InboxBatchReceiptStatuses).optional(),
  gasUsed: decimalString.optional(),
  sender: hexString.optional(),
  failureReason: z.enum(InboxBotReasons).optional(),
  exportedStages: z.array(z.enum(InboxBotStages)).default([]),
  /** Whether the batch's outcome, size and gas were exported, so resolving its receipt again does not repeat them. */
  resultExported: z.boolean().default(false),
  /** When the batch's unknown-message probe ran, so a restart does not repeat it. */
  unknownMessageProbedAt: timestampMs.optional(),
  /** When the batch's replay probe resolved, so a restart does not repeat it. */
  replayProbedAt: timestampMs.optional(),
  /** When the batch's bucket layout was checked against the Inbox, so a restart does not repeat it. */
  bucketProbedAt: timestampMs.optional(),
  /**
   * Checks that failed anywhere in this batch, so a run's outcome can be judged on every check having passed and
   * not only on its messages having been consumed. Bounded by the check set, and each check is listed once.
   */
  failedChecks: z.array(z.enum(InboxBotChecks)).default([]),
});
export type InboxBatchRecord = z.infer<typeof InboxBatchRecordSchema>;

/** One-off probes a batch carries, each run at most once over the batch's lifetime. */
export const InboxBatchProbes = ['unknown_message', 'replay', 'bucket_rollover'] as const;
export type InboxBatchProbe = (typeof InboxBatchProbes)[number];

/** The bot's saturation schedule, which survives restarts so downtime does not produce a catch-up burst. */
export const InboxScheduleRecordSchema = z.object({
  enabled: z.boolean(),
  /** When the next saturation batch becomes due. Meaningless while `enabled` is false. */
  nextDueAt: timestampMs,
  /** Last time a saturation run completed in full, meaning every message was consumed and every check passed. */
  lastSuccessAt: timestampMs.optional(),
  /** Whether a saturation run has been started and not yet resolved. */
  runInFlight: z.boolean(),
  inFlightBatchId: z.string().optional(),
  consecutiveFailures: z.number().int().nonnegative().default(0),
  /** Earliest time a failed run may be retried. */
  retryAfterAt: timestampMs.optional(),
});
export type InboxScheduleRecord = z.infer<typeof InboxScheduleRecordSchema>;

/** The message intent a batch reservation carries, before the Inbox assigns it a hash and an index. */
export interface InboxMessageIntentInput {
  content: string;
  secret: string;
  secretHash: string;
  mode: InboxBotMode;
}

/** Everything the Inbox receipt told us about one message of a mined batch. */
export interface InboxMessageOutcome {
  messageId: string;
  msgHash: string;
  globalLeafIndex: bigint;
  bucketSeq: bigint;
  sender: string;
}

/** The canonical L1 receipt of a mined batch. */
export interface InboxBatchReceiptInput {
  l1TxHash: string;
  l1BlockNumber: bigint;
  l1BlockHash: string;
  l1BlockTimestamp: bigint;
  gasUsed: bigint;
  status: InboxBatchReceiptStatus;
}

/** Fields a message transition may set alongside its new state. */
export type InboxMessagePatch = Partial<
  Omit<InboxMessageRecord, 'messageId' | 'batchId' | 'state' | 'content' | 'secret' | 'secretHash' | 'createdAt'>
>;

/**
 * Thrown when a persisted inbox record cannot be parsed. The store is untrusted input: a record written by an
 * older build, or a partially written one, must fail loudly and name its key rather than propagate as `undefined`.
 */
export class InboxStoreCorruptionError extends Error {
  constructor(
    public readonly recordKind: string,
    public readonly key: string,
    public readonly detail: string,
  ) {
    super(`Corrupt inbox ${recordKind} record at key ${key}: ${detail}`);
    this.name = 'InboxStoreCorruptionError';
  }
}

const STATE_INDEX_SEPARATOR = ':';

function stateIndexKey(state: InboxMessageState, messageId: string): string {
  return `${state}${STATE_INDEX_SEPARATOR}${messageId}`;
}

function parseRecord<T>(schema: z.ZodType<T>, kind: string, key: string, raw: string): T {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new InboxStoreCorruptionError(kind, key, `not valid JSON (${err})`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new InboxStoreCorruptionError(kind, key, z.prettifyError(parsed.error));
  }
  return parsed.data;
}

/**
 * Durable state for the inbox bot: the batches it produced, the messages inside them, and its saturation
 * schedule. These maps are entirely separate from the crosschain bot's `pending_l1_to_l2` map, which keeps its
 * own single-message semantics.
 *
 * Every mutation that spans more than one key runs inside `transactionAsync`, so a crash can never leave a batch
 * without its messages, or a message without its state index entry.
 */
export class InboxStore {
  private readonly batches: AztecAsyncMap<string, string>;
  private readonly messages: AztecAsyncMap<string, string>;
  private readonly messagesByState: AztecAsyncMap<string, string>;
  private readonly schedule: AztecAsyncSingleton<string>;
  private readonly modeCursor: AztecAsyncSingleton<string>;

  constructor(
    private readonly store: AztecAsyncKVStore,
    private readonly log: Logger = createLogger('bot:inbox-store'),
    private readonly dateProvider: DateProvider = new DateProvider(),
  ) {
    this.batches = store.openMap<string, string>('inbox_batches');
    this.messages = store.openMap<string, string>('inbox_messages');
    this.messagesByState = store.openMap<string, string>('inbox_messages_by_state');
    this.schedule = store.openSingleton<string>('inbox_schedule');
    this.modeCursor = store.openSingleton<string>('inbox_mode_cursor');
  }

  /**
   * Reserves a batch and its messages before anything is broadcast, so an uncertain submission can always be
   * reconciled against durable intent.
   */
  public async reserveBatch(args: {
    scenario: InboxBotScenario;
    intents: InboxMessageIntentInput[];
    /** Domain the next message produced after this batch must be assigned, persisted with the reservation. */
    nextMode?: InboxBotMode;
  }): Promise<{ batch: InboxBatchRecord; messages: InboxMessageRecord[] }> {
    const { scenario, intents } = args;
    if (intents.length === 0) {
      throw new Error(`Cannot reserve an empty inbox batch`);
    }
    const now = this.dateProvider.now();
    const batchId = `${now.toString().padStart(16, '0')}-${randomBytes(4).toString('hex')}`;

    const messages: InboxMessageRecord[] = intents.map((intent, index) =>
      InboxMessageRecordSchema.parse({
        messageId: `${batchId}#${index.toString().padStart(4, '0')}`,
        batchId,
        scenario,
        mode: intent.mode,
        content: intent.content,
        secret: intent.secret,
        secretHash: intent.secretHash,
        state: 'awaiting_l1',
        createdAt: now,
      }),
    );

    const batch = InboxBatchRecordSchema.parse({
      batchId,
      scenario,
      state: 'reserved',
      messageIds: messages.map(msg => msg.messageId),
      messageCount: messages.length,
      createdAt: now,
    });

    await this.store.transactionAsync(async () => {
      await this.batches.set(batchId, JSON.stringify(batch));
      for (const message of messages) {
        await this.writeMessage(message);
      }
      if (args.nextMode) {
        await this.modeCursor.set(args.nextMode);
      }
    });

    this.log.debug(`Reserved inbox batch`, { batchId, scenario, messageCount: messages.length });
    return { batch, messages };
  }

  /** Records the nonce claimed for a batch broadcast, before the transaction leaves the process. */
  public async recordBatchSubmitting(batchId: string, args: { l1Nonce: number; submittedAt: number }): Promise<void> {
    await this.store.transactionAsync(async () => {
      const batch = await this.requireBatch(batchId);
      await this.batches.set(
        batchId,
        JSON.stringify({ ...batch, state: 'submitted', l1Nonce: args.l1Nonce, submittedAt: args.submittedAt }),
      );
      for (const messageId of batch.messageIds) {
        const message = await this.requireMessage(messageId);
        await this.writeMessage({ ...message, sentAt: args.submittedAt });
      }
    });
  }

  /** Records the broadcast transaction hash as soon as the node accepts it. */
  public async recordBatchTxHash(batchId: string, l1TxHash: string): Promise<void> {
    await this.store.transactionAsync(async () => {
      const batch = await this.requireBatch(batchId);
      await this.batches.set(batchId, JSON.stringify({ ...batch, l1TxHash }));
    });
  }

  /**
   * Records a mined batch together with the per-message outcomes its receipt reported. Callers must validate the
   * receipt against the persisted intent first; this method assumes the outcomes are already trusted.
   */
  public async recordBatchMined(
    batchId: string,
    receipt: InboxBatchReceiptInput,
    outcomes: InboxMessageOutcome[],
  ): Promise<{ batch: InboxBatchRecord; failed: InboxMessageRecord[] }> {
    const minedAt = this.dateProvider.now();
    return await this.store.transactionAsync(async () => {
      const batch = await this.requireBatch(batchId);
      const updated: InboxBatchRecord = {
        ...batch,
        state: 'mined',
        minedAt,
        l1TxHash: receipt.l1TxHash,
        l1BlockNumber: receipt.l1BlockNumber.toString(),
        l1BlockHash: receipt.l1BlockHash,
        l1BlockTimestamp: receipt.l1BlockTimestamp.toString(),
        gasUsed: receipt.gasUsed.toString(),
        receiptStatus: receipt.status,
        sender: outcomes[0]?.sender,
      };
      await this.batches.set(batchId, JSON.stringify(updated));
      const failed: InboxMessageRecord[] = [];
      for (const outcome of outcomes) {
        const message = await this.requireMessage(outcome.messageId);
        if (isTerminalInboxMessageState(message.state)) {
          continue;
        }
        if (message.state !== 'awaiting_l1') {
          // A message that already has a consumption attempt against the previous receipt cannot take on a new
          // identity: the attempt was built against the old one. An identity that did not move is left alone.
          if (message.msgHash === outcome.msgHash) {
            continue;
          }
          const reorged: InboxMessageRecord = {
            ...message,
            state: 'failed',
            failedAt: minedAt,
            failureReason: 'reorg',
          };
          await this.moveMessage(message, reorged);
          failed.push(reorged);
          continue;
        }
        await this.writeMessage({
          ...message,
          minedAt,
          msgHash: outcome.msgHash,
          globalLeafIndex: outcome.globalLeafIndex.toString(),
          bucketSeq: outcome.bucketSeq.toString(),
          sender: outcome.sender,
        });
      }
      return { batch: updated, failed };
    });
  }

  /** Marks a batch and every message still in flight inside it as failed. */
  public async recordBatchFailed(batchId: string, reason: InboxBotReason): Promise<InboxMessageRecord[]> {
    const failedAt = this.dateProvider.now();
    return await this.store.transactionAsync(async () => {
      const batch = await this.requireBatch(batchId);
      await this.batches.set(batchId, JSON.stringify({ ...batch, state: 'failed', failureReason: reason }));
      const failed: InboxMessageRecord[] = [];
      for (const messageId of batch.messageIds) {
        const message = await this.requireMessage(messageId);
        if (isTerminalInboxMessageState(message.state)) {
          continue;
        }
        const updated: InboxMessageRecord = { ...message, state: 'failed', failedAt, failureReason: reason };
        await this.moveMessage(message, updated);
        failed.push(updated);
      }
      return failed;
    });
  }

  /**
   * Applies a patch to a message without changing its state. Readiness tracking runs alongside a consumption
   * attempt, so it must never write back a state it read before that attempt advanced it.
   */
  public async patchMessage(messageId: string, patch: InboxMessagePatch): Promise<InboxMessageRecord> {
    return await this.store.transactionAsync(async () => {
      const message = await this.requireMessage(messageId);
      const updated: InboxMessageRecord = { ...message, ...patch };
      await this.writeMessage(updated);
      return updated;
    });
  }

  /** Moves a message to a new state, applying the given fields in the same transaction. */
  public async transitionMessage(
    messageId: string,
    state: InboxMessageState,
    patch: InboxMessagePatch = {},
  ): Promise<InboxMessageRecord> {
    return await this.store.transactionAsync(async () => {
      const message = await this.requireMessage(messageId);
      const updated: InboxMessageRecord = { ...message, ...patch, state };
      await this.moveMessage(message, updated);
      return updated;
    });
  }

  /**
   * Moves a message to a new state only while it is still in one of the states the caller read it in, and returns
   * undefined without writing anything otherwise. Retention, a timeout and a consumption attempt all mutate the
   * same record from different clocks, and a blind write-back would resurrect a record that has already resolved.
   */
  public async transitionMessageFrom(
    messageId: string,
    from: InboxMessageState[],
    to: InboxMessageState,
    patch: InboxMessagePatch = {},
  ): Promise<InboxMessageRecord | undefined> {
    return await this.store.transactionAsync(async () => {
      const message = await this.requireMessage(messageId);
      if (!from.includes(message.state)) {
        return undefined;
      }
      const updated: InboxMessageRecord = { ...message, ...patch, state: to };
      await this.moveMessage(message, updated);
      return updated;
    });
  }

  /** Records that the given milestones and stage latencies have been exported, so a restart does not repeat them. */
  public async markExported(
    messageId: string,
    args: { milestones?: InboxBotMilestone[]; stages?: InboxBotStage[] },
  ): Promise<void> {
    await this.store.transactionAsync(async () => {
      const message = await this.requireMessage(messageId);
      await this.writeMessage({
        ...message,
        exportedMilestones: [...new Set([...message.exportedMilestones, ...(args.milestones ?? [])])],
        exportedStages: [...new Set([...message.exportedStages, ...(args.stages ?? [])])],
      });
    });
  }

  /** Records that a batch's stage latencies, or its one-off outcome sample, have been exported. */
  public async markBatchExported(batchId: string, args: { stages?: InboxBotStage[]; result?: boolean }): Promise<void> {
    await this.store.transactionAsync(async () => {
      const batch = await this.requireBatch(batchId);
      await this.batches.set(
        batchId,
        JSON.stringify({
          ...batch,
          exportedStages: [...new Set([...batch.exportedStages, ...(args.stages ?? [])])],
          resultExported: batch.resultExported || args.result === true,
        }),
      );
    });
  }

  /**
   * Drops everything a batch's messages derived from an L1 receipt that is no longer canonical, putting them back
   * to `awaiting_l1` so the re-mined receipt can supply fresh hashes and indices. Messages that already have an L2
   * transaction in flight are left alone: their consumption attempt has to be resolved on its own terms.
   */
  public async invalidateDerivedState(batchId: string): Promise<InboxMessageRecord[]> {
    return await this.store.transactionAsync(async () => {
      const batch = await this.requireBatch(batchId);
      const invalidated: InboxMessageRecord[] = [];
      for (const messageId of batch.messageIds) {
        const message = await this.requireMessage(messageId);
        // A message being prepared has no transaction hash yet, but its attempt is already building against the
        // identity this receipt assigned it, so it is left alone just like one that has already been sent.
        if (
          isTerminalInboxMessageState(message.state) ||
          message.l2TxHash !== undefined ||
          message.state === 'preparing'
        ) {
          continue;
        }
        const updated: InboxMessageRecord = {
          ...message,
          state: 'awaiting_l1',
          msgHash: undefined,
          globalLeafIndex: undefined,
          bucketSeq: undefined,
          sender: undefined,
          minedAt: undefined,
          observedAt: undefined,
          readyAt: undefined,
          includedAt: undefined,
          proposedInclusionBlockNumber: undefined,
        };
        await this.moveMessage(message, updated);
        invalidated.push(updated);
      }
      // The bucket layout is derived from the receipt too, so a re-mined batch is checked again.
      await this.batches.set(batchId, JSON.stringify({ ...batch, bucketProbedAt: undefined }));
      this.log.warn(`Invalidated inbox state derived from a non-canonical receipt`, {
        batchId,
        count: invalidated.length,
      });
      return invalidated;
    });
  }

  public async getBatch(batchId: string): Promise<InboxBatchRecord | undefined> {
    const raw = await this.batches.getAsync(batchId);
    return raw === undefined ? undefined : parseRecord(InboxBatchRecordSchema, 'batch', batchId, raw);
  }

  public async getMessage(messageId: string): Promise<InboxMessageRecord | undefined> {
    const raw = await this.messages.getAsync(messageId);
    return raw === undefined ? undefined : parseRecord(InboxMessageRecordSchema, 'message', messageId, raw);
  }

  /** Returns every message of a batch, in the order the batch built them. */
  public async getBatchMessages(batchId: string): Promise<InboxMessageRecord[]> {
    const batch = await this.getBatch(batchId);
    if (!batch) {
      return [];
    }
    const messages: InboxMessageRecord[] = [];
    for (const messageId of batch.messageIds) {
      const message = await this.getMessage(messageId);
      if (message) {
        messages.push(message);
      }
    }
    return messages;
  }

  /** Returns the messages currently in the given state, oldest first. */
  public async getMessagesByState(state: InboxMessageState): Promise<InboxMessageRecord[]> {
    const messages: InboxMessageRecord[] = [];
    for await (const messageId of this.messagesByState.valuesAsync(stateIndexRange(state))) {
      messages.push(await this.requireMessage(messageId));
    }
    return messages;
  }

  /** Returns every message that has not reached a terminal state, oldest first. */
  public async getActiveMessages(): Promise<InboxMessageRecord[]> {
    const active: InboxMessageRecord[] = [];
    for (const state of InboxMessageStates) {
      if (!isTerminalInboxMessageState(state)) {
        active.push(...(await this.getMessagesByState(state)));
      }
    }
    return active.sort((a, b) => a.createdAt - b.createdAt || a.messageId.localeCompare(b.messageId));
  }

  /** Number of messages still counting against the outstanding-message cap. */
  public async countActiveMessages(): Promise<number> {
    let count = 0;
    for (const state of InboxMessageStates) {
      if (isTerminalInboxMessageState(state)) {
        continue;
      }
      for await (const _ of this.messagesByState.keysAsync(stateIndexRange(state))) {
        count++;
      }
    }
    return count;
  }

  /**
   * Domain the next produced message must be assigned in `mixed` mode. Undefined before the first batch is
   * reserved, so the caller decides where the alternation starts.
   */
  public async getNextMode(): Promise<InboxBotMode | undefined> {
    const raw = await this.modeCursor.getAsync();
    if (raw === undefined) {
      return undefined;
    }
    const parsed = z.enum(InboxBotModes).safeParse(raw);
    if (!parsed.success) {
      throw new InboxStoreCorruptionError('mode cursor', 'inbox_mode_cursor', z.prettifyError(parsed.error));
    }
    return parsed.data;
  }

  /** Records that a batch's one-off probe has run, so it is never repeated for that batch. */
  public async recordBatchProbe(batchId: string, probe: InboxBatchProbe): Promise<void> {
    const now = this.dateProvider.now();
    await this.store.transactionAsync(async () => {
      const batch = await this.requireBatch(batchId);
      const patch =
        probe === 'unknown_message'
          ? { unknownMessageProbedAt: now }
          : probe === 'replay'
            ? { replayProbedAt: now }
            : { bucketProbedAt: now };
      await this.batches.set(batchId, JSON.stringify({ ...batch, ...patch }));
    });
  }

  /**
   * Records that one of the batch's checks failed. Listed once per check: a check that fails for several of a
   * batch's messages says the same thing about the batch as a check that failed for one of them.
   */
  public async recordCheckFailure(batchId: string, check: InboxBotCheck): Promise<void> {
    await this.store.transactionAsync(async () => {
      const batch = await this.batches.getAsync(batchId);
      if (batch === undefined) {
        // A check can outlive its batch: retention drops terminal records, and the outcome is already recorded.
        return;
      }
      const current = parseRecord(InboxBatchRecordSchema, 'batch', batchId, batch);
      if (current.failedChecks.includes(check)) {
        return;
      }
      await this.batches.set(batchId, JSON.stringify({ ...current, failedChecks: [...current.failedChecks, check] }));
    });
  }

  /** Mined batches whose replay probe has not run yet, oldest first. */
  public async getBatchesPendingReplayProbe(): Promise<InboxBatchRecord[]> {
    const pending: InboxBatchRecord[] = [];
    for await (const [key, raw] of this.batches.entriesAsync()) {
      const batch = parseRecord(InboxBatchRecordSchema, 'batch', key, raw);
      if (batch.state === 'mined' && batch.replayProbedAt === undefined) {
        pending.push(batch);
      }
    }
    return pending;
  }

  /** Batches whose L1 outcome is not yet known, oldest first. These are what a restart must reconcile. */
  public async getUnresolvedBatches(): Promise<InboxBatchRecord[]> {
    const unresolved: InboxBatchRecord[] = [];
    for await (const [key, raw] of this.batches.entriesAsync()) {
      const batch = parseRecord(InboxBatchRecordSchema, 'batch', key, raw);
      if (batch.state === 'reserved' || batch.state === 'submitted') {
        unresolved.push(batch);
      }
    }
    return unresolved;
  }

  /**
   * Turns every non-terminal message older than `maxAgeMs` into an explicit `timed_out` outcome. A pending
   * message is never deleted outright: its claim secret stays readable until retention removes the record.
   */
  public async timeOutStaleMessages(maxAgeMs: number): Promise<InboxMessageRecord[]> {
    const now = this.dateProvider.now();
    const stale = (await this.getActiveMessages()).filter(message => now - message.createdAt > maxAgeMs);
    if (stale.length === 0) {
      return [];
    }
    return await this.store.transactionAsync(async () => {
      const timedOut: InboxMessageRecord[] = [];
      for (const message of stale) {
        const current = await this.requireMessage(message.messageId);
        if (isTerminalInboxMessageState(current.state)) {
          continue;
        }
        const updated: InboxMessageRecord = { ...current, state: 'timed_out', timedOutAt: now };
        await this.moveMessage(current, updated);
        timedOut.push(updated);
      }
      this.log.warn(`Timed out inbox messages`, { count: timedOut.length, maxAgeMs });
      return timedOut;
    });
  }

  /**
   * Drops terminal diagnostic records, keeping the store bounded. Only messages that already reached a terminal
   * state and are older than `maxAgeMs` are removed, and only once every message of their batch is removable, so
   * a batch is never left half present. Anything beyond `maxRecords` terminal messages is removed oldest first
   * regardless of age.
   */
  public async pruneTerminalRecords(args: { maxAgeMs: number; maxRecords: number }): Promise<number> {
    const now = this.dateProvider.now();
    const terminal: InboxMessageRecord[] = [];
    for (const state of InboxTerminalMessageStates) {
      terminal.push(...(await this.getMessagesByState(state)));
    }
    terminal.sort((a, b) => a.createdAt - b.createdAt || a.messageId.localeCompare(b.messageId));

    const overflow = Math.max(0, terminal.length - args.maxRecords);
    const removable = new Set(
      terminal
        .filter((message, index) => index < overflow || now - message.createdAt > args.maxAgeMs)
        .map(m => m.messageId),
    );
    if (removable.size === 0) {
      return 0;
    }

    return await this.store.transactionAsync(async () => {
      let removed = 0;
      // The saturation schedule names the batch it is waiting on; deleting that record would leave the run in
      // flight with nothing left to resolve it against.
      const inFlightBatchId = (await this.getSchedule())?.inFlightBatchId;
      const batchIds = new Set(terminal.filter(m => removable.has(m.messageId)).map(m => m.batchId));
      for (const batchId of batchIds) {
        const batch = await this.getBatch(batchId);
        if (!batch || batchId === inFlightBatchId || !batch.messageIds.every(id => removable.has(id))) {
          continue;
        }
        for (const messageId of batch.messageIds) {
          const message = await this.requireMessage(messageId);
          await this.messages.delete(messageId);
          await this.messagesByState.delete(stateIndexKey(message.state, messageId));
          removed++;
        }
        await this.batches.delete(batchId);
      }
      if (removed > 0) {
        this.log.debug(`Pruned inbox records`, { messages: removed, batches: batchIds.size });
      }
      return removed;
    });
  }

  public async getSchedule(): Promise<InboxScheduleRecord | undefined> {
    const raw = await this.schedule.getAsync();
    return raw === undefined ? undefined : parseRecord(InboxScheduleRecordSchema, 'schedule', 'inbox_schedule', raw);
  }

  public async setSchedule(record: InboxScheduleRecord): Promise<void> {
    await this.schedule.set(JSON.stringify(InboxScheduleRecordSchema.parse(record)));
  }

  /** Applies a patch to the persisted schedule, reading and writing it inside a single transaction. */
  public async updateSchedule(patch: Partial<InboxScheduleRecord>): Promise<InboxScheduleRecord> {
    return await this.store.transactionAsync(async () => {
      const current = await this.getSchedule();
      if (!current) {
        throw new Error(`Cannot update the inbox saturation schedule before it is initialized`);
      }
      const updated = InboxScheduleRecordSchema.parse({ ...current, ...patch });
      await this.schedule.set(JSON.stringify(updated));
      return updated;
    });
  }

  private async writeMessage(message: InboxMessageRecord): Promise<void> {
    await this.messages.set(message.messageId, JSON.stringify(message));
    await this.messagesByState.set(stateIndexKey(message.state, message.messageId), message.messageId);
  }

  private async moveMessage(previous: InboxMessageRecord, updated: InboxMessageRecord): Promise<void> {
    if (previous.state !== updated.state) {
      await this.messagesByState.delete(stateIndexKey(previous.state, previous.messageId));
    }
    await this.writeMessage(updated);
  }

  private async requireBatch(batchId: string): Promise<InboxBatchRecord> {
    const batch = await this.getBatch(batchId);
    if (!batch) {
      throw new Error(`Unknown inbox batch ${batchId}`);
    }
    return batch;
  }

  private async requireMessage(messageId: string): Promise<InboxMessageRecord> {
    const message = await this.getMessage(messageId);
    if (!message) {
      throw new Error(`Unknown inbox message ${messageId}`);
    }
    return message;
  }
}

function stateIndexRange(state: InboxMessageState) {
  return { start: `${state}${STATE_INDEX_SEPARATOR}`, end: `${state}${STATE_INDEX_SEPARATOR}\uffff` };
}
