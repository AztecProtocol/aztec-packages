import { type BlobSinkClientInterface, createBlobSinkClient } from '@aztec/blob-sink/client';
import {
  ConsensusPayload,
  type EpochProofQuote,
  type L2Block,
  SignatureDomainSeparator,
  type TxHash,
  getHashedSignaturePayload,
} from '@aztec/circuit-types';
import type { L1PublishBlockStats, L1PublishStats } from '@aztec/circuit-types/stats';
import { type BlockHeader, EthAddress } from '@aztec/circuits.js';
import { type EpochCache } from '@aztec/epoch-cache';
import {
  FormattedViemError,
  type ForwarderContract,
  type GasPrice,
  type L1BlobInputs,
  type L1ContractsConfig,
  type L1GasConfig,
  type L1TxRequest,
  type L1TxUtilsWithBlobs,
  type RollupContract,
  type TransactionStats,
  formatViemError,
} from '@aztec/ethereum';
import { toHex } from '@aztec/foundation/bigint-buffer';
import { Blob } from '@aztec/foundation/blob';
import { type Signature } from '@aztec/foundation/eth-signature';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { EmpireBaseAbi, ForwarderAbi, RollupAbi } from '@aztec/l1-artifacts';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import pick from 'lodash.pick';
import { type TransactionReceipt, encodeFunctionData, getAddress, getContract } from 'viem';

import { type PublisherConfig, type TxSenderConfig } from './config.js';
import { SequencerPublisherMetrics } from './sequencer-publisher-metrics.js';

/** Arguments to the process method of the rollup contract */
type L1ProcessArgs = {
  /** The L2 block header. */
  header: Buffer;
  /** A root of the archive tree after the L2 block is applied. */
  archive: Buffer;
  /** The L2 block's leaf in the archive tree. */
  blockHash: Buffer;
  /** L2 block body. TODO(#9101): Remove block body once we can extract blobs. */
  body: Buffer;
  /** L2 block blobs containing all tx effects. */
  blobs: Blob[];
  /** L2 block tx hashes */
  txHashes: TxHash[];
  /** Attestations */
  attestations?: Signature[];
};

export enum VoteType {
  GOVERNANCE,
  SLASHING,
}

type GetSlashPayloadCallBack = (slotNumber: bigint) => Promise<EthAddress | undefined>;

type Action = 'propose' | 'claim' | 'governance-vote' | 'slashing-vote';
interface RequestWithExpiry {
  action: Action;
  request: L1TxRequest;
  lastValidL2Slot: bigint;
  gasConfig?: L1GasConfig;
  blobConfig?: L1BlobInputs;
  onResult?: (
    request: L1TxRequest,
    result?: { receipt: TransactionReceipt; gasPrice: GasPrice; stats?: TransactionStats; errorMsg?: string },
  ) => void;
}

export class SequencerPublisher {
  private interrupted = false;
  private metrics: SequencerPublisherMetrics;
  private epochCache: EpochCache;
  private forwarderContract: ForwarderContract;

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
  public static PROPOSE_AND_CLAIM_GAS_GUESS: bigint = this.PROPOSE_GAS_GUESS + 100_000n;

  public l1TxUtils: L1TxUtilsWithBlobs;
  public rollupContract: RollupContract;

  protected requests: RequestWithExpiry[] = [];

  constructor(
    config: TxSenderConfig & PublisherConfig & Pick<L1ContractsConfig, 'ethereumSlotDuration'>,
    deps: {
      telemetry?: TelemetryClient;
      blobSinkClient?: BlobSinkClientInterface;
      forwarderContract: ForwarderContract;
      l1TxUtils: L1TxUtilsWithBlobs;
      rollupContract: RollupContract;
      epochCache: EpochCache;
    },
  ) {
    this.ethereumSlotDuration = BigInt(config.ethereumSlotDuration);
    this.epochCache = deps.epochCache;

    if (config.l1Contracts.governanceProposerAddress) {
      this.governanceProposerAddress = EthAddress.fromString(config.l1Contracts.governanceProposerAddress.toString());
    }
    this.blobSinkClient = deps.blobSinkClient ?? createBlobSinkClient(config);

    const telemetry = deps.telemetry ?? getTelemetryClient();
    this.metrics = new SequencerPublisherMetrics(telemetry, 'SequencerPublisher');
    this.l1TxUtils = deps.l1TxUtils;

    this.rollupContract = deps.rollupContract;
    this.forwarderContract = deps.forwarderContract;
  }

  public registerSlashPayloadGetter(callback: GetSlashPayloadCallBack) {
    this.getSlashPayload = callback;
  }

  public getForwarderAddress() {
    return EthAddress.fromString(this.forwarderContract.getAddress());
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
    this.log.debug(`Current L2 slot: ${currentL2Slot}`);
    const validRequests = requestsToProcess.filter(request => request.lastValidL2Slot >= currentL2Slot);

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

    // @note - we can only have one gas config and one blob config per bundle
    // find requests with gas and blob configs
    // See https://github.com/AztecProtocol/aztec-packages/issues/11513
    const gasConfigs = requestsToProcess.filter(request => request.gasConfig);
    const blobConfigs = requestsToProcess.filter(request => request.blobConfig);

    if (gasConfigs.length > 1 || blobConfigs.length > 1) {
      throw new Error('Multiple gas or blob configs found');
    }

    const gasConfig = gasConfigs[0]?.gasConfig;
    const blobConfig = blobConfigs[0]?.blobConfig;

    try {
      this.log.debug('Forwarding transactions', {
        validRequests: validRequests.map(request => request.action),
      });
      const result = await this.forwarderContract.forward(
        validRequests.map(request => request.request),
        this.l1TxUtils,
        gasConfig,
        blobConfig,
      );
      this.callbackBundledTransactions(validRequests, result);
      return result;
    } catch (err) {
      const { message, metaMessages } = formatViemError(err);
      this.log.error(`Failed to publish bundled transactions`, message, { metaMessages });
      return undefined;
    }
  }

  private callbackBundledTransactions(
    requests: RequestWithExpiry[],
    result?: { receipt: TransactionReceipt; gasPrice: GasPrice },
  ) {
    const success = result?.receipt.status === 'success';
    const logger = success ? this.log.info : this.log.error;
    for (const request of requests) {
      logger(`Bundled [${request.action}] transaction [${success ? 'succeeded' : 'failed'}]`);
      request.onResult?.(request.request, result);
    }
  }

  /**
   * @notice  Will call `canProposeAtNextEthBlock` to make sure that it is possible to propose
   * @param tipArchive - The archive to check
   * @returns The slot and block number if it is possible to propose, undefined otherwise
   */
  public canProposeAtNextEthBlock(tipArchive: Buffer) {
    const ignoredErrors = ['SlotAlreadyInChain', 'InvalidProposer', 'InvalidArchive'];
    return this.rollupContract
      .canProposeAtNextEthBlock(tipArchive, this.getForwarderAddress().toString(), this.ethereumSlotDuration)
      .catch(err => {
        if (err instanceof FormattedViemError && ignoredErrors.find(e => err.message.includes(e))) {
          this.log.debug(err.message);
        } else {
          this.log.error(err.name, err);
        }
        return undefined;
      });
  }

  /**
   * @returns The epoch that is currently claimable, undefined otherwise
   */
  public getClaimableEpoch() {
    const acceptedErrors = ['Rollup__NoEpochToProve', 'Rollup__ProofRightAlreadyClaimed'] as const;
    return this.rollupContract.getClaimableEpoch().catch(err => {
      if (acceptedErrors.find(e => err.message.includes(e))) {
        return undefined;
      }
      throw err;
    });
  }

  /**
   * @notice  Will filter out invalid quotes according to L1
   * @param quotes - The quotes to filter
   * @returns The filtered quotes
   */
  public filterValidQuotes(quotes: EpochProofQuote[]): Promise<EpochProofQuote[]> {
    return Promise.all(
      quotes.map(x =>
        this.rollupContract
          // validate throws if the quote is not valid
          // else returns void
          .validateProofQuote(x.toViemArgs(), this.getForwarderAddress().toString(), this.ethereumSlotDuration)
          .then(() => x)
          .catch(err => {
            this.log.error(`Failed to validate proof quote`, err, { quote: x.toInspect() });
            return undefined;
          }),
      ),
    ).then(quotes => quotes.filter((q): q is EpochProofQuote => !!q));
  }

  /**
   * @notice  Will call `validateHeader` to make sure that it is possible to propose
   *
   * @dev     Throws if unable to propose
   *
   * @param header - The header to propose
   * @param digest - The digest that attestations are signing over
   *
   */
  public async validateBlockForSubmission(
    header: BlockHeader,
    attestationData: { digest: Buffer; signatures: Signature[] } = {
      digest: Buffer.alloc(32),
      signatures: [],
    },
  ): Promise<bigint> {
    const ts = BigInt((await this.l1TxUtils.getBlock()).timestamp + this.ethereumSlotDuration);

    const formattedSignatures = attestationData.signatures.map(attest => attest.toViemSignature());
    const flags = { ignoreDA: true, ignoreSignatures: formattedSignatures.length == 0 };

    const args = [
      `0x${header.toBuffer().toString('hex')}`,
      formattedSignatures,
      `0x${attestationData.digest.toString('hex')}`,
      ts,
      `0x${header.contentCommitment.blobsHash.toString('hex')}`,
      flags,
    ] as const;

    await this.rollupContract.validateHeader(args, this.getForwarderAddress().toString());
    return ts;
  }

  public async getCurrentEpochCommittee(): Promise<EthAddress[]> {
    const committee = await this.rollupContract.getCurrentEpochCommittee();
    return committee.map(EthAddress.fromString);
  }

  /**
   * Enqueues a castVote transaction to cast a vote for a given slot number.
   * @param slotNumber - The slot number to cast a vote for.
   * @param timestamp - The timestamp of the slot to cast a vote for.
   * @param voteType - The type of vote to cast.
   * @returns True if the vote was successfully enqueued, false otherwise.
   */
  public async enqueueCastVote(slotNumber: bigint, timestamp: bigint, voteType: VoteType): Promise<boolean> {
    // @todo This function can be optimized by doing some of the computations locally instead of calling the L1 contracts
    if (this.myLastVotes[voteType] >= slotNumber) {
      return false;
    }

    const voteConfig = async (): Promise<
      { payload: EthAddress; voteContractAddress: EthAddress; logger: Logger } | undefined
    > => {
      if (voteType === VoteType.GOVERNANCE) {
        if (this.governancePayload.equals(EthAddress.ZERO)) {
          return undefined;
        }
        if (!this.governanceProposerAddress) {
          return undefined;
        }
        return {
          payload: this.governancePayload,
          voteContractAddress: this.governanceProposerAddress,
          logger: this.governanceLog,
        };
      } else if (voteType === VoteType.SLASHING) {
        if (!this.getSlashPayload) {
          return undefined;
        }
        const slashingProposerAddress = await this.rollupContract.getSlashingProposerAddress();
        if (!slashingProposerAddress) {
          return undefined;
        }

        const slashPayload = await this.getSlashPayload(slotNumber);

        if (!slashPayload) {
          return undefined;
        }

        return {
          payload: slashPayload,
          voteContractAddress: slashingProposerAddress,
          logger: this.slashingLog,
        };
      } else {
        throw new Error('Invalid vote type');
      }
    };

    const vConfig = await voteConfig();

    if (!vConfig) {
      return false;
    }

    const { payload, voteContractAddress } = vConfig;

    const voteContract = getContract({
      address: getAddress(voteContractAddress.toString()),
      abi: EmpireBaseAbi,
      client: this.l1TxUtils.walletClient,
    });

    const [proposer, roundNumber] = await Promise.all([
      this.rollupContract.getProposerAt(timestamp),
      voteContract.read.computeRound([slotNumber]),
    ]);

    if (proposer.toLowerCase() !== this.getForwarderAddress().toString().toLowerCase()) {
      return false;
    }

    const [slotForLastVote] = await voteContract.read.rounds([this.rollupContract.address, roundNumber]);

    if (slotForLastVote >= slotNumber) {
      return false;
    }

    const cachedLastVote = this.myLastVotes[voteType];

    this.myLastVotes[voteType] = slotNumber;

    this.addRequest({
      action: voteType === VoteType.GOVERNANCE ? 'governance-vote' : 'slashing-vote',
      request: {
        to: voteContractAddress.toString(),
        data: encodeFunctionData({
          abi: EmpireBaseAbi,
          functionName: 'vote',
          args: [payload.toString()],
        }),
      },
      lastValidL2Slot: slotNumber,
      onResult: (_request, result) => {
        if (!result || result.receipt.status !== 'success') {
          this.myLastVotes[voteType] = cachedLastVote;
        } else {
          this.log.info(`Cast ${voteType} vote for slot ${slotNumber}`);
        }
      },
    });
    return true;
  }

  /**
   * Proposes a L2 block on L1.
   *
   * @param block - L2 block to propose.
   * @returns True if the tx has been enqueued, throws otherwise. See #9315
   */
  public async enqueueProposeL2Block(
    block: L2Block,
    attestations?: Signature[],
    txHashes?: TxHash[],
    opts: { txTimeoutAt?: Date } = {},
  ): Promise<boolean> {
    const consensusPayload = new ConsensusPayload(block.header, block.archive.root, txHashes ?? []);

    const digest = await getHashedSignaturePayload(consensusPayload, SignatureDomainSeparator.blockAttestation);

    const blobs = await Blob.getBlobs(block.body.toBlobFields());
    const proposeTxArgs = {
      header: block.header.toBuffer(),
      archive: block.archive.root.toBuffer(),
      blockHash: (await block.header.hash()).toBuffer(),
      body: block.body.toBuffer(),
      blobs,
      attestations,
      txHashes: txHashes ?? [],
    };

    // @note  This will make sure that we are passing the checks for our header ASSUMING that the data is also made available
    //        This means that we can avoid the simulation issues in later checks.
    //        By simulation issue, I mean the fact that the block.timestamp is equal to the last block, not the next, which
    //        make time consistency checks break.
    const ts = await this.validateBlockForSubmission(block.header, {
      digest: digest.toBuffer(),
      signatures: attestations ?? [],
    });

    this.log.debug(`Submitting propose transaction`);
    await this.addProposeTx(block, proposeTxArgs, opts, ts);
    return true;
  }

  /** Enqueues a claimEpochProofRight transaction to submit a chosen prover quote for the previous epoch. */
  public enqueueClaimEpochProofRight(proofQuote: EpochProofQuote): boolean {
    const timer = new Timer();
    this.addRequest({
      action: 'claim',
      request: {
        to: this.rollupContract.address,
        data: encodeFunctionData({
          abi: RollupAbi,
          functionName: 'claimEpochProofRight',
          args: [proofQuote.toViemArgs()],
        }),
      },
      lastValidL2Slot: this.getCurrentL2Slot(),
      onResult: (_request, result) => {
        if (!result) {
          return;
        }
        const { receipt, stats } = result;
        if (receipt.status === 'success') {
          const publishStats: L1PublishStats = {
            gasPrice: receipt.effectiveGasPrice,
            gasUsed: receipt.gasUsed,
            transactionHash: receipt.transactionHash,
            blobDataGas: 0n,
            blobGasUsed: 0n,
            ...pick(stats!, 'calldataGas', 'calldataSize', 'sender'),
          };
          this.log.verbose(`Submitted claim epoch proof right to L1 rollup contract`, {
            ...publishStats,
            ...proofQuote.toInspect(),
          });
          this.metrics.recordClaimEpochProofRightTx(timer.ms(), publishStats);
        } else {
          this.metrics.recordFailedTx('claimEpochProofRight');
          // TODO: Get the error message from the reverted tx
          this.log.error(`Claim epoch proof right tx reverted`, {
            txHash: receipt.transactionHash,
            ...proofQuote.toInspect(),
          });
        }
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

  private async prepareProposeTx(encodedData: L1ProcessArgs, timestamp: bigint) {
    const kzg = Blob.getViemKzgInstance();
    const blobInput = Blob.getEthBlobEvaluationInputs(encodedData.blobs);
    this.log.debug('Validating blob input', { blobInput });
    const blobEvaluationGas = await this.l1TxUtils
      .estimateGas(
        this.l1TxUtils.walletClient.account,
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

    const attestations = encodedData.attestations
      ? encodedData.attestations.map(attest => attest.toViemSignature())
      : [];
    const txHashes = encodedData.txHashes ? encodedData.txHashes.map(txHash => txHash.toString()) : [];
    const args = [
      {
        header: `0x${encodedData.header.toString('hex')}`,
        archive: `0x${encodedData.archive.toString('hex')}`,
        oracleInput: {
          // We are currently not modifying these. See #9963
          feeAssetPriceModifier: 0n,
          provingCostModifier: 0n,
        },
        blockHash: `0x${encodedData.blockHash.toString('hex')}`,
        txHashes,
      },
      attestations,
      // TODO(#9101): Extract blobs from beacon chain => calldata will only contain what's needed to verify blob and body input can be removed
      `0x${encodedData.body.toString('hex')}`,
      blobInput,
    ] as const;

    const rollupData = encodeFunctionData({
      abi: RollupAbi,
      functionName: 'propose',
      args,
    });

    const forwarderData = encodeFunctionData({
      abi: ForwarderAbi,
      functionName: 'forward',
      args: [[this.rollupContract.address], [rollupData]],
    });

    const simulationResult = await this.l1TxUtils
      .simulateGasUsed(
        {
          to: this.getForwarderAddress().toString(),
          data: forwarderData,
          gas: SequencerPublisher.PROPOSE_GAS_GUESS,
        },
        {
          // @note we add 1n to the timestamp because geth implementation doesn't like simulation timestamp to be equal to the current block timestamp
          time: timestamp + 1n,
          // @note reth should have a 30m gas limit per block but throws errors that this tx is beyond limit
          gasLimit: SequencerPublisher.PROPOSE_GAS_GUESS * 2n,
        },
        [
          {
            address: this.rollupContract.address,
            // @note we override checkBlob to false since blobs are not part simulate()
            stateDiff: [
              {
                slot: toHex(9n, true),
                value: toHex(0n, true),
              },
            ],
          },
        ],
        {
          // @note fallback gas estimate to use if the node doesn't support simulation API
          fallbackGasEstimate: SequencerPublisher.PROPOSE_GAS_GUESS,
        },
      )
      .catch(err => {
        const { message, metaMessages } = formatViemError(err);
        this.log.error(`Failed to simulate gas used`, message, { metaMessages });
        throw new Error('Failed to simulate gas used');
      });

    return { args, blobEvaluationGas, rollupData, simulationResult };
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

    return this.addRequest({
      action: 'propose',
      request: {
        to: this.rollupContract.address,
        data: rollupData,
      },
      lastValidL2Slot: block.header.globalVariables.slotNumber.toBigInt(),
      gasConfig: {
        ...opts,
        gasLimit: this.l1TxUtils.bumpGasLimit(simulationResult + blobEvaluationGas),
      },
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
          this.log.verbose(`Published L2 block to L1 rollup contract`, { ...stats, ...block.getStats() });
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
            blockHash: block.hash().toString(),
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
