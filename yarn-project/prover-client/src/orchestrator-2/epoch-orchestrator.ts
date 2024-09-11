import { type ProcessedTx, type PublicInputsAndRecursiveProof } from '@aztec/circuit-types';
import { type Fr, type GlobalVariables, type RootRollupPublicInputs } from '@aztec/circuits.js';
import { memoize } from '@aztec/foundation/decorators';
import { createDebugLogger } from '@aztec/foundation/log';

import { BlockOrchestrator } from './block-orchestrator.js';
import { BlockMergeCircuit } from './circuits/block-merge.js';
import { RootRollupCircuit } from './circuits/root-rollup.js';
import { type OrchestratorContext } from './types.js';
import { getMergeLocation } from './utils.js';

/**
 * Orchestrates the proving of an epoch (ie many consecutive blocks).
 */
export class EpochOrchestrator {
  private readonly blocks: BlockOrchestrator[] = [];
  private readonly merges: BlockMergeCircuit[] = [];

  private readonly logger = createDebugLogger('aztec:prover-client:epoch-orchestrator');

  constructor(public readonly numBlocks: number, private readonly context: OrchestratorContext) {
    if (this.context.options.simulationOnly) {
      throw new Error('Simulation only mode not intended for epoch orchestrator');
    }
    this.handleError = this.handleError.bind(this);
  }

  /**
   * Adds a new block to the epoch. Updates world-state with L1 to L2 messages and starts proving its parity circuits.
   * @param numTxs - The number of transactions in the block.
   * @param globalVariables - The global variables for the block.
   * @param l1ToL2Messages - The L1 to L2 messages for the block.
   */
  public async addBlock(numTxs: number, globalVariables: GlobalVariables, l1ToL2Messages: Fr[]) {
    // Creates new block orchestrator
    const index = this.blocks.length;
    const blockOrchestrator = new BlockOrchestrator(index, numTxs, globalVariables, l1ToL2Messages, this.context);
    this.blocks.push(blockOrchestrator);
    // Updates world state and kicks off proving
    await blockOrchestrator.start();
    // Wires output of this block orchestrator to the parent block merge circuit
    this.wire(blockOrchestrator);
  }

  /**
   * Adds a new tx to the current block in the epoch. Updates world-state with the effects of the tx and starts proving it.
   * @param processedTx - The processed tx to add.
   */
  public async addTx(processedTx: ProcessedTx): Promise<void> {
    await this.currentBlock.addTx(processedTx);
  }

  /**
   * Marks the current block as ended. Adds padding txs if needed and updates the world-state archive tree with its new header.
   */
  public async endBlock(): Promise<void> {
    await this.currentBlock.endBlock();
    await this.currentBlock.updateState();
  }

  private get currentBlock() {
    return this.blocks[this.blocks.length - 1];
  }

  /** Starts simulation and proving for the given circuit, and wires its output to the parent merge or root circuit. */
  private wire(source: BlockOrchestrator | BlockMergeCircuit) {
    const { index } = source;

    // Merge level, or maxlevels + 1 if it's a tx
    const mergeLevelCount = Math.ceil(Math.log2(this.numBlocks)) - 1;
    const level = 'level' in source ? source.level : mergeLevelCount + 1;

    void source
      .simulate()
      .then(simulation => this.getParentMerge(level, index).setNestedSimulation(simulation, index % 2))
      .catch(this.handleError);

    void source
      .prove()
      .then(proof => this.getParentMerge(level, index).setNestedProof(proof, index % 2))
      .catch(this.handleError);
  }

  /** Returns or creates a parent block merge or root circuit for the given circuit in the proving tree.  */
  private getParentMerge(level: number, index: number): BlockMergeCircuit | RootRollupCircuit {
    const location = getMergeLocation({ level, index, total: this.numBlocks });
    if (location.level === 0) {
      return this.getRootRollup();
    }

    if (!this.merges[location.indexWithinTree]) {
      const merge = new BlockMergeCircuit(location.level, location.indexWithinLevel, this.context);
      this.wire(merge);
      this.merges[location.indexWithinTree] = merge;
    }

    return this.merges[location.indexWithinTree];
  }

  /** Returns the simulation output of the root rollup for the epoch. */
  public simulate(): Promise<RootRollupPublicInputs> {
    return this.getRootRollup().simulate();
  }

  /** Returns the proof of the root rollup for the epoch. */
  public prove(): Promise<PublicInputsAndRecursiveProof<RootRollupPublicInputs>> {
    return this.getRootRollup().prove();
  }

  @memoize
  private getRootRollup() {
    return new RootRollupCircuit(this.context);
  }

  private handleError(err: Error) {
    this.logger.error(`Error in epoch orchestrator`, err);
    throw new Error('Unimplemented');
  }
}
