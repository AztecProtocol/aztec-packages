import {
  Body,
  EncryptedNoteTxL2Logs,
  EncryptedTxL2Logs,
  L2Block,
  MerkleTreeId,
  type PaddingProcessedTx,
  type ProcessedTx,
  ProvingRequestType,
  type PublicInputsAndRecursiveProof,
  type ServerCircuitProver,
  type TxEffect,
  UnencryptedTxL2Logs,
  makeEmptyProcessedTx,
  makePaddingProcessedTx,
  mapProvingRequestTypeToCircuitName,
  toTxEffect,
} from '@aztec/circuit-types';
import { type EpochProver } from '@aztec/circuit-types/interfaces';
import { type CircuitName } from '@aztec/circuit-types/stats';
import {
  AvmCircuitInputs,
  type BaseOrMergeRollupPublicInputs,
  BaseParityInputs,
  type BaseRollupInputs,
  type BlockRootOrBlockMergePublicInputs,
  BlockRootRollupInputs,
  EmptyBlockRootRollupInputs,
  Fr,
  type GlobalVariables,
  type KernelCircuitPublicInputs,
  L1_TO_L2_MSG_SUBTREE_HEIGHT,
  L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  PrivateKernelEmptyInputData,
  type Proof,
  type PublicKernelCircuitPublicInputs,
  type RECURSIVE_PROOF_LENGTH,
  type RecursiveProof,
  type RootParityInput,
  RootParityInputs,
  type TUBE_PROOF_LENGTH,
  TubeInputs,
  type VMCircuitPublicInputs,
  type VerificationKeyAsFields,
  VerificationKeyData,
  makeEmptyProof,
  makeEmptyRecursiveProof,
} from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { padArrayEnd } from '@aztec/foundation/collection';
import { AbortError } from '@aztec/foundation/error';
import { createDebugLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { type Tuple } from '@aztec/foundation/serialize';
import { pushTestData } from '@aztec/foundation/testing';
import { elapsed } from '@aztec/foundation/timer';
import { getVKIndex, getVKSiblingPath, getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { Attributes, type TelemetryClient, type Tracer, trackSpan, wrapCallbackInSpan } from '@aztec/telemetry-client';
import { type MerkleTreeOperations } from '@aztec/world-state';

import { inspect } from 'util';

import {
  buildBaseRollupInput,
  buildHeaderFromCircuitOutputs,
  buildHeaderFromTxEffects,
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
import { TX_PROVING_CODE, type TxProvingInstruction, TxProvingState } from './tx-proving-state.js';

const logger = createDebugLogger('aztec:prover:proving-orchestrator');

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
  private paddingTx: PaddingProcessedTx | undefined = undefined;

  private provingPromise: Promise<ProvingResult> | undefined = undefined;
  private metrics: ProvingOrchestratorMetrics;

  constructor(
    private db: MerkleTreeOperations,
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
    this.paddingTx = undefined;
  }

  public startNewEpoch(epochNumber: number, totalNumBlocks: number) {
    const { promise: _promise, resolve, reject } = promiseWithResolvers<ProvingResult>();
    const promise = _promise.catch((reason): ProvingResult => ({ status: 'failure', reason }));
    if (totalNumBlocks <= 0 || !Number.isInteger(totalNumBlocks)) {
      throw new Error(`Invalid number of blocks for epoch (got ${totalNumBlocks})`);
    }
    logger.info(`Starting epoch ${epochNumber} with ${totalNumBlocks} blocks`);
    this.provingState = new EpochProvingState(epochNumber, totalNumBlocks, resolve, reject);
    this.provingPromise = promise;
  }

  /**
   * Starts off a new block
   * @param numTxs - The total number of transactions in the block.
   * @param globalVariables - The global variables for the block
   * @param l1ToL2Messages - The l1 to l2 messages for the block
   * @param verificationKeys - The private kernel verification keys
   * @returns A proving ticket, containing a promise notifying of proving completion
   */
  @trackSpan('ProvingOrchestrator.startNewBlock', (numTxs, globalVariables) => ({
    [Attributes.BLOCK_SIZE]: numTxs,
    [Attributes.BLOCK_NUMBER]: globalVariables.blockNumber.toNumber(),
  }))
  public async startNewBlock(numTxs: number, globalVariables: GlobalVariables, l1ToL2Messages: Fr[]) {
    if (!this.provingState) {
      throw new Error(`Invalid proving state, call startNewEpoch before starting a block`);
    }

    if (!this.provingState?.isAcceptingBlocks()) {
      throw new Error(`Epoch not accepting further blocks`);
    }

    if (!Number.isInteger(numTxs) || numTxs < 2) {
      throw new Error(`Invalid number of txs for block (got ${numTxs})`);
    }

    if (this.provingState.currentBlock && !this.provingState.currentBlock.block) {
      throw new Error(`Must end previous block before starting a new one`);
    }

    // TODO(palla/prover): Store block number in the db itself to make this check more reliable,
    // and turn this warning into an exception that we throw.
    const { blockNumber } = globalVariables;
    const dbBlockNumber = (await this.db.getTreeInfo(MerkleTreeId.ARCHIVE)).size - 1n;
    if (dbBlockNumber !== blockNumber.toBigInt() - 1n) {
      logger.warn(
        `Database is at wrong block number (starting block ${blockNumber.toBigInt()} with db at ${dbBlockNumber})`,
      );
    }

    logger.info(
      `Starting block ${globalVariables.blockNumber} for slot ${globalVariables.slotNumber} with ${numTxs} transactions`,
    );

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

    const messageTreeSnapshot = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, this.db);

    const newL1ToL2MessageTreeRootSiblingPathArray = await getSubtreeSiblingPath(
      MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
      L1_TO_L2_MSG_SUBTREE_HEIGHT,
      this.db,
    );

    const newL1ToL2MessageTreeRootSiblingPath = makeTuple(
      L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
      i =>
        i < newL1ToL2MessageTreeRootSiblingPathArray.length ? newL1ToL2MessageTreeRootSiblingPathArray[i] : Fr.ZERO,
      0,
    );

    // Update the local trees to include the new l1 to l2 messages
    await this.db.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2MessagesPadded);
    const messageTreeSnapshotAfterInsertion = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, this.db);

    // Get archive snapshot before this block lands
    const startArchiveSnapshot = await getTreeSnapshot(MerkleTreeId.ARCHIVE, this.db);
    const newArchiveSiblingPath = await getRootTreeSiblingPath(MerkleTreeId.ARCHIVE, this.db);
    const previousBlockHash = await this.db.getLeafValue(
      MerkleTreeId.ARCHIVE,
      BigInt(startArchiveSnapshot.nextAvailableLeafIndex - 1),
    );

    this.provingState!.startNewBlock(
      numTxs,
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
      this.enqueueBaseParityCircuit(this.provingState!.currentBlock!, baseParityInputs[i], i);
    }
  }

  /**
   * The interface to add a simulated transaction to the scheduler
   * @param tx - The transaction to be proven
   */
  @trackSpan('ProvingOrchestrator.addNewTx', tx => ({
    [Attributes.TX_HASH]: tx.hash.toString(),
  }))
  public async addNewTx(tx: ProcessedTx): Promise<void> {
    const provingState = this?.provingState?.currentBlock;
    if (!provingState) {
      throw new Error(`Invalid proving state, call startNewBlock before adding transactions`);
    }

    if (!provingState.isAcceptingTransactions()) {
      throw new Error(`Rollup not accepting further transactions`);
    }

    if (!provingState.verifyState()) {
      throw new Error(`Invalid proving state when adding a tx`);
    }

    validateTx(tx);

    logger.info(`Received transaction: ${tx.hash}`);

    if (tx.isEmpty) {
      logger.warn(`Ignoring empty transaction ${tx.hash} - it will not be added to this block`);
      return;
    }

    const [inputs, treeSnapshots] = await this.prepareTransaction(tx, provingState);
    this.enqueueFirstProofs(inputs, treeSnapshots, tx, provingState);

    if (provingState.transactionsReceived === provingState.totalNumTxs) {
      logger.verbose(`All transactions received for block ${provingState.globalVariables.blockNumber}.`);
    }
  }

  /**
   * Marks the block as full and pads it if required, no more transactions will be accepted.
   * Computes the block header and updates the archive tree.
   */
  @trackSpan('ProvingOrchestrator.setBlockCompleted', function () {
    const block = this.provingState?.currentBlock;
    if (!block) {
      return {};
    }
    return {
      [Attributes.BLOCK_NUMBER]: block.globalVariables.blockNumber.toNumber(),
      [Attributes.BLOCK_SIZE]: block.totalNumTxs,
      [Attributes.BLOCK_TXS_COUNT]: block.transactionsReceived,
    };
  })
  public async setBlockCompleted(): Promise<L2Block> {
    const provingState = this.provingState?.currentBlock;
    if (!provingState) {
      throw new Error(`Invalid proving state, call startNewBlock before adding transactions or completing the block`);
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
        this.db.getInitialHeader(),
        provingState.globalVariables.chainId,
        provingState.globalVariables.version,
        getVKTreeRoot(),
      );
      const txInputs: Array<{ inputs: BaseRollupInputs; snapshot: TreeSnapshots }> = [];
      for (let i = 0; i < paddingTxCount; i++) {
        const [inputs, snapshot] = await this.prepareTransaction(unprovenPaddingTx, provingState);
        const txInput = {
          inputs,
          snapshot,
        };
        txInputs.push(txInput);
      }

      // Now enqueue the proving
      this.enqueuePaddingTxs(provingState, txInputs, unprovenPaddingTx);
    }

    // And build the block header
    logger.verbose(`Block ${provingState.globalVariables.blockNumber} completed. Assembling header.`);
    await this.buildBlock(provingState);

    return provingState.block!;
  }

  /** Returns the block as built for a given index. */
  public getBlock(index: number): L2Block {
    const block = this.provingState?.blocks[index].block;
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
  private padEpoch() {
    const provingState = this.provingState!;
    const lastBlock = provingState.currentBlock?.block;
    if (!lastBlock) {
      throw new Error(`Epoch needs at least one completed block in order to be padded`);
    }

    const paddingBlockCount = Math.max(2, provingState.totalNumBlocks) - provingState.blocks.length;
    if (paddingBlockCount === 0) {
      return;
    }

    logger.debug(`Padding epoch proof with ${paddingBlockCount} empty block proofs`);

    const inputs = EmptyBlockRootRollupInputs.from({
      archive: lastBlock.archive,
      blockHash: lastBlock.header.hash(),
      globalVariables: lastBlock.header.globalVariables,
      vkTreeRoot: getVKTreeRoot(),
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
  }

  private async buildBlock(provingState: BlockProvingState) {
    // Collect all new nullifiers, commitments, and contracts from all txs in this block to build body
    const gasFees = provingState.globalVariables.gasFees;
    const nonEmptyTxEffects: TxEffect[] = provingState!.allTxs
      .map(txProvingState => toTxEffect(txProvingState.processedTx, gasFees))
      .filter(txEffect => !txEffect.isEmpty());
    const body = new Body(nonEmptyTxEffects);

    // Given we've applied every change from this block, now assemble the block header
    // and update the archive tree, so we're ready to start processing the next block
    const header = await buildHeaderFromTxEffects(
      body,
      provingState.globalVariables,
      provingState.newL1ToL2Messages,
      this.db,
    );

    logger.verbose(`Updating archive tree with block ${provingState.blockNumber} header ${header.hash().toString()}`);
    await this.db.updateArchive(header);

    // Assemble the L2 block
    const newArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, this.db);
    const l2Block = new L2Block(newArchive, header, body);

    if (!l2Block.body.getTxsEffectsHash().equals(header.contentCommitment.txsEffectsHash)) {
      throw new Error(
        `Txs effects hash mismatch, ${l2Block.body
          .getTxsEffectsHash()
          .toString('hex')} == ${header.contentCommitment.txsEffectsHash.toString('hex')} `,
      );
    }

    logger.verbose(`Orchestrator finalised block ${l2Block.number}`);
    provingState.block = l2Block;
  }

  // Enqueues the proving of the required padding transactions
  // If the fully proven padding transaction is not available, this will first be proven
  private enqueuePaddingTxs(
    provingState: BlockProvingState,
    txInputs: Array<{ inputs: BaseRollupInputs; snapshot: TreeSnapshots }>,
    unprovenPaddingTx: ProcessedTx,
  ) {
    if (this.paddingTx) {
      // We already have the padding transaction
      logger.debug(`Enqueuing ${txInputs.length} padding transactions using existing padding tx`);
      this.provePaddingTransactions(txInputs, this.paddingTx, provingState);
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
              unprovenPaddingTx.data.constants.historicalHeader,
              // Chain id and version should not change even if the proving state does, so it's safe to use them for the padding tx
              // which gets cached across multiple runs of the orchestrator with different proving states. If they were to change,
              // we'd have to clear out the paddingTx here and regenerate it when they do.
              unprovenPaddingTx.data.constants.txContext.chainId,
              unprovenPaddingTx.data.constants.txContext.version,
              getVKTreeRoot(),
            ),
            signal,
            provingState.epochNumber,
          ),
      ),
      result => {
        logger.debug(`Completed proof for padding tx, now enqueuing ${txInputs.length} padding txs`);
        this.paddingTx = makePaddingProcessedTx(result);
        this.provePaddingTransactions(txInputs, this.paddingTx, provingState);
      },
    );
  }

  /**
   * Prepares the cached sets of base rollup inputs for padding transactions and proves them
   * @param txInputs - The base rollup inputs, start and end hash paths etc
   * @param paddingTx - The padding tx, contains the header, proof, vk, public inputs used in the proof
   * @param provingState - The block proving state
   */
  private provePaddingTransactions(
    txInputs: Array<{ inputs: BaseRollupInputs; snapshot: TreeSnapshots }>,
    paddingTx: PaddingProcessedTx,
    provingState: BlockProvingState,
  ) {
    // The padding tx contains the proof and vk, generated separately from the base inputs
    // Copy these into the base rollup inputs and enqueue the base rollup proof
    for (let i = 0; i < txInputs.length; i++) {
      txInputs[i].inputs.kernelData.vk = paddingTx.verificationKey;
      txInputs[i].inputs.kernelData.proof = paddingTx.recursiveProof;

      txInputs[i].inputs.kernelData.vkIndex = getVKIndex(paddingTx.verificationKey);
      txInputs[i].inputs.kernelData.vkPath = getVKSiblingPath(txInputs[i].inputs.kernelData.vkIndex);
      const txProvingState = new TxProvingState(paddingTx, txInputs[i].inputs, txInputs[i].snapshot);
      const txIndex = provingState.addNewTx(txProvingState);
      this.enqueueBaseRollup(provingState, BigInt(txIndex), txProvingState);
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
   * Returns the proof for the current epoch.
   */
  public async finaliseEpoch() {
    if (!this.provingState || !this.provingPromise) {
      throw new Error(`Invalid proving state, an epoch must be proven before it can be finalised`);
    }

    this.padEpoch();

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
    inputs: BaseRollupInputs,
    treeSnapshots: TreeSnapshots,
    tx: ProcessedTx,
    provingState: BlockProvingState,
  ) {
    const txProvingState = new TxProvingState(tx, inputs, treeSnapshots);
    const txIndex = provingState.addNewTx(txProvingState);
    this.enqueueTube(provingState, txIndex);
    const numPublicKernels = txProvingState.getNumPublicKernels();
    // Enqueue all of the VM proving requests
    // Rather than handle the Kernel Tail as a special case here, we will just handle it inside enqueueVM
    for (let i = 0; i < numPublicKernels; i++) {
      logger.debug(`Enqueueing public VM ${i} for tx ${txIndex}`);
      this.enqueueVM(provingState, txIndex, i);
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
  ): Promise<[BaseRollupInputs, TreeSnapshots] | undefined> {
    if (!provingState?.verifyState()) {
      logger.debug('Not preparing base rollup inputs, state invalid');
      return;
    }

    // We build the base rollup inputs using a mock proof and verification key.
    // These will be overwritten later once we have proven the tube circuit and any public kernels
    const [ms, inputs] = await elapsed(
      buildBaseRollupInput(
        tx,
        makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
        provingState.globalVariables,
        this.db,
        VerificationKeyData.makeFake(),
      ),
    );

    if (!tx.isEmpty) {
      this.metrics.recordBaseRollupInputs(ms);
    }

    const promises = [MerkleTreeId.NOTE_HASH_TREE, MerkleTreeId.NULLIFIER_TREE, MerkleTreeId.PUBLIC_DATA_TREE].map(
      async (id: MerkleTreeId) => {
        return { key: id, value: await getTreeSnapshot(id, this.db) };
      },
    );
    const treeSnapshots: TreeSnapshots = new Map((await Promise.all(promises)).map(obj => [obj.key, obj.value]));

    if (!provingState?.verifyState()) {
      logger.debug(`Discarding proving job, state no longer valid`);
      return;
    }
    return [inputs, treeSnapshots];
  }

  // Executes the base rollup circuit and stored the output as intermediate state for the parent merge/root circuit
  // Executes the next level of merge if all inputs are available
  private enqueueBaseRollup(provingState: BlockProvingState | undefined, index: bigint, tx: TxProvingState) {
    if (!provingState?.verifyState()) {
      logger.debug('Not running base rollup, state invalid');
      return;
    }
    const txNoteEncryptedLogs = EncryptedNoteTxL2Logs.hashNoteLogs(
      tx.baseRollupInputs.kernelData.publicInputs.end.noteEncryptedLogsHashes
        .filter(log => !log.isEmpty())
        .map(log => log.value.toBuffer()),
    );
    if (!txNoteEncryptedLogs.equals(tx.processedTx.noteEncryptedLogs.hash())) {
      provingState.reject(
        `Note encrypted logs hash mismatch: ${Fr.fromBuffer(txNoteEncryptedLogs)} === ${Fr.fromBuffer(
          tx.processedTx.noteEncryptedLogs.hash(),
        )}`,
      );
      return;
    }
    const txEncryptedLogs = EncryptedTxL2Logs.hashSiloedLogs(
      tx.baseRollupInputs.kernelData.publicInputs.end.encryptedLogsHashes
        .filter(log => !log.isEmpty())
        .map(log => log.getSiloedHash()),
    );
    if (!txEncryptedLogs.equals(tx.processedTx.encryptedLogs.hash())) {
      // @todo This rejection messages is never seen. Never making it out to the logs
      provingState.reject(
        `Encrypted logs hash mismatch: ${Fr.fromBuffer(txEncryptedLogs)} === ${Fr.fromBuffer(
          tx.processedTx.encryptedLogs.hash(),
        )}`,
      );
      return;
    }

    const txUnencryptedLogs = UnencryptedTxL2Logs.hashSiloedLogs(
      tx.baseRollupInputs.kernelData.publicInputs.end.unencryptedLogsHashes
        .filter(log => !log.isEmpty())
        .map(log => log.getSiloedHash()),
    );
    if (!txUnencryptedLogs.equals(tx.processedTx.unencryptedLogs.hash())) {
      provingState.reject(
        `Unencrypted logs hash mismatch: ${Fr.fromBuffer(txUnencryptedLogs)} === ${Fr.fromBuffer(
          tx.processedTx.unencryptedLogs.hash(),
        )}`,
      );
      return;
    }

    logger.debug(
      `Enqueuing deferred proving base rollup${
        tx.processedTx.isEmpty ? ' with padding tx' : ''
      } for ${tx.processedTx.hash.toString()}`,
    );

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getBaseRollupProof',
        {
          [Attributes.TX_HASH]: tx.processedTx.hash.toString(),
          [Attributes.PROTOCOL_CIRCUIT_TYPE]: 'server',
          [Attributes.PROTOCOL_CIRCUIT_NAME]: 'base-rollup' satisfies CircuitName,
        },
        signal => this.prover.getBaseRollupProof(tx.baseRollupInputs, signal, provingState.epochNumber),
      ),
      result => {
        logger.debug(`Completed proof for base rollup for tx ${tx.processedTx.hash.toString()}`);
        validatePartialState(result.inputs.end, tx.treeSnapshots);
        const currentLevel = provingState.numMergeLevels + 1n;
        this.storeAndExecuteNextMergeLevel(provingState, currentLevel, index, [
          result.inputs,
          result.proof,
          result.verificationKey.keyAsFields,
        ]);
      },
    );
  }

  // Enqueues the tub circuit for a given transaction index
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
        signal =>
          this.prover.getTubeProof(
            new TubeInputs(txProvingState.processedTx.clientIvcProof),
            signal,
            provingState.epochNumber,
          ),
      ),
      result => {
        logger.debug(`Completed tube proof for tx index: ${txIndex}`);
        const nextKernelRequest = txProvingState.getNextPublicKernelFromTubeProof(result.tubeProof, result.tubeVK);
        this.checkAndEnqueueNextTxCircuit(provingState, txIndex, result.tubeProof, result.tubeVK, nextKernelRequest);
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
  private enqueueBlockRootRollup(provingState: BlockProvingState | undefined) {
    if (!provingState?.verifyState()) {
      logger.debug('Not running block root rollup, state no longer valid');
      return;
    }
    const mergeInputData = provingState.getMergeInputs(0);
    const rootParityInput = provingState.finalRootParityInput!;

    logger.debug(
      `Enqueuing block root rollup for block ${provingState.blockNumber} with ${provingState.newL1ToL2Messages.length} l1 to l2 msgs`,
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
      rootInput => {
        provingState.setRootParityInputs(rootInput, index);
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
      rootInput => {
        provingState!.finalRootParityInput = rootInput;
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

  private checkAndEnqueueBlockRootRollup(provingState: BlockProvingState | undefined) {
    if (!provingState?.isReadyForBlockRootRollup()) {
      logger.debug('Not ready for root rollup');
      return;
    }
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
   * @param functionIndex - The index of the function/kernel being proven
   */
  private enqueueVM(provingState: BlockProvingState | undefined, txIndex: number, functionIndex: number) {
    if (!provingState?.verifyState()) {
      logger.debug(`Not running VM circuit as state is no longer valid`);
      return;
    }

    const txProvingState = provingState.getTxProvingState(txIndex);
    const publicFunction = txProvingState.getPublicFunctionState(functionIndex);

    // If there is a VM request, we need to prove it. Otherwise, continue with the kernel.
    if (publicFunction.vmRequest) {
      // This function tries to do AVM proving. If there is a failure, it fakes the proof unless AVM_PROVING_STRICT is defined.
      // Nothing downstream depends on the AVM proof yet. So having this mode lets us incrementally build the AVM circuit.
      const doAvmProving = wrapCallbackInSpan(
        this.tracer,
        'ProvingOrchestrator.prover.getAvmProof',
        {
          [Attributes.TX_HASH]: txProvingState.processedTx.hash.toString(),
          [Attributes.APP_CIRCUIT_NAME]: publicFunction.vmRequest!.functionName,
        },
        async (signal: AbortSignal) => {
          const inputs: AvmCircuitInputs = new AvmCircuitInputs(
            publicFunction.vmRequest!.functionName,
            publicFunction.vmRequest!.calldata,
            publicFunction.vmRequest!.kernelRequest.inputs.publicCall.callStackItem.publicInputs,
            publicFunction.vmRequest!.avmHints,
          );
          try {
            return await this.prover.getAvmProof(inputs, signal, provingState.epochNumber);
          } catch (err) {
            if (process.env.AVM_PROVING_STRICT) {
              throw err;
            } else {
              logger.warn(
                `Error thrown when proving AVM circuit, but AVM_PROVING_STRICT is off, so faking AVM proof and carrying on. Error: ${err}.`,
              );
              return { proof: makeEmptyProof(), verificationKey: VerificationKeyData.makeFake() };
            }
          }
        },
      );
      this.deferredProving(provingState, doAvmProving, proofAndVk => {
        logger.debug(`Proven VM for function index ${functionIndex} of tx index ${txIndex}`);
        this.checkAndEnqueuePublicKernelFromVMProof(provingState, txIndex, functionIndex, proofAndVk.proof);
      });
    }
  }

  private checkAndEnqueuePublicKernelFromVMProof(
    provingState: BlockProvingState,
    txIndex: number,
    functionIndex: number,
    vmProof: Proof,
  ) {
    const txProvingState = provingState.getTxProvingState(txIndex);
    const kernelRequest = txProvingState.getNextPublicKernelFromVMProof(functionIndex, vmProof);
    if (kernelRequest.code === TX_PROVING_CODE.READY) {
      if (kernelRequest.function === undefined) {
        // Should not be possible
        throw new Error(`Error occurred, public function request undefined after VM proof completed`);
      }
      logger.debug(`Enqueuing kernel from VM for tx ${txIndex}, function ${functionIndex}`);
      this.enqueuePublicKernel(provingState, txIndex, functionIndex);
    }
  }

  // Takes a proof and verification key, passes it to the proving state before enqueueing the next proof
  // This could be either a public kernel or the base rollup
  // Alternatively, if we are still waiting on a public VM prof then it will continue waiting
  private checkAndEnqueueNextTxCircuit(
    provingState: BlockProvingState,
    txIndex: number,
    proof: RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH> | RecursiveProof<typeof TUBE_PROOF_LENGTH>,
    verificationKey: VerificationKeyData,
    nextKernelRequest: TxProvingInstruction,
  ) {
    const txProvingState = provingState.getTxProvingState(txIndex);
    // What's the status of the next kernel?
    if (nextKernelRequest.code === TX_PROVING_CODE.NOT_READY) {
      // Must be waiting on a VM proof
      return;
    }

    if (nextKernelRequest.code === TX_PROVING_CODE.COMPLETED) {
      // We must have completed all public function proving, we now move to the base rollup
      logger.debug(`Public functions completed for tx ${txIndex} enqueueing base rollup`);
      // Take the final proof and assign it to the base rollup inputs
      txProvingState.baseRollupInputs.kernelData.proof = proof;
      txProvingState.baseRollupInputs.kernelData.vk = verificationKey;
      txProvingState.baseRollupInputs.kernelData.vkIndex = getVKIndex(verificationKey);
      txProvingState.baseRollupInputs.kernelData.vkPath = getVKSiblingPath(
        txProvingState.baseRollupInputs.kernelData.vkIndex,
      );

      this.enqueueBaseRollup(provingState, BigInt(txIndex), txProvingState);
      return;
    }
    // There must be another kernel ready to be proven
    if (nextKernelRequest.function === undefined) {
      // Should not be possible
      throw new Error(`Error occurred, public function request undefined after kernel proof completed`);
    }

    this.enqueuePublicKernel(provingState, txIndex, nextKernelRequest.functionIndex!);
  }

  /**
   * Executes the kernel circuit for a public function, will enqueue the next kernel circuit if it's VM is already proven
   * or the base rollup circuit if there are no more kernels to be proven
   * @param provingState - The proving state being operated on
   * @param txIndex - The index of the transaction being proven
   * @param functionIndex - The index of the function/kernel being proven
   */
  private enqueuePublicKernel(provingState: BlockProvingState | undefined, txIndex: number, functionIndex: number) {
    if (!provingState?.verifyState()) {
      logger.debug(`Not running public kernel circuit as state is no longer valid`);
      return;
    }

    const txProvingState = provingState.getTxProvingState(txIndex);
    const request = txProvingState.getPublicFunctionState(functionIndex).publicKernelRequest;

    this.deferredProving(
      provingState,
      wrapCallbackInSpan(
        this.tracer,
        request.type === ProvingRequestType.PUBLIC_KERNEL_TAIL
          ? 'ProvingOrchestrator.prover.getPublicTailProof'
          : request.type === ProvingRequestType.PUBLIC_KERNEL_MERGE
          ? 'ProvingOrchestrator.prover.getPublicKernelMergeProof'
          : 'ProvingOrchestrator.prover.getPublicKernelInnerProof',
        {
          [Attributes.PROTOCOL_CIRCUIT_TYPE]: 'server',
          [Attributes.PROTOCOL_CIRCUIT_NAME]: mapProvingRequestTypeToCircuitName(request.type),
        },
        (
          signal,
        ): Promise<
          PublicInputsAndRecursiveProof<
            KernelCircuitPublicInputs | PublicKernelCircuitPublicInputs | VMCircuitPublicInputs
          >
        > => {
          if (request.type === ProvingRequestType.PUBLIC_KERNEL_TAIL) {
            return this.prover.getPublicTailProof(request.inputs, signal, provingState.epochNumber);
          } else if (request.type === ProvingRequestType.PUBLIC_KERNEL_MERGE) {
            return this.prover.getPublicKernelMergeProof(request.inputs, signal, provingState.epochNumber);
          } else {
            return this.prover.getPublicKernelInnerProof(request.inputs, signal, provingState.epochNumber);
          }
        },
      ),
      result => {
        const nextKernelRequest = txProvingState.getNextPublicKernelFromKernelProof(
          functionIndex,
          result.proof,
          result.verificationKey,
        );
        this.checkAndEnqueueNextTxCircuit(
          provingState,
          txIndex,
          result.proof,
          result.verificationKey,
          nextKernelRequest,
        );
      },
    );
  }
}
