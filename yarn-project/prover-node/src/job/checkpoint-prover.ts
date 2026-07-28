import { type ARCHIVE_HEIGHT, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { BlockNumber, type EpochNumber, type SlotNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import type { Tuple } from '@aztec/foundation/serialize';
import { type DateProvider, Timer } from '@aztec/foundation/timer';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import type { EpochProverFactory } from '@aztec/prover-client';
import type { CheckpointSubTreeOrchestrator, ChonkCache, SubTreeResult } from '@aztec/prover-client/orchestrator';
import type { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import type { CommitteeAttestation, L2Block } from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { ForkMerkleTreeOperations, ITxProvider } from '@aztec/stdlib/interfaces/server';
import { CheckpointConstantData } from '@aztec/stdlib/rollup';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { BlockHeader, ProcessedTx, Tx, TxHash } from '@aztec/stdlib/tx';

import type { ProverNodeJobMetrics } from '../metrics.js';

/** Dependencies a `CheckpointProver` needs at construction. */
export type CheckpointProverDeps = {
  proverFactory: EpochProverFactory;
  /** Shared chonk-verifier cache. Survives across all sessions / epochs. */
  chonkCache: ChonkCache;
  publicProcessorFactory: PublicProcessorFactory;
  dbProvider: Pick<ForkMerkleTreeOperations, 'fork'>;
  txProvider: ITxProvider;
  /** Clock the prover-node operates against — e2e fixtures inject a cheat-controlled one. */
  dateProvider: DateProvider;
  proverId: EthAddress;
  metrics: ProverNodeJobMetrics;
  /** Tx gathering deadline. */
  txGatheringTimeoutMs: number;
  /** Public processor deadline. */
  deadline: Date | undefined;
  /**
   * Fired once when the prover's block proofs reject for a genuine (non-cancel) reason — a sub-tree
   * fault or a prune-induced fork fault. Useful for performing post mortem on failures.
   */
  onFailed?: (prover: CheckpointProver) => void;
  /**
   * Test-only hook: if set, invoked at the start of checkpoint execution instead of proving. Lets e2e
   * tests force a sub-tree failure (it should throw) to exercise the checkpoint failure/upload path.
   */
  checkpointProveOverride?: () => Promise<never>;
  log: Logger;
};

/** Test-only hooks the store injects into every `CheckpointProver` it constructs. */
export type CheckpointProverTestHooks = {
  /** If set, invoked at the start of checkpoint execution instead of proving; should throw to fail. */
  checkpointProveOverride?: () => Promise<never>;
};

/**
 * The proofs a checkpoint's sub-tree hands to the top tree: the per-block rollup proofs plus the checkpoint's parity
 * root proof (parity moved from the first block root to the checkpoint root in AZIP-22 Fast Inbox).
 */
export type CheckpointSubTreeProofs = Pick<SubTreeResult, 'blockProofOutputs' | 'parityRootProof'>;

/** Inputs that fully describe a checkpoint at register time. */
export type CheckpointProverArgs = {
  checkpoint: Checkpoint;
  /** Epoch the checkpoint belongs to (derivable from slot + L1 constants; cached at register time). */
  epochNumber: EpochNumber;
  attestations: CommitteeAttestation[];
  previousBlockHeader: BlockHeader;
  l1ToL2Messages: Fr[];
  /** Inbox rolling hash of the previous checkpoint (this checkpoint's chain start); genesis is zero. */
  previousInboxRollingHash: Fr;
  previousArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>;
};

/**
 * Self-contained per-checkpoint prover, content-addressed by
 * `(checkpoint number, slot number, checkpoint archive root)`.
 *
 * The store creates a CheckpointProver once per content-key. Keying on the checkpoint's
 * own archive root (its post-state) means two checkpoints are "the same" iff they
 * produce the same archive — so a reorg branch, or a replacement built on the same
 * predecessor but with different content, keys to a distinct prover.
 *
 * The prover eagerly starts its own tx gather and sub-tree work in the constructor, so
 * callers only need to call `whenBlockProofsReady()` to obtain the resulting block-rollup
 * proofs.
 *
 * A CheckpointProver does not survive a prune: its sub-tree work forks world-state per
 * block, and an L1 prune of a base block faults those reads. The store therefore cancels and
 * discards a prover when its checkpoint is pruned, and a re-add (even of identical content)
 * constructs a fresh prover.
 *
 * `cancel()` is idempotent. It aborts the gather + sub-tree, rejects the block-proof
 * promise, and exposes a `whenDone()` that resolves once teardown has unwound.
 */
export class CheckpointProver {
  readonly id: string;
  readonly checkpoint: Checkpoint;
  readonly epochNumber: EpochNumber;
  readonly slotNumber: SlotNumber;
  readonly attestations: CommitteeAttestation[];
  readonly previousBlockHeader: BlockHeader;
  readonly l1ToL2Messages: Fr[];
  readonly previousInboxRollingHash: Fr;
  readonly previousArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>;

  /** Resolved by the sub-tree on success, rejected on cancel/failure. Carries the block proofs plus the checkpoint's
   * parity root proof (which feeds the checkpoint root in the top tree). */
  private readonly blockProofs: PromiseWithResolvers<CheckpointSubTreeProofs> = promiseWithResolvers();

  // Three independent lifecycle facts — deliberately not collapsed into one status enum, because several
  // combinations are legal and relied on: a prover can be `completed` and then `cancelled` (routine
  // teardown of an already-proven checkpoint), or `completed` and then `failed` (block proving was
  // enqueued, but the sub-tree subsequently faulted). Only `failed` + `cancelled` is excluded — a cancel
  // is not a failure (enforced in `failBlockProofs`).
  /** Block-level proving was fully *enqueued* (a progress marker; the sub-tree may still be proving). */
  private completed = false;
  /** Block proofs rejected for a genuine (non-cancel) reason — a sub-tree or prune-induced fork fault. */
  private failed = false;
  /** The prover was torn down (prune / reap / shutdown). */
  private cancelled = false;
  private subTree?: CheckpointSubTreeOrchestrator;
  private readonly abortController = new AbortController();

  /** Tracks the eager gather+execute task so `cancel()` and `whenDone()` can await its unwind. */
  private readonly runPromise: Promise<void>;
  /** Tracks the cancel-driven teardown so `whenDone()` can await it. */
  private cancelPromise?: Promise<void>;
  /** Tracks the success-driven sub-tree teardown (once block proofs are captured) so `whenDone()` can await it. */
  private teardownPromise?: Promise<void>;

  constructor(
    args: CheckpointProverArgs,
    private readonly deps: CheckpointProverDeps,
  ) {
    this.checkpoint = args.checkpoint;
    this.epochNumber = args.epochNumber;
    this.slotNumber = args.checkpoint.header.slotNumber;
    this.attestations = args.attestations;
    this.previousBlockHeader = args.previousBlockHeader;
    this.l1ToL2Messages = args.l1ToL2Messages;
    this.previousInboxRollingHash = args.previousInboxRollingHash;
    this.previousArchiveSiblingPath = args.previousArchiveSiblingPath;
    this.id = CheckpointProver.idFor(args.checkpoint);
    // Mark blockProofs as observed so a cancel that lands before any consumer awaits
    // does not surface as an unhandled rejection.
    this.blockProofs.promise.catch(() => {});
    deps.log.info(`Created CheckpointProver ${this.id}`, {
      checkpointNumber: this.checkpoint.number,
      epochNumber: this.epochNumber,
      slotNumber: this.slotNumber,
      blockCount: this.checkpoint.blocks.length,
      l1ToL2MessageCount: this.l1ToL2Messages.length,
      archiveRoot: this.checkpoint.archive.root.toString(),
    });
    // Kick off the eager gather + sub-tree pipeline.
    this.runPromise = this.gatherAndExecute();
  }

  /**
   * Stable content-addressed identifier: `${checkpoint number}:${slot}:${archive root}`.
   * The archive root is the checkpoint's post-state, so it distinguishes any two
   * checkpoints that differ in history or content while collapsing identical re-adds.
   */
  public static idFor(checkpoint: Checkpoint): string {
    return `${checkpoint.number}:${checkpoint.header.slotNumber}:${checkpoint.archive.root.toString()}`;
  }

  public isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * True once this prover's block proofs have rejected for a genuine (non-cancel) reason — a sub-tree
   * proving fault or a prune-induced world-state fork fault. A failed prover cannot produce its block
   * proofs, so the reconciler must not build (or rebuild) an EpochSession over it; it is cleared only by
   * a prune/re-add replacing it with a fresh prover, or by expiry reaping it.
   */
  public isFailed(): boolean {
    return this.failed;
  }

  /** AbortSignal that fires on cancel — for callers that want to wire their own tasks. */
  public getAbortSignal(): AbortSignal {
    return this.abortController.signal;
  }

  /** Promise that resolves with the block-rollup proofs and parity root proof for this checkpoint (or rejects). */
  public whenBlockProofsReady(): Promise<CheckpointSubTreeProofs> {
    return this.blockProofs.promise;
  }

  /** Resolves when all in-flight work for this prover has fully unwound. */
  public async whenDone(): Promise<void> {
    await this.runPromise.catch(() => {});
    // `runPromise` resolves once block-level proving is *enqueued*, but the sub-tree's proofs (and the
    // success-driven teardown they trigger) land later, on the `getSubTreeResult()` callback. Awaiting
    // `blockProofs` here bridges that gap: on success the callback resolves `blockProofs` and then
    // synchronously sets `teardownPromise` before this await resumes, so the teardown is observable
    // below; on failure/cancel `blockProofs` rejects and teardown is driven by the `finally`/cancel
    // paths already awaited via `runPromise`/`cancelPromise`.
    await this.blockProofs.promise.catch(() => {});
    if (this.cancelPromise) {
      await this.cancelPromise;
    }
    if (this.teardownPromise) {
      await this.teardownPromise;
    }
  }

  private async gatherAndExecute(): Promise<void> {
    try {
      const txs = await this.gatherTxs();
      if (this.cancelled) {
        return;
      }
      await this.executeCheckpoint(txs);
    } catch (err) {
      if (this.cancelled) {
        this.deps.log.debug(`CheckpointProver ${this.id} cancelled during gather/execute`, {
          checkpointNumber: this.checkpoint.number,
        });
        return;
      }
      this.deps.log.error(`Error in CheckpointProver ${this.id}`, err, {
        checkpointNumber: this.checkpoint.number,
      });
      this.failBlockProofs(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Rejects the block-proof promise and, unless this is a cancellation, records the prover as failed so
   * the reconciler won't build an EpochSession over it. First rejection wins, so a later duplicate reject
   * (e.g. the executeCheckpoint `finally`) is a harmless no-op.
   */
  private failBlockProofs(err: Error): void {
    if (!this.cancelled && !this.failed) {
      this.failed = true;
      // Notify the owner so it can upload a post-mortem for this checkpoint. Fire-and-forget: the
      // callback must not block the prover's teardown, and a throw in it must not mask the rejection.
      try {
        this.deps.onFailed?.(this);
      } catch (err) {
        this.deps.log.error(`Error in CheckpointProver onFailed callback for ${this.id}`, err);
      }
    }
    this.blockProofs.reject(err);
  }

  /** Fetches every tx in this checkpoint from the tx pool (by hash, via the block tx effects). */
  private async fetchTxs(): Promise<{ txs: Map<string, Tx>; missingTxs: TxHash[] }> {
    const deadline = new Date(this.deps.dateProvider.now() + this.deps.txGatheringTimeoutMs);
    const txsByBlock = await Promise.all(
      this.checkpoint.blocks.map(block => this.deps.txProvider.getTxsForBlock(block, { deadline })),
    );
    const txs = txsByBlock.flatMap(({ txs }) => txs);
    const missingTxs = txsByBlock.flatMap(({ missingTxs }) => missingTxs);
    return { txs: new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx])), missingTxs };
  }

  private async gatherTxs(): Promise<Map<string, Tx>> {
    const { txs, missingTxs } = await this.fetchTxs();
    if (missingTxs.length > 0) {
      throw new Error(
        `Txs not found for checkpoint ${this.checkpoint.number}: ${missingTxs.map(hash => hash.toString()).join(', ')}`,
      );
    }
    return txs;
  }

  /**
   * Re-fetches this checkpoint's txs from the tx pool for a post-mortem failure upload.
   *
   * The prover does not cache txs on the heap — they are consumed during proving and dropped — so the
   * durable pool (which keeps a mined tx until L1 finality, with A-1274's retention margin covering a
   * lagging prover) is the source of truth, read back by hash here. Best-effort: any tx the pool can
   * no longer supply is logged and omitted rather than failing the upload, since a partial post-mortem
   * snapshot is still useful for diagnosis.
   */
  public async getTxsForUpload(): Promise<Map<string, Tx>> {
    const { txs, missingTxs } = await this.fetchTxs();
    if (missingTxs.length > 0) {
      this.deps.log.warn(
        `Missing ${missingTxs.length} tx(s) re-fetching checkpoint ${this.checkpoint.number} for failure upload`,
        { checkpointNumber: this.checkpoint.number, missingTxCount: missingTxs.length },
      );
    }
    return txs;
  }

  private async executeCheckpoint(txs: Map<string, Tx>): Promise<void> {
    const signal = this.abortController.signal;
    const checkpointTimer = new Timer();
    let subTreeStarted = false;

    try {
      // Test hook: force a sub-tree failure to exercise the checkpoint failure/upload path.
      if (this.deps.checkpointProveOverride) {
        await this.deps.checkpointProveOverride();
      }

      // The gathered txs are consumed locally below (public processing + sub-tree) and then dropped.
      // They are deliberately not retained on the instance: the tx pool is the durable source and
      // `getTxsForUpload` re-fetches them by hash if a post-mortem upload needs them.

      const { chainId, version } = this.checkpoint.blocks[0].header.globalVariables;
      const checkpointConstants = CheckpointConstantData.from({
        chainId,
        version,
        vkTreeRoot: getVKTreeRoot(),
        protocolContractsHash: protocolContractsHash,
        proverId: this.deps.proverId.toField(),
        slotNumber: this.checkpoint.header.slotNumber,
        coinbase: this.checkpoint.header.coinbase,
        feeRecipient: this.checkpoint.header.feeRecipient,
        gasFees: this.checkpoint.header.gasFees,
      });

      this.deps.log.info(`Starting processing checkpoint ${this.checkpoint.number}`, {
        checkpointNumber: this.checkpoint.number,
        checkpointHash: this.checkpoint.hash().toString(),
        blockCount: this.checkpoint.blocks.length,
      });

      this.subTree = await this.deps.proverFactory.createCheckpointSubTreeOrchestrator(
        this.deps.chonkCache,
        this.epochNumber,
        checkpointConstants,
        this.l1ToL2Messages,
        this.previousInboxRollingHash,
        this.checkpoint.blocks.length,
        this.previousBlockHeader,
      );
      subTreeStarted = true;
      // Bridge the sub-tree's result onto blockProofs.
      void this.subTree.getSubTreeResult().then(
        result => {
          this.deps.log.info(`Sub-tree block proofs ready for checkpoint ${this.checkpoint.number}`, {
            checkpointNumber: this.checkpoint.number,
            blockProofCount: result.blockProofOutputs.length,
          });
          // Spans processing + proving (from executeCheckpoint start, after tx gathering) to proofs ready.
          this.deps.metrics.recordCheckpointProving(checkpointTimer.ms());
          this.blockProofs.resolve({
            blockProofOutputs: result.blockProofOutputs,
            parityRootProof: result.parityRootProof,
          });
          // Release the sub-tree orchestrator now that its output is captured. The block-proof outputs
          // survive via the resolved promise; everything else the sub-tree held — per-tx AVM inputs, and
          // the base/merge/parity proof trees — is dead once proving completes, yet the prover is retained
          // for the whole proof-submission window. Dropping it here is what stops that retention from
          // accumulating across every proven checkpoint. Post-completion consumers (the top-tree job, a
          // rebuilt EpochSession, failure upload) read only `whenBlockProofsReady()` and this prover's own
          // fields (`checkpoint`, `txs`, headers, sibling paths), never the sub-tree.
          this.teardownPromise = this.teardownSubTree();
        },
        err => this.failBlockProofs(err instanceof Error ? err : new Error(String(err))),
      );
      if (signal.aborted) {
        return;
      }

      const allTxs = this.checkpoint.blocks.flatMap(block =>
        block.body.txEffects.map(txEffect => txs.get(txEffect.txHash.toString())!),
      );
      const publicTxs = allTxs.filter(tx => tx?.data.forPublic);
      if (publicTxs.length > 0) {
        await this.subTree.startChonkVerifierCircuits(publicTxs);
        if (signal.aborted) {
          return;
        }
      }

      for (let blockIndex = 0; blockIndex < this.checkpoint.blocks.length; blockIndex++) {
        const blockTimer = new Timer();
        const block = this.checkpoint.blocks[blockIndex];
        const globalVariables = block.header.globalVariables;
        const blockTxs = this.getTxsForBlock(block, txs);

        await this.subTree.startNewBlock(block.number, globalVariables.timestamp, blockTxs.length);
        if (signal.aborted) {
          return;
        }

        const db = await this.createFork(
          BlockNumber(block.number - 1),
          blockIndex === 0 ? this.l1ToL2Messages : undefined,
        );
        try {
          if (signal.aborted) {
            return;
          }
          const config = PublicSimulatorConfig.from({
            proverId: this.deps.proverId.toField(),
            skipFeeEnforcement: false,
            collectDebugLogs: false,
            collectHints: true,
            collectPublicInputs: true,
            collectStatistics: false,
          });
          const publicProcessor = this.deps.publicProcessorFactory.create(db, globalVariables, config);
          const processed = await this.processTxs(publicProcessor, blockTxs);
          if (signal.aborted) {
            return;
          }
          await this.subTree.addTxs(processed);
        } finally {
          await db.close();
        }
        if (signal.aborted) {
          return;
        }

        await this.subTree.setBlockCompleted(block.number, block.header);
        this.deps.metrics.recordBlockProcessing(blockTimer.ms());
        if (signal.aborted) {
          return;
        }
      }

      this.completed = true;
      const numTxs = this.checkpoint.blocks.reduce((acc, block) => acc + block.body.txEffects.length, 0);
      this.deps.metrics.recordCheckpointProcessing(checkpointTimer.ms(), this.checkpoint.blocks.length, numTxs);
      this.deps.log.info(
        `Finished enqueueing block-level proving for checkpoint ${this.checkpoint.number} in ${checkpointTimer.ms()}ms`,
        {
          checkpointNumber: this.checkpoint.number,
          blockCount: this.checkpoint.blocks.length,
          durationMs: checkpointTimer.ms(),
        },
      );
    } finally {
      if (!this.completed) {
        if (subTreeStarted) {
          await this.teardownSubTree();
        }
        this.failBlockProofs(new Error(`Checkpoint ${this.id} did not complete block processing`));
      }
    }
  }

  /**
   * Mark cancelled. Idempotent. Aborts in-flight work, rejects the block-proof promise,
   * and kicks off a background teardown of the sub-tree. The teardown promise is exposed
   * via `whenDone()`.
   *
   * `routine` distinguishes a post-finalize teardown (sub-tree already proven, fires
   * once at prover exit) from a real abort (reorg, prune, deadline). Behaviour is
   * identical either way; the flag only adjusts log verbosity.
   */
  public cancel({ routine = false }: { routine?: boolean } = {}): void {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    // A teardown of a completed prover is routine regardless of the caller's flag —
    // we logged the work as done already, so don't relabel it as a mid-flight cancel.
    if (routine || this.completed) {
      this.deps.log.verbose(`Tearing down CheckpointProver ${this.id}`, {
        checkpointNumber: this.checkpoint.number,
        wasCompleted: this.completed,
      });
    } else {
      this.deps.log.info(`Cancelling in-flight CheckpointProver ${this.id}`, {
        checkpointNumber: this.checkpoint.number,
        wasCompleted: this.completed,
      });
    }
    this.abortController.abort();
    this.blockProofs.reject(new Error(`Checkpoint ${this.id} cancelled`));
    this.cancelPromise = this.runCancel().catch(() => {});
  }

  private async runCancel(): Promise<void> {
    if (this.subTree) {
      try {
        this.subTree.cancel();
      } catch (err) {
        this.deps.log.error('Error cancelling sub-tree', err);
      }
    }
    await this.runPromise.catch(() => {});
    if (this.subTree) {
      await this.teardownSubTree();
    }
  }

  private async teardownSubTree(): Promise<void> {
    const { subTree } = this;
    this.subTree = undefined;
    if (subTree) {
      this.deps.log.debug(`Tearing down sub-tree for checkpoint ${this.checkpoint.number}`, {
        checkpointNumber: this.checkpoint.number,
      });
      try {
        await subTree.stop();
      } catch (err) {
        this.deps.log.error('Error stopping sub-tree', err);
      }
    }
  }

  private getTxsForBlock(block: L2Block, txs: Map<string, Tx>): Tx[] {
    return block.body.txEffects.map(txEffect => txs.get(txEffect.txHash.toString())!);
  }

  private async processTxs(publicProcessor: PublicProcessor, txs: Tx[]): Promise<ProcessedTx[]> {
    // Pass the abort signal so a prune-driven cancel stops the current block's public execution
    // immediately, rather than running it to completion before the next `signal.aborted` check.
    // On abort `process` returns a partial result, the length check below throws, and
    // `gatherAndExecute` swallows it via its `cancelled` guard.
    const [processedTxs, failedTxs] = await publicProcessor.process(txs, {
      deadline: this.deps.deadline,
      signal: this.abortController.signal,
    });

    if (failedTxs.length) {
      const failedTxHashes = await Promise.all(failedTxs.map(({ tx }) => tx.getTxHash()));
      throw new Error(
        `Txs failed processing: ${failedTxs
          .map(({ error }, index) => `${failedTxHashes[index]} (${error})`)
          .join(', ')}`,
      );
    }

    if (processedTxs.length !== txs.length) {
      throw new Error(`Failed to process all txs: processed ${processedTxs.length} out of ${txs.length}`);
    }

    return processedTxs;
  }

  private async createFork(blockNumber: BlockNumber, l1ToL2Messages: Fr[] | undefined) {
    const db = await this.deps.dbProvider.fork(blockNumber);

    if (l1ToL2Messages !== undefined) {
      const l1ToL2MessagesPadded = padArrayEnd<Fr, number>(
        l1ToL2Messages,
        Fr.ZERO,
        NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
        'Too many L1 to L2 messages',
      );
      await db.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2MessagesPadded);
    }

    return db;
  }
}
