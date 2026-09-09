import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { createLogger } from '@aztec/aztec.js/log';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { DateProvider } from '@aztec/foundation/timer';
import type { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { BlockTag } from '@aztec/stdlib/block';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { TelemetryClient } from '@aztec/telemetry-client';
import type { EmbeddedWallet } from '@aztec/wallets/embedded';

import type { BotLifecycle } from './base_bot.js';
import {
  type BotConfig,
  MAX_INBOX_MESSAGES_PER_BATCH,
  applyInboxModeDefaults,
  assertValidInboxConfig,
} from './config.js';
import { BotFactory } from './factory.js';
import type {
  InboxBotCheck,
  InboxBotCheckResult,
  InboxBotMilestone,
  InboxBotMode,
  InboxBotReason,
  InboxBotSaturationRunResult,
  InboxBotScenario,
} from './inbox_bot_metrics.js';
import { type InboxL1Producer, ViemInboxL1Producer } from './inbox_l1_producer.js';
import {
  type L1ToL2MessageBatchReceipt,
  type L1ToL2MessageIntent,
  generateL1ToL2MessageIntents,
} from './l1_to_l2_seeding.js';
import {
  type InboxBatchRecord,
  type InboxMessageRecord,
  type InboxScheduleRecord,
  type InboxStore,
  isTerminalInboxMessageState,
} from './store/inbox_store.js';
import type { BotStore } from './store/index.js';

/**
 * Terminal records are kept for a day so a failure can still be diagnosed after the fact, and capped in number so
 * a long-running bot cannot grow its store without bound.
 */
const TERMINAL_RECORD_RETENTION_MS = 24 * 60 * 60 * 1000;
const TERMINAL_RECORD_RETENTION_COUNT = 5000;

/**
 * How far back mined batches are re-checked for canonicality on every production step. L1 reorgs are shallow, and
 * an unbounded re-check would cost one RPC round trip per outstanding batch on every tick.
 */
const L1_REORG_RECHECK_WINDOW_MS = 5 * 60 * 1000;

/** Collaborators the inbox bot runs on. `create` builds the production ones; tests substitute their own. */
export interface InboxBotDeps {
  node: AztecNode;
  wallet: EmbeddedWallet;
  defaultAccountAddress: AztecAddress;
  /** Contract the messages are addressed to and later consumed through. */
  contract: TestContract;
  producer: InboxL1Producer;
  store: InboxStore;
  telemetry: TelemetryClient;
  config: BotConfig;
  dateProvider?: DateProvider;
  syncChainTip?: BlockTag;
}

/**
 * Bot that exercises the Fast Inbox: it produces atomic batches of L1→L2 messages on its own clock and follows
 * each message through to consumption on L2, checking the node's messaging API along the way.
 *
 * It drives its own scheduling rather than being ticked by `BotRunner`'s interval, because production and
 * consumption run on two independent clocks and a tick does not map to a single L2 transaction.
 *
 * Production is interval-driven with at most one L1 submission in flight, gated by the outstanding-message cap
 * (`l1ToL2SeedCount`). Every step that can be interrupted by a crash is made durable before it becomes uncertain,
 * so a restart reconciles rather than resends. L2 consumption is not implemented yet.
 */
export class InboxBot implements BotLifecycle {
  protected log = createLogger('bot:inbox');

  public readonly node: AztecNode;
  public readonly wallet: EmbeddedWallet;
  public readonly defaultAccountAddress: AztecAddress;
  public config: BotConfig;

  private readonly contract: TestContract;
  private readonly producer: InboxL1Producer;
  private readonly store: InboxStore;
  private readonly telemetry: TelemetryClient;
  private readonly dateProvider: DateProvider;
  private readonly syncChainTip?: BlockTag;

  private readonly productionPromise: RunningPromise;

  private running = false;
  private healthy = true;
  /** Guards the single L1 submission the bot allows in flight, however the step was triggered. */
  private stepInFlight = false;
  private consecutiveProductionFailures = 0;
  /** Counts produced messages so `mixed` alternates domains across messages and across batches alike. */
  private producedMessageCount = 0;

  public constructor(deps: InboxBotDeps) {
    this.node = deps.node;
    this.wallet = deps.wallet;
    this.defaultAccountAddress = deps.defaultAccountAddress;
    this.contract = deps.contract;
    this.producer = deps.producer;
    this.store = deps.store;
    this.telemetry = deps.telemetry;
    this.config = deps.config;
    this.dateProvider = deps.dateProvider ?? new DateProvider();
    this.syncChainTip = deps.syncChainTip;

    this.productionPromise = new RunningPromise(
      () => this.produceStep(),
      this.log,
      this.config.txIntervalSeconds * 1000,
    );
  }

  /**
   * Sets up the bot's account, L1 client and TestContract. Unlike the other bots this also takes the telemetry
   * client, since the inbox bot owns its own instruments rather than reporting through the runner.
   */
  static async create(
    config: BotConfig,
    wallet: EmbeddedWallet,
    aztecNode: AztecNode,
    aztecNodeAdmin: AztecNodeAdmin | undefined,
    store: BotStore,
    telemetry: TelemetryClient,
    syncChainTip?: BlockTag,
  ): Promise<InboxBot> {
    const effectiveConfig = applyInboxModeDefaults(config);
    assertValidInboxConfig(effectiveConfig);

    const factory = new BotFactory(effectiveConfig, wallet, store, aztecNode, aztecNodeAdmin, syncChainTip);
    const { defaultAccountAddress, contract, l1Client, rollupVersion } = await factory.setupCrossChain({
      seedMessages: false,
    });
    const { l1ContractAddresses } = await aztecNode.getNodeInfo();
    const inboxAddress = EthAddress.fromString(l1ContractAddresses.inboxAddress.toString());

    const producer = new ViemInboxL1Producer(
      l1Client,
      inboxAddress,
      contract.address,
      rollupVersion,
      createLogger('bot:inbox:l1'),
    );
    await producer.assertReady();

    return new InboxBot({
      node: aztecNode,
      wallet,
      defaultAccountAddress,
      contract,
      producer,
      store: store.inbox,
      telemetry,
      config: effectiveConfig,
      syncChainTip,
    });
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }
    await this.ensureSaturationSchedule();
    this.running = true;
    this.productionPromise.start();
    this.log.info(`Started inbox bot`, {
      messagesPerBatch: this.config.inboxMessagesPerBatch,
      consumeMode: this.config.inboxConsumeMode,
      saturationIntervalSeconds: this.config.inboxSaturationIntervalSeconds,
      outstandingMessageCap: this.config.l1ToL2SeedCount,
      txIntervalSeconds: this.config.txIntervalSeconds,
    });
  }

  /**
   * Stops the production loop, waiting for any step in flight so its durable writes land before the caller closes
   * the store. Everything the bot needs to resume is written as it happens, so there is nothing to flush here.
   */
  public async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    this.running = false;
    await this.productionPromise.stop();
    this.log.info(`Stopped inbox bot`);
  }

  /** Triggers a single production step, bypassing the interval. Resolves once that step has finished. */
  public async run(): Promise<unknown> {
    await this.productionPromise.trigger();
    return undefined;
  }

  /**
   * Whether production is succeeding. Says nothing about whether the bot is running: the runner tracks that
   * separately and combines the two.
   */
  public isHealthy(): boolean {
    return this.healthy;
  }

  /** Number of messages counting against the outstanding-message cap. Exposed for tests and diagnostics. */
  public countOutstandingMessages(): Promise<number> {
    return this.store.countActiveMessages();
  }

  /**
   * One turn of the production clock: reconcile anything left uncertain, retire stale records, then either hold
   * capacity for a due saturation run or produce an ordinary batch. `start()` runs this on the configured
   * interval; calling it directly drives the same step off a caller's own clock.
   */
  public async produceStep(): Promise<void> {
    if (this.stepInFlight) {
      this.log.debug(`Skipping inbox production step, one is already in flight`);
      return;
    }
    this.stepInFlight = true;
    try {
      await this.reconcileUnresolvedBatches();
      await this.recheckMinedBatches();
      await this.applyRetention();
      const heldForSaturation = await this.stepSaturationSchedule();
      if (!heldForSaturation) {
        await this.produceNormalBatch();
      }
    } catch (err) {
      this.registerProductionFailure(err);
    } finally {
      this.stepInFlight = false;
    }
  }

  private async produceNormalBatch(): Promise<void> {
    const count = this.config.inboxMessagesPerBatch;
    if (!(await this.hasCapacityFor(count))) {
      this.log.debug(`Skipping inbox batch, outstanding messages at cap`, {
        cap: this.config.l1ToL2SeedCount,
        requested: count,
      });
      return;
    }
    await this.produceBatch('normal', count);
  }

  /**
   * Produces one atomic batch. The intent is durable before anything is broadcast and the claimed nonce and
   * transaction hash are durable before the outcome is known, so a crash at any point leaves a record that
   * {@link reconcileUnresolvedBatches} can resolve without ever resending.
   */
  private async produceBatch(scenario: InboxBotScenario, count: number): Promise<InboxBatchRecord | undefined> {
    const intents = await generateL1ToL2MessageIntents(count, this.log);
    const { batch } = await this.store.reserveBatch({
      scenario,
      intents: intents.map(intent => ({
        content: intent.content.toString(),
        secret: intent.secret.toString(),
        secretHash: intent.secretHash.toString(),
        mode: this.assignMode(),
      })),
    });

    const submittedAt = this.dateProvider.now();
    let receipt: L1ToL2MessageBatchReceipt;
    try {
      receipt = await this.producer.sendBatch({
        intents,
        onNonceClaimed: nonce => this.store.recordBatchSubmitting(batch.batchId, { l1Nonce: nonce, submittedAt }),
        onBroadcast: txHash => this.store.recordBatchTxHash(batch.batchId, txHash),
      });
    } catch (err) {
      // Only a batch that never claimed a nonce is known not to have reached L1. Once one is claimed the send may
      // still land, so the batch is left for reconciliation against the account nonce rather than written off here.
      const current = await this.store.getBatch(batch.batchId);
      if (current?.state === 'reserved') {
        await this.store.recordBatchFailed(batch.batchId, 'l1_submission');
        this.recordFailure('l1_submission', { batchId: batch.batchId, scenario, err });
      } else {
        this.log.warn(`Inbox batch submission left uncertain, deferring to reconciliation`, {
          batchId: batch.batchId,
          scenario,
          err,
        });
      }
      this.registerProductionFailure(err);
      return undefined;
    }

    const resolved = await this.resolveBatchReceipt(batch.batchId, intents, receipt);
    if (resolved?.state === 'mined') {
      this.consecutiveProductionFailures = 0;
      this.healthy = true;
    }
    return resolved;
  }

  /**
   * Applies a mined receipt to a batch, after checking that its block is still canonical and that the events
   * describe exactly the messages the bot meant to send. Returns undefined while the outcome stays uncertain.
   */
  private async resolveBatchReceipt(
    batchId: string,
    intents: readonly L1ToL2MessageIntent[],
    receipt: L1ToL2MessageBatchReceipt,
  ): Promise<InboxBatchRecord | undefined> {
    const messages = await this.store.getBatchMessages(batchId);

    if (receipt.status === 'reverted') {
      await this.store.recordBatchFailed(batchId, 'l1_revert');
      this.recordL1Batch(batchId, 'reverted', receipt);
      this.recordFailure('l1_revert', { batchId, txHash: receipt.txHash });
      return undefined;
    }

    if (!(await this.producer.isBlockCanonical(receipt.l1BlockNumber, receipt.l1BlockHash))) {
      this.recordFailure('reorg', { batchId, l1BlockNumber: receipt.l1BlockNumber.toString() });
      this.log.warn(`Inbox batch receipt is not canonical, deferring`, {
        batchId,
        txHash: receipt.txHash,
        l1BlockNumber: receipt.l1BlockNumber.toString(),
      });
      return undefined;
    }

    const mismatches = this.producer.validateBatch(intents, receipt.messages);
    if (mismatches.length > 0) {
      this.recordCheck('event_integrity', 'failed', { batchId, mismatches });
      const reason: InboxBotReason = mismatches.some(m => m.kind === 'indices' || m.kind === 'count')
        ? 'bucket_mismatch'
        : 'api_inconsistency';
      await this.store.recordBatchFailed(batchId, reason);
      this.recordFailure(reason, { batchId, txHash: receipt.txHash, mismatches });
      this.log.error(`Inbox batch receipt does not match its persisted intent`, { batchId, mismatches });
      return undefined;
    }
    this.recordCheck('event_integrity', 'passed', { batchId });

    const mined = await this.store.recordBatchMined(
      batchId,
      {
        l1TxHash: receipt.txHash,
        l1BlockNumber: receipt.l1BlockNumber,
        l1BlockHash: receipt.l1BlockHash,
        l1BlockTimestamp: receipt.l1BlockTimestamp,
        gasUsed: receipt.gasUsed,
        status: receipt.status,
      },
      receipt.messages.map((message, index) => ({
        messageId: messages[index].messageId,
        msgHash: message.msgHash,
        globalLeafIndex: message.globalLeafIndex,
        bucketSeq: message.bucketSeq,
        sender: message.sender,
      })),
    );

    this.recordL1Batch(batchId, 'success', receipt);
    for (const message of await this.store.getBatchMessages(batchId)) {
      this.recordMessageMilestone(message, 'sent');
    }
    return mined;
  }

  /**
   * Resolves batches whose L1 outcome was still unknown when the bot last stopped. A batch is never resent: a
   * broadcast whose transaction cannot be found and whose nonce has already been consumed by something else is
   * recorded as failed, leaving its claim secrets readable until retention drops the record.
   */
  private async reconcileUnresolvedBatches(): Promise<void> {
    const unresolved = await this.store.getUnresolvedBatches();
    if (unresolved.length === 0) {
      return;
    }
    this.log.info(`Reconciling unresolved inbox batches`, { count: unresolved.length });

    for (const batch of unresolved) {
      if (batch.state === 'reserved') {
        await this.store.recordBatchFailed(batch.batchId, 'l1_submission');
        this.recordFailure('l1_submission', { batchId: batch.batchId, detail: 'never broadcast' });
        continue;
      }

      if (batch.l1TxHash) {
        const receipt = await this.producer.getBatchOutcome(batch.l1TxHash);
        if (receipt) {
          await this.resolveBatchReceipt(batch.batchId, await this.readIntents(batch.batchId), receipt);
          continue;
        }
      }

      const confirmedNonce = await this.producer.getConfirmedNonce();
      if (batch.l1Nonce === undefined || confirmedNonce > batch.l1Nonce) {
        this.log.warn(`Abandoning inbox batch whose broadcast cannot be followed`, {
          batchId: batch.batchId,
          l1TxHash: batch.l1TxHash,
          l1Nonce: batch.l1Nonce,
          confirmedNonce,
        });
        await this.store.recordBatchFailed(batch.batchId, 'l1_submission');
        this.recordFailure('l1_submission', { batchId: batch.batchId, detail: 'nonce consumed elsewhere' });
      } else if (!batch.l1TxHash) {
        this.log.warn(`Abandoning inbox batch that claimed a nonce but never broadcast`, {
          batchId: batch.batchId,
          l1Nonce: batch.l1Nonce,
          confirmedNonce,
        });
        await this.store.recordBatchFailed(batch.batchId, 'l1_submission');
        this.recordFailure('l1_submission', { batchId: batch.batchId, detail: 'no transaction hash' });
      }
    }
  }

  /**
   * Re-checks recently mined batches against the canonical chain. A re-mined batch lands at different indices, so
   * everything derived from its receipt is invalidated and the receipt is read again.
   */
  private async recheckMinedBatches(): Promise<void> {
    const now = this.dateProvider.now();
    const active = await this.store.getActiveMessages();
    const batchIds = [...new Set(active.map(message => message.batchId))];

    for (const batchId of batchIds) {
      const batch = await this.store.getBatch(batchId);
      if (
        !batch ||
        batch.state !== 'mined' ||
        batch.l1BlockNumber === undefined ||
        batch.l1BlockHash === undefined ||
        batch.minedAt === undefined ||
        now - batch.minedAt > L1_REORG_RECHECK_WINDOW_MS
      ) {
        continue;
      }
      if (await this.producer.isBlockCanonical(BigInt(batch.l1BlockNumber), batch.l1BlockHash)) {
        continue;
      }

      this.recordFailure('reorg', { batchId, l1BlockNumber: batch.l1BlockNumber });
      this.log.warn(`Inbox batch was reorged out of its L1 block`, {
        batchId,
        l1BlockNumber: batch.l1BlockNumber,
        l1BlockHash: batch.l1BlockHash,
      });
      await this.store.invalidateDerivedState(batchId);

      const receipt = batch.l1TxHash ? await this.producer.getBatchOutcome(batch.l1TxHash) : undefined;
      if (!receipt) {
        await this.store.recordBatchFailed(batchId, 'reorg');
        continue;
      }
      await this.resolveBatchReceipt(batchId, await this.readIntents(batchId), receipt);
    }
  }

  /**
   * Turns pending messages that outlived `l1ToL2MessageTimeoutSeconds` into an explicit `timed_out` outcome and
   * drops terminal records that have aged out. A pending message is never deleted without that outcome first.
   */
  private async applyRetention(): Promise<void> {
    const timedOut = await this.store.timeOutStaleMessages(this.config.l1ToL2MessageTimeoutSeconds * 1000);
    for (const message of timedOut) {
      this.recordMessageMilestone(message, 'timed_out');
      this.recordFailure('timeout', { messageId: message.messageId, batchId: message.batchId });
    }
    await this.store.pruneTerminalRecords({
      maxAgeMs: TERMINAL_RECORD_RETENTION_MS,
      maxRecords: TERMINAL_RECORD_RETENTION_COUNT,
    });
  }

  /**
   * Persists the first saturation due time as startup plus the interval. An existing schedule is kept so downtime
   * does not reset the clock, clamped to the current interval so a shortened interval takes effect. Idempotent:
   * once persisted, the clamp resolves to the stored value on every later call.
   */
  private async ensureSaturationSchedule(): Promise<InboxScheduleRecord> {
    const intervalMs = this.config.inboxSaturationIntervalSeconds * 1000;
    const enabled = intervalMs > 0;
    const current = await this.store.getSchedule();
    const nextDueAt = !enabled
      ? 0
      : current?.enabled
        ? Math.min(current.nextDueAt, this.dateProvider.now() + intervalMs)
        : this.dateProvider.now() + intervalMs;

    if (current && current.enabled === enabled && current.nextDueAt === nextDueAt) {
      return current;
    }
    const schedule: InboxScheduleRecord = {
      enabled,
      nextDueAt,
      lastSuccessAt: current?.lastSuccessAt,
      runInFlight: current?.runInFlight ?? false,
      inFlightBatchId: current?.inFlightBatchId,
      consecutiveFailures: current?.consecutiveFailures ?? 0,
      retryAfterAt: current?.retryAfterAt,
    };
    await this.store.setSchedule(schedule);
    return schedule;
  }

  /**
   * Advances the saturation schedule. Returns whether ordinary production must pause: a due run holds the
   * outstanding-message capacity it needs so ordinary traffic cannot starve it.
   */
  private async stepSaturationSchedule(): Promise<boolean> {
    const schedule = await this.ensureSaturationSchedule();
    if (!schedule.enabled) {
      return false;
    }

    if (schedule.runInFlight) {
      await this.resolveSaturationRun();
      return false;
    }

    const now = this.dateProvider.now();
    if (now < schedule.nextDueAt || (schedule.retryAfterAt !== undefined && now < schedule.retryAfterAt)) {
      return false;
    }

    if (!(await this.hasCapacityFor(MAX_INBOX_MESSAGES_PER_BATCH))) {
      this.log.debug(`Holding inbox capacity for a due saturation batch`, {
        cap: this.config.l1ToL2SeedCount,
        required: MAX_INBOX_MESSAGES_PER_BATCH,
      });
      return true;
    }

    const submittedAt = now;
    this.recordSaturationRun('started', {});
    const batch = await this.produceBatch('saturation', MAX_INBOX_MESSAGES_PER_BATCH);

    if (batch?.state === 'mined') {
      // The schedule advances on successful L1 issuance, from the submission time rather than from the previous
      // due time, so downtime is never followed by a burst of catch-up runs.
      await this.store.updateSchedule({
        nextDueAt: submittedAt + this.config.inboxSaturationIntervalSeconds * 1000,
        runInFlight: true,
        inFlightBatchId: batch.batchId,
        consecutiveFailures: 0,
        retryAfterAt: undefined,
      });
    } else {
      const consecutiveFailures = schedule.consecutiveFailures + 1;
      await this.store.updateSchedule({
        consecutiveFailures,
        retryAfterAt: now + this.saturationRetryDelayMs(consecutiveFailures),
      });
      this.recordSaturationRun('failed', { consecutiveFailures });
    }
    return true;
  }

  /**
   * Closes out a saturation run once every one of its messages has reached a terminal state. Only a run in which
   * every message was consumed counts as a success.
   */
  private async resolveSaturationRun(): Promise<void> {
    const schedule = await this.store.getSchedule();
    if (!schedule?.runInFlight || !schedule.inFlightBatchId) {
      return;
    }
    const messages = await this.store.getBatchMessages(schedule.inFlightBatchId);
    if (messages.length === 0 || messages.some(message => !isTerminalInboxMessageState(message.state))) {
      return;
    }

    const succeeded = messages.every(message => message.state === 'completed');
    await this.store.updateSchedule({
      runInFlight: false,
      inFlightBatchId: undefined,
      lastSuccessAt: succeeded ? this.dateProvider.now() : schedule.lastSuccessAt,
    });
    this.recordSaturationRun(succeeded ? 'success' : 'failed', { batchId: schedule.inFlightBatchId });
  }

  private saturationRetryDelayMs(consecutiveFailures: number): number {
    const base = this.config.txIntervalSeconds * 1000;
    const capped = Math.min(consecutiveFailures, 10);
    return Math.min(base * 2 ** (capped - 1), this.config.inboxSaturationIntervalSeconds * 1000);
  }

  private async hasCapacityFor(count: number): Promise<boolean> {
    const outstanding = await this.store.countActiveMessages();
    return outstanding + count <= this.config.l1ToL2SeedCount;
  }

  /** Rebuilds the message intents of a persisted batch, so a receipt can be validated against them on restart. */
  private async readIntents(batchId: string): Promise<L1ToL2MessageIntent[]> {
    const messages = await this.store.getBatchMessages(batchId);
    return messages.map(message => ({
      content: Fr.fromHexString(message.content),
      secret: Fr.fromHexString(message.secret),
      secretHash: Fr.fromHexString(message.secretHash),
    }));
  }

  /**
   * Assigns the L2 domain a message is consumed through. `mixed` alternates on every message, so a batch of one
   * still alternates across batches.
   */
  private assignMode(): InboxBotMode {
    if (this.config.inboxConsumeMode !== 'mixed') {
      return this.config.inboxConsumeMode;
    }
    return this.producedMessageCount++ % 2 === 0 ? 'public' : 'private';
  }

  private registerProductionFailure(err: unknown): void {
    this.consecutiveProductionFailures++;
    this.log.error(`Inbox bot production step failed`, {
      consecutiveFailures: this.consecutiveProductionFailures,
      err,
    });
    if (
      this.config.maxConsecutiveErrors > 0 &&
      this.consecutiveProductionFailures >= this.config.maxConsecutiveErrors
    ) {
      this.healthy = false;
    }
  }

  // The five methods below are the points at which the bot's telemetry is emitted. They log today; the metrics
  // class introduced alongside the instruments hooks into them without moving any of the call sites.

  private recordCheck(check: InboxBotCheck, result: InboxBotCheckResult, context: object): void {
    if (result === 'passed') {
      this.log.debug(`Inbox check ${check} passed`, { check, result, ...context });
    } else {
      this.log.warn(`Inbox check ${check} failed`, { check, result, ...context });
    }
  }

  private recordFailure(reason: InboxBotReason, context: object): void {
    this.log.warn(`Inbox bot failure`, { reason, ...context });
  }

  private recordMessageMilestone(message: InboxMessageRecord, milestone: InboxBotMilestone): void {
    this.log.debug(`Inbox message reached ${milestone}`, {
      milestone,
      messageId: message.messageId,
      batchId: message.batchId,
      scenario: message.scenario,
      mode: message.mode,
      msgHash: message.msgHash,
      globalLeafIndex: message.globalLeafIndex,
      bucketSeq: message.bucketSeq,
    });
  }

  private recordL1Batch(batchId: string, result: 'success' | 'reverted', receipt: L1ToL2MessageBatchReceipt): void {
    this.log.info(`Inbox batch ${result}`, {
      batchId,
      result,
      txHash: receipt.txHash,
      messageCount: receipt.messages.length,
      gasUsed: receipt.gasUsed.toString(),
      l1BlockNumber: receipt.l1BlockNumber.toString(),
      l1BlockTimestamp: receipt.l1BlockTimestamp.toString(),
    });
  }

  private recordSaturationRun(result: InboxBotSaturationRunResult, context: object): void {
    this.log.info(`Inbox saturation run ${result}`, { result, ...context });
  }
}
