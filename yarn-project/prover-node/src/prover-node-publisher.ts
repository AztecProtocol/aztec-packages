import { BatchedBlob, getEthBlobEvaluationInputs } from '@aztec/blob-lib';
import { AZTEC_MAX_EPOCH_DURATION } from '@aztec/constants';
import type { L1TxUtils, RollupContract, ViemCommitteeAttestation } from '@aztec/ethereum';
import { makeTuple } from '@aztec/foundation/array';
import { CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { areArraysEqual } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { Tuple } from '@aztec/foundation/serialize';
import { Timer } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts';
import type { PublisherConfig, TxSenderConfig } from '@aztec/sequencer-client';
import { CommitteeAttestation, CommitteeAttestationsAndSigners } from '@aztec/stdlib/block';
import type { Proof } from '@aztec/stdlib/proofs';
import type { FeeRecipient, RootRollupPublicInputs } from '@aztec/stdlib/rollup';
import type { L1PublishProofStats } from '@aztec/stdlib/stats';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { inspect } from 'util';
import { type Hex, type TransactionReceipt, encodeFunctionData } from 'viem';

import { ProverNodePublisherMetrics } from './metrics.js';

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
    this.l1TxUtils.interrupt();
  }

  /** Restarts the publisher after calling `interrupt`. */
  public restart() {
    this.interrupted = false;
    this.l1TxUtils.restart();
  }

  public getSenderAddress() {
    return this.l1TxUtils.getSenderAddress();
  }

  public async submitEpochProof(args: {
    epochNumber: EpochNumber;
    fromCheckpoint: CheckpointNumber;
    toCheckpoint: CheckpointNumber;
    publicInputs: RootRollupPublicInputs;
    proof: Proof;
    batchedBlobInputs: BatchedBlob;
    attestations: ViemCommitteeAttestation[];
  }): Promise<boolean> {
    const { epochNumber, fromCheckpoint, toCheckpoint } = args;
    const ctx = { epochNumber, fromCheckpoint, toCheckpoint };

    if (!this.interrupted) {
      const timer = new Timer();
      // Validate epoch proof range and hashes are correct before submitting
      await this.validateEpochProofSubmission(args);

      const txReceipt = await this.sendSubmitEpochProofTx(args);
      if (!txReceipt) {
        return false;
      }

      try {
        this.metrics.recordSenderBalance(
          await this.l1TxUtils.getSenderBalance(),
          this.l1TxUtils.getSenderAddress().toString(),
        );
      } catch (err) {
        this.log.warn(`Failed to record the ETH balance of the prover node: ${err}`);
      }

      // Tx was mined successfully
      if (txReceipt.status === 'success') {
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
      this.log.error(`Rollup.submitEpochProof tx status failed ${txReceipt.transactionHash}`, undefined, ctx);
    }

    this.log.verbose('Checkpoint data syncing interrupted', ctx);
    return false;
  }

  private async validateEpochProofSubmission(args: {
    fromCheckpoint: CheckpointNumber;
    toCheckpoint: CheckpointNumber;
    publicInputs: RootRollupPublicInputs;
    proof: Proof;
    batchedBlobInputs: BatchedBlob;
    attestations: ViemCommitteeAttestation[];
  }) {
    const { fromCheckpoint, toCheckpoint, publicInputs, batchedBlobInputs } = args;

    // Check that the checkpoint numbers match the expected epoch to be proven
    const { pending, proven } = await this.rollupContract.getTips();
    // Don't publish if proven is beyond our toCheckpoint, pointless to do so
    if (proven > toCheckpoint) {
      throw new Error(
        `Cannot submit epoch proof for ${fromCheckpoint}-${toCheckpoint} as proven checkpoint is ${proven}`,
      );
    }
    // toCheckpoint can't be greater than pending
    if (toCheckpoint > pending) {
      throw new Error(
        `Cannot submit epoch proof for ${fromCheckpoint}-${toCheckpoint} as pending checkpoint is ${pending}`,
      );
    }

    // Check the archive for the immediate checkpoint before the epoch
    const checkpointLog = await this.rollupContract.getCheckpoint(CheckpointNumber(fromCheckpoint - 1));
    if (publicInputs.previousArchiveRoot.toString() !== checkpointLog.archive) {
      throw new Error(
        `Previous archive root mismatch: ${publicInputs.previousArchiveRoot.toString()} !== ${checkpointLog.archive}`,
      );
    }

    // Check the archive for the last checkpoint in the epoch
    const endCheckpointLog = await this.rollupContract.getCheckpoint(toCheckpoint);
    if (publicInputs.endArchiveRoot.toString() !== endCheckpointLog.archive) {
      throw new Error(
        `End archive root mismatch: ${publicInputs.endArchiveRoot.toString()} !== ${endCheckpointLog.archive}`,
      );
    }

    // Check the batched blob inputs from the root rollup against the batched blob computed in ts
    const finalBlobAccumulator = batchedBlobInputs.toFinalBlobAccumulator();
    if (!publicInputs.blobPublicInputs.equals(finalBlobAccumulator)) {
      throw new Error(
        `Batched blob mismatch: ${inspect(publicInputs.blobPublicInputs)} !== ${inspect(finalBlobAccumulator)}`,
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
    fromCheckpoint: CheckpointNumber;
    toCheckpoint: CheckpointNumber;
    publicInputs: RootRollupPublicInputs;
    proof: Proof;
    batchedBlobInputs: BatchedBlob;
    attestations: ViemCommitteeAttestation[];
  }): Promise<TransactionReceipt | undefined> {
    const txArgs = [this.getSubmitEpochProofArgs(args)] as const;

    this.log.info(`Submitting epoch proof to L1 rollup contract`, {
      proofSize: args.proof.withoutPublicInputs().length,
      fromCheckpoint: args.fromCheckpoint,
      toCheckpoint: args.toCheckpoint,
    });
    const data = encodeFunctionData({
      abi: RollupAbi,
      functionName: 'submitEpochRootProof',
      args: txArgs,
    });
    try {
      const { receipt } = await this.l1TxUtils.sendAndMonitorTransaction({ to: this.rollupContract.address, data });
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
    fromCheckpoint: CheckpointNumber;
    toCheckpoint: CheckpointNumber;
    publicInputs: RootRollupPublicInputs;
    batchedBlobInputs: BatchedBlob;
    attestations: ViemCommitteeAttestation[];
  }) {
    // Returns arguments for EpochProofLib.sol -> getEpochProofPublicInputs()
    return [
      BigInt(args.fromCheckpoint) /*_start*/,
      BigInt(args.toCheckpoint) /*_end*/,
      {
        previousArchive: args.publicInputs.previousArchiveRoot.toString(),
        endArchive: args.publicInputs.endArchiveRoot.toString(),
        proverId: EthAddress.fromField(args.publicInputs.constants.proverId).toString(),
      } /*_args*/,
      makeTuple(AZTEC_MAX_EPOCH_DURATION * 2, i =>
        i % 2 === 0
          ? args.publicInputs.fees[i / 2].recipient.toField().toString()
          : args.publicInputs.fees[(i - 1) / 2].value.toString(),
      ) /*_fees*/,
      getEthBlobEvaluationInputs(args.batchedBlobInputs) /*_blobPublicInputs*/,
    ] as const;
  }

  private getSubmitEpochProofArgs(args: {
    fromCheckpoint: CheckpointNumber;
    toCheckpoint: CheckpointNumber;
    publicInputs: RootRollupPublicInputs;
    proof: Proof;
    batchedBlobInputs: BatchedBlob;
    attestations: ViemCommitteeAttestation[];
  }) {
    // Returns arguments for EpochProofLib.sol -> submitEpochRootProof()
    const proofHex: Hex = `0x${args.proof.withoutPublicInputs().toString('hex')}`;
    const argsArray = this.getEpochProofPublicInputsArgs(args);
    return {
      start: argsArray[0],
      end: argsArray[1],
      args: argsArray[2],
      fees: argsArray[3],
      attestations: new CommitteeAttestationsAndSigners(
        args.attestations.map(a => CommitteeAttestation.fromViem(a)),
      ).getPackedAttestations(),
      blobInputs: argsArray[4],
      proof: proofHex,
    };
  }
}
