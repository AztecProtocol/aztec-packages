import {
  L2Block,
  MerkleTreeId,
  type ProcessedTx,
  type ServerCircuitProver,
  type Tx,
  toNumBlobFields,
} from '@aztec/circuit-types';
import {
  type EpochProver,
  type ForkMerkleTreeOperations,
  type MerkleTreeWriteOperations,
  type ProofAndVerificationKey,
} from '@aztec/circuit-types/interfaces';
import { type CircuitName } from '@aztec/circuit-types/stats';
import {
  AVM_PROOF_LENGTH_IN_FIELDS,
  AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  type AppendOnlyTreeSnapshot,
  BaseParityInputs,
  type BlockHeader,
  Fr,
  GlobalVariables,
  L1_TO_L2_MSG_SUBTREE_HEIGHT,
  L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  type TUBE_PROOF_LENGTH,
  VerificationKeyData,
  makeEmptyRecursiveProof,
} from '@aztec/circuits.js';
import {
  type BaseRollupHints,
  EmptyBlockRootRollupInputs,
  PrivateBaseRollupInputs,
  SingleTxBlockRootRollupInputs,
  TubeInputs,
} from '@aztec/circuits.js/rollup';
import { padArrayEnd } from '@aztec/foundation/collection';
import { AbortError } from '@aztec/foundation/error';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { assertLength } from '@aztec/foundation/serialize';
import { pushTestData } from '@aztec/foundation/testing';
import { elapsed } from '@aztec/foundation/timer';
import { type TreeNodeLocation } from '@aztec/foundation/trees';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vks';
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
  buildBaseRollupHints,
  buildHeaderAndBodyFromTxs,
  getRootTreeSiblingPath,
  getSubtreeSiblingPath,
  getTreeSnapshot,
  validatePartialState,
  validateTx,
} from './block-building-helpers.js';
import { type BlockProvingState } from './block-proving-state.js';
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
    private readonly proverId: Fr = Fr.ZERO,
    telemetryClient: TelemetryClient = getTelemetryClient(),
  ) {
    this.metrics = new ProvingOrchestratorMetrics(telemetryClient, 'ProvingOrchestrator');
  }

  get tracer(): Tracer {
    return this.metrics.tracer;
  }

  public getProverId(): Fr {
    return this.proverId;
  }

  public stop(): Promise<void> {
    this.cancel();
    return Promise.resolve();
  }

  public startNewEpoch(epochNumber: number, firstBlockNumber: number, totalNumBlocks: number) {
    const { promise: _promise, resolve, reject } = promiseWithResolvers<ProvingResult>();
    const promise = _promise.catch((reason): ProvingResult => ({ status: 'failure', reason }));
    if (totalNumBlocks <= 0 || !Number.isInteger(totalNumBlocks)) {
      throw new Error(`Invalid number of blocks for epoch (got ${totalNumBlocks})`);
    }
    logger.info(`Starting epoch ${epochNumber} with ${totalNumBlocks} blocks`);
    this.provingState = new EpochProvingState(epochNumber, firstBlockNumber, totalNumBlocks, resolve, reject);
    this.provingPromise = promise;
  }

  /**
   * Starts off a new block
   * @param globalVariables - The global variables for the block
   * @param l1ToL2Messages - The l1 to l2 messages for the block
   * @returns A proving ticket, containing a promise notifying of proving completion
   */
  @trackSpan('ProvingOrchestrator.startNewBlock', globalVariables => ({
    [Attributes.BLOCK_NUMBER]: globalVariables.blockNumber.toNumber(),
  }))
  public async startNewBlock(globalVariables: GlobalVariables, l1ToL2Messages: Fr[], previousBlockHeader: BlockHeader) {
    if (!this.provingState) {
      throw new Error(`Invalid proving state, call startNewEpoch before starting a block`);
    }

    if (!this.provingState?.isAcceptingBlocks()) {
      throw new Error(`Epoch not accepting further blocks`);
    }

    logger.info(
      `Starting block ${globalVariables.blockNumber.toNumber()} for slot ${globalVariables.slotNumber.toNumber()}`,
    );

    // Fork world state at the end of the immediately previous block
    const db = await this.dbProvider.fork(globalVariables.blockNumber.toNumber() - 1);
    this.dbs.set(globalVariables.blockNumber.toNumber(), db);

    // we start the block by enqueueing all of the base parity circuits
    const { l1ToL2MessageSubtreeSiblingPath, l1ToL2MessageTreeSnapshotAfterInsertion, baseParityInputs } =
      await this.prepareBaseParityInputs(l1ToL2Messages, db);

    // Get archive snapshot before this block lands
    const lastArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, db);
    const newArchiveSiblingPath = await getRootTreeSiblingPath(MerkleTreeId.ARCHIVE, db);

    const partial = new PartialStateReference(
      await getTreeSnapshot(MerkleTreeId.NOTE_HASH_TREE, db),
      await getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE, db),
      await getTreeSnapshot(MerkleTreeId.PUBLIC_DATA_TREE, db),
    );
    const state = new StateReference(messageTreeSnapshot, partial);
    // TODO: Construct the full previousBlockHeader.
    const previousBlockHeader = BlockHeader.from({
      lastArchive: startArchiveSnapshot,
      contentCommitment: ContentCommitment.empty(),
      state,
      globalVariables: GlobalVariables.empty(),
      totalFees: Fr.ZERO,
      totalManaUsed: Fr.ZERO,
    });

    const blockProvingState = this.provingState!.startNewBlock(
      globalVariables,
      l1ToL2Messages,
      l1ToL2MessageSubtreeSiblingPath,
      l1ToL2MessageTreeSnapshotAfterInsertion,
      lastArchive,
      newArchiveSiblingPath,
      previousBlockHeader,
    );

    // Enqueue base parity circuits for the block
    for (let i = 0; i < baseParityInputs.length; i++) {
      this.enqueueBaseParityCircuit(blockProvingState, baseParityInputs[i], i);
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
    if (!txs.length) {
      // To avoid an ugly throw below. If we require an empty block, we can just call setBlockCompleted
      // on a block with no txs. We cannot do that here because we cannot find the blockNumber without any txs.
      logger.warn(`Provided no txs to orchestrator addTxs.`);
      return;
    }
    const blockNumber = txs[0].constants.globalVariables.blockNumber.toNumber();
    const provingState = this.provingState?.getBlockProvingStateByBlockNumber(blockNumber!);
    if (!provingState) {
      throw new Error(`Block proving state for ${blockNumber} not found`);
    }

    if (provingState.totalNumTxs) {
      throw new Error(`Block ${blockNumber} has been initialized with transactions.`);
    }

    const numBlobFields = toNumBlobFields(txs);
    provingState.startNewBlock(txs.length, numBlobFields);

    logger.info(
      `Adding ${txs.length} transactions with ${numBlobFields} blob fields to block ${provingState.blockNumber}`,
    );
    for (const tx of txs) {
      try {
        if (!provingState.verifyState()) {
          throw new Error(`Invalid proving state when adding a tx`);
        }

        validateTx(tx);

        logger.info(`Received transaction: ${tx.hash}`);

        const [hints, treeSnapshots] = await this.prepareTransaction(tx, provingState);
        const txProvingState = new TxProvingState(tx, hints, treeSnapshots);
        const txIndex = provingState.addNewTx(txProvingState);
        this.getOrEnqueueTube(provingState, txIndex);
        if (txProvingState.requireAvmProof) {
          logger.debug(`Enqueueing public VM for tx ${txIndex}`);
          this.enqueueVM(provingState, txIndex);
        }
      } catch (err: any) {
        throw new Error(`Error adding transaction ${tx.hash.toString()} to block ${blockNumber}: ${err.message}`, {
          cause: err,
        });
      }
    }
  }

  /**
   * Kickstarts tube circuits for the specified txs. These will be used during epoch proving.
   * Note that if the tube circuits are not started this way, they will be started nontheless after processing.
   */
  @trackSpan('ProvingOrchestrator.startTubeCircuits')
  public startTubeCircuits(txs: Tx[]) {
    if (!this.provingState?.verifyState()) {
      throw new Error(`Invalid proving state, call startNewEpoch before starting tube circuits`);
    }
    for (const tx of txs) {
      const txHash = tx.getTxHash().toString();
      const tubeInputs = new TubeInputs(tx.clientIvcProof);
      const tubeProof = promiseWithResolvers<ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>>();
      logger.debug(`Starting tube circuit for tx ${txHash}`);
      this.doEnqueueTube(txHash, tubeInputs, proof => tubeProof.resolve(proof));
      this.provingState?.cachedTubeProofs.set(txHash, tubeProof.promise);
    }
  }

  /**
   * Marks the block as completed.
   * Computes the block header and updates the archive tree.
   */
  @trackSpan('ProvingOrchestrator.setBlockCompleted', (blockNumber: number) => ({
    [Attributes.BLOCK_NUMBER]: blockNumber,
  }))
  public async setBlockCompleted(blockNumber: number, expectedHeader?: BlockHeader): Promise<L2Block> {
    const provingState = this.provingState?.getBlockProvingStateByBlockNumber(blockNumber);
    if (!provingState) {
      throw new Error(`Block proving state for ${blockNumber} not found`);
    }

    if (!provingState.spongeBlobState) {
      // If we are completing an empty block, initialise the provingState.
      // We will have 0 txs and no blob fields.
      provingState.startNewBlock(0, 0);
    }

    if (!provingState.verifyState()) {
      throw new Error(`Block proving failed: ${provingState.error}`);
    }

    // And build the block header
    logger.verbose(`Block ${blockNumber} completed. Assembling header.`);
    await this.buildBlock(provingState, expectedHeader);

    // If the proofs were faster than the block building, then we need to try the block root rollup again here
    this.checkAndEnqueueBlockRootRollup(provingState);
    return provingState.block!;
  }

  /** Returns the block as built for a given index. */
  public getBlock(index: number): L2Block {
    const block = this.provingState?.blocks[index]?.block;
    if (!block) {
      throw new Error(`Block at index ${index} not available`);
    }
    return block;
  }

  private async buildBlock(provingState: BlockProvingState, expectedHeader?: BlockHeader) {
    // Collect all new nullifiers, commitments, and contracts from all txs in this block to build body
    const txs = provingState.allTxs.map(a => a.processedTx);

    // Get db for this block
    const db = this.dbs.get(provingState.blockNumber)!;

    // Given we've applied every change from this block, now assemble the block header
    // and update the archive tree, so we're ready to start processing the next block
    const { header, body } = await buildHeaderAndBodyFromTxs(
      txs,
      provingState.globalVariables,
      provingState.newL1ToL2Messages,
      db,
    );

    if (expectedHeader && !header.equals(expectedHeader)) {
      logger.error(`Block header mismatch: header=${header} expectedHeader=${expectedHeader}`);
      throw new Error('Block header mismatch');
    }

    logger.verbose(`Updating archive tree with block ${provingState.blockNumber} header ${header.hash().toString()}`);
    await db.updateArchive(header);

    // Assemble the L2 block
    const newArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, db);
    const l2Block = new L2Block(newArchive, header, body);

    await this.verifyBuiltBlockAgainstSyncedState(l2Block, newArchive);

    logger.verbose(`Orchestrator finalised block ${l2Block.number}`);
    provingState.block = l2Block;
  }

  // Flagged as protected to disable in certain unit tests
  protected async verifyBuiltBlockAgainstSyncedState(l2Block: L2Block, newArchive: AppendOnlyTreeSnapshot) {
    const syncedArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, this.dbProvider.getSnapshot(l2Block.number));
    if (!syncedArchive.equals(newArchive)) {
      throw new Error(
        `Archive tree mismatch for block ${l2Block.number}: world state synced to ${inspect(
          syncedArchive,
        )} but built ${inspect(newArchive)}`,
      );
    }
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
  public async finaliseEpoch() {
    if (!this.provingState || !this.provingPromise) {
      throw new Error(`Invalid proving state, an epoch must be proven before it can be finalised`);
    }

    const result = await this.provingPromise!;
    if (result.status === 'failure') {
      throw new Error(`Epoch proving failed: ${result.reason}`);
    }

    const epochProofResult = this.provingState.getEpochProofResult();

    pushTestData('epochProofResult', {
      proof: epochProofResult.proof.toString(),
      publicInputs: epochProofResult.publicInputs.toString(),
    });

    return epochProofResult;
  }

  /**
   * Starts the proving process for the given transaction and adds it to our state
   * @param tx - The transaction whose proving we wish to commence
   * @param provingState - The proving state being worked on
   */
  private async prepareTransaction(tx: ProcessedTx, provingState: BlockProvingState) {
    const txInputs = await this.prepareBaseRollupInputs(provingState, tx);
    if (!txInputs) {
      // This should not be possible
      throw new Error(`Unable to add transaction, preparing base inputs failed`);
    }
    return txInputs;
  }

  /**
   * Enqueue a job to be scheduled
   * @param provingState - The proving state object being operated on
   * @param jobType - The type of job to be queued
   * @param job - The actual job, returns a promise notifying of the job's completion
   */
  private deferredProving<T>(
    provingState: EpochProvingState | BlockProvingState | undefined,
    request: (signal: AbortSignal) => Promise<T>,
    callback: (result: T) => void | Promise<void>,
  ) {
    if (!provingState?.verifyState()) {
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
        if (!provingState?.verifyState()) {
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
    setImmediate(safeJob);
  }

  private async prepareBaseParityInputs(l1ToL2Messages: Fr[], db: MerkleTreeWriteOperations) {
    const l1ToL2MessagesPadded = padArrayEnd(
      l1ToL2Messages,
      Fr.ZERO,
      NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      'Too many L1 to L2 messages',
    );
    const baseParityInputs = Array.from({ length: NUM_BASE_PARITY_PER_ROOT_PARITY }, (_, i) =>
      BaseParityInputs.fromSlice(l1ToL2MessagesPadded, i, getVKTreeRoot()),
    );

    const l1ToL2MessageSubtreeSiblingPath = assertLength(
      await getSubtreeSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, L1_TO_L2_MSG_SUBTREE_HEIGHT, db),
      L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
    );

    // Update the local trees to include the new l1 to l2 messages
    await db.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2MessagesPadded);
    const l1ToL2MessageTreeSnapshotAfterInsertion = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, db);

    return {
      l1ToL2MessageSubtreeSiblingPath,
      l1ToL2MessageTreeSnapshotAfterInsertion,
      baseParityInputs,
    };
  }

  // Updates the merkle trees for a transaction. The first enqueued job for a transaction
  @trackSpan('ProvingOrchestrator.prepareBaseRollupInputs', (_, tx) => ({
    [Attributes.TX_HASH]: tx.hash.toString(),
  }))
  private async prepareBaseRollupInputs(
    provingState: BlockProvingState,
    tx: ProcessedTx,
  ): Promise<[BaseRollupHints, TreeSnapshots] | undefined> {
    if (!provingState.verifyState() || !provingState.spongeBlobState) {
      logger.debug('Not preparing base rollup inputs, state invalid');
      return;
    }

    const db = this.dbs.get(provingState.blockNumber)!;

    // We build the base rollup inputs using a mock proof and verification key.
    // These will be overwritten later once we have proven the tube circuit and any public kernels
    const [ms, hints] = await elapsed(
      buildBaseRollupHints(tx, provingState.globalVariables, db, provingState.spongeBlobState),
    );

    this.metrics.recordBaseRollupInputs(ms);

    const promises = [MerkleTreeId.NOTE_HASH_TREE, MerkleTreeId.NULLIFIER_TREE, MerkleTreeId.PUBLIC_DATA_TREE].map(
      async (id: MerkleTreeId) => {
        return { key: id, value: await getTreeSnapshot(id, db) };
      },
    );
    const treeSnapshots: TreeSnapshots = new Map((await Promise.all(promises)).map(obj => [obj.key, obj.value]));

    if (!provingState.verifyState()) {
      logger.debug(`Discarding proving job, state no longer valid`);
      return;
    }
    return [hints, treeSnapshots];
  }

  // Executes the base rollup circuit and stored the output as intermediate state for the parent merge/root circuit
  // Executes the next level of merge if all inputs are available
  private enqueueBaseRollup(provingState: BlockProvingState, txIndex: number) {
    if (!provingState.verifyState()) {
      logger.debug('Not running base rollup, state invalid');
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
          inputs instanceof PrivateBaseRollupInputs ? 'getPrivateBaseRollupProof' : 'getPublicBaseRollupProof'
        }`,
        {
          [Attributes.TX_HASH]: processedTx.hash.toString(),
          [Attributes.PROTOCOL_CIRCUIT_TYPE]: 'server',
          [Attributes.PROTOCOL_CIRCUIT_NAME]: rollupType,
        },
        signal => {
          if (inputs instanceof PrivateBaseRollupInputs) {
            return this.prover.getPrivateBaseRollupProof(inputs, signal, provingState.epochNumber);
          } else {
            return this.prover.getPublicBaseRollupProof(inputs, signal, provingState.epochNumber);
          }
        },
      ),
      result => {
        logger.debug(`Completed proof for ${rollupType} for tx ${processedTx.hash.toString()}`);
        validatePartialState(result.inputs.end, txProvingState.treeSnapshots);
        const leafLocation = provingState.setBaseRollupProof(txIndex, result);
        if (provingState.totalNumTxs === 1) {
          this.checkAndEnqueueBlockRootRollup(provingState);
        } else {
          this.checkAndEnqueueNextMergeRollup(provingState, leafLocation);
        }
      },
    );
  }

  // Enqueues the tube circuit for a given transaction index, or reuses the one already enqueued
  // Once completed, will enqueue the next circuit, either a public kernel or the base rollup
  private getOrEnqueueTube(provingState: BlockProvingState, txIndex: number) {
    if (!provingState.verifyState()) {
      logger.debug('Not running tube circuit, state invalid');
      return;
    }

    const txProvingState = provingState.getTxProvingState(txIndex);
    const txHash = txProvingState.processedTx.hash.toString();

    const handleResult = (result: ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>) => {
      logger.debug(`Got tube proof for tx index: ${txIndex}`, { txHash });
      txProvingState.setTubeProof(result);
      this.provingState?.cachedTubeProofs.delete(txHash);
      this.checkAndEnqueueNextTxCircuit(provingState, txIndex);
    };

    if (this.provingState?.cachedTubeProofs.has(txHash)) {
      logger.debug(`Tube proof already enqueued for tx index: ${txIndex}`, { txHash });
      void this.provingState!.cachedTubeProofs.get(txHash)!.then(handleResult);
      return;
    }

    logger.debug(`Enqueuing tube circuit for tx index: ${txIndex}`);
    this.doEnqueueTube(txHash, txProvingState.getTubeInputs(), handleResult);
  }

  private doEnqueueTube(
    txHash: string,
    inputs: TubeInputs,
    handler: (result: ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>) => void,
    provingState: EpochProvingState | BlockProvingState = this.provingState!,
  ) {
    if (!provingState?.verifyState()) {
      logger.debug('Not running tube circuit, state invalid');
      return;
    }

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getTubeProof',
        {
          [Attributes.TX_HASH]: txHash,
          [Attributes.PROTOCOL_CIRCUIT_TYPE]: 'server',
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'tube-circuit' satisfies CircuitName,
        },
        signal => this.prover.getTubeProof(inputs, signal, this.provingState!.epochNumber),
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

    const inputs = provingState.getMergeRollupInputs(location);

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getMergeRollupProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_TYPE]: 'server',
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'merge-rollup' satisfies CircuitName,
        },
        signal => this.prover.getMergeRollupProof(inputs, signal, provingState.epochNumber),
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

    provingState.blockRootRollupStarted = true;

    const { rollupType, inputs } = provingState.getBlockRootRollupTypeAndInputs(this.proverId);

    logger.debug(
      `Enqueuing ${rollupType} for block ${provingState.blockNumber} with ${provingState.newL1ToL2Messages.length} l1 to l2 msgs.`,
    );

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getBlockRootRollupProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_TYPE]: 'server',
          [Attributes.PROTOCOL_CIRCUIT_NAME]: rollupType,
        },
        signal => {
          if (inputs instanceof EmptyBlockRootRollupInputs) {
            return this.prover.getEmptyBlockRootRollupProof(inputs, signal, provingState.epochNumber);
          } else if (inputs instanceof SingleTxBlockRootRollupInputs) {
            return this.prover.getSingleTxBlockRootRollupProof(inputs, signal, provingState.epochNumber);
          } else {
            return this.prover.getBlockRootRollupProof(inputs, signal, provingState.epochNumber);
          }
        },
      ),
      result => {
        provingState.setBlockRootRollupProof(result);
        const header = provingState.buildHeaderFromProvingOutputs(logger);
        if (!header.hash().equals(provingState.block!.header.hash())) {
          logger.error(
            `Block header mismatch\nCircuit:${inspect(header)}\nComputed:${inspect(provingState.block!.header)}`,
          );
          provingState.reject(`Block header hash mismatch`);
        }

        logger.debug(`Completed ${rollupType} proof for block ${provingState.block!.number}`);
        // validatePartialState(result.inputs.end, tx.treeSnapshots); // TODO(palla/prover)

        const epochProvingState = this.provingState!;
        const leafLocation = epochProvingState.setBlockRootRollupProof(provingState.index, result);
        if (epochProvingState.totalNumBlocks === 1) {
          this.enqueueEpochPadding(epochProvingState);
        } else {
          this.checkAndEnqueueNextBlockMergeRollup(epochProvingState, leafLocation);
        }
      },
    );
  }

  // Executes the base parity circuit and stores the intermediate state for the root parity circuit
  // Enqueues the root parity circuit if all inputs are available
  private enqueueBaseParityCircuit(provingState: BlockProvingState, inputs: BaseParityInputs, index: number) {
    if (!provingState.verifyState()) {
      logger.debug('Not running base parity. State no longer valid.');
      return;
    }

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getBaseParityProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_TYPE]: 'server',
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'base-parity' satisfies CircuitName,
        },
        signal => this.prover.getBaseParityProof(inputs, signal, provingState.epochNumber),
      ),
      provingOutput => {
        provingState.setBaseParityProof(index, provingOutput);
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

    const inputs = provingState.getRootParityInputs();

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getRootParityProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_TYPE]: 'server',
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'root-parity' satisfies CircuitName,
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
  private enqueueBlockMergeRollup(provingState: EpochProvingState, location: TreeNodeLocation) {
    if (!provingState.verifyState()) {
      logger.debug('Not running block merge rollup. State no longer valid.');
      return;
    }

    const inputs = provingState.getBlockMergeRollupInputs(location);

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getBlockMergeRollupProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_TYPE]: 'server',
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'block-merge-rollup' satisfies CircuitName,
        },
        signal => this.prover.getBlockMergeRollupProof(inputs, signal, provingState.epochNumber),
      ),
      result => {
        provingState.setBlockMergeRollupProof(location, result);
        this.checkAndEnqueueNextBlockMergeRollup(provingState, location);
      },
    );
  }

  private enqueueEpochPadding(provingState: EpochProvingState) {
    if (!provingState.verifyState()) {
      logger.debug('Not running epoch padding. State no longer valid.');
      return;
    }

    logger.debug('Padding epoch proof with an empty block root proof.');

    const inputs = provingState.getPaddingBlockRootInputs(this.proverId);

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getEmptyBlockRootRollupProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_TYPE]: 'server',
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'empty-block-root-rollup' satisfies CircuitName,
        },
        signal => this.prover.getEmptyBlockRootRollupProof(inputs, signal, provingState.epochNumber),
      ),
      result => {
        logger.debug('Completed proof for padding block root.');
        provingState.setPaddingBlockRootProof(result);
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

    const inputs = provingState.getRootRollupInputs(this.proverId);

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getRootRollupProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_TYPE]: 'server',
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'root-rollup' satisfies CircuitName,
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
      logger.debug('Not ready for root rollup');
      return;
    }
    if (provingState.blockRootRollupStarted) {
      logger.debug('Block root rollup already started');
      return;
    }
    const blockNumber = provingState.blockNumber;

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

    this.enqueueBlockRootRollup(provingState);
  }

  private checkAndEnqueueNextBlockMergeRollup(provingState: EpochProvingState, currentLocation: TreeNodeLocation) {
    if (!provingState.isReadyForBlockMerge(currentLocation)) {
      return;
    }

    const parentLocation = provingState.getParentLocation(currentLocation);
    if (parentLocation.level === 0) {
      this.checkAndEnqueueRootRollup(provingState);
    } else {
      this.enqueueBlockMergeRollup(provingState, parentLocation);
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
          return await this.prover.getAvmProof(inputs, signal, provingState.epochNumber);
        } catch (err) {
          if (process.env.AVM_PROVING_STRICT) {
            logger.error(`Error thrown when proving AVM circuit with AVM_PROVING_STRICT on`, err);
            throw err;
          } else {
            logger.warn(
              `Error thrown when proving AVM circuit but AVM_PROVING_STRICT is off. Faking AVM proof and carrying on. ${inspect(
                err,
              )}.`,
            );
            return {
              proof: makeEmptyRecursiveProof(AVM_PROOF_LENGTH_IN_FIELDS),
              verificationKey: VerificationKeyData.makeFake(AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS),
            };
          }
        }
      },
    );

    this.deferredProving(provingState, doAvmProving, proofAndVk => {
      logger.debug(`Proven VM for tx index: ${txIndex}`);
      txProvingState.setAvmProof(proofAndVk);
      this.checkAndEnqueueNextTxCircuit(provingState, txIndex);
    });
  }

  private checkAndEnqueueNextTxCircuit(provingState: BlockProvingState, txIndex: number) {
    const txProvingState = provingState.getTxProvingState(txIndex);
    if (!txProvingState.ready()) {
      return;
    }

    // We must have completed all proving (tube proof and (if required) vm proof are generated), we now move to the base rollup.
    logger.debug(`Public functions completed for tx ${txIndex} enqueueing base rollup`);

    this.enqueueBaseRollup(provingState, txIndex);
  }
}
