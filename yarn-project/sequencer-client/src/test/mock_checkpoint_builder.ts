import { type BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Timer } from '@aztec/foundation/timer';
import { L2Block } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import { Gas } from '@aztec/stdlib/gas';
import type {
  FullNodeBlockBuilderConfig,
  ICheckpointBlockBuilder,
  ICheckpointsBuilder,
  MerkleTreeWriteOperations,
  PublicProcessorLimits,
} from '@aztec/stdlib/interfaces/server';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { makeAppendOnlyTreeSnapshot } from '@aztec/stdlib/testing';
import type { CheckpointGlobalVariables, Tx } from '@aztec/stdlib/tx';
import type { BuildBlockInCheckpointResultWithTimer } from '@aztec/validator-client';

/**
 * A fake CheckpointBuilder for testing that implements the same interface as the real one.
 * Can be seeded with blocks to return sequentially on each `buildBlock` call.
 */
export class MockCheckpointBuilder implements ICheckpointBlockBuilder {
  private blocks: L2Block[] = [];
  private builtBlocks: L2Block[] = [];
  private usedTxsPerBlock: Tx[][] = [];
  private blockIndex = 0;

  /** Optional function to dynamically provide the block (alternative to seedBlocks) */
  private blockProvider: (() => L2Block) | undefined = undefined;

  /** Track calls for assertions */
  public buildBlockCalls: Array<{
    blockNumber: BlockNumber;
    timestamp: bigint;
    opts: PublicProcessorLimits;
  }> = [];
  /** Track all consumed transaction hashes across buildBlock calls */
  public consumedTxHashes: Set<string> = new Set();
  public completeCheckpointCalled = false;
  public getCheckpointCalled = false;

  /** Set to an error to make buildBlock throw on next call */
  public errorOnBuild: Error | undefined = undefined;

  constructor(
    private readonly constants: CheckpointGlobalVariables,
    private readonly checkpointNumber: CheckpointNumber,
  ) {}

  /** Seed the builder with blocks to return on successive buildBlock calls */
  seedBlocks(blocks: L2Block[], usedTxsPerBlock?: Tx[][]): this {
    this.blocks = blocks;
    this.usedTxsPerBlock = usedTxsPerBlock ?? blocks.map(() => []);
    this.blockIndex = 0;
    this.blockProvider = undefined;
    return this;
  }

  /**
   * Set a function that provides blocks dynamically.
   * Useful for tests where the block is determined at call time (e.g., sequencer tests).
   */
  setBlockProvider(provider: () => L2Block): this {
    this.blockProvider = provider;
    this.blocks = [];
    return this;
  }

  getConstantData(): CheckpointGlobalVariables {
    return this.constants;
  }

  async buildBlock(
    pendingTxs: Iterable<Tx> | AsyncIterable<Tx>,
    blockNumber: BlockNumber,
    timestamp: bigint,
    opts: PublicProcessorLimits,
  ): Promise<BuildBlockInCheckpointResultWithTimer> {
    this.buildBlockCalls.push({ blockNumber, timestamp, opts });

    if (this.errorOnBuild) {
      throw this.errorOnBuild;
    }

    let block: L2Block;
    let usedTxs: Tx[];

    if (this.blockProvider) {
      // Dynamic mode: get block from provider
      block = this.blockProvider();
      usedTxs = [];
      this.builtBlocks.push(block);
    } else {
      // Seeded mode: get block from pre-seeded list
      block = this.blocks[this.blockIndex];
      usedTxs = this.usedTxsPerBlock[this.blockIndex] ?? [];
      this.blockIndex++;
      this.builtBlocks.push(block);
    }

    // Check that no pending tx has already been consumed
    for await (const tx of pendingTxs) {
      const hash = tx.getTxHash().toString();
      if (this.consumedTxHashes.has(hash)) {
        throw new Error(`Transaction ${hash} was already consumed in a previous block`);
      }
    }

    // Add used txs to consumed set
    for (const tx of usedTxs) {
      this.consumedTxHashes.add(tx.getTxHash().toString());
    }

    return {
      block,
      publicGas: Gas.empty(),
      publicProcessorDuration: 0,
      numTxs: block?.body?.txEffects?.length ?? usedTxs.length,
      blockBuildingTimer: new Timer(),
      usedTxs,
      failedTxs: [],
      usedTxBlobFields: block?.body?.txEffects?.reduce((sum, tx) => sum + tx.getNumBlobFields(), 0) ?? 0,
    };
  }

  completeCheckpoint(): Promise<Checkpoint> {
    this.completeCheckpointCalled = true;
    const allBlocks = this.blockProvider ? this.builtBlocks : this.blocks;
    const lastBlock = allBlocks[allBlocks.length - 1];
    // Create a CheckpointHeader from the last block's header for testing
    const checkpointHeader = this.createCheckpointHeader(lastBlock);
    return Promise.resolve(
      new Checkpoint(
        makeAppendOnlyTreeSnapshot(lastBlock.header.globalVariables.blockNumber + 1),
        checkpointHeader,
        allBlocks,
        this.checkpointNumber,
      ),
    );
  }

  getCheckpoint(): Promise<Checkpoint> {
    this.getCheckpointCalled = true;
    const builtBlocks = this.blockProvider ? this.builtBlocks : this.blocks.slice(0, this.blockIndex);
    const lastBlock = builtBlocks[builtBlocks.length - 1];
    if (!lastBlock) {
      throw new Error('No blocks built yet');
    }
    // Create a CheckpointHeader from the last block's header for testing
    const checkpointHeader = this.createCheckpointHeader(lastBlock);
    return Promise.resolve(
      new Checkpoint(
        makeAppendOnlyTreeSnapshot(lastBlock.header.globalVariables.blockNumber + 1),
        checkpointHeader,
        builtBlocks,
        this.checkpointNumber,
      ),
    );
  }

  /**
   * Creates a CheckpointHeader from a block's header for testing.
   * This is a simplified version that creates a minimal CheckpointHeader.
   */
  private createCheckpointHeader(block: L2Block): CheckpointHeader {
    const header = block.header;
    const gv = header.globalVariables;
    return CheckpointHeader.empty({
      lastArchiveRoot: header.lastArchive.root,
      blockHeadersHash: Fr.random(), // Use random for testing
      slotNumber: gv.slotNumber,
      timestamp: gv.timestamp,
      coinbase: gv.coinbase,
      feeRecipient: gv.feeRecipient,
      gasFees: gv.gasFees,
      totalManaUsed: header.totalManaUsed,
    });
  }

  /** Reset for reuse in another test */
  reset(): void {
    this.blocks = [];
    this.builtBlocks = [];
    this.usedTxsPerBlock = [];
    this.blockIndex = 0;
    this.buildBlockCalls = [];
    this.consumedTxHashes.clear();
    this.completeCheckpointCalled = false;
    this.getCheckpointCalled = false;
    this.errorOnBuild = undefined;
    this.blockProvider = undefined;
  }
}

/**
 * A fake CheckpointsBuilder (factory) for testing that implements the same interface
 * as FullNodeCheckpointsBuilder. Returns MockCheckpointBuilder instances.
 * Does NOT use jest mocks - this is a proper test double.
 */
export class MockCheckpointsBuilder implements ICheckpointsBuilder {
  private checkpointBuilder: MockCheckpointBuilder | undefined;

  /** Track calls for assertions */
  public startCheckpointCalls: Array<{
    checkpointNumber: CheckpointNumber;
    constants: CheckpointGlobalVariables;
    l1ToL2Messages: Fr[];
    previousCheckpointOutHashes: Fr[];
  }> = [];
  public openCheckpointCalls: Array<{
    checkpointNumber: CheckpointNumber;
    constants: CheckpointGlobalVariables;
    l1ToL2Messages: Fr[];
    previousCheckpointOutHashes: Fr[];
    existingBlocks: L2Block[];
  }> = [];
  public updateConfigCalls: Array<Partial<FullNodeBlockBuilderConfig>> = [];

  /**
   * Set the MockCheckpointBuilder to return from startCheckpoint.
   * Must be called before startCheckpoint is invoked.
   */
  setCheckpointBuilder(builder: MockCheckpointBuilder): this {
    this.checkpointBuilder = builder;
    return this;
  }

  /**
   * Creates a new MockCheckpointBuilder with the given constants.
   * Convenience method that creates and sets the builder in one call.
   */
  createCheckpointBuilder(
    constants: CheckpointGlobalVariables,
    checkpointNumber: CheckpointNumber,
  ): MockCheckpointBuilder {
    this.checkpointBuilder = new MockCheckpointBuilder(constants, checkpointNumber);
    return this.checkpointBuilder;
  }

  /** Get the current checkpoint builder (for assertions) */
  getCheckpointBuilder(): MockCheckpointBuilder | undefined {
    return this.checkpointBuilder;
  }

  getConfig(): FullNodeBlockBuilderConfig {
    return {
      l1GenesisTime: 0n,
      slotDuration: 24,
      l1ChainId: 1,
      rollupVersion: 1,
    };
  }

  updateConfig(config: Partial<FullNodeBlockBuilderConfig>): void {
    this.updateConfigCalls.push(config);
  }

  startCheckpoint(
    checkpointNumber: CheckpointNumber,
    constants: CheckpointGlobalVariables,
    l1ToL2Messages: Fr[],
    previousCheckpointOutHashes: Fr[],
    _fork: MerkleTreeWriteOperations,
  ): Promise<ICheckpointBlockBuilder> {
    this.startCheckpointCalls.push({ checkpointNumber, constants, l1ToL2Messages, previousCheckpointOutHashes });

    if (!this.checkpointBuilder) {
      // Auto-create a builder if none was set
      this.checkpointBuilder = new MockCheckpointBuilder(constants, checkpointNumber);
    }

    return Promise.resolve(this.checkpointBuilder);
  }

  openCheckpoint(
    checkpointNumber: CheckpointNumber,
    constants: CheckpointGlobalVariables,
    l1ToL2Messages: Fr[],
    previousCheckpointOutHashes: Fr[],
    _fork: MerkleTreeWriteOperations,
    existingBlocks: L2Block[] = [],
  ): Promise<ICheckpointBlockBuilder> {
    this.openCheckpointCalls.push({
      checkpointNumber,
      constants,
      l1ToL2Messages,
      previousCheckpointOutHashes,
      existingBlocks,
    });

    if (!this.checkpointBuilder) {
      // Auto-create a builder if none was set
      this.checkpointBuilder = new MockCheckpointBuilder(constants, checkpointNumber);
    }

    return Promise.resolve(this.checkpointBuilder);
  }

  getFork(_blockNumber: BlockNumber): Promise<MerkleTreeWriteOperations> {
    throw new Error('MockCheckpointsBuilder.getFork not implemented');
  }

  /** Reset for reuse in another test */
  reset(): void {
    this.checkpointBuilder = undefined;
    this.startCheckpointCalls = [];
    this.openCheckpointCalls = [];
    this.updateConfigCalls = [];
  }
}
