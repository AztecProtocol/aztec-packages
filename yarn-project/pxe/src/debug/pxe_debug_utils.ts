import type { FunctionCall } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { NoteDao } from '@aztec/stdlib/note';
import type { BlockHeader, ContractOverrides } from '@aztec/stdlib/tx';

import type { ContractSyncService } from '../contract/contract_sync_service.js';
import type { ContractFunctionSimulator } from '../contract_function_simulator/contract_function_simulator.js';
import type { NotesFilter } from '../notes_filter.js';
import type { SyncedOperationContext } from '../operation_queue.js';
import type { NoteStore } from '../storage/note_store/note_store.js';
import type { ChangeSetId } from '../storage/staged_write_coordinator.js';

/**
 * Methods provided by this class might help debugging but must not be used in production.
 * No backwards compatibility or API stability should be expected. Use at your own risk.
 */
export class PXEDebugUtils {
  #runSyncedOperation!: <T>(operation: (ctx: SyncedOperationContext) => Promise<T>) => Promise<T>;
  #getSimulatorForTx!: (overrides?: { contracts?: ContractOverrides }) => ContractFunctionSimulator;
  #executeUtility!: (
    contractFunctionSimulator: ContractFunctionSimulator,
    call: FunctionCall,
    authWitnesses: AuthWitness[] | undefined,
    scopes: AztecAddress[],
    anchorBlockHeader: BlockHeader,
    changeSetId: ChangeSetId,
  ) => Promise<any>;

  constructor(
    private contractSyncService: ContractSyncService,
    private noteStore: NoteStore,
  ) {}

  /** Not injected through constructor since they're are co-dependant */
  public setPXEHelpers(
    runSyncedOperation: <T>(operation: (ctx: SyncedOperationContext) => Promise<T>) => Promise<T>,
    getSimulatorForTx: (overrides?: { contracts?: ContractOverrides }) => ContractFunctionSimulator,
    executeUtility: (
      contractFunctionSimulator: ContractFunctionSimulator,
      call: FunctionCall,
      authWitnesses: AuthWitness[] | undefined,
      scopes: AztecAddress[],
      anchorBlockHeader: BlockHeader,
      changeSetId: ChangeSetId,
    ) => Promise<any>,
  ) {
    this.#runSyncedOperation = runSyncedOperation;
    this.#getSimulatorForTx = getSimulatorForTx;
    this.#executeUtility = executeUtility;
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
    return this.#runSyncedOperation(async ({ changeSetId, anchorBlockHeader }) => {
      const contractFunctionSimulator = this.#getSimulatorForTx();

      await this.contractSyncService.ensureContractSynced({
        contract: filter.contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor: async (privateSyncCall, execScopes) =>
          await this.#executeUtility(
            contractFunctionSimulator,
            privateSyncCall,
            [],
            execScopes,
            anchorBlockHeader,
            changeSetId,
          ),
        anchorBlockHeader,
        changeSetId,
        scopes: filter.scopes,
        triggeredBy: undefined,
      });

      return this.noteStore.getNotes(filter, changeSetId);
    });
  }
}
