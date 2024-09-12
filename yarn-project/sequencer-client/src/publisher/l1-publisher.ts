import { type L2Block, type TxHash } from '@aztec/circuit-types';
import { getHashedSignaturePayload } from '@aztec/circuit-types';
import { type L1PublishBlockStats, type L1PublishProofStats } from '@aztec/circuit-types/stats';
import { ETHEREUM_SLOT_DURATION, EthAddress, type Header, type Proof } from '@aztec/circuits.js';
import { createEthereumChain } from '@aztec/ethereum';
import { type Signature } from '@aztec/foundation/eth-signature';
import { type Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { serializeToBuffer } from '@aztec/foundation/serialize';
import { InterruptibleSleep } from '@aztec/foundation/sleep';
import { Timer } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts';
import { type TelemetryClient } from '@aztec/telemetry-client';

import pick from 'lodash.pick';
import {
  ContractFunctionRevertedError,
  type GetContractReturnType,
  type Hex,
  type HttpTransport,
  type PrivateKeyAccount,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  getContract,
  hexToBytes,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type * as chains from 'viem/chains';

import { type PublisherConfig, type TxSenderConfig } from './config.js';
import { L1PublisherMetrics } from './l1-publisher-metrics.js';
import { prettyLogVeimError } from './utils.js';

/**
 * Stats for a sent transaction.
 */
export type TransactionStats = {
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
  transactionHash: string;
  /** Effective gas used by the tx. */
  gasUsed: bigint;
  /** Effective gas price paid by the tx. */
  gasPrice: bigint;
  /** Logs emitted in this tx. */
  logs: any[];
};

/** Arguments to the process method of the rollup contract */
export type L1ProcessArgs = {
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

/** Arguments to the submitProof method of the rollup contract */
export type L1SubmitProofArgs = {
  /** The L2 block header. */
  header: Buffer;
  /** A root of the archive tree after the L2 block is applied. */
  archive: Buffer;
  /** Identifier of the prover. */
  proverId: Buffer;
  /** The proof for the block. */
  proof: Buffer;
  /** The aggregation object for the block's proof. */
  aggregationObject: Buffer;
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
  private log = createDebugLogger('aztec:sequencer:publisher');

  private rollupContract: GetContractReturnType<
    typeof RollupAbi,
    WalletClient<HttpTransport, chains.Chain, PrivateKeyAccount>
  >;
  private publicClient: PublicClient<HttpTransport, chains.Chain>;
  private account: PrivateKeyAccount;

  public static PROPOSE_GAS_GUESS: bigint = 500_000n;

  constructor(config: TxSenderConfig & PublisherConfig, client: TelemetryClient) {
    this.sleepTimeMs = config?.l1PublishRetryIntervalMS ?? 60_000;
    this.metrics = new L1PublisherMetrics(client, 'L1Publisher');

    const { l1RpcUrl: rpcUrl, l1ChainId: chainId, publisherPrivateKey, l1Contracts } = config;
    const chain = createEthereumChain(rpcUrl, chainId);
    this.account = privateKeyToAccount(publisherPrivateKey);
    this.log.debug(`Publishing from address ${this.account.address}`);
    const walletClient = createWalletClient({
      account: this.account,
      chain: chain.chainInfo,
      transport: http(chain.rpcUrl),
    });

    this.publicClient = createPublicClient({
      chain: chain.chainInfo,
      transport: http(chain.rpcUrl),
    });

    this.rollupContract = getContract({
      address: getAddress(l1Contracts.rollupAddress.toString()),
      abi: RollupAbi,
      client: walletClient,
    });
  }

  public getSenderAddress(): Promise<EthAddress> {
    return Promise.resolve(EthAddress.fromString(this.account.address));
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
    const ts = BigInt((await this.publicClient.getBlock()).timestamp + BigInt(ETHEREUM_SLOT_DURATION));
    const [slot, blockNumber] = await this.rollupContract.read.canProposeAtTime([ts, `0x${archive.toString('hex')}`]);
    return [slot, blockNumber];
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
    header: Header,
    attestationData: { digest: Buffer; signatures: Signature[] } = {
      digest: Buffer.alloc(32),
      signatures: [],
    },
  ): Promise<void> {
    const ts = BigInt((await this.publicClient.getBlock()).timestamp + BigInt(ETHEREUM_SLOT_DURATION));

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
      transactionHash: tx.hash,
      calldataSize: calldata.length,
      calldataGas: getCalldataGasUsage(calldata),
    };
  }

  /**
   * Proposes a L2 block on L1.
   * @param block - L2 block to propose.
   * @returns True once the tx has been confirmed and is successful, false on revert or interrupt, blocks otherwise.
   */
  public async proposeL2Block(block: L2Block, attestations?: Signature[], txHashes?: TxHash[]): Promise<boolean> {
    const ctx = {
      blockNumber: block.number,
      slotNumber: block.header.globalVariables.slotNumber.toBigInt(),
      blockHash: block.hash().toString(),
    };

    const digest = getHashedSignaturePayload(block.archive.root, txHashes ?? []);
    const proposeTxArgs = {
      header: block.header.toBuffer(),
      archive: block.archive.root.toBuffer(),
      blockHash: block.header.hash().toBuffer(),
      body: block.body.toBuffer(),
      attestations,
      txHashes: txHashes ?? [],
    };

    // Publish body and propose block (if not already published)
    if (!this.interrupted) {
      const timer = new Timer();

      // @note  This will make sure that we are passing the checks for our header ASSUMING that the data is also made available
      //        This means that we can avoid the simulation issues in later checks.
      //        By simulation issue, I mean the fact that the block.timestamp is equal to the last block, not the next, which
      //        make time consistency checks break.
      await this.validateBlockForSubmission(block.header, {
        digest: digest.toBuffer(),
        signatures: attestations ?? [],
      });

      const txHash = await this.sendProposeTx(proposeTxArgs);

      if (!txHash) {
        this.log.info(`Failed to publish block ${block.number} to L1`, ctx);
        return false;
      }

      const receipt = await this.getTransactionReceipt(txHash);
      if (!receipt) {
        this.log.info(`Failed to get receipt for tx ${txHash}`, ctx);
        return false;
      }

      // Tx was mined successfully
      if (receipt.status) {
        const tx = await this.getTransactionStats(txHash);
        const stats: L1PublishBlockStats = {
          ...pick(receipt, 'gasPrice', 'gasUsed', 'transactionHash'),
          ...pick(tx!, 'calldataGas', 'calldataSize'),
          ...block.getStats(),
          eventName: 'rollup-published-to-l1',
        };
        this.log.info(`Published L2 block to L1 rollup contract`, { ...stats, ...ctx });
        this.metrics.recordProcessBlockTx(timer.ms(), stats);

        return true;
      }

      this.metrics.recordFailedTx('process');

      this.log.error(`Rollup.process tx status failed: ${receipt.transactionHash}`, ctx);
      await this.sleepOrInterrupted();
    }

    this.log.verbose('L2 block data syncing interrupted while processing blocks.', ctx);
    return false;
  }

  public async submitProof(
    header: Header,
    archiveRoot: Fr,
    proverId: Fr,
    aggregationObject: Fr[],
    proof: Proof,
  ): Promise<boolean> {
    const ctx = { blockNumber: header.globalVariables.blockNumber, slotNumber: header.globalVariables.slotNumber };

    const txArgs: L1SubmitProofArgs = {
      header: header.toBuffer(),
      archive: archiveRoot.toBuffer(),
      proverId: proverId.toBuffer(),
      aggregationObject: serializeToBuffer(aggregationObject),
      proof: proof.withoutPublicInputs(),
    };

    // Process block
    if (!this.interrupted) {
      const timer = new Timer();
      const txHash = await this.sendSubmitProofTx(txArgs);
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
          ...pick(tx!, 'calldataGas', 'calldataSize'),
          eventName: 'proof-published-to-l1',
        };
        this.log.info(`Published proof to L1 rollup contract`, { ...stats, ...ctx });
        this.metrics.recordSubmitProof(timer.ms(), stats);
        return true;
      }

      this.metrics.recordFailedTx('submitProof');
      this.log.error(`Rollup.submitProof tx status failed: ${receipt.transactionHash}`, ctx);
      await this.sleepOrInterrupted();
    }

    this.log.verbose('L2 block data syncing interrupted while processing blocks.', ctx);
    return false;
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

  private async sendSubmitProofTx(submitProofArgs: L1SubmitProofArgs): Promise<string | undefined> {
    try {
      const size = Object.values(submitProofArgs).reduce((acc, arg) => acc + arg.length, 0);
      this.log.info(`SubmitProof size=${size} bytes`);

      const { header, archive, proverId, aggregationObject, proof } = submitProofArgs;
      const args = [
        `0x${header.toString('hex')}`,
        `0x${archive.toString('hex')}`,
        `0x${proverId.toString('hex')}`,
        `0x${aggregationObject.toString('hex')}`,
        `0x${proof.toString('hex')}`,
      ] as const;

      await this.rollupContract.simulate.submitBlockRootProof(args, {
        account: this.account,
      });

      return await this.rollupContract.write.submitBlockRootProof(args, {
        account: this.account,
      });
    } catch (err) {
      this.log.error(`Rollup submit proof failed`, err);
      return undefined;
    }
  }

  private async sendProposeTx(encodedData: L1ProcessArgs): Promise<string | undefined> {
    if (!this.interrupted) {
      try {
        // We have to jump a few hoops because viem is not happy around estimating gas for view functions
        const computeTxsEffectsHashGas = await this.publicClient.estimateGas({
          to: this.rollupContract.address,
          data: encodeFunctionData({
            abi: this.rollupContract.abi,
            functionName: 'computeTxsEffectsHash',
            args: [`0x${encodedData.body.toString('hex')}`],
          }),
        });

        const min = (a: bigint, b: bigint) => (a > b ? b : a);

        // @note  We perform this guesstimate instead of the usual `gasEstimate` since
        //        viem will use the current state to simulate against, which means that
        //        we will fail estimation in the case where we are simulating for the
        //        first ethereum block within our slot (as current time is not in the
        //        slot yet).
        const gasGuesstimate = min(computeTxsEffectsHashGas + L1Publisher.PROPOSE_GAS_GUESS, 15_000_000n);

        const attestations = encodedData.attestations
          ? encodedData.attestations.map(attest => attest.toViemSignature())
          : [];
        const txHashes = encodedData.txHashes ? encodedData.txHashes.map(txHash => txHash.to0xString()) : [];
        const args = [
          `0x${encodedData.header.toString('hex')}`,
          `0x${encodedData.archive.toString('hex')}`,
          `0x${encodedData.blockHash.toString('hex')}`,
          txHashes,
          attestations,
          `0x${encodedData.body.toString('hex')}`,
        ] as const;

        return await this.rollupContract.write.propose(args, {
          account: this.account,
          gas: gasGuesstimate,
        });
      } catch (err) {
        prettyLogVeimError(err, this.log);
        this.log.error(`Rollup publish failed`, err);
        return undefined;
      }
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
