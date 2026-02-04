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

  // Tracks contracts synced since last wipe. Key is contract address string, value is a promise that resolves when
  // the contract is synced.
  private syncedContracts: Map<string, Promise<void>> = new Map();

  // Per-job overridden contract addresses - these contracts should not be synced.
  private overriddenContracts: Map<string, Set<string>> = new Map();

  constructor(
    private aztecNode: AztecNode,
    private contractStore: ContractStore,
    private noteStore: NoteStore,
    private log: Logger,
  ) {}

  /** Sets contracts that should be skipped during sync for a specific job. */
  setOverriddenContracts(jobId: string, addresses: Set<string>): void {
    this.overriddenContracts.set(jobId, addresses);
  }

  /**
   * Ensures a contract's private state is synchronized and that the PXE holds the current class artifact.
   * Uses a cache to avoid redundant sync operations - the cache is wiped when the anchor block changes.
   * @param contractAddress - The address of the contract to sync.
   * @param functionToInvokeAfterSync - The function selector that will be called after sync (used to validate it's
   * not sync_state itself).
   * @param utilityExecutor - Executor function for running the sync_state utility function.
   */
  async ensureContractSynced(
    contractAddress: AztecAddress,
    functionToInvokeAfterSync: FunctionSelector | null,
    utilityExecutor: (call: FunctionCall) => Promise<any>,
    anchorBlockHeader: BlockHeader,
    jobId: string,
  ): Promise<void> {
    const key = contractAddress.toString();

    // Skip sync if this contract has an override for this job
    const overrides = this.overriddenContracts.get(jobId);
    if (overrides?.has(key)) {
      return;
    }

    const existing = this.syncedContracts.get(key);
    if (existing) {
      return existing;
    }

    const syncPromise = this.#doSync(
      contractAddress,
      functionToInvokeAfterSync,
      utilityExecutor,
      anchorBlockHeader,
      jobId,
    );
    this.syncedContracts.set(key, syncPromise);

    try {
      await syncPromise;
    } catch (err) {
      // There was an error syncing the contract, so we remove it from the cache so that it can be retried.
      this.syncedContracts.delete(key);
      throw err;
    }
  }

  async #doSync(
    contractAddress: AztecAddress,
    functionToInvokeAfterSync: FunctionSelector | null,
    utilityExecutor: (call: FunctionCall) => Promise<any>,
    anchorBlockHeader: BlockHeader,
    jobId: string,
  ): Promise<void> {
    this.log.debug(`Syncing contract ${contractAddress}`);
    await Promise.all([
      syncState(
        contractAddress,
        this.contractStore,
        functionToInvokeAfterSync,
        utilityExecutor,
        this.noteStore,
        this.aztecNode,
        anchorBlockHeader,
        jobId,
      ),
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
    // Clear overridden contracts for this job
    this.overriddenContracts.delete(jobId);
    return Promise.resolve();
  }

  discardStaged(jobId: string): Promise<void> {
    // We clear the synced contracts cache here because, when the job is discarded, any associated database writes from
    // the sync are also undone.
    this.syncedContracts.clear();
    this.overriddenContracts.delete(jobId);
    return Promise.resolve();
  }
}
