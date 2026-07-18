import type { SpongeBlob } from '@aztec/blob-lib/types';
import {
  type ARCHIVE_HEIGHT,
  L1_TO_L2_MSG_SUBTREE_HEIGHT,
  L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
} from '@aztec/constants';
import { BlockNumber, type EpochNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AbortError } from '@aztec/foundation/error';
import type { LoggerBindings } from '@aztec/foundation/log';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import type { SerialQueue } from '@aztec/foundation/queue';
import { type Tuple, assertLength } from '@aztec/foundation/serialize';
import type { TreeNodeLocation } from '@aztec/foundation/trees';
import { EthAddress } from '@aztec/stdlib/block';
import type {
  ForkMerkleTreeOperations,
  MerkleTreeWriteOperations,
  PublicInputsAndRecursiveProof,
  ReadonlyWorldStateAccess,
  ServerCircuitProver,
} from '@aztec/stdlib/interfaces/server';
import { L1ToL2MessageSponge, appendL1ToL2MessagesToTree } from '@aztec/stdlib/messaging';
import type { ParityPublicInputs } from '@aztec/stdlib/parity';
import {
  type BaseRollupHints,
  type BlockRollupPublicInputs,
  CheckpointConstantData,
  PrivateTxBaseRollupPrivateInputs,
  type PublicChonkVerifierPublicInputs,
} from '@aztec/stdlib/rollup';
import type { CircuitName } from '@aztec/stdlib/stats';
import { type AppendOnlyTreeSnapshot, MerkleTreeId } from '@aztec/stdlib/trees';
import type { BlockHeader, ProcessedTx, Tx } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';
import {
  Attributes,
  type TelemetryClient,
  type Tracer,
  getTelemetryClient,
  trackSpan,
  wrapCallbackInSpan,
} from '@aztec/telemetry-client';

import { inspect } from 'util';

import {
  buildHeaderFromCircuitOutputs,
  getLastSiblingPath,
  getPublicChonkVerifierPrivateInputsFromTx,
  getRootTreeSiblingPath,
  getSubtreeSiblingPath,
  getTreeSnapshot,
  insertSideEffectsAndBuildBaseRollupHints,
  validatePartialState,
  validateTx,
} from './block-building-helpers.js';
import type { BlockProvingState } from './block-proving-state.js';
import { CheckpointProvingState } from './checkpoint-proving-state.js';
import type { ChonkCache } from './chonk-cache.js';
import { ProvingOrchestratorMetrics } from './orchestrator_metrics.js';
import { ProvingScheduler } from './proving-scheduler.js';
import { TxProvingState } from './tx-proving-state.js';

/**
 * Result of proving a single checkpoint's block-level sub-tree.
 *
 * Contains the final block-rollup proof outputs that feed the checkpoint root rollup,
 * plus the archive sibling path captured before any block in the checkpoint landed
 * (the top-tree needs this to assemble the checkpoint root rollup hints).
 */
export type SubTreeResult = {
  blockProofOutputs: PublicInputsAndRecursiveProof<
    BlockRollupPublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >[];
  /**
   * The checkpoint's single InboxParity proof. Parity gates the checkpoint root rather than the first block root, so
   * the sub-tree proves it and hands it to the top tree, which feeds it into the checkpoint root rollup.
   */
  inboxParityProof: PublicInputsAndRecursiveProof<ParityPublicInputs>;
  previousArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>;
};

/**
 * The proofs a checkpoint's sub-tree hands to the top tree: the per-block rollup proofs plus the checkpoint's single
 * variable-size InboxParity proof.
 */
export type CheckpointSubTreeProofs = Pick<SubTreeResult, 'blockProofOutputs' | 'inboxParityProof'>;

type TreeSnapshots = Map<MerkleTreeId, AppendOnlyTreeSnapshot>;

/**
 * Base rollup hints as produced before proving: `PrivateBaseRollupHints` / `PublicBaseRollupHints`
 * deliberately carry no recursive proof or verification key. The proof + VK are supplied later, when
 * `TxProvingState.getBaseRollupTypeAndInputs` wraps these hints into the "with proof + VK" types —
 * `PrivateTxBaseRollupPrivateInputs` (a `ChonkProofData`) or `PublicTxBaseRollupPrivateInputs` (a
 * chonk-verifier proof + AVM proof). Those proofs are *required constructor arguments* of the wrapper
 * types, so the only way to obtain a provable input is to populate them — they cannot be silently
 * omitted. Naming the proof-less hints type here makes that boundary explicit at `prepareBaseRollupInputs`.
 */
type BaseRollupHintsWithoutProofAndVK = BaseRollupHints;

/**
 * Orchestrates block-level proving for a single checkpoint, stopping at the boundary
 * where checkpoint root rollup would otherwise begin. Used by the per-checkpoint
 * `CheckpointProver` in production; the top-tree orchestrator then composes the
 * sub-tree's block proofs into the epoch proof.
 *
 * Wiring: a single-checkpoint mini-proving session is owned by the constructor. The
 * canonical way to obtain a fully-started sub-tree is the `start` static factory,
 * which also drives the single internal `startCheckpoint` call. The sub-tree never
 * escalates past the checkpoint root boundary; `getSubTreeResult()` resolves once
 * every block-level proof in the checkpoint's tree is ready.
 */
export class CheckpointSubTreeOrchestrator extends ProvingScheduler {
  /** The single checkpoint proving state this sub-tree owns. Allocated in the `start` factory. */
  protected provingState: CheckpointProvingState | undefined = undefined;
  private readonly subTreeResult: PromiseWithResolvers<SubTreeResult>;
  private readonly metrics: ProvingOrchestratorMetrics;
  private dbs: Map<BlockNumber, MerkleTreeWriteOperations> = new Map();

  constructor(
    private readonly dbProvider: ReadonlyWorldStateAccess & ForkMerkleTreeOperations,
    protected readonly prover: ServerCircuitProver,
    private readonly proverId: EthAddress,
    /**
     * Shared chonk-verifier proof cache. Every chonk-verifier proof started by this
     * sub-tree lives on the cache and survives the sub-tree's cancellation, so a tx
     * whose original checkpoint is reorged out and re-appears in a replacement
     * checkpoint reuses the cached proof.
     */
    private readonly chonkCache: ChonkCache,
    /** The epoch this sub-tree proves into. */
    private readonly epochNumber: EpochNumber,
    private readonly cancelJobsOnStop: boolean = false,
    deferredJobQueue: SerialQueue,
    telemetryClient: TelemetryClient = getTelemetryClient(),
    bindings?: LoggerBindings,
  ) {
    super(deferredJobQueue, 'prover-client:checkpoint-sub-tree-orchestrator', bindings);
    this.metrics = new ProvingOrchestratorMetrics(telemetryClient, 'CheckpointSubTreeOrchestrator');

    this.subTreeResult = promiseWithResolvers<SubTreeResult>();
    // Mark the rejection branch as observed so a `cancel()` or proving failure does not
    // surface an unhandled rejection when no consumer awaits getSubTreeResult().
    this.subTreeResult.promise.catch(() => {});
  }

  /** Tracks whether `cancel()` has been called; flows into the checkpoint state's isAlive hook. */
  private cancelled = false;

  public get tracer(): Tracer {
    return this.metrics.tracer;
  }

  public getProverId(): EthAddress {
    return this.proverId;
  }

  public getNumActiveForks(): number {
    return this.dbs.size;
  }

  /** Returns a promise that resolves when block-level proving completes for the checkpoint. */
  public getSubTreeResult(): Promise<SubTreeResult> {
    return this.subTreeResult.promise;
  }

  /**
   * Returns the archive sibling path captured at the internal checkpoint start.
   * Available synchronously once `start` has resolved, before block-level proving
   * completes. The top-tree consumer uses this to assemble checkpoint root rollup hints
   * up-front so checkpoint root proofs can pipeline against in-flight sub-tree proving.
   */
  public getPreviousArchiveSiblingPath(): Tuple<Fr, typeof ARCHIVE_HEIGHT> {
    if (!this.provingState) {
      throw new Error('Checkpoint not started; call CheckpointSubTreeOrchestrator.start first.');
    }
    return this.provingState.getLastArchiveSiblingPath();
  }

  /**
   * Constructs and starts a sub-tree for a single checkpoint. The returned sub-tree
   * has had its single internal checkpoint state allocated; callers proceed directly
   * to per-block `startNewBlock` / `addTxs` / `setBlockCompleted`.
   *
   * If the internal start rejects, the partially-constructed sub-tree is stopped
   * before the error propagates, so no broker resources leak.
   */
  public static async start(
    dbProvider: ReadonlyWorldStateAccess & ForkMerkleTreeOperations,
    prover: ServerCircuitProver,
    proverId: EthAddress,
    chonkCache: ChonkCache,
    epochNumber: EpochNumber,
    cancelJobsOnStop: boolean,
    deferredJobQueue: SerialQueue,
    checkpointConstants: CheckpointConstantData,
    l1ToL2Messages: Fr[],
    startInboxRollingHash: Fr,
    totalNumBlocks: number,
    headerOfLastBlockInPreviousCheckpoint: BlockHeader,
    telemetryClient: TelemetryClient = getTelemetryClient(),
    bindings?: LoggerBindings,
  ): Promise<CheckpointSubTreeOrchestrator> {
    const subTree = new CheckpointSubTreeOrchestrator(
      dbProvider,
      prover,
      proverId,
      chonkCache,
      epochNumber,
      cancelJobsOnStop,
      deferredJobQueue,
      telemetryClient,
      bindings,
    );
    try {
      await subTree.startCheckpoint(
        checkpointConstants,
        l1ToL2Messages,
        startInboxRollingHash,
        totalNumBlocks,
        headerOfLastBlockInPreviousCheckpoint,
      );
      return subTree;
    } catch (err) {
      await subTree.stop().catch(() => {});
      throw err;
    }
  }

  /**
   * Kickstart chonk-verifier circuits via the shared `ChonkCache`. The cache owns the
   * broker job lifecycle, so the proof survives this sub-tree's `cancel()` — a tx that
   * ends up in a replacement checkpoint after a reorg can pick the cached promise up
   * and skip re-proving.
   */
  public startChonkVerifierCircuits(txs: Tx[]): Promise<void> {
    if (!this.provingState?.verifyState()) {
      return Promise.reject(new Error('Sub-tree proving state is not active.'));
    }
    const publicTxs = txs.filter(tx => tx.data.forPublic);
    for (const tx of publicTxs) {
      const txHash = tx.getTxHash().toString();
      const inputs = getPublicChonkVerifierPrivateInputsFromTx(tx, this.getProverId().toField());
      // Fire and forget — getOrEnqueueChonkVerifier later picks up the cached promise
      // when the tx is processed inside its block.
      void this.chonkCache.getOrCompute(txHash, signal =>
        this.prover.getPublicChonkVerifierProof(inputs, signal, this.epochNumber),
      );
    }
    return Promise.resolve();
  }

  // ---------------- per-block driving (called by the per-checkpoint CheckpointProver) ----------------

  /**
   * Starts off a new block.
   * @param blockNumber - The block number
   * @param timestamp - The timestamp of the block. Required for empty blocks to construct private inputs.
   * @param totalNumTxs - The total number of txs in the block.
   */
  @trackSpan('CheckpointSubTreeOrchestrator.startNewBlock', blockNumber => ({
    [Attributes.BLOCK_NUMBER]: blockNumber,
  }))
  public async startNewBlock(blockNumber: BlockNumber, timestamp: UInt64, totalNumTxs: number) {
    if (!this.provingState) {
      throw new Error('Empty proving state. The checkpoint sub-tree has not been started.');
    }

    if (!this.provingState.isAcceptingBlocks()) {
      throw new Error(`Checkpoint not accepting further blocks.`);
    }

    const constants = this.provingState.constants;
    this.logger.info(`Starting block ${blockNumber} for slot ${constants.slotNumber}.`);

    // Fork the db only when it's not already set. The db for the first block is set in startCheckpoint.
    if (!this.dbs.has(blockNumber)) {
      // Fork world state at the end of the immediately previous block.
      const db = await this.dbProvider.fork(BlockNumber(blockNumber - 1));
      this.dbs.set(blockNumber, db);
    }
    const db = this.getDbForBlock(blockNumber);

    // Get archive snapshot and sibling path before any txs in this block lands.
    const lastArchiveTreeSnapshot = await getTreeSnapshot(MerkleTreeId.ARCHIVE, db);
    const lastArchiveSiblingPath = await getRootTreeSiblingPath(MerkleTreeId.ARCHIVE, db);

    const blockProvingState = this.provingState.startNewBlock(
      blockNumber,
      timestamp,
      totalNumTxs,
      lastArchiveTreeSnapshot,
      lastArchiveSiblingPath,
    );

    // Because `addTxs` won't be called for a block without txs, and that's where the sponge blob state is computed,
    // set its end sponge blob here. This becomes the start sponge blob for the next block.
    if (totalNumTxs === 0) {
      const endState = await db.getStateReference();
      blockProvingState.setEndState(endState);

      const endSpongeBlob = blockProvingState.getStartSpongeBlob().clone();
      const blockEndBlobFields = blockProvingState.getBlockEndBlobFields();
      await endSpongeBlob.absorb(blockEndBlobFields);
      blockProvingState.setEndSpongeBlob(endSpongeBlob);

      // A block with no txs has no base or merge proof whose completion would enqueue its block root,
      // and parity now gates the checkpoint root rather than the first block root, so no other callback
      // fires it. Enqueue it here. Only a first block may be empty (the block proving state rejects
      // any other), so this always drives the empty-tx first block root.
      this.checkAndEnqueueBlockRootRollup(blockProvingState);
    }
  }

  /**
   * The interface to add simulated transactions to the scheduler. Called at most once per block.
   * @param txs - The transactions to be proven
   */
  @trackSpan('CheckpointSubTreeOrchestrator.addTxs', txs => ({
    [Attributes.BLOCK_TXS_COUNT]: txs.length,
  }))
  public async addTxs(txs: ProcessedTx[]): Promise<void> {
    if (!this.provingState) {
      throw new Error(`Empty proving state. The checkpoint sub-tree has not been started.`);
    }

    if (!txs.length) {
      // Empty block: setBlockCompleted handles this without addTxs being called. Bail to
      // avoid the throw below (we cannot find the blockNumber without any txs).
      this.logger.verbose(`Provided no txs to addTxs.`);
      return;
    }

    const blockNumber = BlockNumber(txs[0].globalVariables.blockNumber);
    const provingState = this.provingState.getBlockProvingStateByBlockNumber(blockNumber!);
    if (!provingState) {
      throw new Error(`Proving state for block ${blockNumber} not found. Call startNewBlock first.`);
    }

    if (provingState.totalNumTxs !== txs.length) {
      throw new Error(
        `Block ${blockNumber} should be filled with ${provingState.totalNumTxs} txs. Received ${txs.length} txs.`,
      );
    }

    if (!provingState.isAcceptingTxs()) {
      throw new Error(`Block ${blockNumber} has been initialized with transactions.`);
    }

    this.logger.info(`Adding ${txs.length} transactions to block ${blockNumber}`);

    const db = this.getDbForBlock(blockNumber);
    const lastArchive = provingState.lastArchiveTreeSnapshot;
    const newL1ToL2MessageTreeSnapshot = provingState.newL1ToL2MessageTreeSnapshot;
    const spongeBlobState = provingState.getStartSpongeBlob().clone();

    for (const tx of txs) {
      try {
        if (!provingState.verifyState()) {
          throw new Error(`Invalid proving state when adding a tx`);
        }

        validateTx(tx);

        this.logger.debug(`Received transaction: ${tx.hash}`);

        const startSpongeBlob = spongeBlobState.clone();
        const [hints, treeSnapshots] = await this.prepareBaseRollupInputs(
          tx,
          lastArchive,
          newL1ToL2MessageTreeSnapshot,
          startSpongeBlob,
          db,
        );

        if (!provingState.verifyState()) {
          throw new Error(`Unable to add transaction, preparing base inputs failed`);
        }

        await spongeBlobState.absorb(tx.txEffect.toBlobFields());

        const txProvingState = new TxProvingState(tx, hints, treeSnapshots, this.proverId.toField());
        const txIndex = provingState.addNewTx(txProvingState);
        if (txProvingState.requireAvmProof) {
          this.getOrEnqueueChonkVerifier(provingState, txIndex);
          this.logger.debug(`Enqueueing public VM for tx ${txIndex}`);
          this.enqueueVM(provingState, txIndex);
        } else {
          this.logger.debug(`Enqueueing base rollup for private-only tx ${txIndex}`);
          this.enqueueBaseRollup(provingState, txIndex);
        }
      } catch (err: any) {
        throw new Error(`Error adding transaction ${tx.hash.toString()} to block ${blockNumber}: ${err.message}`, {
          cause: err,
        });
      }
    }

    const endState = await db.getStateReference();
    provingState.setEndState(endState);

    const blockEndBlobFields = provingState.getBlockEndBlobFields();
    await spongeBlobState.absorb(blockEndBlobFields);

    provingState.setEndSpongeBlob(spongeBlobState);
  }

  /**
   * Marks the block as completed.
   * Computes the block header and updates the archive tree.
   */
  @trackSpan('CheckpointSubTreeOrchestrator.setBlockCompleted', (blockNumber: BlockNumber) => ({
    [Attributes.BLOCK_NUMBER]: blockNumber,
  }))
  public async setBlockCompleted(blockNumber: BlockNumber, expectedHeader?: BlockHeader): Promise<BlockHeader> {
    const provingState = this.provingState?.getBlockProvingStateByBlockNumber(blockNumber);
    if (!provingState) {
      throw new Error(`Block proving state for ${blockNumber} not found`);
    }

    // Abort with specific error for the block if there's one.
    const error = provingState.getError();
    if (error) {
      throw new Error(`Block proving failed: ${error}`);
    }

    // Abort if the proving state is not valid due to errors occurred elsewhere.
    if (!provingState.verifyState()) {
      throw new Error(`Invalid proving state when completing block ${blockNumber}.`);
    }

    if (provingState.isAcceptingTxs()) {
      throw new Error(
        `Block ${blockNumber} is still accepting txs. Call setBlockCompleted after all txs have been added.`,
      );
    }

    // Given we've applied every change from this block, now assemble the block header:
    this.logger.verbose(`Block ${blockNumber} completed. Assembling header.`);
    const header = await provingState.buildBlockHeader();

    if (expectedHeader && !header.equals(expectedHeader)) {
      this.logger.error(`Block header mismatch: header=${header} expectedHeader=${expectedHeader}`);
      throw new Error('Block header mismatch');
    }

    // Get db for this block and remove from map — no other code should use it after this point.
    const db = this.getDbForBlock(provingState.blockNumber);
    this.dbs.delete(provingState.blockNumber);

    // Update the archive tree, capture the snapshot, and close the fork deterministically.
    try {
      this.logger.verbose(
        `Updating archive tree with block ${provingState.blockNumber} header ${(await header.hash()).toString()}`,
      );
      await db.updateArchive(header);
      provingState.setBuiltArchive(await getTreeSnapshot(MerkleTreeId.ARCHIVE, db));
    } finally {
      await db.close();
    }

    await this.verifyBuiltBlockAgainstSyncedState(provingState);

    return header;
  }

  // ---------------- lifecycle ----------------

  /**
   * Cancels any further proving. If `cancelJobsOnStop` was set, aborts all pending broker jobs
   * (used on reorg). Otherwise jobs remain in the broker queue and can be reused on restart.
   */
  public cancel() {
    this.cancelled = true;
    this.resetSchedulerState(this.cancelJobsOnStop);
    // Reject the proving state (and hence subTreeResult) so anyone awaiting the sub-tree result
    // is released rather than hanging — matching TopTreeOrchestrator.cancel().
    this.provingState?.cancel();

    for (const [blockNumber, db] of this.dbs.entries()) {
      void db.close().catch(err => this.logger.error(`Error closing db for block ${blockNumber}`, err));
    }
    this.dbs.clear();
  }

  protected override cancelInternal(): void {
    this.cancel();
  }

  // ---------------- private: per-checkpoint init ----------------

  /**
   * Internal driver for the single-checkpoint init. Allocates the world-state fork,
   * inserts L1-to-L2 messages, and creates the per-checkpoint proving state with this
   * sub-tree as its parent. Only called once, from the `start` factory.
   */
  private async startCheckpoint(
    constants: CheckpointConstantData,
    l1ToL2Messages: Fr[],
    startInboxRollingHash: Fr,
    totalNumBlocks: number,
    headerOfLastBlockInPreviousCheckpoint: BlockHeader,
  ): Promise<void> {
    if (this.provingState) {
      throw new Error('Checkpoint sub-tree already started.');
    }

    // Fork world state at the end of the immediately previous block.
    const lastBlockNumber = headerOfLastBlockInPreviousCheckpoint.globalVariables.blockNumber;
    const db = await this.dbProvider.fork(lastBlockNumber);

    const firstBlockNumber = BlockNumber(lastBlockNumber + 1);
    this.dbs.set(firstBlockNumber, db);

    // Get archive sibling path before any block in this checkpoint lands.
    const lastArchiveSiblingPath = await getLastSiblingPath(MerkleTreeId.ARCHIVE, db);

    // Insert all the l1 to l2 messages into the db. Get the states before and after the insertion.
    const {
      lastL1ToL2MessageTreeSnapshot,
      lastL1ToL2MessageSubtreeRootSiblingPath,
      newL1ToL2MessageTreeSnapshot,
      newL1ToL2MessageSubtreeRootSiblingPath,
    } = await this.updateL1ToL2MessageTree(l1ToL2Messages, db);

    // The message sponge absorbs the checkpoint's real messages (real-count), matching the checkpoint's single
    // InboxParity proof; non-first block roots inherit this sponge (AZIP-22 Fast Inbox).
    const checkpointMsgSponge = L1ToL2MessageSponge.empty();
    await checkpointMsgSponge.absorb(l1ToL2Messages);

    this.provingState = new CheckpointProvingState(
      /* index */ 0,
      constants,
      totalNumBlocks,
      headerOfLastBlockInPreviousCheckpoint,
      lastArchiveSiblingPath,
      l1ToL2Messages,
      startInboxRollingHash,
      lastL1ToL2MessageTreeSnapshot,
      lastL1ToL2MessageSubtreeRootSiblingPath,
      newL1ToL2MessageTreeSnapshot,
      newL1ToL2MessageSubtreeRootSiblingPath,
      checkpointMsgSponge,
      Number(this.epochNumber),
      /* isAlive */ () => !this.cancelled,
      /* onReject */ reason => this.subTreeResult.reject(new Error(reason)),
    );

    // Parity now gates the checkpoint root (not the first block root); prove the single sized InboxParity per
    // checkpoint up front.
    this.enqueueInboxParityCircuit(this.provingState);
  }

  // ---------------- private: per-block proof orchestration ----------------

  private async updateL1ToL2MessageTree(l1ToL2Messages: Fr[], db: MerkleTreeWriteOperations) {
    const lastL1ToL2MessageTreeSnapshot = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, db);
    const lastL1ToL2MessageSubtreeRootSiblingPath = assertLength(
      await getSubtreeSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, L1_TO_L2_MSG_SUBTREE_HEIGHT, db),
      L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
    );

    // Update the local trees to include the new l1 to l2 messages.
    await appendL1ToL2MessagesToTree(db, l1ToL2Messages);

    const newL1ToL2MessageTreeSnapshot = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, db);
    const newL1ToL2MessageSubtreeRootSiblingPath = assertLength(
      await getSubtreeSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, L1_TO_L2_MSG_SUBTREE_HEIGHT, db),
      L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
    );

    return {
      lastL1ToL2MessageTreeSnapshot,
      lastL1ToL2MessageSubtreeRootSiblingPath,
      newL1ToL2MessageTreeSnapshot,
      newL1ToL2MessageSubtreeRootSiblingPath,
    };
  }

  // Updates the merkle trees for a transaction. The first enqueued job for a transaction.
  @trackSpan('CheckpointSubTreeOrchestrator.prepareBaseRollupInputs', tx => ({
    [Attributes.TX_HASH]: tx.hash.toString(),
  }))
  private async prepareBaseRollupInputs(
    tx: ProcessedTx,
    lastArchive: AppendOnlyTreeSnapshot,
    newL1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot,
    startSpongeBlob: SpongeBlob,
    db: MerkleTreeWriteOperations,
  ): Promise<[BaseRollupHintsWithoutProofAndVK, TreeSnapshots]> {
    // These hints deliberately carry no recursive proof or verification key — see
    // BaseRollupHintsWithoutProofAndVK. The tx's proof + VK are attached later in
    // TxProvingState.getBaseRollupTypeAndInputs from the proven chonk-verifier / kernel / AVM
    // proofs, which are required there and so cannot be silently omitted.
    const start = performance.now();
    const hints = await insertSideEffectsAndBuildBaseRollupHints(
      tx,
      lastArchive,
      newL1ToL2MessageTreeSnapshot,
      startSpongeBlob,
      this.proverId.toField(),
      db,
    );
    this.metrics.recordBaseRollupInputs(performance.now() - start);

    const promises = [MerkleTreeId.NOTE_HASH_TREE, MerkleTreeId.NULLIFIER_TREE, MerkleTreeId.PUBLIC_DATA_TREE].map(
      async (id: MerkleTreeId) => {
        return { key: id, value: await getTreeSnapshot(id, db) };
      },
    );
    const treeSnapshots: TreeSnapshots = new Map((await Promise.all(promises)).map(obj => [obj.key, obj.value]));

    return [hints, treeSnapshots];
  }

  // Executes the base rollup circuit and stores the output as intermediate state for the parent merge/root circuit.
  // Executes the next level of merge if all inputs are available.
  private enqueueBaseRollup(provingState: BlockProvingState, txIndex: number) {
    if (!provingState.verifyState()) {
      this.logger.debug('Not running base rollup, state invalid');
      return;
    }

    if (!provingState.tryStartProvingBase(txIndex)) {
      this.logger.debug(`Base rollup for tx ${txIndex} already started.`);
      return;
    }

    const txProvingState = provingState.getTxProvingState(txIndex);
    const { processedTx } = txProvingState;
    const { rollupType, inputs } = txProvingState.getBaseRollupTypeAndInputs();

    this.logger.debug(`Enqueuing deferred proving base rollup for ${processedTx.hash.toString()}`);

    this.deferredProving(
      provingState,
      this.wrapCircuitCall(
        inputs instanceof PrivateTxBaseRollupPrivateInputs
          ? 'getPrivateTxBaseRollupProof'
          : 'getPublicTxBaseRollupProof',
        signal => {
          if (inputs instanceof PrivateTxBaseRollupPrivateInputs) {
            return this.prover.getPrivateTxBaseRollupProof(inputs, signal, provingState.epochNumber);
          } else {
            return this.prover.getPublicTxBaseRollupProof(inputs, signal, provingState.epochNumber);
          }
        },
        { [Attributes.TX_HASH]: processedTx.hash.toString(), [Attributes.PROTOCOL_CIRCUIT_NAME]: rollupType },
      ),
      result => {
        this.logger.debug(`Completed proof for ${rollupType} for tx ${processedTx.hash.toString()}`);
        validatePartialState(result.inputs.endTreeSnapshots, txProvingState.treeSnapshots);
        const leafLocation = provingState.setBaseRollupProof(txIndex, result);
        if (provingState.totalNumTxs === 1) {
          this.checkAndEnqueueBlockRootRollup(provingState);
        } else {
          this.checkAndEnqueueNextMergeRollup(provingState, leafLocation);
        }
      },
    );
  }

  /**
   * Route the tx's chonk-verifier dependency through the per-epoch context: read the
   * cached promise (or enqueue if missing), then `.then(handleResult)` to progress to
   * the base rollup once the proof lands.
   */
  private getOrEnqueueChonkVerifier(provingState: BlockProvingState, txIndex: number) {
    if (!provingState.verifyState()) {
      return;
    }

    const txProvingState = provingState.getTxProvingState(txIndex);
    const txHash = txProvingState.processedTx.hash.toString();

    const handleResult = (
      result: PublicInputsAndRecursiveProof<
        PublicChonkVerifierPublicInputs,
        typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
      >,
    ) => {
      if (!provingState.verifyState()) {
        return;
      }
      txProvingState.setPublicChonkVerifierProof(result);
      this.checkAndEnqueueBaseRollup(provingState, txIndex);
    };

    const promise = this.chonkCache.getOrCompute(txHash, signal =>
      this.prover.getPublicChonkVerifierProof(
        txProvingState.getPublicChonkVerifierPrivateInputs(),
        signal,
        this.epochNumber,
      ),
    );
    void promise.then(handleResult).catch(err => {
      // The cache self-cleans on rejection, so a replacement sub-tree for this tx will see the
      // miss and re-enqueue. But if this proving state is still active, the failure must abort
      // it: otherwise the base rollup for this tx is never enqueued and the checkpoint (and
      // epoch) orchestrators hang forever waiting for a proof that will never arrive.
      if (err instanceof AbortError || !provingState.verifyState()) {
        return;
      }
      this.logger.error(`Chonk verifier proof failed for tx ${txHash}`, err);
      provingState.reject(`Chonk verifier proof failed for tx ${txHash}: ${err}`);
    });
  }

  // Executes the merge rollup circuit. Enqueues the next level of merge if all inputs are available.
  private enqueueMergeRollup(provingState: BlockProvingState, location: TreeNodeLocation) {
    if (!provingState.verifyState()) {
      this.logger.debug('Not running merge rollup. State no longer valid.');
      return;
    }

    if (!provingState.tryStartProvingMerge(location)) {
      this.logger.debug('Merge rollup already started.');
      return;
    }

    const inputs = provingState.getMergeRollupInputs(location);

    this.deferredProving(
      provingState,
      this.wrapCircuitCall(
        'getTxMergeRollupProof',
        signal => this.prover.getTxMergeRollupProof(inputs, signal, provingState.epochNumber),
        { [Attributes.PROTOCOL_CIRCUIT_NAME]: 'rollup-tx-merge' satisfies CircuitName },
      ),
      result => {
        provingState.setMergeRollupProof(location, result);
        this.checkAndEnqueueNextMergeRollup(provingState, location);
      },
    );
  }

  // Executes the block root rollup circuit.
  private enqueueBlockRootRollup(provingState: BlockProvingState) {
    if (!provingState.verifyState()) {
      this.logger.debug('Not running block root rollup, state no longer valid');
      return;
    }

    if (!provingState.tryStartProvingBlockRoot()) {
      this.logger.debug('Block root rollup already started.');
      return;
    }

    // Kept whole (not destructured) so the switch on the `rollupType` discriminant narrows `inputs` per case.
    const rollup = provingState.getBlockRootRollupTypeAndInputs();
    const rollupType = rollup.rollupType;

    this.logger.debug(`Enqueuing ${rollupType} for block ${provingState.blockNumber}.`);

    this.deferredProving(
      provingState,
      this.wrapCircuitCall(
        'getBlockRootRollupProof',
        signal => {
          switch (rollup.rollupType) {
            case 'rollup-block-root-first':
              return this.prover.getBlockRootFirstRollupProof(rollup.inputs, signal, provingState.epochNumber);
            case 'rollup-block-root-first-single-tx':
              return this.prover.getBlockRootSingleTxFirstRollupProof(rollup.inputs, signal, provingState.epochNumber);
            case 'rollup-block-root-first-empty-tx':
              return this.prover.getBlockRootEmptyTxFirstRollupProof(rollup.inputs, signal, provingState.epochNumber);
            case 'rollup-block-root-single-tx':
              return this.prover.getBlockRootSingleTxRollupProof(rollup.inputs, signal, provingState.epochNumber);
            case 'rollup-block-root':
              return this.prover.getBlockRootRollupProof(rollup.inputs, signal, provingState.epochNumber);
          }
        },
        { [Attributes.PROTOCOL_CIRCUIT_NAME]: rollupType },
      ),
      async result => {
        this.logger.debug(`Completed ${rollupType} proof for block ${provingState.blockNumber}`, {
          blockNumber: provingState.blockNumber,
          checkpointIndex: provingState.parentCheckpoint.index,
          ...result.inputs.toInspect(),
        });

        const leafLocation = provingState.setBlockRootRollupProof(result);
        const checkpointProvingState = provingState.parentCheckpoint;

        // Verification is called from both here and setBlockCompleted. Whichever runs last
        // will be the first to see all three pieces (header, proof output, archive) and run the checks.
        await this.verifyBuiltBlockAgainstSyncedState(provingState);

        if (checkpointProvingState.totalNumBlocks === 1) {
          this.checkAndEnqueueSubTreeResolution(checkpointProvingState);
        } else {
          this.checkAndEnqueueNextBlockMergeRollup(checkpointProvingState, leafLocation);
        }
      },
    );
  }

  // Runs the checkpoint's single InboxParity circuit and stores the output. The proof feeds the checkpoint root (in
  // the top tree), so completing it may resolve the sub-tree rather than a block root.
  private enqueueInboxParityCircuit(checkpointProvingState: CheckpointProvingState) {
    if (!checkpointProvingState.verifyState()) {
      this.logger.debug('Not running inbox parity. State no longer valid.');
      return;
    }

    if (!checkpointProvingState.tryStartProvingInboxParity()) {
      this.logger.debug('Inbox parity already started.');
      return;
    }

    const inputs = checkpointProvingState.getInboxParityInputs();
    const circuitName = `inbox-parity-${inputs.size}` satisfies CircuitName;

    this.deferredProving(
      checkpointProvingState,
      this.wrapCircuitCall(
        'getInboxParityProof',
        signal => this.prover.getInboxParityProof(inputs, signal, checkpointProvingState.epochNumber),
        { [Attributes.PROTOCOL_CIRCUIT_NAME]: circuitName },
      ),
      result => {
        checkpointProvingState.setInboxParityProof(result);
        this.checkAndEnqueueSubTreeResolution(checkpointProvingState);
      },
    );
  }

  // Executes the block merge rollup circuit.
  private enqueueBlockMergeRollup(provingState: CheckpointProvingState, location: TreeNodeLocation) {
    if (!provingState.verifyState()) {
      this.logger.debug('Not running block merge rollup. State no longer valid.');
      return;
    }

    if (!provingState.tryStartProvingBlockMerge(location)) {
      this.logger.debug('Block merge rollup already started.');
      return;
    }

    const inputs = provingState.getBlockMergeRollupInputs(location);
    this.deferredProving(
      provingState,
      this.wrapCircuitCall(
        'getBlockMergeRollupProof',
        signal => this.prover.getBlockMergeRollupProof(inputs, signal, provingState.epochNumber),
        { [Attributes.PROTOCOL_CIRCUIT_NAME]: 'rollup-block-merge' satisfies CircuitName },
      ),
      result => {
        this.logger.debug(`Completed block merge rollup proof for checkpoint ${provingState.index}`, {
          checkpointIndex: provingState.index,
          mergeLocation: location,
          ...result.inputs.toInspect(),
        });
        provingState.setBlockMergeRollupProof(location, result);
        this.checkAndEnqueueNextBlockMergeRollup(provingState, location);
      },
    );
  }

  private checkAndEnqueueNextMergeRollup(provingState: BlockProvingState, currentLocation: TreeNodeLocation) {
    if (!provingState.isReadyForMergeRollup(currentLocation)) {
      return;
    }
    const parentLocation = provingState.getParentLocation(currentLocation);
    if (parentLocation.level === 0) {
      this.checkAndEnqueueBlockRootRollup(provingState);
    } else {
      this.enqueueMergeRollup(provingState, parentLocation);
    }
  }

  private checkAndEnqueueBlockRootRollup(provingState: BlockProvingState) {
    if (!provingState.isReadyForBlockRootRollup()) {
      this.logger.debug('Not ready for block root rollup');
      return;
    }
    this.enqueueBlockRootRollup(provingState);
  }

  private checkAndEnqueueNextBlockMergeRollup(
    provingState: CheckpointProvingState,
    currentLocation: TreeNodeLocation,
  ): void {
    if (!provingState.isReadyForBlockMerge(currentLocation)) {
      return;
    }
    const parentLocation = provingState.getParentLocation(currentLocation);
    if (parentLocation.level === 0) {
      this.checkAndEnqueueSubTreeResolution(provingState);
    } else {
      this.enqueueBlockMergeRollup(provingState, parentLocation);
    }
  }

  /**
   * Sub-tree analogue of the orchestrator's `checkAndEnqueueCheckpointRootRollup`:
   * resolves the sub-tree promise with the block-level proof outputs once they're all ready,
   * instead of escalating to the checkpoint root rollup.
   */
  private checkAndEnqueueSubTreeResolution(provingState: CheckpointProvingState): void {
    const proofs = provingState.getSubTreeOutputProofs();
    const nonEmpty = proofs.filter((p): p is NonNullable<typeof p> => !!p);
    if (proofs.length !== nonEmpty.length) {
      // Block merge tree not fully resolved yet — retried as more block proofs land.
      return;
    }
    // The InboxParity proof gates the sub-tree result too (it feeds the checkpoint root in the top tree).
    const inboxParityProof = provingState.getInboxParityProof();
    if (!inboxParityProof) {
      // Parity not proven yet — retried when the inbox parity proof lands.
      return;
    }
    this.subTreeResult.resolve({
      blockProofOutputs: nonEmpty,
      inboxParityProof,
      previousArchiveSiblingPath: provingState.getLastArchiveSiblingPath(),
    });
  }

  /**
   * Executes the VM circuit for a public function. Enqueues the base rollup once the
   * tx's chonk-verifier + VM proofs are both ready.
   */
  private enqueueVM(provingState: BlockProvingState, txIndex: number) {
    if (!provingState.verifyState()) {
      this.logger.debug(`Not running VM circuit as state is no longer valid`);
      return;
    }

    const txProvingState = provingState.getTxProvingState(txIndex);

    this.deferredProving(
      provingState,
      this.wrapCircuitCall(
        'getAvmProof',
        async (signal: AbortSignal) => {
          const inputs = txProvingState.getAvmInputs();
          return await this.prover.getAvmProof(inputs, signal, provingState.epochNumber);
        },
        { [Attributes.TX_HASH]: txProvingState.processedTx.hash.toString() },
      ),
      proof => {
        this.logger.debug(`Proven VM for tx index: ${txIndex}`);
        txProvingState.setAvmProof(proof);
        this.checkAndEnqueueBaseRollup(provingState, txIndex);
      },
    );
  }

  private checkAndEnqueueBaseRollup(provingState: BlockProvingState, txIndex: number) {
    const txProvingState = provingState.getTxProvingState(txIndex);
    if (!txProvingState.ready()) {
      return;
    }
    // All upstream proofs (chonk verifier and, if required, vm) are ready — proceed to the base rollup.
    this.logger.debug(`Public functions completed for tx ${txIndex} enqueueing base rollup`);
    this.enqueueBaseRollup(provingState, txIndex);
  }

  // Flagged as protected so unit tests can override.
  protected async verifyBuiltBlockAgainstSyncedState(provingState: BlockProvingState) {
    const builtBlockHeader = provingState.getBuiltBlockHeader();
    if (!builtBlockHeader) {
      this.logger.debug('Block header not built yet, skipping header check.');
      return;
    }

    const output = provingState.getBlockRootRollupOutput();
    if (!output) {
      this.logger.debug('Block root rollup proof not built yet, skipping header check.');
      return;
    }

    const newArchive = provingState.getBuiltArchive();
    if (!newArchive) {
      this.logger.debug('Archive snapshot not yet captured, skipping header check.');
      return;
    }

    const header = await buildHeaderFromCircuitOutputs(output);

    if (!(await header.hash()).equals(await builtBlockHeader.hash())) {
      this.logger.error(`Block header mismatch.\nCircuit: ${inspect(header)}\nComputed: ${inspect(builtBlockHeader)}`);
      provingState.reject(`Block header hash mismatch.`);
      return;
    }

    const blockNumber = provingState.blockNumber;
    const syncedArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, this.dbProvider.getSnapshot(blockNumber));
    if (!syncedArchive.equals(newArchive)) {
      this.logger.error(
        `Archive tree mismatch for block ${blockNumber}: world state synced to ${inspect(
          syncedArchive,
        )} but built ${inspect(newArchive)}`,
      );
      provingState.reject(`Archive tree mismatch.`);
      return;
    }

    const circuitArchive = output.newArchive;
    if (!newArchive.equals(circuitArchive)) {
      this.logger.error(`New archive mismatch.\nCircuit: ${output.newArchive}\nComputed: ${newArchive}`);
      provingState.reject(`New archive mismatch.`);
      return;
    }
  }

  private getDbForBlock(blockNumber: BlockNumber): MerkleTreeWriteOperations {
    const db = this.dbs.get(blockNumber);
    if (!db) {
      throw new Error(`World state fork for block ${blockNumber} not found.`);
    }
    return db;
  }

  /**
   * Wraps a circuit call with a tracer span and circuit attributes. Replaces the
   * `ProvingScheduler.wrapCircuitCall` indirection that used to live on the abstract base.
   */
  private wrapCircuitCall<T>(
    circuitName: string,
    fn: (signal: AbortSignal) => Promise<T>,
    attributes: Record<string, unknown> = {},
  ): (signal: AbortSignal) => Promise<T> {
    return wrapCallbackInSpan(
      this.tracer,
      `CheckpointSubTreeOrchestrator.prover.${circuitName}`,
      { [Attributes.PROTOCOL_CIRCUIT_NAME]: circuitName as CircuitName, ...attributes },
      fn,
    );
  }
}
