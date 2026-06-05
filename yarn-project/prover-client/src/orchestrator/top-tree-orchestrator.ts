import { BatchedBlobAccumulator, type FinalBlobBatchingChallenges } from '@aztec/blob-lib';
import type { BatchedBlob } from '@aztec/blob-lib/types';
import {
  type ARCHIVE_HEIGHT,
  BLOBS_PER_CHECKPOINT,
  FIELDS_PER_BLOB,
  type NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  OUT_HASH_TREE_HEIGHT,
} from '@aztec/constants';
import type { EpochNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { BLS12Point } from '@aztec/foundation/curves/bls12';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { LoggerBindings } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import type { Tuple } from '@aztec/foundation/serialize';
import { MerkleTreeCalculator, shaMerkleHash } from '@aztec/foundation/trees';
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
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { buildBlobHints, toProofData } from './block-building-helpers.js';
import { TopTreeProvingScheduler } from './top-tree-proving-scheduler.js';
import { TopTreeProvingState } from './top-tree-proving-state.js';

/** Per-checkpoint data fed into the top tree. */
export type CheckpointTopTreeData = {
  /**
   * Block-rollup proof outputs from the checkpoint's sub-tree. Passed as a Promise so the
   * top tree can start (compute hints, pipeline merges) while sub-trees are still proving.
   * The promise resolves to 1 entry for a single-block checkpoint, 2 for multi-block.
   */
  blockProofs: Promise<
    PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>[]
  >;
  /** L2-to-L1 messages per block in the checkpoint, used to compute the out hash. */
  l2ToL1MsgsPerBlock: Fr[][][];
  /** Blob fields encoding the checkpoint's tx effects, used to compute the blob accumulator. */
  blobFields: Fr[];
  /** Header of the last block in the previous checkpoint (or the epoch's predecessor for index 0). */
  previousBlockHeader: BlockHeader;
  /** Sibling path of the archive tree before any block in this checkpoint landed. */
  previousArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>;
};

/** Result of proving the top tree. */
export type TopTreeResult = {
  publicInputs: RootRollupPublicInputs;
  proof: Proof;
  batchedBlobInputs: BatchedBlob;
};

/**
 * Sentinel thrown by `cancel` so callers can distinguish reorg-driven cancellation from
 * a genuine proving failure (and choose to rebuild + retry instead of failing the epoch).
 */
export class TopTreeCancelledError extends Error {
  constructor(reason = 'Top-tree proving cancelled') {
    super(reason);
    this.name = 'TopTreeCancelledError';
  }
}

type OutHashHint = {
  treeSnapshot: AppendOnlyTreeSnapshot;
  siblingPath: Tuple<Fr, typeof OUT_HASH_TREE_HEIGHT>;
};

/**
 * Drives proving from checkpoint root rollups through the epoch root rollup. Owns no
 * world-state forks or tx processing — every input is supplied by the caller.
 *
 * Pipelined start: `prove()` does not wait for block-level proving. It pre-computes the
 * out-hash and blob-accumulator hint chains immediately from archiver-derivable data,
 * and each checkpoint's root rollup fires the moment its sub-tree's `blockProofs`
 * promise resolves. Later checkpoints can still be block-level proving in parallel.
 */
export class TopTreeOrchestrator extends TopTreeProvingScheduler {
  private state: TopTreeProvingState | undefined;
  private cancelled = false;

  constructor(
    prover: ServerCircuitProver,
    private readonly proverId: EthAddress,
    enqueueConcurrency: number,
    _telemetryClient: TelemetryClient = getTelemetryClient(),
    bindings?: LoggerBindings,
  ) {
    super(prover, enqueueConcurrency, 'prover-client:top-tree-orchestrator', bindings);
  }

  public getProverId(): EthAddress {
    return this.proverId;
  }

  /**
   * Proves the top tree from per-checkpoint data and pending block-proofs promises.
   * Resolves with the final epoch proof, or rejects with `TopTreeCancelledError` if
   * `cancel()` is invoked, or any other error if a circuit fails.
   */
  public async prove(
    epochNumber: EpochNumber,
    totalNumCheckpoints: number,
    finalBlobBatchingChallenges: FinalBlobBatchingChallenges,
    checkpointData: CheckpointTopTreeData[],
  ): Promise<TopTreeResult> {
    if (checkpointData.length !== totalNumCheckpoints) {
      throw new Error(
        `checkpointData length (${checkpointData.length}) does not match totalNumCheckpoints (${totalNumCheckpoints}).`,
      );
    }
    if (this.state) {
      throw new Error('TopTreeOrchestrator.prove called twice; construct a new orchestrator per epoch.');
    }
    // If cancel() was already called before prove() ran (e.g. a removeCheckpoint that
    // landed while the caller was still preparing inputs), short-circuit the whole
    // proving path. Without this, prove() would build its state, the per-checkpoint
    // .then handlers would all bail on `this.cancelled`, and the completion promise
    // would never resolve — prove() would hang forever.
    if (this.cancelled) {
      throw new TopTreeCancelledError();
    }

    const { promise: completionPromise, resolve, reject } = promiseWithResolvers<void>();
    // The completion promise is awaited inside the try/catch below. Attach a no-op catch
    // here as well so any spurious unhandled-rejection detection during cancellation
    // (where reject() can fire synchronously before the await microtask installs a handler)
    // is silenced.
    completionPromise.catch(() => {});
    const startBlobAccumulator = BatchedBlobAccumulator.newWithChallenges(finalBlobBatchingChallenges);

    this.state = new TopTreeProvingState(
      epochNumber,
      totalNumCheckpoints,
      finalBlobBatchingChallenges,
      startBlobAccumulator,
      resolve,
      reason => reject(this.cancelled ? new TopTreeCancelledError(reason) : new Error(reason)),
    );

    // Compute the full out-hash hint chain and per-checkpoint start blob accumulators
    // synchronously from archiver data. No proving required.
    const outHashHints = await this.computeOutHashHints(checkpointData);
    const checkpointStartBlobs: BatchedBlobAccumulator[] = [];
    let runningBlobAccumulator = startBlobAccumulator;
    for (const cd of checkpointData) {
      checkpointStartBlobs.push(runningBlobAccumulator);
      runningBlobAccumulator = await runningBlobAccumulator.accumulateFields(cd.blobFields);
    }
    this.state.setEndBlobAccumulator(runningBlobAccumulator);

    // For each checkpoint, await its block proofs promise then enqueue the checkpoint root.
    // Each await runs independently — checkpoints whose sub-trees finish first start their
    // root proofs first, in parallel with later checkpoints' block-level proving.
    for (let i = 0; i < checkpointData.length; i++) {
      const cd = checkpointData[i];
      const checkpointIndex = i;
      void cd.blockProofs.then(
        blockProofs => {
          if (this.cancelled || !this.state?.verifyState()) {
            return;
          }
          this.enqueueCheckpointRoot(
            this.state,
            checkpointIndex,
            blockProofs,
            cd,
            outHashHints[i],
            checkpointStartBlobs[i],
          );
        },
        err => {
          if (this.cancelled) {
            return;
          }
          this.state?.reject(`Sub-tree for checkpoint ${i} failed: ${err}`);
        },
      );
    }

    try {
      await completionPromise;
      await this.state.finalizeBatchedBlob();
      return this.state.getEpochProofResult();
    } catch (err: any) {
      if (this.cancelled) {
        throw new TopTreeCancelledError();
      }
      throw err;
    }
  }

  /**
   * Cancels in-flight proving. If `abortJobs` is true, each pending broker job is aborted
   * (used on reorg, when the surviving checkpoint set differs and the in-flight jobs'
   * inputs are no longer valid). On shutdown the caller passes `false` so jobs remain in
   * the broker queue for reuse on restart.
   */
  public cancel({ abortJobs }: { abortJobs: boolean }) {
    this.cancelled = true;
    this.resetSchedulerState(abortJobs);
    this.state?.cancel();
  }

  /** Standard shutdown — preserve the broker queue (`abortJobs: false`). */
  protected override cancelInternal(): void {
    this.cancel({ abortJobs: false });
  }

  // --- internal: per-checkpoint enqueue path ---

  protected override onRootRollupComplete(state: TopTreeProvingState) {
    state.resolve();
  }

  private enqueueCheckpointRoot(
    state: TopTreeProvingState,
    checkpointIndex: number,
    blockProofs: PublicInputsAndRecursiveProof<
      BlockRollupPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >[],
    cd: CheckpointTopTreeData,
    outHashHint: OutHashHint,
    startBlobAccumulator: BatchedBlobAccumulator,
  ) {
    void this.buildCheckpointRootInputs(blockProofs, cd, outHashHint, startBlobAccumulator).then(inputs => {
      this.deferredProving(
        state,
        signal => {
          if (inputs instanceof CheckpointRootSingleBlockRollupPrivateInputs) {
            return this.prover.getCheckpointRootSingleBlockRollupProof(inputs, signal, state.epochNumber);
          }
          return this.prover.getCheckpointRootRollupProof(inputs, signal, state.epochNumber);
        },
        result => {
          this.logger.debug(`Completed checkpoint root proof for checkpoint ${checkpointIndex}`);
          const leafLocation = state.setCheckpointRootRollupProof(checkpointIndex, result);
          if (state.totalNumCheckpoints === 1) {
            this.enqueueEpochPadding(state);
          } else {
            this.checkAndEnqueueNextCheckpointMergeRollup(state, leafLocation);
          }
        },
      );
    });
  }

  private async buildCheckpointRootInputs(
    blockProofs: PublicInputsAndRecursiveProof<
      BlockRollupPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >[],
    cd: CheckpointTopTreeData,
    outHashHint: OutHashHint,
    startBlobAccumulator: BatchedBlobAccumulator,
  ) {
    const { blobCommitments, blobsHash } = await buildBlobHints(cd.blobFields);

    const hints = CheckpointRootRollupHints.from({
      previousBlockHeader: cd.previousBlockHeader,
      previousArchiveSiblingPath: cd.previousArchiveSiblingPath,
      previousOutHash: outHashHint.treeSnapshot,
      newOutHashSiblingPath: outHashHint.siblingPath,
      startBlobAccumulator: startBlobAccumulator.toBlobAccumulator(),
      finalBlobChallenges: this.state!.finalBlobBatchingChallenges,
      blobFields: padArrayEnd(cd.blobFields, Fr.ZERO, FIELDS_PER_BLOB * BLOBS_PER_CHECKPOINT),
      blobCommitments: padArrayEnd(blobCommitments, BLS12Point.ZERO, BLOBS_PER_CHECKPOINT),
      blobsHash,
    });

    const proofDatas = blockProofs.map(p => toProofData(p));
    return proofDatas.length === 1
      ? new CheckpointRootSingleBlockRollupPrivateInputs(proofDatas[0], hints)
      : new CheckpointRootRollupPrivateInputs([proofDatas[0], proofDatas[1]], hints);
  }

  private async computeOutHashHints(checkpointData: CheckpointTopTreeData[]): Promise<OutHashHint[]> {
    const treeCalculator = await MerkleTreeCalculator.create(OUT_HASH_TREE_HEIGHT, undefined, (left, right) =>
      Promise.resolve(shaMerkleHash(left, right)),
    );

    const computeHint = async (leaves: Fr[]): Promise<OutHashHint> => {
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

    const hints: OutHashHint[] = [];
    const outHashes: Fr[] = [];
    for (const cd of checkpointData) {
      hints.push(await computeHint(outHashes));
      outHashes.push(computeCheckpointOutHash(cd.l2ToL1MsgsPerBlock));
    }
    return hints;
  }
}
