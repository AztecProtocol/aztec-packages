import {
  Body,
  L2Block,
  MerkleTreeId,
  type ProcessedTx,
  type PublicInputsAndRecursiveProof,
  type TxEffect,
} from '@aztec/circuit-types';
import {
  type BlockRootOrBlockMergePublicInputs,
  ContentCommitment,
  Fr,
  type GlobalVariables,
  Header,
  StateReference,
} from '@aztec/circuits.js';
import { sha256Trunc } from '@aztec/foundation/crypto';
import { memoize } from '@aztec/foundation/decorators';
import { type LogData, createDebugLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';

import { getTreeSnapshot, validateBlockRootOutput } from '../orchestrator/block-building-helpers.js';
import { BlockRootCircuit } from './circuits/block-root.js';
import { MergeRollupCircuit } from './circuits/merge-rollup.js';
import { ParityOrchestrator } from './parity-orchestrator.js';
import { TxOrchestrator } from './tx-orchestrator.js';
import { type OrchestratorContext } from './types.js';
import { getMergeLocation } from './utils.js';

/**
 * Orchestrates the simulation and proving of a single block.
 */
export class BlockOrchestrator {
  private readonly txs: TxOrchestrator[] = [];
  private readonly merges: MergeRollupCircuit[] = [];

  private parity?: ParityOrchestrator;
  private body?: Body;

  private readonly simulationPromise = promiseWithResolvers<BlockRootOrBlockMergePublicInputs>();
  private readonly blockPromise = promiseWithResolvers<L2Block>();
  private readonly proofPromise =
    promiseWithResolvers<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>>();

  private readonly logger = createDebugLogger('aztec:prover-client:block-orchestrator');
  private readonly logdata: LogData;

  constructor(
    /** Index of the block within the epoch (zero-based) */
    public readonly index: number,
    private readonly numTxs: number,
    private readonly globalVariables: GlobalVariables,
    private readonly l1ToL2Messages: Fr[],
    private readonly context: OrchestratorContext,
  ) {
    this.handleError = this.handleError.bind(this);
    this.logdata = { blockNumber: globalVariables.blockNumber.toNumber() };
  }

  /** Whether this orchestrator is configured to only simulate the block and not run any proving. */
  public get isSimulationOnly() {
    return this.context.options.simulationOnly;
  }

  /**
   * Starts the current block.
   * Updates world-state with new L1 to L2 messages.
   * Asynchronously begins simulation and proving of all parity circuits.
   */
  public async start() {
    this.logger.verbose(`Starting block with ${this.numTxs} expected txs`, this.logdata);

    // Take snapshot of archive tree as block starts
    await this.getBlockRoot().makeArchiveSnapshot();
    // Initialize parity circuits
    const parity = new ParityOrchestrator(this.l1ToL2Messages, this.context);
    this.parity = parity;
    // Block until world-state is updated
    const state = await parity.updateState();
    this.logger.verbose(`Updated L1-to-L2 tree with ${this.l1ToL2Messages.length} messages`, this.logdata);
    // Pass the root parity output to root circuit
    this.getBlockRoot().setRootParityState(state);
    // Start simulation and proving
    this.startParity(parity);
  }

  /**
   * Adds a new transaction to the block.
   * Updates world-state with the effects of the transaction.
   * Asynchronously begins proving of all the transaction circuits (Tube, AVM, Public Kernel, Base Rollup).
   * @param processedTx - The processed transaction to add.
   */
  public async addTx(processedTx: ProcessedTx): Promise<void> {
    this.logger.verbose(`Adding tx to block`, { ...this.logdata, txHash: processedTx.hash.toString() });

    const index = this.txs.length;
    const txOrchestrator = new TxOrchestrator(processedTx, this.globalVariables, index, this.context);
    this.txs.push(txOrchestrator);

    // Block until world-state is updated
    await txOrchestrator.updateState();
    this.logger.verbose(`Updated trees with tx effects`, { ...this.logdata, txHash: processedTx.hash.toString() });

    // Start simulation and proving
    this.startWork(txOrchestrator);
  }

  /**
   * Flags the current block as ended and pads it with empty transactions if needed.
   * We only need to pad the block if it has zero or one transactions.
   * Blocks until padding txs are added, and starts proving them.
   * @remarks Pending implementation
   */
  @memoize
  public endBlock(): Promise<void> {
    this.logger.verbose(`Marking block as completed`, this.logdata);

    // TODO: Create padding txs and await them
    const nonEmptyTxEffects: TxEffect[] = this.txs.map(tx => tx.getTxEffect()).filter(txEffect => !txEffect.isEmpty());
    const body = new Body(nonEmptyTxEffects);
    this.body = body;

    return Promise.resolve();
  }

  /**
   * Computes the block and updates world-state archive with its header.
   * Flags block as ended if has not been already.
   * Requires all simulation tasks to have been completed, blocks until they are.
   */
  @memoize
  public async updateState(): Promise<void> {
    await this.endBlock();
    this.logger.debug(`Awaiting block to be built to update state`, this.logdata);
    const block = await this.getBlock();
    await this.context.db.updateArchive(block.header);
    this.logger.verbose(`Updated archive tree with block header`, {
      ...this.logdata,
      blockHash: block.header.hash().toString(),
    });

    const rootOutput = await this.getBlockRoot().simulate();
    await validateBlockRootOutput(rootOutput, block.header, this.context.db);
  }

  /**
   * Returns the full L2 block computed by this orchestrator.
   * Requires all simulation tasks to have been completed.
   * @returns The full L2 block.
   */
  public getBlock(): Promise<L2Block> {
    return this.blockPromise.promise;
  }

  /**
   * Returns the simulation output of the block root circuit.
   */
  public simulate(): Promise<BlockRootOrBlockMergePublicInputs> {
    return this.simulationPromise.promise;
  }

  /**
   * Returns the proof for the block root circuit.
   */
  public prove(): Promise<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>> {
    if (this.isSimulationOnly) {
      throw new Error(`Cannot prove block in simulation-only mode`);
    }
    return this.proofPromise.promise;
  }

  /** Start simulation and proving of the parity orchestrator, and wire its outputs to the block root circuit. */
  private startParity(parity: ParityOrchestrator) {
    void parity
      .simulate()
      .then(simulation => this.getBlockRoot().setRootParitySimulation(simulation))
      .catch(this.handleError);

    if (!this.isSimulationOnly) {
      void parity
        .prove()
        .then(proof => this.getBlockRoot().setRootParityProof(proof))
        .catch(this.handleError);
    }
  }

  /**
   * Starts simulation and proving of the given tx orchestrator or merge circuit,
   * and wires its outputs to the next merge circuit (which may be the block root circuit).
   */
  private startWork(source: TxOrchestrator | MergeRollupCircuit) {
    const { index } = source;

    // Merge level, or maxlevels + 1 if it's a tx
    const mergeLevelCount = Math.ceil(Math.log2(this.numTxs)) - 1;
    const level = 'level' in source ? source.level : mergeLevelCount + 1;

    void source
      .simulate()
      .then(simulation => this.getParentMerge(level, index).setNestedSimulation(simulation, index % 2))
      .catch(this.handleError);

    if (!this.isSimulationOnly) {
      void source
        .prove()
        .then(proof => this.getParentMerge(level, index).setNestedProof(proof, index % 2))
        .catch(this.handleError);
    }
  }

  /**
   * Returns or creates the parent merge circuit for the given node in the proving tree.
   * If the returned node is the root, returns the block root circuit.
   */
  private getParentMerge(level: number, index: number): MergeRollupCircuit | BlockRootCircuit {
    this.logger.debug(`Requesting parent merge`, { ...this.logdata, level, index });
    const location = getMergeLocation({ level, index, total: this.numTxs });
    if (location.level === 0) {
      this.logger.debug(`Returning root`, { ...this.logdata, ...location });
      return this.getBlockRoot();
    }

    if (!this.merges[location.indexWithinTree]) {
      this.logger.debug(`Creating new merge at `, { ...this.logdata, ...location });
      const merge = new MergeRollupCircuit(location.level, location.indexWithinLevel, this.context);
      this.startWork(merge);
      this.merges[location.indexWithinTree] = merge;
    } else {
      this.logger.debug(`Returning existing merge at `, { ...this.logdata, ...location });
    }

    return this.merges[location.indexWithinTree];
  }

  /**
   * Initializes the block root circuit and starts its simulation and proving.
   * Note that simulation and proving won't actually start until its nested circuits are ready.
   * @returns The block root circuit for this block.
   */
  @memoize
  private getBlockRoot() {
    this.logger.debug(`Creating new block-root circuit`, this.logdata);
    const blockRoot = new BlockRootCircuit(this.globalVariables.blockNumber.toNumber(), this.context);

    void blockRoot
      .simulate()
      .then(output => {
        this.simulationPromise.resolve(output);
        return this.makeBlock(output);
      })
      .then(block => this.blockPromise.resolve(block))
      .catch(this.handleError);

    if (!this.isSimulationOnly) {
      void blockRoot
        .prove()
        .then(proof => {
          this.proofPromise.resolve(proof);
        })
        .catch(this.handleError);
    }

    return blockRoot;
  }

  private async makeBlock(blockRootOutputs: BlockRootOrBlockMergePublicInputs): Promise<L2Block> {
    const archive = blockRootOutputs.newArchive;

    const header = await this.makeHeader(blockRootOutputs);
    if (!header.hash().equals(blockRootOutputs.endBlockHash)) {
      throw new Error(
        `Block header hash mismatch: ${header.hash().toString()} !== ${blockRootOutputs.endBlockHash.toString()}`,
      );
    }

    // Note we may want to save the tx effect separately, so we don't need to rehydrate all tx orchestrators if this block orch goes down
    const nonEmptyTxEffects: TxEffect[] = this.txs.map(tx => tx.getTxEffect()).filter(txEffect => !txEffect.isEmpty());
    const body = new Body(nonEmptyTxEffects);
    if (!body.getTxsEffectsHash().equals(header.contentCommitment.txsEffectsHash)) {
      const bodyTxEffectsHex = body.getTxsEffectsHash().toString('hex');
      const headerTxEffectsHex = header.contentCommitment.txsEffectsHash.toString('hex');
      throw new Error(`Txs effects hash mismatch: ${bodyTxEffectsHex} != ${headerTxEffectsHex}`);
    }

    this.logger.debug(`Assembled L2 block`, { ...this.logdata, blockHash: header.hash().toString() });
    return L2Block.fromFields({ archive, header, body });
  }

  private async makeHeader(blockRootOutputs: BlockRootOrBlockMergePublicInputs) {
    this.logger.debug(`Building block header`, this.logdata);
    const blockRoot = this.getBlockRoot();
    const [leftMerge, rightMerge, rootParity] = await blockRoot.getSimulationInputs();
    this.logger.debug(`Acquired block root inputs`, this.logdata);

    const contentCommitment = new ContentCommitment(
      new Fr(leftMerge.numTxs + rightMerge.numTxs),
      sha256Trunc(Buffer.concat([leftMerge.txsEffectsHash.toBuffer(), rightMerge.txsEffectsHash.toBuffer()])),
      rootParity.shaRoot.toBuffer(),
      sha256Trunc(Buffer.concat([leftMerge.outHash.toBuffer(), rightMerge.outHash.toBuffer()])),
    );
    const state = new StateReference(
      await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, this.context.db),
      rightMerge.end,
    );

    const fees = leftMerge.accumulatedFees.add(rightMerge.accumulatedFees);
    const header = new Header(blockRootOutputs.previousArchive, contentCommitment, state, this.globalVariables, fees);
    this.logger.debug(`Completed block header`, { ...this.logdata, blockHash: header.hash().toString() });
    return header;
  }

  private handleError(err: Error) {
    this.logger.error(`Error in block orchestrator`, err, this.logdata);
    throw new Error('Unimplemented');
    // cancel all outstanding work
    // reject all outstanding promises
    // log loudly
    // this will be repeated across all three orchestrators, maybe refactor into helper?
  }

  static load(_id: string, _context: OrchestratorContext) {
    throw new Error('Unimplemented');
    // const metadata: BlockOrchestratorMetadata = await context.metadataStore.load(id);
    // if (!metadata) {
    //   throw new Error('Block not found');
    // }
    // const { index, numTxs, globalVariables, l1ToL2Messages } = metadata;
    // const orchestrator = new BlockOrchestrator(index, numTxs, globalVariables, l1ToL2Messages, context);
    // if (metadata.status === 'proven') {
    //   const proofKey = id + 'proof'; // need to devise a proper scheme for this
    //   const proof = (await context.payloadStore.load(
    //     proofKey,
    //   )) as unknown as PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>; // deserialize!
    //   if (!proof) {
    //     // fall back to no-proof
    //   }
    //   // orchestrator.handleBlockRootProof(proof); // should also set the block itself..?
    //   return orchestrator; // we're good!
    // }
    // if (metadata.status === 'updated-state' || metadata.status === 'processed-txs') {
    //   // set l2 block body if all txs have been processed
    //   orchestrator.body = metadata.body;
    // }
    // // now, we need to rehydrate the orchestrator with partial proving state
    // // let's start with the merges
    // // what are we loading here? just the ids?
    // const merges = await context.metadataStore.list(id + 'merges'); // again, proper key scheme!
    // // we actually only need the highest full level of merges, can forget about the rest
    // // need to get that from the list of merges given their level and index, or return undefined if none
    // const highestLevel = merges; // getHighestCompleteLevel(merges);
    // if (highestLevel) {
    //   for (const merge of merges) {
    //     const mergeOrch = await MergeRollupProvingJob.load(merge, context);
    //     orchestrator.merges.push(mergeOrch); // set them to the proper index!
    //     // wire them up!
    //   }
    // }
    // // if we don't have a full level of merges, we need to rehydrate the txs
    // const txs = await context.metadataStore.list(id + 'txs');
    // for (const tx of txs) {
    //   const txOrch = await TxOrchestrator.load(tx, context);
    //   orchestrator.txs.push(txOrch); // set them to the proper index!
    //   // wire them up!
    // }
    // return orchestrator;
  }
}
