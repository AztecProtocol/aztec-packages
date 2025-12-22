import type { KeyStore } from '@aztec/key-store';
import type {
  AddressDataProvider,
  AnchorBlockDataProvider,
  CapsuleDataProvider,
  ContractDataProvider,
  NoteDataProvider,
  PrivateEventDataProvider,
  RecipientTaggingDataProvider,
  SenderTaggingDataProvider,
} from '@aztec/pxe/server';
import { WASMSimulator } from '@aztec/simulator/client';
import type { FunctionCall } from '@aztec/stdlib/abi';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { BlockHeader } from '@aztec/stdlib/tx';

import { ContractFunctionSimulator } from '../../../pxe/src/contract_function_simulator/contract_function_simulator.js';

type UtilityExecutorDeps = {
  contractDataProvider: ContractDataProvider;
  noteDataProvider: NoteDataProvider;
  keyStore: KeyStore;
  addressDataProvider: AddressDataProvider;
  aztecNode: AztecNode;
  anchorBlockDataProvider: AnchorBlockDataProvider;
  senderTaggingDataProvider: SenderTaggingDataProvider;
  recipientTaggingDataProvider: RecipientTaggingDataProvider;
  capsuleDataProvider: CapsuleDataProvider;
  privateEventDataProvider: PrivateEventDataProvider;
  anchorBlockHeader: BlockHeader;
  simulator?: WASMSimulator;
};

export function createUtilityExecutor({
  contractDataProvider,
  noteDataProvider,
  keyStore,
  addressDataProvider,
  aztecNode,
  anchorBlockDataProvider,
  senderTaggingDataProvider,
  recipientTaggingDataProvider,
  capsuleDataProvider,
  privateEventDataProvider,
  anchorBlockHeader,
  simulator = new WASMSimulator(),
}: UtilityExecutorDeps) {
  const contractFunctionSimulator = new ContractFunctionSimulator(
    contractDataProvider,
    noteDataProvider,
    keyStore,
    addressDataProvider,
    aztecNode,
    anchorBlockDataProvider,
    senderTaggingDataProvider,
    recipientTaggingDataProvider,
    capsuleDataProvider,
    privateEventDataProvider,
    simulator,
  );
  const utilityExecutor = async (call: FunctionCall) => {
    await contractFunctionSimulator.runUtility(call, [], anchorBlockHeader);
  };

  return { simulator, contractFunctionSimulator, utilityExecutor };
}
