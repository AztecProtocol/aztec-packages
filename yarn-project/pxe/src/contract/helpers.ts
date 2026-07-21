import type { FunctionCall, FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { ContractStore } from '../storage/contract_store/contract_store.js';
import type { ContractClassService } from './contract_class_service.js';
import { isSkipSyncContract } from './skip_sync_contracts.js';

export async function syncScope(
  contractAddress: AztecAddress,
  contractStore: ContractStore,
  contractClassService: ContractClassService,
  anchorBlockHeader: BlockHeader,
  functionToInvokeAfterSync: FunctionSelector | null,
  utilityExecutor: (privateSyncCall: FunctionCall, scopes: AztecAddress[]) => Promise<any>,
  scope: AztecAddress,
) {
  // Some canonical contracts hold no private state, so there is nothing to sync (see `skipSyncContracts`).
  if (isSkipSyncContract(contractAddress)) {
    return;
  }

  const classId = await contractClassService.getCurrentClassId(contractAddress, anchorBlockHeader);
  if (!classId) {
    throw new Error(`Cannot sync contract ${contractAddress}: its instance is not registered nor published.`);
  }
  const syncStateFunctionCall = await contractStore.getFunctionCall('sync_state', [scope], contractAddress, classId);
  if (functionToInvokeAfterSync && functionToInvokeAfterSync.equals(syncStateFunctionCall.selector)) {
    throw new Error(
      'Forbidden `sync_state` invocation. `sync_state` can only be invoked by PXE, manual execution can lead to inconsistencies.',
    );
  }

  await utilityExecutor(syncStateFunctionCall, [scope]);
}
