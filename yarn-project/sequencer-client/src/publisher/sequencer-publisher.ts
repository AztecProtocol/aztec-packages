import type { L2Block } from '@aztec/aztec.js';
import { Blob } from '@aztec/blob-lib';
import { type BlobSinkClientInterface, createBlobSinkClient } from '@aztec/blob-sink/client';
import type { EpochCache } from '@aztec/epoch-cache';
import {
  FormattedViemError,
  type GasPrice,
  type GovernanceProposerContract,
  type IEmpireBase,
  type L1BlobInputs,
  type L1ContractsConfig,
  type L1GasConfig,
  type L1TxRequest,
  MULTI_CALL_3_ADDRESS,
  Multicall3,
  RollupContract,
  type SlashingProposerContract,
  type TransactionStats,
  type ViemCommitteeAttestations,
  type ViemHeader,
  type ViemStateReference,
  formatViemError,
  tryExtractEvent,
} from '@aztec/ethereum';
import type { L1TxUtilsWithBlobs } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import { sumBigint } from '@aztec/foundation/bigint';
import { toHex as toPaddedHex } from '@aztec/foundation/bigint-buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import { EmpireBaseAbi, ErrorsAbi, RollupAbi } from '@aztec/l1-artifacts';
import { CommitteeAttestation, type ValidateBlockResult } from '@aztec/stdlib/block';
import { ConsensusPayload, SignatureDomainSeparator, getHashedSignaturePayload } from '@aztec/stdlib/p2p';
import type { L1PublishBlockStats } from '@aztec/stdlib/stats';
import { type ProposedBlockHeader, StateReference, TxHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import pick from 'lodash.pick';
import { type TransactionReceipt, type TypedDataDefinition, encodeFunctionData } from 'viem';

import type { PublisherConfig, TxSenderConfig } from './config.js';
import { SequencerPublisherMetrics } from './sequencer-publisher-metrics.js';

/** Arguments to the process method of the rollup contract */
type L1ProcessArgs = {
  /** The L2 block header. */
  header: ProposedBlockHeader;
  /** The parent header hash. */
  parentHeaderHash: Fr;
  /** State reference after the L2 block is applied. */
  stateReference: StateReference;
  /** L2 block blobs containing all tx effects. */
  blobs: Blob[];
  /** L2 block tx hashes */
  txHashes: TxHash[];
  /** Attestations */
  attestations?: CommitteeAttestation[];
};

export enum SignalType {
  GOVERNANCE,
  SLASHING,
}

type GetSlashPayloadCallBack = (slotNumber: bigint) => Promise<EthAddress | undefined>;

const Actions = [
  'propose',
  'governance-signal',
  'slashing-signal',
  'invalidate-by-invalid-attestation',
  'invalidate-by-insufficient-attestations',
] as const;
export type Action = (typeof Actions)[number];

// Sorting for actions such that invalidations go first, then proposals, and last votes
const compareActions = (a: Action, b: Action) => Actions.indexOf(b) - Actions.indexOf(a);

export type InvalidateBlockRequest = {
  request: L1TxRequest;
  reason: 'invalid-attestation' | 'insufficient-attestations';
  gasUsed: bigint;
  blockNumber: number;
  forcePendingBlockNumber: number;
};

interface RequestWithExpiry {
  action: Action;
  request: L1TxRequest;
  lastValidL2Slot: bigint;
  gasConfig?: Pick<L1GasConfig, 'txTimeoutAt' | 'gasLimit'>;
  blobConfig?: L1BlobInputs;
  checkSuccess: (
    request: L1TxRequest,
    result?: { receipt: TransactionReceipt; gasPrice: GasPrice; stats?: TransactionStats; errorMsg?: string },
  ) => boolean;
}

export class SequencerPublisher {
  private interrupted = false;
  private metrics: SequencerPublisherMetrics;
  public epochCache: EpochCache;
  private dateProvider: DateProvider;

  protected governanceLog = createLogger('sequencer:publisher:governance');
  protected governanceProposerAddress?: EthAddress;
  private governancePayload: EthAddress = EthAddress.ZERO;

  protected slashingLog = createLogger('sequencer:publisher:slashing');
  protected slashingProposerAddress?: EthAddress;
  private getSlashPayload?: GetSlashPayloadCallBack = undefined;

  private myLastSignals: Record<SignalType, bigint> = {
    [SignalType.GOVERNANCE]: 0n,
    [SignalType.SLASHING]: 0n,
  };

  protected log = createLogger('sequencer:publisher');
  protected ethereumSlotDuration: bigint;

  private blobSinkClient: BlobSinkClientInterface;
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
  public slashingProposerContract: SlashingProposerContract;

  protected requests: RequestWithExpiry[] = [];

  constructor(
    private config: TxSenderConfig & PublisherConfig & Pick<L1ContractsConfig, 'ethereumSlotDuration'>,
    deps: {
      telemetry?: TelemetryClient;
      blobSinkClient?: BlobSinkClientInterface;
      l1TxUtils: L1TxUtilsWithBlobs;
      rollupContract: RollupContract;
      slashingProposerContract: SlashingProposerContract;
      governanceProposerContract: GovernanceProposerContract;
      epochCache: EpochCache;
      dateProvider: DateProvider;
    },
  ) {
    this.ethereumSlotDuration = BigInt(config.ethereumSlotDuration);
    this.epochCache = deps.epochCache;
    this.dateProvider = deps.dateProvider;

    this.blobSinkClient =
      deps.blobSinkClient ?? createBlobSinkClient(config, { logger: createLogger('sequencer:blob-sink:client') });

    const telemetry = deps.telemetry ?? getTelemetryClient();
    this.metrics = new SequencerPublisherMetrics(telemetry, 'SequencerPublisher');
    this.l1TxUtils = deps.l1TxUtils;

    this.rollupContract = deps.rollupContract;

    this.govProposerContract = deps.governanceProposerContract;
    this.slashingProposerContract = deps.slashingProposerContract;
  }

  public getRollupContract(): RollupContract {
    return this.rollupContract;
  }

  public registerSlashPayloadGetter(callback: GetSlashPayloadCallBack) {
    this.getSlashPayload = callback;
  }

  public getSenderAddress() {
    return EthAddress.fromString(this.l1TxUtils.getSenderAddress());
  }

  public getGovernancePayload() {
    return this.governancePayload;
  }

  public setGovernancePayload(payload: EthAddress) {
    this.governancePayload = payload;
  }

  public addRequest(request: RequestWithExpiry) {
    this.requests.push(request);
  }

  public getCurrentL2Slot(): bigint {
    return this.epochCache.getEpochAndSlotNow().slot;
  }

  /**
   * Sends all requests that are still valid.
   * @returns one of:
   * - A receipt and stats if the tx succeeded
   * - a receipt and errorMsg if it failed on L1
   * - undefined if no valid requests are found OR the tx failed to send.
   */
  public async sendRequests() {
    const requestsToProcess = [...this.requests];
    this.requests = [];
    if (this.interrupted) {
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
    const gasConfig: RequestWithExpiry['gasConfig'] = { gasLimit, txTimeoutAt };

    // Sort the requests so that proposals always go first
    // This ensures the committee gets precomputed correctly
    validRequests.sort((a, b) => compareActions(a.action, b.action));

    try {
      this.log.debug('Forwarding transactions', { validRequests: validRequests.map(request => request.action) });
      const result = await Multicall3.forward(
        validRequests.map(request => request.request),
        this.l1TxUtils,
        gasConfig,
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
        this.metrics.recordSenderBalance(await this.l1TxUtils.getSenderBalance(), this.l1TxUtils.getSenderAddress());
      } catch (err) {
        this.log.warn(`Failed to record balance after sending tx: ${err}`);
      }
    }
  }

  private callbackBundledTransactions(
    requests: RequestWithExpiry[],
    result?: { receipt: TransactionReceipt; gasPrice: GasPrice } | FormattedViemError,
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
   * @param lastHeaderHash - The hash of the last header that we expect to be current state
   * @param msgSender - The address of the proposer
   * @param opts - Optional options to force the pending block number
   * @returns The slot and block number if it is possible to propose, undefined otherwise
   */
  public canProposeAtNextEthBlock(
    lastHeaderHash: Fr,
    msgSender: EthAddress,
    opts: { forcePendingBlockNumber?: number } = {},
  ) {
    // TODO: #14291 - should loop through multiple keys to check if any of them can propose
    const ignoredErrors = ['SlotAlreadyInChain', 'InvalidProposer', 'InvalidArchive'];

    return this.rollupContract
      .canProposeAtNextEthBlock(lastHeaderHash.toBuffer(), msgSender.toString(), this.ethereumSlotDuration, opts)
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
  public async validateBlockHeader(
    header: ProposedBlockHeader,
    opts?: { forcePendingBlockNumber: number | undefined },
  ) {
    const flags = { ignoreDA: true, ignoreSignatures: true };

    const args = [
      header.toViem(),
      RollupContract.packAttestations([]),
      [], // no signers
      `0x${'0'.repeat(64)}`, // 32 empty bytes
      header.contentCommitment.blobsHash.toString(),
      flags,
    ] as const;

    const ts = BigInt((await this.l1TxUtils.getBlock()).timestamp + this.ethereumSlotDuration);

    // use sender balance to simulate
    const balance = await this.l1TxUtils.getSenderBalance();
    await this.l1TxUtils.simulate(
      {
        to: this.rollupContract.address,
        data: encodeFunctionData({ abi: RollupAbi, functionName: 'validateHeaderWithAttestations', args }),
        from: MULTI_CALL_3_ADDRESS,
      },
      { time: ts + 1n },
      [
        { address: MULTI_CALL_3_ADDRESS, balance },
        ...(await this.rollupContract.makePendingBlockNumberOverride(opts?.forcePendingBlockNumber)),
      ],
    );
  }

  /**
   * Simulate making a call to invalidate a block with invalid attestations. Returns undefined if no need to invalidate.
   * @param block - The block to invalidate and the criteria for invalidation (as returned by the archiver)
   */
  public async simulateInvalidateBlock(
    validationResult: ValidateBlockResult,
  ): Promise<InvalidateBlockRequest | undefined> {
    if (validationResult.valid) {
      return undefined;
    }

    const { reason, block } = validationResult;
    const blockNumber = block.block.number;
    const logData = { ...block.block.toBlockInfo(), reason };

    const currentBlockNumber = await this.rollupContract.getBlockNumber();
    if (currentBlockNumber < validationResult.block.block.number) {
      this.log.verbose(
        `Skipping block ${blockNumber} invalidation since it has already been removed from the pending chain`,
        { currentBlockNumber, ...logData },
      );
      return undefined;
    }

    const request = this.buildInvalidateBlockRequest(validationResult);
    this.log.debug(`Simulating invalidate block ${blockNumber}`, logData);

    try {
      const { gasUsed } = await this.l1TxUtils.simulate(request, undefined, undefined, ErrorsAbi);
      this.log.verbose(`Simulation for invalidate block ${blockNumber} succeeded`, { ...logData, request, gasUsed });

      return { request, gasUsed, blockNumber, forcePendingBlockNumber: blockNumber - 1, reason };
    } catch (err) {
      const viemError = formatViemError(err);

      // If the error is due to the block not being in the pending chain, and it was indeed removed by someone else,
      // we can safely ignore it and return undefined so we go ahead with block building.
      if (viemError.message?.includes('Rollup__BlockNotInPendingChain')) {
        this.log.verbose(
          `Simulation for invalidate block ${blockNumber} failed due to block not being in pending chain`,
          { ...logData, request, error: viemError.message },
        );
        const latestPendingBlockNumber = await this.rollupContract.getBlockNumber();
        if (latestPendingBlockNumber < blockNumber) {
          this.log.verbose(`Block number ${blockNumber} has already been invalidated`, { ...logData });
          return undefined;
        } else {
          this.log.error(
            `Simulation for invalidate ${blockNumber} failed and it is still in pending chain`,
            viemError,
            logData,
          );
          throw new Error(`Failed to simulate invalidate block ${blockNumber} while it is still in pending chain`, {
            cause: viemError,
          });
        }
      }

      // Otherwise, throw. We cannot build the next block if we cannot invalidate the previous one.
      this.log.error(`Simulation for invalidate block ${blockNumber} failed`, viemError, logData);
      throw new Error(`Failed to simulate invalidate block ${blockNumber}`, { cause: viemError });
    }
  }

  private buildInvalidateBlockRequest(validationResult: ValidateBlockResult) {
    if (validationResult.valid) {
      throw new Error('Cannot invalidate a valid block');
    }

    const { block, committee, reason } = validationResult;
    const logData = { ...block.block.toBlockInfo(), reason };
    this.log.debug(`Simulating invalidate block ${block.block.number}`, logData);

    if (reason === 'invalid-attestation') {
      return this.rollupContract.buildInvalidateBadAttestationRequest(
        block.block.number,
        block.attestations.map(a => a.toViem()),
        committee,
        validationResult.invalidIndex,
      );
    } else if (reason === 'insufficient-attestations') {
      return this.rollupContract.buildInvalidateInsufficientAttestationsRequest(
        block.block.number,
        block.attestations.map(a => a.toViem()),
        committee,
      );
    } else {
      const _: never = reason;
      throw new Error(`Unknown reason for invalidation`);
    }
  }

  /**
   * @notice  Will simulate `propose` to make sure that the block is valid for submission
   *
   * @dev     Throws if unable to propose
   *
   * @param block - The block to propose
   * @param attestationData - The block's attestation data
   *
   */
  public async validateBlockForSubmission(
    block: L2Block,
    attestationData: { digest: Buffer; attestations: CommitteeAttestation[] } = {
      digest: Buffer.alloc(32),
      attestations: [],
    },
    options: { forcePendingBlockNumber?: number },
  ): Promise<bigint> {
    const ts = BigInt((await this.l1TxUtils.getBlock()).timestamp + this.ethereumSlotDuration);

    // If we have no attestations, we still need to provide the empty attestations
    // so that the committee is recalculated correctly
    const ignoreSignatures = attestationData.attestations.length === 0;
    if (ignoreSignatures) {
      const { committee } = await this.epochCache.getCommittee(block.header.globalVariables.slotNumber.toBigInt());
      if (!committee) {
        this.log.warn(`No committee found for slot ${block.header.globalVariables.slotNumber.toBigInt()}`);
        throw new Error(`No committee found for slot ${block.header.globalVariables.slotNumber.toBigInt()}`);
      }
      attestationData.attestations = committee.map(committeeMember =>
        CommitteeAttestation.fromAddress(committeeMember),
      );
    }
    // @note - should we be verifying attestations here against the digest?

    const blobs = await Blob.getBlobsPerBlock(block.body.toBlobFields());
    const blobInput = Blob.getPrefixedEthBlobCommitments(blobs);

    const formattedAttestations = attestationData.attestations.map(attest => attest.toViem());
    const signers = attestationData.attestations
      .filter(attest => !attest.signature.isEmpty())
      .map(attest => attest.address.toString());

    const args = [
      {
        header: block.header.toPropose().toViem(),
        stateReference: block.header.state.toViem(),
        txHashes: block.body.txEffects.map(txEffect => txEffect.txHash.toString()),
        oracleInput: {
          feeAssetPriceModifier: 0n,
        },
      },
      RollupContract.packAttestations(formattedAttestations),
      signers,
      blobInput,
    ] as const;

    await this.simulateProposeTx(args, ts, options);
    return ts;
  }

  private async enqueueCastSignalHelper(
    slotNumber: bigint,
    timestamp: bigint,
    signalType: SignalType,
    payload: EthAddress,
    base: IEmpireBase,
    signerAddress: EthAddress,
    signer: (msg: TypedDataDefinition) => Promise<`0x${string}`>,
  ): Promise<boolean> {
    if (this.myLastSignals[signalType] >= slotNumber) {
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

    if (roundInfo.lastSignalSlot >= slotNumber) {
      return false;
    }

    const cachedLastVote = this.myLastSignals[signalType];
    this.myLastSignals[signalType] = slotNumber;

    const action = signalType === SignalType.GOVERNANCE ? 'governance-signal' : 'slashing-signal';

    const request = await base.createSignalRequestWithSignature(
      payload.toString(),
      round,
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
      this.log.warn(`Failed simulation for ${action} at slot ${slotNumber} (enqueuing the action anyway)`, err);
      // Yes, we enqueue the request anyway, in case there was a bug with the simulation itself
    }

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
            `Voting in [${action}] for ${payload} at slot ${slotNumber} in round ${round} failed`,
            logData,
          );
          this.myLastSignals[signalType] = cachedLastVote;
          return false;
        } else {
          this.log.info(
            `Voting in [${action}] for ${payload} at slot ${slotNumber} in round ${round} succeeded`,
            logData,
          );
          return true;
        }
      },
    });
    return true;
  }

  private async getSignalConfig(
    slotNumber: bigint,
    signalType: SignalType,
  ): Promise<{ payload: EthAddress; base: IEmpireBase } | undefined> {
    if (signalType === SignalType.GOVERNANCE) {
      return { payload: this.governancePayload, base: this.govProposerContract };
    } else if (signalType === SignalType.SLASHING) {
      if (!this.getSlashPayload) {
        return undefined;
      }
      const slashPayload = await this.getSlashPayload(slotNumber);
      if (!slashPayload) {
        return undefined;
      }
      this.log.info(`Slash payload: ${slashPayload}`);
      return { payload: slashPayload, base: this.slashingProposerContract };
    } else {
      const _: never = signalType;
      throw new Error('Unreachable: Invalid signal type');
    }
  }

  /**
   * Enqueues a castSignal transaction to cast a signal for a given slot number.
   * @param slotNumber - The slot number to cast a signal for.
   * @param timestamp - The timestamp of the slot to cast a signal for.
   * @param signalType - The type of signal to cast.
   * @returns True if the signal was successfully enqueued, false otherwise.
   */
  public async enqueueCastSignal(
    slotNumber: bigint,
    timestamp: bigint,
    signalType: SignalType,
    signerAddress: EthAddress,
    signer: (msg: TypedDataDefinition) => Promise<`0x${string}`>,
  ): Promise<boolean> {
    const signalConfig = await this.getSignalConfig(slotNumber, signalType);
    if (!signalConfig) {
      return false;
    }
    const { payload, base } = signalConfig;
    return this.enqueueCastSignalHelper(slotNumber, timestamp, signalType, payload, base, signerAddress, signer);
  }

  /**
   * Proposes a L2 block on L1.
   *
   * @param block - L2 block to propose.
   * @returns True if the tx has been enqueued, throws otherwise. See #9315
   */
  public async enqueueProposeL2Block(
    block: L2Block,
    parentHeaderHash: Fr,
    attestations?: CommitteeAttestation[],
    txHashes?: TxHash[],
    opts: { txTimeoutAt?: Date; forcePendingBlockNumber?: number } = {},
  ): Promise<boolean> {
    const proposedBlockHeader = block.header.toPropose();

    const consensusPayload = ConsensusPayload.fromBlock(block);
    const digest = getHashedSignaturePayload(consensusPayload, SignatureDomainSeparator.blockAttestation);

    const blobs = await Blob.getBlobsPerBlock(block.body.toBlobFields());
    const proposeTxArgs = {
      header: proposedBlockHeader,
      // archive: block.archive.root.toBuffer(),
      stateReference: block.header.state,
      body: block.body.toBuffer(),
      blobs,
      attestations,
      txHashes: txHashes ?? [],
      parentHeaderHash,
    };

    let ts: bigint;

    try {
      // @note  This will make sure that we are passing the checks for our header ASSUMING that the data is also made available
      //        This means that we can avoid the simulation issues in later checks.
      //        By simulation issue, I mean the fact that the block.timestamp is equal to the last block, not the next, which
      //        make time consistency checks break.
      const attestationData = { digest: digest.toBuffer(), attestations: attestations ?? [] };
      // TODO(palla): Check whether we're validating twice, once here and once within addProposeTx, since we call simulateProposeTx in both places.
      ts = await this.validateBlockForSubmission(block, attestationData, opts);
    } catch (err: any) {
      this.log.error(`Block validation failed. ${err instanceof Error ? err.message : 'No error message'}`, err, {
        ...block.getStats(),
        slotNumber: block.header.globalVariables.slotNumber.toBigInt(),
        forcePendingBlockNumber: opts.forcePendingBlockNumber,
      });
      throw err;
    }

    this.log.verbose(`Enqueuing block propose transaction`, { ...block.toBlockInfo(), ...opts });
    await this.addProposeTx(block, proposeTxArgs, opts, ts);
    return true;
  }

  public enqueueInvalidateBlock(request: InvalidateBlockRequest | undefined, opts: { txTimeoutAt?: Date } = {}) {
    if (!request) {
      return;
    }

    // We issue the simulation against the rollup contract, so we need to account for the overhead of the multicall3
    const gasLimit = this.l1TxUtils.bumpGasLimit(BigInt(Math.ceil((Number(request.gasUsed) * 64) / 63)));

    const logData = { ...pick(request, 'gasUsed', 'blockNumber'), gasLimit, opts };
    this.log.verbose(`Enqueuing invalidate block request`, logData);
    this.addRequest({
      action: `invalidate-by-${request.reason}`,
      request: request.request,
      gasConfig: { gasLimit, txTimeoutAt: opts.txTimeoutAt },
      lastValidL2Slot: this.getCurrentL2Slot() + 2n,
      checkSuccess: (_req, result) => {
        const success =
          result &&
          result.receipt &&
          result.receipt.status === 'success' &&
          tryExtractEvent(result.receipt.logs, this.rollupContract.address, RollupAbi, 'BlockInvalidated');
        if (!success) {
          this.log.warn(`Invalidate block ${request.blockNumber} failed`, { ...result, ...logData });
        } else {
          this.log.info(`Invalidate block ${request.blockNumber} succeeded`, { ...result, ...logData });
        }
        return !!success;
      },
    });
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
    options: { forcePendingBlockNumber?: number },
  ) {
    if (!this.l1TxUtils.client.account) {
      throw new Error('L1 TX utils needs to be initialized with an account wallet.');
    }
    const kzg = Blob.getViemKzgInstance();
    const blobInput = Blob.getPrefixedEthBlobCommitments(encodedData.blobs);
    this.log.debug('Validating blob input', { blobInput });
    const blobEvaluationGas = await this.l1TxUtils
      .estimateGas(
        this.l1TxUtils.client.account,
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

    const attestations = encodedData.attestations ? encodedData.attestations.map(attest => attest.toViem()) : [];
    const txHashes = encodedData.txHashes ? encodedData.txHashes.map(txHash => txHash.toString()) : [];

    const signers = encodedData.attestations
      ?.filter(attest => !attest.signature.isEmpty())
      .map(attest => attest.address.toString());

    const args = [
      {
        header: encodedData.header.toViem(),
        stateReference: encodedData.stateReference.toViem(),
        oracleInput: {
          // We are currently not modifying these. See #9963
          feeAssetPriceModifier: 0n,
        },
        txHashes,
        parentHeaderHash: encodedData.parentHeaderHash.toString(),
      },
      RollupContract.packAttestations(attestations),
      signers ?? [],
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
        readonly stateReference: ViemStateReference;
        readonly txHashes: `0x${string}`[];
        readonly oracleInput: {
          readonly feeAssetPriceModifier: 0n;
        };
      },
      ViemCommitteeAttestations,
      `0x${string}`[],
      `0x${string}`,
    ],
    timestamp: bigint,
    options: { forcePendingBlockNumber?: number },
  ) {
    const rollupData = encodeFunctionData({
      abi: RollupAbi,
      functionName: 'propose',
      args,
    });

    // override the pending block number if requested
    const forcePendingBlockNumberStateDiff = (
      options.forcePendingBlockNumber !== undefined
        ? await this.rollupContract.makePendingBlockNumberOverride(options.forcePendingBlockNumber)
        : []
    ).flatMap(override => override.stateDiff ?? []);

    const simulationResult = await this.l1TxUtils
      .simulate(
        {
          to: this.rollupContract.address,
          data: rollupData,
          gas: SequencerPublisher.PROPOSE_GAS_GUESS,
        },
        {
          // @note we add 1n to the timestamp because geth implementation doesn't like simulation timestamp to be equal to the current block timestamp
          time: timestamp + 1n,
          // @note reth should have a 30m gas limit per block but throws errors that this tx is beyond limit so we increase here
          gasLimit: SequencerPublisher.PROPOSE_GAS_GUESS * 2n,
        },
        [
          {
            address: this.rollupContract.address,
            // @note we override checkBlob to false since blobs are not part simulate()
            stateDiff: [
              { slot: toPaddedHex(RollupContract.checkBlobStorageSlot, true), value: toPaddedHex(0n, true) },
              ...forcePendingBlockNumberStateDiff,
            ],
          },
        ],
        RollupAbi,
        {
          // @note fallback gas estimate to use if the node doesn't support simulation API
          fallbackGasEstimate: SequencerPublisher.PROPOSE_GAS_GUESS,
        },
      )
      .catch(err => {
        this.log.error(`Failed to simulate propose tx`, err);
        throw err;
      });

    return { rollupData, simulationResult };
  }

  private async addProposeTx(
    block: L2Block,
    encodedData: L1ProcessArgs,
    opts: { txTimeoutAt?: Date; forcePendingBlockNumber?: number } = {},
    timestamp: bigint,
  ): Promise<void> {
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

    // Send the blobs to the blob sink preemptively. This helps in tests where the sequencer mistakingly thinks that the propose
    // tx fails but it does get mined. We make sure that the blobs are sent to the blob sink regardless of the tx outcome.
    void this.blobSinkClient.sendBlobsToBlobSink(encodedData.blobs).catch(_err => {
      this.log.error('Failed to send blobs to blob sink');
    });

    return this.addRequest({
      action: 'propose',
      request: {
        to: this.rollupContract.address,
        data: rollupData,
      },
      lastValidL2Slot: block.header.globalVariables.slotNumber.toBigInt(),
      gasConfig: { ...opts, gasLimit },
      blobConfig: {
        blobs: encodedData.blobs.map(b => b.data),
        kzg,
      },
      checkSuccess: (request, result) => {
        if (!result) {
          return false;
        }
        const { receipt, stats, errorMsg } = result;
        const success =
          receipt &&
          receipt.status === 'success' &&
          tryExtractEvent(receipt.logs, this.rollupContract.address, RollupAbi, 'L2BlockProposed');
        if (success) {
          const endBlock = receipt.blockNumber;
          const inclusionBlocks = Number(endBlock - startBlock);
          const publishStats: L1PublishBlockStats = {
            gasPrice: receipt.effectiveGasPrice,
            gasUsed: receipt.gasUsed,
            blobGasUsed: receipt.blobGasUsed ?? 0n,
            blobDataGas: receipt.blobGasPrice ?? 0n,
            transactionHash: receipt.transactionHash,
            ...pick(stats!, 'calldataGas', 'calldataSize', 'sender'),
            ...block.getStats(),
            eventName: 'rollup-published-to-l1',
            blobCount: encodedData.blobs.length,
            inclusionBlocks,
          };
          this.log.info(`Published L2 block to L1 rollup contract`, { ...stats, ...block.getStats(), ...receipt });
          this.metrics.recordProcessBlockTx(timer.ms(), publishStats);

          return true;
        } else {
          this.metrics.recordFailedTx('process');
          this.log.error(`Rollup process tx failed: ${errorMsg ?? 'no error message'}`, undefined, {
            ...block.getStats(),
            receipt,
            txHash: receipt.transactionHash,
            slotNumber: block.header.globalVariables.slotNumber.toBigInt(),
          });
          return false;
        }
      },
    });
  }
}
