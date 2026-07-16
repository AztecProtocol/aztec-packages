import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import {
  type AvmSimulator,
  AvmSimulatorPool,
  NapiAvmSimulator,
  NapiWsdbBackend,
  createInProcessWsdb,
} from '@aztec/simulator/server';
import type { BlockHash, L2Block } from '@aztec/stdlib/block';
import type {
  MerkleTreeReadOperations,
  MerkleTreeWriteOperations,
  SnapshotDataKeys,
  WorldStateSynchronizer,
  WorldStateSynchronizerStatus,
} from '@aztec/stdlib/interfaces/server';
import { EMPTY_GENESIS_DATA } from '@aztec/stdlib/world-state';
import { NativeWorldStateService, buildInProcessWsdbOptions } from '@aztec/world-state/native';

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export class TXESynchronizer implements WorldStateSynchronizer {
  // This works when set to 1 as well.
  private blockNumber = BlockNumber.ZERO;

  /** AVM execution backend shared across all public simulations, behind the transport-agnostic interface. */
  public avmSimulator!: AvmSimulator & AsyncDisposable;

  constructor(public nativeWorldStateService: NativeWorldStateService) {}

  static async create() {
    // TXE_IN_PROCESS runs BOTH the world state and the AVM in-process (NAPI addon), sharing ONE WorldState with
    // zero child processes. All backends satisfy the same interfaces, so nothing downstream changes.
    if (process.env.TXE_IN_PROCESS) {
      return this.createInProcess();
    }

    const nativeWorldStateService = await NativeWorldStateService.ephemeral();
    const synchronizer = new this(nativeWorldStateService);
    const wsdbIpcPath = nativeWorldStateService.getIpcPath();
    synchronizer.avmSimulator = await AvmSimulatorPool.spawn({ wsdbIpcPath });
    return synchronizer;
  }

  /**
   * Fully in-process TXE: one WorldState hosted in this process (via the avm_inprocess NAPI addon), driven by
   * both the world-state service and a co-hosted AVM — no aztec-wsdb and no bb-avm-sim subprocesses. Teardown
   * order (AVM disposed before the world state closes) is handled by the session, and the AVM only borrows the
   * shared handle.
   */
  private static async createInProcess(): Promise<TXESynchronizer> {
    const dataDir = await mkdtemp(join(tmpdir(), 'aztec-txe-world-state-'));
    const cleanup = () => rm(dataDir, { recursive: true, force: true, maxRetries: 3 });

    // Small, short-lived tree map sizes (matches NativeWorldStateService.tmp): 256 MB/tree is ample for tests.
    const dbMapSizeKb = 256 * 1024;
    const wsTreeMapSizes = {
      archiveTreeMapSizeKb: dbMapSizeKb,
      nullifierTreeMapSizeKb: dbMapSizeKb,
      noteHashTreeMapSizeKb: dbMapSizeKb,
      messageTreeMapSizeKb: dbMapSizeKb,
      publicDataTreeMapSizeKb: dbMapSizeKb,
    };
    const genesis = EMPTY_GENESIS_DATA;

    const inProcessWsdb = createInProcessWsdb(
      dataDir,
      buildInProcessWsdbOptions(wsTreeMapSizes, genesis, /*threads=*/ 1),
    );
    const nativeWorldStateService = await NativeWorldStateService.fromWsdbBackend(
      new NapiWsdbBackend(inProcessWsdb),
      genesis,
      undefined,
      undefined,
      cleanup,
    );
    const synchronizer = new this(nativeWorldStateService);
    synchronizer.avmSimulator = await NapiAvmSimulator.spawnCoHosted({ inProcessWsdb });
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
    await this.avmSimulator?.[Symbol.asyncDispose]();
  }
}
