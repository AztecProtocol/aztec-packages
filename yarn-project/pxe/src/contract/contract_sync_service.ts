import type { Logger } from '@aztec/foundation/log';
import { Semaphore } from '@aztec/foundation/queue';
import { isProtocolContract } from '@aztec/protocol-contracts';
import type { FunctionCall, FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { ContractSyncConfig } from '../config/index.js';
import type { StagedStore } from '../job_coordinator/job_coordinator.js';
import { NoteService } from '../notes/note_service.js';
import type { ContractStore } from '../storage/contract_store/contract_store.js';
import type { NoteStore } from '../storage/note_store/note_store.js';
import { ContractCallGraph, type ContractFunction } from './contract_call_graph.js';
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
  // (`contractAddress:scopeAddress`). The value is a promise that resolves when the contract is synced.
  private readonly syncedContracts: Map<SyncKey, Promise<void>> = new Map();

  // job -> sync promises triggered by it. A speculative sync is not awaited by any request unless the job actually
  // uses its contract, so every sync is tracked here for `settle` to await before the job commits or discards.
  private readonly syncsTriggeredByJob: Map<JobId, Promise<void>[]> = new Map();

  // Predicts a function's callees from the calls observed in past jobs, driving speculative sync.
  private readonly callGraph: ContractCallGraph;

  constructor(
    private aztecNode: AztecNode,
    private contractStore: ContractStore,
    private contractClassService: ContractClassService,
    private noteStore: NoteStore,
    private log: Logger,
    { concurrentContractSyncEnabled }: ContractSyncConfig,
  ) {
    this.callGraph = new ContractCallGraph(concurrentContractSyncEnabled);
  }

  /**
   * Ensures a contract's private state is synchronized.
   * Uses a cache to avoid redundant sync operations - the cache is wiped when the anchor block changes.
   */
  async ensureContractSynced({
    contract,
    functionToInvokeAfterSync,
    utilityExecutor,
    anchorBlockHeader,
    jobId,
    scopes,
    triggeredBy,
  }: ContractSyncRequest): Promise<void> {
    // A call is recorded only when both functions are known: the invoked callee and the caller that triggered it.
    if (functionToInvokeAfterSync && triggeredBy) {
      this.callGraph.recordCall({
        jobId,
        caller: triggeredBy,
        callee: { address: contract, selector: functionToInvokeAfterSync },
      });
    }

    await this.#startSyncIfNeeded(
      contract,
      functionToInvokeAfterSync,
      utilityExecutor,
      anchorBlockHeader,
      jobId,
      scopes,
    );
  }

  /**
   * Waits until every sync the job started has settled, so all its staged writes land before the job's stores
   * commit or discard. Never rejects: sync failures are surfaced by the requests that await them, not here.
   */
  async settle(jobId: JobId): Promise<void> {
    const syncs = this.syncsTriggeredByJob.get(jobId);
    if (!syncs) {
      return;
    }
    // A settling sync can start more syncs, so drain until no new promises appear.
    while (syncs.length > 0) {
      await Promise.allSettled(syncs.splice(0));
    }
    this.syncsTriggeredByJob.delete(jobId);
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

  commit(jobId: JobId): Promise<void> {
    this.callGraph.commitJob(jobId);
    this.syncsTriggeredByJob.delete(jobId);
    return Promise.resolve();
  }

  discardStaged(jobId: JobId): Promise<void> {
    // We clear the synced contracts cache here because, when the job is discarded, any associated database writes from
    // the sync are also undone.
    this.syncedContracts.clear();
    this.callGraph.discardJob(jobId);
    this.syncsTriggeredByJob.delete(jobId);
    return Promise.resolve();
  }

  /**
   * For each unsynced scope, creates a promise that waits on:
   *  1. Note nullifier sync (shared, batched across all unsynced scopes).
   *  2. Per-scope sync (individual, semaphore-bounded).
   * When concurrent contract sync is enabled, the invoked function's predicted direct callees start speculatively
   * too, once the contract's own syncs have started (see {@link #speculativelySync}).
   * @returns A promise that resolves once every requested scope is synced, including syncs already in flight from
   * concurrent calls. Speculative syncs are not included: those are only awaited by a later request that needs
   * their contract, or by the job's {@link settle}.
   */
  async #startSyncIfNeeded(
    contractAddress: AztecAddress,
    functionToInvokeAfterSync: FunctionSelector | null,
    utilityExecutor: (call: FunctionCall, scopes: AztecAddress[]) => Promise<any>,
    anchorBlockHeader: BlockHeader,
    jobId: JobId,
    scopes: AztecAddress[],
  ): Promise<void> {
    const scopesToSync = scopes.filter(scope => !this.syncedContracts.has(toKey(contractAddress, scope)));
    if (scopesToSync.length > 0) {
      this.log.debug(`Syncing contract ${contractAddress} for ${scopesToSync.length} scope(s)`);

      const syncNullifiersPromise = this.#syncNoteNullifiers(contractAddress, anchorBlockHeader, jobId, scopesToSync);

      // We build a new semaphore for each sync call, so it rate-limits the scopes within that single call. We do
      // this so that if these scope syncs trigger nested syncs, the nested ones can execute without causing a deadlock.
      const syncSlot = new Semaphore(MAX_CONCURRENT_SCOPE_SYNCS);

      for (const scope of scopesToSync) {
        const key = toKey(contractAddress, scope);
        const syncScopePromise = runBounded(syncSlot, () =>
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
        const promise = Promise.all([syncNullifiersPromise, syncScopePromise])
          .then(() => {})
          .catch(err => {
            this.syncedContracts.delete(key);
            throw err;
          });
        this.syncedContracts.set(key, promise);

        let syncs = this.syncsTriggeredByJob.get(jobId);
        if (!syncs) {
          syncs = [];
          this.syncsTriggeredByJob.set(jobId, syncs);
        }
        syncs.push(promise);
      }

      this.#speculativelySync(
        contractAddress,
        functionToInvokeAfterSync,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes,
      );
    }

    await this.#awaitSync(contractAddress, scopes);
  }

  /**
   * Starts the syncs of the contracts whose functions the given function is predicted to call. Each fires its own
   * predictions in turn, so the whole predicted call tree syncs in parallel with the contract instead of one contract
   * at a time as execution reaches it (see {@link ContractCallGraph} for how the tree is learned).
   *
   * A wrong prediction is cheap: the extra node requests are batched into round trips the job already makes, and the
   * synced data simply goes unused. A prediction that fails to sync cannot fail a job that never needed it: the
   * failure only drops the sync from the memo, so a real request retries from scratch and the next job predicts the
   * callee again.
   */
  #speculativelySync(
    contractAddress: AztecAddress,
    functionToInvokeAfterSync: FunctionSelector | null,
    utilityExecutor: (call: FunctionCall, scopes: AztecAddress[]) => Promise<any>,
    anchorBlockHeader: BlockHeader,
    jobId: JobId,
    scopes: AztecAddress[],
  ): void {
    // Without a function there is no key to predict from (the request is a direct read).
    if (!functionToInvokeAfterSync) {
      return;
    }
    const caller = { address: contractAddress, selector: functionToInvokeAfterSync };
    // Callees are not de-duped: `#startSyncIfNeeded` is memoized per contract and scope, so a contract predicted by
    // several functions (or revisited by a cycle in the predicted tree) only syncs once.
    for (const callee of this.callGraph.predictDirectCallees(caller)) {
      // `settle` awaits these syncs, but only at the end of the job: catch here so a failure before then does not
      // become an unhandled rejection, and log it.
      this.#startSyncIfNeeded(callee.address, callee.selector, utilityExecutor, anchorBlockHeader, jobId, scopes).catch(
        err => {
          this.log.warn(`Speculative sync of ${callee.address} failed`, { jobId, error: err?.message });
        },
      );
    }
  }

  /** Syncs note nullifiers across all unsynced scopes in a single batched call. */
  async #syncNoteNullifiers(
    contractAddress: AztecAddress,
    anchorBlockHeader: BlockHeader,
    jobId: JobId,
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

/** A request to synchronize a contract's private state. */
type ContractSyncRequest = {
  /** The contract to sync. */
  contract: AztecAddress;
  /**
   * The function that will be invoked after the sync, or null when nothing will be invoked (e.g. reading
   * notes/events directly).
   */
  functionToInvokeAfterSync: FunctionSelector | null;
  /** Executes a utility function call under the given scopes. Syncs run each contract's sync_state through it. */
  utilityExecutor: (call: FunctionCall, scopes: AztecAddress[]) => Promise<any>;
  /** The anchor block to sync at. */
  anchorBlockHeader: BlockHeader;
  /** The job requesting the sync. */
  jobId: JobId;
  /** Access scopes to pass through to the utility executor (affects whose account's private state is discovered). */
  scopes: AztecAddress[];
  /**
   * The function whose execution triggered this sync request, or undefined when the request is a job's top-level use
   * (an entry call or a direct read) rather than a nested call.
   */
  triggeredBy: ContractFunction | undefined;
};

type JobId = string;

/** Key of a contract's sync cache entry for a single scope: `contractAddress:scopeAddress`. */
type SyncKey = `0x${string}:0x${string}`;

function toKey(contract: AztecAddress, scope: AztecAddress): SyncKey {
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
