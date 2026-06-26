import { isProtocolContract } from '@aztec/protocol-contracts';
import type { FunctionCall, FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstance } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { ContractStore } from '../storage/contract_store/contract_store.js';

/**
 * Read the current class id of a contract as of the given block, as seen by the AztecNode. The node resolves it from
 * the same scheduled value change the AVM enforces against the public data tree. If the node has no record of the
 * instance (e.g. it was never publicly deployed), the original class id from the local instance is used.
 * @param contractAddress - The address of the contract to read the class id for.
 * @param instance - The local instance of the contract, used as a fallback when the node doesn't know it.
 * @param aztecNode - The Aztec node to query.
 * @param header - The header of the block at which to resolve the current class id.
 * @returns The current class id.
 */
export async function readCurrentClassId(
  contractAddress: AztecAddress,
  instance: ContractInstance,
  aztecNode: AztecNode,
  header: BlockHeader,
) {
  const nodeInstance = await aztecNode.getContract(contractAddress, await header.hash());
  // If the contract was upgraded then the node WILL know of that and return a non-undefined instance. An undefined
  // result therefore means that no upgrade has happened, and therefore that the original class is the current one.
  return nodeInstance?.currentContractClassId ?? instance.originalContractClassId;
}

export async function syncScope(
  contractAddress: AztecAddress,
  contractStore: ContractStore,
  functionToInvokeAfterSync: FunctionSelector | null,
  utilityExecutor: (privateSyncCall: FunctionCall, scopes: AztecAddress[]) => Promise<any>,
  scope: AztecAddress,
) {
  // Protocol contracts don't have private state to sync
  if (isProtocolContract(contractAddress)) {
    return;
  }

  const syncStateFunctionCall = await contractStore.getFunctionCall('sync_state', [scope], contractAddress);
  if (functionToInvokeAfterSync && functionToInvokeAfterSync.equals(syncStateFunctionCall.selector)) {
    throw new Error(
      'Forbidden `sync_state` invocation. `sync_state` can only be invoked by PXE, manual execution can lead to inconsistencies.',
    );
  }

  await utilityExecutor(syncStateFunctionCall, [scope]);
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
