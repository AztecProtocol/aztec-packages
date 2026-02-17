import { ProtocolContractAddress, isProtocolContract } from '@aztec/protocol-contracts';
import type { FunctionCall, FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstance } from '@aztec/stdlib/contract';
import { DelayedPublicMutableValues, DelayedPublicMutableValuesWithHash } from '@aztec/stdlib/delayed-public-mutable';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { AccessScopes } from '../access_scopes.js';
import { NoteService } from '../notes/note_service.js';
import type { ContractStore } from '../storage/contract_store/contract_store.js';
import type { NoteStore } from '../storage/note_store/note_store.js';

/**
 * Read the current class id of a contract from the execution data provider or AztecNode. If not found, class id
 * from the instance is used.
 * @param contractAddress - The address of the contract to read the class id for.
 * @param instance - The instance of the contract.
 * @param aztecNode - The Aztec node to query for storage.
 * @param header - The header of the block at which to load the DelayedPublicMutable storing the class id.
 * @returns The current class id.
 */
export async function readCurrentClassId(
  contractAddress: AztecAddress,
  instance: ContractInstance,
  aztecNode: AztecNode,
  header: BlockHeader,
) {
  const blockHash = await header.hash();
  const timestamp = header.globalVariables.timestamp;
  const { delayedPublicMutableSlot } = await DelayedPublicMutableValuesWithHash.getContractUpdateSlots(contractAddress);
  const delayedPublicMutableValues = await DelayedPublicMutableValues.readFromTree(delayedPublicMutableSlot, slot =>
    aztecNode.getPublicStorageAt(blockHash, ProtocolContractAddress.ContractInstanceRegistry, slot),
  );
  let currentClassId = delayedPublicMutableValues.svc.getCurrentAt(timestamp)[0];
  if (currentClassId.isZero()) {
    currentClassId = instance.originalContractClassId;
  }
  return currentClassId;
}

export async function syncState(
  contractAddress: AztecAddress,
  contractStore: ContractStore,
  functionToInvokeAfterSync: FunctionSelector | null,
  utilityExecutor: (privateSyncCall: FunctionCall, scopes: AccessScopes) => Promise<any>,
  noteStore: NoteStore,
  aztecNode: AztecNode,
  anchorBlockHeader: BlockHeader,
  jobId: string,
  scopes: AccessScopes,
) {
  // Protocol contracts don't have private state to sync
  if (!isProtocolContract(contractAddress)) {
    const syncStateFunctionCall = await contractStore.getFunctionCall('sync_state', [], contractAddress);
    if (functionToInvokeAfterSync && functionToInvokeAfterSync.equals(syncStateFunctionCall.selector)) {
      throw new Error(
        'Forbidden `sync_state` invocation. `sync_state` can only be invoked by PXE, manual execution can lead to inconsistencies.',
      );
    }

    const noteService = new NoteService(noteStore, aztecNode, anchorBlockHeader, jobId);

    // Both sync_state and syncNoteNullifiers interact with the note store, but running them in parallel is safe
    // because note store is designed to handle concurrent operations.
    await Promise.all([
      utilityExecutor(syncStateFunctionCall, scopes),
      noteService.syncNoteNullifiers(contractAddress, scopes),
    ]);
  }
}

/**
 * Verify that the current class id of a contract obtained from AztecNode is the same as the one in contract data
 * provider (i.e. PXE's own storage).
 * @param contractAddress - The address of the contract to verify.
 * @param aztecNode - The Aztec node to query for storage.
 * @param contractStore - The contract store to fetch the local instance from.
 * @param header - The header of the block at which to verify the current class id.
 */
export async function verifyCurrentClassId(
  contractAddress: AztecAddress,
  aztecNode: AztecNode,
  contractStore: ContractStore,
  header: BlockHeader,
) {
  const instance = await contractStore.getContractInstance(contractAddress);
  if (!instance) {
    throw new Error(`No contract instance found for address ${contractAddress.toString()}`);
  }

  const currentClassId = await readCurrentClassId(contractAddress, instance, aztecNode, header);
  if (!instance.currentContractClassId.equals(currentClassId)) {
    throw new Error(
      `Contract ${contractAddress} is outdated, current class id is ${currentClassId}, local class id is ${instance.currentContractClassId}`,
    );
  }
}
