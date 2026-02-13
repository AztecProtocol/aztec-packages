import type { FunctionCall } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { NoteDao } from '@aztec/stdlib/note';
import type { ContractOverrides } from '@aztec/stdlib/tx';

import type { AccessScopes } from '../access_scopes.js';
import type { BlockSynchronizer } from '../block_synchronizer/block_synchronizer.js';
import type { ContractFunctionSimulator } from '../contract_function_simulator/contract_function_simulator.js';
import type { ContractSyncService } from '../contract_sync/contract_sync_service.js';
import type { NotesFilter } from '../notes_filter.js';
import type { AnchorBlockStore } from '../storage/index.js';
import type { NoteStore } from '../storage/note_store/note_store.js';

/**
 * Methods provided by this class might help debugging but must not be used in production.
 * No backwards compatibility or API stability should be expected. Use at your own risk.
 */
export class PXEDebugUtils {
  #putJobInQueue!: <T>(job: (jobId: string) => Promise<T>) => Promise<T>;
  #getSimulatorForTx!: (overrides?: { contracts?: ContractOverrides }) => ContractFunctionSimulator;
  #simulateUtility!: (
    contractFunctionSimulator: ContractFunctionSimulator,
    call: FunctionCall,
    authWitnesses: AuthWitness[] | undefined,
    scopes: AccessScopes,
    jobId: string,
  ) => Promise<any>;

  constructor(
    private contractSyncService: ContractSyncService,
    private noteStore: NoteStore,
    private blockStateSynchronizer: BlockSynchronizer,
    private anchorBlockStore: AnchorBlockStore,
  ) {}

  /** Not injected through constructor since they're are co-dependant */
  public setPXEHelpers(
    putJobInQueue: <T>(job: (jobId: string) => Promise<T>) => Promise<T>,
    getSimulatorForTx: (overrides?: { contracts?: ContractOverrides }) => ContractFunctionSimulator,
    simulateUtility: (
      contractFunctionSimulator: ContractFunctionSimulator,
      call: FunctionCall,
      authWitnesses: AuthWitness[] | undefined,
      scopes: AccessScopes,
      jobId: string,
    ) => Promise<any>,
  ) {
    this.#putJobInQueue = putJobInQueue;
    this.#getSimulatorForTx = getSimulatorForTx;
    this.#simulateUtility = simulateUtility;
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
  public getNotes(filter: NotesFilter): Promise<NoteDao[]> {
    return this.#putJobInQueue(async (jobId: string) => {
      await this.blockStateSynchronizer.sync();

      const anchorBlockHeader = await this.anchorBlockStore.getBlockHeader();

      const contractFunctionSimulator = this.#getSimulatorForTx();

      await this.contractSyncService.ensureContractSynced(
        filter.contractAddress,
        null,
        async (privateSyncCall, execScopes) =>
          await this.#simulateUtility(contractFunctionSimulator, privateSyncCall, [], execScopes, jobId),
        anchorBlockHeader,
        jobId,
        filter.scopes,
      );

      return this.noteStore.getNotes(filter, jobId);
    });
  }

  /**
   * Triggers a sync of the PXE with the node.
   * Blocks until the sync is complete.
   */
  public sync(): Promise<void> {
    return this.#putJobInQueue(() => this.blockStateSynchronizer.sync());
  }
}
