import { BatchedBlob, BlobAccumulator, FinalBlobBatchingChallenges, SpongeBlob } from '@aztec/blob-lib';
import {
  L1_TO_L2_MSG_SUBTREE_HEIGHT,
  L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { AbortError } from '@aztec/foundation/error';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { assertLength } from '@aztec/foundation/serialize';
import { pushTestData } from '@aztec/foundation/testing';
import { elapsed } from '@aztec/foundation/timer';
import type { TreeNodeLocation } from '@aztec/foundation/trees';
import { readAvmMinimalPublicTxInputsFromFile } from '@aztec/simulator/public/fixtures';
import { EthAddress, createBlockEndMarker } from '@aztec/stdlib/block';
import type {
  EpochProver,
  ForkMerkleTreeOperations,
  MerkleTreeWriteOperations,
  PublicInputsAndRecursiveProof,
  ServerCircuitProver,
} from '@aztec/stdlib/interfaces/server';
import type { Proof } from '@aztec/stdlib/proofs';
import {
  type BaseRollupHints,
  BlockRootEmptyTxFirstRollupPrivateInputs,
  BlockRootFirstRollupPrivateInputs,
  BlockRootSingleTxFirstRollupPrivateInputs,
  BlockRootSingleTxRollupPrivateInputs,
  CheckpointConstantData,
  CheckpointRootSingleBlockRollupPrivateInputs,
  PrivateTxBaseRollupPrivateInputs,
  PublicTubePrivateInputs,
  PublicTubePublicInputs,
  RootRollupPublicInputs,
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
  buildBlockHeaderFromTxs,
  buildHeaderFromCircuitOutputs,
  getLastSiblingPath,
  getPublicTubePrivateInputsFromTx,
  getRootTreeSiblingPath,
  getSubtreeSiblingPath,
  getTreeSnapshot,
  insertSideEffectsAndBuildBaseRollupHints,
  validatePartialState,
  validateTx,
} from './block-building-helpers.js';
import type { BlockProvingState } from './block-proving-state.js';
import type { CheckpointProvingState } from './checkpoint-proving-state.js';
import { EpochProvingState, type ProvingResult, type TreeSnapshots } from './epoch-proving-state.js';
import { ProvingOrchestratorMetrics } from './orchestrator_metrics.js';
import { TxProvingState } from './tx-proving-state.js';

const logger = createLogger('prover-client:orchestrator');

/**
 * Implements an event driven proving scheduler to build the recursive proof tree. The idea being:
 * 1. Transactions are provided to the scheduler post simulation.
 * 2. Tree insertions are performed as required to generate transaction specific proofs
 * 3. Those transaction specific proofs are generated in the necessary order accounting for dependencies
 * 4. Once a transaction is proven, it will be incorporated into a merge proof
 * 5. Merge proofs are produced at each level of the tree until the root proof is produced
 *
 * The proving implementation is determined by the provided prover. This could be for example a local prover or a remote prover pool.
 */

/**
 * The orchestrator, managing the flow of recursive proving operations required to build the rollup proof tree.
 */
export class ProvingOrchestrator implements EpochProver {
  private provingState: EpochProvingState | undefined = undefined;
  private pendingProvingJobs: AbortController[] = [];

  private provingPromise: Promise<ProvingResult> | undefined = undefined;
  private metrics: ProvingOrchestratorMetrics;
  private dbs: Map<number, MerkleTreeWriteOperations> = new Map();

  constructor(
    private dbProvider: ForkMerkleTreeOperations,
    private prover: ServerCircuitProver,
    private readonly proverId: EthAddress,
    telemetryClient: TelemetryClient = getTelemetryClient(),
  ) {
    this.metrics = new ProvingOrchestratorMetrics(telemetryClient, 'ProvingOrchestrator');
  }

  get tracer(): Tracer {
    return this.metrics.tracer;
  }

  public getProverId(): EthAddress {
    return this.proverId;
  }

  public stop(): Promise<void> {
    this.cancel();
    return Promise.resolve();
  }

  public startNewEpoch(
    epochNumber: number,
    totalNumCheckpoints: number,
    finalBlobBatchingChallenges: FinalBlobBatchingChallenges,
  ) {
    if (this.provingState?.verifyState()) {
      throw new Error(
        `Cannot start epoch ${epochNumber} when epoch ${this.provingState.epochNumber} is still being processed.`,
      );
    }

    const { promise: _promise, resolve, reject } = promiseWithResolvers<ProvingResult>();
    const promise = _promise.catch((reason): ProvingResult => ({ status: 'failure', reason }));
    logger.info(`Starting epoch ${epochNumber} with ${totalNumCheckpoints} checkpoints.`);
    this.provingState = new EpochProvingState(
      epochNumber,
      totalNumCheckpoints,
      finalBlobBatchingChallenges,
      provingState => this.checkAndEnqueueCheckpointRootRollup(provingState),
      resolve,
      reject,
    );
    this.provingPromise = promise;
  }

  public async startNewCheckpoint(
    checkpointIndex: number,
    constants: CheckpointConstantData,
    l1ToL2Messages: Fr[],
    totalNumBlocks: number,
    totalNumBlobFields: number,
    headerOfLastBlockInPreviousCheckpoint: BlockHeader,
  ) {
    if (!this.provingState) {
      throw new Error('Empty epoch proving state. Call startNewEpoch before starting a checkpoint.');
    }

    if (!this.provingState.isAcceptingCheckpoints()) {
      throw new Error(`Epoch not accepting further checkpoints.`);
    }

    // Fork world state at the end of the immediately previous block.
    const lastBlockNumber = headerOfLastBlockInPreviousCheckpoint.globalVariables.blockNumber;
    const db = await this.dbProvider.fork(lastBlockNumber);

    const firstBlockNumber = lastBlockNumber + 1;
    this.dbs.set(firstBlockNumber, db);

    // Get archive sibling path before any block in this checkpoint lands.
    const lastArchiveSiblingPath = await getLastSiblingPath(MerkleTreeId.ARCHIVE, db);

    // Insert all the l1 to l2 messages into the db. And get the states before and after the insertion.
    const {
      lastL1ToL2MessageTreeSnapshot,
      lastL1ToL2MessageSubtreeRootSiblingPath,
      newL1ToL2MessageTreeSnapshot,
      newL1ToL2MessageSubtreeRootSiblingPath,
    } = await this.updateL1ToL2MessageTree(l1ToL2Messages, db);

    this.provingState.startNewCheckpoint(
      checkpointIndex,
      constants,
      totalNumBlocks,
      totalNumBlobFields,
      headerOfLastBlockInPreviousCheckpoint,
      lastArchiveSiblingPath,
      l1ToL2Messages,
      lastL1ToL2MessageTreeSnapshot,
      lastL1ToL2MessageSubtreeRootSiblingPath,
      newL1ToL2MessageTreeSnapshot,
      newL1ToL2MessageSubtreeRootSiblingPath,
    );
  }

  /**
   * Starts off a new block
   * @param blockNumber - The block number
   * @param timestamp - The timestamp of the block. This is only required for constructing the private inputs for the
   * block that doesn't have any txs.
   * @param totalNumTxs - The total number of txs in the block
   */
  @trackSpan('ProvingOrchestrator.startNewBlock', blockNumber => ({
    [Attributes.BLOCK_NUMBER]: blockNumber,
  }))
  public async startNewBlock(blockNumber: number, timestamp: UInt64, totalNumTxs: number) {
    if (!this.provingState) {
      throw new Error('Empty epoch proving state. Call startNewEpoch before starting a block.');
    }

    const checkpointProvingState = this.provingState.getCheckpointProvingStateByBlockNumber(blockNumber);
    if (!checkpointProvingState) {
      throw new Error(`Checkpoint not started. Call startNewCheckpoint first.`);
    }

    if (!checkpointProvingState.isAcceptingBlocks()) {
      throw new Error(`Checkpoint not accepting further blocks.`);
    }

    const constants = checkpointProvingState.constants;
    logger.info(`Starting block ${blockNumber} for slot ${constants.slotNumber.toNumber()}.`);

    // Fork the db only when it's not already set. The db for the first block is set in `startNewCheckpoint`.
    if (!this.dbs.has(blockNumber)) {
      // Fork world state at the end of the immediately previous block
      const db = await this.dbProvider.fork(blockNumber - 1);
      this.dbs.set(blockNumber, db);
    }
    const db = this.dbs.get(blockNumber)!;

    // Get archive snapshot and sibling path before any txs in this block lands.
    const lastArchiveTreeSnapshot = await getTreeSnapshot(MerkleTreeId.ARCHIVE, db);
    const lastArchiveSiblingPath = await getRootTreeSiblingPath(MerkleTreeId.ARCHIVE, db);

    const blockProvingState = checkpointProvingState.startNewBlock(
      blockNumber,
      timestamp,
      totalNumTxs,
      lastArchiveTreeSnapshot,
      lastArchiveSiblingPath,
    );

    // Enqueue base parity circuits for the first block in the checkpoint.
    if (blockProvingState.index === 0) {
      for (let i = 0; i < NUM_BASE_PARITY_PER_ROOT_PARITY; i++) {
        this.enqueueBaseParityCircuit(checkpointProvingState, blockProvingState, i);
      }
    }

    // Because `addTxs` won't be called for a block without txs, and that's where the sponge blob state is computed.
    // We need to set its end sponge blob here, which will become the start sponge blob for the next block.
    if (totalNumTxs === 0) {
      const endSpongeBlob = blockProvingState.getStartSpongeBlob().clone();
      await endSpongeBlob.absorb([createBlockEndMarker(0)]);
      blockProvingState.setEndSpongeBlob(endSpongeBlob);

      // And also try to accumulate the blobs as far as we can:
      await this.provingState.setBlobAccumulators();
    }
  }

  /**
   * The interface to add simulated transactions to the scheduler. This can only be called once per block.
   * @param txs - The transactions to be proven
   */
  @trackSpan('ProvingOrchestrator.addTxs', txs => ({
    [Attributes.BLOCK_TXS_COUNT]: txs.length,
  }))
  public async addTxs(txs: ProcessedTx[]): Promise<void> {
    if (!this.provingState) {
      throw new Error(`Empty epoch proving state. Call startNewEpoch before adding txs.`);
    }

    if (!txs.length) {
      // To avoid an ugly throw below. If we require an empty block, we can just call setBlockCompleted
      // on a block with no txs. We cannot do that here because we cannot find the blockNumber without any txs.
      logger.warn(`Provided no txs to orchestrator addTxs.`);
      return;
    }

    const blockNumber = txs[0].globalVariables.blockNumber;
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

    logger.info(`Adding ${txs.length} transactions to block ${blockNumber}`);

    const db = this.dbs.get(blockNumber)!;
    const lastArchive = provingState.lastArchiveTreeSnapshot;
    const newL1ToL2MessageTreeSnapshot = provingState.newL1ToL2MessageTreeSnapshot;
    const spongeBlobState = provingState.getStartSpongeBlob().clone();

    for (const tx of txs) {
      try {
        if (!provingState.verifyState()) {
          throw new Error(`Invalid proving state when adding a tx`);
        }

        validateTx(tx);

        logger.info(`Received transaction: ${tx.hash}`);

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
          this.getOrEnqueueTube(provingState, txIndex);
          logger.debug(`Enqueueing public VM for tx ${txIndex}`);
          this.enqueueVM(provingState, txIndex);
        } else {
          logger.debug(`Enqueueing base rollup for private-only tx ${txIndex}`);
          this.enqueueBaseRollup(provingState, txIndex);
        }
      } catch (err: any) {
        throw new Error(`Error adding transaction ${tx.hash.toString()} to block ${blockNumber}: ${err.message}`, {
          cause: err,
        });
      }
    }

    await spongeBlobState.absorb([createBlockEndMarker(txs.length)]);

    provingState.setEndSpongeBlob(spongeBlobState);

    // Txs have been added to the block. Now try to accumulate the blobs as far as we can:
    await this.provingState.setBlobAccumulators();
  }

  /**
   * Kickstarts tube circuits for the specified txs. These will be used during epoch proving.
   * Note that if the tube circuits are not started this way, they will be started nontheless after processing.
   */
  @trackSpan('ProvingOrchestrator.startTubeCircuits')
  public startTubeCircuits(txs: Tx[]) {
    if (!this.provingState?.verifyState()) {
      throw new Error(`Empty epoch proving state. call startNewEpoch before starting tube circuits.`);
    }
    const publicTxs = txs.filter(tx => tx.data.forPublic);
    for (const tx of publicTxs) {
      const txHash = tx.getTxHash().toString();
      const privateInputs = getPublicTubePrivateInputsFromTx(tx, this.proverId.toField());
      const tubeProof =
        promiseWithResolvers<
          PublicInputsAndRecursiveProof<PublicTubePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
        >();
      logger.debug(`Starting tube circuit for tx ${txHash}`);
      this.doEnqueueTube(txHash, privateInputs, proof => {
        tubeProof.resolve(proof);
      });
      this.provingState.cachedTubeProofs.set(txHash, tubeProof.promise);
    }
    return Promise.resolve();
  }

  /**
   * Marks the block as completed.
   * Computes the block header and updates the archive tree.
   */
  @trackSpan('ProvingOrchestrator.setBlockCompleted', (blockNumber: number) => ({
    [Attributes.BLOCK_NUMBER]: blockNumber,
  }))
  public async setBlockCompleted(blockNumber: number, expectedHeader?: BlockHeader): Promise<BlockHeader> {
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

    // And build the block header
    logger.verbose(`Block ${blockNumber} completed. Assembling header.`);
    const header = await this.buildL2BlockHeader(provingState, expectedHeader);

    await this.verifyBuiltBlockAgainstSyncedState(provingState);

    return header;
  }

  private async buildL2BlockHeader(provingState: BlockProvingState, expectedHeader?: BlockHeader) {
    // Collect all txs in this block to build the header. The function calling this has made sure that all txs have been added.
    const txs = provingState.getProcessedTxs();

    const startSpongeBlob = provingState.getStartSpongeBlob();

    // Get db for this block
    const db = this.dbs.get(provingState.blockNumber)!;

    // Given we've applied every change from this block, now assemble the block header
    // and update the archive tree, so we're ready to start processing the next block
    const header = await buildBlockHeaderFromTxs(txs, provingState.getGlobalVariables(), startSpongeBlob, db);

    if (expectedHeader && !header.equals(expectedHeader)) {
      logger.error(`Block header mismatch: header=${header} expectedHeader=${expectedHeader}`);
      throw new Error('Block header mismatch');
    }

    logger.verbose(
      `Updating archive tree with block ${provingState.blockNumber} header ${(await header.hash()).toString()}`,
    );
    await db.updateArchive(header);

    provingState.setBuiltBlockHeader(header);

    return header;
  }

  // Flagged as protected to disable in certain unit tests
  protected async verifyBuiltBlockAgainstSyncedState(provingState: BlockProvingState) {
    const builtBlockHeader = provingState.getBuiltBlockHeader();
    if (!builtBlockHeader) {
      logger.debug('Block header not built yet, skipping header check.');
      return;
    }

    const output = provingState.getBlockRootRollupOutput();
    if (!output) {
      logger.debug('Block root rollup proof not built yet, skipping header check.');
      return;
    }
    const header = await buildHeaderFromCircuitOutputs(output);

    if (!(await header.hash()).equals(await builtBlockHeader.hash())) {
      logger.error(`Block header mismatch.\nCircuit: ${inspect(header)}\nComputed: ${inspect(builtBlockHeader)}`);
      provingState.reject(`Block header hash mismatch.`);
      return;
    }

    // Get db for this block
    const blockNumber = provingState.blockNumber;
    const db = this.dbs.get(blockNumber)!;

    const newArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, db);
    const syncedArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, this.dbProvider.getSnapshot(blockNumber));
    if (!syncedArchive.equals(newArchive)) {
      logger.error(
        `Archive tree mismatch for block ${blockNumber}: world state synced to ${inspect(
          syncedArchive,
        )} but built ${inspect(newArchive)}`,
      );
      provingState.reject(`Archive tree mismatch.`);
      return;
    }

    const circuitArchive = output.newArchive;
    if (!newArchive.equals(circuitArchive)) {
      logger.error(`New archive mismatch.\nCircuit: ${output.newArchive}\nComputed: ${newArchive}`);
      provingState.reject(`New archive mismatch.`);
      return;
    }

    // TODO(palla/prover): This closes the fork only on the happy path. If this epoch orchestrator
    // is aborted and never reaches this point, it will leak the fork. We need to add a global cleanup,
    // but have to make sure it only runs once all operations are completed, otherwise some function here
    // will attempt to access the fork after it was closed.
    logger.debug(`Cleaning up world state fork for ${blockNumber}`);
    void this.dbs
      .get(blockNumber)
      ?.close()
      .then(() => this.dbs.delete(blockNumber))
      .catch(err => logger.error(`Error closing db for block ${blockNumber}`, err));
  }

  /**
   * Cancel any further proving
   */
  public cancel() {
    for (const controller of this.pendingProvingJobs) {
      controller.abort();
    }

    this.provingState?.cancel();
  }

  /**
   * Returns the proof for the current epoch.
   */
  public async finalizeEpoch(): Promise<{
    publicInputs: RootRollupPublicInputs;
    proof: Proof;
    batchedBlobInputs: BatchedBlob;
  }> {
    if (!this.provingState || !this.provingPromise) {
      throw new Error(`Invalid proving state, an epoch must be proven before it can be finalized`);
    }

    const result = await this.provingPromise!;
    if (result.status === 'failure') {
      throw new Error(`Epoch proving failed: ${result.reason}`);
    }

    await this.provingState.finalizeBatchedBlob();

    const epochProofResult = this.provingState.getEpochProofResult();

    pushTestData('epochProofResult', {
      proof: epochProofResult.proof.toString(),
      publicInputs: epochProofResult.publicInputs.toString(),
    });

    return epochProofResult;
  }

  /**
   * Enqueue a job to be scheduled
   * @param provingState - The proving state object being operated on
   * @param jobType - The type of job to be queued
   * @param job - The actual job, returns a promise notifying of the job's completion
   */
  private deferredProving<T>(
    provingState: EpochProvingState | CheckpointProvingState | BlockProvingState,
    request: (signal: AbortSignal) => Promise<T>,
    callback: (result: T) => void | Promise<void>,
  ) {
    if (!provingState.verifyState()) {
      logger.debug(`Not enqueuing job, state no longer valid`);
      return;
    }

    const controller = new AbortController();
    this.pendingProvingJobs.push(controller);

    // We use a 'safeJob'. We don't want promise rejections in the proving pool, we want to capture the error here
    // and reject the proving job whilst keeping the event loop free of rejections
    const safeJob = async () => {
      try {
        // there's a delay between enqueueing this job and it actually running
        if (controller.signal.aborted) {
          return;
        }

        const result = await request(controller.signal);
        if (!provingState.verifyState()) {
          logger.debug(`State no longer valid, discarding result`);
          return;
        }

        // we could have been cancelled whilst waiting for the result
        // and the prover ignored the signal. Drop the result in that case
        if (controller.signal.aborted) {
          return;
        }

        await callback(result);
      } catch (err) {
        if (err instanceof AbortError) {
          // operation was cancelled, probably because the block was cancelled
          // drop this result
          return;
        }

        logger.error(`Error thrown when proving job`, err);
        provingState!.reject(`${err}`);
      } finally {
        const index = this.pendingProvingJobs.indexOf(controller);
        if (index > -1) {
          this.pendingProvingJobs.splice(index, 1);
        }
      }
    };

    // let the callstack unwind before adding the job to the queue
    setImmediate(() => void safeJob());
  }

  private async updateL1ToL2MessageTree(l1ToL2Messages: Fr[], db: MerkleTreeWriteOperations) {
    const l1ToL2MessagesPadded = padArrayEnd(
      l1ToL2Messages,
      Fr.ZERO,
      NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      'Too many L1 to L2 messages',
    );

    const lastL1ToL2MessageTreeSnapshot = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, db);
    const lastL1ToL2MessageSubtreeRootSiblingPath = assertLength(
      await getSubtreeSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, L1_TO_L2_MSG_SUBTREE_HEIGHT, db),
      L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
    );

    // Update the local trees to include the new l1 to l2 messages
    await db.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2MessagesPadded);

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

  // Updates the merkle trees for a transaction. The first enqueued job for a transaction
  @trackSpan('ProvingOrchestrator.prepareBaseRollupInputs', tx => ({
    [Attributes.TX_HASH]: tx.hash.toString(),
  }))
  private async prepareBaseRollupInputs(
    tx: ProcessedTx,
    lastArchive: AppendOnlyTreeSnapshot,
    newL1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot,
    startSpongeBlob: SpongeBlob,
    db: MerkleTreeWriteOperations,
  ): Promise<[BaseRollupHints, TreeSnapshots]> {
    // We build the base rollup inputs using a mock proof and verification key.
    // These will be overwritten later once we have proven the tube circuit and any public kernels
    const [ms, hints] = await elapsed(
      insertSideEffectsAndBuildBaseRollupHints(
        tx,
        lastArchive,
        newL1ToL2MessageTreeSnapshot,
        startSpongeBlob,
        this.proverId.toField(),
        db,
      ),
    );

    this.metrics.recordBaseRollupInputs(ms);

    const promises = [MerkleTreeId.NOTE_HASH_TREE, MerkleTreeId.NULLIFIER_TREE, MerkleTreeId.PUBLIC_DATA_TREE].map(
      async (id: MerkleTreeId) => {
        return { key: id, value: await getTreeSnapshot(id, db) };
      },
    );
    const treeSnapshots: TreeSnapshots = new Map((await Promise.all(promises)).map(obj => [obj.key, obj.value]));

    return [hints, treeSnapshots];
  }

  // Executes the base rollup circuit and stored the output as intermediate state for the parent merge/root circuit
  // Executes the next level of merge if all inputs are available
  private enqueueBaseRollup(provingState: BlockProvingState, txIndex: number) {
    if (!provingState.verifyState()) {
      logger.debug('Not running base rollup, state invalid');
      return;
    }

    if (!provingState.tryStartProvingBase(txIndex)) {
      logger.debug(`Base rollup for tx ${txIndex} already started.`);
      return;
    }

    const txProvingState = provingState.getTxProvingState(txIndex);
    const { processedTx } = txProvingState;
    const { rollupType, inputs } = txProvingState.getBaseRollupTypeAndInputs();

    logger.debug(`Enqueuing deferred proving base rollup for ${processedTx.hash.toString()}`);

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        `ProvingOrchestrator.prover.${
          inputs instanceof PrivateTxBaseRollupPrivateInputs
            ? 'getPrivateTxBaseRollupProof'
            : 'getPublicTxBaseRollupProof'
        }`,
        {
          [Attributes.TX_HASH]: processedTx.hash.toString(),
          [Attributes.PROTOCOL_CIRCUIT_NAME]: rollupType,
        },
        signal => {
          if (inputs instanceof PrivateTxBaseRollupPrivateInputs) {
            return this.prover.getPrivateTxBaseRollupProof(inputs, signal, provingState.epochNumber);
          } else {
            return this.prover.getPublicTxBaseRollupProof(inputs, signal, provingState.epochNumber);
          }
        },
      ),
      result => {
        logger.debug(`Completed proof for ${rollupType} for tx ${processedTx.hash.toString()}`);
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

  // Enqueues the public tube circuit for a given transaction index, or reuses the one already enqueued.
  // Once completed, will enqueue the the public tx base rollup.
  private getOrEnqueueTube(provingState: BlockProvingState, txIndex: number) {
    if (!provingState.verifyState()) {
      logger.debug('Not running tube circuit, state invalid');
      return;
    }

    const txProvingState = provingState.getTxProvingState(txIndex);
    const txHash = txProvingState.processedTx.hash.toString();
    NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH;
    const handleResult = (
      result: PublicInputsAndRecursiveProof<PublicTubePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>,
    ) => {
      logger.debug(`Got tube proof for tx index: ${txIndex}`, { txHash });
      txProvingState.setPublicTubeProof(result);
      this.provingState?.cachedTubeProofs.delete(txHash);
      this.checkAndEnqueueBaseRollup(provingState, txIndex);
    };

    if (this.provingState?.cachedTubeProofs.has(txHash)) {
      logger.debug(`Tube proof already enqueued for tx index: ${txIndex}`, { txHash });
      void this.provingState!.cachedTubeProofs.get(txHash)!.then(handleResult);
      return;
    }

    logger.debug(`Enqueuing tube circuit for tx index: ${txIndex}`);
    this.doEnqueueTube(txHash, txProvingState.getPublicTubePrivateInputs(), handleResult);
  }

  private doEnqueueTube(
    txHash: string,
    inputs: PublicTubePrivateInputs,
    handler: (
      result: PublicInputsAndRecursiveProof<PublicTubePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>,
    ) => void,
    provingState: EpochProvingState | BlockProvingState = this.provingState!,
  ) {
    if (!provingState.verifyState()) {
      logger.debug('Not running tube circuit, state invalid');
      return;
    }

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getPublicTubeProof',
        {
          [Attributes.TX_HASH]: txHash,
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'tube-public' satisfies CircuitName,
        },
        signal => this.prover.getPublicTubeProof(inputs, signal, provingState.epochNumber),
      ),
      handler,
    );
  }

  // Executes the merge rollup circuit and stored the output as intermediate state for the parent merge/block root circuit
  // Enqueues the next level of merge if all inputs are available
  private enqueueMergeRollup(provingState: BlockProvingState, location: TreeNodeLocation) {
    if (!provingState.verifyState()) {
      logger.debug('Not running merge rollup. State no longer valid.');
      return;
    }

    if (!provingState.tryStartProvingMerge(location)) {
      logger.debug('Merge rollup already started.');
      return;
    }

    const inputs = provingState.getMergeRollupInputs(location);

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getTxMergeRollupProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'rollup-tx-merge' satisfies CircuitName,
        },
        signal => this.prover.getTxMergeRollupProof(inputs, signal, provingState.epochNumber),
      ),
      result => {
        provingState.setMergeRollupProof(location, result);
        this.checkAndEnqueueNextMergeRollup(provingState, location);
      },
    );
  }

  // Executes the block root rollup circuit
  private enqueueBlockRootRollup(provingState: BlockProvingState) {
    if (!provingState.verifyState()) {
      logger.debug('Not running block root rollup, state no longer valid');
      return;
    }

    if (!provingState.tryStartProvingBlockRoot()) {
      logger.debug('Block root rollup already started.');
      return;
    }

    const { rollupType, inputs } = provingState.getBlockRootRollupTypeAndInputs();

    logger.debug(`Enqueuing ${rollupType} for block ${provingState.blockNumber}.`);

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getBlockRootRollupProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_NAME]: rollupType,
        },
        signal => {
          if (inputs instanceof BlockRootFirstRollupPrivateInputs) {
            return this.prover.getBlockRootFirstRollupProof(inputs, signal, provingState.epochNumber);
          } else if (inputs instanceof BlockRootSingleTxFirstRollupPrivateInputs) {
            return this.prover.getBlockRootSingleTxFirstRollupProof(inputs, signal, provingState.epochNumber);
          } else if (inputs instanceof BlockRootEmptyTxFirstRollupPrivateInputs) {
            return this.prover.getBlockRootEmptyTxFirstRollupProof(inputs, signal, provingState.epochNumber);
          } else if (inputs instanceof BlockRootSingleTxRollupPrivateInputs) {
            return this.prover.getBlockRootSingleTxRollupProof(inputs, signal, provingState.epochNumber);
          } else {
            return this.prover.getBlockRootRollupProof(inputs, signal, provingState.epochNumber);
          }
        },
      ),
      async result => {
        // If the proofs were slower than the block header building, then we need to try validating the block header hashes here.
        await this.verifyBuiltBlockAgainstSyncedState(provingState);

        logger.debug(`Completed ${rollupType} proof for block ${provingState.blockNumber}`);

        const leafLocation = provingState.setBlockRootRollupProof(result);
        const checkpointProvingState = provingState.parentCheckpoint;

        if (checkpointProvingState.totalNumBlocks === 1) {
          this.checkAndEnqueueCheckpointRootRollup(checkpointProvingState);
        } else {
          this.checkAndEnqueueNextBlockMergeRollup(checkpointProvingState, leafLocation);
        }
      },
    );
  }

  // Executes the base parity circuit and stores the intermediate state for the root parity circuit
  // Enqueues the root parity circuit if all inputs are available
  private enqueueBaseParityCircuit(
    checkpointProvingState: CheckpointProvingState,
    provingState: BlockProvingState,
    baseParityIndex: number,
  ) {
    if (!provingState.verifyState()) {
      logger.debug('Not running base parity. State no longer valid.');
      return;
    }

    if (!provingState.tryStartProvingBaseParity(baseParityIndex)) {
      logger.warn(`Base parity ${baseParityIndex} already started.`);
      return;
    }

    const inputs = checkpointProvingState.getBaseParityInputs(baseParityIndex);

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getBaseParityProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'parity-base' satisfies CircuitName,
        },
        signal => this.prover.getBaseParityProof(inputs, signal, provingState.epochNumber),
      ),
      provingOutput => {
        provingState.setBaseParityProof(baseParityIndex, provingOutput);
        this.checkAndEnqueueRootParityCircuit(provingState);
      },
    );
  }

  private checkAndEnqueueRootParityCircuit(provingState: BlockProvingState) {
    if (!provingState.isReadyForRootParity()) {
      return;
    }

    this.enqueueRootParityCircuit(provingState);
  }

  // Runs the root parity circuit ans stored the outputs
  // Enqueues the root rollup proof if all inputs are available
  private enqueueRootParityCircuit(provingState: BlockProvingState) {
    if (!provingState.verifyState()) {
      logger.debug('Not running root parity. State no longer valid.');
      return;
    }

    if (!provingState.tryStartProvingRootParity()) {
      logger.debug('Root parity already started.');
      return;
    }

    const inputs = provingState.getParityRootInputs();

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getRootParityProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'parity-root' satisfies CircuitName,
        },
        signal => this.prover.getRootParityProof(inputs, signal, provingState.epochNumber),
      ),
      result => {
        provingState.setRootParityProof(result);
        this.checkAndEnqueueBlockRootRollup(provingState);
      },
    );
  }

  // Executes the block merge rollup circuit and stored the output as intermediate state for the parent merge/block root circuit
  // Enqueues the next level of merge if all inputs are available
  private enqueueBlockMergeRollup(provingState: CheckpointProvingState, location: TreeNodeLocation) {
    if (!provingState.verifyState()) {
      logger.debug('Not running block merge rollup. State no longer valid.');
      return;
    }

    if (!provingState.tryStartProvingBlockMerge(location)) {
      logger.debug('Block merge rollup already started.');
      return;
    }

    const inputs = provingState.getBlockMergeRollupInputs(location);
    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getBlockMergeRollupProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'rollup-block-merge' satisfies CircuitName,
        },
        signal => this.prover.getBlockMergeRollupProof(inputs, signal, provingState.epochNumber),
      ),
      result => {
        provingState.setBlockMergeRollupProof(location, result);
        this.checkAndEnqueueNextBlockMergeRollup(provingState, location);
      },
    );
  }

  private enqueueCheckpointRootRollup(provingState: CheckpointProvingState) {
    if (!provingState.verifyState()) {
      logger.debug('Not running checkpoint root rollup. State no longer valid.');
      return;
    }

    if (!provingState.tryStartProvingCheckpointRoot()) {
      logger.debug('Checkpoint root rollup already started.');
      return;
    }

    const rollupType = provingState.getCheckpointRootRollupType();

    logger.debug(`Enqueuing ${rollupType} for checkpoint ${provingState.index}.`);

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getCheckpointRootRollupProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_NAME]: rollupType,
        },
        async signal => {
          const inputs = await provingState.getCheckpointRootRollupInputs();
          if (inputs instanceof CheckpointRootSingleBlockRollupPrivateInputs) {
            return this.prover.getCheckpointRootSingleBlockRollupProof(inputs, signal, provingState.epochNumber);
          } else {
            return this.prover.getCheckpointRootRollupProof(inputs, signal, provingState.epochNumber);
          }
        },
      ),
      result => {
        const computedEndBlobAccumulatorState = BlobAccumulator.fromBatchedBlobAccumulator(
          provingState.getEndBlobAccumulator()!,
        );
        const circuitEndBlobAccumulatorState = result.inputs.endBlobAccumulator;
        if (!circuitEndBlobAccumulatorState.equals(computedEndBlobAccumulatorState)) {
          logger.error(
            `Blob accumulator state mismatch.\nCircuit: ${inspect(circuitEndBlobAccumulatorState)}\nComputed: ${inspect(
              computedEndBlobAccumulatorState,
            )}`,
          );
          provingState.reject(`Blob accumulator state mismatch.`);
          return;
        }

        logger.debug(`Completed ${rollupType} proof for checkpoint ${provingState.index}.`);

        const leafLocation = provingState.setCheckpointRootRollupProof(result);
        const epochProvingState = provingState.parentEpoch;

        if (epochProvingState.totalNumCheckpoints === 1) {
          this.enqueueEpochPadding(epochProvingState);
        } else {
          this.checkAndEnqueueNextCheckpointMergeRollup(epochProvingState, leafLocation);
        }
      },
    );
  }

  private enqueueCheckpointMergeRollup(provingState: EpochProvingState, location: TreeNodeLocation) {
    if (!provingState.verifyState()) {
      logger.debug('Not running checkpoint merge rollup. State no longer valid.');
      return;
    }

    if (!provingState.tryStartProvingCheckpointMerge(location)) {
      logger.debug('Checkpoint merge rollup already started.');
      return;
    }

    const inputs = provingState.getCheckpointMergeRollupInputs(location);

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getCheckpointMergeRollupProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'rollup-checkpoint-merge' satisfies CircuitName,
        },
        signal => this.prover.getCheckpointMergeRollupProof(inputs, signal, provingState.epochNumber),
      ),
      result => {
        logger.debug('Completed proof for checkpoint merge rollup.');
        provingState.setCheckpointMergeRollupProof(location, result);
        this.checkAndEnqueueNextCheckpointMergeRollup(provingState, location);
      },
    );
  }

  private enqueueEpochPadding(provingState: EpochProvingState) {
    if (!provingState.verifyState()) {
      logger.debug('Not running epoch padding. State no longer valid.');
      return;
    }

    if (!provingState.tryStartProvingPaddingCheckpoint()) {
      logger.debug('Padding checkpoint already started.');
      return;
    }

    logger.debug('Padding epoch proof with a padding block root proof.');

    const inputs = provingState.getPaddingCheckpointInputs();

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getCheckpointPaddingRollupProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'rollup-checkpoint-padding' satisfies CircuitName,
        },
        signal => this.prover.getCheckpointPaddingRollupProof(inputs, signal, provingState.epochNumber),
      ),
      result => {
        logger.debug('Completed proof for padding checkpoint.');
        provingState.setCheckpointPaddingProof(result);
        this.checkAndEnqueueRootRollup(provingState);
      },
    );
  }

  // Executes the root rollup circuit
  private enqueueRootRollup(provingState: EpochProvingState) {
    if (!provingState.verifyState()) {
      logger.debug('Not running root rollup, state no longer valid');
      return;
    }

    logger.debug(`Preparing root rollup`);

    const inputs = provingState.getRootRollupInputs();

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getRootRollupProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'rollup-root' satisfies CircuitName,
        },
        signal => this.prover.getRootRollupProof(inputs, signal, provingState.epochNumber),
      ),
      result => {
        logger.verbose(`Orchestrator completed root rollup for epoch ${provingState.epochNumber}`);
        provingState.setRootRollupProof(result);
        provingState.resolve({ status: 'success' });
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
      logger.debug('Not ready for block root rollup');
      return;
    }

    this.enqueueBlockRootRollup(provingState);
  }

  private checkAndEnqueueNextBlockMergeRollup(provingState: CheckpointProvingState, currentLocation: TreeNodeLocation) {
    if (!provingState.isReadyForBlockMerge(currentLocation)) {
      return;
    }

    const parentLocation = provingState.getParentLocation(currentLocation);
    if (parentLocation.level === 0) {
      this.checkAndEnqueueCheckpointRootRollup(provingState);
    } else {
      this.enqueueBlockMergeRollup(provingState, parentLocation);
    }
  }

  private checkAndEnqueueCheckpointRootRollup(provingState: CheckpointProvingState) {
    if (!provingState.isReadyForCheckpointRoot()) {
      return;
    }

    this.enqueueCheckpointRootRollup(provingState);
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
      logger.debug('Not ready for root rollup');
      return;
    }

    this.enqueueRootRollup(provingState);
  }

  /**
   * Executes the VM circuit for a public function, will enqueue the corresponding kernel if the
   * previous kernel is ready
   * @param provingState - The proving state being operated on
   * @param txIndex - The index of the transaction being proven
   */
  private enqueueVM(provingState: BlockProvingState, txIndex: number) {
    if (!provingState.verifyState()) {
      logger.debug(`Not running VM circuit as state is no longer valid`);
      return;
    }

    const txProvingState = provingState.getTxProvingState(txIndex);

    // This function tries to do AVM proving. If there is a failure, it fakes the proof unless AVM_PROVING_STRICT is defined.
    // Nothing downstream depends on the AVM proof yet. So having this mode lets us incrementally build the AVM circuit.
    const doAvmProving = wrapCallbackInSpan(
      this.tracer,
      'ProvingOrchestrator.prover.getAvmProof',
      {
        [Attributes.TX_HASH]: txProvingState.processedTx.hash.toString(),
      },
      async (signal: AbortSignal) => {
        const inputs = txProvingState.getAvmInputs();
        try {
          // TODO(#14234)[Unconditional PIs validation]: Remove the whole try-catch logic and
          // just keep the next line but removing the second argument (false).
          return await this.prover.getAvmProof(inputs, false, signal, provingState.epochNumber);
        } catch (err) {
          if (process.env.AVM_PROVING_STRICT) {
            logger.error(`Error thrown when proving AVM circuit with AVM_PROVING_STRICT on`, err);
            throw err;
          } else {
            logger.warn(
              `Error thrown when proving AVM circuit but AVM_PROVING_STRICT is off. Use snapshotted
               AVM inputs and carrying on. ${inspect(err)}.`,
            );

            try {
              this.metrics.incAvmFallback();
              const snapshotAvmPrivateInputs = readAvmMinimalPublicTxInputsFromFile();
              return await this.prover.getAvmProof(snapshotAvmPrivateInputs, true, signal, provingState.epochNumber);
            } catch (err) {
              logger.error(`Error thrown when proving snapshotted AVM inputs.`, err);
              throw err;
            }
          }
        }
      },
    );

    this.deferredProving(provingState, doAvmProving, proofAndVk => {
      logger.debug(`Proven VM for tx index: ${txIndex}`);
      txProvingState.setAvmProof(proofAndVk);
      this.checkAndEnqueueBaseRollup(provingState, txIndex);
    });
  }

  private checkAndEnqueueBaseRollup(provingState: BlockProvingState, txIndex: number) {
    const txProvingState = provingState.getTxProvingState(txIndex);
    if (!txProvingState.ready()) {
      return;
    }

    // We must have completed all proving (tube proof and (if required) vm proof are generated), we now move to the base rollup.
    logger.debug(`Public functions completed for tx ${txIndex} enqueueing base rollup`);

    this.enqueueBaseRollup(provingState, txIndex);
  }
}
