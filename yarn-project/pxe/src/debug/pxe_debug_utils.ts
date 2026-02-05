import { randomBytes } from '@aztec/foundation/crypto/random';
import type { NoteDao, NotesFilter } from '@aztec/stdlib/note';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { BlockSynchronizer } from '../block_synchronizer/block_synchronizer.js';
import type { PXE } from '../pxe.js';
import type { ContractStore } from '../storage/contract_store/contract_store.js';
import type { AnchorBlockStore } from '../storage/index.js';
import type { NoteStore } from '../storage/note_store/note_store.js';

/**
 * Methods provided by this class might help debugging but must not be used in production.
 * No backwards compatibility or API stability should be expected. Use at your own risk.
 */
export class PXEDebugUtils {
  #pxe!: PXE;
  #putJobInQueue!: <T>(job: (jobId: string) => Promise<T>) => Promise<T>;

  constructor(
    private contractStore: ContractStore,
    private noteStore: NoteStore,
    private blockStateSynchronizer: BlockSynchronizer,
    private anchorBlockStore: AnchorBlockStore,
  ) {}

  /** Not injected through constructor since they're are co-dependant */
  public setPXE(pxe: PXE, putJobInQueue: <T>(job: (jobId: string) => Promise<T>) => Promise<T>) {
    this.#pxe = pxe;
    this.#putJobInQueue = putJobInQueue;
  }

  /**
   * A debugging utility to get notes based on the provided filter.
   *
   * Note that this should not be used in production code because the structure of notes is considered to be
   * an implementation detail of contracts. This is only meant to be used for debugging purposes. If you need to obtain
   * note-related information in production code, please implement a custom utility function on your contract and call
   * that function instead (e.g. `get_balance(owner: AztecAddress) -> u128` utility function on a Token contract).
   *
   * @param filter - The filter to apply to the notes.
   * @returns The requested notes.
   */
  public async getNotes(filter: NotesFilter): Promise<NoteDao[]> {
    // We need to manually trigger private state sync to have a guarantee that all the notes are available.
    const call = await this.contractStore.getFunctionCall('sync_state', [], filter.contractAddress);
    await this.#pxe.simulateUtility(call);

    return this.noteStore.getNotes(filter, randomBytes(8).toString('hex'));
  }

  /** Returns the block header up to which the PXE has synced. */
  public getSyncedBlockHeader(): Promise<BlockHeader> {
    return this.anchorBlockStore.getBlockHeader();
  }

  /**
   * Triggers a sync of the PXE with the node.
   * Blocks until the sync is complete.
   */
  public sync(): Promise<void> {
    return this.#putJobInQueue(() => this.blockStateSynchronizer.sync());
  }
}
