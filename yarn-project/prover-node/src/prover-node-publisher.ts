import { BatchedBlob, getEthBlobEvaluationInputs } from '@aztec/blob-lib';
import { MAX_CHECKPOINTS_PER_EPOCH } from '@aztec/constants';
import type { RollupContract, ViemCommitteeAttestation } from '@aztec/ethereum/contracts';
import type { L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import { CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { areArraysEqual } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts';
import type { PublisherConfig, TxSenderConfig } from '@aztec/sequencer-client';
import { CommitteeAttestation, CommitteeAttestationsAndSigners } from '@aztec/stdlib/block';
import type { Proof } from '@aztec/stdlib/proofs';
import type { CheckpointHeader, RootRollupPublicInputs } from '@aztec/stdlib/rollup';
import type { L1PublishProofStats } from '@aztec/stdlib/stats';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { inspect } from 'util';
import { type Hex, type TransactionReceipt, encodeFunctionData, formatEther, formatGwei } from 'viem';

import { type EstimatedSubmitProofStats, ProverNodePublisherMetrics } from './metrics.js';

/** Arguments to the submitEpochProof method of the rollup contract */
export type L1SubmitEpochProofArgs = {
  epochSize: number;
  previousArchive: Fr;
  endArchive: Fr;
  endTimestamp: Fr;
  outHash: Fr;
  proverId: Fr;
  headers: CheckpointHeader[];
  proof: Proof;
};

export class ProverNodePublisher {
  private metrics: ProverNodePublisherMetrics;

  protected log: Logger;

  protected rollupContract: RollupContract;

  protected proofSubmissionTarget: Hex;

  public readonly l1TxUtils: L1TxUtils;

  constructor(
    config: TxSenderConfig & PublisherConfig,
    deps: {
      rollupContract: RollupContract;
      l1TxUtils: L1TxUtils;
      proofSubmissionTarget?: EthAddress;
      telemetry?: TelemetryClient;
    },
    bindings?: LoggerBindings,
  ) {
    const telemetry = deps.telemetry ?? getTelemetryClient();

    this.metrics = new ProverNodePublisherMetrics(telemetry, 'ProverNode');
    this.log = createLogger('prover-node:l1-tx-publisher', bindings);

    this.rollupContract = deps.rollupContract;
    this.proofSubmissionTarget = deps.proofSubmissionTarget?.toString() ?? deps.rollupContract.address;
    this.l1TxUtils = deps.l1TxUtils;
  }

  public getRollupContract() {
    return this.rollupContract;
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
    headers: CheckpointHeader[];
    /** Wall-clock deadline (proof-submission window end) past which the L1 tx should stop retrying. */
    deadline?: Date;
  }): Promise<boolean> {
    const { epochNumber, fromCheckpoint, toCheckpoint } = args;
    const ctx = { epochNumber, fromCheckpoint, toCheckpoint };

    const timer = new Timer();
    // Validate epoch proof range and hashes are correct before submitting
    await this.validateEpochProofSubmission(args);

    const txReceipt = await this.sendSubmitEpochProofTx(args);
    if (!txReceipt) {
      this.log.error(`Failed to mine submitEpochProof tx`, undefined, ctx);
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
    this.log.error(`Rollup submitEpochProof tx reverted ${txReceipt.transactionHash}`, undefined, ctx);
    return false;
  }

  private async validateEpochProofSubmission(args: {
    fromCheckpoint: CheckpointNumber;
    toCheckpoint: CheckpointNumber;
    publicInputs: RootRollupPublicInputs;
    proof: Proof;
    batchedBlobInputs: BatchedBlob;
    attestations: ViemCommitteeAttestation[];
    headers: CheckpointHeader[];
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
        `Cannot submit epoch proof for ${fromCheckpoint}-${toCheckpoint} as proposed checkpoint is ${pending}`,
      );
    }

    // Check the archive for the immediate checkpoint before the epoch
    const checkpointLog = await this.rollupContract.getCheckpoint(CheckpointNumber(fromCheckpoint - 1));
    if (!publicInputs.previousArchiveRoot.equals(checkpointLog.archive)) {
      throw new Error(
        `Previous archive root mismatch: ${publicInputs.previousArchiveRoot.toString()} !== ${checkpointLog.archive.toString()}`,
      );
    }

    // Check the archive for the last checkpoint in the epoch
    const endCheckpointLog = await this.rollupContract.getCheckpoint(toCheckpoint);
    if (!publicInputs.endArchiveRoot.equals(endCheckpointLog.archive)) {
      throw new Error(
        `End archive root mismatch: ${publicInputs.endArchiveRoot.toString()} !== ${endCheckpointLog.archive.toString()}`,
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

    if (!areArraysEqual(rollupPublicInputs, argsPublicInputs, (a, b) => a.equals(b))) {
      throw await reportPublicInputsMismatch({
        rollupPublicInputs,
        argsPublicInputs,
        fromCheckpoint,
        toCheckpoint,
        rollupContract: this.rollupContract,
        log: this.log,
      });
    }
  }

  /**
   * Estimates what submitting the epoch proof would have cost on L1 without actually sending it.
   * Runs the same validation as `submitEpochProof`, encodes the calldata, estimates gas, and records metrics.
   * Used when proof publishing is disabled (e.g. PROVER_NODE_DISABLE_PROOF_PUBLISH=true on mainnet).
   */
  public async analyzeEpochProofSubmission(args: {
    epochNumber: EpochNumber;
    fromCheckpoint: CheckpointNumber;
    toCheckpoint: CheckpointNumber;
    publicInputs: RootRollupPublicInputs;
    proof: Proof;
    batchedBlobInputs: BatchedBlob;
    attestations: ViemCommitteeAttestation[];
    headers: CheckpointHeader[];
  }): Promise<void> {
    const { epochNumber, fromCheckpoint, toCheckpoint } = args;

    await this.validateEpochProofSubmission(args);

    const data = this.encodeSubmitEpochProofCalldata(args);
    const senderAddress = this.l1TxUtils.getSenderAddress();

    const [gasLimit, gasPrice, latestBlock] = await Promise.all([
      this.l1TxUtils.estimateGas(senderAddress.toString() as `0x${string}`, { to: this.proofSubmissionTarget, data }),
      this.l1TxUtils.getGasPrice(),
      this.l1TxUtils.client.getBlock({ blockTag: 'latest' }),
    ]);

    const baseFeePerGas = latestBlock.baseFeePerGas ?? 0n;
    const { maxPriorityFeePerGas } = gasPrice;

    const effectiveFeePerGas = baseFeePerGas + maxPriorityFeePerGas;
    const estimatedTotalFee = gasLimit * effectiveFeePerGas;

    const stats: EstimatedSubmitProofStats = {
      gasLimit,
      baseFeePerGas,
      maxPriorityFeePerGas,
      estimatedTotalFee,
    };

    this.log.info(`Estimated epoch proof submission cost (not submitted)`, {
      epochNumber,
      fromCheckpoint,
      toCheckpoint,
      gasLimit: gasLimit.toString(),
      baseFeePerGas: formatGwei(baseFeePerGas),
      maxPriorityFeePerGas: formatGwei(maxPriorityFeePerGas),
      estimatedTotalFeeEth: formatEther(estimatedTotalFee),
    });

    this.metrics.recordEstimatedSubmitProof(stats);
  }

  private encodeSubmitEpochProofCalldata(args: {
    fromCheckpoint: CheckpointNumber;
    toCheckpoint: CheckpointNumber;
    publicInputs: RootRollupPublicInputs;
    proof: Proof;
    batchedBlobInputs: BatchedBlob;
    attestations: ViemCommitteeAttestation[];
    headers: CheckpointHeader[];
  }): Hex {
    return encodeFunctionData({
      abi: RollupAbi,
      functionName: 'submitEpochRootProof',
      args: [this.getSubmitEpochProofArgs(args)],
    });
  }

  private async sendSubmitEpochProofTx(args: {
    fromCheckpoint: CheckpointNumber;
    toCheckpoint: CheckpointNumber;
    deadline?: Date;
    publicInputs: RootRollupPublicInputs;
    proof: Proof;
    batchedBlobInputs: BatchedBlob;
    attestations: ViemCommitteeAttestation[];
    headers: CheckpointHeader[];
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
      const { receipt } = await this.l1TxUtils.sendAndMonitorTransaction(
        { to: this.proofSubmissionTarget, data },
        { txTimeoutAt: args.deadline },
      );
      if (receipt.status !== 'success') {
        const errorMsg = await this.l1TxUtils.tryGetErrorFromRevertedTx(
          data,
          {
            args: [...txArgs],
            functionName: 'submitEpochRootProof',
            abi: RollupAbi,
            address: this.proofSubmissionTarget,
          },
          /*blobInputs*/ undefined,
          /*stateOverride*/ [],
        );
        this.log.error(`Rollup submit epoch proof tx reverted with ${errorMsg ?? 'unknown error'}`);
        return undefined;
      }
      return receipt;
    } catch (err) {
      this.log.error(`Rollup submit epoch proof failed`, err);
      return undefined;
    }
  }

  private getEpochProofPublicInputsArgs(args: {
    fromCheckpoint: CheckpointNumber;
    toCheckpoint: CheckpointNumber;
    publicInputs: RootRollupPublicInputs;
    batchedBlobInputs: BatchedBlob;
    attestations: ViemCommitteeAttestation[];
    headers: CheckpointHeader[];
  }) {
    // Returns arguments for EpochProofLib.sol -> getEpochProofPublicInputs()
    return [
      BigInt(args.fromCheckpoint) /*_start*/,
      BigInt(args.toCheckpoint) /*_end*/,
      {
        previousArchive: args.publicInputs.previousArchiveRoot.toString(),
        endArchive: args.publicInputs.endArchiveRoot.toString(),
        outHash: args.publicInputs.outHash.toString(),
        proverId: EthAddress.fromField(args.publicInputs.constants.proverId).toString(),
      } /*_args*/,
      args.headers.map(header => header.toViem()) /*_headers*/,
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
    headers: CheckpointHeader[];
  }) {
    // Returns arguments for EpochProofLib.sol -> submitEpochRootProof()
    const proofHex: Hex = `0x${args.proof.withoutPublicInputs().toString('hex')}`;
    const argsArray = this.getEpochProofPublicInputsArgs(args);
    return {
      start: argsArray[0],
      end: argsArray[1],
      args: argsArray[2],
      headers: argsArray[3],
      attestations: CommitteeAttestationsAndSigners.packAttestations(
        args.attestations.map(a => CommitteeAttestation.fromViem(a)),
      ),
      blobInputs: argsArray[4],
      proof: proofHex,
    };
  }
}

/**
 * Decodes a `Root rollup public inputs mismatch`, fetches the on-chain CheckpointLog for any
 * mismatching `checkpointHeaderHashes[i]`, emits a structured error log, and returns a thrown-ready
 * Error with a human-readable summary.
 *
 * Layout of `RootRollupPublicInputs.toFields()`:
 *   [0]                   previousArchiveRoot
 *   [1]                   endArchiveRoot
 *   [2]                   outHash
 *   [3 .. 3+N-1]          checkpointHeaderHashes[i] for i in 0..N-1   (N = MAX_CHECKPOINTS_PER_EPOCH)
 *   [3+N .. 3+3N-1]       fees[i] = (recipient, value) for i in 0..N-1
 *   [3+3N .. 3+3N+4]      EpochConstantData (chainId, version, vkTreeRoot, protocolContractsHash, proverId)
 *   [3+3N+5 ..]           blobPublicInputs (FinalBlobAccumulator)
 */
async function reportPublicInputsMismatch(input: {
  rollupPublicInputs: readonly Fr[];
  argsPublicInputs: readonly Fr[];
  fromCheckpoint: CheckpointNumber;
  toCheckpoint: CheckpointNumber;
  rollupContract: RollupContract;
  log: Logger;
}): Promise<Error> {
  const { rollupPublicInputs, argsPublicInputs, fromCheckpoint, toCheckpoint, rollupContract, log } = input;
  const N = MAX_CHECKPOINTS_PER_EPOCH;
  const constantsStart = 3 + 3 * N;
  const blobStart = constantsStart + 5;
  const constantLabels = ['chainId', 'version', 'vkTreeRoot', 'protocolContractsHash', 'proverId'];

  const diffs: { index: number; label: string; rollup: Fr; computed: Fr; checkpointIndex?: number }[] = [];
  const len = Math.max(rollupPublicInputs.length, argsPublicInputs.length);
  for (let i = 0; i < len; i++) {
    const a = rollupPublicInputs[i] ?? Fr.ZERO;
    const b = argsPublicInputs[i] ?? Fr.ZERO;
    if (a.equals(b)) {
      continue;
    }
    let label: string;
    let checkpointIndex: number | undefined;
    if (i === 0) {
      label = 'previousArchiveRoot';
    } else if (i === 1) {
      label = 'endArchiveRoot';
    } else if (i === 2) {
      label = 'outHash';
    } else if (i < 3 + N) {
      checkpointIndex = i - 3;
      label = `checkpointHeaderHashes[${checkpointIndex}]`;
    } else if (i < 3 + 3 * N) {
      const feePairIndex = i - (3 + N);
      const feeIndex = Math.floor(feePairIndex / 2);
      const sub = feePairIndex % 2 === 0 ? 'recipient' : 'value';
      label = `fees[${feeIndex}].${sub}`;
    } else if (i < blobStart) {
      label = `constants.${constantLabels[i - constantsStart]}`;
    } else {
      label = `blobPublicInputs[${i - blobStart}]`;
    }
    diffs.push({ index: i, label, rollup: a, computed: b, checkpointIndex });
  }

  // For each mismatching checkpointHeaderHash, fetch the L1 CheckpointLog so the operator can
  // see what was published on-chain alongside the prover's recomputed hash.
  const onChainCheckpoints = await Promise.all(
    diffs
      .filter(d => d.checkpointIndex !== undefined)
      .map(async d => {
        const checkpointNumber = CheckpointNumber(fromCheckpoint + d.checkpointIndex!);
        try {
          const cp = await rollupContract.getCheckpoint(checkpointNumber);
          return { checkpointIndex: d.checkpointIndex!, checkpointNumber, headerHash: cp.headerHash.toString() };
        } catch (err) {
          return { checkpointIndex: d.checkpointIndex!, checkpointNumber, error: (err as Error).message };
        }
      }),
  );

  log.error(`Root rollup public inputs mismatch`, undefined, {
    fromCheckpoint,
    toCheckpoint,
    numDiffs: diffs.length,
    diffs: diffs.map(d => ({
      index: d.index,
      label: d.label,
      rollup: d.rollup.toString(),
      computed: d.computed.toString(),
    })),
    onChainCheckpoints,
  });

  const fmt = (inputs: readonly Fr[]) => inputs.map(x => x.toString()).join(', ');
  const summary = diffs.map(d => `[${d.index} ${d.label}] L1=${d.rollup} prover=${d.computed}`).join('\n');
  return new Error(
    `Root rollup public inputs mismatch (${diffs.length} fields differ):\n${summary}\n` +
      `Rollup:  ${fmt(rollupPublicInputs)}\nComputed:${fmt(argsPublicInputs)}`,
  );
}
