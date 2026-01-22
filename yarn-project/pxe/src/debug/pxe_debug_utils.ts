import { randomBytes } from '@aztec/foundation/crypto/random';
import type { NoteDao, NotesFilter } from '@aztec/stdlib/note';

import type { PXE } from '../pxe.js';
import type { ContractStore } from '../storage/contract_store/contract_store.js';
import type { NoteStore } from '../storage/note_store/note_store.js';

/**
 * Methods provided by this class might help debugging but must not be used in production.
 * No backwards compatibility or API stability should be expected. Use at your own risk.
 */
export class PXEDebugUtils {
  #pxe: PXE | undefined = undefined;

  constructor(
    private contractStore: ContractStore,
    private noteStore: NoteStore,
  ) {}

  /**
   * Not injected through constructor since they're are co-dependant.
   */
  public setPXE(pxe: PXE) {
    this.#pxe = pxe;
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
    if (!this.#pxe) {
      throw new Error('Cannot getNotes because no PXE is set');
    }

    // We need to manually trigger private state sync to have a guarantee that all the notes are available.
    const call = await this.contractStore.getFunctionCall('sync_private_state', [], filter.contractAddress);
    await this.#pxe.simulateUtility(call);

    return this.noteStore.getNotes(filter, randomBytes(8).toString('hex'));
  }
}
