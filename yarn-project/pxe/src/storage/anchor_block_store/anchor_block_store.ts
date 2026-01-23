import type { AztecAsyncKVStore, AztecAsyncSingleton } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHeader } from '@aztec/stdlib/tx';

export class AnchorBlockStore {
  #store: AztecAsyncKVStore;
  #synchronizedHeader: AztecAsyncSingleton<Buffer>;

  // Contracts that have been synced for the current anchor block AND job (contract class recency checked and private
  // state synchronized). The key is "contractAddress:jobId". Cleared on block change.
  //
  // Note: We track per-job because a utility execution (job) may enqueue items to the capsule store that need to be
  // validated by subsequent executions. If we only tracked per-block, subsequent jobs would skip sync and never
  // validate those pending items.
  //
  // Example flow that breaks if we only track per-block:
  // 1. Job A calls `process_message.simulate()` which runs `ensureContractSynced` → marks contract as synced
  // 2. Inside `process_message`, an event/note is enqueued to the capsule store via `enqueue_event_for_validation`
  // 3. Job A commits, the enqueued item is now in the committed capsule store awaiting validation
  // 4. Job B calls `getPrivateEvents()` which runs `ensureContractSynced`
  // 5. If we only tracked per-block, Job B would see the contract is "synced" and skip `sync_private_state`
  // 6. The enqueued item from Job A would never be validated because `validate_enqueued_notes_and_events` is only
  //    called inside `sync_private_state` (via `discover_new_messages`)
  //
  // By tracking per-job, Job B will run its own sync, which validates the pending items from Job A.
  #syncedContracts: Set<string> = new Set();

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#synchronizedHeader = this.#store.openSingleton('header');
  }

  #keyFor(contractAddress: AztecAddress, jobId: string): string {
    return `${contractAddress.toString()}:${jobId}`;
  }

  /** Check if a contract has been synced for the current anchor block and job. */
  isContractSynced(contractAddress: AztecAddress, jobId: string): boolean {
    return this.#syncedContracts.has(this.#keyFor(contractAddress, jobId));
  }

  /** Mark a contract as synced for the current anchor block and job. */
  markContractSynced(contractAddress: AztecAddress, jobId: string): void {
    const key = this.#keyFor(contractAddress, jobId);
    if (this.#syncedContracts.has(key)) {
      // This would indicate that a contract has been synced twice for the same anchor block and job which should never
      // happen.
      throw new Error(
        `Contract ${contractAddress.toString()} has already been marked as synced for the current anchor block and job ${jobId}. This is a PXE bug.`,
      );
    }

    this.#syncedContracts.add(key);
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
