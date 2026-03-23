import { BatchedBlobAccumulator, type FinalBlobBatchingChallenges } from '@aztec/blob-lib';
import type { BatchedBlob } from '@aztec/blob-lib/types';
import {
  ARCHIVE_HEIGHT,
  BLOBS_PER_CHECKPOINT,
  FIELDS_PER_BLOB,
  type NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  OUT_HASH_TREE_HEIGHT,
} from '@aztec/constants';
import type { EpochNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { BLS12Point } from '@aztec/foundation/curves/bls12';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AbortError } from '@aztec/foundation/error';
import type { Logger, LoggerBindings } from '@aztec/foundation/log';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { SerialQueue } from '@aztec/foundation/queue';
import type { Tuple } from '@aztec/foundation/serialize';
import { sleep } from '@aztec/foundation/sleep';
import { MerkleTreeCalculator, shaMerkleHash } from '@aztec/foundation/trees';
import type { TreeNodeLocation } from '@aztec/foundation/trees';
import type { EthAddress } from '@aztec/stdlib/block';
import type { PublicInputsAndRecursiveProof, ServerCircuitProver } from '@aztec/stdlib/interfaces/server';
import { computeCheckpointOutHash } from '@aztec/stdlib/messaging';
import type { Proof } from '@aztec/stdlib/proofs';
import {
  type BlockRollupPublicInputs,
  CheckpointRootRollupHints,
  CheckpointRootRollupPrivateInputs,
  CheckpointRootSingleBlockRollupPrivateInputs,
  type RootRollupPublicInputs,
} from '@aztec/stdlib/rollup';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import type { BlockHeader } from '@aztec/stdlib/tx';
import type { TelemetryClient } from '@aztec/telemetry-client';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { buildBlobHints, toProofData } from './block-building-helpers.js';
import { EpochProvingState, type ProvingResult } from './epoch-proving-state.js';

/**
 * Result of proving the top tree (checkpoint roots through root rollup).
 */
export type TopTreeResult = {
  publicInputs: RootRollupPublicInputs;
  proof: Proof;
  batchedBlobInputs: BatchedBlob;
};

/** Data for one checkpoint needed by the top-tree. */
export type CheckpointTopTreeData = {
  /** Block proofs from the sub-tree job. */
  blockProofOutputs: PublicInputsAndRecursiveProof<
    BlockRollupPublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >[];
  /** L2-to-L1 messages per block, for computing the checkpoint out hash. */
  l2ToL1MsgsPerBlock: Fr[][][];
  /** Blob fields for the checkpoint. */
  blobFields: Fr[];
  /** Header of the last block in the previous checkpoint. */
  previousBlockHeader: BlockHeader;
  /** Archive sibling path before this checkpoint (from world state). */
  previousArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>;
};

/**
 * Orchestrates proving from checkpoint root rollups through root rollup.
 *
 * Takes pre-computed block proofs (from CheckpointSubTreeJobs) plus checkpoint
 * data from the archiver. Computes blob/out-hash state directly from archiver
 * data — no block re-processing, no world state forks, no tx simulation.
 */
export class TopTreeOrchestrator {
  private logger: Logger;
  private pendingProvingJobs: AbortController[] = [];
  private deferredJobQueue = new SerialQueue();

  constructor(
    private prover: ServerCircuitProver,
    private proverId: EthAddress,
    private enqueueConcurrency = 32,
    _telemetryClient: TelemetryClient = getTelemetryClient(),
    bindings?: LoggerBindings,
  ) {
    this.logger = createLogger('prover-client:top-tree-orchestrator', bindings);
    this.deferredJobQueue.start(this.enqueueConcurrency);
  }

  /**
   * Prove the top tree from pre-computed block proofs and archiver data.
   * No block re-processing — only checkpoint-root → root-rollup proving.
   */
  async prove(
    epochNumber: EpochNumber,
    totalNumCheckpoints: number,
    finalBlobBatchingChallenges: FinalBlobBatchingChallenges,
    checkpointData: CheckpointTopTreeData[],
  ): Promise<TopTreeResult> {
    const { promise: provingPromise, resolve, reject } = promiseWithResolvers<ProvingResult>();

    const epochState = new EpochProvingState(
      epochNumber,
      totalNumCheckpoints,
      finalBlobBatchingChallenges,
      async () => {},
      resolve,
      reject,
    );

    // Compute out-hash hints for all checkpoints
    const outHashHints = await this.computeOutHashHints(checkpointData);

    // Compute blob accumulator chain
    let blobAccumulator = BatchedBlobAccumulator.newWithChallenges(finalBlobBatchingChallenges);
    const blobAccumulators: BatchedBlobAccumulator[] = [];
    for (const cd of checkpointData) {
      blobAccumulators.push(blobAccumulator);
      blobAccumulator = await blobAccumulator.accumulateFields(cd.blobFields);
    }
    epochState.setEndBlobAccumulator(blobAccumulator);

    // Build and enqueue checkpoint root rollups
    for (let i = 0; i < checkpointData.length; i++) {
      const cd = checkpointData[i];
      const inputs = await this.buildCheckpointRootInputs(
        cd,
        outHashHints[i],
        blobAccumulators[i],
        finalBlobBatchingChallenges,
      );
      this.enqueueCheckpointRootFromInputs(epochState, i, inputs);
    }

    // Wait for proving to complete
    const result = await provingPromise.catch((reason): ProvingResult => ({ status: 'failure', reason }));
    if (result.status === 'failure') {
      throw new Error(`Top tree proving failed: ${result.reason}`);
    }

    await epochState.finalizeBatchedBlob();
    return epochState.getEpochProofResult();
  }

  async stop(): Promise<void> {
    for (const controller of this.pendingProvingJobs) {
      controller.abort();
    }
    await this.deferredJobQueue.cancel();
  }

  private async computeOutHashHints(
    checkpointData: CheckpointTopTreeData[],
  ): Promise<Array<{ treeSnapshot: AppendOnlyTreeSnapshot; siblingPath: Tuple<Fr, typeof OUT_HASH_TREE_HEIGHT> }>> {
    const treeCalculator = await MerkleTreeCalculator.create(OUT_HASH_TREE_HEIGHT, undefined, (left, right) =>
      Promise.resolve(shaMerkleHash(left, right)),
    );

    const computeHint = async (leaves: Fr[]) => {
      const tree = await treeCalculator.computeTree(leaves.map(l => l.toBuffer()));
      const nextAvailableLeafIndex = leaves.length;
      return {
        treeSnapshot: new AppendOnlyTreeSnapshot(Fr.fromBuffer(tree.root), nextAvailableLeafIndex),
        siblingPath: tree.getSiblingPath(nextAvailableLeafIndex).map(Fr.fromBuffer) as Tuple<
          Fr,
          typeof OUT_HASH_TREE_HEIGHT
        >,
      };
    };

    const hints = [];
    const outHashes: Fr[] = [];

    for (const cd of checkpointData) {
      // Hint for THIS checkpoint is based on preceding out hashes
      hints.push(await computeHint(outHashes));

      // Compute this checkpoint's out hash from its blocks' L2-to-L1 messages
      const outHash = computeCheckpointOutHash(cd.l2ToL1MsgsPerBlock);
      outHashes.push(outHash);
    }

    return hints;
  }

  private async buildCheckpointRootInputs(
    cd: CheckpointTopTreeData,
    outHashHint: { treeSnapshot: AppendOnlyTreeSnapshot; siblingPath: Tuple<Fr, typeof OUT_HASH_TREE_HEIGHT> },
    startBlobAccumulator: BatchedBlobAccumulator,
    finalBlobChallenges: FinalBlobBatchingChallenges,
  ) {
    const { blobCommitments, blobsHash } = await buildBlobHints(cd.blobFields);

    const hints = CheckpointRootRollupHints.from({
      previousBlockHeader: cd.previousBlockHeader,
      previousArchiveSiblingPath: cd.previousArchiveSiblingPath,
      previousOutHash: outHashHint.treeSnapshot,
      newOutHashSiblingPath: outHashHint.siblingPath,
      startBlobAccumulator: startBlobAccumulator.toBlobAccumulator(),
      finalBlobChallenges: finalBlobChallenges,
      blobFields: padArrayEnd(cd.blobFields, Fr.ZERO, FIELDS_PER_BLOB * BLOBS_PER_CHECKPOINT),
      blobCommitments: padArrayEnd(blobCommitments, BLS12Point.ZERO, BLOBS_PER_CHECKPOINT),
      blobsHash,
    });

    const proofDatas = cd.blockProofOutputs.map(p => toProofData(p));

    return proofDatas.length === 1
      ? new CheckpointRootSingleBlockRollupPrivateInputs(proofDatas[0], hints)
      : new CheckpointRootRollupPrivateInputs([proofDatas[0], proofDatas[1]], hints);
  }

  // --- Proving infrastructure (same as before) ---

  private deferredProving<T>(
    provingState: EpochProvingState,
    request: (signal: AbortSignal) => Promise<T>,
    callback: (result: T) => void | Promise<void>,
  ) {
    if (!provingState.verifyState()) {
      return;
    }

    const controller = new AbortController();
    this.pendingProvingJobs.push(controller);

    const safeJob = async () => {
      try {
        if (controller.signal.aborted) {
          return;
        }
        const result = await request(controller.signal);
        if (!provingState.verifyState() || controller.signal.aborted) {
          return;
        }
        await callback(result);
      } catch (err) {
        if (err instanceof AbortError) {
          return;
        }
        this.logger.error(`Error thrown when proving job`, err);
        provingState.reject(`${err}`);
      } finally {
        const index = this.pendingProvingJobs.indexOf(controller);
        if (index > -1) {
          this.pendingProvingJobs.splice(index, 1);
        }
      }
    };

    void this.deferredJobQueue.put(async () => {
      void safeJob();
      await sleep(0);
    });
  }

  private enqueueCheckpointRootFromInputs(
    epochState: EpochProvingState,
    checkpointIndex: number,
    inputs: CheckpointRootRollupPrivateInputs | CheckpointRootSingleBlockRollupPrivateInputs,
  ) {
    this.logger.debug(`Enqueuing checkpoint root rollup for checkpoint ${checkpointIndex}`);

    this.deferredProving(
      epochState,
      signal => {
        if (inputs instanceof CheckpointRootSingleBlockRollupPrivateInputs) {
          return this.prover.getCheckpointRootSingleBlockRollupProof(inputs, signal, epochState.epochNumber);
        } else {
          return this.prover.getCheckpointRootRollupProof(inputs, signal, epochState.epochNumber);
        }
      },
      result => {
        this.logger.debug(`Completed checkpoint root proof for checkpoint ${checkpointIndex}`);
        const leafLocation = epochState.setCheckpointRootRollupProof(checkpointIndex, result);

        if (epochState.totalNumCheckpoints === 1) {
          this.enqueueEpochPadding(epochState);
        } else {
          this.checkAndEnqueueNextCheckpointMergeRollup(epochState, leafLocation);
        }
      },
    );
  }

  private enqueueCheckpointMergeRollup(provingState: EpochProvingState, location: TreeNodeLocation) {
    if (!provingState.verifyState() || !provingState.tryStartProvingCheckpointMerge(location)) {
      return;
    }

    const inputs = provingState.getCheckpointMergeRollupInputs(location);
    this.deferredProving(
      provingState,
      signal => this.prover.getCheckpointMergeRollupProof(inputs, signal, provingState.epochNumber),
      result => {
        provingState.setCheckpointMergeRollupProof(location, result);
        this.checkAndEnqueueNextCheckpointMergeRollup(provingState, location);
      },
    );
  }

  private enqueueEpochPadding(provingState: EpochProvingState) {
    if (!provingState.verifyState() || !provingState.tryStartProvingPaddingCheckpoint()) {
      return;
    }

    this.logger.debug('Padding epoch proof.');
    const inputs = provingState.getPaddingCheckpointInputs();
    this.deferredProving(
      provingState,
      signal => this.prover.getCheckpointPaddingRollupProof(inputs, signal, provingState.epochNumber),
      result => {
        provingState.setCheckpointPaddingProof(result);
        this.checkAndEnqueueRootRollup(provingState);
      },
    );
  }

  private enqueueRootRollup(provingState: EpochProvingState) {
    if (!provingState.verifyState()) {
      return;
    }

    this.logger.debug(`Preparing root rollup`);
    const inputs = provingState.getRootRollupInputs();
    this.deferredProving(
      provingState,
      signal => this.prover.getRootRollupProof(inputs, signal, provingState.epochNumber),
      result => {
        this.logger.verbose(`Completed root rollup for epoch ${provingState.epochNumber}`);
        provingState.setRootRollupProof(result);
        provingState.resolve({ status: 'success' });
      },
    );
  }

  private checkAndEnqueueNextCheckpointMergeRollup(provingState: EpochProvingState, currentLocation: TreeNodeLocation) {
    if (!provingState.isReadyForCheckpointMerge(currentLocation)) {
      return;
    }
    const parentLocation = provingState.getParentLocation(currentLocation);
    if (parentLocation.level === 0) {
      this.checkAndEnqueueRootRollup(provingState);
    } else {
      this.enqueueCheckpointMergeRollup(provingState, parentLocation);
    }
  }

  private checkAndEnqueueRootRollup(provingState: EpochProvingState) {
    if (!provingState.isReadyForRootRollup()) {
      return;
    }
    this.enqueueRootRollup(provingState);
  }
}
