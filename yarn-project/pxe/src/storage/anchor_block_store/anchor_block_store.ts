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
  // Example flow that breaks if we only track per-block (e.g. e2e_blacklist_token_contract):
  // 1. Job A executes a mint transaction:
  //    - `ensureContractSynced` → `sync_private_state` runs BEFORE the tx executes → marks contract as synced
  //    - The mint transaction then creates a new shield note (emits a tagged log to the chain)
  //    - Note: the note is created AFTER the sync already ran, so it wasn't discovered
  // 2. Job A commits, the note now exists on-chain as a tagged log
  // 3. Job B executes a transaction that calls `redeem_shield` to spend the minted tokens
  // 4. `ensureContractSynced` runs for the token contract
  // 5. If we only tracked per-block, Job B would see the contract is "synced" and skip `sync_private_state`
  // 6. The note from Job A is never fetched from the chain because `sync_private_state` wasn't called
  // 7. `redeem_shield` fails with "note not found"
  //
  // By tracking per-job, Job B will run its own sync, which fetches the note from the chain.
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
