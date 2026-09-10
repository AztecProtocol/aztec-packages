import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { createLogger } from '@aztec/aztec.js/log';
import { isL1ToL2MessageReady } from '@aztec/aztec.js/messaging';
import { type MinedTxReceipt, SortedTxStatuses, TxHash, TxStatus } from '@aztec/aztec.js/tx';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { DateProvider } from '@aztec/foundation/timer';
import type { BlockParameter, BlockTag } from '@aztec/stdlib/block';
import { siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { computeFeeJuiceMessageNullifier } from '@aztec/stdlib/messaging';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { Attributes, type Span, type TelemetryClient, execInSpan } from '@aztec/telemetry-client';
import type { EmbeddedWallet } from '@aztec/wallets/embedded';

import type { BotLifecycle } from './base_bot.js';
import {
  type BotConfig,
  MAX_INBOX_MESSAGES_PER_BATCH,
  MAX_INBOX_MESSAGES_PER_BUCKET,
  applyInboxModeDefaults,
  assertValidInboxConfig,
} from './config.js';
import { BotFactory } from './factory.js';
import {
  type InboxBotAnchorPolicy,
  type InboxBotBlockRelation,
  type InboxBotCheck,
  type InboxBotCheckResult,
  type InboxBotCompletionPolicy,
  type InboxBotL1BatchResult,
  InboxBotMetrics,
  type InboxBotMilestone,
  type InboxBotMode,
  type InboxBotObservedState,
  type InboxBotPublicExecutionResult,
  type InboxBotReason,
  type InboxBotSaturationRunResult,
  type InboxBotScenario,
  InboxBotScenarios,
  type InboxBotSimulationResult,
  type InboxBotStage,
} from './inbox_bot_metrics.js';
import { type InboxL1Producer, ViemInboxL1Producer } from './inbox_l1_producer.js';
import {
  type InboxConsumptionRequest,
  type InboxL2Consumer,
  WalletInboxL2Consumer,
  isAlreadyNullifiedError,
  isFeePaymentError,
  isMessageNotYetConsumableError,
  isRpcError,
} from './inbox_l2_consumer.js';
import {
  findMessageInsertionBlock,
  pinReadinessNodeToBlock,
  verifyL1ToL2MessageWitness,
} from './inbox_message_checks.js';
import {
  type L1ToL2MessageBatchReceipt,
  type L1ToL2MessageIntent,
  generateL1ToL2MessageIntents,
  validateL1ToL2MessageBatchBuckets,
} from './l1_to_l2_seeding.js';
import {
  type InboxBatchRecord,
  type InboxMessageRecord,
  type InboxMessageState,
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

/**
 * Cadence at which the bot polls the node for message observation, readiness and consumption receipts. Fixed
 * rather than configurable: it tracks how fast blocks appear, not how much work the operator asked for, and the
 * L1 batch cadence (`txIntervalSeconds`) is the knob that controls load.
 */
const CONSUMPTION_POLL_INTERVAL_MS = 1000;

/**
 * Consumption attempts the bot keeps in flight at once. An attempt simulates, proves and submits, which for the
 * private domain takes far longer than a poll, so it runs as a background job and only the cap bounds it.
 */
const MAX_CONCURRENT_CONSUMPTION_ATTEMPTS = 8;

/** Messages a single poll advances through one phase, bounding the RPC work one tick can do. */
const MAX_MESSAGES_PER_POLL = 64;

/**
 * Attempts a message gets before it is written off. A message that is not consumable yet does not spend one:
 * racing the block that absorbs the message is the expected case, not a failure.
 */
const MAX_CONSUMPTION_ATTEMPTS = 5;

/** Blocks the insertion-block search looks back over before it gives up and reports an unknown relation. */
const MAX_INSERTION_SEARCH_BLOCKS = 128;

/** How often finished batches are scanned for their replay probe. */
const REPLAY_PROBE_SCAN_INTERVAL_MS = 10_000;

/**
 * How long after a message completes the bot keeps looking for the historical readiness it never observed. A
 * public consumption routinely wins the race with the readiness poll, and the observation is worth finishing;
 * without a bound, a check that stays inconclusive would be retried for as long as the record survives.
 */
const READINESS_BACKFILL_WINDOW_MS = 5 * 60 * 1000;

/**
 * Span-only attribute keys. They correlate a trace with the records in the store and the lines in the log, and
 * are deliberately not metric attributes: a batch or message id has one sample and would make any series useless.
 */
const INBOX_BATCH_ID_SPAN_ATTRIBUTE = 'aztec.bot.inbox.batch_id';
const INBOX_MESSAGE_ID_SPAN_ATTRIBUTE = 'aztec.bot.inbox.message_id';

/**
 * Stage each milestone closes, and the message timestamp that ends it. Every one of them starts at the batch's
 * mined timestamp. Milestones absent from this map close no stage: a timeout or a failure is an outcome, never a
 * latency sample.
 */
const MILESTONE_STAGES: Partial<
  Record<InboxBotMilestone, { stage: InboxBotStage; endedAt: (message: InboxMessageRecord) => number | undefined }>
> = {
  observed: { stage: 'l1_mined_to_observed', endedAt: message => message.observedAt },
  ready: { stage: 'l1_mined_to_ready', endedAt: message => message.readyAt },
  included: { stage: 'l1_mined_to_included', endedAt: message => message.includedAt },
  completed: { stage: 'l1_mined_to_completed', endedAt: message => message.completedAt },
};

/**
 * Chain tip the bot labels its completion metrics with. `followChain: NONE` is rejected for inbox mode, so it
 * only reaches here when a caller constructs the bot directly; proposed inclusion is what it then reports.
 */
function toCompletionPolicy(followChain: BotConfig['followChain']): InboxBotCompletionPolicy {
  switch (followChain) {
    case 'CHECKPOINTED':
      return 'checkpointed';
    case 'PROVEN':
      return 'proven';
    default:
      return 'proposed';
  }
}

/**
 * Outcome of a readiness check pinned to one block. `indeterminate` covers everything that moved under the check
 * or could not be read, and counts as neither a pass nor a failure.
 */
type ReadinessOutcome = 'ready' | 'not_ready' | 'invalid' | 'indeterminate';

/** Result of a pinned readiness check, naming the block it was answered at when there was one. */
interface ReadinessResult {
  outcome: ReadinessOutcome;
  blockNumber?: BlockNumber;
  detail?: string;
}

/** Collaborators the inbox bot runs on. `create` builds the production ones; tests substitute their own. */
export interface InboxBotDeps {
  node: AztecNode;
  wallet: EmbeddedWallet;
  defaultAccountAddress: AztecAddress;
  /** Contract the messages are addressed to and consumed through, which their nullifiers are siloed with. */
  contractAddress: AztecAddress;
  producer: InboxL1Producer;
  consumer: InboxL2Consumer;
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
 * so a restart reconciles rather than resends.
 */
export class InboxBot implements BotLifecycle {
  protected log = createLogger('bot:inbox');

  public readonly node: AztecNode;
  public readonly wallet: EmbeddedWallet;
  public readonly defaultAccountAddress: AztecAddress;
  public config: BotConfig;

  private readonly contractAddress: AztecAddress;
  private readonly producer: InboxL1Producer;
  private readonly consumer: InboxL2Consumer;
  private readonly store: InboxStore;
  private readonly metrics: InboxBotMetrics;
  private readonly dateProvider: DateProvider;
  private readonly syncChainTip?: BlockTag;
  private readonly anchorPolicy: InboxBotAnchorPolicy;
  private readonly completionPolicy: InboxBotCompletionPolicy;

  private readonly productionPromise: RunningPromise;
  private readonly consumptionPromise: RunningPromise;

  private running = false;
  private healthy = true;
  private consumptionHealthy = true;
  /** Guards the single L1 submission the bot allows in flight, however the step was triggered. */
  private stepInFlight = false;
  private consumeStepInFlight = false;
  private consecutiveProductionFailures = 0;
  private consecutiveConsumptionFailures = 0;
  /**
   * Consumption attempts running in the background, keyed by message id. Membership is what guarantees a message
   * never has two attempts in flight, whatever the persisted state says.
   */
  private readonly attemptsInFlight = new Map<string, Promise<void>>();
  /** Replay probes running in the background, keyed by batch id. */
  private readonly probesInFlight = new Map<string, Promise<void>>();
  /** Domain the next produced message is assigned in `mixed` mode, mirroring the persisted cursor. */
  private nextMode?: InboxBotMode;
  private lastReplayScanAt = 0;
  private attemptsReconciled = false;
  /**
   * Messages that completed before their historical readiness was ever observed, and when they completed. Held in
   * memory only: the observation is a nicety, and a restart that loses it costs one latency sample, not state.
   */
  private readonly readinessBackfill = new Map<string, number>();

  public constructor(deps: InboxBotDeps) {
    this.node = deps.node;
    this.wallet = deps.wallet;
    this.defaultAccountAddress = deps.defaultAccountAddress;
    this.contractAddress = deps.contractAddress;
    this.producer = deps.producer;
    this.consumer = deps.consumer;
    this.store = deps.store;
    this.config = deps.config;
    this.dateProvider = deps.dateProvider ?? new DateProvider();
    this.syncChainTip = deps.syncChainTip;
    this.anchorPolicy = deps.syncChainTip ?? 'latest';
    this.completionPolicy = toCompletionPolicy(deps.config.followChain);
    this.metrics = new InboxBotMetrics(deps.telemetry, this.anchorPolicy, this.completionPolicy);

    this.productionPromise = new RunningPromise(
      () => this.produceStep(),
      this.log,
      this.config.txIntervalSeconds * 1000,
    );
    this.consumptionPromise = new RunningPromise(() => this.consumeStep(), this.log, CONSUMPTION_POLL_INTERVAL_MS);
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
      contractAddress: contract.address,
      producer,
      consumer: new WalletInboxL2Consumer(wallet, contract, defaultAccountAddress, effectiveConfig),
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
    this.metrics.start(() => this.readObservedState());
    this.productionPromise.start();
    this.consumptionPromise.start();
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
    await this.consumptionPromise.stop();
    // Attempts run outside the poll, so the store must stay open until the last of them has written its outcome.
    await this.waitForBackgroundWork();
    // Removed rather than left armed: `BotRunner.update()` recreates the bot, and two callbacks reading two
    // stores would export the same gauges twice.
    this.metrics.stop();
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
    return this.healthy && this.consumptionHealthy;
  }

  /**
   * Resolves once every consumption attempt and replay probe running outside the poll has finished. Exposed so a
   * caller driving the bot off its own clock can wait for the work a step started.
   */
  public async waitForBackgroundWork(): Promise<void> {
    while (this.attemptsInFlight.size > 0 || this.probesInFlight.size > 0) {
      await Promise.allSettled([...this.attemptsInFlight.values(), ...this.probesInFlight.values()]);
    }
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
  private produceBatch(scenario: InboxBotScenario, count: number): Promise<InboxBatchRecord | undefined> {
    return execInSpan(this.metrics.tracer, 'InboxBot.produceBatch', span =>
      this.produceBatchInSpan(span, scenario, count),
    );
  }

  private async produceBatchInSpan(
    span: Span,
    scenario: InboxBotScenario,
    count: number,
  ): Promise<InboxBatchRecord | undefined> {
    span.setAttribute(Attributes.BOT_INBOX_SCENARIO, scenario);
    const intents = await generateL1ToL2MessageIntents(count);
    const modes = await this.assignModes(count);
    const { batch } = await this.store.reserveBatch({
      scenario,
      intents: intents.map((intent, index) => ({
        content: intent.content.toString(),
        secret: intent.secret.toString(),
        secretHash: intent.secretHash.toString(),
        mode: modes.assigned[index],
      })),
      nextMode: modes.next,
    });
    // Ids are span-only: they identify a single batch and would blow up the cardinality of any metric label.
    span.setAttribute(INBOX_BATCH_ID_SPAN_ATTRIBUTE, batch.batchId);

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
    const batch = await this.store.getBatch(batchId);
    if (!batch) {
      this.log.error(`Cannot resolve an L1 receipt for an unknown inbox batch`, { batchId });
      return undefined;
    }
    const messages = await this.store.getBatchMessages(batchId);

    if (receipt.status === 'reverted') {
      await this.store.recordBatchFailed(batchId, 'l1_revert');
      await this.recordL1Batch(batch, 'reverted', receipt);
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
      await this.recordCheck('event_integrity', 'failed', { batchId, mismatches });
      const reason: InboxBotReason = mismatches.some(m => m.kind === 'indices' || m.kind === 'count')
        ? 'bucket_mismatch'
        : 'api_inconsistency';
      await this.store.recordBatchFailed(batchId, reason);
      this.recordFailure(reason, { batchId, txHash: receipt.txHash, mismatches });
      this.log.error(`Inbox batch receipt does not match its persisted intent`, { batchId, mismatches });
      return undefined;
    }
    await this.recordCheck('event_integrity', 'passed', { batchId });

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

    await this.recordL1Batch(mined, 'success', receipt);
    await this.checkBucketRollover(mined, receipt);
    for (const message of await this.store.getBatchMessages(batchId)) {
      await this.recordMessageMilestone(message, 'sent');
    }
    return mined;
  }

  /**
   * Checks how a saturation batch was laid out across Inbox buckets: the buckets it used run in ascending
   * sequence, and one only rolls over where the previous one filled up. Every expectation comes from the receipt
   * and from the Inbox's own bucket counts at the batch's L1 block, so a batch that started midway through a
   * bucket someone else had already filled is judged on where its rollover actually belonged.
   *
   * Ordinary batches are much smaller than a bucket and can neither fill nor roll one over, so the check is only
   * meaningful for the full-bucket saturation batch.
   */
  private async checkBucketRollover(batch: InboxBatchRecord, receipt: L1ToL2MessageBatchReceipt): Promise<void> {
    if (batch.scenario !== 'saturation' || batch.bucketProbedAt !== undefined) {
      return;
    }
    const totals = new Map<bigint, number | undefined>();
    for (const seq of new Set(receipt.messages.map(message => message.bucketSeq))) {
      totals.set(seq, await this.producer.getBucketMessageCount(seq, receipt.l1BlockNumber));
    }
    const verdict = validateL1ToL2MessageBatchBuckets({
      messages: receipt.messages,
      bucketTotals: totals,
      bucketCapacity: MAX_INBOX_MESSAGES_PER_BUCKET,
    });
    const buckets = verdict.buckets.map(bucket => ({
      seq: bucket.seq.toString(),
      messagesInBatch: bucket.messagesInBatch,
      totalInBucket: bucket.totalInBucket,
    }));

    if (verdict.outcome === 'indeterminate') {
      // Neither evidence for nor against the Inbox: recorded as no check at all, which also leaves the run short
      // of a full success, since `lastSuccessAt` means every check passed.
      this.log.warn(`Inbox bucket layout check was inconclusive`, {
        batchId: batch.batchId,
        detail: verdict.detail,
        buckets,
      });
      return;
    }
    if (verdict.outcome === 'invalid') {
      await this.recordCheck('bucket_rollover', 'failed', {
        batchId: batch.batchId,
        buckets,
        mismatches: verdict.mismatches,
      });
      this.recordFailure('bucket_mismatch', { batchId: batch.batchId, mismatches: verdict.mismatches });
    } else {
      await this.recordCheck('bucket_rollover', 'passed', { batchId: batch.batchId, buckets });
    }
    await this.store.recordBatchProbe(batch.batchId, 'bucket_rollover');
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
      await this.recordMessageMilestone(message, 'timed_out');
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

    // A run only succeeded if every message was consumed *and* every check the run carried passed, including the
    // bucket layout check. A check that never resolved leaves the run short of a success rather than passing by
    // default, so `lastSuccessAt` always means the whole run was verified.
    const batch = await this.store.getBatch(schedule.inFlightBatchId);
    const consumed = messages.every(message => message.state === 'completed');
    const checked = batch !== undefined && batch.failedChecks.length === 0 && batch.bucketProbedAt !== undefined;
    const succeeded = consumed && checked;
    await this.store.updateSchedule({
      runInFlight: false,
      inFlightBatchId: undefined,
      lastSuccessAt: succeeded ? this.dateProvider.now() : schedule.lastSuccessAt,
    });
    this.recordSaturationRun(succeeded ? 'success' : 'failed', {
      batchId: schedule.inFlightBatchId,
      consumed,
      failedChecks: batch?.failedChecks,
      bucketChecked: batch?.bucketProbedAt !== undefined,
    });
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
   * Assigns the L2 domain each message of a batch is consumed through. `mixed` alternates on every message, so a
   * batch of one still alternates across batches. The cursor is returned alongside the assignment so it can be
   * persisted with the reservation: a restart then continues the alternation instead of starting over at `public`.
   */
  private async assignModes(count: number): Promise<{ assigned: InboxBotMode[]; next?: InboxBotMode }> {
    if (this.config.inboxConsumeMode !== 'mixed') {
      return { assigned: Array(count).fill(this.config.inboxConsumeMode) };
    }
    let next = this.nextMode ?? (await this.store.getNextMode()) ?? 'public';
    const assigned: InboxBotMode[] = [];
    for (let i = 0; i < count; i++) {
      assigned.push(next);
      next = next === 'public' ? 'private' : 'public';
    }
    this.nextMode = next;
    return { assigned, next };
  }

  /**
   * One turn of the consumption clock: observe messages the node has ingested, follow historical readiness,
   * dispatch consumption attempts and poll the receipts of the ones already sent. Runs on a fixed ~1s cadence,
   * independently of the L1 production interval.
   *
   * Nothing here waits on proving: an attempt is a background job, so a slow private proof cannot hold up
   * observation or receipt polling for the other messages. It never throws, so an expected retry never reaches
   * `BotRunner`'s consecutive-error streak.
   */
  public async consumeStep(): Promise<void> {
    if (this.consumeStepInFlight) {
      this.log.debug(`Skipping inbox consumption step, one is already in flight`);
      return;
    }
    this.consumeStepInFlight = true;
    try {
      await this.reconcileInterruptedAttempts();
      const active = await this.store.getActiveMessages();

      const observed = await this.observeMessages(active.filter(message => message.state === 'awaiting_l1'));
      await this.trackReadiness(
        [
          ...active.filter(message => message.state !== 'awaiting_l1'),
          ...observed,
          ...(await this.messagesAwaitingReadinessBackfill()),
        ].filter(message => message.readyAt === undefined),
      );
      // Receipts are polled before attempts are dispatched, so a transaction found dropped in this poll is
      // replaced by a fresh attempt in the same turn rather than a second later.
      await this.pollConsumptionReceipts(active.filter(message => message.state === 'sent'));
      await this.dispatchAttempts([...observed, ...active]);
      await this.scanReplayProbes();

      this.consecutiveConsumptionFailures = 0;
      this.consumptionHealthy = true;
    } catch (err) {
      this.registerConsumptionFailure(err);
    } finally {
      this.consumeStepInFlight = false;
    }
  }

  /**
   * Writes off attempts that a restart interrupted. A message left in `preparing` may or may not have had a
   * transaction submitted for it and the bot has no hash to follow, so retrying it could spend the message twice;
   * it is reported as a failed attempt instead. Messages in `sent` keep their hash and are simply polled again.
   */
  private async reconcileInterruptedAttempts(): Promise<void> {
    if (this.attemptsReconciled) {
      return;
    }
    this.attemptsReconciled = true;
    for (const message of await this.store.getMessagesByState('preparing')) {
      this.log.warn(`Abandoning an inbox consumption attempt whose transaction was never recorded`, {
        messageId: message.messageId,
        batchId: message.batchId,
        mode: message.mode,
      });
      this.recordFailure('l2_drop', { messageId: message.messageId, detail: 'attempt interrupted before broadcast' });
      const failed = await this.store.transitionMessage(message.messageId, 'failed', {
        failedAt: this.dateProvider.now(),
        failureReason: 'l2_drop',
      });
      await this.recordMessageMilestone(failed, 'failed');
    }
  }

  /**
   * Moves messages the node has ingested to `observed` and checks that the index it reports is the one the Inbox
   * event assigned on L1. Returns the messages that became observed in this poll, so their consumption can start
   * in the same turn rather than a second later.
   */
  private async observeMessages(messages: InboxMessageRecord[]): Promise<InboxMessageRecord[]> {
    const observed: InboxMessageRecord[] = [];
    for (const message of messages.slice(0, MAX_MESSAGES_PER_POLL)) {
      if (message.msgHash === undefined || message.globalLeafIndex === undefined) {
        continue;
      }
      await this.probeUnknownMessage(message.batchId);

      const msgHash = Fr.fromHexString(message.msgHash);
      const expected = BigInt(message.globalLeafIndex);
      let index = await this.node.getL1ToL2MessageIndex(msgHash);
      if (index === undefined) {
        this.log.debug(`Inbox message not indexed by the node yet`, {
          messageId: message.messageId,
          msgHash: message.msgHash,
        });
        continue;
      }
      if (index !== expected) {
        // Read it once more before calling the node inconsistent: a read that raced an L1 reorg is not evidence.
        index = await this.node.getL1ToL2MessageIndex(msgHash);
      }
      if (index !== expected) {
        await this.recordCheck('index_match', 'failed', {
          batchId: message.batchId,
          messageId: message.messageId,
          expected: expected.toString(),
          reported: index?.toString(),
        });
        this.recordFailure('api_inconsistency', { messageId: message.messageId, check: 'index_match' });
        const failed = await this.store.transitionMessage(message.messageId, 'failed', {
          failedAt: this.dateProvider.now(),
          failureReason: 'api_inconsistency',
        });
        await this.recordMessageMilestone(failed, 'failed');
        continue;
      }

      await this.recordCheck('index_match', 'passed', { batchId: message.batchId, messageId: message.messageId });
      const updated = await this.store.transitionMessage(message.messageId, 'observed', {
        observedAt: this.dateProvider.now(),
      });
      await this.recordMessageMilestone(updated, 'observed');
      observed.push(updated);
    }
    return observed;
  }

  /**
   * Asks the node for a hash it cannot know about, once per batch. A node that answers with an index for a message
   * nobody sent is inventing messages, which no other check would catch.
   */
  private async probeUnknownMessage(batchId: string): Promise<void> {
    const batch = await this.store.getBatch(batchId);
    if (!batch || batch.unknownMessageProbedAt !== undefined) {
      return;
    }
    const index = await this.node.getL1ToL2MessageIndex(Fr.random());
    if (index === undefined) {
      await this.recordCheck('unknown_message', 'passed', { batchId });
    } else {
      await this.recordCheck('unknown_message', 'failed', { batchId, reported: index.toString() });
      this.recordFailure('api_inconsistency', { batchId, check: 'unknown_message' });
    }
    await this.store.recordBatchProbe(batchId, 'unknown_message');
  }

  /**
   * Messages that completed before their historical readiness was ever observed. Consuming a message publicly
   * routinely wins the race with the readiness poll, and the plan requires that observation to be finished rather
   * than dropped; the window bounds a check that never resolves.
   */
  private async messagesAwaitingReadinessBackfill(): Promise<InboxMessageRecord[]> {
    const now = this.dateProvider.now();
    const messages: InboxMessageRecord[] = [];
    for (const [messageId, completedAt] of this.readinessBackfill) {
      if (now - completedAt > READINESS_BACKFILL_WINDOW_MS) {
        this.readinessBackfill.delete(messageId);
        continue;
      }
      const message = await this.store.getMessage(messageId);
      if (message === undefined || message.readyAt !== undefined) {
        this.readinessBackfill.delete(messageId);
        continue;
      }
      messages.push(message);
    }
    return messages;
  }

  /**
   * Follows historical readiness for every message that has not reached it, whichever domain it belongs to. The
   * public path does not wait for readiness, but the observation is still finished so the latency is recorded;
   * the private path uses it as its gate.
   */
  private async trackReadiness(messages: InboxMessageRecord[]): Promise<void> {
    for (const message of messages.slice(0, MAX_MESSAGES_PER_POLL)) {
      if (message.msgHash === undefined || message.globalLeafIndex === undefined) {
        continue;
      }
      const result = await this.checkReadiness(message);
      if (result.outcome === 'not_ready') {
        this.log.debug(`Inbox message not ready yet`, {
          messageId: message.messageId,
          blockNumber: result.blockNumber,
        });
        continue;
      }
      if (result.outcome === 'indeterminate') {
        this.log.debug(`Inbox readiness check was inconclusive`, {
          messageId: message.messageId,
          detail: result.detail,
        });
        continue;
      }
      if (result.outcome === 'invalid') {
        await this.recordCheck('readiness_witness', 'failed', {
          batchId: message.batchId,
          messageId: message.messageId,
          blockNumber: result.blockNumber,
          detail: result.detail,
        });
        this.recordFailure('invalid_witness', { messageId: message.messageId, detail: result.detail });
      } else {
        await this.recordCheck('readiness_witness', 'passed', {
          batchId: message.batchId,
          messageId: message.messageId,
          blockNumber: result.blockNumber,
        });
      }
      // Readiness itself was positive either way, so the message is let through: a witness that does not verify is
      // reported on its own, and the consumption attempt that follows says more about it than a silent timeout.
      const updated = await this.store.patchMessage(message.messageId, {
        readyAt: this.dateProvider.now(),
        readyBlockNumber: result.blockNumber?.toString(),
      });
      await this.recordMessageMilestone(updated, 'ready');
      this.readinessBackfill.delete(message.messageId);
    }
  }

  /**
   * Answers whether a message is consumable at one concrete block, and proves that answer against that block's
   * own header. The tip is resolved to a block number first and every read is pinned to it, so the two halves of
   * the readiness comparison cannot straddle a chain that moved; the block is re-read afterwards, and anything
   * that changed under the check is reported as inconclusive rather than as a failure.
   */
  private async checkReadiness(message: InboxMessageRecord, atBlock?: BlockNumber): Promise<ReadinessResult> {
    const msgHash = Fr.fromHexString(message.msgHash!);
    const target: BlockParameter = atBlock === undefined ? (this.syncChainTip ?? 'latest') : { number: atBlock };
    const block = await this.node.getBlockData(target);
    if (!block) {
      return { outcome: 'indeterminate', detail: 'no block at the requested tip' };
    }
    const blockNumber = block.header.globalVariables.blockNumber;

    if (!(await isL1ToL2MessageReady(pinReadinessNodeToBlock(this.node, blockNumber), msgHash))) {
      return { outcome: 'not_ready', blockNumber };
    }

    const witness = await this.node.getL1ToL2MessageMembershipWitness({ number: blockNumber }, msgHash);
    const verdict =
      witness === undefined
        ? 'missing'
        : await verifyL1ToL2MessageWitness({
            msgHash,
            witnessIndex: witness[0],
            siblingPath: witness[1].toBufferArray(),
            expectedIndex: BigInt(message.globalLeafIndex!),
            expectedRoot: block.header.state.l1ToL2MessageTree.root,
          });

    const after = await this.node.getBlockData({ number: blockNumber });
    if (!after || !after.blockHash.equals(block.blockHash)) {
      return { outcome: 'indeterminate', blockNumber, detail: 'the pinned block changed under the check' };
    }
    if (verdict === 'unverifiable') {
      return { outcome: 'indeterminate', blockNumber, detail: verdict };
    }
    return verdict === 'valid'
      ? { outcome: 'ready', blockNumber }
      : { outcome: 'invalid', blockNumber, detail: verdict };
  }

  /**
   * Starts consumption attempts for messages whose domain will accept them, up to the concurrency cap. A public
   * message starts as soon as the node has indexed it — the block being built may well absorb it, and losing that
   * race is an ordinary not-ready outcome. A private message waits for readiness, because its proof anchors at a
   * block that must already contain the message.
   *
   * Every candidate is re-read first: observation, readiness and receipt polling all move messages within the
   * same poll, and only a message that is still waiting for its one attempt may be dispatched.
   */
  private async dispatchAttempts(candidates: InboxMessageRecord[]): Promise<void> {
    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (seen.has(candidate.messageId) || this.attemptsInFlight.has(candidate.messageId)) {
        continue;
      }
      seen.add(candidate.messageId);

      const message = await this.store.getMessage(candidate.messageId);
      if (!message || (message.state !== 'observed' && message.state !== 'awaiting_anchor')) {
        continue;
      }
      if (message.mode === 'private' && message.readyAt === undefined) {
        if (message.state === 'observed') {
          await this.store.transitionMessage(message.messageId, 'awaiting_anchor');
        }
        continue;
      }
      if (this.attemptsInFlight.size >= MAX_CONCURRENT_CONSUMPTION_ATTEMPTS) {
        return;
      }
      const job = this.runConsumptionAttempt(message)
        .catch(err => this.registerConsumptionFailure(err))
        .finally(() => this.attemptsInFlight.delete(message.messageId));
      this.attemptsInFlight.set(message.messageId, job);
    }
  }

  /**
   * Runs one consumption attempt end to end. The message moves to `preparing` before anything is submitted, so a
   * restart can tell an attempt whose fate is unknown from one that never started, and to `sent` only once the
   * node has the transaction.
   */
  private runConsumptionAttempt(message: InboxMessageRecord): Promise<void> {
    return execInSpan(this.metrics.tracer, 'InboxBot.consumptionAttempt', span => {
      span.setAttributes({
        [Attributes.BOT_INBOX_MODE]: message.mode,
        [Attributes.BOT_INBOX_SCENARIO]: message.scenario,
        [INBOX_BATCH_ID_SPAN_ATTRIBUTE]: message.batchId,
        [INBOX_MESSAGE_ID_SPAN_ATTRIBUTE]: message.messageId,
      });
      return this.runConsumptionAttemptInSpan(message);
    });
  }

  private async runConsumptionAttemptInSpan(message: InboxMessageRecord): Promise<void> {
    const preparing = await this.store.transitionMessage(message.messageId, 'preparing');
    const request: InboxConsumptionRequest = {
      mode: preparing.mode,
      content: Fr.fromHexString(preparing.content),
      secret: Fr.fromHexString(preparing.secret),
      sender: EthAddress.fromString(preparing.sender!),
      leafIndex: new Fr(BigInt(preparing.globalLeafIndex!)),
    };

    let txHash: TxHash;
    try {
      txHash = await this.consumer.send(request);
    } catch (err) {
      await this.handleAttemptFailure(preparing, err);
      return;
    }

    this.recordSimulation('accepted', preparing);
    const sent = await this.store.transitionMessage(preparing.messageId, 'sent', {
      l2TxHash: txHash.toString(),
      attempts: preparing.attempts + 1,
    });
    this.log.verbose(`Sent inbox consumption transaction`, {
      messageId: sent.messageId,
      batchId: sent.batchId,
      mode: sent.mode,
      txHash: sent.l2TxHash,
      globalLeafIndex: sent.globalLeafIndex,
    });
    await this.checkAnchorAdvanced(sent, txHash);
  }

  /**
   * The wallet chooses the anchor block when it builds the transaction, which can be newer than the block the
   * readiness check was pinned to. When it is, readiness is validated there too, so the check describes the state
   * the transaction actually ran against. The anchor is only readable while the transaction is pending, so one
   * that mined immediately leaves this inconclusive.
   */
  private async checkAnchorAdvanced(message: InboxMessageRecord, txHash: TxHash): Promise<void> {
    if (message.readyBlockNumber === undefined) {
      return;
    }
    const anchor = await this.getPendingTxAnchorBlock(txHash);
    if (anchor === undefined || anchor <= Number(message.readyBlockNumber)) {
      return;
    }
    const result = await this.checkReadiness(message, anchor);
    if (result.outcome === 'ready') {
      await this.recordCheck('readiness_witness', 'passed', {
        batchId: message.batchId,
        messageId: message.messageId,
        blockNumber: anchor,
      });
    } else if (result.outcome !== 'indeterminate') {
      await this.recordCheck('readiness_witness', 'failed', {
        batchId: message.batchId,
        messageId: message.messageId,
        blockNumber: anchor,
        detail: result.detail ?? result.outcome,
      });
      this.recordFailure(result.outcome === 'not_ready' ? 'reorg' : 'invalid_witness', {
        messageId: message.messageId,
        blockNumber: anchor,
      });
    }
  }

  /** Block a still-pending transaction anchored at, or undefined when it cannot be read. */
  private async getPendingTxAnchorBlock(txHash: TxHash): Promise<BlockNumber | undefined> {
    try {
      const receipt = await this.node.getTxReceipt(txHash, { includePendingTx: true });
      return receipt?.isPending()
        ? receipt.tx?.data.constants.anchorBlockHeader.globalVariables.blockNumber
        : undefined;
    } catch (err) {
      this.log.debug(`Could not read the anchor block of ${txHash.toString()}`, { err });
      return undefined;
    }
  }

  /** Classifies a failed attempt and decides whether the message is retried or written off. */
  private async handleAttemptFailure(message: InboxMessageRecord, err: unknown): Promise<void> {
    const waiting: InboxMessageState = message.mode === 'private' ? 'awaiting_anchor' : 'observed';

    if (isMessageNotYetConsumableError(err)) {
      // Expected while the bot races the block that absorbs the message: the attempt cost a simulation and nothing
      // else. It retries on the next poll, does not spend an attempt, and never counts against the bot's health.
      this.recordSimulation('not_ready', message);
      this.log.debug(`Inbox message is not consumable yet`, { messageId: message.messageId, mode: message.mode });
      await this.store.transitionMessage(message.messageId, waiting);
      return;
    }

    this.recordSimulation('error', message);
    const attempts = message.attempts + 1;
    const reason: InboxBotReason = isAlreadyNullifiedError(err)
      ? // A message that is already nullified after an earlier attempt was reported dropped means that attempt
        // landed after all; on a first attempt it means something else spent a message only this bot holds.
        message.attempts > 0
        ? 'l2_drop'
        : 'invalid_consumption'
      : isRpcError(err)
        ? 'rpc'
        : 'simulation';

    this.recordFailure(reason, {
      messageId: message.messageId,
      batchId: message.batchId,
      mode: message.mode,
      attempts,
      feePayment: isFeePaymentError(err),
      err,
    });

    const terminal = reason === 'invalid_consumption' || reason === 'l2_drop' || attempts >= MAX_CONSUMPTION_ATTEMPTS;
    if (terminal) {
      const failed = await this.store.transitionMessage(message.messageId, 'failed', {
        attempts,
        failedAt: this.dateProvider.now(),
        failureReason: reason,
      });
      await this.recordMessageMilestone(failed, 'failed');
    } else {
      await this.store.transitionMessage(message.messageId, waiting, { attempts });
    }
    if (reason === 'rpc') {
      this.registerConsumptionFailure(err);
    }
  }

  /** Polls the receipts of consumption transactions already submitted, one message at a time. */
  private async pollConsumptionReceipts(messages: InboxMessageRecord[]): Promise<void> {
    for (const message of messages.slice(0, MAX_MESSAGES_PER_POLL)) {
      if (message.l2TxHash === undefined || this.attemptsInFlight.has(message.messageId)) {
        continue;
      }
      const receipt = await this.node.getTxReceipt(TxHash.fromString(message.l2TxHash), { includeTxEffect: true });
      if (!receipt || receipt.isPending()) {
        continue;
      }
      if (receipt.isDropped()) {
        await this.handleDroppedConsumption(message);
      } else if (receipt.isMined()) {
        if (receipt.hasExecutionReverted()) {
          await this.handleRevertedConsumption(message, receipt);
        } else {
          await this.completeConsumption(message, receipt);
        }
      }
    }
  }

  /**
   * A dropped transaction never spent anything, so the message goes back to waiting and is attempted again with a
   * fresh transaction. Its hash is cleared so a stale receipt can never be mistaken for the new attempt's.
   */
  private async handleDroppedConsumption(message: InboxMessageRecord): Promise<void> {
    this.recordFailure('l2_drop', {
      messageId: message.messageId,
      batchId: message.batchId,
      mode: message.mode,
      txHash: message.l2TxHash,
      attempts: message.attempts,
    });
    if (message.attempts >= MAX_CONSUMPTION_ATTEMPTS) {
      const failed = await this.store.transitionMessage(message.messageId, 'failed', {
        failedAt: this.dateProvider.now(),
        failureReason: 'l2_drop',
      });
      await this.recordMessageMilestone(failed, 'failed');
      return;
    }
    const waiting: InboxMessageState = message.mode === 'private' ? 'awaiting_anchor' : 'observed';
    await this.store.transitionMessage(message.messageId, waiting, { l2TxHash: undefined });
  }

  /**
   * Diagnoses a reverted consumption against the block it executed in. A message the block did not cover, or one
   * that was already spent, is an ordinary revert; a message that was present, unspent and consumed with the index
   * the Inbox reported is a correctness failure.
   *
   * A mined receipt carries no revert text, so this reads the chain rather than an error string. Fee and account
   * failures do not reach here: they fail the simulation, and are accounted at the attempt instead.
   */
  private async handleRevertedConsumption(message: InboxMessageRecord, receipt: MinedTxReceipt): Promise<void> {
    if (message.mode === 'public') {
      this.recordPublicExecution('reverted', message, receipt);
      // The simulation accepted this transaction, or it would never have been sent, so the sequencer's view of the
      // message differed from the one the node predicted for it.
      this.recordPredictionMismatch(message, receipt);
    }

    const covered = await this.wasMessageCoveredIn(message, receipt.blockNumber);
    const spentBefore = await this.wasMessageSpentBefore(message, receipt.blockNumber);
    const index = await this.node.getL1ToL2MessageIndex(Fr.fromHexString(message.msgHash!));
    const argumentsStillValid = index === BigInt(message.globalLeafIndex!);

    const reason: InboxBotReason =
      covered === true && spentBefore === false && argumentsStillValid ? 'invalid_consumption' : 'l2_revert';

    this.recordFailure(reason, {
      messageId: message.messageId,
      batchId: message.batchId,
      mode: message.mode,
      txHash: message.l2TxHash,
      blockNumber: receipt.blockNumber,
      covered,
      spentBefore,
      argumentsStillValid,
    });
    const failed = await this.store.transitionMessage(message.messageId, 'failed', {
      failedAt: this.dateProvider.now(),
      failureReason: reason,
    });
    await this.recordMessageMilestone(failed, 'failed');
  }

  /**
   * Records a successful consumption. Proposed inclusion is recorded the first time the transaction is seen in a
   * block, together with the nullifier check and the block relation; the message only becomes `completed` once the
   * receipt reaches the configured completion policy, which can be many blocks later.
   */
  private async completeConsumption(message: InboxMessageRecord, receipt: MinedTxReceipt): Promise<void> {
    let current = message;
    if (message.includedAt === undefined) {
      if (message.mode === 'public') {
        this.recordPublicExecution('success', message, receipt);
      }
      await this.checkConsumptionNullifier(message, receipt);
      const relation = await this.classifyBlockRelation(message, receipt);
      current = await this.store.patchMessage(message.messageId, {
        includedAt: this.dateProvider.now(),
        proposedInclusionBlockNumber: receipt.blockNumber.toString(),
        insertionBlockNumber: relation.insertionBlockNumber?.toString(),
        blockRelation: relation.relation,
      });
      await this.recordMessageMilestone(current, 'included');
    }

    if (!this.hasReachedCompletionPolicy(receipt.status)) {
      return;
    }
    const completed = await this.store.transitionMessage(current.messageId, 'completed', {
      completedAt: this.dateProvider.now(),
      completionBlockNumber: receipt.blockNumber.toString(),
    });
    if (completed.readyAt === undefined) {
      // Public consumption routinely beats the readiness poll; the observation is finished afterwards so its
      // latency is recorded rather than dropped.
      this.readinessBackfill.set(completed.messageId, this.dateProvider.now());
    }
    await this.recordMessageMilestone(completed, 'completed');
  }

  /** Checks that the consuming transaction's effects carry the nullifier this message's consumption must emit. */
  private async checkConsumptionNullifier(message: InboxMessageRecord, receipt: MinedTxReceipt): Promise<void> {
    if (!receipt.txEffect) {
      // The node served the receipt without its effects; there is nothing to check against, so nothing is recorded.
      this.log.debug(`Consumption receipt carried no tx effect`, { messageId: message.messageId });
      return;
    }
    const expected = await this.expectedConsumptionNullifier(message);
    if (receipt.txEffect.nullifiers.some(nullifier => nullifier.equals(expected))) {
      await this.recordCheck('consumption_nullifier', 'passed', {
        batchId: message.batchId,
        messageId: message.messageId,
      });
    } else {
      await this.recordCheck('consumption_nullifier', 'failed', {
        batchId: message.batchId,
        messageId: message.messageId,
        txHash: message.l2TxHash,
        blockNumber: receipt.blockNumber,
      });
      this.recordFailure('invalid_consumption', { messageId: message.messageId, check: 'consumption_nullifier' });
    }
  }

  /**
   * Works out whether the consumption landed in the very block that inserted the message. The consuming block is
   * checked for canonicality first, and an inconclusive search stays `unknown`: a public message losing the race
   * to the next block is the ordinary outcome, not a failure.
   */
  private async classifyBlockRelation(
    message: InboxMessageRecord,
    receipt: MinedTxReceipt,
  ): Promise<{ relation: InboxBotBlockRelation; insertionBlockNumber?: BlockNumber }> {
    const block = await this.node.getBlockData({ number: receipt.blockNumber });
    if (!block || !block.blockHash.equals(receipt.blockHash)) {
      return { relation: 'unknown' };
    }
    const insertion = await findMessageInsertionBlock(
      this.node,
      BigInt(message.globalLeafIndex!),
      receipt.blockNumber,
      MAX_INSERTION_SEARCH_BLOCKS,
    );
    if (insertion === undefined) {
      return { relation: 'unknown' };
    }
    return {
      relation: insertion === receipt.blockNumber ? 'same_block' : 'later_block',
      insertionBlockNumber: insertion,
    };
  }

  /** Whether the given block's L1→L2 message tree had grown past this message's index. */
  private async wasMessageCoveredIn(
    message: InboxMessageRecord,
    blockNumber: BlockNumber,
  ): Promise<boolean | undefined> {
    const block = await this.node.getBlockData({ number: blockNumber });
    return block === undefined
      ? undefined
      : BigInt(block.header.state.l1ToL2MessageTree.nextAvailableLeafIndex) > BigInt(message.globalLeafIndex!);
  }

  /** Whether this message's consumption nullifier was already in the tree before the given block ran. */
  private async wasMessageSpentBefore(
    message: InboxMessageRecord,
    blockNumber: BlockNumber,
  ): Promise<boolean | undefined> {
    if (blockNumber <= 1) {
      return false;
    }
    const nullifier = await this.expectedConsumptionNullifier(message);
    const [found] = await this.node.findLeavesIndexes(
      { number: BlockNumber(blockNumber - 1) },
      MerkleTreeId.NULLIFIER_TREE,
      [nullifier],
    );
    return found !== undefined;
  }

  /**
   * The siloed nullifier a successful consumption of this message emits. `TestContract` consumes with a single
   * secret field, which is the derivation {@link computeFeeJuiceMessageNullifier} implements; the kernel then
   * silos it with the consuming contract's address.
   */
  private async expectedConsumptionNullifier(message: InboxMessageRecord): Promise<Fr> {
    const inner = await computeFeeJuiceMessageNullifier(
      Fr.fromHexString(message.msgHash!),
      Fr.fromHexString(message.secret),
    );
    return await siloNullifier(this.contractAddress, inner);
  }

  /** Whether a mined receipt has reached the chain tip the operator configured as completion. */
  private hasReachedCompletionPolicy(status: TxStatus): boolean {
    if (this.config.followChain === 'NONE') {
      return true;
    }
    return SortedTxStatuses.indexOf(status) >= SortedTxStatuses.indexOf(TxStatus[this.config.followChain]);
  }

  /**
   * Looks for batches whose messages have all resolved and runs their replay probe. Scanned on its own slower
   * clock: it reads every batch record, and nothing about it is latency sensitive.
   */
  private async scanReplayProbes(): Promise<void> {
    const now = this.dateProvider.now();
    if (now - this.lastReplayScanAt < REPLAY_PROBE_SCAN_INTERVAL_MS) {
      return;
    }
    this.lastReplayScanAt = now;

    for (const batch of await this.store.getBatchesPendingReplayProbe()) {
      if (this.probesInFlight.has(batch.batchId)) {
        continue;
      }
      const messages = await this.store.getBatchMessages(batch.batchId);
      if (messages.length === 0 || messages.some(message => !isTerminalInboxMessageState(message.state))) {
        continue;
      }
      const spent = messages.find(message => message.state === 'completed' && message.msgHash !== undefined);
      if (!spent) {
        // Nothing in the batch was ever consumed, so there is no spent message to try to replay.
        await this.store.recordBatchProbe(batch.batchId, 'replay');
        continue;
      }
      if (now - batch.createdAt > this.config.l1ToL2MessageTimeoutSeconds * 1000) {
        this.log.warn(`Giving up on the replay probe for a batch whose nullifier never became visible`, {
          batchId: batch.batchId,
        });
        await this.store.recordBatchProbe(batch.batchId, 'replay');
        continue;
      }
      this.probesInFlight.set(
        batch.batchId,
        this.runReplayProbe(batch.batchId, spent)
          .catch(err => this.registerConsumptionFailure(err))
          .finally(() => this.probesInFlight.delete(batch.batchId)),
      );
    }
  }

  /**
   * Simulates consuming an already-spent message a second time, through the domain it was *not* consumed in, and
   * requires the specific duplicate-nullifier rejection. The simulation only runs once the anchor it will be
   * answered at actually contains the spending nullifier, since before that a rejection would prove nothing. Any
   * other error leaves the probe unresolved and it is tried again, so an unrelated failure can never pass as
   * replay protection.
   */
  private runReplayProbe(batchId: string, message: InboxMessageRecord): Promise<void> {
    return execInSpan(this.metrics.tracer, 'InboxBot.replayProbe', span => {
      span.setAttributes({
        [Attributes.BOT_INBOX_CHECK]: 'replay_rejection',
        [INBOX_BATCH_ID_SPAN_ATTRIBUTE]: batchId,
        [INBOX_MESSAGE_ID_SPAN_ATTRIBUTE]: message.messageId,
      });
      return this.runReplayProbeInSpan(batchId, message);
    });
  }

  private async runReplayProbeInSpan(batchId: string, message: InboxMessageRecord): Promise<void> {
    const opposite: InboxBotMode = message.mode === 'public' ? 'private' : 'public';
    // A private simulation is answered at the wallet's sync tip; a public one at the node's latest state.
    const anchor: BlockParameter = opposite === 'private' ? (this.syncChainTip ?? 'latest') : 'latest';
    const nullifier = await this.expectedConsumptionNullifier(message);
    const [spent] = await this.node.findLeavesIndexes(anchor, MerkleTreeId.NULLIFIER_TREE, [nullifier]);
    if (spent === undefined) {
      this.log.debug(`Deferring the replay probe until the spending nullifier is visible`, {
        batchId,
        messageId: message.messageId,
      });
      return;
    }

    const request: InboxConsumptionRequest = {
      mode: opposite,
      content: Fr.fromHexString(message.content),
      secret: Fr.fromHexString(message.secret),
      sender: EthAddress.fromString(message.sender!),
      leafIndex: new Fr(BigInt(message.globalLeafIndex!)),
    };

    try {
      await this.consumer.simulate(request);
    } catch (err) {
      if (isAlreadyNullifiedError(err)) {
        await this.recordCheck('replay_rejection', 'passed', { batchId, messageId: message.messageId, mode: opposite });
        await this.store.recordBatchProbe(batchId, 'replay');
      } else {
        this.log.warn(`Replay probe was inconclusive; it will be tried again`, {
          batchId,
          messageId: message.messageId,
          mode: opposite,
          err,
        });
      }
      return;
    }

    await this.recordCheck('replay_rejection', 'failed', { batchId, messageId: message.messageId, mode: opposite });
    this.recordFailure('replay_accepted', { batchId, messageId: message.messageId, mode: opposite });
    await this.store.recordBatchProbe(batchId, 'replay');
  }

  private registerConsumptionFailure(err: unknown): void {
    this.consecutiveConsumptionFailures++;
    this.log.error(`Inbox bot consumption step failed`, {
      consecutiveFailures: this.consecutiveConsumptionFailures,
      err,
    });
    if (
      this.config.maxConsecutiveErrors > 0 &&
      this.consecutiveConsumptionFailures >= this.config.maxConsecutiveErrors
    ) {
      this.consumptionHealthy = false;
    }
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

  /**
   * Snapshot of the bot's reconciled durable state for the observable gauges. Read on every collection rather
   * than kept as an in-memory tally, so the gauges survive a restart with the state they describe.
   */
  private async readObservedState(): Promise<InboxBotObservedState> {
    const now = this.dateProvider.now();
    const active = await this.store.getActiveMessages();
    const pending = InboxBotScenarios.map(scenario => {
      const messages = active.filter(message => message.scenario === scenario);
      const oldest = Math.min(...messages.map(message => message.createdAt));
      return {
        scenario,
        count: messages.length,
        oldestAgeSeconds: messages.length === 0 ? 0 : Math.max(0, (now - oldest) / 1000),
      };
    });

    const schedule = await this.store.getSchedule();
    return {
      pending,
      saturation: {
        enabled: schedule?.enabled ?? false,
        lastSuccessTimestampSeconds: (schedule?.lastSuccessAt ?? 0) / 1000,
        nextDueTimestampSeconds: schedule?.enabled ? schedule.nextDueAt / 1000 : 0,
      },
    };
  }

  /**
   * Records the outcome of one semantic check. A failure is also persisted against the batch it belongs to, so a
   * run's outcome can be judged on every check having passed rather than only on its messages being consumed.
   */
  private async recordCheck(
    check: InboxBotCheck,
    result: InboxBotCheckResult,
    context: Record<string, unknown> & { batchId: string },
  ): Promise<void> {
    this.metrics.recordCheck(check, result);
    if (result === 'passed') {
      this.log.debug(`Inbox check ${check} passed`, { check, result, ...context });
      return;
    }
    this.log.warn(`Inbox check ${check} failed`, { check, result, ...context });
    await this.store.recordCheckFailure(context.batchId, check);
  }

  private recordFailure(reason: InboxBotReason, context: object): void {
    this.metrics.recordFailure(reason);
    this.log.warn(`Inbox bot failure`, { reason, ...context });
  }

  /**
   * Emits a message milestone and the stage latency it closes, at most once per message. The persisted markers
   * are what make that hold across a restart: a message reloaded from the store already names the milestones and
   * stages handed to the instruments, and they are not exported again.
   */
  private async recordMessageMilestone(message: InboxMessageRecord, milestone: InboxBotMilestone): Promise<void> {
    if (message.exportedMilestones.includes(milestone)) {
      return;
    }
    this.metrics.recordMessageMilestone(message, milestone, message.blockRelation);

    const timing = MILESTONE_STAGES[milestone];
    const endedAt = timing?.endedAt(message);
    const stages: InboxBotStage[] = [];
    if (
      timing !== undefined &&
      endedAt !== undefined &&
      message.minedAt !== undefined &&
      !message.exportedStages.includes(timing.stage)
    ) {
      this.metrics.recordStage(timing.stage, message, (endedAt - message.minedAt) / 1000);
      stages.push(timing.stage);
    }
    await this.store.markExported(message.messageId, { milestones: [milestone], stages });

    if (milestone === 'completed') {
      await this.logCompletion(message);
      return;
    }
    this.log.debug(`Inbox message reached ${milestone}`, {
      milestone,
      messageId: message.messageId,
      batchId: message.batchId,
      scenario: message.scenario,
      mode: message.mode,
      msgHash: message.msgHash,
      globalLeafIndex: message.globalLeafIndex,
      bucketSeq: message.bucketSeq,
      l2TxHash: message.l2TxHash,
      blockRelation: message.blockRelation,
      insertionBlockNumber: message.insertionBlockNumber,
      proposedInclusionBlockNumber: message.proposedInclusionBlockNumber,
      completionBlockNumber: message.completionBlockNumber,
    });
  }

  /**
   * The one structured record of a message's whole journey, emitted when it completes. Everything too granular
   * for a metric label lives here: ids, transaction and block hashes, indices, the bucket, and every stage
   * timestamp with the latency it closes. The claim secret is deliberately absent, as it is from every other log.
   */
  private async logCompletion(message: InboxMessageRecord): Promise<void> {
    const batch = await this.store.getBatch(message.batchId);
    this.log.info(`Inbox message completed`, {
      messageId: message.messageId,
      batchId: message.batchId,
      scenario: message.scenario,
      mode: message.mode,
      msgHash: message.msgHash,
      globalLeafIndex: message.globalLeafIndex,
      bucketSeq: message.bucketSeq,
      attempts: message.attempts,
      anchorPolicy: this.anchorPolicy,
      completionPolicy: this.completionPolicy,
      blockRelation: message.blockRelation,
      l1TxHash: batch?.l1TxHash,
      l1BlockNumber: batch?.l1BlockNumber,
      l1BlockHash: batch?.l1BlockHash,
      l1BlockTimestamp: batch?.l1BlockTimestamp,
      l1GasUsed: batch?.gasUsed,
      l2TxHash: message.l2TxHash,
      readyBlockNumber: message.readyBlockNumber,
      insertionBlockNumber: message.insertionBlockNumber,
      proposedInclusionBlockNumber: message.proposedInclusionBlockNumber,
      completionBlockNumber: message.completionBlockNumber,
      sentAt: message.sentAt,
      minedAt: message.minedAt,
      observedAt: message.observedAt,
      readyAt: message.readyAt,
      includedAt: message.includedAt,
      completedAt: message.completedAt,
      submissionToMinedSeconds: secondsBetween(message.sentAt, message.minedAt),
      minedToObservedSeconds: secondsBetween(message.minedAt, message.observedAt),
      minedToReadySeconds: secondsBetween(message.minedAt, message.readyAt),
      minedToIncludedSeconds: secondsBetween(message.minedAt, message.includedAt),
      minedToCompletedSeconds: secondsBetween(message.minedAt, message.completedAt),
    });
  }

  private recordSimulation(result: InboxBotSimulationResult, message: InboxMessageRecord): void {
    this.metrics.recordSimulation(result, message);
    this.log.debug(`Inbox consumption simulation ${result}`, {
      result,
      messageId: message.messageId,
      batchId: message.batchId,
      mode: message.mode,
      scenario: message.scenario,
    });
  }

  private recordPublicExecution(
    result: InboxBotPublicExecutionResult,
    message: InboxMessageRecord,
    receipt: MinedTxReceipt,
  ): void {
    this.metrics.recordPublicExecution(result, message.scenario);
    this.log.info(`Inbox public consumption ${result}`, {
      result,
      messageId: message.messageId,
      batchId: message.batchId,
      scenario: message.scenario,
      txHash: message.l2TxHash,
      blockNumber: receipt.blockNumber,
    });
  }

  /** A consumption whose simulation was accepted and whose execution then reverted: the two views disagreed. */
  private recordPredictionMismatch(message: InboxMessageRecord, receipt: MinedTxReceipt): void {
    this.metrics.recordPredictionMismatch(message.scenario);
    this.log.warn(`Inbox consumption reverted after an accepted simulation`, {
      messageId: message.messageId,
      batchId: message.batchId,
      mode: message.mode,
      scenario: message.scenario,
      txHash: message.l2TxHash,
      blockNumber: receipt.blockNumber,
      error: receipt.error,
    });
  }

  /**
   * Emits a batch outcome with its size and gas, and the submission-to-mined latency it closes. That latency is
   * a batch-scoped sample with no mode: a batch carries messages of both domains.
   */
  private async recordL1Batch(
    batch: InboxBatchRecord,
    result: InboxBotL1BatchResult,
    receipt: L1ToL2MessageBatchReceipt,
  ): Promise<void> {
    this.metrics.recordL1Batch(result, batch.scenario, {
      messageCount: batch.messageCount,
      gasUsed: receipt.gasUsed,
    });
    if (
      result === 'success' &&
      batch.submittedAt !== undefined &&
      batch.minedAt !== undefined &&
      !batch.exportedStages.includes('l1_submission_to_mined')
    ) {
      this.metrics.recordStage(
        'l1_submission_to_mined',
        { scenario: batch.scenario },
        (batch.minedAt - batch.submittedAt) / 1000,
      );
      await this.store.markBatchExported(batch.batchId, ['l1_submission_to_mined']);
    }
    this.log.info(`Inbox batch ${result}`, {
      batchId: batch.batchId,
      result,
      scenario: batch.scenario,
      txHash: receipt.txHash,
      messageCount: batch.messageCount,
      gasUsed: receipt.gasUsed.toString(),
      l1BlockNumber: receipt.l1BlockNumber.toString(),
      l1BlockTimestamp: receipt.l1BlockTimestamp.toString(),
    });
  }

  private recordSaturationRun(result: InboxBotSaturationRunResult, context: object): void {
    this.metrics.recordSaturationRun(result);
    this.log.info(`Inbox saturation run ${result}`, { result, ...context });
  }
}

/** Seconds between two local observations, or undefined when either of them was never made. */
function secondsBetween(from: number | undefined, to: number | undefined): number | undefined {
  return from === undefined || to === undefined ? undefined : (to - from) / 1000;
}
