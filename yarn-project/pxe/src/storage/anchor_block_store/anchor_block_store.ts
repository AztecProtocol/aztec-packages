import type { AztecAsyncKVStore, AztecAsyncSingleton } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHeader } from '@aztec/stdlib/tx';

export class AnchorBlockStore {
  #store: AztecAsyncKVStore;
  #synchronizedHeader: AztecAsyncSingleton<Buffer>;
  // Contracts that have been synced for the current anchor block (contract class recency checked and private state
  // synchronized). Cleared on block change.
  #syncedContracts: Set<string> = new Set();

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#synchronizedHeader = this.#store.openSingleton('header');
  }

  /** Check if a contract has been synced for the current anchor block. */
  isContractSynced(contractAddress: AztecAddress): boolean {
    return this.#syncedContracts.has(contractAddress.toString());
  }

  /** Mark a contract as synced for the current anchor block. */
  markContractSynced(contractAddress: AztecAddress): void {
    if (this.isContractSynced(contractAddress)) {
      // This would indicate that a contract has been synced twice for the same anchor block which should never happen.
      throw new Error(
        `Contract ${contractAddress.toString()} has already been marked as synced for the current anchor block. This is a PXE bug.`,
      );
    }

    this.#syncedContracts.add(contractAddress.toString());
  }

  async setHeader(header: BlockHeader): Promise<void> {
    // We have received a new anchor block so we wipe out the list of contracts that have been synced at the previous
    // anchor block - with new state it's necessary to re-sync them.
    this.#syncedContracts.clear();
    await this.#synchronizedHeader.set(header.toBuffer());
  }

  async getBlockHeader(): Promise<BlockHeader> {
    const headerBuffer = await this.#synchronizedHeader.getAsync();
    if (!headerBuffer) {
      throw new Error(`Trying to get block header with a not-yet-synchronized PXE - this should never happen`);
    }

    return BlockHeader.fromBuffer(headerBuffer);
  }
}
