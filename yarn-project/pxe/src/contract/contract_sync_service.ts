import type { Logger } from '@aztec/foundation/log';
import { Semaphore } from '@aztec/foundation/queue';
import { isProtocolContract } from '@aztec/protocol-contracts';
import type { FunctionCall, FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { StagedStore } from '../job_coordinator/job_coordinator.js';
import { NoteService } from '../notes/note_service.js';
import type { ContractStore } from '../storage/contract_store/contract_store.js';
import type { NoteStore } from '../storage/note_store/note_store.js';
import { ContractCallDependencies } from './contract_call_dependencies.js';
import type { ContractClassService } from './contract_class_service.js';
import { syncScope } from './helpers.js';

/**
 * Maximum number of scope syncs running concurrently within a single sync call. Sized to trade off parallelism
 * on non-ACIR work (node RPC, note store reads) against memory pressure from concurrent circuit execution.
 */
export const MAX_CONCURRENT_SCOPE_SYNCS = 5;

/**
 * Service for syncing the private state of contracts. It uses a cache to avoid redundant sync operations - the cache
 * is wiped when the anchor block changes.
 *
 * TODO: The StagedStore naming is broken here. Figure out a better name.
 */
export class ContractSyncService implements StagedStore {
  readonly storeName = 'contract_sync';

  // Tracks contracts synced since last wipe. The cache is keyed per individual scope address
  // (`contractAddress:scopeAddress`), or `contractAddress:*` for all scopes (all accounts).
  // The value is a promise that resolves when the contract is synced.
  private readonly syncedContracts: Map<string, Promise<void>> = new Map();

  private readonly callDependencies: ContractCallDependencies;

  constructor(
    private aztecNode: AztecNode,
    private contractStore: ContractStore,
    private contractClassService: ContractClassService,
    private noteStore: NoteStore,
    private log: Logger,
    /** Whether contracts known to follow the requested one may be speculatively synced. */
    concurrentContractSyncEnabled: boolean,
  ) {
    this.callDependencies = new ContractCallDependencies(concurrentContractSyncEnabled, log);
  }

  /**
   * Ensures a contract's private state is synchronized.
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
    this.#startSyncIfNeeded(contractAddress, scopes, anchorBlockHeader, jobId, scope =>
      syncScope(
        contractAddress,
        this.contractStore,
        this.contractClassService,
        anchorBlockHeader,
        functionToInvokeAfterSync,
        utilityExecutor,
        scope,
      ),
    );

    this.#speculativelySync(
      contractAddress,
      functionToInvokeAfterSync,
      utilityExecutor,
      anchorBlockHeader,
      jobId,
      scopes,
    );

    await this.#awaitSync(contractAddress, scopes);
  }

  /**
   * Starts the syncs of the contracts known to follow the requested one, so they run in parallel with it. Without
   * this, syncs within a job serialize by execution order: a contract only syncs once execution reaches it, so its
   * round trips wait on every earlier sync (see {@link ContractCallDependencies} for how the contracts are learned).
   * The `syncedContracts` memo dedupes them when execution reaches them for real.
   *
   * Guessing wrong is cheap: syncing a contract the job never uses spends extra node requests but does not change
   * what the job computes. If a speculative sync fails it is dropped from the memo and forgotten as a dependency, so
   * it cannot fail a job that never needed it, and a real request retries from scratch.
   */
  #speculativelySync(
    contractAddress: AztecAddress,
    functionToInvokeAfterSync: FunctionSelector | null,
    utilityExecutor: (call: FunctionCall, scopes: AztecAddress[]) => Promise<any>,
    anchorBlockHeader: BlockHeader,
    jobId: string,
    scopes: AztecAddress[],
  ): void {
    const contractsToSpeculativelySync = this.callDependencies.onContractUsed(
      jobId,
      contractAddress,
      functionToInvokeAfterSync,
      scopes,
    );
    for (const address of contractsToSpeculativelySync) {
      this.#startSyncIfNeeded(address, scopes, anchorBlockHeader, jobId, scope =>
        syncScope(
          address,
          this.contractStore,
          this.contractClassService,
          anchorBlockHeader,
          null,
          utilityExecutor,
          scope,
        ),
      );
      // Nothing may ever await a speculative sync, so observe its failure here: without this a rejection would go
      // unhandled, and a contract that no longer syncs cleanly would keep being speculatively synced.
      for (const scope of scopes) {
        this.syncedContracts.get(toKey(address, scope))?.catch(err => {
          this.callDependencies.forget(jobId, address);
          this.log.debug(`Speculative sync of ${address} failed`, { jobId, error: err?.message });
        });
      }
    }
  }

  /** Clears sync cache entries for the given scopes of a contract. */
  invalidateContractForScopes(contractAddress: AztecAddress, scopes: AztecAddress[]): void {
    if (scopes.length === 0) {
      return;
    }
    scopes.forEach(scope => this.syncedContracts.delete(toKey(contractAddress, scope)));
  }

  /** Clears sync cache. Called by BlockSynchronizer when anchor block changes. */
  wipe(): void {
    this.log.debug(`Wiping contract sync cache (${this.syncedContracts.size} entries)`);
    this.syncedContracts.clear();
  }

  commit(jobId: string): Promise<void> {
    this.callDependencies.commitJob(jobId);
    return Promise.resolve();
  }

  discardStaged(jobId: string): Promise<void> {
    this.callDependencies.discardJob(jobId);
    // We clear the synced contracts cache here because, when the job is discarded, any associated database writes from
    // the sync are also undone.
    this.syncedContracts.clear();
    return Promise.resolve();
  }

  /**
   * For each unsynced scope, creates a promise that waits on:
   *  1. Note nullifier sync (shared, batched across all unsynced scopes).
   *  2. Per-scope sync (individual, semaphore-bounded).
   */
  #startSyncIfNeeded(
    contractAddress: AztecAddress,
    scopes: AztecAddress[],
    anchorBlockHeader: BlockHeader,
    jobId: string,
    syncScopeFn: (scope: AztecAddress) => Promise<void>,
  ): void {
    const scopesToSync = scopes.filter(scope => !this.syncedContracts.has(toKey(contractAddress, scope)));
    if (scopesToSync.length === 0) {
      return;
    }

    this.log.debug(`Syncing contract ${contractAddress} for ${scopesToSync.length} scope(s)`);

    const syncNullifiersPromise = this.#syncNoteNullifiers(contractAddress, anchorBlockHeader, jobId, scopesToSync);

    // We build a new semaphore for each sync call, so it rate-limits the scopes within that single call. We do
    // this so that if these scope syncs trigger nested syncs, the nested ones can execute without causing a deadlock.
    const syncSlot = new Semaphore(MAX_CONCURRENT_SCOPE_SYNCS);

    for (const scope of scopesToSync) {
      const key = toKey(contractAddress, scope);
      const promise = Promise.all([syncNullifiersPromise, runBounded(syncSlot, () => syncScopeFn(scope))])
        .then(() => {})
        .catch(err => {
          this.syncedContracts.delete(key);
          throw err;
        });
      this.syncedContracts.set(key, promise);
    }
  }

  /** Syncs note nullifiers across all unsynced scopes in a single batched call. */
  async #syncNoteNullifiers(
    contractAddress: AztecAddress,
    anchorBlockHeader: BlockHeader,
    jobId: string,
    scopes: AztecAddress[],
  ): Promise<void> {
    // Protocol contracts don't have private state to sync
    if (isProtocolContract(contractAddress)) {
      return;
    }
    // This runs in parallel with per-scope sync (which also writes to the note store). That's safe because
    // the note store handles concurrent operations.
    const noteService = new NoteService(this.noteStore, this.aztecNode, anchorBlockHeader, jobId);
    await noteService.syncNoteNullifiers(contractAddress, scopes);
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

/** Runs fn while holding a slot in the given semaphore, bounding concurrent scope syncs within a single call. */
async function runBounded<T>(syncSlot: Semaphore, fn: () => Promise<T>): Promise<T> {
  await syncSlot.acquire();
  try {
    return await fn();
  } finally {
    syncSlot.release();
  }
}
