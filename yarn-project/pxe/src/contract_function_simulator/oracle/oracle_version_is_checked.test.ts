import { Fr } from '@aztec/foundation/curves/bn254';
import { KeyStore } from '@aztec/key-store';
import { OracleVersionCheckContractArtifact } from '@aztec/noir-test-contracts.js/OracleVersionCheck';
import { WASMSimulator } from '@aztec/simulator/client';
import { FunctionCall, FunctionSelector, FunctionType, encodeArguments } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { GasFees, GasSettings } from '@aztec/stdlib/gas';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { BlockHeader, HashedValues, TxContext, TxExecutionRequest } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import type { AddressStore } from '../../storage/address_store/address_store.js';
import type { CapsuleStore } from '../../storage/capsule_store/capsule_store.js';
import type { ContractStore } from '../../storage/contract_store/contract_store.js';
import type { NoteStore } from '../../storage/note_store/note_store.js';
import type { PrivateEventStore } from '../../storage/private_event_store/private_event_store.js';
import type { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import type { SenderAddressBookStore } from '../../storage/tagging_store/sender_address_book_store.js';
import type { SenderTaggingStore } from '../../storage/tagging_store/sender_tagging_store.js';
import { ContractFunctionSimulator } from '../contract_function_simulator.js';
import { UtilityExecutionOracle } from './utility_execution_oracle.js';

describe('Oracle Version Check test suite', () => {
  const simulator = new WASMSimulator();

  let contractStore: ReturnType<typeof mock<ContractStore>>;
  let noteStore: ReturnType<typeof mock<NoteStore>>;
  let keyStore: ReturnType<typeof mock<KeyStore>>;
  let addressStore: ReturnType<typeof mock<AddressStore>>;
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  let senderTaggingStore: ReturnType<typeof mock<SenderTaggingStore>>;
  let recipientTaggingStore: ReturnType<typeof mock<RecipientTaggingStore>>;
  let senderAddressBookStore: ReturnType<typeof mock<SenderAddressBookStore>>;
  let capsuleStore: ReturnType<typeof mock<CapsuleStore>>;
  let privateEventStore: ReturnType<typeof mock<PrivateEventStore>>;
  let acirSimulator: ContractFunctionSimulator;
  let contractAddress: AztecAddress;
  let anchorBlockHeader: BlockHeader;
  let utilityAssertCompatibleOracleVersionSpy: jest.SpiedFunction<
    typeof UtilityExecutionOracle.prototype.utilityAssertCompatibleOracleVersion
  >;

  beforeEach(async () => {
    contractStore = mock<ContractStore>();
    noteStore = mock<NoteStore>();
    keyStore = mock<KeyStore>();
    addressStore = mock<AddressStore>();
    aztecNode = mock<AztecNode>();
    senderTaggingStore = mock<SenderTaggingStore>();
    recipientTaggingStore = mock<RecipientTaggingStore>();
    senderAddressBookStore = mock<SenderAddressBookStore>();
    capsuleStore = mock<CapsuleStore>();
    privateEventStore = mock<PrivateEventStore>();
    utilityAssertCompatibleOracleVersionSpy = jest.spyOn(
      UtilityExecutionOracle.prototype,
      'utilityAssertCompatibleOracleVersion',
    );
    utilityAssertCompatibleOracleVersionSpy.mockClear();

    aztecNode.getPublicStorageAt.mockResolvedValue(Fr.ZERO);
    anchorBlockHeader = BlockHeader.random();
    capsuleStore.loadCapsule.mockImplementation((_, __) => Promise.resolve(null));
    capsuleStore.readCapsuleArray.mockResolvedValue([]);
    senderTaggingStore.getLastFinalizedIndex.mockResolvedValue(undefined);
    senderTaggingStore.getLastUsedIndex.mockResolvedValue(undefined);
    senderTaggingStore.getTxHashesOfPendingIndexes.mockResolvedValue([]);
    senderTaggingStore.storePendingIndexes.mockResolvedValue();

    noteStore.getNotes.mockResolvedValue([]);
    keyStore.getAccounts.mockResolvedValue([]);

    contractAddress = await AztecAddress.random();

    contractStore.getContractInstance.mockResolvedValue({
      currentContractClassId: new Fr(42),
      originalContractClassId: new Fr(42),
      address: contractAddress,
    } as ContractInstanceWithAddress);
    contractStore.getFunctionArtifactWithDebugMetadata.mockImplementation(async (address, selector) => {
      const artifact = await contractStore.getFunctionArtifact(address, selector);
      if (!artifact) {
        throw new Error(`Function not found: ${selector.toString()} in contract ${address}`);
      }
      return { ...artifact, debug: undefined };
    });

    acirSimulator = new ContractFunctionSimulator(
      contractStore,
      noteStore,
      keyStore,
      addressStore,
      aztecNode,
      senderTaggingStore,
      recipientTaggingStore,
      senderAddressBookStore,
      capsuleStore,
      privateEventStore,
      simulator,
    );
  });

  describe('private function execution', () => {
    it('should call utilityAssertCompatibleOracleVersion oracle when private function is called', async () => {
      // Load the artifact of the OracleVersionCheck::private_function contract function and set up the relevant oracle handler
      const privateFunctionArtifact = {
        ...OracleVersionCheckContractArtifact.functions.find(f => f.name === 'private_function')!,
        contractName: OracleVersionCheckContractArtifact.name,
      };
      contractStore.getFunctionArtifact.mockResolvedValue(privateFunctionArtifact);

      // Form the execution request for the private function
      const selector = await FunctionSelector.fromNameAndParameters(
        'private_function',
        privateFunctionArtifact.parameters,
      );
      const hashedArguments = await HashedValues.fromArgs(encodeArguments(privateFunctionArtifact, []));
      const txRequest = TxExecutionRequest.from({
        origin: contractAddress,
        firstCallArgsHash: hashedArguments.hash,
        functionSelector: selector,
        txContext: TxContext.from({
          chainId: new Fr(10),
          version: new Fr(20),
          gasSettings: GasSettings.default({ maxFeesPerGas: new GasFees(10, 10) }),
        }),
        argsOfCalls: [hashedArguments],
        authWitnesses: [],
        capsules: [],
        salt: Fr.random(),
      });

      // Call the private function with arbitrary message sender and sender for tags
      const msgSender = await AztecAddress.random();
      const senderForTags = await AztecAddress.random();
      await acirSimulator.run(
        txRequest,
        contractAddress,
        selector,
        msgSender,
        anchorBlockHeader,
        senderForTags,
        undefined,
        'test',
      );

      expect(utilityAssertCompatibleOracleVersionSpy).toHaveBeenCalledTimes(1);
    }, 30_000);
  });

  describe('utility function execution', () => {
    it('should call utilityAssertCompatibleOracleVersion oracle when utility function is called', async () => {
      // Load the artifact of the OracleVersionCheck::utility_function contract function and set up the relevant oracle
      // handler
      const utilityFunctionArtifact = {
        ...OracleVersionCheckContractArtifact.functions.find(f => f.name === 'utility_function')!,
        contractName: OracleVersionCheckContractArtifact.name,
      };
      contractStore.getFunctionArtifact.mockResolvedValue(utilityFunctionArtifact);

      // Form the execution request for the utility function
      const execRequest: FunctionCall = {
        name: utilityFunctionArtifact.name,
        to: contractAddress,
        selector: FunctionSelector.empty(),
        type: FunctionType.UTILITY,
        isStatic: false,
        hideMsgSender: false,
        args: encodeArguments(utilityFunctionArtifact, []),
        returnTypes: utilityFunctionArtifact.returnTypes,
      };

      // Call the utility function
      await acirSimulator.runUtility(execRequest, [], anchorBlockHeader, [], 'test');

      expect(utilityAssertCompatibleOracleVersionSpy).toHaveBeenCalledTimes(1);
    }, 30_000);
  });
});
