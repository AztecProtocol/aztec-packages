import type { ARCHIVE_HEIGHT } from '@aztec/constants';
import { BlockNumber, type SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import type { Tuple } from '@aztec/foundation/serialize';
import { Timer } from '@aztec/foundation/timer';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import type { EpochProverFactory } from '@aztec/prover-client';
import type {
  CheckpointSubTreeOrchestrator,
  EpochProvingContext,
  SubTreeResult,
} from '@aztec/prover-client/orchestrator';
import type { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import type { CommitteeAttestation, L2Block } from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { ForkMerkleTreeOperations } from '@aztec/stdlib/interfaces/server';
import { appendL1ToL2MessagesToTree } from '@aztec/stdlib/messaging';
import { CheckpointConstantData } from '@aztec/stdlib/rollup';
import type { BlockHeader, ProcessedTx, Tx } from '@aztec/stdlib/tx';

import type { ProverNodeJobMetrics } from '../metrics.js';

/**
 * Dependencies a `CheckpointJob` needs at construction. Bundled so the owning
 * `EpochProvingJob` can pass them through once.
 */
export type CheckpointJobDeps = {
  proverFactory: EpochProverFactory;
  epochContext: EpochProvingContext;
  publicProcessorFactory: PublicProcessorFactory;
  dbProvider: Pick<ForkMerkleTreeOperations, 'fork'>;
  proverId: EthAddress;
  metrics: ProverNodeJobMetrics;
  /** Forwarded to PublicProcessor. Re-uses the epoch-level deadline. */
  deadline: Date | undefined;
  log: Logger;
};

/** Inputs that fully describe a checkpoint at register time. */
export type CheckpointJobArgs = {
  checkpoint: Checkpoint;
  checkpointIndex: number;
  attestations: CommitteeAttestation[];
  previousBlockHeader: BlockHeader;
  l1ToL2Messages: Fr[];
  previousArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>;
};

/**
 * Self-contained per-checkpoint job, identified by `(checkpoint number, slot number)`.
 * Identity lets a stale orphan and a fresh re-org replacement coexist briefly in the
 * parent's registry without colliding.
 *
 * Lifecycle:
 *   1. Constructed from register-time data only — no orchestrator work yet.
 *   2. `provideTxs(txs)` (called once) creates the sub-tree, kicks off chonk-verifier
 *      circuits, and drives block-level processing. Returns when the per-block enqueue
 *      is done; sub-tree proving continues in the background and surfaces via
 *      `blockProofs.promise`.
 *   3. `cancel()` is idempotent. Marks the job cancelled, aborts in-flight work,
 *      rejects `blockProofs`, and kicks off a background sub-tree teardown.
 *      `whenDone()` resolves when both `provideTxs` (if in flight) and the cancel-
 *      driven teardown have unwound — the parent awaits this at job stop.
 */
export class CheckpointJob {
  readonly id: string;
  readonly checkpoint: Checkpoint;
  readonly slotNumber: SlotNumber;
  readonly checkpointIndex: number;
  readonly attestations: CommitteeAttestation[];
  readonly previousBlockHeader: BlockHeader;
  readonly l1ToL2Messages: Fr[];
  readonly previousArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>;

  /** Per-job tx map — populated by `provideTxs`. Empty until then. */
  readonly txs: Map<string, Tx> = new Map();

  /** Resolved by the sub-tree on success, rejected on cancel/failure. The top tree consumes it. */
  readonly blockProofs: PromiseWithResolvers<SubTreeResult['blockProofOutputs']> = promiseWithResolvers();

  private cancelled = false;
  private subTree?: CheckpointSubTreeOrchestrator;
  private completed = false;
  private readonly abortController = new AbortController();

  /** Tracks `provideTxs` so `cancel()` and `whenDone()` can await its unwind. */
  private provideTxsPromise?: Promise<void>;
  /** Tracks the cancel-driven teardown so `whenDone()` can await it. */
  private cancelPromise?: Promise<void>;

  constructor(
    args: CheckpointJobArgs,
    private readonly deps: CheckpointJobDeps,
  ) {
    this.checkpoint = args.checkpoint;
    this.slotNumber = args.checkpoint.header.slotNumber;
    this.checkpointIndex = args.checkpointIndex;
    this.attestations = args.attestations;
    this.previousBlockHeader = args.previousBlockHeader;
    this.l1ToL2Messages = args.l1ToL2Messages;
    this.previousArchiveSiblingPath = args.previousArchiveSiblingPath;
    this.id = CheckpointJob.idFor(args.checkpoint);
    // Mark blockProofs as observed so a cancel that lands before any consumer awaits
    // does not surface as an unhandled rejection.
    this.blockProofs.promise.catch(() => {});
    deps.log.info(`Created CheckpointJob ${this.id}`, {
      checkpointNumber: this.checkpoint.number,
      checkpointIndex: this.checkpointIndex,
      slotNumber: this.slotNumber,
      blockCount: this.checkpoint.blocks.length,
      l1ToL2MessageCount: this.l1ToL2Messages.length,
    });
  }

  /** Stable identifier: `${checkpoint number}:${slot}`. Used as the parent's map key. */
  public static idFor(checkpoint: Checkpoint): string {
    return `${checkpoint.number}:${checkpoint.header.slotNumber}`;
  }

  public isCancelled(): boolean {
    return this.cancelled;
  }

  /** True once block-level proving has been fully *enqueued* (sub-tree completion is still pending). */
  public isCompleted(): boolean {
    return this.completed;
  }

  /** AbortSignal that fires on cancel — caller wires it to its tx-gathering task. */
  public getAbortSignal(): AbortSignal {
    return this.abortController.signal;
  }

  /** Promise that resolves when all in-flight work for this job has fully unwound. */
  public async whenDone(): Promise<void> {
    if (this.provideTxsPromise) {
      await this.provideTxsPromise.catch(() => {});
    }
    if (this.cancelPromise) {
      await this.cancelPromise;
    }
  }

  /**
   * Hand transactions to the job. Triggers sub-tree creation and block-level processing.
   * Returns once the per-block enqueue is done — the sub-tree continues proving in the
   * background and resolves `blockProofs` when finished.
   *
   * No-op if the job is already cancelled. Throws if called twice.
   */
  public async provideTxs(txs: Map<string, Tx>): Promise<void> {
    if (this.cancelled) {
      this.deps.log.debug(`Ignoring provideTxs on cancelled CheckpointJob ${this.id}`, {
        checkpointNumber: this.checkpoint.number,
      });
      return;
    }
    if (this.provideTxsPromise) {
      throw new Error(`Txs already provided for checkpoint ${this.id}`);
    }
    this.deps.log.info(`Providing ${txs.size} txs to CheckpointJob ${this.id}`, {
      checkpointNumber: this.checkpoint.number,
      checkpointIndex: this.checkpointIndex,
      txCount: txs.size,
    });
    this.provideTxsPromise = this.executeCheckpoint(txs);
    await this.provideTxsPromise;
  }

  private async executeCheckpoint(txs: Map<string, Tx>): Promise<void> {
    const signal = this.abortController.signal;
    const checkpointTimer = new Timer();
    let subTreeStarted = false;

    try {
      for (const [hash, tx] of txs) {
        this.txs.set(hash, tx);
      }

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
        checkpointIndex: this.checkpointIndex,
        blockCount: this.checkpoint.blocks.length,
      });

      this.subTree = await this.deps.proverFactory.createCheckpointSubTreeOrchestrator(
        this.deps.epochContext,
        checkpointConstants,
        this.l1ToL2Messages,
        this.checkpoint.blocks.length,
        this.previousBlockHeader,
      );
      subTreeStarted = true;
      this.deps.log.verbose(`Sub-tree orchestrator created for checkpoint ${this.checkpoint.number}`, {
        checkpointNumber: this.checkpoint.number,
        checkpointIndex: this.checkpointIndex,
      });
      // Bridge the sub-tree's result onto `blockProofs`.
      void this.subTree.getSubTreeResult().then(
        result => {
          this.deps.log.info(`Sub-tree block proofs ready for checkpoint ${this.checkpoint.number}`, {
            checkpointNumber: this.checkpoint.number,
            checkpointIndex: this.checkpointIndex,
            blockProofCount: result.blockProofOutputs.length,
          });
          this.blockProofs.resolve(result.blockProofOutputs);
        },
        err => this.blockProofs.reject(err),
      );
      if (signal.aborted) {
        return;
      }

      const allTxs = this.checkpoint.blocks.flatMap(block =>
        block.body.txEffects.map(txEffect => txs.get(txEffect.txHash.toString())!),
      );
      const publicTxs = allTxs.filter(tx => tx?.data.forPublic);
      if (publicTxs.length > 0) {
        this.deps.log.verbose(
          `Kicking off ${publicTxs.length} chonk-verifier circuits for checkpoint ${this.checkpoint.number}`,
          {
            checkpointNumber: this.checkpoint.number,
            publicTxCount: publicTxs.length,
          },
        );
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

        this.deps.log.verbose(
          `Processing block ${block.number} (${blockIndex + 1}/${this.checkpoint.blocks.length}) of checkpoint ${this.checkpoint.number}`,
          {
            checkpointNumber: this.checkpoint.number,
            blockNumber: block.number,
            blockIndex,
            blockTxCount: blockTxs.length,
          },
        );

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
        this.deps.log.verbose(
          `Block ${block.number} of checkpoint ${this.checkpoint.number} processed in ${blockTimer.ms()}ms`,
          {
            checkpointNumber: this.checkpoint.number,
            blockNumber: block.number,
            blockIndex,
            durationMs: blockTimer.ms(),
          },
        );
        if (signal.aborted) {
          return;
        }
      }

      this.completed = true;
      this.deps.metrics.recordCheckpointProcessing(checkpointTimer.ms());
      this.deps.log.info(
        `Finished enqueueing block-level proving for checkpoint ${this.checkpoint.number} in ${checkpointTimer.ms()}ms`,
        {
          checkpointNumber: this.checkpoint.number,
          checkpointIndex: this.checkpointIndex,
          blockCount: this.checkpoint.blocks.length,
          durationMs: checkpointTimer.ms(),
        },
      );
    } finally {
      // If we never reached `completed`, tear down any sub-tree we did create. Either:
      //   (a) cancel landed mid-flight — its background teardown picks up where we leave off.
      //   (b) block processing threw — we owe the cleanup ourselves.
      // Field-level idempotency on `teardownSubTree` makes it safe to race with cancel.
      if (!this.completed) {
        if (subTreeStarted) {
          await this.teardownSubTree();
        }
        this.blockProofs.reject(new Error(`Checkpoint ${this.id} did not complete block processing`));
      }
    }
  }

  /**
   * Mark cancelled. Idempotent. Aborts in-flight work, rejects `blockProofs`, and
   * kicks off a background teardown of the sub-tree (if alive). The teardown promise
   * is exposed via `whenDone()`.
   *
   * `routine` distinguishes the post-finalize teardown (parent epoch already proven,
   * fires once per checkpoint at job exit) from a real abort (reorg, prune, deadline).
   * Behaviour is identical either way; the flag only adjusts log verbosity.
   */
  public cancel({ routine = false }: { routine?: boolean } = {}): void {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    if (routine) {
      this.deps.log.verbose(`Tearing down CheckpointJob ${this.id} after epoch finalized`, {
        checkpointNumber: this.checkpoint.number,
        checkpointIndex: this.checkpointIndex,
      });
    } else {
      this.deps.log.info(`Cancelling in-flight CheckpointJob ${this.id}`, {
        checkpointNumber: this.checkpoint.number,
        checkpointIndex: this.checkpointIndex,
        wasProcessing: this.provideTxsPromise !== undefined,
        wasCompleted: this.completed,
      });
    }
    this.abortController.abort();
    this.blockProofs.reject(new Error(`Checkpoint ${this.id} cancelled`));
    // Fire and forget: parent awaits the cancel-driven teardown via whenDone(); the
    // chained .catch swallows rejections so the unawaited promise doesn't surface
    // as an unhandled rejection.
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
    // If `provideTxs` is in-flight, await it — its `finally` tears down the sub-tree
    // it created. If it never ran, this awaits nothing.
    if (this.provideTxsPromise) {
      await this.provideTxsPromise.catch(() => {});
    }
    // If `provideTxs` completed before cancel, the sub-tree is still proving in the
    // background. Tear it down now. (Field-idempotent, safe if already torn down.)
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
        checkpointIndex: this.checkpointIndex,
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
    const [processedTxs, failedTxs] = await publicProcessor.process(txs, { deadline: this.deps.deadline });

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
      this.deps.log.verbose(`Inserting ${l1ToL2Messages.length} L1 to L2 messages in fork`, {
        blockNumber,
        l1ToL2Messages: l1ToL2Messages.map(m => m.toString()),
      });
      await appendL1ToL2MessagesToTree(db, l1ToL2Messages);
    }

    return db;
  }
}
