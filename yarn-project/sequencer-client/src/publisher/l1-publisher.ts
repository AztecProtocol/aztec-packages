import {
  ConsensusPayload,
  type EpochProofClaim,
  type EpochProofQuote,
  type L2Block,
  SignatureDomainSeperator,
  type TxHash,
  getHashedSignaturePayload,
} from '@aztec/circuit-types';
import { type L1PublishBlockStats, type L1PublishProofStats } from '@aztec/circuit-types/stats';
import {
  AGGREGATION_OBJECT_LENGTH,
  AZTEC_MAX_EPOCH_DURATION,
  type BlockHeader,
  EthAddress,
  type FeeRecipient,
  type Proof,
  type RootRollupPublicInputs,
} from '@aztec/circuits.js';
import {
  type EthereumChain,
  type L1ContractsConfig,
  L1TxUtils,
  type L1TxUtilsConfig,
  createEthereumChain,
} from '@aztec/ethereum';
import { makeTuple } from '@aztec/foundation/array';
import { areArraysEqual, compactArray, times } from '@aztec/foundation/collection';
import { type Signature } from '@aztec/foundation/eth-signature';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { InterruptibleSleep } from '@aztec/foundation/sleep';
import { Timer } from '@aztec/foundation/timer';
import { GovernanceProposerAbi, RollupAbi } from '@aztec/l1-artifacts';
import { type TelemetryClient } from '@aztec/telemetry-client';

import pick from 'lodash.pick';
import { inspect } from 'util';
import {
  type BaseError,
  type Chain,
  type Client,
  type ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  type GetContractReturnType,
  type Hex,
  type HttpTransport,
  type PrivateKeyAccount,
  type PublicActions,
  type PublicClient,
  type PublicRpcSchema,
  type TransactionReceipt,
  type WalletActions,
  type WalletClient,
  type WalletRpcSchema,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAbiItem,
  getAddress,
  getContract,
  hexToBytes,
  http,
  publicActions,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { type PublisherConfig, type TxSenderConfig } from './config.js';
import { L1PublisherMetrics } from './l1-publisher-metrics.js';
import { prettyLogViemError, prettyLogViemErrorMsg } from './utils.js';

/**
 * Stats for a sent transaction.
 */
export type TransactionStats = {
  /** Address of the sender. */
  sender: string;
  /** Hash of the transaction. */
  transactionHash: string;
  /** Size in bytes of the tx calldata */
  calldataSize: number;
  /** Gas required to pay for the calldata inclusion (depends on size and number of zeros)  */
  calldataGas: number;
};

/**
 * Minimal information from a tx receipt.
 */
export type MinimalTransactionReceipt = {
  /** True if the tx was successful, false if reverted. */
  status: boolean;
  /** Hash of the transaction. */
  transactionHash: `0x${string}`;
  /** Effective gas used by the tx. */
  gasUsed: bigint;
  /** Effective gas price paid by the tx. */
  gasPrice: bigint;
  /** Logs emitted in this tx. */
  logs: any[];
  /** Block number in which this tx was mined. */
  blockNumber: bigint;
};

/** Arguments to the process method of the rollup contract */
type L1ProcessArgs = {
  /** The L2 block header. */
  header: Buffer;
  /** A root of the archive tree after the L2 block is applied. */
  archive: Buffer;
  /** The L2 block's leaf in the archive tree. */
  blockHash: Buffer;
  /** L2 block body. */
  body: Buffer;
  /** L2 block tx hashes */
  txHashes: TxHash[];
  /** Attestations */
  attestations?: Signature[];
};

/** Arguments to the submitEpochProof method of the rollup contract */
export type L1SubmitEpochProofArgs = {
  epochSize: number;
  previousArchive: Fr;
  endArchive: Fr;
  previousBlockHash: Fr;
  endBlockHash: Fr;
  endTimestamp: Fr;
  outHash: Fr;
  proverId: Fr;
  fees: Tuple<FeeRecipient, typeof AZTEC_MAX_EPOCH_DURATION>;
  proof: Proof;
};

/**
 * Publishes L2 blocks to L1. This implementation does *not* retry a transaction in
 * the event of network congestion, but should work for local development.
 * - If sending (not mining) a tx fails, it retries indefinitely at 1-minute intervals.
 * - If the tx is not mined, keeps polling indefinitely at 1-second intervals.
 *
 * Adapted from https://github.com/AztecProtocol/aztec2-internal/blob/master/falafel/src/rollup_publisher.ts.
 */
export class L1Publisher {
  private interruptibleSleep = new InterruptibleSleep();
  private sleepTimeMs: number;
  private interrupted = false;
  private metrics: L1PublisherMetrics;

  private payload: EthAddress = EthAddress.ZERO;
  private myLastVote: bigint = 0n;

  protected log = createLogger('sequencer:publisher');

  protected rollupContract: GetContractReturnType<
    typeof RollupAbi,
    WalletClient<HttpTransport, Chain, PrivateKeyAccount>
  >;
  protected governanceProposerContract?: GetContractReturnType<
    typeof GovernanceProposerAbi,
    WalletClient<HttpTransport, Chain, PrivateKeyAccount>
  > = undefined;

  protected publicClient: PublicClient<HttpTransport, Chain>;
  protected walletClient: WalletClient<HttpTransport, Chain, PrivateKeyAccount>;
  protected account: PrivateKeyAccount;
  protected ethereumSlotDuration: bigint;

  public static PROPOSE_GAS_GUESS: bigint = 12_000_000n;
  public static PROPOSE_AND_CLAIM_GAS_GUESS: bigint = this.PROPOSE_GAS_GUESS + 100_000n;

  private readonly l1TxUtils: L1TxUtils;

  constructor(
    config: TxSenderConfig & PublisherConfig & Pick<L1ContractsConfig, 'ethereumSlotDuration'> & L1TxUtilsConfig,
    client: TelemetryClient,
  ) {
    this.sleepTimeMs = config?.l1PublishRetryIntervalMS ?? 60_000;
    this.ethereumSlotDuration = BigInt(config.ethereumSlotDuration);
    this.metrics = new L1PublisherMetrics(client, 'L1Publisher');

    const { l1RpcUrl: rpcUrl, l1ChainId: chainId, publisherPrivateKey, l1Contracts } = config;
    const chain = createEthereumChain(rpcUrl, chainId);
    this.account = privateKeyToAccount(publisherPrivateKey);
    this.log.debug(`Publishing from address ${this.account.address}`);

    this.walletClient = this.createWalletClient(this.account, chain);

    this.publicClient = createPublicClient({
      chain: chain.chainInfo,
      transport: http(chain.rpcUrl),
      pollingInterval: config.viemPollingIntervalMS,
    });

    this.rollupContract = getContract({
      address: getAddress(l1Contracts.rollupAddress.toString()),
      abi: RollupAbi,
      client: this.walletClient,
    });

    if (l1Contracts.governanceProposerAddress) {
      this.governanceProposerContract = getContract({
        address: getAddress(l1Contracts.governanceProposerAddress.toString()),
        abi: GovernanceProposerAbi,
        client: this.walletClient,
      });
    }

    this.l1TxUtils = new L1TxUtils(this.publicClient, this.walletClient, this.log, config);
  }

  get publisherAddress() {
    return this.account.address;
  }

  protected createWalletClient(
    account: PrivateKeyAccount,
    chain: EthereumChain,
  ): WalletClient<HttpTransport, Chain, PrivateKeyAccount> {
    return createWalletClient({
      account,
      chain: chain.chainInfo,
      transport: http(chain.rpcUrl),
    });
  }

  public getPayLoad() {
    return this.payload;
  }

  public setPayload(payload: EthAddress) {
    this.payload = payload;
  }

  public getSenderAddress(): EthAddress {
    return EthAddress.fromString(this.account.address);
  }

  public getClient(): Client<
    HttpTransport,
    Chain,
    PrivateKeyAccount,
    [...WalletRpcSchema, ...PublicRpcSchema],
    PublicActions<HttpTransport, Chain> & WalletActions<Chain, PrivateKeyAccount>
  > {
    return this.walletClient.extend(publicActions);
  }

  public getRollupContract(): GetContractReturnType<
    typeof RollupAbi,
    WalletClient<HttpTransport, Chain, PrivateKeyAccount>
  > {
    return this.rollupContract;
  }

  /**
   * @notice  Calls `canProposeAtTime` with the time of the next Ethereum block and the sender address
   *
   * @dev     Throws if unable to propose
   *
   * @param archive - The archive that we expect to be current state
   * @return slot - The L2 slot number  of the next Ethereum block,
   * @return blockNumber - The L2 block number of the next L2 block
   */
  public async canProposeAtNextEthBlock(archive: Buffer): Promise<[bigint, bigint]> {
    // FIXME: This should not throw if unable to propose but return a falsey value, so
    // we can differentiate between errors when hitting the L1 rollup contract (eg RPC error)
    // which may require a retry, vs actually not being the turn for proposing.
    const timeOfNextL1Slot = BigInt((await this.publicClient.getBlock()).timestamp + this.ethereumSlotDuration);
    const [slot, blockNumber] = await this.rollupContract.read.canProposeAtTime([
      timeOfNextL1Slot,
      `0x${archive.toString('hex')}`,
    ]);
    return [slot, blockNumber];
  }

  public async getClaimableEpoch(): Promise<bigint | undefined> {
    try {
      return await this.rollupContract.read.getClaimableEpoch();
    } catch (err: any) {
      const errorName = tryGetCustomErrorName(err);
      // getting the error name from the abi is redundant,
      // but it enforces that the error name is correct.
      // That is, if the error name is not found, this will not compile.
      const acceptedErrors = (['Rollup__NoEpochToProve', 'Rollup__ProofRightAlreadyClaimed'] as const).map(
        name => getAbiItem({ abi: RollupAbi, name }).name,
      );

      if (errorName && acceptedErrors.includes(errorName as any)) {
        return undefined;
      }
      throw err;
    }
  }

  public async getEpochForSlotNumber(slotNumber: bigint): Promise<bigint> {
    return await this.rollupContract.read.getEpochAtSlot([slotNumber]);
  }

  public async getEpochToProve(): Promise<bigint | undefined> {
    try {
      return await this.rollupContract.read.getEpochToProve();
    } catch (err: any) {
      // If this is a revert with Rollup__NoEpochToProve, it means there is no epoch to prove, so we return undefined
      // See https://viem.sh/docs/contract/simulateContract#handling-custom-errors
      const errorName = tryGetCustomErrorName(err);
      if (errorName === getAbiItem({ abi: RollupAbi, name: 'Rollup__NoEpochToProve' }).name) {
        return undefined;
      }
      throw err;
    }
  }

  public async getProofClaim(): Promise<EpochProofClaim | undefined> {
    const {
      epochToProve,
      basisPointFee,
      bondAmount,
      bondProvider: bondProviderHex,
      proposerClaimant: proposerClaimantHex,
    } = await this.rollupContract.read.getProofClaim();

    const bondProvider = EthAddress.fromString(bondProviderHex);
    const proposerClaimant = EthAddress.fromString(proposerClaimantHex);

    if (bondProvider.isZero() && proposerClaimant.isZero() && epochToProve === 0n) {
      return undefined;
    }

    return {
      epochToProve,
      basisPointFee,
      bondAmount,
      bondProvider,
      proposerClaimant,
    };
  }

  public async validateProofQuote(quote: EpochProofQuote): Promise<EpochProofQuote | undefined> {
    const timeOfNextL1Slot = BigInt((await this.publicClient.getBlock()).timestamp + this.ethereumSlotDuration);
    const args = [timeOfNextL1Slot, quote.toViemArgs()] as const;
    try {
      await this.rollupContract.read.validateEpochProofRightClaimAtTime(args, { account: this.account });
    } catch (err) {
      const errorName = tryGetCustomErrorName(err);
      this.log.warn(`Proof quote validation failed: ${errorName}`);
      return undefined;
    }
    return quote;
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
  ): Promise<void> {
    const ts = BigInt((await this.publicClient.getBlock()).timestamp + this.ethereumSlotDuration);

    const formattedSignatures = attestationData.signatures.map(attest => attest.toViemSignature());
    const flags = { ignoreDA: true, ignoreSignatures: formattedSignatures.length == 0 };

    const args = [
      `0x${header.toBuffer().toString('hex')}`,
      formattedSignatures,
      `0x${attestationData.digest.toString('hex')}`,
      ts,
      `0x${header.contentCommitment.txsEffectsHash.toString('hex')}`,
      flags,
    ] as const;

    try {
      await this.rollupContract.read.validateHeader(args, { account: this.account });
    } catch (error: unknown) {
      // Specify the type of error
      if (error instanceof ContractFunctionRevertedError) {
        const err = error as ContractFunctionRevertedError;
        this.log.debug(`Validation failed: ${err.message}`, err.data);
      } else {
        this.log.debug(`Unexpected error during validation: ${error}`);
      }
      throw error;
    }
  }

  public async getCurrentEpochCommittee(): Promise<EthAddress[]> {
    const committee = await this.rollupContract.read.getCurrentEpochCommittee();
    return committee.map(EthAddress.fromString);
  }

  async getTransactionStats(txHash: string): Promise<TransactionStats | undefined> {
    const tx = await this.publicClient.getTransaction({ hash: txHash as Hex });
    if (!tx) {
      return undefined;
    }
    const calldata = hexToBytes(tx.input);
    return {
      sender: tx.from.toString(),
      transactionHash: tx.hash,
      calldataSize: calldata.length,
      calldataGas: getCalldataGasUsage(calldata),
    };
  }

  public async castVote(slotNumber: bigint, timestamp: bigint): Promise<boolean> {
    if (this.payload.equals(EthAddress.ZERO)) {
      return false;
    }

    if (!this.governanceProposerContract) {
      return false;
    }

    if (this.myLastVote >= slotNumber) {
      return false;
    }

    // @todo This can be optimized A LOT by doing the computation instead of making calls to L1, but it is  very convenient
    // for when we keep changing the values and don't want to have multiple versions of the same logic implemented.

    const [proposer, roundNumber] = await Promise.all([
      this.rollupContract.read.getProposerAt([timestamp]),
      this.governanceProposerContract.read.computeRound([slotNumber]),
    ]);

    if (proposer != this.account.address) {
      return false;
    }

    const [slotForLastVote] = await this.governanceProposerContract.read.rounds([
      this.rollupContract.address,
      roundNumber,
    ]);

    if (slotForLastVote >= slotNumber) {
      return false;
    }

    // Storing these early such that a quick entry again would not send another tx,
    // revert the state if there is a failure.
    const cachedMyLastVote = this.myLastVote;
    this.myLastVote = slotNumber;

    let txHash;
    try {
      txHash = await this.governanceProposerContract.write.vote([this.payload.toString()], {
        account: this.account,
      });
    } catch (err) {
      const msg = prettyLogViemErrorMsg(err);
      this.log.error(`Governance: Failed to vote`, msg);
      this.myLastVote = cachedMyLastVote;
      return false;
    }

    if (txHash) {
      const receipt = await this.getTransactionReceipt(txHash);
      if (!receipt) {
        this.log.info(`Failed to get receipt for tx ${txHash}`);
        this.myLastVote = cachedMyLastVote;
        return false;
      }
    }

    this.log.info(`Governance: Cast vote for ${this.payload}`);

    return true;
  }

  /**
   * Proposes a L2 block on L1.
   * @param block - L2 block to propose.
   * @returns True once the tx has been confirmed and is successful, false on revert or interrupt, blocks otherwise.
   */
  public async proposeL2Block(
    block: L2Block,
    attestations?: Signature[],
    txHashes?: TxHash[],
    proofQuote?: EpochProofQuote,
  ): Promise<boolean> {
    const ctx = {
      blockNumber: block.number,
      slotNumber: block.header.globalVariables.slotNumber.toBigInt(),
      blockHash: block.hash().toString(),
    };

    const consensusPayload = new ConsensusPayload(block.header, block.archive.root, txHashes ?? []);

    const digest = getHashedSignaturePayload(consensusPayload, SignatureDomainSeperator.blockAttestation);
    const proposeTxArgs = {
      header: block.header.toBuffer(),
      archive: block.archive.root.toBuffer(),
      blockHash: block.header.hash().toBuffer(),
      body: block.body.toBuffer(),
      attestations,
      txHashes: txHashes ?? [],
    };

    // Publish body and propose block (if not already published)
    if (this.interrupted) {
      this.log.verbose('L2 block data syncing interrupted while processing blocks.', ctx);
      return false;
    }

    const timer = new Timer();

    // @note  This will make sure that we are passing the checks for our header ASSUMING that the data is also made available
    //        This means that we can avoid the simulation issues in later checks.
    //        By simulation issue, I mean the fact that the block.timestamp is equal to the last block, not the next, which
    //        make time consistency checks break.
    await this.validateBlockForSubmission(block.header, {
      digest: digest.toBuffer(),
      signatures: attestations ?? [],
    });

    this.log.verbose(`Submitting propose transaction`);
    const result = proofQuote
      ? await this.sendProposeAndClaimTx(proposeTxArgs, proofQuote)
      : await this.sendProposeTx(proposeTxArgs);

    if (!result?.receipt) {
      this.log.info(`Failed to publish block ${block.number} to L1`, ctx);
      return false;
    }

    const { receipt, args, functionName } = result;

    // Tx was mined successfully
    if (receipt.status === 'success') {
      const tx = await this.getTransactionStats(receipt.transactionHash);
      const stats: L1PublishBlockStats = {
        gasPrice: receipt.effectiveGasPrice,
        gasUsed: receipt.gasUsed,
        transactionHash: receipt.transactionHash,
        ...pick(tx!, 'calldataGas', 'calldataSize', 'sender'),
        ...block.getStats(),
        eventName: 'rollup-published-to-l1',
      };
      this.log.info(`Published L2 block to L1 rollup contract`, { ...stats, ...ctx });
      this.metrics.recordProcessBlockTx(timer.ms(), stats);
      return true;
    }

    this.metrics.recordFailedTx('process');

    const errorMsg = await this.tryGetErrorFromRevertedTx({
      args,
      functionName,
      abi: RollupAbi,
      address: this.rollupContract.address,
      blockNumber: receipt.blockNumber,
    });
    this.log.error(`Rollup process tx reverted. ${errorMsg}`, undefined, {
      ...ctx,
      txHash: receipt.transactionHash,
    });
    await this.sleepOrInterrupted();
    return false;
  }

  private async tryGetErrorFromRevertedTx(args: {
    args: any[];
    functionName: string;
    abi: any;
    address: Hex;
    blockNumber: bigint | undefined;
  }) {
    try {
      await this.publicClient.simulateContract({ ...args, account: this.walletClient.account });
      return undefined;
    } catch (err: any) {
      if (err.name === 'ContractFunctionExecutionError') {
        const execErr = err as ContractFunctionExecutionError;
        return compactArray([
          execErr.shortMessage,
          ...(execErr.metaMessages ?? []).slice(0, 2).map(s => s.trim()),
        ]).join(' ');
      }
      this.log.error(`Error getting error from simulation`, err);
    }
  }

  public async submitEpochProof(args: {
    epochNumber: number;
    fromBlock: number;
    toBlock: number;
    publicInputs: RootRollupPublicInputs;
    proof: Proof;
  }): Promise<boolean> {
    const { epochNumber, fromBlock, toBlock } = args;
    const ctx = { epochNumber, fromBlock, toBlock };
    if (!this.interrupted) {
      const timer = new Timer();

      // Validate epoch proof range and hashes are correct before submitting
      await this.validateEpochProofSubmission(args);

      const txHash = await this.sendSubmitEpochProofTx(args);
      if (!txHash) {
        return false;
      }

      const receipt = await this.getTransactionReceipt(txHash);
      if (!receipt) {
        return false;
      }

      // Tx was mined successfully
      if (receipt.status) {
        const tx = await this.getTransactionStats(txHash);
        const stats: L1PublishProofStats = {
          ...pick(receipt, 'gasPrice', 'gasUsed', 'transactionHash'),
          ...pick(tx!, 'calldataGas', 'calldataSize', 'sender'),
          eventName: 'proof-published-to-l1',
        };
        this.log.info(`Published epoch proof to L1 rollup contract`, { ...stats, ...ctx });
        this.metrics.recordSubmitProof(timer.ms(), stats);
        return true;
      }

      this.metrics.recordFailedTx('submitProof');
      this.log.error(`Rollup.submitEpochProof tx status failed: ${receipt.transactionHash}`, ctx);
      await this.sleepOrInterrupted();
    }

    this.log.verbose('L2 block data syncing interrupted while processing blocks.', ctx);
    return false;
  }

  private async validateEpochProofSubmission(args: {
    fromBlock: number;
    toBlock: number;
    publicInputs: RootRollupPublicInputs;
    proof: Proof;
  }) {
    const { fromBlock, toBlock, publicInputs, proof } = args;

    // Check that the block numbers match the expected epoch to be proven
    const { pendingBlockNumber: pending, provenBlockNumber: proven } = await this.rollupContract.read.getTips();
    if (proven !== BigInt(fromBlock) - 1n) {
      throw new Error(`Cannot submit epoch proof for ${fromBlock}-${toBlock} as proven block is ${proven}`);
    }
    if (toBlock > pending) {
      throw new Error(`Cannot submit epoch proof for ${fromBlock}-${toBlock} as pending block is ${pending}`);
    }

    // Check the block hash and archive for the immediate block before the epoch
    const blockLog = await this.rollupContract.read.getBlock([proven]);
    if (publicInputs.previousArchive.root.toString() !== blockLog.archive) {
      throw new Error(
        `Previous archive root mismatch: ${publicInputs.previousArchive.root.toString()} !== ${blockLog.archive}`,
      );
    }
    // TODO: Remove zero check once we inject the proper zero blockhash
    if (blockLog.blockHash !== Fr.ZERO.toString() && publicInputs.previousBlockHash.toString() !== blockLog.blockHash) {
      throw new Error(
        `Previous block hash mismatch: ${publicInputs.previousBlockHash.toString()} !== ${blockLog.blockHash}`,
      );
    }

    // Check the block hash and archive for the last block in the epoch
    const endBlockLog = await this.rollupContract.read.getBlock([BigInt(toBlock)]);
    if (publicInputs.endArchive.root.toString() !== endBlockLog.archive) {
      throw new Error(
        `End archive root mismatch: ${publicInputs.endArchive.root.toString()} !== ${endBlockLog.archive}`,
      );
    }
    if (publicInputs.endBlockHash.toString() !== endBlockLog.blockHash) {
      throw new Error(`End block hash mismatch: ${publicInputs.endBlockHash.toString()} !== ${endBlockLog.blockHash}`);
    }

    // Compare the public inputs computed by the contract with the ones injected
    const rollupPublicInputs = await this.rollupContract.read.getEpochProofPublicInputs(
      this.getSubmitEpochProofArgs(args),
    );
    const aggregationObject = proof.isEmpty()
      ? times(AGGREGATION_OBJECT_LENGTH, Fr.zero)
      : proof.extractAggregationObject();
    const argsPublicInputs = [...publicInputs.toFields(), ...aggregationObject];

    if (!areArraysEqual(rollupPublicInputs.map(Fr.fromString), argsPublicInputs, (a, b) => a.equals(b))) {
      const fmt = (inputs: Fr[] | readonly string[]) => inputs.map(x => x.toString()).join(', ');
      throw new Error(
        `Root rollup public inputs mismatch:\nRollup:  ${fmt(rollupPublicInputs)}\nComputed:${fmt(argsPublicInputs)}`,
      );
    }
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
  }

  /** Restarts the publisher after calling `interrupt`. */
  public restart() {
    this.interrupted = false;
  }

  private async sendSubmitEpochProofTx(args: {
    fromBlock: number;
    toBlock: number;
    publicInputs: RootRollupPublicInputs;
    proof: Proof;
  }): Promise<string | undefined> {
    try {
      const proofHex: Hex = `0x${args.proof.withoutPublicInputs().toString('hex')}`;
      const argsArray = this.getSubmitEpochProofArgs(args);

      const txArgs = [
        {
          epochSize: argsArray[0],
          args: argsArray[1],
          fees: argsArray[2],
          aggregationObject: argsArray[3],
          proof: proofHex,
        },
      ] as const;

      this.log.info(`SubmitEpochProof proofSize=${args.proof.withoutPublicInputs().length} bytes`);

      const txReceipt = await this.l1TxUtils.sendAndMonitorTransaction({
        to: this.rollupContract.address,
        data: encodeFunctionData({
          abi: this.rollupContract.abi,
          functionName: 'submitEpochRootProof',
          args: txArgs,
        }),
      });

      return txReceipt.transactionHash;
    } catch (err) {
      this.log.error(`Rollup submit epoch proof failed`, err);
      return undefined;
    }
  }

  private async prepareProposeTx(encodedData: L1ProcessArgs) {
    const computeTxsEffectsHashGas = await this.l1TxUtils.estimateGas(this.account, {
      to: this.rollupContract.address,
      data: encodeFunctionData({
        abi: this.rollupContract.abi,
        functionName: 'computeTxsEffectsHash',
        args: [`0x${encodedData.body.toString('hex')}`],
      }),
    });

    // @note  We perform this guesstimate instead of the usual `gasEstimate` since
    //        viem will use the current state to simulate against, which means that
    //        we will fail estimation in the case where we are simulating for the
    //        first ethereum block within our slot (as current time is not in the
    //        slot yet).
    const gasGuesstimate = computeTxsEffectsHashGas + L1Publisher.PROPOSE_GAS_GUESS;

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
      `0x${encodedData.body.toString('hex')}`,
    ] as const;

    return { args, gas: gasGuesstimate };
  }

  private getSubmitEpochProofArgs(args: {
    fromBlock: number;
    toBlock: number;
    publicInputs: RootRollupPublicInputs;
    proof: Proof;
  }) {
    return [
      BigInt(args.toBlock - args.fromBlock + 1),
      [
        args.publicInputs.previousArchive.root.toString(),
        args.publicInputs.endArchive.root.toString(),
        args.publicInputs.previousBlockHash.toString(),
        args.publicInputs.endBlockHash.toString(),
        args.publicInputs.endTimestamp.toString(),
        args.publicInputs.outHash.toString(),
        args.publicInputs.proverId.toString(),
      ],
      makeTuple(AZTEC_MAX_EPOCH_DURATION * 2, i =>
        i % 2 === 0
          ? args.publicInputs.fees[i / 2].recipient.toField().toString()
          : args.publicInputs.fees[(i - 1) / 2].value.toString(),
      ),
      `0x${serializeToBuffer(args.proof.extractAggregationObject()).toString('hex')}`,
    ] as const;
  }

  private async sendProposeTx(
    encodedData: L1ProcessArgs,
  ): Promise<{ receipt: TransactionReceipt; args: any; functionName: string } | undefined> {
    if (this.interrupted) {
      return undefined;
    }
    try {
      const { args, gas } = await this.prepareProposeTx(encodedData);
      const receipt = await this.l1TxUtils.sendAndMonitorTransaction(
        {
          to: this.rollupContract.address,
          data: encodeFunctionData({
            abi: this.rollupContract.abi,
            functionName: 'propose',
            args,
          }),
        },
        {
          fixedGas: gas,
        },
      );
      return {
        receipt,
        args,
        functionName: 'propose',
      };
    } catch (err) {
      prettyLogViemError(err, this.log);
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.log.error(`Rollup publish failed`, errorMessage);
      return undefined;
    }
  }

  private async sendProposeAndClaimTx(
    encodedData: L1ProcessArgs,
    quote: EpochProofQuote,
  ): Promise<{ receipt: TransactionReceipt; args: any; functionName: string } | undefined> {
    if (this.interrupted) {
      return undefined;
    }
    try {
      this.log.info(`ProposeAndClaim`);
      this.log.info(inspect(quote.payload));

      const { args, gas } = await this.prepareProposeTx(encodedData);
      const receipt = await this.l1TxUtils.sendAndMonitorTransaction(
        {
          to: this.rollupContract.address,
          data: encodeFunctionData({
            abi: this.rollupContract.abi,
            functionName: 'proposeAndClaim',
            args: [...args, quote.toViemArgs()],
          }),
        },
        { fixedGas: gas },
      );

      return {
        receipt,
        args,
        functionName: 'proposeAndClaim',
      };
    } catch (err) {
      prettyLogViemError(err, this.log);
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.log.error(`Rollup publish failed`, errorMessage);
      return undefined;
    }
  }

  /**
   * Returns a tx receipt if the tx has been mined.
   * @param txHash - Hash of the tx to look for.
   * @returns Undefined if the tx hasn't been mined yet, the receipt otherwise.
   */
  async getTransactionReceipt(txHash: string): Promise<MinimalTransactionReceipt | undefined> {
    while (!this.interrupted) {
      try {
        const receipt = await this.publicClient.getTransactionReceipt({
          hash: txHash as Hex,
        });

        if (receipt) {
          if (receipt.transactionHash !== txHash) {
            throw new Error(`Tx hash mismatch: ${receipt.transactionHash} !== ${txHash}`);
          }

          return {
            status: receipt.status === 'success',
            transactionHash: txHash,
            gasUsed: receipt.gasUsed,
            gasPrice: receipt.effectiveGasPrice,
            logs: receipt.logs,
            blockNumber: receipt.blockNumber,
          };
        }

        this.log.debug(`Receipt not found for tx hash ${txHash}`);
        return undefined;
      } catch (err) {
        //this.log.error(`Error getting tx receipt`, err);
        await this.sleepOrInterrupted();
      }
    }
  }

  protected async sleepOrInterrupted() {
    await this.interruptibleSleep.sleep(this.sleepTimeMs);
  }
}

/**
 * Returns cost of calldata usage in Ethereum.
 * @param data - Calldata.
 * @returns 4 for each zero byte, 16 for each nonzero.
 */
function getCalldataGasUsage(data: Uint8Array) {
  return data.filter(byte => byte === 0).length * 4 + data.filter(byte => byte !== 0).length * 16;
}

function tryGetCustomErrorName(err: any) {
  try {
    // See https://viem.sh/docs/contract/simulateContract#handling-custom-errors
    if (err.name === 'ViemError' || err.name === 'ContractFunctionExecutionError') {
      const baseError = err as BaseError;
      const revertError = baseError.walk(err => (err as Error).name === 'ContractFunctionRevertedError');
      if (revertError) {
        return (revertError as ContractFunctionRevertedError).data?.errorName;
      }
    }
  } catch (_e) {
    return undefined;
  }
}
