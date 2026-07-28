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
import type { SerialQueue } from '@aztec/foundation/queue';
import type { Tuple } from '@aztec/foundation/serialize';
import { MerkleTreeCalculator, type TreeNodeLocation, shaMerkleHash } from '@aztec/foundation/trees';
import type { EthAddress } from '@aztec/stdlib/block';
import type { PublicInputsAndRecursiveProof, ServerCircuitProver } from '@aztec/stdlib/interfaces/server';
import { computeCheckpointOutHash } from '@aztec/stdlib/messaging';
import type { ParityPublicInputs } from '@aztec/stdlib/parity';
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
import type { CheckpointSubTreeProofs } from './checkpoint-sub-tree-orchestrator.js';
import { ProvingScheduler } from './proving-scheduler.js';
import { TopTreeProvingState } from './top-tree-proving-state.js';

/** Per-checkpoint data fed into the top tree. */
export type CheckpointTopTreeData = {
  /**
   * The checkpoint sub-tree's proofs. Passed as a Promise so the top tree can start (compute hints, pipeline merges)
   * while sub-trees are still proving. `blockProofOutputs` resolves to 1 entry for a single-block checkpoint, 2 for
   * multi-block; `inboxParityProof` feeds the checkpoint root rollup (parity moved there from the first block root in
   * AZIP-22 Fast Inbox).
   */
  subTreeProofs: Promise<CheckpointSubTreeProofs>;
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
 * and each checkpoint's root rollup fires the moment its sub-tree's `subTreeProofs`
 * promise resolves. Later checkpoints can still be block-level proving in parallel.
 */
export class TopTreeOrchestrator extends ProvingScheduler {
  private state: TopTreeProvingState | undefined;
  private cancelled = false;

  constructor(
    protected readonly prover: ServerCircuitProver,
    private readonly proverId: EthAddress,
    deferredJobQueue: SerialQueue,
    _telemetryClient: TelemetryClient = getTelemetryClient(),
    bindings?: LoggerBindings,
  ) {
    super(deferredJobQueue, 'prover-client:top-tree-orchestrator', bindings);
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
    // The completion promise is awaited below. Attach a no-op catch here as well so any
    // spurious unhandled-rejection detection during cancellation (where reject() can fire
    // synchronously before the await microtask installs a handler) is silenced.
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
      void cd.subTreeProofs.then(
        subTreeProofs => {
          if (this.cancelled || !this.state?.verifyState()) {
            return;
          }
          this.enqueueCheckpointRoot(
            this.state,
            checkpointIndex,
            subTreeProofs.blockProofOutputs,
            subTreeProofs.inboxParityProof,
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

    // The error type is stamped atomically at rejection time by the rejectionCallback above
    // (TopTreeCancelledError iff cancel() drove the rejection). Re-deriving it here from the
    // live `cancelled` flag would mask a genuine failure that lost a race with a late cancel
    // (A-1035), so let the original error propagate untouched.
    await completionPromise;
    await this.state.finalizeBatchedBlob();
    return this.state.getEpochProofResult();
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

  private enqueueCheckpointRoot(
    state: TopTreeProvingState,
    checkpointIndex: number,
    blockProofOutputs: PublicInputsAndRecursiveProof<
      BlockRollupPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >[],
    inboxParityProof: PublicInputsAndRecursiveProof<ParityPublicInputs>,
    cd: CheckpointTopTreeData,
    outHashHint: OutHashHint,
    startBlobAccumulator: BatchedBlobAccumulator,
  ) {
    void this.buildCheckpointRootInputs(
      blockProofOutputs,
      inboxParityProof,
      cd,
      outHashHint,
      startBlobAccumulator,
    ).then(
      inputs => {
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
      },
      // Without this, an input-building failure rejects a discarded promise, state.reject() is
      // never called, and prove() hangs forever on its completion promise (A-1036).
      err => {
        if (this.cancelled) {
          return;
        }
        state.reject(`Building checkpoint root inputs for checkpoint ${checkpointIndex} failed: ${err}`);
      },
    );
  }

  private async buildCheckpointRootInputs(
    blockProofOutputs: PublicInputsAndRecursiveProof<
      BlockRollupPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >[],
    inboxParityProof: PublicInputsAndRecursiveProof<ParityPublicInputs>,
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

    const inboxParity = toProofData(inboxParityProof);
    const proofDatas = blockProofOutputs.map(p => toProofData(p));
    return proofDatas.length === 1
      ? new CheckpointRootSingleBlockRollupPrivateInputs(proofDatas[0], inboxParity, hints)
      : new CheckpointRootRollupPrivateInputs([proofDatas[0], proofDatas[1]], inboxParity, hints);
  }

  // --- internal: top-tree proof orchestration (formerly TopTreeProvingScheduler) ---

  private enqueueCheckpointMergeRollup(state: TopTreeProvingState, location: TreeNodeLocation) {
    if (!state.verifyState() || !state.tryStartProvingCheckpointMerge(location)) {
      return;
    }
    const inputs = state.getCheckpointMergeRollupInputs(location);
    this.deferredProving(
      state,
      signal => this.prover.getCheckpointMergeRollupProof(inputs, signal, state.epochNumber),
      result => {
        state.setCheckpointMergeRollupProof(location, result);
        this.checkAndEnqueueNextCheckpointMergeRollup(state, location);
      },
    );
  }

  private enqueueEpochPadding(state: TopTreeProvingState) {
    if (!state.verifyState() || !state.tryStartProvingPaddingCheckpoint()) {
      return;
    }
    const inputs = state.getPaddingCheckpointInputs();
    this.deferredProving(
      state,
      signal => this.prover.getCheckpointPaddingRollupProof(inputs, signal, state.epochNumber),
      result => {
        state.setCheckpointPaddingProof(result);
        this.checkAndEnqueueRootRollup(state);
      },
    );
  }

  private enqueueRootRollup(state: TopTreeProvingState) {
    if (!state.verifyState() || !state.tryStartProvingRootRollup()) {
      return;
    }
    const inputs = state.getRootRollupInputs();
    this.deferredProving(
      state,
      signal => this.prover.getRootRollupProof(inputs, signal, state.epochNumber),
      result => {
        this.logger.verbose(`Completed root rollup for epoch ${state.epochNumber}`);
        state.setRootRollupProof(result);
        state.resolve();
      },
    );
  }

  private checkAndEnqueueNextCheckpointMergeRollup(state: TopTreeProvingState, currentLocation: TreeNodeLocation) {
    if (!state.isReadyForCheckpointMerge(currentLocation)) {
      return;
    }
    const parentLocation = state.getParentLocation(currentLocation);
    if (parentLocation.level === 0) {
      this.checkAndEnqueueRootRollup(state);
    } else {
      this.enqueueCheckpointMergeRollup(state, parentLocation);
    }
  }

  private checkAndEnqueueRootRollup(state: TopTreeProvingState) {
    if (!state.isReadyForRootRollup()) {
      return;
    }
    this.enqueueRootRollup(state);
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
