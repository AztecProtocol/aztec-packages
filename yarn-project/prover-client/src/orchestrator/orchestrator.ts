import {
  L2Block,
  MerkleTreeId,
  type ProcessedTx,
  type ServerCircuitProver,
  makeEmptyProcessedTx,
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
  BLOBS_PER_BLOCK,
  BaseParityInputs,
  type BlockHeader,
  FIELDS_PER_BLOB,
  Fr,
  type GlobalVariables,
  L1_TO_L2_MSG_SUBTREE_HEIGHT,
  L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  type NESTED_RECURSIVE_PROOF_LENGTH,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  PrivateKernelEmptyInputData,
  type RECURSIVE_PROOF_LENGTH,
  type RecursiveProof,
  RootParityInput,
  RootParityInputs,
  type VerificationKeyAsFields,
  VerificationKeyData,
  makeEmptyRecursiveProof,
} from '@aztec/circuits.js';
import { BlobPublicInputs } from '@aztec/circuits.js/blobs';
import {
  BaseOrMergeRollupPublicInputs,
  BaseRollupHints,
  BlockRootOrBlockMergePublicInputs,
  BlockRootRollupInputs,
  EmptyBlockRootRollupInputs,
} from '@aztec/circuits.js/rollup';
import { makeTuple } from '@aztec/foundation/array';
import { Blob } from '@aztec/foundation/blob';
import { maxBy, padArrayEnd } from '@aztec/foundation/collection';
import { sha256ToField } from '@aztec/foundation/crypto';
import { AbortError } from '@aztec/foundation/error';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { type Tuple } from '@aztec/foundation/serialize';
import { pushTestData } from '@aztec/foundation/testing';
import { elapsed } from '@aztec/foundation/timer';
import { getVKIndex, getVKSiblingPath, getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { Attributes, type TelemetryClient, type Tracer, trackSpan, wrapCallbackInSpan } from '@aztec/telemetry-client';

import { inspect } from 'util';

import {
  buildBaseRollupHints,
  buildHeaderAndBodyFromTxs,
  buildHeaderFromCircuitOutputs,
  createBlockMergeRollupInputs,
  createMergeRollupInputs,
  getPreviousRollupDataFromPublicInputs,
  getRootRollupInput,
  getRootTreeSiblingPath,
  getSubtreeSiblingPath,
  getTreeSnapshot,
  validatePartialState,
  validateTx,
} from './block-building-helpers.js';
import { type BlockProvingState, type MergeRollupInputData } from './block-proving-state.js';
import {
  type BlockMergeRollupInputData,
  EpochProvingState,
  type ProvingResult,
  type TreeSnapshots,
} from './epoch-proving-state.js';
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
  private paddingTxProof?: ProofAndVerificationKey<typeof NESTED_RECURSIVE_PROOF_LENGTH>;

  private provingPromise: Promise<ProvingResult> | undefined = undefined;
  private metrics: ProvingOrchestratorMetrics;
  private dbs: Map<number, MerkleTreeWriteOperations> = new Map();

  constructor(
    private dbProvider: ForkMerkleTreeOperations,
    private prover: ServerCircuitProver,
    telemetryClient: TelemetryClient,
    private readonly proverId: Fr = Fr.ZERO,
  ) {
    this.metrics = new ProvingOrchestratorMetrics(telemetryClient, 'ProvingOrchestrator');
  }

  get tracer(): Tracer {
    return this.metrics.tracer;
  }

  public getProverId(): Fr {
    return this.proverId;
  }

  /**
   * Resets the orchestrator's cached padding tx.
   */
  public reset() {
    this.paddingTxProof = undefined;
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
  public async startNewBlock(globalVariables: GlobalVariables, l1ToL2Messages: Fr[]) {
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
    let baseParityInputs: BaseParityInputs[] = [];
    let l1ToL2MessagesPadded: Tuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>;
    try {
      l1ToL2MessagesPadded = padArrayEnd(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
    } catch (err) {
      throw new Error('Too many L1 to L2 messages');
    }
    baseParityInputs = Array.from({ length: NUM_BASE_PARITY_PER_ROOT_PARITY }, (_, i) =>
      BaseParityInputs.fromSlice(l1ToL2MessagesPadded, i, getVKTreeRoot()),
    );

    const messageTreeSnapshot = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, db);

    const newL1ToL2MessageTreeRootSiblingPathArray = await getSubtreeSiblingPath(
      MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
      L1_TO_L2_MSG_SUBTREE_HEIGHT,
      db,
    );

    const newL1ToL2MessageTreeRootSiblingPath = makeTuple(
      L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
      i =>
        i < newL1ToL2MessageTreeRootSiblingPathArray.length ? newL1ToL2MessageTreeRootSiblingPathArray[i] : Fr.ZERO,
      0,
    );

    // Update the local trees to include the new l1 to l2 messages
    await db.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2MessagesPadded);
    const messageTreeSnapshotAfterInsertion = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, db);

    // Get archive snapshot before this block lands
    const startArchiveSnapshot = await getTreeSnapshot(MerkleTreeId.ARCHIVE, db);
    const newArchiveSiblingPath = await getRootTreeSiblingPath(MerkleTreeId.ARCHIVE, db);
    const previousBlockHash = await db.getLeafValue(
      MerkleTreeId.ARCHIVE,
      BigInt(startArchiveSnapshot.nextAvailableLeafIndex - 1),
    );

    const blockProvingState = this.provingState!.startNewBlock(
      globalVariables,
      l1ToL2MessagesPadded,
      messageTreeSnapshot,
      newL1ToL2MessageTreeRootSiblingPath,
      messageTreeSnapshotAfterInsertion,
      startArchiveSnapshot,
      newArchiveSiblingPath,
      previousBlockHash!,
    );

    // Enqueue base parity circuits for the block
    for (let i = 0; i < baseParityInputs.length; i++) {
      this.enqueueBaseParityCircuit(blockProvingState, baseParityInputs[i], i);
    }
  }

  /**
   * The interface to add simulated transactions to the scheduler
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

    const numBlobFields = toNumBlobFields(txs);
    provingState.startNewBlock(Math.max(2, txs.length), numBlobFields);

    logger.info(
      `Adding ${txs.length} transactions with ${numBlobFields} blob fields to block ${provingState?.blockNumber}`,
    );
    for (const tx of txs) {
      try {
        if (!provingState.verifyState()) {
          throw new Error(`Invalid proving state when adding a tx`);
        }

        validateTx(tx);

        logger.info(`Received transaction: ${tx.hash}`);

        if (tx.isEmpty) {
          logger.warn(`Ignoring empty transaction ${tx.hash} - it will not be added to this block`);
          continue;
        }

        const [hints, treeSnapshots] = await this.prepareTransaction(tx, provingState);
        this.enqueueFirstProofs(hints, treeSnapshots, tx, provingState);
      } catch (err: any) {
        throw new Error(`Error adding transaction ${tx.hash.toString()} to block ${blockNumber}: ${err.message}`, {
          cause: err,
        });
      }
    }
    if (provingState.transactionsReceived === provingState.totalNumTxs) {
      logger.verbose(`All transactions received for block ${provingState.globalVariables.blockNumber}.`);
    }
  }

  /**
   * Marks the block as full and pads it if required, no more transactions will be accepted.
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
      // We will have 2 padding txs, and => no blob fields.
      provingState.startNewBlock(2, 0);
    }

    if (!provingState.verifyState()) {
      throw new Error(`Block proving failed: ${provingState.error}`);
    }

    // We may need to pad the rollup with empty transactions
    const paddingTxCount = provingState.totalNumTxs - provingState.transactionsReceived;
    if (paddingTxCount > 0 && provingState.totalNumTxs > 2) {
      throw new Error(`Block not ready for completion: expecting ${paddingTxCount} more transactions.`);
    }

    if (paddingTxCount > 0) {
      logger.debug(`Padding rollup with ${paddingTxCount} empty transactions`);
      // Make an empty padding transaction
      // Required for:
      // 0 (when we want an empty block, largely for testing), or
      // 1 (we need to pad with one tx as all rollup circuits require a pair of inputs) txs
      // Insert it into the tree the required number of times to get all of the
      // base rollup inputs
      // Then enqueue the proving of all the transactions
      const unprovenPaddingTx = makeEmptyProcessedTx(
        this.dbs.get(blockNumber)!.getInitialHeader(),
        provingState.globalVariables.chainId,
        provingState.globalVariables.version,
        getVKTreeRoot(),
        protocolContractTreeRoot,
      );
      const txInputs: Array<{ hints: BaseRollupHints; snapshot: TreeSnapshots }> = [];
      for (let i = 0; i < paddingTxCount; i++) {
        const [hints, snapshot] = await this.prepareTransaction(unprovenPaddingTx, provingState);
        const txInput = {
          hints,
          snapshot,
        };
        txInputs.push(txInput);
      }

      // Now enqueue the proving
      this.enqueuePaddingTxs(provingState, txInputs, unprovenPaddingTx);
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

  @trackSpan('ProvingOrchestrator.padEpoch', function () {
    if (!this.provingState) {
      return {};
    }
    return {
      [Attributes.EPOCH_NUMBER]: this.provingState.epochNumber,
      [Attributes.EPOCH_SIZE]: this.provingState.totalNumBlocks,
    };
  })
  private padEpoch(): Promise<void> {
    const provingState = this.provingState!;
    const lastBlock = maxBy(
      provingState.blocks.filter(b => !!b),
      b => b!.blockNumber,
    )?.block;
    if (!lastBlock) {
      return Promise.reject(new Error(`Epoch needs at least one completed block in order to be padded`));
    }

    const paddingBlockCount = Math.max(2, provingState.totalNumBlocks) - provingState.blocks.length;
    if (paddingBlockCount === 0) {
      return Promise.resolve();
    }

    logger.debug(`Padding epoch proof with ${paddingBlockCount} empty block proofs`);

    const inputs = EmptyBlockRootRollupInputs.from({
      archive: lastBlock.archive,
      blockHash: lastBlock.header.hash(),
      globalVariables: lastBlock.header.globalVariables,
      vkTreeRoot: getVKTreeRoot(),
      protocolContractTreeRoot,
      proverId: this.proverId,
    });

    logger.debug(`Enqueuing deferred proving for padding block to enqueue ${paddingBlockCount} paddings`);
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
        logger.debug(`Completed proof for padding block`);
        const currentLevel = provingState.numMergeLevels + 1n;
        for (let i = 0; i < paddingBlockCount; i++) {
          logger.debug(`Enqueuing padding block with index ${provingState.blocks.length + i}`);
          const index = BigInt(provingState.blocks.length + i);
          this.storeAndExecuteNextBlockMergeLevel(provingState, currentLevel, index, [
            result.inputs,
            result.proof,
            result.verificationKey.keyAsFields,
          ]);
        }
      },
    );
    return Promise.resolve();
  }

  private async buildBlock(provingState: BlockProvingState, expectedHeader?: BlockHeader) {
    // Collect all new nullifiers, commitments, and contracts from all txs in this block to build body
    const txs = provingState!.allTxs.map(a => a.processedTx);

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

  // Enqueues the proving of the required padding transactions
  // If the fully proven padding transaction is not available, this will first be proven
  private enqueuePaddingTxs(
    provingState: BlockProvingState,
    txInputs: Array<{ hints: BaseRollupHints; snapshot: TreeSnapshots }>,
    paddingTx: ProcessedTx,
  ) {
    if (this.paddingTxProof) {
      // We already have the padding transaction
      logger.debug(`Enqueuing ${txInputs.length} padding transactions using existing padding tx`);
      this.provePaddingTransactions(txInputs, paddingTx, this.paddingTxProof, provingState);
      return;
    }
    logger.debug(`Enqueuing deferred proving for padding txs to enqueue ${txInputs.length} paddings`);
    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getEmptyPrivateKernelProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_TYPE]: 'server',
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'private-kernel-empty' satisfies CircuitName,
        },
        signal =>
          this.prover.getEmptyPrivateKernelProof(
            new PrivateKernelEmptyInputData(
              paddingTx.constants.historicalHeader,
              // Chain id and version should not change even if the proving state does, so it's safe to use them for the padding tx
              // which gets cached across multiple runs of the orchestrator with different proving states. If they were to change,
              // we'd have to clear out the paddingTx here and regenerate it when they do.
              paddingTx.constants.txContext.chainId,
              paddingTx.constants.txContext.version,
              paddingTx.constants.vkTreeRoot,
              paddingTx.constants.protocolContractTreeRoot,
            ),
            signal,
            provingState.epochNumber,
          ),
      ),
      result => {
        logger.debug(`Completed proof for padding tx, now enqueuing ${txInputs.length} padding txs`);
        this.paddingTxProof = { proof: result.proof, verificationKey: result.verificationKey };
        this.provePaddingTransactions(txInputs, paddingTx, this.paddingTxProof, provingState);
      },
    );
  }

  /**
   * Prepares the cached sets of base rollup inputs for padding transactions and proves them
   * @param txInputs - The base rollup inputs, start and end hash paths etc
   * @param paddingTx - The padding tx, contains the header and public inputs used in the proof
   * @param proofAndVk - The proof and vk of the paddingTx.
   * @param provingState - The block proving state
   */
  private provePaddingTransactions(
    txInputs: Array<{ hints: BaseRollupHints; snapshot: TreeSnapshots }>,
    paddingTx: ProcessedTx,
    proofAndVk: ProofAndVerificationKey<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
    provingState: BlockProvingState,
  ) {
    // The padding tx contains the proof and vk, generated separately from the base inputs
    // Copy these into the base rollup inputs and enqueue the base rollup proof
    for (let i = 0; i < txInputs.length; i++) {
      const { hints, snapshot } = txInputs[i];
      const txProvingState = new TxProvingState(paddingTx, hints, snapshot);
      txProvingState.assignTubeProof(proofAndVk);
      const txIndex = provingState.addNewTx(txProvingState);
      this.enqueueBaseRollup(provingState, txIndex);
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
   * Extract the block header from public inputs.
   * @returns The header of this proving state's block.
   */
  private extractBlockHeaderFromPublicInputs(
    provingState: BlockProvingState,
    rootRollupOutputs: BlockRootOrBlockMergePublicInputs,
  ) {
    const previousMergeData = provingState.getMergeInputs(0).inputs;

    if (!previousMergeData[0] || !previousMergeData[1]) {
      throw new Error(`Invalid proving state, final merge inputs before block root circuit missing.`);
    }

    return buildHeaderFromCircuitOutputs(
      [previousMergeData[0], previousMergeData[1]],
      provingState.finalRootParityInput!.publicInputs,
      rootRollupOutputs,
      provingState.messageTreeSnapshotAfterInsertion,
      logger,
    );
  }

  /**
   * Collect all new nullifiers, commitments, and contracts from all txs in a block
   * @returns The array of non empty tx effects.
   */
  private extractTxEffects(provingState: BlockProvingState) {
    // Note: this check should ensure that we have all txs and their effects ready.
    if (!provingState.finalRootParityInput?.publicInputs.shaRoot) {
      throw new Error(`Invalid proving state, a block must be ready to be proven before its effects can be extracted.`);
    }
    const nonEmptyTxEffects = provingState.allTxs
      .map(txProvingState => txProvingState.processedTx.txEffect)
      .filter(txEffect => !txEffect.isEmpty());

    return nonEmptyTxEffects;
  }

  /**
   * Returns the proof for the current epoch.
   */
  public async finaliseEpoch() {
    if (!this.provingState || !this.provingPromise) {
      throw new Error(`Invalid proving state, an epoch must be proven before it can be finalised`);
    }

    await this.padEpoch();

    const result = await this.provingPromise!;
    if (result.status === 'failure') {
      throw new Error(`Epoch proving failed: ${result.reason}`);
    }

    if (!this.provingState.rootRollupPublicInputs || !this.provingState.finalProof) {
      throw new Error(`Invalid proving state, missing root rollup public inputs or final proof`);
    }

    pushTestData('epochProofResult', {
      proof: this.provingState.finalProof.toString(),
      publicInputs: this.provingState.rootRollupPublicInputs.toString(),
    });

    return { proof: this.provingState.finalProof, publicInputs: this.provingState.rootRollupPublicInputs };
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

  private enqueueFirstProofs(
    hints: BaseRollupHints,
    treeSnapshots: TreeSnapshots,
    tx: ProcessedTx,
    provingState: BlockProvingState,
  ) {
    const txProvingState = new TxProvingState(tx, hints, treeSnapshots);
    const txIndex = provingState.addNewTx(txProvingState);
    this.enqueueTube(provingState, txIndex);
    if (txProvingState.requireAvmProof) {
      logger.debug(`Enqueueing public VM for tx ${txIndex}`);
      this.enqueueVM(provingState, txIndex);
    }
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

  // Updates the merkle trees for a transaction. The first enqueued job for a transaction
  @trackSpan('ProvingOrchestrator.prepareBaseRollupInputs', (_, tx) => ({
    [Attributes.TX_HASH]: tx.hash.toString(),
  }))
  private async prepareBaseRollupInputs(
    provingState: BlockProvingState | undefined,
    tx: ProcessedTx,
  ): Promise<[BaseRollupHints, TreeSnapshots] | undefined> {
    if (!provingState?.verifyState() || !provingState.spongeBlobState) {
      logger.debug('Not preparing base rollup inputs, state invalid');
      return;
    }

    const db = this.dbs.get(provingState.blockNumber)!;

    // We build the base rollup inputs using a mock proof and verification key.
    // These will be overwritten later once we have proven the tube circuit and any public kernels
    const [ms, hints] = await elapsed(
      buildBaseRollupHints(tx, provingState.globalVariables, db, provingState.spongeBlobState),
    );

    if (!tx.isEmpty) {
      this.metrics.recordBaseRollupInputs(ms);
    }

    const promises = [MerkleTreeId.NOTE_HASH_TREE, MerkleTreeId.NULLIFIER_TREE, MerkleTreeId.PUBLIC_DATA_TREE].map(
      async (id: MerkleTreeId) => {
        return { key: id, value: await getTreeSnapshot(id, db) };
      },
    );
    const treeSnapshots: TreeSnapshots = new Map((await Promise.all(promises)).map(obj => [obj.key, obj.value]));

    if (!provingState?.verifyState()) {
      logger.debug(`Discarding proving job, state no longer valid`);
      return;
    }
    return [hints, treeSnapshots];
  }

  // Executes the base rollup circuit and stored the output as intermediate state for the parent merge/root circuit
  // Executes the next level of merge if all inputs are available
  private enqueueBaseRollup(provingState: BlockProvingState | undefined, txIndex: number) {
    if (!provingState?.verifyState()) {
      logger.debug('Not running base rollup, state invalid');
      return;
    }

    const txProvingState = provingState.getTxProvingState(txIndex);
    const { processedTx } = txProvingState;
    const rollupType = txProvingState.requireAvmProof ? 'public-base-rollup' : 'private-base-rollup';

    logger.debug(
      `Enqueuing deferred proving base rollup${
        processedTx.isEmpty ? ' with padding tx' : ''
      } for ${processedTx.hash.toString()}`,
    );

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        `ProvingOrchestrator.prover.${
          rollupType === 'private-base-rollup' ? 'getPrivateBaseRollupProof' : 'getPublicBaseRollupProof'
        }`,
        {
          [Attributes.TX_HASH]: processedTx.hash.toString(),
          [Attributes.PROTOCOL_CIRCUIT_TYPE]: 'server',
          [Attributes.PROTOCOL_CIRCUIT_NAME]: rollupType satisfies CircuitName,
        },
        signal => {
          if (rollupType === 'private-base-rollup') {
            const inputs = txProvingState.getPrivateBaseInputs();
            return this.prover.getPrivateBaseRollupProof(inputs, signal, provingState.epochNumber);
          } else {
            const inputs = txProvingState.getPublicBaseInputs();
            return this.prover.getPublicBaseRollupProof(inputs, signal, provingState.epochNumber);
          }
        },
      ),
      result => {
        logger.debug(`Completed proof for ${rollupType} for tx ${processedTx.hash.toString()}`);
        validatePartialState(result.inputs.end, txProvingState.treeSnapshots);
        const currentLevel = provingState.numMergeLevels + 1n;
        this.storeAndExecuteNextMergeLevel(provingState, currentLevel, BigInt(txIndex), [
          result.inputs,
          result.proof,
          result.verificationKey.keyAsFields,
        ]);
      },
    );
  }

  // Enqueues the tube circuit for a given transaction index
  // Once completed, will enqueue the next circuit, either a public kernel or the base rollup
  private enqueueTube(provingState: BlockProvingState, txIndex: number) {
    if (!provingState?.verifyState()) {
      logger.debug('Not running tube circuit, state invalid');
      return;
    }

    const txProvingState = provingState.getTxProvingState(txIndex);
    logger.debug(`Enqueuing tube circuit for tx index: ${txIndex}`);

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getTubeProof',
        {
          [Attributes.TX_HASH]: txProvingState.processedTx.hash.toString(),
          [Attributes.PROTOCOL_CIRCUIT_TYPE]: 'server',
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'tube-circuit' satisfies CircuitName,
        },
        signal => {
          const inputs = txProvingState.getTubeInputs();
          return this.prover.getTubeProof(inputs, signal, provingState.epochNumber);
        },
      ),
      result => {
        logger.debug(`Completed tube proof for tx index: ${txIndex}`);
        txProvingState.assignTubeProof(result);
        this.checkAndEnqueueNextTxCircuit(provingState, txIndex);
      },
    );
  }

  // Executes the merge rollup circuit and stored the output as intermediate state for the parent merge/block root circuit
  // Enqueues the next level of merge if all inputs are available
  private enqueueMergeRollup(
    provingState: BlockProvingState,
    level: bigint,
    index: bigint,
    mergeInputData: MergeRollupInputData,
  ) {
    const inputs = createMergeRollupInputs(
      [mergeInputData.inputs[0]!, mergeInputData.proofs[0]!, mergeInputData.verificationKeys[0]!],
      [mergeInputData.inputs[1]!, mergeInputData.proofs[1]!, mergeInputData.verificationKeys[1]!],
    );

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
        this.storeAndExecuteNextMergeLevel(provingState, level, index, [
          result.inputs,
          result.proof,
          result.verificationKey.keyAsFields,
        ]);
      },
    );
  }

  // Executes the block root rollup circuit
  private enqueueBlockRootRollup(provingState: BlockProvingState) {
    if (!provingState.block) {
      throw new Error(`Invalid proving state for block root rollup, block not available`);
    }

    if (!provingState.verifyState()) {
      logger.debug('Not running block root rollup, state no longer valid');
      return;
    }

    provingState.blockRootRollupStarted = true;
    const mergeInputData = provingState.getMergeInputs(0);
    const rootParityInput = provingState.finalRootParityInput!;
    const blobFields = this.extractTxEffects(provingState)
      .map(tx => tx.toBlobFields())
      .flat();
    const blobs = Blob.getBlobs(blobFields);
    const blobsHash = sha256ToField(blobs.map(b => b.getEthVersionedBlobHash()));

    logger.debug(
      `Enqueuing block root rollup for block ${provingState.blockNumber} with ${provingState.newL1ToL2Messages.length} l1 to l2 msgs and ${blobs.length} blobs.`,
    );

    const previousRollupData: BlockRootRollupInputs['previousRollupData'] = makeTuple(2, i =>
      getPreviousRollupDataFromPublicInputs(
        mergeInputData.inputs[i]!,
        mergeInputData.proofs[i]!,
        mergeInputData.verificationKeys[i]!,
      ),
    );

    const inputs = BlockRootRollupInputs.from({
      previousRollupData,
      l1ToL2Roots: rootParityInput,
      newL1ToL2Messages: provingState.newL1ToL2Messages,
      newL1ToL2MessageTreeRootSiblingPath: provingState.messageTreeRootSiblingPath,
      startL1ToL2MessageTreeSnapshot: provingState.messageTreeSnapshot,
      startArchiveSnapshot: provingState.archiveTreeSnapshot,
      newArchiveSiblingPath: provingState.archiveTreeRootSiblingPath,
      previousBlockHash: provingState.previousBlockHash,
      proverId: this.proverId,
      blobFields: padArrayEnd(blobFields, Fr.ZERO, FIELDS_PER_BLOB * BLOBS_PER_BLOCK),
      blobCommitments: padArrayEnd(
        blobs.map(b => b.commitmentToFields()),
        [Fr.ZERO, Fr.ZERO],
        BLOBS_PER_BLOCK,
      ),
      blobsHash: blobsHash,
    });

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getBlockRootRollupProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_TYPE]: 'server',
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'block-root-rollup' satisfies CircuitName,
        },
        signal => this.prover.getBlockRootRollupProof(inputs, signal, provingState.epochNumber),
      ),
      result => {
        const header = this.extractBlockHeaderFromPublicInputs(provingState, result.inputs);
        if (!header.hash().equals(provingState.block!.header.hash())) {
          logger.error(
            `Block header mismatch\nCircuit:${inspect(header)}\nComputed:${inspect(provingState.block!.header)}`,
          );
          provingState.reject(`Block header hash mismatch`);
        }

        provingState.blockRootRollupPublicInputs = result.inputs;
        provingState.finalProof = result.proof.binaryProof;
        const blobOutputs = result.inputs.blobPublicInputs[0];
        blobOutputs.inner.forEach((blobOutput, i) => {
          if (!blobOutput.isEmpty() && !blobOutput.equals(BlobPublicInputs.fromBlob(blobs[i]))) {
            throw new Error(
              `Rollup circuits produced mismatched blob evaluation:
              z: ${blobOutput.z} == ${blobs[i].challengeZ},
              y: ${blobOutput.y.toString(16)} == ${blobs[i].evaluationY.toString('hex')},
              C: ${blobOutput.kzgCommitment} == ${blobs[i].commitmentToFields()}`,
            );
          }
        });

        logger.debug(`Completed proof for block root rollup for ${provingState.block?.number}`);
        // validatePartialState(result.inputs.end, tx.treeSnapshots); // TODO(palla/prover)

        const currentLevel = this.provingState!.numMergeLevels + 1n;
        this.storeAndExecuteNextBlockMergeLevel(this.provingState!, currentLevel, BigInt(provingState.index), [
          result.inputs,
          result.proof,
          result.verificationKey.keyAsFields,
        ]);
      },
    );
  }

  // Executes the base parity circuit and stores the intermediate state for the root parity circuit
  // Enqueues the root parity circuit if all inputs are available
  private enqueueBaseParityCircuit(provingState: BlockProvingState, inputs: BaseParityInputs, index: number) {
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
        const rootParityInput = new RootParityInput(
          provingOutput.proof,
          provingOutput.verificationKey.keyAsFields,
          getVKSiblingPath(getVKIndex(provingOutput.verificationKey)),
          provingOutput.inputs,
        );
        provingState.setRootParityInputs(rootParityInput, index);
        if (provingState.areRootParityInputsReady()) {
          const rootParityInputs = new RootParityInputs(
            provingState.rootParityInput as Tuple<
              RootParityInput<typeof RECURSIVE_PROOF_LENGTH>,
              typeof NUM_BASE_PARITY_PER_ROOT_PARITY
            >,
          );
          this.enqueueRootParityCircuit(provingState, rootParityInputs);
        }
      },
    );
  }

  // Runs the root parity circuit ans stored the outputs
  // Enqueues the root rollup proof if all inputs are available
  private enqueueRootParityCircuit(provingState: BlockProvingState, inputs: RootParityInputs) {
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
      provingOutput => {
        const rootParityInput = new RootParityInput(
          provingOutput.proof,
          provingOutput.verificationKey.keyAsFields,
          getVKSiblingPath(getVKIndex(provingOutput.verificationKey)),
          provingOutput.inputs,
        );
        provingState!.finalRootParityInput = rootParityInput;
        this.checkAndEnqueueBlockRootRollup(provingState);
      },
    );
  }

  // Executes the block merge rollup circuit and stored the output as intermediate state for the parent merge/block root circuit
  // Enqueues the next level of merge if all inputs are available
  private enqueueBlockMergeRollup(
    provingState: EpochProvingState,
    level: bigint,
    index: bigint,
    mergeInputData: BlockMergeRollupInputData,
  ) {
    const inputs = createBlockMergeRollupInputs(
      [mergeInputData.inputs[0]!, mergeInputData.proofs[0]!, mergeInputData.verificationKeys[0]!],
      [mergeInputData.inputs[1]!, mergeInputData.proofs[1]!, mergeInputData.verificationKeys[1]!],
    );

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
        this.storeAndExecuteNextBlockMergeLevel(provingState, level, index, [
          result.inputs,
          result.proof,
          result.verificationKey.keyAsFields,
        ]);
      },
    );
  }

  // Executes the root rollup circuit
  private enqueueRootRollup(provingState: EpochProvingState | undefined) {
    if (!provingState?.verifyState()) {
      logger.debug('Not running root rollup, state no longer valid');
      return;
    }

    logger.debug(`Preparing root rollup`);
    const mergeInputData = provingState.getMergeInputs(0);

    const inputs = getRootRollupInput(
      mergeInputData.inputs[0]!,
      mergeInputData.proofs[0]!,
      mergeInputData.verificationKeys[0]!,
      mergeInputData.inputs[1]!,
      mergeInputData.proofs[1]!,
      mergeInputData.verificationKeys[1]!,
      this.proverId,
    );

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
        provingState.rootRollupPublicInputs = result.inputs;
        provingState.finalProof = result.proof.binaryProof;
        provingState.resolve({ status: 'success' });
      },
    );
  }

  private checkAndEnqueueBlockRootRollup(provingState: BlockProvingState) {
    if (!provingState?.isReadyForBlockRootRollup()) {
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

  private checkAndEnqueueRootRollup(provingState: EpochProvingState | undefined) {
    if (!provingState?.isReadyForRootRollup()) {
      logger.debug('Not ready for root rollup');
      return;
    }
    this.enqueueRootRollup(provingState);
  }

  /**
   * Stores the inputs to a merge/root circuit and enqueues the circuit if ready
   * @param provingState - The proving state being operated on
   * @param currentLevel - The level of the merge/root circuit
   * @param currentIndex - The index of the merge/root circuit
   * @param mergeInputData - The inputs to be stored
   */
  private storeAndExecuteNextMergeLevel(
    provingState: BlockProvingState,
    currentLevel: bigint,
    currentIndex: bigint,
    mergeInputData: [
      BaseOrMergeRollupPublicInputs,
      RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
      VerificationKeyAsFields,
    ],
  ) {
    const [mergeLevel, indexWithinMergeLevel, indexWithinMerge] = provingState.findMergeLevel(
      currentLevel,
      currentIndex,
    );
    const mergeIndex = 2n ** mergeLevel - 1n + indexWithinMergeLevel;
    const ready = provingState.storeMergeInputs(mergeInputData, Number(indexWithinMerge), Number(mergeIndex));
    const nextMergeInputData = provingState.getMergeInputs(Number(mergeIndex));

    // Are we ready to execute the next circuit?
    if (!ready) {
      return;
    }

    if (mergeLevel === 0n) {
      this.checkAndEnqueueBlockRootRollup(provingState);
    } else {
      // onto the next merge level
      this.enqueueMergeRollup(provingState, mergeLevel, indexWithinMergeLevel, nextMergeInputData);
    }
  }

  /**
   * Stores the inputs to a block merge/root circuit and enqueues the circuit if ready
   * @param provingState - The proving state being operated on
   * @param currentLevel - The level of the merge/root circuit
   * @param currentIndex - The index of the merge/root circuit
   * @param mergeInputData - The inputs to be stored
   */
  private storeAndExecuteNextBlockMergeLevel(
    provingState: EpochProvingState,
    currentLevel: bigint,
    currentIndex: bigint,
    mergeInputData: [
      BlockRootOrBlockMergePublicInputs,
      RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
      VerificationKeyAsFields,
    ],
  ) {
    const [mergeLevel, indexWithinMergeLevel, indexWithinMerge] = provingState.findMergeLevel(
      currentLevel,
      currentIndex,
    );
    logger.debug(`Computed merge for ${currentLevel}.${currentIndex} as ${mergeLevel}.${indexWithinMergeLevel}`);
    if (mergeLevel < 0n) {
      throw new Error(`Invalid merge level ${mergeLevel}`);
    }

    const mergeIndex = 2n ** mergeLevel - 1n + indexWithinMergeLevel;
    const ready = provingState.storeMergeInputs(mergeInputData, Number(indexWithinMerge), Number(mergeIndex));
    const nextMergeInputData = provingState.getMergeInputs(Number(mergeIndex));

    // Are we ready to execute the next circuit?
    if (!ready) {
      logger.debug(`Not ready to execute next block merge for level ${mergeLevel} index ${indexWithinMergeLevel}`);
      return;
    }

    if (mergeLevel === 0n) {
      this.checkAndEnqueueRootRollup(provingState);
    } else {
      // onto the next merge level
      this.enqueueBlockMergeRollup(provingState, mergeLevel, indexWithinMergeLevel, nextMergeInputData);
    }
  }

  /**
   * Executes the VM circuit for a public function, will enqueue the corresponding kernel if the
   * previous kernel is ready
   * @param provingState - The proving state being operated on
   * @param txIndex - The index of the transaction being proven
   */
  private enqueueVM(provingState: BlockProvingState | undefined, txIndex: number) {
    if (!provingState?.verifyState()) {
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
      txProvingState.assignAvmProof(proofAndVk);
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
