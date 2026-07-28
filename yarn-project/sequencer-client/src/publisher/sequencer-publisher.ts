import type { BlobClientInterface } from '@aztec/blob-client/client';
import { Blob, getBlobsPerL1Block, getPrefixedEthBlobCommitments } from '@aztec/blob-lib';
import type { EpochCache } from '@aztec/epoch-cache';
import type { L1ContractsConfig } from '@aztec/ethereum/config';
import {
  FeeAssetPriceOracle,
  type GovernanceProposerContract,
  MULTI_CALL_3_ADDRESS,
  Multicall3,
  MulticallForwarderRevertedError,
  type PayloadProposalStatus,
  type RollupContract,
  type SimulationOverridesPlan,
  type SlashingProposerContract,
  buildSimulationOverridesStateOverride,
} from '@aztec/ethereum/contracts';
import { type L1FeeAnalysisResult, L1FeeAnalyzer, captureWindowBlockFees } from '@aztec/ethereum/l1-fee-analysis';
import {
  type L1BlobInputs,
  type L1TxConfig,
  type L1TxRequest,
  L1TxTimeoutError,
  type L1TxUtils,
  MAX_L1_TX_LIMIT,
  type TransactionStats,
  WEI_CONST,
} from '@aztec/ethereum/l1-tx-utils';
import {
  FormattedViemError,
  formatViemError,
  mergeAbis,
  tryDecodeRevertReason,
  tryExtractEvent,
} from '@aztec/ethereum/utils';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { trimmedBytesLength } from '@aztec/foundation/buffer';
import { pick } from '@aztec/foundation/collection';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { TimeoutError } from '@aztec/foundation/error';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { InterruptibleSleep } from '@aztec/foundation/sleep';
import { bufferToHex } from '@aztec/foundation/string';
import { type DateProvider, Timer } from '@aztec/foundation/timer';
import { EmpireBaseAbi, ErrorsAbi, RollupAbi, SlashingProposerAbi } from '@aztec/l1-artifacts';
import { type ProposerSlashAction, encodeSlashConsensusVotes } from '@aztec/slasher';
import { CommitteeAttestationsAndSigners, type ValidateCheckpointResult } from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { SequencerConfig } from '@aztec/stdlib/config';
import {
  getLastL1SlotTimestampForL2Slot,
  getNextL1SlotTimestamp,
  getTimestampForSlot,
} from '@aztec/stdlib/epoch-helpers';
import type { CheckpointHeader } from '@aztec/stdlib/rollup';
import type { L1PublishCheckpointStats } from '@aztec/stdlib/stats';
import { type TelemetryClient, type Tracer, getTelemetryClient, trackSpan } from '@aztec/telemetry-client';

import {
  type Abi,
  type Hex,
  type TransactionReceipt,
  type TypedDataDefinition,
  encodeFunctionData,
  keccak256,
  toHex,
} from 'viem';

import type { SequencerPublisherConfig } from './config.js';
import { type FailedL1Tx, type L1TxFailedStore, createL1TxFailedStore } from './l1_tx_failed_store/index.js';
import { type DroppedRequest, SequencerBundleSimulator } from './sequencer-bundle-simulator.js';
import { SequencerPublisherMetrics } from './sequencer-publisher-metrics.js';

/**
 * Returns true if the receipt indicates a successful send AND the expected event was emitted
 * by the target contract. Both pieces are required: an aggregate3 entry that reverted will
 * have receipt.status === 'success' but no event log.
 */
function extractEventSuccess(
  receipt: TransactionReceipt | undefined,
  opts: { address: string; abi: Abi; eventName: string },
): boolean {
  if (!receipt || receipt.status !== 'success') {
    return false;
  }
  return !!tryExtractEvent(receipt.logs, opts.address.toString() as Hex, opts.abi, opts.eventName);
}

/** Result of a sendRequests call, returned by both sendRequests() and sendRequestsAt(). */
export type SendRequestsResult = {
  /** The L1 transaction receipt from the bundled multicall. */
  result: { receipt: TransactionReceipt };
  /** Actions that expired (past their deadline) before the request was sent. */
  expiredActions: Action[];
  /** Actions that were included in the sent L1 transaction. */
  sentActions: Action[];
  /** Actions whose L1 simulation succeeded (subset of sentActions). */
  successfulActions: Action[];
  /** Actions whose L1 simulation failed (subset of sentActions). */
  failedActions: Action[];
};

/** Arguments to the process method of the rollup contract */
type L1ProcessArgs = {
  /** The L2 block header. */
  header: CheckpointHeader;
  /** A root of the archive tree after the L2 block is applied. */
  archive: Buffer;
  /** L2 block blobs containing all tx effects. */
  blobs: Blob[];
  /** Attestations */
  attestationsAndSigners: CommitteeAttestationsAndSigners;
  /** Attestations and signers signature */
  attestationsAndSignersSignature: Signature;
  /** The fee asset price modifier in basis points (from oracle) */
  feeAssetPriceModifier: bigint;
  /** Sequence number of the Inbox bucket the header's rolling hash corresponds to (AZIP-22 Fast Inbox lookup aid). */
  bucketHint: bigint;
};

export const Actions = [
  'invalidate-by-invalid-attestation',
  'invalidate-by-insufficient-attestations',
  'prune',
  'propose',
  'governance-signal',
  'vote-offenses',
  'execute-slash',
] as const;

export type Action = (typeof Actions)[number];

type GovernanceSignalAction = Extract<Action, 'governance-signal'>;

// Sorting for actions such that invalidations go before proposals, and proposals go before votes
export const compareActions = (a: Action, b: Action) => Actions.indexOf(a) - Actions.indexOf(b);

export type InvalidateCheckpointRequest = {
  request: L1TxRequest;
  reason: 'invalid-attestation' | 'insufficient-attestations';
  gasUsed: bigint;
  checkpointNumber: CheckpointNumber;
  forcePendingCheckpointNumber: CheckpointNumber;
  /** Archive at the rollback target checkpoint (checkpoint N-1). */
  lastArchive: Fr;
};

type EnqueueProposeCheckpointOpts = {
  txTimeoutAt?: Date;
};

export interface RequestWithExpiry {
  action: Action;
  request: L1TxRequest;
  lastValidL2Slot: SlotNumber;
  gasConfig?: Pick<L1TxConfig, 'txTimeoutAt' | 'gasLimit'>;
  blobConfig?: L1BlobInputs;
  /** Gas consumed by validateBlobs; stashed for the bundle simulate at send time. */
  blobEvaluationGas?: bigint;
  checkSuccess: (
    request: L1TxRequest,
    result?: { receipt: TransactionReceipt; stats?: TransactionStats; errorMsg?: string },
  ) => boolean;
}

export class SequencerPublisher {
  private interrupted = false;
  private metrics: SequencerPublisherMetrics;
  private bundleSimulator: SequencerBundleSimulator;
  public epochCache: EpochCache;
  private failedTxStore?: Promise<L1TxFailedStore | undefined>;

  /**
   * ABI used to decode raw revert payloads from dropped bundle entries when the original
   * request did not carry an abi (e.g. the propose request). Merges every contract the
   * publisher can route to so any of their custom errors decode against it.
   */
  private readonly revertDecoderAbi: Abi = mergeAbis([RollupAbi, SlashingProposerAbi, EmpireBaseAbi, ErrorsAbi]);

  protected lastActions: Partial<Record<Action, SlotNumber>> = {};

  protected log: Logger;
  protected ethereumSlotDuration: bigint;
  protected aztecSlotDuration: bigint;
  private readonly previousL1BlockWaitTimeoutMs: number;
  private readonly previousL1BlockWaitPollIntervalMs: number;

  /** Date provider for wall-clock time. */
  private readonly dateProvider: DateProvider;

  private blobClient: BlobClientInterface;

  /** Optional callback to obtain a replacement publisher when the current one fails to send. */
  private getNextPublisher?: (excludeAddresses: EthAddress[]) => Promise<L1TxUtils | undefined>;

  /** L1 fee analyzer for fisherman mode */
  private l1FeeAnalyzer?: L1FeeAnalyzer;

  /** Fee asset price oracle for computing price modifiers from Uniswap V4 */
  private feeAssetPriceOracle: FeeAssetPriceOracle;

  /** Interruptible sleep used by sendRequestsAt to wait until a target timestamp. */
  private readonly interruptibleSleep = new InterruptibleSleep();

  public l1TxUtils: L1TxUtils;
  public rollupContract: RollupContract;
  public govProposerContract: GovernanceProposerContract;
  public slashingProposerContract: SlashingProposerContract | undefined;

  public readonly tracer: Tracer;

  protected requests: RequestWithExpiry[] = [];

  constructor(
    private config: Pick<
      SequencerPublisherConfig,
      | 'fishermanMode'
      | 'l1TxFailedStore'
      | 'sequencerPublisherPreviousL1BlockWaitTimeoutMs'
      | 'sequencerPublisherPreviousL1BlockWaitPollIntervalMs'
    > &
      Pick<SequencerConfig, 'governanceProposerForcePayloadVote'> &
      Pick<L1ContractsConfig, 'ethereumSlotDuration' | 'aztecSlotDuration'> & { l1ChainId: number },
    deps: {
      telemetry?: TelemetryClient;
      blobClient: BlobClientInterface;
      l1TxUtils: L1TxUtils;
      rollupContract: RollupContract;
      slashingProposerContract: SlashingProposerContract | undefined;
      governanceProposerContract: GovernanceProposerContract;
      epochCache: EpochCache;
      dateProvider: DateProvider;
      metrics: SequencerPublisherMetrics;
      lastActions: Partial<Record<Action, SlotNumber>>;
      log?: Logger;
      getNextPublisher?: (excludeAddresses: EthAddress[]) => Promise<L1TxUtils | undefined>;
    },
  ) {
    this.log = deps.log ?? createLogger('sequencer:publisher');
    this.ethereumSlotDuration = BigInt(config.ethereumSlotDuration);
    this.aztecSlotDuration = BigInt(config.aztecSlotDuration);
    this.previousL1BlockWaitTimeoutMs = config.sequencerPublisherPreviousL1BlockWaitTimeoutMs;
    this.previousL1BlockWaitPollIntervalMs = config.sequencerPublisherPreviousL1BlockWaitPollIntervalMs;
    this.dateProvider = deps.dateProvider;
    this.epochCache = deps.epochCache;
    this.lastActions = deps.lastActions;

    this.blobClient = deps.blobClient;
    this.dateProvider = deps.dateProvider;

    const telemetry = deps.telemetry ?? getTelemetryClient();
    this.metrics = deps.metrics ?? new SequencerPublisherMetrics(telemetry, 'SequencerPublisher');
    this.tracer = telemetry.getTracer('SequencerPublisher');
    this.l1TxUtils = deps.l1TxUtils;
    this.getNextPublisher = deps.getNextPublisher;

    this.rollupContract = deps.rollupContract;

    this.govProposerContract = deps.governanceProposerContract;
    this.slashingProposerContract = deps.slashingProposerContract;

    this.rollupContract.listenToSlasherChanged(async () => {
      this.log.info('Slashing proposer changed');
      const newSlashingProposer = await this.rollupContract.getSlashingProposer();
      this.slashingProposerContract = newSlashingProposer;
    });
    // Initialize L1 fee analyzer for fisherman mode
    if (config.fishermanMode) {
      this.l1FeeAnalyzer = new L1FeeAnalyzer(
        this.l1TxUtils.client,
        deps.dateProvider,
        this.log.createChild('fee-analyzer'),
      );
    }

    // Initialize fee asset price oracle
    this.feeAssetPriceOracle = new FeeAssetPriceOracle(
      this.l1TxUtils.client,
      this.rollupContract,
      this.log.createChild('price-oracle'),
    );

    // Initialize failed L1 tx store (optional, for test networks)
    this.failedTxStore = createL1TxFailedStore(config.l1TxFailedStore, this.log);

    this.bundleSimulator = new SequencerBundleSimulator({
      getL1TxUtils: () => this.l1TxUtils,
      rollupContract: this.rollupContract,
      epochCache: this.epochCache,
      log: this.log.createChild('bundle-simulator'),
    });
  }

  /**
   * Logs the gas-pricing data of a failed L1 transaction at warn — so underpricing is diagnosable
   * from logs even with no failed-tx store configured — and backs the record up to the store when
   * one is. When captureFeeSummary is true, also records the fee data of the already-mined L1
   * blocks in the target slot's inclusion window.
   */
  private backupFailedTx(
    failedTx: Omit<FailedL1Tx, 'timestamp'>,
    opts?: { captureFeeSummary?: boolean; targetSlot?: SlotNumber; sharedFeeSummary?: FailedL1Tx['gasInfo'] },
  ): void {
    const tx: FailedL1Tx = {
      ...failedTx,
      timestamp: Date.now(),
    };

    // Fire and forget - don't block on backup
    void (async () => {
      try {
        // Prefer a pre-captured summary (shared across a batch of failures in the same slot) so we
        // don't re-read the fee window per record. A capture error must not lose the record itself.
        const feeSummary =
          opts?.sharedFeeSummary ??
          (opts?.captureFeeSummary
            ? await this.captureFeeEnvironment(opts.targetSlot).catch(() => undefined)
            : undefined);
        if (feeSummary) {
          tx.gasInfo = { ...tx.gasInfo, ...feeSummary };
        }
        if (tx.gasInfo) {
          this.log.warn(`Gas pricing data for failed L1 tx (${tx.failureType})`, {
            failureType: tx.failureType,
            actions: tx.context.actions,
            slot: tx.context.slot,
            ...tx.gasInfo,
            ...tx.timing,
          });
        }
        const store = await this.failedTxStore;
        if (store) {
          await store.saveFailedTx(tx);
        }
      } catch (err) {
        this.log.warn(`Failed to backup failed L1 tx to store`, err);
      }
    })();
  }

  /**
   * Captures per-block fee data for the L1 blocks in the target slot's inclusion window (the blocks the
   * tx could have landed in) for underpricing diagnostics. Reads only already-mined blocks, so it never
   * waits on the chain. Safe to call off the critical path: the underlying capture never throws, and this
   * returns undefined when there is no target slot or the window is not yet mined (e.g. an early send
   * failure), in which case the record simply carries no window data.
   */
  private async captureFeeEnvironment(targetL2Slot: SlotNumber | undefined): Promise<FailedL1Tx['gasInfo']> {
    if (targetL2Slot === undefined) {
      return undefined;
    }
    const l1Constants = this.epochCache.getL1Constants();
    // The inclusion window is [start of slot N, start of slot N+1): all L1 blocks that can include a tx
    // for this L2 slot. getTimestampForSlot returns seconds, matching block.timestamp.
    const windowStartS = getTimestampForSlot(targetL2Slot, l1Constants);
    const windowEndS = getTimestampForSlot(SlotNumber(Number(targetL2Slot) + 1), l1Constants);
    const windowBlocks = await captureWindowBlockFees(this.l1TxUtils.client, windowStartS, windowEndS);
    if (windowBlocks.length === 0) {
      return undefined;
    }
    return { windowBlocks };
  }

  /** Computes timing info relative to the L2 slot deadline. */
  private computeTimingInfo(targetL2Slot: SlotNumber | undefined): FailedL1Tx['timing'] {
    if (targetL2Slot === undefined) {
      return undefined;
    }
    const l1Constants = this.epochCache.getL1Constants();
    const slotDeadlineS = getTimestampForSlot(SlotNumber(Number(targetL2Slot) + 1), l1Constants);
    const slotDeadlineMs = Number(slotDeadlineS) * 1000;
    return {
      targetL2Slot: Number(targetL2Slot),
      slotDeadlineTimestampS: slotDeadlineS,
      msUntilSlotDeadline: slotDeadlineMs - this.dateProvider.now(),
    };
  }

  /**
   * Builds an id for a synthetic failure record (send-error/timeout) that has no on-chain tx hash.
   * Includes the failure time so each attempt — including retries of the same slot — is stored as its
   * own record rather than overwriting the previous one.
   */
  private failureRecordId(actions: string[], targetSlot: SlotNumber | undefined): Hex {
    return keccak256(toHex(`${actions.join(',')}:${targetSlot ?? ''}:${Date.now()}`));
  }

  public getRollupContract(): RollupContract {
    return this.rollupContract;
  }

  /**
   * Gets the fee asset price modifier from the oracle.
   *
   * @param predictedParentEthPerFeeAssetE12 - Optional predicted parent eth-per-fee-asset (E12).
   *   Pipelined proposers should pass the value from the predicted parent fee header so the
   *   modifier matches the parent L1 will use when applying it.
   * @returns The fee asset price modifier in basis points, or 0n if the oracle query fails.
   */
  public getFeeAssetPriceModifier(predictedParentEthPerFeeAssetE12?: bigint): Promise<bigint> {
    return this.feeAssetPriceOracle.computePriceModifier(predictedParentEthPerFeeAssetE12);
  }

  public getSenderAddress() {
    return this.l1TxUtils.getSenderAddress();
  }

  /**
   * Gets the L1 fee analyzer instance (only available in fisherman mode)
   */
  public getL1FeeAnalyzer(): L1FeeAnalyzer | undefined {
    return this.l1FeeAnalyzer;
  }

  public addRequest(request: RequestWithExpiry) {
    this.requests.push(request);
  }

  public getCurrentL2Slot(): SlotNumber {
    return this.epochCache.getSlotNow();
  }

  /**
   * Clears all pending requests without sending them.
   */
  public clearPendingRequests(): void {
    const count = this.requests.length;
    this.requests = [];
    if (count > 0) {
      this.log.debug(`Cleared ${count} pending request(s)`);
    }
  }

  /**
   * Analyzes L1 fees for the pending requests without sending them.
   * This is used in fisherman mode to validate fee calculations.
   * @param l2SlotNumber - The L2 slot number for this analysis
   * @param onComplete - Optional callback to invoke when analysis completes (after block is mined)
   * @returns The analysis result (incomplete until block mines), or undefined if no requests
   */
  public async analyzeL1Fees(
    l2SlotNumber: SlotNumber,
    onComplete?: (analysis: L1FeeAnalysisResult) => void,
  ): Promise<L1FeeAnalysisResult | undefined> {
    if (!this.l1FeeAnalyzer) {
      this.log.warn('L1 fee analyzer not available (not in fisherman mode)');
      return undefined;
    }

    const requestsToAnalyze = [...this.requests];
    if (requestsToAnalyze.length === 0) {
      this.log.debug('No requests to analyze for L1 fees');
      return undefined;
    }

    // Extract blob config from requests (if any)
    const blobConfigs = requestsToAnalyze.filter(request => request.blobConfig).map(request => request.blobConfig);
    const blobConfig = blobConfigs[0];

    // Get gas configs
    const gasConfigs = requestsToAnalyze.filter(request => request.gasConfig).map(request => request.gasConfig);
    const gasLimits = gasConfigs.map(g => g?.gasLimit).filter((g): g is bigint => g !== undefined);
    const gasLimit = gasLimits.length > 0 ? gasLimits.reduce((sum, g) => sum + g, 0n) : 0n;

    // Get the transaction requests
    const l1Requests = requestsToAnalyze.map(r => r.request);

    // Start the analysis
    const analysisId = await this.l1FeeAnalyzer.startAnalysis(
      l2SlotNumber,
      gasLimit > 0n ? gasLimit : MAX_L1_TX_LIMIT,
      l1Requests,
      blobConfig,
      onComplete,
    );

    this.log.info('Started L1 fee analysis', {
      analysisId,
      l2SlotNumber: l2SlotNumber.toString(),
      requestCount: requestsToAnalyze.length,
      hasBlobConfig: !!blobConfig,
      gasLimit: gasLimit.toString(),
      actions: requestsToAnalyze.map(r => r.action),
    });

    // Return the analysis result (will be incomplete until block mines)
    return this.l1FeeAnalyzer.getAnalysis(analysisId);
  }

  /**
   * Sends all requests that are still valid.
   * @param targetSlot - The target L2 slot for this send. When provided (the production path, via
   *   sendRequestsAt), it is threaded into bundleSimulate so the block.timestamp override matches
   *   the slot the propose is built for. When omitted, falls back to getCurrentL2Slot() for the
   *   AutomineSequencer, which publishes synchronously within the current slot.
   * @returns one of:
   * - A receipt and stats if the tx succeeded
   * - a receipt and errorMsg if it failed on L1
   * - undefined if no valid requests are found OR the tx failed to send.
   */
  @trackSpan('SequencerPublisher.sendRequests')
  public async sendRequests(targetSlot?: SlotNumber): Promise<SendRequestsResult | undefined> {
    const requestsToProcess = [...this.requests];
    this.requests = [];

    if (this.interrupted || requestsToProcess.length === 0) {
      return undefined;
    }
    const currentL2Slot = targetSlot ?? this.getCurrentL2Slot();
    this.log.debug(`Sending requests on L2 slot ${currentL2Slot}`);
    const validRequests = requestsToProcess.filter(request => request.lastValidL2Slot >= currentL2Slot);
    const expiredActions = requestsToProcess
      .filter(request => request.lastValidL2Slot < currentL2Slot)
      .map(x => x.action);

    if (validRequests.length !== requestsToProcess.length) {
      this.log.warn(`Some requests were expired for slot ${currentL2Slot}`, {
        validRequests: validRequests.map(request => ({
          action: request.action,
          lastValidL2Slot: request.lastValidL2Slot,
        })),
        requests: requestsToProcess.map(request => ({
          action: request.action,
          lastValidL2Slot: request.lastValidL2Slot,
        })),
      });
    }

    if (validRequests.length === 0) {
      this.log.debug(`No valid requests to send`);
      return undefined;
    }

    // Collect earliest txTimeoutAt across all requests.
    const gasConfigs = validRequests.filter(request => request.gasConfig).map(request => request.gasConfig);
    const txTimeoutAts = gasConfigs.map(g => g?.txTimeoutAt).filter((g): g is Date => g !== undefined);
    const txTimeoutAt = txTimeoutAts.length > 0 ? new Date(Math.min(...txTimeoutAts.map(g => g.getTime()))) : undefined;

    // Sort the requests so that proposals always go first
    // This ensures the committee gets precomputed correctly
    validRequests.sort((a, b) => compareActions(a.action, b.action));

    try {
      // Bundle-level eth_simulateV1: filters out entries that revert and derives the gasLimit.
      const bundleResult = await this.bundleSimulator.simulate(validRequests, currentL2Slot);

      if (bundleResult.kind === 'aborted') {
        this.logDroppedInSim(bundleResult.droppedRequests);
        void this.backupDroppedInSim(bundleResult.droppedRequests, currentL2Slot).catch(err =>
          this.log.error(`Failed to backup requests dropped in simulation`, err),
        );
        return undefined;
      }

      const { requests, droppedRequests, gasLimit } =
        bundleResult.kind === 'fallback'
          ? {
              requests: bundleResult.requests,
              droppedRequests: bundleResult.droppedRequests,
              gasLimit: MAX_L1_TX_LIMIT,
            }
          : bundleResult;

      this.logDroppedInSim(droppedRequests);

      // Compute blobConfig from survivors (not original validRequests) so that if the propose
      // entry was dropped by bundleSimulate we don't attach a blob-typed config to a non-blob tx.
      const [blobConfig] = requests.filter(r => r.blobConfig).map(r => r.blobConfig);
      const txConfig: RequestWithExpiry['gasConfig'] = { gasLimit, txTimeoutAt };

      this.log.debug('Forwarding transactions', {
        requests: requests.map(request => request.action),
        txConfig,
      });
      const result = await this.forwardWithPublisherRotation(requests, txConfig, blobConfig, currentL2Slot);
      if (result === undefined) {
        return undefined;
      }
      const { successfulActions = [], failedActions = [] } = this.callbackBundledTransactions(requests, result);
      const allFailedActions = [...failedActions, ...droppedRequests.map(d => d.request.action)];
      return {
        result,
        expiredActions,
        sentActions: requests.map(x => x.action),
        successfulActions,
        failedActions: allFailedActions,
      };
    } catch (err) {
      const viemError = formatViemError(err);
      this.log.error(`Failed to publish bundled transactions`, viemError);
      if (err instanceof TimeoutError) {
        const timeoutState = err instanceof L1TxTimeoutError ? err.txState : undefined;
        void (async () => {
          // The RPC is likely degraded right after a timeout, so back up without the block number
          // rather than leaking an unhandled rejection.
          const l1BlockNumber = await this.l1TxUtils.getBlockNumber().catch(() => 0n);
          this.backupFailedTx(
            {
              id: this.failureRecordId(
                validRequests.map(r => r.action),
                currentL2Slot,
              ),
              failureType: 'timeout',
              request: { to: MULTI_CALL_3_ADDRESS as Hex, data: '0x' as Hex },
              l1BlockNumber,
              error: { message: viemError.message, name: 'TimeoutError' },
              context: {
                actions: validRequests.map(r => r.action),
                requests: validRequests
                  .filter(r => r.request.to !== null)
                  .map(r => ({ action: r.action, to: r.request.to! as Hex, data: r.request.data! })),
                sender: this.getSenderAddress().toString(),
                slot: Number(currentL2Slot),
              },
              timing: this.computeTimingInfo(currentL2Slot),
              gasInfo: timeoutState
                ? {
                    sentFeesPerGasLadder: timeoutState.feesPerGasHistory,
                    attempts: timeoutState.attempts,
                    gasLimit: timeoutState.gasLimit,
                    nonce: timeoutState.nonce,
                  }
                : undefined,
            },
            { captureFeeSummary: true, targetSlot: currentL2Slot },
          );
        })();
      }
      return undefined;
    } finally {
      try {
        this.metrics.recordSenderBalance(
          await this.l1TxUtils.getSenderBalance(),
          this.l1TxUtils.getSenderAddress().toString(),
        );
      } catch (err) {
        this.log.warn(`Failed to record balance after sending tx: ${err}`);
      }
    }
  }

  /** Logs entries dropped by bundle simulation as warnings on the publisher's logger. */
  private logDroppedInSim(dropped: DroppedRequest[]): void {
    for (const drop of dropped) {
      const revertReasonDecoded = drop.revertReason ?? tryDecodeRevertReason(drop.returnData, this.revertDecoderAbi);
      this.log.warn('Bundle entry dropped: action reverted in sim', {
        action: drop.request.action,
        revertReason: revertReasonDecoded ?? drop.returnData,
        revertReasonDecoded,
        returnData: drop.returnData,
      });
    }
  }

  /** Backs up entries dropped by bundle simulation, one record per dropped action. */
  private async backupDroppedInSim(dropped: DroppedRequest[], targetSlot?: SlotNumber): Promise<void> {
    if (dropped.length === 0) {
      return;
    }
    // Invoked as `void backupDroppedInSim(...)` on the publish path, so it must not throw.
    try {
      const l1BlockNumber = await this.l1TxUtils.getBlockNumber();
      // Every dropped entry failed in the same slot against the same L1 fee conditions, so capture
      // the fee environment once and share it rather than re-reading the window per entry.
      const sharedFeeSummary = await this.captureFeeEnvironment(targetSlot).catch(() => undefined);
      const timing = this.computeTimingInfo(targetSlot);
      for (const { request: req } of dropped) {
        this.backupFailedTx(
          {
            id: keccak256(req.request.data!),
            failureType: 'simulation',
            request: { to: req.request.to! as Hex, data: req.request.data! },
            l1BlockNumber,
            error: { message: 'Bundle entry dropped: action reverted in sim' },
            context: {
              actions: [req.action],
              sender: this.getSenderAddress().toString(),
              slot: targetSlot !== undefined ? Number(targetSlot) : undefined,
            },
            timing,
          },
          { sharedFeeSummary },
        );
      }
    } catch (err) {
      this.log.warn(`Failed to back up dropped-in-sim entries`, err);
    }
  }

  /**
   * Forwards transactions via Multicall3, rotating to the next available publisher if a send
   * failure occurs (i.e. the tx never reached the chain).
   * On-chain reverts and simulation errors are returned as-is without rotation.
   */
  private async forwardWithPublisherRotation(
    validRequests: RequestWithExpiry[],
    txConfig: RequestWithExpiry['gasConfig'],
    blobConfig: L1BlobInputs | undefined,
    targetSlot?: SlotNumber,
  ) {
    if (!txConfig?.gasLimit) {
      throw new Error('gasLimit is required for bundled transactions');
    }
    const txConfigWithGasLimit = txConfig as L1TxConfig & { gasLimit: bigint };

    const triedAddresses: EthAddress[] = [];
    let currentPublisher = this.l1TxUtils;

    while (true) {
      if (txConfig.txTimeoutAt && new Date() > txConfig.txTimeoutAt) {
        this.log.warn(`Tx timeout (${txConfig.txTimeoutAt.toISOString()}) elapsed; stopping publisher rotation`, {
          triedAddresses: triedAddresses.map(a => a.toString()),
        });
        return undefined;
      }
      triedAddresses.push(currentPublisher.getSenderAddress());

      try {
        const result = await Multicall3.forward(
          validRequests.map(r => r.request),
          currentPublisher,
          txConfigWithGasLimit,
          blobConfig,
          { gasLimitRequired: true },
        );
        this.l1TxUtils = currentPublisher;
        return result;
      } catch (err) {
        if (err instanceof TimeoutError) {
          throw err;
        }
        if (err instanceof MulticallForwarderRevertedError) {
          this.log.error('Forwarder transaction reverted on-chain; not rotating publisher', err, {
            transactionHash: err.receipt.transactionHash,
          });
          this.backupRevertFailure(validRequests, err, currentPublisher, targetSlot);
          return undefined;
        }
        const viemError = formatViemError(err);
        if (!this.getNextPublisher) {
          this.log.error('Failed to publish bundled transactions', viemError);
          this.backupSendFailure(validRequests, viemError, currentPublisher, targetSlot);
          return undefined;
        }
        this.log.warn(
          `Publisher ${currentPublisher.getSenderAddress()} failed to send, rotating to next publisher`,
          viemError,
        );
        const nextPublisher = await this.getNextPublisher([...triedAddresses]);
        if (!nextPublisher) {
          this.log.error(
            `All available publishers exhausted (tried ${triedAddresses.length}), failed to publish bundled transactions`,
            viemError,
            { triedAddresses: triedAddresses.map(a => a.toString()) },
          );
          this.backupSendFailure(validRequests, viemError, currentPublisher, targetSlot);
          return undefined;
        }
        currentPublisher = nextPublisher;
      }
    }
  }

  /** Backs up an on-chain revert failure to the failed tx store. */
  private backupRevertFailure(
    requests: RequestWithExpiry[],
    err: MulticallForwarderRevertedError,
    publisher: L1TxUtils,
    targetSlot?: SlotNumber,
  ): void {
    this.backupFailedTx(
      {
        id: err.receipt.transactionHash,
        failureType: 'revert',
        request: { to: MULTI_CALL_3_ADDRESS as Hex, data: '0x' as Hex },
        l1BlockNumber: err.receipt.blockNumber,
        receipt: {
          transactionHash: err.receipt.transactionHash,
          blockNumber: err.receipt.blockNumber,
          gasUsed: err.receipt.gasUsed,
          status: 'reverted',
        },
        error: { message: err.message, name: err.name },
        context: {
          actions: requests.map(r => r.action),
          requests: requests
            .filter(r => r.request.to !== null)
            .map(r => ({ action: r.action, to: r.request.to! as Hex, data: r.request.data! })),
          sender: publisher.getSenderAddress().toString(),
          slot: targetSlot !== undefined ? Number(targetSlot) : undefined,
        },
        gasInfo: err.txState
          ? {
              sentFeesPerGas: err.txState.feesPerGas,
              gasLimit: err.txState.gasLimit,
              nonce: err.txState.nonce,
            }
          : undefined,
        timing: this.computeTimingInfo(targetSlot),
      },
      { captureFeeSummary: true, targetSlot },
    );
  }

  /** Backs up a send failure (tx never reached chain) to the failed tx store. */
  private backupSendFailure(
    requests: RequestWithExpiry[],
    error: FormattedViemError | Error,
    publisher: L1TxUtils,
    targetSlot?: SlotNumber,
  ): void {
    // If we can't get the block number, still back up without it.
    void this.l1TxUtils
      .getBlockNumber()
      .catch(() => 0n)
      .then(l1BlockNumber => {
        this.backupFailedTx(
          {
            id: this.failureRecordId(
              requests.map(r => r.action),
              targetSlot,
            ),
            failureType: 'send-error',
            request: { to: MULTI_CALL_3_ADDRESS as Hex, data: '0x' as Hex },
            l1BlockNumber,
            error: {
              message: error.message,
              name: 'name' in error ? error.name : undefined,
            },
            context: {
              actions: requests.map(r => r.action),
              requests: requests
                .filter(r => r.request.to !== null)
                .map(r => ({ action: r.action, to: r.request.to! as Hex, data: r.request.data! })),
              sender: publisher.getSenderAddress().toString(),
              slot: targetSlot !== undefined ? Number(targetSlot) : undefined,
            },
            timing: this.computeTimingInfo(targetSlot),
          },
          { captureFeeSummary: true, targetSlot },
        );
      });
  }

  /*
   * Schedules sending all enqueued requests at (or after) the start of the given L2 slot.
   */
  public async sendRequestsAt(targetSlot: SlotNumber): Promise<SendRequestsResult | undefined> {
    await this.waitForTargetSlot(targetSlot);
    if (this.interrupted) {
      return undefined;
    }

    return this.sendRequests(targetSlot);
  }

  /**
   * Sleeps until one L1 slot before the L2 slot boundary, and then waits for that L1 block
   * to be mined, so we don't risk being included in it. If that block never gets mined after
   * a timeout, we assume it got skipped on L1, so we send the tx anyway.
   */
  private async waitForTargetSlot(targetSlot: SlotNumber): Promise<void> {
    const l1Constants = this.epochCache.getL1Constants();
    const nowInSeconds = this.dateProvider.nowInSeconds();
    const startOfTargetSlotTs = getTimestampForSlot(targetSlot, l1Constants);
    const previousL1BlockTs = startOfTargetSlotTs - this.ethereumSlotDuration;
    const waitDeadlineTs = previousL1BlockTs + BigInt(this.previousL1BlockWaitTimeoutMs / 1000);
    const logCtx = { targetSlot, startOfTargetSlotTs, nowInSeconds, previousL1BlockTs, waitDeadlineTs };

    // Check if we are already past time
    if (nowInSeconds >= startOfTargetSlotTs) {
      this.log.verbose(`Target slot ${targetSlot} already started, sending requests immediately`, logCtx);
      return;
    }

    // Otherwise we wait
    this.log.debug(`Waiting for slot ${targetSlot} before sending requests`, logCtx);

    // Wait until previous L1 block timestamp first
    const sleepMs = (Number(previousL1BlockTs) - nowInSeconds) * 1000;
    if (sleepMs > 0 && !this.interrupted) {
      this.log.trace(`Sleeping ${sleepMs}ms before waiting for previous L1 block`, logCtx);
      await this.interruptibleSleep.sleep(sleepMs);
    }

    // Then loop until we see the previous L1 block, so we know that we cannot be included in it.
    // We time out after a while, once we are sure that that block is skipped in L1.
    while (!this.interrupted) {
      try {
        const nowInSeconds = this.dateProvider.nowInSeconds();
        logCtx.nowInSeconds = nowInSeconds;

        if (nowInSeconds >= waitDeadlineTs) {
          this.log.warn(`Timed out waiting for previous L1 block before sending requests, proceeding`, logCtx);
          return;
        }

        const latestBlockTs = await this.l1TxUtils.getBlock().then(b => b.timestamp);
        if (latestBlockTs >= previousL1BlockTs) {
          this.log.debug(`Previous L1 block mined, proceeding to send requests`, { ...logCtx, latestBlockTs });
          return;
        }
        this.log.trace(`Previous L1 block not mined yet, continuing to wait`, { ...logCtx, latestBlockTs });
      } catch (err) {
        this.log.error(`Error while waiting for previous L1 block before sending requests; retrying`, err, logCtx);
      } finally {
        await this.interruptibleSleep.sleep(this.previousL1BlockWaitPollIntervalMs);
      }
    }
  }

  private callbackBundledTransactions(
    requests: RequestWithExpiry[],
    result: { receipt: TransactionReceipt; multicallData: Hex },
  ) {
    const actionsListStr = requests.map(r => r.action).join(', ');
    this.log.verbose(`Published bundled transactions (${actionsListStr})`, {
      result,
      requests: requests.map(r => ({
        ...r,
        // Avoid logging large blob data
        blobConfig: r.blobConfig
          ? { ...r.blobConfig, blobs: r.blobConfig.blobs.map(b => ({ size: trimmedBytesLength(b) })) }
          : undefined,
      })),
    });
    const successfulActions: Action[] = [];
    const failedActions: Action[] = [];
    for (const request of requests) {
      if (request.checkSuccess(request.request, result)) {
        successfulActions.push(request.action);
      } else {
        failedActions.push(request.action);
      }
    }
    return { successfulActions, failedActions };
  }

  /**
   * @notice  Will call `canProposeAt` to make sure that it is possible to propose
   * @param tipArchive - The archive to check
   * @returns The slot and block number if it is possible to propose, undefined otherwise
   */
  public async canProposeAt(tipArchive: Fr, msgSender: EthAddress, simulationOverridesPlan?: SimulationOverridesPlan) {
    // TODO: #14291 - should loop through multiple keys to check if any of them can propose
    // These errors are expected when we cannot actually propose right now — usually because our
    // local view of the chain is ahead of L1 (proposed parent hasn't landed yet, or someone
    // else has just landed the slot, or the archive override doesn't match). We log a warn and
    // skip the proposal; we do NOT treat these as bugs.
    const expectedErrors = ['SlotAlreadyInChain', 'InvalidProposer', 'InvalidArchive'];

    const slotOffset = this.aztecSlotDuration;
    const nextL1SlotTs = this.getNextL1SlotTimestamp() + slotOffset;

    return this.rollupContract
      .canProposeAt(
        tipArchive.toBuffer(),
        msgSender.toString(),
        nextL1SlotTs,
        await buildSimulationOverridesStateOverride(this.rollupContract, simulationOverridesPlan),
      )
      .catch(err => {
        if (err instanceof FormattedViemError && expectedErrors.find(e => err.message.includes(e))) {
          this.log.warn(`Failed canProposeAtTime check with ${expectedErrors.find(e => err.message.includes(e))}`, {
            error: err.message,
          });
        } else {
          this.log.error(err.name, err);
        }
        return undefined;
      });
  }

  /**
   * @notice  Will simulate the rollup's `validateHeaderWithAttestations` to make sure the checkpoint header is valid
   * @dev     This is a convenience function that can be used by the sequencer to validate a "partial" header,
   *          skipping the DA and signature checks. It will throw if the checkpoint header is invalid.
   * @param header - The checkpoint header to validate
   */
  @trackSpan('SequencerPublisher.validateCheckpointHeader')
  public async validateCheckpointHeader(
    header: CheckpointHeader,
    simulationOverridesPlan?: SimulationOverridesPlan,
  ): Promise<void> {
    const flags = { ignoreDA: true, ignoreSignatures: true };

    const args = [
      header.toViem(),
      CommitteeAttestationsAndSigners.packAttestations([]),
      [], // no signers
      Signature.empty().toViemSignature(),
      `0x${'0'.repeat(64)}`, // 32 empty bytes
      header.blobsHash.toString(),
      flags,
    ] as const;

    const l1Constants = this.epochCache.getL1Constants();
    const ts = getLastL1SlotTimestampForL2Slot(header.slotNumber, l1Constants);
    const stateOverrides = await buildSimulationOverridesStateOverride(this.rollupContract, simulationOverridesPlan);
    // Balance override for compatibility with providers that apply an upfront funds check to simulated calls.
    stateOverrides.push({
      address: MULTI_CALL_3_ADDRESS,
      balance: 10n * WEI_CONST * WEI_CONST, // 10 ETH
    });

    await this.l1TxUtils.simulate(
      {
        to: this.rollupContract.address,
        data: encodeFunctionData({ abi: RollupAbi, functionName: 'validateHeaderWithAttestations', args }),
        from: MULTI_CALL_3_ADDRESS,
      },
      { time: ts },
      stateOverrides,
    );
    this.log.debug(`Simulated validateHeader`);
  }

  /**
   * Simulate making a call to invalidate a checkpoint with invalid attestations. Returns undefined if no need to invalidate.
   * @param validationResult - The validation result indicating which checkpoint to invalidate (as returned by the archiver)
   */
  public async simulateInvalidateCheckpoint(
    validationResult: ValidateCheckpointResult,
  ): Promise<InvalidateCheckpointRequest | undefined> {
    if (validationResult.valid) {
      return undefined;
    }

    const { reason, checkpoint } = validationResult;
    const checkpointNumber = checkpoint.checkpointNumber;
    const logData = { ...checkpoint, reason };

    const currentCheckpointNumber = await this.rollupContract.getCheckpointNumber();
    if (currentCheckpointNumber < checkpointNumber) {
      this.log.verbose(
        `Skipping checkpoint ${checkpointNumber} invalidation since it has already been removed from the pending chain`,
        { currentCheckpointNumber, ...logData },
      );
      return undefined;
    }

    const request = this.buildInvalidateCheckpointRequest(validationResult);
    this.log.debug(`Simulating invalidate checkpoint ${checkpointNumber}`, { ...logData, request });

    const l1BlockNumber = await this.l1TxUtils.getBlockNumber();

    try {
      const { gasUsed } = await this.l1TxUtils.simulate(
        request,
        undefined,
        undefined,
        mergeAbis([request.abi ?? [], ErrorsAbi]),
      );
      this.log.verbose(`Simulation for invalidate checkpoint ${checkpointNumber} succeeded`, {
        ...logData,
        request,
        gasUsed,
      });

      return {
        request,
        gasUsed,
        checkpointNumber,
        forcePendingCheckpointNumber: CheckpointNumber(checkpointNumber - 1),
        lastArchive: validationResult.checkpoint.lastArchive,
        reason,
      };
    } catch (err) {
      const viemError = formatViemError(err);

      // If the error is due to the checkpoint not being in the pending chain, and it was indeed removed by someone else,
      // we can safely ignore it and return undefined so we go ahead with checkpoint building.
      if (viemError.message?.includes('Rollup__CheckpointNotInPendingChain')) {
        this.log.verbose(
          `Simulation for invalidate checkpoint ${checkpointNumber} failed due to checkpoint not being in pending chain`,
          { ...logData, request, error: viemError.message },
        );
        const latestProposedCheckpointNumber = await this.rollupContract.getCheckpointNumber();
        if (latestProposedCheckpointNumber < checkpointNumber) {
          this.log.verbose(`Checkpoint ${checkpointNumber} has already been invalidated`, { ...logData });
          return undefined;
        } else {
          this.log.error(
            `Simulation for invalidate checkpoint ${checkpointNumber} failed and it is still in pending chain`,
            viemError,
            logData,
          );
          throw new Error(
            `Failed to simulate invalidate checkpoint ${checkpointNumber} while it is still in pending chain`,
            {
              cause: viemError,
            },
          );
        }
      }

      // Otherwise, throw. We cannot build the next checkpoint if we cannot invalidate the previous one.
      this.log.error(`Simulation for invalidate checkpoint ${checkpointNumber} failed`, viemError, logData);
      this.backupFailedTx(
        {
          id: keccak256(request.data!),
          failureType: 'simulation',
          request: { to: request.to!, data: request.data!, value: request.value },
          l1BlockNumber,
          error: { message: viemError.message, name: viemError.name },
          context: {
            actions: [`invalidate-${reason}`],
            checkpointNumber,
            sender: this.getSenderAddress().toString(),
          },
          timing: this.computeTimingInfo(this.getCurrentL2Slot()),
        },
        { captureFeeSummary: true, targetSlot: this.getCurrentL2Slot() },
      );
      throw new Error(`Failed to simulate invalidate checkpoint ${checkpointNumber}`, { cause: viemError });
    }
  }

  private buildInvalidateCheckpointRequest(validationResult: ValidateCheckpointResult) {
    if (validationResult.valid) {
      throw new Error('Cannot invalidate a valid checkpoint');
    }

    const { checkpoint, committee, reason } = validationResult;
    const logData = { ...checkpoint, reason };
    this.log.debug(`Building invalidate checkpoint ${checkpoint.checkpointNumber} request`, logData);

    // Use the exact packed tuple posted to L1 verbatim. A repack via `packAttestations` is not a
    // byte-faithful inverse of `fromPacked` (a canonicalized yParity byte or an all-zero signature slot
    // round-trips differently), so it would diverge from the stored `attestationsHash` and revert the
    // invalidation.
    const attestationsAndSigners = validationResult.verbatimAttestations;

    if (reason === 'invalid-attestation') {
      return this.rollupContract.buildInvalidateBadAttestationRequest(
        checkpoint.checkpointNumber,
        attestationsAndSigners,
        committee,
        validationResult.invalidIndex,
      );
    } else if (reason === 'insufficient-attestations') {
      return this.rollupContract.buildInvalidateInsufficientAttestationsRequest(
        checkpoint.checkpointNumber,
        attestationsAndSigners,
        committee,
      );
    } else {
      const _: never = reason;
      throw new Error(`Unknown reason for invalidation`);
    }
  }

  private async enqueueCastSignalHelper(
    slotNumber: SlotNumber,
    signalType: GovernanceSignalAction,
    payload: EthAddress,
    base: GovernanceProposerContract,
    signerAddress: EthAddress,
    signer: (msg: TypedDataDefinition) => Promise<`0x${string}`>,
  ): Promise<boolean> {
    if (this.lastActions[signalType] && this.lastActions[signalType] === slotNumber) {
      this.log.debug(`Skipping duplicate vote cast signal ${signalType} for slot ${slotNumber}`);
      return false;
    }
    if (payload.equals(EthAddress.ZERO)) {
      return false;
    }
    if (signerAddress.equals(EthAddress.ZERO)) {
      this.log.warn(`Cannot enqueue vote cast signal ${signalType} for address zero at slot ${slotNumber}`);
      return false;
    }

    const canonicalRollup = await base.getRollupAddress();
    if (!canonicalRollup.equals(EthAddress.fromString(this.rollupContract.address))) {
      this.log.warn(`Rollup ${this.rollupContract.address} is not canonical, skipping governance signal`, {
        slotNumber,
        signalType,
        canonicalRollup,
        targetRollup: this.rollupContract.address,
        payload: payload.toString(),
      });
      return false;
    }

    const round = await base.computeRound(slotNumber);
    const roundInfo = await base.getRoundInfo(this.rollupContract.address, round);

    if (roundInfo.quorumReached) {
      return false;
    }

    if (roundInfo.lastSignalSlot >= slotNumber) {
      return false;
    }

    if (await base.isPayloadEmpty(payload)) {
      this.log.warn(`Skipping vote cast for payload with empty code`);
      return false;
    }

    // Classify the payload against the Governance proposal history so we stop signalling once its
    // proposal is live or was already executed, while still re-signalling one whose proposal was
    // merely rejected/dropped/expired.
    let status: PayloadProposalStatus = 'none';
    try {
      status = await base.getPayloadProposalStatus(payload.toString());
    } catch (err) {
      // We deliberately swallow the error and proceed to signal. Failing closed (skipping the
      // signal) on transient RPC errors would let a flaky L1 endpoint silence governance
      // participation entirely; failing open at worst produces a duplicate signal that the
      // contract will simply count alongside others in the round.
      this.log.error(`Failed to check governance proposal status for payload ${payload} (signalling anyway)`, err, {
        slotNumber,
        signalType,
      });
    }

    if (status === 'live') {
      this.log.info(`Payload ${payload} has a live governance proposal, stopping signals`, {
        slotNumber,
        signalType,
        payload: payload.toString(),
      });
      return false;
    }

    if (status === 'executed' && !this.config.governanceProposerForcePayloadVote) {
      this.log.info(
        `Payload ${payload} was executed by governance within lookback, stopping signals ` +
          `(set GOVERNANCE_PROPOSER_FORCE_PAYLOAD_VOTE to re-signal)`,
        { slotNumber, signalType, payload: payload.toString() },
      );
      return false;
    }

    const cachedLastVote = this.lastActions[signalType];
    this.lastActions[signalType] = slotNumber;
    const action = signalType;

    const request = await base.createSignalRequestWithSignature(
      payload.toString(),
      slotNumber,
      this.config.l1ChainId,
      signerAddress.toString(),
      signer,
    );
    this.log.debug(`Created ${action} request with signature`, {
      request,
      round,
      signer: this.l1TxUtils.client.account?.address,
      lastValidL2Slot: slotNumber,
    });

    // TODO(palla/slash): All votes (governance and slashing) should txTimeoutAt at the end of the slot.
    this.addRequest({
      action,
      request,
      lastValidL2Slot: slotNumber,
      checkSuccess: (_request, result) => {
        const success =
          result &&
          extractEventSuccess(result.receipt, {
            address: base.address.toString(),
            abi: EmpireBaseAbi,
            eventName: 'SignalCast',
          });

        const logData = { ...result, slotNumber, round, payload: payload.toString() };
        if (!success) {
          this.log.error(
            `Signaling in ${action} for ${payload} at slot ${slotNumber} in round ${round} failed`,
            logData,
          );
          this.lastActions[signalType] = cachedLastVote;
          return false;
        } else {
          this.log.info(
            `Signaling in ${action} for ${payload} at slot ${slotNumber} in round ${round} succeeded`,
            logData,
          );
          return true;
        }
      },
    });
    return true;
  }

  /**
   * Enqueues a governance castSignal transaction to cast a signal for a given slot number.
   * @param slotNumber - The slot number to cast a signal for.
   * @returns True if the signal was successfully enqueued, false otherwise.
   */
  public enqueueGovernanceCastSignal(
    governancePayload: EthAddress,
    slotNumber: SlotNumber,
    signerAddress: EthAddress,
    signer: (msg: TypedDataDefinition) => Promise<`0x${string}`>,
  ): Promise<boolean> {
    return this.enqueueCastSignalHelper(
      slotNumber,
      'governance-signal',
      governancePayload,
      this.govProposerContract,
      signerAddress,
      signer,
    );
  }

  /**
   * Enqueues a `prune()` transaction if the rollup is prunable at the given slot's L1 timestamp.
   * `prune()` is permissionless and idempotent — if the chain is no longer prunable by send time the
   * bundle simulation usually drops the entry; on a node without `eth_simulateV1` the bundle is sent
   * as-is and the prune reverts `Rollup__NothingToPrune` inside `aggregate3(allowFailure: true)`
   * (a failed action, never a whole-tx revert). Used by the failed-sync fallback so a stuck pending
   * chain (e.g. bad data blocking sync) can be wound back to recover.
   * @returns true if a prune request was enqueued, false otherwise.
   */
  public async enqueuePruneIfPrunable(slotNumber: SlotNumber): Promise<boolean> {
    if (this.lastActions['prune'] === slotNumber) {
      this.log.debug(`Skipping duplicate prune for slot ${slotNumber}`, { slotNumber });
      return false;
    }
    // Use the SAME timestamp the bundle simulator overrides block.timestamp with at send time
    // (sequencer-bundle-simulator.ts) so this upfront check and the send-time sim agree. Slot-start
    // and last-L1-slot both fall within the same L2 slot (and epoch, which is what `canPruneAtTime`
    // derives), so they agree today; matching the simulator keeps it robust if the contract ever uses
    // the timestamp more granularly.
    const ts = getLastL1SlotTimestampForL2Slot(slotNumber, this.epochCache.getL1Constants());
    const canPrune = await this.rollupContract.canPruneAtTime(ts).catch(err => {
      this.log.error(`Failed to check canPruneAtTime for slot ${slotNumber}`, err, { slotNumber });
      return false;
    });
    if (!canPrune) {
      this.log.debug(`Rollup not prunable at slot ${slotNumber}`, { slotNumber });
      return false;
    }
    const request: L1TxRequest = {
      to: this.rollupContract.address,
      data: encodeFunctionData({ abi: RollupAbi, functionName: 'prune', args: [] }),
    };
    this.log.info(`Enqueuing rollup prune for slot ${slotNumber}`, { slotNumber });
    return this.enqueueRequest(
      'prune',
      request,
      { address: this.rollupContract.address, abi: RollupAbi, eventName: 'PrunedPending' },
      slotNumber,
    );
  }

  /** Enqueues all slashing actions as returned by the slasher client. */
  public async enqueueSlashingActions(
    actions: ProposerSlashAction[],
    slotNumber: SlotNumber,
    signerAddress: EthAddress,
    signer: (msg: TypedDataDefinition) => Promise<`0x${string}`>,
  ): Promise<boolean> {
    if (actions.length === 0) {
      this.log.debug(`No slashing actions to enqueue for slot ${slotNumber}`);
      return false;
    }

    for (const action of actions) {
      switch (action.type) {
        case 'vote-offenses': {
          this.log.debug(`Enqueuing slashing vote for ${action.votes.length} votes at slot ${slotNumber}`, {
            slotNumber,
            round: action.round,
            votesCount: action.votes.length,
            signerAddress,
          });
          if (!this.slashingProposerContract) {
            this.log.error('No slashing proposer contract available');
            return false;
          }
          const votes = bufferToHex(encodeSlashConsensusVotes(action.votes));
          const request = await this.slashingProposerContract.buildVoteRequestFromSigner(votes, slotNumber, signer);
          this.enqueueRequest(
            'vote-offenses',
            request,
            {
              address: this.slashingProposerContract.address.toString(),
              abi: SlashingProposerAbi,
              eventName: 'VoteCast',
            },
            slotNumber,
          );
          break;
        }

        case 'execute-slash': {
          this.log.debug(`Enqueuing slash execution for round ${action.round} at slot ${slotNumber}`, {
            slotNumber,
            round: action.round,
            signerAddress,
          });
          if (!this.slashingProposerContract) {
            this.log.error('No slashing proposer contract available');
            return false;
          }
          const executeRequest = this.slashingProposerContract.buildExecuteRoundRequest(
            action.round,
            action.committees,
          );
          this.enqueueRequest(
            'execute-slash',
            executeRequest,
            {
              address: this.slashingProposerContract.address.toString(),
              abi: SlashingProposerAbi,
              eventName: 'RoundExecuted',
            },
            slotNumber,
          );
          break;
        }

        default: {
          const _: never = action;
          throw new Error(`Unknown slashing action type: ${(action as ProposerSlashAction).type}`);
        }
      }
    }

    return true;
  }

  /** Enqueues a proposal for a checkpoint on L1 */
  public async enqueueProposeCheckpoint(
    checkpoint: Checkpoint,
    attestationsAndSigners: CommitteeAttestationsAndSigners,
    attestationsAndSignersSignature: Signature,
    bucketHint: bigint,
    opts: EnqueueProposeCheckpointOpts = {},
  ): Promise<void> {
    const checkpointHeader = checkpoint.header;

    const blobFields = checkpoint.toBlobFields();
    const blobs = await getBlobsPerL1Block(blobFields);

    const proposeTxArgs: L1ProcessArgs = {
      header: checkpointHeader,
      archive: checkpoint.archive.root.toBuffer(),
      blobs,
      attestationsAndSigners,
      attestationsAndSignersSignature,
      feeAssetPriceModifier: checkpoint.feeAssetPriceModifier,
      bucketHint,
    };

    this.log.verbose(`Enqueuing checkpoint propose transaction`, {
      ...checkpoint.toCheckpointInfo(),
      txTimeoutAt: opts.txTimeoutAt,
    });
    await this.addProposeTx(checkpoint, proposeTxArgs, { txTimeoutAt: opts.txTimeoutAt });
  }

  public enqueueInvalidateCheckpoint(
    request: InvalidateCheckpointRequest | undefined,
    opts: { txTimeoutAt?: Date } = {},
  ) {
    if (!request) {
      return;
    }

    const { gasUsed, checkpointNumber } = request;
    const logData = { gasUsed, checkpointNumber, opts };
    this.log.verbose(`Enqueuing invalidate checkpoint request`, logData);
    this.addRequest({
      action: `invalidate-by-${request.reason}`,
      request: request.request,
      gasConfig: opts.txTimeoutAt ? { txTimeoutAt: opts.txTimeoutAt } : undefined,
      lastValidL2Slot: SlotNumber(this.getCurrentL2Slot() + 2),
      checkSuccess: (_req, result) => {
        const success =
          result &&
          extractEventSuccess(result.receipt, {
            address: this.rollupContract.address,
            abi: RollupAbi,
            eventName: 'CheckpointInvalidated',
          });
        if (!success) {
          this.log.warn(`Invalidate checkpoint ${request.checkpointNumber} failed`, { ...result, ...logData });
        } else {
          this.log.info(`Invalidate checkpoint ${request.checkpointNumber} succeeded`, { ...result, ...logData });
        }
        return !!success;
      },
    });
  }

  /**
   * Dedup-checked enqueue helper for actions that are simulated at bundle-send time rather
   * than at enqueue time. Validates the (action, slot) dedup key, sets `lastActions`, and
   * enqueues without a gasLimit so the bundle simulate sets the only gasLimit that matters.
   */
  private enqueueRequest(
    action: Action,
    request: L1TxRequest,
    eventOpts: { address: string; abi: Abi; eventName: string },
    slotNumber: SlotNumber,
  ): boolean {
    if (this.lastActions[action] && this.lastActions[action] === slotNumber) {
      this.log.debug(`Skipping duplicate action ${action} for slot ${slotNumber}`);
      return false;
    }
    const cachedLastActionSlot = this.lastActions[action];
    this.lastActions[action] = slotNumber;

    this.log.debug(`Enqueuing ${action}`, { slotNumber });
    this.addRequest({
      action,
      request,
      lastValidL2Slot: slotNumber,
      checkSuccess: (_request, result) => {
        const success = result && extractEventSuccess(result.receipt, eventOpts);
        if (!success) {
          this.log.warn(`Action ${action} at ${slotNumber} failed`, { ...result, slotNumber });
          this.lastActions[action] = cachedLastActionSlot;
        } else {
          this.log.info(`Action ${action} at ${slotNumber} succeeded`, { ...result, slotNumber });
        }
        return !!success;
      },
    });
    return true;
  }

  /**
   * Calling `interrupt` will cause any in progress call to `publishRollup` to return `false` asap.
   * Be warned, the call may return false even if the tx subsequently gets successfully mined.
   * In practice this shouldn't matter, as we'll only ever be calling `interrupt` when we know it's going to fail.
   * A call to `restart` is required before you can continue publishing.
   */
  public interrupt() {
    this.interrupted = true;
    this.interruptibleSleep.interrupt();
    this.l1TxUtils.interrupt();
  }

  /** Restarts the publisher after calling `interrupt`. */
  public restart() {
    this.interrupted = false;
    this.l1TxUtils.restart();
  }

  private async prepareProposeTx(encodedData: L1ProcessArgs) {
    const kzg = Blob.getViemKzgInstance();
    const blobInput = getPrefixedEthBlobCommitments(encodedData.blobs);
    this.log.debug('Validating blob input', { blobInput });

    // Get blob evaluation gas
    let blobEvaluationGas: bigint;
    if (this.config.fishermanMode) {
      // In fisherman mode, we can't estimate blob gas because estimateGas doesn't support state overrides
      // Use a fixed estimate.
      blobEvaluationGas = BigInt(encodedData.blobs.length) * 21_000n;
      this.log.debug(`Using fixed blob evaluation gas estimate in fisherman mode: ${blobEvaluationGas}`);
    } else {
      // We call validateBlobs via estimateGas with real blob+kzg sidecars as a consistency check
      // that our locally-built blob commitments match the blob data. The bundle simulate at send
      // time uses eth_simulateV1, which cannot carry blob inputs, so the rollup's on-chain blob
      // check is forced off there — making this the only pre-flight detector of a commitment/data
      // mismatch. The returned gas estimate is stashed on the request for the bundle path to read.
      blobEvaluationGas = await this.l1TxUtils
        .estimateGas(
          this.getSenderAddress().toString(),
          {
            to: this.rollupContract.address,
            data: encodeFunctionData({
              abi: RollupAbi,
              functionName: 'validateBlobs',
              args: [blobInput],
            }),
          },
          {},
          {
            blobs: encodedData.blobs.map(b => b.data),
            kzg,
          },
        )
        .catch(async err => {
          const viemError = formatViemError(err);
          this.log.error(`Failed to validate blobs`, viemError.message, { metaMessages: viemError.metaMessages });
          const validateBlobsData = encodeFunctionData({
            abi: RollupAbi,
            functionName: 'validateBlobs',
            args: [blobInput],
          });
          const l1BlockNumber = await this.l1TxUtils.getBlockNumber();
          this.backupFailedTx(
            {
              id: keccak256(validateBlobsData),
              failureType: 'simulation',
              request: { to: this.rollupContract.address as Hex, data: validateBlobsData },
              blobData: encodedData.blobs.map(b => toHex(b.data)) as Hex[],
              l1BlockNumber,
              error: { message: viemError.message, name: viemError.name },
              context: {
                actions: ['validate-blobs'],
                sender: this.getSenderAddress().toString(),
              },
              timing: this.computeTimingInfo(this.getCurrentL2Slot()),
            },
            { captureFeeSummary: true, targetSlot: this.getCurrentL2Slot() },
          );
          throw new Error('Failed to validate blobs');
        });
    }
    const signers = encodedData.attestationsAndSigners.getSigners().map(signer => signer.toString());

    const args = [
      {
        header: encodedData.header.toViem(),
        archive: toHex(encodedData.archive),
        oracleInput: {
          feeAssetPriceModifier: encodedData.feeAssetPriceModifier,
        },
        bucketHint: encodedData.bucketHint,
      },
      encodedData.attestationsAndSigners.getPackedAttestations(),
      signers,
      encodedData.attestationsAndSignersSignature.toViemSignature(),
      blobInput,
    ] as const;

    const rollupData = encodeFunctionData({ abi: RollupAbi, functionName: 'propose', args });

    return { args, blobEvaluationGas, rollupData };
  }

  private async addProposeTx(
    checkpoint: Checkpoint,
    encodedData: L1ProcessArgs,
    opts: EnqueueProposeCheckpointOpts = {},
  ): Promise<void> {
    const slot = checkpoint.header.slotNumber;
    const timer = new Timer();
    const kzg = Blob.getViemKzgInstance();
    const { rollupData, blobEvaluationGas } = await this.prepareProposeTx(encodedData);
    const startBlock = await this.l1TxUtils.getBlockNumber();

    // Send the blobs to the blob client preemptively. This helps in tests where the sequencer mistakingly thinks that the propose
    // tx fails but it does get mined. We make sure that the blobs are sent to the blob client regardless of the tx outcome.
    void Promise.resolve().then(() =>
      this.blobClient.sendBlobsToFilestore(encodedData.blobs).catch(_err => {
        this.log.error('Failed to send blobs to blob client');
      }),
    );

    return this.addRequest({
      action: 'propose',
      request: {
        to: this.rollupContract.address,
        data: rollupData,
      },
      lastValidL2Slot: checkpoint.header.slotNumber,
      gasConfig: { txTimeoutAt: opts.txTimeoutAt, gasLimit: undefined },
      blobEvaluationGas,
      blobConfig: {
        blobs: encodedData.blobs.map(b => b.data),
        kzg,
      },
      checkSuccess: (_request, result) => {
        if (!result) {
          return false;
        }
        const { receipt, stats, errorMsg } = result;
        const success = extractEventSuccess(receipt, {
          address: this.rollupContract.address,
          abi: RollupAbi,
          eventName: 'CheckpointProposed',
        });

        if (success) {
          const endBlock = receipt.blockNumber;
          const inclusionBlocks = Number(endBlock - startBlock);
          const { calldataGas, calldataSize, sender } = stats!;
          const publishStats: L1PublishCheckpointStats = {
            gasPrice: receipt.effectiveGasPrice,
            gasUsed: receipt.gasUsed,
            blobGasUsed: receipt.blobGasUsed ?? 0n,
            blobDataGas: receipt.blobGasPrice ?? 0n,
            transactionHash: receipt.transactionHash,
            calldataGas,
            calldataSize,
            sender,
            ...checkpoint.getStats(),
            eventName: 'rollup-published-to-l1',
            blobCount: encodedData.blobs.length,
            inclusionBlocks,
          };
          this.log.info(`Published checkpoint ${checkpoint.number} at slot ${slot} to rollup contract`, {
            ...stats,
            ...checkpoint.getStats(),
            ...pick(receipt, 'transactionHash', 'blockHash'),
          });
          this.metrics.recordProcessBlockTx(timer.ms(), publishStats);

          return true;
        } else {
          this.metrics.recordFailedTx('process');
          this.log.error(
            `Publishing checkpoint at slot ${slot} failed with ${errorMsg ?? 'no error message'}`,
            undefined,
            { ...checkpoint.getStats(), ...receipt },
          );
          return false;
        }
      },
    });
  }

  /** Returns the timestamp of the next L1 slot boundary after now. */
  private getNextL1SlotTimestamp(): bigint {
    const l1Constants = this.epochCache.getL1Constants();
    return getNextL1SlotTimestamp(this.dateProvider.nowInSeconds(), l1Constants);
  }
}
