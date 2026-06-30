import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AvmExecutor } from '@aztec/simulator/server';
import type { BlockHash, L2Block } from '@aztec/stdlib/block';
import type {
  MerkleTreeReadOperations,
  MerkleTreeWriteOperations,
  SnapshotDataKeys,
  WorldStateSynchronizer,
  WorldStateSynchronizerStatus,
} from '@aztec/stdlib/interfaces/server';
import { NativeWorldStateService } from '@aztec/world-state/native';

export class TXESynchronizer implements WorldStateSynchronizer {
  // This works when set to 1 as well.
  private blockNumber = BlockNumber.ZERO;

  /** AVM execution backend (simulator pool + CDB server) shared across all public simulations. */
  public avmExecutor!: AvmExecutor;

  constructor(public nativeWorldStateService: NativeWorldStateService) {}

  static async create() {
    const nativeWorldStateService = await NativeWorldStateService.ephemeral();

    const synchronizer = new this(nativeWorldStateService);

    synchronizer.avmExecutor = await AvmExecutor.spawn({
      wsdbIpcPath: nativeWorldStateService.getIpcPath(),
    });

    return synchronizer;
  }

  public async handleL2Block(block: L2Block) {
    await this.nativeWorldStateService.handleL2BlockAndMessages(
      block,
      Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(0).map(Fr.zero),
    );

    this.blockNumber = block.header.globalVariables.blockNumber;
  }

  /**
   * Forces an immediate sync to an optionally provided minimum block number.
   * @param targetBlockNumber - The target block number that we must sync to. Will download unproven blocks if needed to reach it.
   * @param blockHash - If provided, verifies the block at targetBlockNumber matches this hash.
   * @returns A promise that resolves with the block number the world state was synced to
   */
  public syncImmediate(_minBlockNumber?: BlockNumber, _blockHash?: BlockHash): Promise<BlockNumber> {
    return Promise.resolve(this.blockNumber);
  }

  /** Returns an instance of MerkleTreeAdminOperations that will not include uncommitted data. */
  public getCommitted(): MerkleTreeReadOperations {
    return this.nativeWorldStateService.getCommitted();
  }

  /** Forks the world state at the given block number, defaulting to the latest one. */
  public fork(block?: number): Promise<MerkleTreeWriteOperations> {
    return this.nativeWorldStateService.fork(block ? BlockNumber(block) : undefined);
  }

  /** Gets a handle that allows reading the state as it was at the given block number. */
  public getSnapshot(blockNumber: number): MerkleTreeReadOperations {
    return this.nativeWorldStateService.getSnapshot(BlockNumber(blockNumber));
  }

  /** Backups the db to the target path. */
  public backupTo(dstPath: string, compact?: boolean): Promise<Record<Exclude<SnapshotDataKeys, 'archiver'>, string>> {
    return this.nativeWorldStateService.backupTo(dstPath, compact);
  }

  public start(): Promise<void> {
    throw new Error('TXE Synchronizer does not implement "start"');
  }

  public status(): Promise<WorldStateSynchronizerStatus> {
    throw new Error('TXE Synchronizer does not implement "status"');
  }

  public async stop(): Promise<void> {
    await this.closeIpc();
  }

  public stopSync(): Promise<void> {
    throw new Error('TXE Synchronizer does not implement "stopSync"');
  }

  public resumeSync(): void {
    throw new Error('TXE Synchronizer does not implement "resumeSync"');
  }

  public clear(): Promise<void> {
    throw new Error('TXE Synchronizer does not implement "clear"');
  }

  /** Clean up IPC resources. */
  public async closeIpc(): Promise<void> {
    await this.avmExecutor?.[Symbol.asyncDispose]();
  }
}
