import { type BlockNumber, CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { unfreeze } from '@aztec/foundation/types';
import { L2Block } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type {
  BlockBuilderOptions,
  FullNodeBlockBuilderConfig,
  ICheckpointBlockBuilder,
  ICheckpointsBuilder,
  MerkleTreeWriteOperations,
} from '@aztec/stdlib/interfaces/server';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { makeAppendOnlyTreeSnapshot } from '@aztec/stdlib/testing';
import type { CheckpointGlobalVariables, Tx } from '@aztec/stdlib/tx';
import type { BuildBlockInCheckpointResult } from '@aztec/validator-client';

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
    opts: BlockBuilderOptions;
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
    opts: BlockBuilderOptions,
  ): Promise<BuildBlockInCheckpointResult> {
    this.buildBlockCalls.push({ blockNumber, timestamp, opts });

    if (this.errorOnBuild) {
      throw this.errorOnBuild;
    }

    let block: L2Block;
    let usedTxs: Tx[];

    if (this.blockProvider) {
      // Dynamic mode: get block from provider, cloning to avoid shared references across multiple buildBlock calls
      block = L2Block.fromBuffer(this.blockProvider().toBuffer());
      block.header.globalVariables.blockNumber = blockNumber;
      await block.header.recomputeHash();
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
      publicProcessorDuration: 0,
      numTxs: block?.body?.txEffects?.length ?? usedTxs.length,
      usedTxs,
      failedTxs: [],
    };
  }

  completeCheckpoint(): Promise<Checkpoint> {
    this.completeCheckpointCalled = true;
    const allBlocks = this.blockProvider ? this.builtBlocks : this.blocks;
    return this.buildCheckpoint(allBlocks);
  }

  getCheckpoint(): Promise<Checkpoint> {
    this.getCheckpointCalled = true;
    const builtBlocks = this.blockProvider ? this.builtBlocks : this.blocks.slice(0, this.blockIndex);
    if (builtBlocks.length === 0) {
      throw new Error('No blocks built yet');
    }
    return this.buildCheckpoint(builtBlocks);
  }

  /** Builds a structurally valid Checkpoint from a list of blocks, fixing up indexes and archive chaining. */
  private async buildCheckpoint(blocks: L2Block[]): Promise<Checkpoint> {
    // Fix up indexWithinCheckpoint and archive chaining so the checkpoint passes structural validation.
    for (let i = 0; i < blocks.length; i++) {
      blocks[i].indexWithinCheckpoint = IndexWithinCheckpoint(i);
      if (i > 0) {
        unfreeze(blocks[i].header).lastArchive = blocks[i - 1].archive;
        await blocks[i].header.recomputeHash();
      }
    }

    const firstBlock = blocks[0];
    const lastBlock = blocks[blocks.length - 1];
    const gv = firstBlock.header.globalVariables;

    const checkpointHeader = CheckpointHeader.empty({
      lastArchiveRoot: firstBlock.header.lastArchive.root,
      blockHeadersHash: Fr.random(),
      slotNumber: gv.slotNumber,
      timestamp: gv.timestamp,
      coinbase: gv.coinbase,
      feeRecipient: gv.feeRecipient,
      gasFees: gv.gasFees,
      totalManaUsed: lastBlock.header.totalManaUsed,
    });

    return new Checkpoint(
      makeAppendOnlyTreeSnapshot(lastBlock.header.globalVariables.blockNumber + 1),
      checkpointHeader,
      blocks,
      this.checkpointNumber,
    );
  }

  /** Resets per-checkpoint state (built blocks, consumed txs) while preserving config (blockProvider, seeded blocks). */
  resetCheckpointState(): void {
    this.builtBlocks = [];
    this.blockIndex = 0;
    this.consumedTxHashes.clear();
    this.completeCheckpointCalled = false;
    this.getCheckpointCalled = false;
  }

  /** Reset for reuse in another test */
  reset(): void {
    this.blocks = [];
    this.usedTxsPerBlock = [];
    this.buildBlockCalls = [];
    this.errorOnBuild = undefined;
    this.blockProvider = undefined;
    this.resetCheckpointState();
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
    feeAssetPriceModifier: bigint;
  }> = [];
  public openCheckpointCalls: Array<{
    checkpointNumber: CheckpointNumber;
    constants: CheckpointGlobalVariables;
    l1ToL2Messages: Fr[];
    previousCheckpointOutHashes: Fr[];
    existingBlocks: L2Block[];
    feeAssetPriceModifier: bigint;
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
      rollupManaLimit: 200_000_000,
    };
  }

  updateConfig(config: Partial<FullNodeBlockBuilderConfig>): void {
    this.updateConfigCalls.push(config);
  }

  startCheckpoint(
    checkpointNumber: CheckpointNumber,
    constants: CheckpointGlobalVariables,
    feeAssetPriceModifier: bigint,
    l1ToL2Messages: Fr[],
    previousCheckpointOutHashes: Fr[],
    _previousInboxRollingHash: Fr,
    _fork: MerkleTreeWriteOperations,
  ): Promise<ICheckpointBlockBuilder> {
    this.startCheckpointCalls.push({
      checkpointNumber,
      constants,
      l1ToL2Messages,
      previousCheckpointOutHashes,
      feeAssetPriceModifier,
    });

    if (!this.checkpointBuilder) {
      // Auto-create a builder if none was set
      this.checkpointBuilder = new MockCheckpointBuilder(constants, checkpointNumber);
    } else {
      this.checkpointBuilder.resetCheckpointState();
    }

    return Promise.resolve(this.checkpointBuilder);
  }

  openCheckpoint(
    checkpointNumber: CheckpointNumber,
    constants: CheckpointGlobalVariables,
    feeAssetPriceModifier: bigint,
    l1ToL2Messages: Fr[],
    previousCheckpointOutHashes: Fr[],
    _previousInboxRollingHash: Fr,
    _fork: MerkleTreeWriteOperations,
    existingBlocks: L2Block[] = [],
  ): Promise<ICheckpointBlockBuilder> {
    this.openCheckpointCalls.push({
      checkpointNumber,
      constants,
      l1ToL2Messages,
      previousCheckpointOutHashes,
      existingBlocks,
      feeAssetPriceModifier,
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
