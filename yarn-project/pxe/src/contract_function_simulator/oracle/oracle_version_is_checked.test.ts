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

import type { AddressDataProvider } from '../../storage/address_data_provider/address_data_provider.js';
import type { AnchorBlockDataProvider } from '../../storage/anchor_block_data_provider/anchor_block_data_provider.js';
import type { CapsuleDataProvider } from '../../storage/capsule_data_provider/capsule_data_provider.js';
import type { ContractDataProvider } from '../../storage/contract_data_provider/contract_data_provider.js';
import type { NoteDataProvider } from '../../storage/note_data_provider/note_data_provider.js';
import type { PrivateEventDataProvider } from '../../storage/private_event_data_provider/private_event_data_provider.js';
import type { RecipientTaggingDataProvider } from '../../storage/tagging_data_provider/recipient_tagging_data_provider.js';
import type { SenderTaggingDataProvider } from '../../storage/tagging_data_provider/sender_tagging_data_provider.js';
import { ContractFunctionSimulator } from '../contract_function_simulator.js';
import { UtilityExecutionOracle } from './utility_execution_oracle.js';

describe('Oracle Version Check test suite', () => {
  const simulator = new WASMSimulator();

  let contractDataProvider: ReturnType<typeof mock<ContractDataProvider>>;
  let noteDataProvider: ReturnType<typeof mock<NoteDataProvider>>;
  let keyStore: ReturnType<typeof mock<KeyStore>>;
  let addressDataProvider: ReturnType<typeof mock<AddressDataProvider>>;
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  let anchorBlockDataProvider: ReturnType<typeof mock<AnchorBlockDataProvider>>;
  let senderTaggingDataProvider: ReturnType<typeof mock<SenderTaggingDataProvider>>;
  let recipientTaggingDataProvider: ReturnType<typeof mock<RecipientTaggingDataProvider>>;
  let capsuleDataProvider: ReturnType<typeof mock<CapsuleDataProvider>>;
  let privateEventDataProvider: ReturnType<typeof mock<PrivateEventDataProvider>>;
  let acirSimulator: ContractFunctionSimulator;
  let contractAddress: AztecAddress;
  let anchorBlockHeader: BlockHeader;
  let utilityAssertCompatibleOracleVersionSpy: jest.SpiedFunction<
    typeof UtilityExecutionOracle.prototype.utilityAssertCompatibleOracleVersion
  >;

  beforeEach(async () => {
    contractDataProvider = mock<ContractDataProvider>();
    noteDataProvider = mock<NoteDataProvider>();
    keyStore = mock<KeyStore>();
    addressDataProvider = mock<AddressDataProvider>();
    aztecNode = mock<AztecNode>();
    anchorBlockDataProvider = mock<AnchorBlockDataProvider>();
    senderTaggingDataProvider = mock<SenderTaggingDataProvider>();
    recipientTaggingDataProvider = mock<RecipientTaggingDataProvider>();
    capsuleDataProvider = mock<CapsuleDataProvider>();
    privateEventDataProvider = mock<PrivateEventDataProvider>();
    utilityAssertCompatibleOracleVersionSpy = jest.spyOn(
      UtilityExecutionOracle.prototype,
      'utilityAssertCompatibleOracleVersion',
    );
    utilityAssertCompatibleOracleVersionSpy.mockClear();

    aztecNode.getPublicStorageAt.mockResolvedValue(Fr.ZERO);
    anchorBlockHeader = BlockHeader.random();
    anchorBlockDataProvider.getBlockHeader.mockResolvedValue(anchorBlockHeader);
    capsuleDataProvider.loadCapsule.mockImplementation((_, __) => Promise.resolve(null));
    capsuleDataProvider.readCapsuleArray.mockResolvedValue([]);
    senderTaggingDataProvider.getLastFinalizedIndex.mockResolvedValue(undefined);
    senderTaggingDataProvider.getLastUsedIndex.mockResolvedValue(undefined);
    senderTaggingDataProvider.getTxHashesOfPendingIndexes.mockResolvedValue([]);
    senderTaggingDataProvider.storePendingIndexes.mockResolvedValue();
    recipientTaggingDataProvider.getSenderAddresses.mockResolvedValue([]);
    recipientTaggingDataProvider.getLastUsedIndexes.mockImplementation(secrets =>
      Promise.resolve(secrets.map(() => undefined)),
    );
    noteDataProvider.getNotes.mockResolvedValue([]);
    keyStore.getAccounts.mockResolvedValue([]);

    contractAddress = await AztecAddress.random();

    contractDataProvider.getContractInstance.mockResolvedValue({
      currentContractClassId: new Fr(42),
      originalContractClassId: new Fr(42),
      address: contractAddress,
    } as ContractInstanceWithAddress);
    contractDataProvider.getFunctionArtifactWithDebugMetadata.mockImplementation(async (address, selector) => {
      const artifact = await contractDataProvider.getFunctionArtifact(address, selector);
      if (!artifact) {
        throw new Error(`Function not found: ${selector.toString()} in contract ${address}`);
      }
      return { ...artifact, debug: undefined };
    });

    acirSimulator = new ContractFunctionSimulator(
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
  });

  describe('private function execution', () => {
    it('should call utilityAssertCompatibleOracleVersion oracle when private function is called', async () => {
      // Load the artifact of the OracleVersionCheck::private_function contract function and set up the relevant oracle handler
      const privateFunctionArtifact = {
        ...OracleVersionCheckContractArtifact.functions.find(f => f.name === 'private_function')!,
        contractName: OracleVersionCheckContractArtifact.name,
      };
      contractDataProvider.getFunctionArtifact.mockResolvedValue(privateFunctionArtifact);

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
      await acirSimulator.run(txRequest, contractAddress, selector, msgSender, anchorBlockHeader, senderForTags);

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
      contractDataProvider.getFunctionArtifact.mockResolvedValue(utilityFunctionArtifact);

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
      await acirSimulator.runUtility(execRequest, [], anchorBlockHeader, []);

      expect(utilityAssertCompatibleOracleVersionSpy).toHaveBeenCalledTimes(1);
    }, 30_000);
  });
});
