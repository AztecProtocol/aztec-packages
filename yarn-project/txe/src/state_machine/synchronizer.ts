import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import type { L2BlockNew } from '@aztec/stdlib/block';
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

  constructor(public nativeWorldStateService: NativeWorldStateService) {}

  static async create() {
    const log = createLogger('txe:synchronizer');
    const nativeWorldStateService = await NativeWorldStateService.tmp(EthAddress.ZERO, true, [], log);

    return new this(nativeWorldStateService);
  }

  public async handleL2Block(block: L2BlockNew) {
    await this.nativeWorldStateService.handleL2BlockAndMessages(
      block,
      Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(0).map(Fr.zero),
    );

    this.blockNumber = block.header.globalVariables.blockNumber;
  }

  /**
   * Forces an immediate sync to an optionally provided minimum block number
   * @param targetBlockNumber - The target block number that we must sync to. Will download unproven blocks if needed to reach it.
   * @param skipThrowIfTargetNotReached - Whether to skip throwing if the target block number is not reached.
   * @returns A promise that resolves with the block number the world state was synced to
   */
  public syncImmediate(_minBlockNumber?: BlockNumber, _skipThrowIfTargetNotReached?: boolean): Promise<BlockNumber> {
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

  public stop(): Promise<void> {
    throw new Error('TXE Synchronizer does not implement "stop"');
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
}
