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
} from '@aztec/ethereum';
import type { L1TxUtilsWithBlobs } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import { sumBigint } from '@aztec/foundation/bigint';
import { toHex as toPaddedHex } from '@aztec/foundation/bigint-buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts';
import { CommitteeAttestation } from '@aztec/stdlib/block';
import { ConsensusPayload, SignatureDomainSeparator, getHashedSignaturePayload } from '@aztec/stdlib/p2p';
import type { L1PublishBlockStats } from '@aztec/stdlib/stats';
import { type ProposedBlockHeader, StateReference, TxHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import pick from 'lodash.pick';
import { type TransactionReceipt, encodeFunctionData, toHex } from 'viem';

import type { PublisherConfig, TxSenderConfig } from './config.js';
import { SequencerPublisherMetrics } from './sequencer-publisher-metrics.js';

/** Arguments to the process method of the rollup contract */
type L1ProcessArgs = {
  /** The L2 block header. */
  header: ProposedBlockHeader;
  /** A root of the archive tree after the L2 block is applied. */
  archive: Buffer;
  /** State reference after the L2 block is applied. */
  stateReference: StateReference;
  /** L2 block blobs containing all tx effects. */
  blobs: Blob[];
  /** L2 block tx hashes */
  txHashes: TxHash[];
  /** Attestations */
  attestations?: CommitteeAttestation[];
};

export enum VoteType {
  GOVERNANCE,
  SLASHING,
}

type GetSlashPayloadCallBack = (slotNumber: bigint) => Promise<EthAddress | undefined>;

export type Action = 'propose' | 'governance-vote' | 'slashing-vote';

interface RequestWithExpiry {
  action: Action;
  request: L1TxRequest;
  lastValidL2Slot: bigint;
  gasConfig?: Pick<L1GasConfig, 'txTimeoutAt' | 'gasLimit'>;
  blobConfig?: L1BlobInputs;
  onResult?: (
    request: L1TxRequest,
    result?: { receipt: TransactionReceipt; gasPrice: GasPrice; stats?: TransactionStats; errorMsg?: string },
  ) => void;
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

  private myLastVotes: Record<VoteType, bigint> = {
    [VoteType.GOVERNANCE]: 0n,
    [VoteType.SLASHING]: 0n,
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

  // Gas report for VotingWithSigTest shows a max gas of 100k, so better err on the safe side
  public static VOTE_GAS_GUESS: bigint = 500_000n;

  public l1TxUtils: L1TxUtilsWithBlobs;
  public rollupContract: RollupContract;
  public govProposerContract: GovernanceProposerContract;
  public slashingProposerContract: SlashingProposerContract;

  protected requests: RequestWithExpiry[] = [];

  constructor(
    config: TxSenderConfig & PublisherConfig & Pick<L1ContractsConfig, 'ethereumSlotDuration'>,
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

    try {
      this.log.debug('Forwarding transactions', {
        validRequests: validRequests.map(request => request.action),
      });
      const result = await Multicall3.forward(
        validRequests.map(request => request.request),
        this.l1TxUtils,
        gasConfig,
        blobConfig,
        this.rollupContract.address,
        this.log,
      );
      this.callbackBundledTransactions(validRequests, result);
      return { result, expiredActions, validActions };
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
    const isError = result instanceof FormattedViemError;
    const success = isError ? false : result?.receipt.status === 'success';
    const logger = success ? this.log.info : this.log.error;
    for (const request of requests) {
      logger(`Bundled [${request.action}] transaction [${success ? 'succeeded' : 'failed'}]`);
      if (!isError) {
        request.onResult?.(request.request, result);
      }
    }
    if (isError) {
      this.log.error('Failed to publish bundled transactions', result);
    }
  }

  /**
   * @notice  Will call `canProposeAtNextEthBlock` to make sure that it is possible to propose
   * @param tipArchive - The archive to check
   * @returns The slot and block number if it is possible to propose, undefined otherwise
   */
  public canProposeAtNextEthBlock(tipArchive: Buffer, msgSender: EthAddress) {
    // TODO: #14291 - should loop through multiple keys to check if any of them can propose
    const ignoredErrors = ['SlotAlreadyInChain', 'InvalidProposer', 'InvalidArchive'];

    return this.rollupContract
      .canProposeAtNextEthBlock(tipArchive, msgSender.toString(), this.ethereumSlotDuration)
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
  public async validateBlockHeader(header: ProposedBlockHeader) {
    const flags = { ignoreDA: true, ignoreSignatures: true };

    const args = [
      header.toViem(),
      RollupContract.packAttestations([]),
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
        data: encodeFunctionData({ abi: RollupAbi, functionName: 'validateHeader', args }),
        from: MULTI_CALL_3_ADDRESS,
      },
      {
        time: ts + 1n,
      },
      [
        {
          address: MULTI_CALL_3_ADDRESS,
          balance,
        },
      ],
    );
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

    const blobs = await Blob.getBlobsPerBlock(block.body.toBlobFields());
    const blobInput = Blob.getPrefixedEthBlobCommitments(blobs);

    const formattedAttestations = attestationData.attestations.map(attest => attest.toViem());

    const args = [
      {
        header: block.header.toPropose().toViem(),
        archive: toHex(block.archive.root.toBuffer()),
        stateReference: block.header.state.toViem(),
        txHashes: block.body.txEffects.map(txEffect => txEffect.txHash.toString()),
        oracleInput: {
          feeAssetPriceModifier: 0n,
        },
      },
      RollupContract.packAttestations(formattedAttestations),
      blobInput,
    ] as const;

    await this.simulateProposeTx(args, ts);
    return ts;
  }

  public async getCurrentEpochCommittee(): Promise<EthAddress[] | undefined> {
    const committee = await this.rollupContract.getCurrentEpochCommittee();
    return committee?.map(EthAddress.fromString);
  }

  private async enqueueCastVoteHelper(
    slotNumber: bigint,
    timestamp: bigint,
    voteType: VoteType,
    payload: EthAddress,
    base: IEmpireBase,
    signer: (msg: `0x${string}`) => Promise<`0x${string}`>,
  ): Promise<boolean> {
    if (this.myLastVotes[voteType] >= slotNumber) {
      return false;
    }
    if (payload.equals(EthAddress.ZERO)) {
      return false;
    }
    const round = await base.computeRound(slotNumber);
    const roundInfo = await base.getRoundInfo(this.rollupContract.address, round);

    if (roundInfo.lastVote >= slotNumber) {
      return false;
    }

    const cachedLastVote = this.myLastVotes[voteType];
    this.myLastVotes[voteType] = slotNumber;

    const action = voteType === VoteType.GOVERNANCE ? 'governance-vote' : 'slashing-vote';

    const request = await base.createVoteRequestWithSignature(payload.toString(), this.l1TxUtils.client, signer);
    this.log.debug(`Created ${action} request with signature`, {
      request,
      round,
      signer: this.l1TxUtils.client.account?.address,
      lastValidL2Slot: slotNumber,
    });

    this.addRequest({
      gasConfig: { gasLimit: SequencerPublisher.VOTE_GAS_GUESS },
      action,
      request,
      lastValidL2Slot: slotNumber,
      onResult: (_request, result) => {
        if (!result || result.receipt.status !== 'success') {
          this.myLastVotes[voteType] = cachedLastVote;
        } else {
          this.log.info(`Voting in [${action}] for ${payload} at slot ${slotNumber} in round ${round}`);
        }
      },
    });
    return true;
  }

  private async getVoteConfig(
    slotNumber: bigint,
    voteType: VoteType,
  ): Promise<{ payload: EthAddress; base: IEmpireBase } | undefined> {
    if (voteType === VoteType.GOVERNANCE) {
      return { payload: this.governancePayload, base: this.govProposerContract };
    } else if (voteType === VoteType.SLASHING) {
      if (!this.getSlashPayload) {
        return undefined;
      }
      const slashPayload = await this.getSlashPayload(slotNumber);
      if (!slashPayload) {
        return undefined;
      }
      this.log.info(`Slash payload: ${slashPayload}`);
      return { payload: slashPayload, base: this.slashingProposerContract };
    }
    throw new Error('Unreachable: Invalid vote type');
  }

  /**
   * Enqueues a castVote transaction to cast a vote for a given slot number.
   * @param slotNumber - The slot number to cast a vote for.
   * @param timestamp - The timestamp of the slot to cast a vote for.
   * @param voteType - The type of vote to cast.
   * @returns True if the vote was successfully enqueued, false otherwise.
   */
  public async enqueueCastVote(
    slotNumber: bigint,
    timestamp: bigint,
    voteType: VoteType,
    signer: (msg: `0x${string}`) => Promise<`0x${string}`>,
  ): Promise<boolean> {
    const voteConfig = await this.getVoteConfig(slotNumber, voteType);
    if (!voteConfig) {
      return false;
    }
    const { payload, base } = voteConfig;
    return this.enqueueCastVoteHelper(slotNumber, timestamp, voteType, payload, base, signer);
  }

  /**
   * Proposes a L2 block on L1.
   *
   * @param block - L2 block to propose.
   * @returns True if the tx has been enqueued, throws otherwise. See #9315
   */
  public async enqueueProposeL2Block(
    block: L2Block,
    attestations?: CommitteeAttestation[],
    txHashes?: TxHash[],
    opts: { txTimeoutAt?: Date } = {},
  ): Promise<boolean> {
    const proposedBlockHeader = block.header.toPropose();

    const consensusPayload = ConsensusPayload.fromBlock(block);
    const digest = getHashedSignaturePayload(consensusPayload, SignatureDomainSeparator.blockAttestation);

    const blobs = await Blob.getBlobsPerBlock(block.body.toBlobFields());
    const proposeTxArgs = {
      header: proposedBlockHeader,
      archive: block.archive.root.toBuffer(),
      stateReference: block.header.state,
      body: block.body.toBuffer(),
      blobs,
      attestations,
      txHashes: txHashes ?? [],
    };

    let ts: bigint;

    try {
      // @note  This will make sure that we are passing the checks for our header ASSUMING that the data is also made available
      //        This means that we can avoid the simulation issues in later checks.
      //        By simulation issue, I mean the fact that the block.timestamp is equal to the last block, not the next, which
      //        make time consistency checks break.
      ts = await this.validateBlockForSubmission(block, {
        digest: digest.toBuffer(),
        attestations: attestations ?? [],
      });
    } catch (err: any) {
      this.log.error(`Block validation failed. ${err instanceof Error ? err.message : 'No error message'}`, undefined, {
        ...block.getStats(),
        slotNumber: block.header.globalVariables.slotNumber.toBigInt(),
      });
      throw err;
    }

    this.log.debug(`Submitting propose transaction`);
    await this.addProposeTx(block, proposeTxArgs, opts, ts);
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

  private async prepareProposeTx(encodedData: L1ProcessArgs, timestamp: bigint) {
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
    const args = [
      {
        header: encodedData.header.toViem(),
        archive: toHex(encodedData.archive),
        stateReference: encodedData.stateReference.toViem(),
        oracleInput: {
          // We are currently not modifying these. See #9963
          feeAssetPriceModifier: 0n,
        },
        txHashes,
      },
      RollupContract.packAttestations(attestations),
      blobInput,
    ] as const;

    const { rollupData, simulationResult } = await this.simulateProposeTx(args, timestamp);

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
        readonly stateReference: ViemStateReference;
        readonly txHashes: `0x${string}`[];
        readonly oracleInput: {
          readonly feeAssetPriceModifier: 0n;
        };
      },
      ViemCommitteeAttestations,
      `0x${string}`,
    ],
    timestamp: bigint,
  ) {
    const rollupData = encodeFunctionData({
      abi: RollupAbi,
      functionName: 'propose',
      args,
    });

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
              {
                slot: toPaddedHex(RollupContract.checkBlobStorageSlot, true),
                value: toPaddedHex(0n, true),
              },
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
    opts: { txTimeoutAt?: Date } = {},
    timestamp: bigint,
  ): Promise<void> {
    const timer = new Timer();
    const kzg = Blob.getViemKzgInstance();
    const { rollupData, simulationResult, blobEvaluationGas } = await this.prepareProposeTx(encodedData, timestamp);
    const startBlock = await this.l1TxUtils.getBlockNumber();
    const gasLimit = this.l1TxUtils.bumpGasLimit(
      BigInt(Math.ceil((Number(simulationResult.gasUsed) * 64) / 63)) +
        blobEvaluationGas +
        SequencerPublisher.MULTICALL_OVERHEAD_GAS_GUESS, // We issue the simulation against the rollup contract, so we need to account for the overhead of the multicall3
    );

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
      onResult: (request, result) => {
        if (!result) {
          return;
        }
        const { receipt, stats, errorMsg } = result;
        if (receipt.status === 'success') {
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
          this.log.verbose(`Published L2 block to L1 rollup contract`, { ...stats, ...block.getStats(), ...receipt });
          this.metrics.recordProcessBlockTx(timer.ms(), publishStats);

          // Send the blobs to the blob sink
          this.sendBlobsToBlobSink(receipt.blockHash, encodedData.blobs).catch(_err => {
            this.log.error('Failed to send blobs to blob sink');
          });

          return true;
        } else {
          this.metrics.recordFailedTx('process');

          this.log.error(`Rollup process tx reverted. ${errorMsg ?? 'No error message'}`, undefined, {
            ...block.getStats(),
            txHash: receipt.transactionHash,
            slotNumber: block.header.globalVariables.slotNumber.toBigInt(),
          });
        }
      },
    });
  }

  /**
   * Send blobs to the blob sink
   *
   * If a blob sink url is configured, then we send blobs to the blob sink
   * - for now we use the blockHash as the identifier for the blobs;
   *   In the future this will move to be the beacon block id - which takes a bit more work
   *   to calculate and will need to be mocked in e2e tests
   */
  protected sendBlobsToBlobSink(blockHash: string, blobs: Blob[]): Promise<boolean> {
    return this.blobSinkClient.sendBlobsToBlobSink(blockHash, blobs);
  }
}
