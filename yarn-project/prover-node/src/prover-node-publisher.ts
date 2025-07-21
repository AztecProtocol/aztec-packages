import { type BatchedBlob, FinalBlobAccumulatorPublicInputs } from '@aztec/blob-lib';
import { AZTEC_MAX_EPOCH_DURATION } from '@aztec/constants';
import type { L1TxUtils, RollupContract } from '@aztec/ethereum';
import { makeTuple } from '@aztec/foundation/array';
import { areArraysEqual } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { Tuple } from '@aztec/foundation/serialize';
import { InterruptibleSleep } from '@aztec/foundation/sleep';
import { Timer } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts';
import type { PublisherConfig, TxSenderConfig } from '@aztec/sequencer-client';
import type { Proof } from '@aztec/stdlib/proofs';
import type { FeeRecipient, RootRollupPublicInputs } from '@aztec/stdlib/rollup';
import type { L1PublishProofStats } from '@aztec/stdlib/stats';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { inspect } from 'util';
import { type Hex, type TransactionReceipt, encodeFunctionData } from 'viem';

import { ProverNodePublisherMetrics } from './metrics.js';

/**
 * Stats for a sent transaction.
 */
/** Arguments to the submitEpochProof method of the rollup contract */
export type L1SubmitEpochProofArgs = {
  epochSize: number;
  previousArchive: Fr;
  endArchive: Fr;
  endTimestamp: Fr;
  outHash: Fr;
  proverId: Fr;
  fees: Tuple<FeeRecipient, typeof AZTEC_MAX_EPOCH_DURATION>;
  proof: Proof;
};

export class ProverNodePublisher {
  private interruptibleSleep = new InterruptibleSleep();
  private sleepTimeMs: number;
  private interrupted = false;
  private metrics: ProverNodePublisherMetrics;

  protected log = createLogger('prover-node:l1-tx-publisher');

  protected rollupContract: RollupContract;

  public readonly l1TxUtils: L1TxUtils;

  constructor(
    config: TxSenderConfig & PublisherConfig,
    deps: {
      rollupContract: RollupContract;
      l1TxUtils: L1TxUtils;
      telemetry?: TelemetryClient;
    },
  ) {
    this.sleepTimeMs = config?.l1PublishRetryIntervalMS ?? 60_000;

    const telemetry = deps.telemetry ?? getTelemetryClient();

    this.metrics = new ProverNodePublisherMetrics(telemetry, 'ProverNode');

    this.rollupContract = deps.rollupContract;
    this.l1TxUtils = deps.l1TxUtils;
  }

  public getRollupContract() {
    return this.rollupContract;
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

  public getSenderAddress() {
    return EthAddress.fromString(this.l1TxUtils.getSenderAddress());
  }

  public async submitEpochProof(args: {
    epochNumber: number;
    fromBlock: number;
    toBlock: number;
    publicInputs: RootRollupPublicInputs;
    proof: Proof;
    batchedBlobInputs: BatchedBlob;
  }): Promise<boolean> {
    const { epochNumber, fromBlock, toBlock } = args;
    const ctx = { epochNumber, fromBlock, toBlock };
    if (!this.interrupted) {
      const timer = new Timer();
      // Validate epoch proof range and hashes are correct before submitting
      await this.validateEpochProofSubmission(args);

      const txReceipt = await this.sendSubmitEpochProofTx(args);
      if (!txReceipt) {
        return false;
      }

      try {
        this.metrics.recordSenderBalance(await this.l1TxUtils.getSenderBalance(), this.l1TxUtils.getSenderAddress());
      } catch (err) {
        this.log.warn(`Failed to record the ETH balance of the prover node: ${err}`);
      }

      // Tx was mined successfully
      if (txReceipt.status) {
        const tx = await this.l1TxUtils.getTransactionStats(txReceipt.transactionHash);
        const stats: L1PublishProofStats = {
          gasPrice: txReceipt.effectiveGasPrice,
          gasUsed: txReceipt.gasUsed,
          transactionHash: txReceipt.transactionHash,
          calldataGas: tx!.calldataGas,
          calldataSize: tx!.calldataSize,
          sender: tx!.sender,
          blobDataGas: 0n,
          blobGasUsed: 0n,
          eventName: 'proof-published-to-l1',
        };
        this.log.info(`Published epoch proof to L1 rollup contract`, { ...stats, ...ctx });
        this.metrics.recordSubmitProof(timer.ms(), stats);
        return true;
      }

      this.metrics.recordFailedTx();
      this.log.error(`Rollup.submitEpochProof tx status failed: ${txReceipt.transactionHash}`, ctx);
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
    batchedBlobInputs: BatchedBlob;
  }) {
    const { fromBlock, toBlock, publicInputs, batchedBlobInputs } = args;

    // Check that the block numbers match the expected epoch to be proven
    const { pendingBlockNumber: pending, provenBlockNumber: proven } = await this.rollupContract.getTips();
    // Don't publish if proven is beyond our toBlock, pointless to do so
    if (proven > BigInt(toBlock)) {
      throw new Error(`Cannot submit epoch proof for ${fromBlock}-${toBlock} as proven block is ${proven}`);
    }
    // toBlock can't be greater than pending
    if (toBlock > pending) {
      throw new Error(`Cannot submit epoch proof for ${fromBlock}-${toBlock} as pending block is ${pending}`);
    }

    // Check the archive for the immediate block before the epoch
    const blockLog = await this.rollupContract.getBlock(BigInt(fromBlock - 1));
    if (publicInputs.previousArchiveRoot.toString() !== blockLog.archive) {
      throw new Error(
        `Previous archive root mismatch: ${publicInputs.previousArchiveRoot.toString()} !== ${blockLog.archive}`,
      );
    }

    // Check the archive for the last block in the epoch
    const endBlockLog = await this.rollupContract.getBlock(BigInt(toBlock));
    if (publicInputs.endArchiveRoot.toString() !== endBlockLog.archive) {
      throw new Error(
        `End archive root mismatch: ${publicInputs.endArchiveRoot.toString()} !== ${endBlockLog.archive}`,
      );
    }

    // Check the batched blob inputs from the root rollup against the batched blob computed in ts
    if (!publicInputs.blobPublicInputs.equals(FinalBlobAccumulatorPublicInputs.fromBatchedBlob(batchedBlobInputs))) {
      throw new Error(
        `Batched blob mismatch: ${inspect(publicInputs.blobPublicInputs)} !== ${inspect(FinalBlobAccumulatorPublicInputs.fromBatchedBlob(batchedBlobInputs))}`,
      );
    }

    // Compare the public inputs computed by the contract with the ones injected
    const rollupPublicInputs = await this.rollupContract.getEpochProofPublicInputs(
      this.getEpochProofPublicInputsArgs(args),
    );
    const argsPublicInputs = [...publicInputs.toFields()];

    if (!areArraysEqual(rollupPublicInputs.map(Fr.fromHexString), argsPublicInputs, (a, b) => a.equals(b))) {
      const fmt = (inputs: Fr[] | readonly string[]) => inputs.map(x => x.toString()).join(', ');
      throw new Error(
        `Root rollup public inputs mismatch:\nRollup:  ${fmt(rollupPublicInputs)}\nComputed:${fmt(argsPublicInputs)}`,
      );
    }
  }

  private async sendSubmitEpochProofTx(args: {
    fromBlock: number;
    toBlock: number;
    publicInputs: RootRollupPublicInputs;
    proof: Proof;
    batchedBlobInputs: BatchedBlob;
  }): Promise<TransactionReceipt | undefined> {
    const txArgs = [this.getSubmitEpochProofArgs(args)] as const;

    this.log.info(`SubmitEpochProof proofSize=${args.proof.withoutPublicInputs().length} bytes`);
    const data = encodeFunctionData({
      abi: RollupAbi,
      functionName: 'submitEpochRootProof',
      args: txArgs,
    });
    try {
      const { receipt } = await this.l1TxUtils.sendAndMonitorTransaction({
        to: this.rollupContract.address,
        data,
      });

      return receipt;
    } catch (err) {
      this.log.error(`Rollup submit epoch proof failed`, err);
      const errorMsg = await this.l1TxUtils.tryGetErrorFromRevertedTx(
        data,
        {
          args: [...txArgs],
          functionName: 'submitEpochRootProof',
          abi: RollupAbi,
          address: this.rollupContract.address,
        },
        /*blobInputs*/ undefined,
        /*stateOverride*/ [],
      );
      this.log.error(`Rollup submit epoch proof tx reverted. ${errorMsg}`);
      return undefined;
    }
  }

  private getEpochProofPublicInputsArgs(args: {
    fromBlock: number;
    toBlock: number;
    publicInputs: RootRollupPublicInputs;
    batchedBlobInputs: BatchedBlob;
  }) {
    // Returns arguments for EpochProofLib.sol -> getEpochProofPublicInputs()
    return [
      BigInt(args.fromBlock) /*_start*/,
      BigInt(args.toBlock) /*_end*/,
      {
        previousArchive: args.publicInputs.previousArchiveRoot.toString(),
        endArchive: args.publicInputs.endArchiveRoot.toString(),
        proverId: EthAddress.fromField(args.publicInputs.proverId).toString(),
      } /*_args*/,
      makeTuple(AZTEC_MAX_EPOCH_DURATION * 2, i =>
        i % 2 === 0
          ? args.publicInputs.fees[i / 2].recipient.toField().toString()
          : args.publicInputs.fees[(i - 1) / 2].value.toString(),
      ) /*_fees*/,
      args.batchedBlobInputs.getEthBlobEvaluationInputs() /*_blobPublicInputs*/,
    ] as const;
  }

  private getSubmitEpochProofArgs(args: {
    fromBlock: number;
    toBlock: number;
    publicInputs: RootRollupPublicInputs;
    proof: Proof;
    batchedBlobInputs: BatchedBlob;
  }) {
    // Returns arguments for EpochProofLib.sol -> submitEpochRootProof()
    const proofHex: Hex = `0x${args.proof.withoutPublicInputs().toString('hex')}`;
    const argsArray = this.getEpochProofPublicInputsArgs(args);
    return {
      start: argsArray[0],
      end: argsArray[1],
      args: argsArray[2],
      fees: argsArray[3],
      blobInputs: argsArray[4],
      proof: proofHex,
    };
  }

  protected async sleepOrInterrupted() {
    await this.interruptibleSleep.sleep(this.sleepTimeMs);
  }
}
