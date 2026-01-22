import type { BlobClientInterface } from '@aztec/blob-client/client';
import { Blob, getBlobsPerL1Block, getPrefixedEthBlobCommitments } from '@aztec/blob-lib';
import type { EpochCache } from '@aztec/epoch-cache';
import type { L1ContractsConfig } from '@aztec/ethereum/config';
import {
  type EmpireSlashingProposerContract,
  type GovernanceProposerContract,
  type IEmpireBase,
  MULTI_CALL_3_ADDRESS,
  Multicall3,
  RollupContract,
  type TallySlashingProposerContract,
  type ViemCommitteeAttestations,
  type ViemHeader,
} from '@aztec/ethereum/contracts';
import { type L1FeeAnalysisResult, L1FeeAnalyzer } from '@aztec/ethereum/l1-fee-analysis';
import {
  type L1BlobInputs,
  type L1TxConfig,
  type L1TxRequest,
  type TransactionStats,
  WEI_CONST,
} from '@aztec/ethereum/l1-tx-utils';
import type { L1TxUtilsWithBlobs } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import { FormattedViemError, formatViemError, tryExtractEvent } from '@aztec/ethereum/utils';
import { sumBigint } from '@aztec/foundation/bigint';
import { toHex as toPaddedHex } from '@aztec/foundation/bigint-buffer';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { pick } from '@aztec/foundation/collection';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature, type ViemSignature } from '@aztec/foundation/eth-signature';
import type { Logger } from '@aztec/foundation/log';
import { bufferToHex } from '@aztec/foundation/string';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import { EmpireBaseAbi, ErrorsAbi, RollupAbi } from '@aztec/l1-artifacts';
import { type ProposerSlashAction, encodeSlashConsensusVotes } from '@aztec/slasher';
import { CommitteeAttestationsAndSigners, type ValidateCheckpointResult } from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import { SlashFactoryContract } from '@aztec/stdlib/l1-contracts';
import type { CheckpointHeader } from '@aztec/stdlib/rollup';
import type { L1PublishCheckpointStats } from '@aztec/stdlib/stats';
import { type TelemetryClient, type Tracer, getTelemetryClient, trackSpan } from '@aztec/telemetry-client';

import { type StateOverride, type TransactionReceipt, type TypedDataDefinition, encodeFunctionData, toHex } from 'viem';

import type { PublisherConfig, TxSenderConfig } from './config.js';
import { SequencerPublisherMetrics } from './sequencer-publisher-metrics.js';

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
};

export const Actions = [
  'invalidate-by-invalid-attestation',
  'invalidate-by-insufficient-attestations',
  'propose',
  'governance-signal',
  'empire-slashing-signal',
  'create-empire-payload',
  'execute-empire-payload',
  'vote-offenses',
  'execute-slash',
] as const;

export type Action = (typeof Actions)[number];

type GovernanceSignalAction = Extract<Action, 'governance-signal' | 'empire-slashing-signal'>;

// Sorting for actions such that invalidations go before proposals, and proposals go before votes
export const compareActions = (a: Action, b: Action) => Actions.indexOf(a) - Actions.indexOf(b);

export type InvalidateCheckpointRequest = {
  request: L1TxRequest;
  reason: 'invalid-attestation' | 'insufficient-attestations';
  gasUsed: bigint;
  checkpointNumber: CheckpointNumber;
  forcePendingCheckpointNumber: CheckpointNumber;
};

interface RequestWithExpiry {
  action: Action;
  request: L1TxRequest;
  lastValidL2Slot: SlotNumber;
  gasConfig?: Pick<L1TxConfig, 'txTimeoutAt' | 'gasLimit'>;
  blobConfig?: L1BlobInputs;
  checkSuccess: (
    request: L1TxRequest,
    result?: { receipt: TransactionReceipt; stats?: TransactionStats; errorMsg?: string },
  ) => boolean;
}

export class SequencerPublisher {
  private interrupted = false;
  private metrics: SequencerPublisherMetrics;
  public epochCache: EpochCache;

  protected governanceLog: Logger;
  protected slashingLog: Logger;

  protected lastActions: Partial<Record<Action, SlotNumber>> = {};

  private isPayloadEmptyCache: Map<string, boolean> = new Map<string, boolean>();

  protected log: Logger;
  protected ethereumSlotDuration: bigint;

  private blobClient: BlobClientInterface;

  /** Address to use for simulations in fisherman mode (actual proposer's address) */
  private proposerAddressForSimulation?: EthAddress;

  /** L1 fee analyzer for fisherman mode */
  private l1FeeAnalyzer?: L1FeeAnalyzer;
  // @note - with blobs, the below estimate seems too large.
  // Total used for full block from int_l1_pub e2e test: 1m (of which 86k is 1x blob)
  // Total used for emptier block from above test: 429k (of which 84k is 1x blob)
  public static PROPOSE_GAS_GUESS: bigint = 12_000_000n;

  // A CALL to a cold address is 2700 gas
  public static MULTICALL_OVERHEAD_GAS_GUESS = 5000n;

  // Gas report for VotingWithSigTest shows a max gas of 100k, but we've seen it cost 700k+ in testnet
  public static VOTE_GAS_GUESS: bigint = 800_000n;

  public l1TxUtils: L1TxUtilsWithBlobs;
  public rollupContract: RollupContract;
  public govProposerContract: GovernanceProposerContract;
  public slashingProposerContract: EmpireSlashingProposerContract | TallySlashingProposerContract | undefined;
  public slashFactoryContract: SlashFactoryContract;

  public readonly tracer: Tracer;

  protected requests: RequestWithExpiry[] = [];

  constructor(
    private config: TxSenderConfig & PublisherConfig & Pick<L1ContractsConfig, 'ethereumSlotDuration'>,
    deps: {
      telemetry?: TelemetryClient;
      blobClient: BlobClientInterface;
      l1TxUtils: L1TxUtilsWithBlobs;
      rollupContract: RollupContract;
      slashingProposerContract: EmpireSlashingProposerContract | TallySlashingProposerContract | undefined;
      governanceProposerContract: GovernanceProposerContract;
      slashFactoryContract: SlashFactoryContract;
      epochCache: EpochCache;
      dateProvider: DateProvider;
      metrics: SequencerPublisherMetrics;
      lastActions: Partial<Record<Action, SlotNumber>>;
      log: Logger;
    },
  ) {
    this.log = deps.log;
    this.governanceLog = this.log.createChild('governance');
    this.slashingLog = this.log.createChild('slashing');
    this.ethereumSlotDuration = BigInt(config.ethereumSlotDuration);
    this.epochCache = deps.epochCache;
    this.lastActions = deps.lastActions;

    this.blobClient = deps.blobClient;

    const telemetry = deps.telemetry ?? getTelemetryClient();
    this.metrics =
      deps.metrics ?? new SequencerPublisherMetrics(telemetry, 'SequencerPublisher', this.log.createChild('metrics'));
    this.tracer = telemetry.getTracer('SequencerPublisher');
    this.l1TxUtils = deps.l1TxUtils;

    this.rollupContract = deps.rollupContract;

    this.govProposerContract = deps.governanceProposerContract;
    this.slashingProposerContract = deps.slashingProposerContract;

    this.rollupContract.listenToSlasherChanged(async () => {
      this.log.info('Slashing proposer changed');
      const newSlashingProposer = await this.rollupContract.getSlashingProposer();
      this.slashingProposerContract = newSlashingProposer;
    });
    this.slashFactoryContract = deps.slashFactoryContract;

    // Initialize L1 fee analyzer for fisherman mode
    if (config.fishermanMode) {
      this.l1FeeAnalyzer = new L1FeeAnalyzer(
        this.l1TxUtils.client,
        deps.dateProvider,
        this.log.createChild('fee-analyzer'),
      );
    }
  }

  public getRollupContract(): RollupContract {
    return this.rollupContract;
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

  /**
   * Sets the proposer address to use for simulations in fisherman mode.
   * @param proposerAddress - The actual proposer's address to use for balance lookups in simulations
   */
  public setProposerAddressForSimulation(proposerAddress: EthAddress | undefined) {
    this.proposerAddressForSimulation = proposerAddress;
  }

  public addRequest(request: RequestWithExpiry) {
    this.requests.push(request);
  }

  public getCurrentL2Slot(): SlotNumber {
    return this.epochCache.getEpochAndSlotNow().slot;
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
      gasLimit > 0n ? gasLimit : SequencerPublisher.PROPOSE_GAS_GUESS,
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
   * @returns one of:
   * - A receipt and stats if the tx succeeded
   * - a receipt and errorMsg if it failed on L1
   * - undefined if no valid requests are found OR the tx failed to send.
   */
  @trackSpan('SequencerPublisher.sendRequests')
  public async sendRequests() {
    const requestsToProcess = [...this.requests];
    this.requests = [];
    if (this.interrupted || requestsToProcess.length === 0) {
      return undefined;
    }
    const currentL2Slot = this.getCurrentL2Slot();
    this.log.debug(`Sending requests on L2 slot ${currentL2Slot}`);
    const validRequests = requestsToProcess.filter(request => request.lastValidL2Slot >= currentL2Slot);
    const validActions = validRequests.map(x => x.action);
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

    // @note - we can only have one blob config per bundle
    // find requests with gas and blob configs
    // See https://github.com/AztecProtocol/aztec-packages/issues/11513
    const gasConfigs = requestsToProcess.filter(request => request.gasConfig).map(request => request.gasConfig);
    const blobConfigs = requestsToProcess.filter(request => request.blobConfig).map(request => request.blobConfig);

    if (blobConfigs.length > 1) {
      throw new Error('Multiple blob configs found');
    }

    const blobConfig = blobConfigs[0];

    // Merge gasConfigs. Yields the sum of gasLimits, and the earliest txTimeoutAt, or undefined if no gasConfig sets them.
    const gasLimits = gasConfigs.map(g => g?.gasLimit).filter((g): g is bigint => g !== undefined);
    const gasLimit = gasLimits.length > 0 ? sumBigint(gasLimits) : undefined; // sum
    const txTimeoutAts = gasConfigs.map(g => g?.txTimeoutAt).filter((g): g is Date => g !== undefined);
    const txTimeoutAt = txTimeoutAts.length > 0 ? new Date(Math.min(...txTimeoutAts.map(g => g.getTime()))) : undefined; // earliest
    const txConfig: RequestWithExpiry['gasConfig'] = { gasLimit, txTimeoutAt };

    // Sort the requests so that proposals always go first
    // This ensures the committee gets precomputed correctly
    validRequests.sort((a, b) => compareActions(a.action, b.action));

    try {
      this.log.debug('Forwarding transactions', {
        validRequests: validRequests.map(request => request.action),
        txConfig,
      });
      const result = await Multicall3.forward(
        validRequests.map(request => request.request),
        this.l1TxUtils,
        txConfig,
        blobConfig,
        this.rollupContract.address,
        this.log,
      );
      const { successfulActions = [], failedActions = [] } = this.callbackBundledTransactions(validRequests, result);
      return { result, expiredActions, sentActions: validActions, successfulActions, failedActions };
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

  private callbackBundledTransactions(
    requests: RequestWithExpiry[],
    result?: { receipt: TransactionReceipt } | FormattedViemError,
  ) {
    const actionsListStr = requests.map(r => r.action).join(', ');
    if (result instanceof FormattedViemError) {
      this.log.error(`Failed to publish bundled transactions (${actionsListStr})`, result);
      return { failedActions: requests.map(r => r.action) };
    } else {
      this.log.verbose(`Published bundled transactions (${actionsListStr})`, { result, requests });
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
  }

  /**
   * @notice  Will call `canProposeAtNextEthBlock` to make sure that it is possible to propose
   * @param tipArchive - The archive to check
   * @returns The slot and block number if it is possible to propose, undefined otherwise
   */
  public canProposeAtNextEthBlock(
    tipArchive: Fr,
    msgSender: EthAddress,
    opts: { forcePendingCheckpointNumber?: CheckpointNumber } = {},
  ) {
    // TODO: #14291 - should loop through multiple keys to check if any of them can propose
    const ignoredErrors = ['SlotAlreadyInChain', 'InvalidProposer', 'InvalidArchive'];

    return this.rollupContract
      .canProposeAtNextEthBlock(tipArchive.toBuffer(), msgSender.toString(), Number(this.ethereumSlotDuration), {
        forcePendingCheckpointNumber: opts.forcePendingCheckpointNumber,
      })
      .catch(err => {
        if (err instanceof FormattedViemError && ignoredErrors.find(e => err.message.includes(e))) {
          this.log.warn(`Failed canProposeAtTime check with ${ignoredErrors.find(e => err.message.includes(e))}`, {
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
    opts?: { forcePendingCheckpointNumber: CheckpointNumber | undefined },
  ): Promise<void> {
    const flags = { ignoreDA: true, ignoreSignatures: true };

    const args = [
      header.toViem(),
      CommitteeAttestationsAndSigners.empty().getPackedAttestations(),
      [], // no signers
      Signature.empty().toViemSignature(),
      `0x${'0'.repeat(64)}`, // 32 empty bytes
      header.blobsHash.toString(),
      flags,
    ] as const;

    const ts = BigInt((await this.l1TxUtils.getBlock()).timestamp + this.ethereumSlotDuration);
    const stateOverrides = await this.rollupContract.makePendingCheckpointNumberOverride(
      opts?.forcePendingCheckpointNumber,
    );
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
      { time: ts + 1n },
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

    try {
      const { gasUsed } = await this.l1TxUtils.simulate(request, undefined, undefined, ErrorsAbi);
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
        reason,
      };
    } catch (err) {
      const viemError = formatViemError(err);

      // If the error is due to the checkpoint not being in the pending chain, and it was indeed removed by someone else,
      // we can safely ignore it and return undefined so we go ahead with checkpoint building.
      if (viemError.message?.includes('Rollup__BlockNotInPendingChain')) {
        this.log.verbose(
          `Simulation for invalidate checkpoint ${checkpointNumber} failed due to checkpoint not being in pending chain`,
          { ...logData, request, error: viemError.message },
        );
        const latestPendingCheckpointNumber = await this.rollupContract.getCheckpointNumber();
        if (latestPendingCheckpointNumber < checkpointNumber) {
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

    const attestationsAndSigners = new CommitteeAttestationsAndSigners(
      validationResult.attestations,
    ).getPackedAttestations();

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

  /** Simulates `propose` to make sure that the checkpoint is valid for submission */
  @trackSpan('SequencerPublisher.validateCheckpointForSubmission')
  public async validateCheckpointForSubmission(
    checkpoint: Checkpoint,
    attestationsAndSigners: CommitteeAttestationsAndSigners,
    attestationsAndSignersSignature: Signature,
    options: { forcePendingCheckpointNumber?: CheckpointNumber },
  ): Promise<bigint> {
    const ts = BigInt((await this.l1TxUtils.getBlock()).timestamp + this.ethereumSlotDuration);

    // TODO(palla/mbps): This should not be needed, there's no flow where we propose with zero attestations. Or is there?
    // If we have no attestations, we still need to provide the empty attestations
    // so that the committee is recalculated correctly
    // const ignoreSignatures = attestationsAndSigners.attestations.length === 0;
    // if (ignoreSignatures) {
    //   const { committee } = await this.epochCache.getCommittee(block.header.globalVariables.slotNumber);
    //   if (!committee) {
    //     this.log.warn(`No committee found for slot ${block.header.globalVariables.slotNumber}`);
    //     throw new Error(`No committee found for slot ${block.header.globalVariables.slotNumber}`);
    //   }
    //   attestationsAndSigners.attestations = committee.map(committeeMember =>
    //     CommitteeAttestation.fromAddress(committeeMember),
    //   );
    // }

    const blobFields = checkpoint.toBlobFields();
    const blobs = getBlobsPerL1Block(blobFields);
    const blobInput = getPrefixedEthBlobCommitments(blobs);

    const args = [
      {
        header: checkpoint.header.toViem(),
        archive: toHex(checkpoint.archive.root.toBuffer()),
        oracleInput: {
          feeAssetPriceModifier: 0n,
        },
      },
      attestationsAndSigners.getPackedAttestations(),
      attestationsAndSigners.getSigners().map(signer => signer.toString()),
      attestationsAndSignersSignature.toViemSignature(),
      blobInput,
    ] as const;

    await this.simulateProposeTx(args, ts, options);
    return ts;
  }

  private async enqueueCastSignalHelper(
    slotNumber: SlotNumber,
    timestamp: bigint,
    signalType: GovernanceSignalAction,
    payload: EthAddress,
    base: IEmpireBase,
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

    if (await this.isPayloadEmpty(payload)) {
      this.log.warn(`Skipping vote cast for payload with empty code`);
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

    try {
      await this.l1TxUtils.simulate(request, { time: timestamp }, [], ErrorsAbi);
      this.log.debug(`Simulation for ${action} at slot ${slotNumber} succeeded`, { request });
    } catch (err) {
      this.log.error(`Failed simulation for ${action} at slot ${slotNumber} (enqueuing the action anyway)`, err);
      // Yes, we enqueue the request anyway, in case there was a bug with the simulation itself
    }

    // TODO(palla/slash): All votes (governance and slashing) should txTimeoutAt at the end of the slot.
    this.addRequest({
      gasConfig: { gasLimit: SequencerPublisher.VOTE_GAS_GUESS },
      action,
      request,
      lastValidL2Slot: slotNumber,
      checkSuccess: (_request, result) => {
        const success =
          result &&
          result.receipt &&
          result.receipt.status === 'success' &&
          tryExtractEvent(result.receipt.logs, base.address.toString(), EmpireBaseAbi, 'SignalCast');

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

  private async isPayloadEmpty(payload: EthAddress): Promise<boolean> {
    const key = payload.toString();
    const cached = this.isPayloadEmptyCache.get(key);
    if (cached) {
      return cached;
    }
    const isEmpty = !(await this.l1TxUtils.getCode(payload));
    this.isPayloadEmptyCache.set(key, isEmpty);
    return isEmpty;
  }

  /**
   * Enqueues a governance castSignal transaction to cast a signal for a given slot number.
   * @param slotNumber - The slot number to cast a signal for.
   * @param timestamp - The timestamp of the slot to cast a signal for.
   * @returns True if the signal was successfully enqueued, false otherwise.
   */
  public enqueueGovernanceCastSignal(
    governancePayload: EthAddress,
    slotNumber: SlotNumber,
    timestamp: bigint,
    signerAddress: EthAddress,
    signer: (msg: TypedDataDefinition) => Promise<`0x${string}`>,
  ): Promise<boolean> {
    return this.enqueueCastSignalHelper(
      slotNumber,
      timestamp,
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
    timestamp: bigint,
    signerAddress: EthAddress,
    signer: (msg: TypedDataDefinition) => Promise<`0x${string}`>,
  ): Promise<boolean> {
    if (actions.length === 0) {
      this.log.debug(`No slashing actions to enqueue for slot ${slotNumber}`);
      return false;
    }

    for (const action of actions) {
      switch (action.type) {
        case 'vote-empire-payload': {
          if (this.slashingProposerContract?.type !== 'empire') {
            this.log.error('Cannot vote for empire payload on non-empire slashing contract');
            break;
          }
          this.log.debug(`Enqueuing slashing vote for payload ${action.payload} at slot ${slotNumber}`, {
            signerAddress,
          });
          await this.enqueueCastSignalHelper(
            slotNumber,
            timestamp,
            'empire-slashing-signal',
            action.payload,
            this.slashingProposerContract,
            signerAddress,
            signer,
          );
          break;
        }

        case 'create-empire-payload': {
          this.log.debug(`Enqueuing slashing create payload at slot ${slotNumber}`, { slotNumber, signerAddress });
          const request = this.slashFactoryContract.buildCreatePayloadRequest(action.data);
          await this.simulateAndEnqueueRequest(
            'create-empire-payload',
            request,
            (receipt: TransactionReceipt) =>
              !!this.slashFactoryContract.tryExtractSlashPayloadCreatedEvent(receipt.logs),
            slotNumber,
            timestamp,
          );
          break;
        }

        case 'execute-empire-payload': {
          this.log.debug(`Enqueuing slashing execute payload at slot ${slotNumber}`, { slotNumber, signerAddress });
          if (this.slashingProposerContract?.type !== 'empire') {
            this.log.error('Cannot execute slashing payload on non-empire slashing contract');
            return false;
          }
          const empireSlashingProposer = this.slashingProposerContract as EmpireSlashingProposerContract;
          const request = empireSlashingProposer.buildExecuteRoundRequest(action.round);
          await this.simulateAndEnqueueRequest(
            'execute-empire-payload',
            request,
            (receipt: TransactionReceipt) => !!empireSlashingProposer.tryExtractPayloadSubmittedEvent(receipt.logs),
            slotNumber,
            timestamp,
          );
          break;
        }

        case 'vote-offenses': {
          this.log.debug(`Enqueuing slashing vote for ${action.votes.length} votes at slot ${slotNumber}`, {
            slotNumber,
            round: action.round,
            votesCount: action.votes.length,
            signerAddress,
          });
          if (this.slashingProposerContract?.type !== 'tally') {
            this.log.error('Cannot vote for slashing offenses on non-tally slashing contract');
            return false;
          }
          const tallySlashingProposer = this.slashingProposerContract as TallySlashingProposerContract;
          const votes = bufferToHex(encodeSlashConsensusVotes(action.votes));
          const request = await tallySlashingProposer.buildVoteRequestFromSigner(votes, slotNumber, signer);
          await this.simulateAndEnqueueRequest(
            'vote-offenses',
            request,
            (receipt: TransactionReceipt) => !!tallySlashingProposer.tryExtractVoteCastEvent(receipt.logs),
            slotNumber,
            timestamp,
          );
          break;
        }

        case 'execute-slash': {
          this.log.debug(`Enqueuing slash execution for round ${action.round} at slot ${slotNumber}`, {
            slotNumber,
            round: action.round,
            signerAddress,
          });
          if (this.slashingProposerContract?.type !== 'tally') {
            this.log.error('Cannot execute slashing offenses on non-tally slashing contract');
            return false;
          }
          const tallySlashingProposer = this.slashingProposerContract as TallySlashingProposerContract;
          const request = tallySlashingProposer.buildExecuteRoundRequest(action.round, action.committees);
          await this.simulateAndEnqueueRequest(
            'execute-slash',
            request,
            (receipt: TransactionReceipt) => !!tallySlashingProposer.tryExtractRoundExecutedEvent(receipt.logs),
            slotNumber,
            timestamp,
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

  /** Simulates and enqueues a proposal for a checkpoint on L1 */
  public async enqueueProposeCheckpoint(
    checkpoint: Checkpoint,
    attestationsAndSigners: CommitteeAttestationsAndSigners,
    attestationsAndSignersSignature: Signature,
    opts: { txTimeoutAt?: Date; forcePendingCheckpointNumber?: CheckpointNumber } = {},
  ): Promise<void> {
    const checkpointHeader = checkpoint.header;

    const blobFields = checkpoint.toBlobFields();
    const blobs = getBlobsPerL1Block(blobFields);

    const proposeTxArgs = {
      header: checkpointHeader,
      archive: checkpoint.archive.root.toBuffer(),
      blobs,
      attestationsAndSigners,
      attestationsAndSignersSignature,
    };

    let ts: bigint;

    try {
      // @note  This will make sure that we are passing the checks for our header ASSUMING that the data is also made available
      //        This means that we can avoid the simulation issues in later checks.
      //        By simulation issue, I mean the fact that the block.timestamp is equal to the last block, not the next, which
      //        make time consistency checks break.
      // TODO(palla): Check whether we're validating twice, once here and once within addProposeTx, since we call simulateProposeTx in both places.
      ts = await this.validateCheckpointForSubmission(
        checkpoint,
        attestationsAndSigners,
        attestationsAndSignersSignature,
        opts,
      );
    } catch (err: any) {
      this.log.error(`Checkpoint validation failed. ${err instanceof Error ? err.message : 'No error message'}`, err, {
        ...checkpoint.getStats(),
        slotNumber: checkpoint.header.slotNumber,
        forcePendingCheckpointNumber: opts.forcePendingCheckpointNumber,
      });
      throw err;
    }

    this.log.verbose(`Enqueuing checkpoint propose transaction`, { ...checkpoint.toCheckpointInfo(), ...opts });
    await this.addProposeTx(checkpoint, proposeTxArgs, opts, ts);
  }

  public enqueueInvalidateCheckpoint(
    request: InvalidateCheckpointRequest | undefined,
    opts: { txTimeoutAt?: Date } = {},
  ) {
    if (!request) {
      return;
    }

    // We issued the simulation against the rollup contract, so we need to account for the overhead of the multicall3
    const gasLimit = this.l1TxUtils.bumpGasLimit(BigInt(Math.ceil((Number(request.gasUsed) * 64) / 63)));

    const { gasUsed, checkpointNumber } = request;
    const logData = { gasUsed, checkpointNumber, gasLimit, opts };
    this.log.verbose(`Enqueuing invalidate checkpoint request`, logData);
    this.addRequest({
      action: `invalidate-by-${request.reason}`,
      request: request.request,
      gasConfig: { gasLimit, txTimeoutAt: opts.txTimeoutAt },
      lastValidL2Slot: SlotNumber(this.getCurrentL2Slot() + 2),
      checkSuccess: (_req, result) => {
        const success =
          result &&
          result.receipt &&
          result.receipt.status === 'success' &&
          tryExtractEvent(result.receipt.logs, this.rollupContract.address, RollupAbi, 'CheckpointInvalidated');
        if (!success) {
          this.log.warn(`Invalidate checkpoint ${request.checkpointNumber} failed`, { ...result, ...logData });
        } else {
          this.log.info(`Invalidate checkpoint ${request.checkpointNumber} succeeded`, { ...result, ...logData });
        }
        return !!success;
      },
    });
  }

  private async simulateAndEnqueueRequest(
    action: Action,
    request: L1TxRequest,
    checkSuccess: (receipt: TransactionReceipt) => boolean | undefined,
    slotNumber: SlotNumber,
    timestamp: bigint,
  ) {
    const logData = { slotNumber, timestamp, gasLimit: undefined as bigint | undefined };
    if (this.lastActions[action] && this.lastActions[action] === slotNumber) {
      this.log.debug(`Skipping duplicate action ${action} for slot ${slotNumber}`);
      return false;
    }

    const cachedLastActionSlot = this.lastActions[action];
    this.lastActions[action] = slotNumber;

    this.log.debug(`Simulating ${action} for slot ${slotNumber}`, logData);

    let gasUsed: bigint;
    try {
      ({ gasUsed } = await this.l1TxUtils.simulate(request, { time: timestamp }, [], ErrorsAbi)); // TODO(palla/slash): Check the timestamp logic
      this.log.verbose(`Simulation for ${action} succeeded`, { ...logData, request, gasUsed });
    } catch (err) {
      const viemError = formatViemError(err);
      this.log.error(`Simulation for ${action} at ${slotNumber} failed`, viemError, logData);
      return false;
    }

    // We issued the simulation against the rollup contract, so we need to account for the overhead of the multicall3
    const gasLimit = this.l1TxUtils.bumpGasLimit(BigInt(Math.ceil((Number(gasUsed) * 64) / 63)));
    logData.gasLimit = gasLimit;

    this.log.debug(`Enqueuing ${action}`, logData);
    this.addRequest({
      action,
      request,
      gasConfig: { gasLimit },
      lastValidL2Slot: slotNumber,
      checkSuccess: (_req, result) => {
        const success = result && result.receipt && result.receipt.status === 'success' && checkSuccess(result.receipt);
        if (!success) {
          this.log.warn(`Action ${action} at ${slotNumber} failed`, { ...result, ...logData });
          this.lastActions[action] = cachedLastActionSlot;
        } else {
          this.log.info(`Action ${action} at ${slotNumber} succeeded`, { ...result, ...logData });
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
    this.l1TxUtils.interrupt();
  }

  /** Restarts the publisher after calling `interrupt`. */
  public restart() {
    this.interrupted = false;
    this.l1TxUtils.restart();
  }

  private async prepareProposeTx(
    encodedData: L1ProcessArgs,
    timestamp: bigint,
    options: { forcePendingCheckpointNumber?: CheckpointNumber },
  ) {
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
      // Normal mode - use estimateGas with blob inputs
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
        .catch(err => {
          const { message, metaMessages } = formatViemError(err);
          this.log.error(`Failed to validate blobs`, message, { metaMessages });
          throw new Error('Failed to validate blobs');
        });
    }
    const signers = encodedData.attestationsAndSigners.getSigners().map(signer => signer.toString());

    const args = [
      {
        header: encodedData.header.toViem(),
        archive: toHex(encodedData.archive),
        oracleInput: {
          // We are currently not modifying these. See #9963
          feeAssetPriceModifier: 0n,
        },
      },
      encodedData.attestationsAndSigners.getPackedAttestations(),
      signers,
      encodedData.attestationsAndSignersSignature.toViemSignature(),
      blobInput,
    ] as const;

    const { rollupData, simulationResult } = await this.simulateProposeTx(args, timestamp, options);

    return { args, blobEvaluationGas, rollupData, simulationResult };
  }

  /**
   * Simulates the propose tx with eth_simulateV1
   * @param args - The propose tx args
   * @param timestamp - The timestamp to simulate proposal at
   * @returns The simulation result
   */
  private async simulateProposeTx(
    args: readonly [
      {
        readonly header: ViemHeader;
        readonly archive: `0x${string}`;
        readonly oracleInput: {
          readonly feeAssetPriceModifier: 0n;
        };
      },
      ViemCommitteeAttestations,
      `0x${string}`[], // Signers
      ViemSignature,
      `0x${string}`,
    ],
    timestamp: bigint,
    options: { forcePendingCheckpointNumber?: CheckpointNumber },
  ) {
    const rollupData = encodeFunctionData({
      abi: RollupAbi,
      functionName: 'propose',
      args,
    });

    // override the pending checkpoint number if requested
    const forcePendingCheckpointNumberStateDiff = (
      options.forcePendingCheckpointNumber !== undefined
        ? await this.rollupContract.makePendingCheckpointNumberOverride(options.forcePendingCheckpointNumber)
        : []
    ).flatMap(override => override.stateDiff ?? []);

    const stateOverrides: StateOverride = [
      {
        address: this.rollupContract.address,
        // @note we override checkBlob to false since blobs are not part simulate()
        stateDiff: [
          { slot: toPaddedHex(RollupContract.checkBlobStorageSlot, true), value: toPaddedHex(0n, true) },
          ...forcePendingCheckpointNumberStateDiff,
        ],
      },
    ];
    // In fisherman mode, simulate as the proposer but with sufficient balance
    if (this.proposerAddressForSimulation) {
      stateOverrides.push({
        address: this.proposerAddressForSimulation.toString(),
        balance: 10n * WEI_CONST * WEI_CONST, // 10 ETH
      });
    }

    const simulationResult = await this.l1TxUtils
      .simulate(
        {
          to: this.rollupContract.address,
          data: rollupData,
          gas: SequencerPublisher.PROPOSE_GAS_GUESS,
          ...(this.proposerAddressForSimulation && { from: this.proposerAddressForSimulation.toString() }),
        },
        {
          // @note we add 1n to the timestamp because geth implementation doesn't like simulation timestamp to be equal to the current block timestamp
          time: timestamp + 1n,
          // @note reth should have a 30m gas limit per block but throws errors that this tx is beyond limit so we increase here
          gasLimit: SequencerPublisher.PROPOSE_GAS_GUESS * 2n,
        },
        stateOverrides,
        RollupAbi,
        {
          // @note fallback gas estimate to use if the node doesn't support simulation API
          fallbackGasEstimate: SequencerPublisher.PROPOSE_GAS_GUESS,
        },
      )
      .catch(err => {
        // In fisherman mode, we expect ValidatorSelection__MissingProposerSignature since fisherman doesn't have proposer signature
        const viemError = formatViemError(err);
        if (this.config.fishermanMode && viemError.message?.includes('ValidatorSelection__MissingProposerSignature')) {
          this.log.debug(`Ignoring expected ValidatorSelection__MissingProposerSignature error in fisherman mode`);
          // Return a minimal simulation result with the fallback gas estimate
          return {
            gasUsed: SequencerPublisher.PROPOSE_GAS_GUESS,
            logs: [],
          };
        }
        this.log.error(`Failed to simulate propose tx`, viemError);
        throw err;
      });

    return { rollupData, simulationResult };
  }

  private async addProposeTx(
    checkpoint: Checkpoint,
    encodedData: L1ProcessArgs,
    opts: { txTimeoutAt?: Date; forcePendingCheckpointNumber?: CheckpointNumber } = {},
    timestamp: bigint,
  ): Promise<void> {
    const slot = checkpoint.header.slotNumber;
    const timer = new Timer();
    const kzg = Blob.getViemKzgInstance();
    const { rollupData, simulationResult, blobEvaluationGas } = await this.prepareProposeTx(
      encodedData,
      timestamp,
      opts,
    );
    const startBlock = await this.l1TxUtils.getBlockNumber();
    const gasLimit = this.l1TxUtils.bumpGasLimit(
      BigInt(Math.ceil((Number(simulationResult.gasUsed) * 64) / 63)) +
        blobEvaluationGas +
        SequencerPublisher.MULTICALL_OVERHEAD_GAS_GUESS, // We issue the simulation against the rollup contract, so we need to account for the overhead of the multicall3
    );

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
      gasConfig: { ...opts, gasLimit },
      blobConfig: {
        blobs: encodedData.blobs.map(b => b.data),
        kzg,
      },
      checkSuccess: (_request, result) => {
        if (!result) {
          return false;
        }
        const { receipt, stats, errorMsg } = result;
        const success =
          receipt &&
          receipt.status === 'success' &&
          tryExtractEvent(receipt.logs, this.rollupContract.address, RollupAbi, 'CheckpointProposed');

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
}
