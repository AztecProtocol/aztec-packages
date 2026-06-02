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
  type RollupContract,
  type SimulationOverridesPlan,
  type SlashingProposerContract,
  buildSimulationOverridesStateOverride,
} from '@aztec/ethereum/contracts';
import { type L1FeeAnalysisResult, L1FeeAnalyzer } from '@aztec/ethereum/l1-fee-analysis';
import {
  type L1BlobInputs,
  type L1TxConfig,
  type L1TxRequest,
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
};

export const Actions = [
  'invalidate-by-invalid-attestation',
  'invalidate-by-insufficient-attestations',
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
    private config: Pick<SequencerPublisherConfig, 'fishermanMode' | 'l1TxFailedStore'> &
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
   * Backs up a failed L1 transaction to the configured store for debugging.
   * Does nothing if no store is configured.
   */
  private backupFailedTx(failedTx: Omit<FailedL1Tx, 'timestamp'>): void {
    if (!this.failedTxStore) {
      return;
    }

    const tx: FailedL1Tx = {
      ...failedTx,
      timestamp: Date.now(),
    };

    // Fire and forget - don't block on backup
    void this.failedTxStore
      .then(store => store?.saveFailedTx(tx))
      .catch(err => {
        this.log.warn(`Failed to backup failed L1 tx to store`, err);
      });
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
   * @param targetSlot - The target L2 slot for this send. When provided (pipelined path via
   *   sendRequestsAt), it is threaded into bundleSimulate so the block.timestamp override
   *   matches the slot the propose is built for. When omitted, falls back to
   *   getCurrentL2Slot() for the non-pipelined callers in Sequencer.doWork.
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
        void this.backupDroppedInSim(bundleResult.droppedRequests);
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
      const result = await this.forwardWithPublisherRotation(requests, txConfig, blobConfig);
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
  private async backupDroppedInSim(dropped: DroppedRequest[]): Promise<void> {
    if (dropped.length === 0) {
      return;
    }
    const l1BlockNumber = await this.l1TxUtils.getBlockNumber();
    for (const { request: req } of dropped) {
      this.backupFailedTx({
        id: keccak256(req.request.data!),
        failureType: 'simulation',
        request: { to: req.request.to! as Hex, data: req.request.data! },
        l1BlockNumber: l1BlockNumber.toString(),
        error: { message: 'Bundle entry dropped: action reverted in sim' },
        context: {
          actions: [req.action],
          sender: this.getSenderAddress().toString(),
        },
      });
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
          return undefined;
        }
        const viemError = formatViemError(err);
        if (!this.getNextPublisher) {
          this.log.error('Failed to publish bundled transactions', viemError);
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
          return undefined;
        }
        currentPublisher = nextPublisher;
      }
    }
  }

  /*
   * Schedules sending all enqueued requests at (or after) the start of the given L2 slot.
   * Sleeps until one L1 slot before the L2 slot boundary so the tx has a chance of being
   * picked up by the first L1 block of the L2 slot.
   * NB: there is a known correctness risk — being included in the L1 block right before the
   * L2 slot starts would revert propose with HeaderLib__InvalidSlotNumber.
   * Uses InterruptibleSleep so it can be cancelled via interrupt().
   */
  public async sendRequestsAt(targetSlot: SlotNumber): Promise<SendRequestsResult | undefined> {
    const l1Constants = this.epochCache.getL1Constants();
    // Start of the target L2 slot, in ms (getTimestampForSlot returns seconds).
    const startOfTargetSlotMs = Number(getTimestampForSlot(targetSlot, l1Constants)) * 1000;
    // Aim to be in the mempool one L1 slot before the L2 slot starts, so we have a chance of
    // being picked up by the first L1 block of the L2 slot.
    const submitAfterMs = startOfTargetSlotMs - Number(this.ethereumSlotDuration) * 1000;
    const sleepMs = submitAfterMs - this.dateProvider.now();
    if (sleepMs > 0) {
      this.log.debug(`Sleeping ${sleepMs}ms before sending requests`, {
        targetSlot,
        submitAfterMs,
      });
      await this.interruptibleSleep.sleep(sleepMs);
    }
    if (this.interrupted) {
      return undefined;
    }
    return this.sendRequests(targetSlot);
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

    const pipelined = this.epochCache.isProposerPipeliningEnabled();
    const slotOffset = pipelined ? this.aztecSlotDuration : 0n;
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
   * @notice  Will simulate `validateHeader` to make sure that the block header is valid
   * @dev     This is a convenience function that can be used by the sequencer to validate a "partial" header.
   *          It will throw if the block header is invalid.
   * @param header - The block header to validate
   */
  @trackSpan('SequencerPublisher.validateBlockHeader')
  public async validateBlockHeader(
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
    let balance = 0n;
    if (this.config.fishermanMode) {
      // In fisherman mode, we can't know where the proposer is publishing from
      // so we just add sufficient balance to the multicall3 address
      balance = 10n * WEI_CONST * WEI_CONST; // 10 ETH
    } else {
      balance = await this.l1TxUtils.getSenderBalance();
    }
    stateOverrides.push({
      address: MULTI_CALL_3_ADDRESS,
      balance,
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
      this.backupFailedTx({
        id: keccak256(request.data!),
        failureType: 'simulation',
        request: { to: request.to!, data: request.data!, value: request.value?.toString() },
        l1BlockNumber: l1BlockNumber.toString(),
        error: { message: viemError.message, name: viemError.name },
        context: {
          actions: [`invalidate-${reason}`],
          checkpointNumber,
          sender: this.getSenderAddress().toString(),
        },
      });
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

    const attestationsAndSigners = CommitteeAttestationsAndSigners.packAttestations(validationResult.attestations);

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

    // Skip signaling if there is already a live (non-terminal) Governance proposal for this
    // payload. This is intentionally not cached: a previously-live proposal may transition to
    // a terminal state (Dropped/Rejected/Expired/Executed), at which point we may want to re-signal
    // the same payload in a future round.
    let proposed = false;
    try {
      proposed = await base.hasActiveProposalWithPayload(payload.toString());
    } catch (err) {
      // We deliberately swallow the error and proceed to signal. Failing closed (skipping the
      // signal) on transient RPC errors would let a flaky L1 endpoint silence governance
      // participation entirely; failing open at worst produces a duplicate signal that the
      // contract will simply count alongside others in the round.
      this.log.error(`Failed to check if payload ${payload} was already proposed (signalling anyway)`, err);
    }

    if (proposed) {
      this.log.info(`Payload ${payload} has a live governance proposal, stopping signals`);
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
          this.backupFailedTx({
            id: keccak256(validateBlobsData),
            failureType: 'simulation',
            request: { to: this.rollupContract.address as Hex, data: validateBlobsData },
            blobData: encodedData.blobs.map(b => toHex(b.data)) as Hex[],
            l1BlockNumber: l1BlockNumber.toString(),
            error: { message: viemError.message, name: viemError.name },
            context: {
              actions: ['validate-blobs'],
              sender: this.getSenderAddress().toString(),
            },
          });
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
