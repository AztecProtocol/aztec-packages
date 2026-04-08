import type { Logger } from '@aztec/foundation/log';
import type { FunctionCall, FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { StagedStore } from '../job_coordinator/job_coordinator.js';
import type { ContractStore } from '../storage/contract_store/contract_store.js';
import type { NoteStore } from '../storage/note_store/note_store.js';
import { syncState, verifyCurrentClassId } from './helpers.js';

/**
 * Service for syncing the private state of contracts and verifying that the PXE holds the current class artifact.
 * It uses a cache to avoid redundant sync operations - the cache is wiped when the anchor block changes.
 *
 * TODO: The StagedStore naming is broken here. Figure out a better name.
 */
export class ContractSyncService implements StagedStore {
  readonly storeName = 'contract_sync';

  // Tracks contracts synced since last wipe. The cache is keyed per individual scope address
  // (`contractAddress:scopeAddress`), or `contractAddress:*` for all scopes (all accounts).
  // The value is a promise that resolves when the contract is synced.
  private syncedContracts: Map<string, Promise<void>> = new Map();

  // Per-job excluded contract addresses - these contracts should not be synced.
  private excludedFromSync: Map<string, Set<string>> = new Map();

  constructor(
    private aztecNode: AztecNode,
    private contractStore: ContractStore,
    private noteStore: NoteStore,
    private log: Logger,
  ) {}

  /** Sets contracts that should be skipped during sync for a specific job. */
  setExcludedFromSync(jobId: string, addresses: Set<string>): void {
    this.excludedFromSync.set(jobId, addresses);
  }

  /**
   * Ensures a contract's private state is synchronized and that the PXE holds the current class artifact.
   * Uses a cache to avoid redundant sync operations - the cache is wiped when the anchor block changes.
   * @param contractAddress - The address of the contract to sync.
   * @param functionToInvokeAfterSync - The function selector that will be called after sync (used to validate it's
   * not sync_state itself).
   * @param utilityExecutor - Executor function for running the sync_state utility function.
   * @param scopes - Access scopes to pass through to the utility executor (affects whose account's private state is discovered).
   */
  async ensureContractSynced(
    contractAddress: AztecAddress,
    functionToInvokeAfterSync: FunctionSelector | null,
    utilityExecutor: (call: FunctionCall, scopes: AztecAddress[]) => Promise<any>,
    anchorBlockHeader: BlockHeader,
    jobId: string,
    scopes: AztecAddress[],
  ): Promise<void> {
    if (this.#shouldSkipSync(jobId, contractAddress)) {
      return;
    }

    this.#startSyncIfNeeded(contractAddress, scopes, scopesToSync =>
      this.#syncContract(
        contractAddress,
        functionToInvokeAfterSync,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopesToSync,
      ),
    );

    await this.#awaitSync(contractAddress, scopes);
  }

  /** Clears sync cache entries for the given scopes of a contract. */
  invalidateContractForScopes(contractAddress: AztecAddress, scopes: AztecAddress[]): void {
    if (scopes.length === 0) {
      return;
    }
    scopes.forEach(scope => this.syncedContracts.delete(toKey(contractAddress, scope)));
  }

  async #syncContract(
    contractAddress: AztecAddress,
    functionToInvokeAfterSync: FunctionSelector | null,
    utilityExecutor: (call: FunctionCall, scopes: AztecAddress[]) => Promise<any>,
    anchorBlockHeader: BlockHeader,
    jobId: string,
    scopes: AztecAddress[],
  ): Promise<void> {
    this.log.debug(`Syncing contract ${contractAddress}`);

    await Promise.all([
      // Call sync_state sequentially for each scope address — each invocation synchronizes one account's private
      // state using scoped capsule arrays.
      (async () => {
        for (const scope of scopes) {
          await syncState(
            contractAddress,
            this.contractStore,
            functionToInvokeAfterSync,
            utilityExecutor,
            this.noteStore,
            this.aztecNode,
            anchorBlockHeader,
            jobId,
            scope,
          );
        }
      })(),
      verifyCurrentClassId(contractAddress, this.aztecNode, this.contractStore, anchorBlockHeader),
    ]);
    this.log.debug(`Contract ${contractAddress} synced`);
  }

  /** Clears sync cache. Called by BlockSynchronizer when anchor block changes. */
  wipe(): void {
    this.log.debug(`Wiping contract sync cache (${this.syncedContracts.size} entries)`);
    this.syncedContracts.clear();
  }

  commit(jobId: string): Promise<void> {
    // Clear excluded contracts for this job
    this.excludedFromSync.delete(jobId);
    return Promise.resolve();
  }

  discardStaged(jobId: string): Promise<void> {
    // We clear the synced contracts cache here because, when the job is discarded, any associated database writes from
    // the sync are also undone.
    this.syncedContracts.clear();
    this.excludedFromSync.delete(jobId);
    return Promise.resolve();
  }
  /** Returns true if sync should be skipped for this contract */
  #shouldSkipSync(jobId: string, contractAddress: AztecAddress): boolean {
    return !!this.excludedFromSync.get(jobId)?.has(contractAddress.toString());
  }

  /** If there are unsynced scopes, starts sync and stores the promise in cache with error cleanup. */
  #startSyncIfNeeded(
    contractAddress: AztecAddress,
    scopes: AztecAddress[],
    syncFn: (scopesToSync: AztecAddress[]) => Promise<void>,
  ): void {
    const scopesToSync = scopes.filter(scope => !this.syncedContracts.has(toKey(contractAddress, scope)));
    const keys = scopesToSync.map(scope => toKey(contractAddress, scope));
    if (keys.length === 0) {
      return;
    }
    const promise = syncFn(scopesToSync).catch(err => {
      keys.forEach(key => this.syncedContracts.delete(key));
      throw err;
    });
    keys.forEach(key => this.syncedContracts.set(key, promise));
  }

  /** Collects all relevant scope promises (including in-flight ones from concurrent calls) and awaits them. */
  async #awaitSync(contractAddress: AztecAddress, scopes: AztecAddress[]): Promise<void> {
    const promises = scopes
      .map(scope => this.syncedContracts.get(toKey(contractAddress, scope)))
      .filter(p => p !== undefined);
    await Promise.all(promises);
  }
}

function toKey(contract: AztecAddress, scope: AztecAddress) {
  return `${contract.toString()}:${scope.toString()}`;
}
