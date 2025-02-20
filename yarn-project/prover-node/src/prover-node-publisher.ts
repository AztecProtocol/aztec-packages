import type { L1PublishProofStats } from '@aztec/circuit-types/stats';
import type { Proof } from '@aztec/circuits.js';
import type { FeeRecipient, RootRollupPublicInputs } from '@aztec/circuits.js/rollup';
import { AGGREGATION_OBJECT_LENGTH, AZTEC_MAX_EPOCH_DURATION } from '@aztec/constants';
import type { L1TxUtils, RollupContract } from '@aztec/ethereum';
import { makeTuple } from '@aztec/foundation/array';
import { areArraysEqual, times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { serializeToBuffer } from '@aztec/foundation/serialize';
import type { Tuple } from '@aztec/foundation/serialize';
import { InterruptibleSleep } from '@aztec/foundation/sleep';
import { Timer } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts';
import type { PublisherConfig, TxSenderConfig } from '@aztec/sequencer-client';
import { getTelemetryClient } from '@aztec/telemetry-client';
import type { TelemetryClient } from '@aztec/telemetry-client';

import { encodeFunctionData } from 'viem';
import type { Hex, TransactionReceipt } from 'viem';

import { ProverNodeMetrics } from './metrics.js';

/**
 * Stats for a sent transaction.
 */
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

export class ProverNodePublisher {
  private interruptibleSleep = new InterruptibleSleep();
  private sleepTimeMs: number;
  private interrupted = false;
  private metrics: ProverNodeMetrics;

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

    this.metrics = new ProverNodeMetrics(telemetry, 'ProverNode');

    this.rollupContract = deps.rollupContract;
    this.l1TxUtils = deps.l1TxUtils;
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
  }) {
    const { fromBlock, toBlock, publicInputs, proof } = args;

    // Check that the block numbers match the expected epoch to be proven
    const { pendingBlockNumber: pending, provenBlockNumber: proven } = await this.rollupContract.getTips();
    if (proven !== BigInt(fromBlock) - 1n) {
      throw new Error(`Cannot submit epoch proof for ${fromBlock}-${toBlock} as proven block is ${proven}`);
    }
    if (toBlock > pending) {
      throw new Error(`Cannot submit epoch proof for ${fromBlock}-${toBlock} as pending block is ${pending}`);
    }

    // Check the block hash and archive for the immediate block before the epoch
    const blockLog = await this.rollupContract.getBlock(proven);
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
    const endBlockLog = await this.rollupContract.getBlock(BigInt(toBlock));
    if (publicInputs.endArchive.root.toString() !== endBlockLog.archive) {
      throw new Error(
        `End archive root mismatch: ${publicInputs.endArchive.root.toString()} !== ${endBlockLog.archive}`,
      );
    }
    if (publicInputs.endBlockHash.toString() !== endBlockLog.blockHash) {
      throw new Error(`End block hash mismatch: ${publicInputs.endBlockHash.toString()} !== ${endBlockLog.blockHash}`);
    }

    // Compare the public inputs computed by the contract with the ones injected
    const rollupPublicInputs = await this.rollupContract.getEpochProofPublicInputs(this.getSubmitEpochProofArgs(args));
    const aggregationObject = proof.isEmpty()
      ? times(AGGREGATION_OBJECT_LENGTH, Fr.zero)
      : proof.extractAggregationObject();
    const argsPublicInputs = [...publicInputs.toFields(), ...aggregationObject];

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
  }): Promise<TransactionReceipt | undefined> {
    const proofHex: Hex = `0x${args.proof.withoutPublicInputs().toString('hex')}`;
    const argsArray = this.getSubmitEpochProofArgs(args);

    const txArgs = [
      {
        start: argsArray[0],
        end: argsArray[1],
        args: argsArray[2],
        fees: argsArray[3],
        blobPublicInputs: argsArray[4],
        aggregationObject: argsArray[5],
        proof: proofHex,
      },
    ] as const;

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

  private getSubmitEpochProofArgs(args: {
    fromBlock: number;
    toBlock: number;
    publicInputs: RootRollupPublicInputs;
    proof: Proof;
  }) {
    return [
      BigInt(args.fromBlock),
      BigInt(args.toBlock),
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
      `0x${args.publicInputs.blobPublicInputs
        .filter((_, i) => i < args.toBlock - args.fromBlock + 1)
        .map(b => b.toString())
        .join(``)}`,
      `0x${serializeToBuffer(args.proof.extractAggregationObject()).toString('hex')}`,
    ] as const;
  }

  protected async sleepOrInterrupted() {
    await this.interruptibleSleep.sleep(this.sleepTimeMs);
  }
}
