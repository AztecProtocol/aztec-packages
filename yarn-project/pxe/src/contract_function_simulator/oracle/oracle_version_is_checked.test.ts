import { MAX_PROCESSABLE_L2_GAS, MAX_TX_DA_GAS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { KeyStore } from '@aztec/key-store';
import { OracleVersionCheckContractArtifact } from '@aztec/noir-test-contracts.js/OracleVersionCheck';
import { WASMSimulator } from '@aztec/simulator/client';
import { FunctionCall, FunctionSelector, FunctionType, encodeArguments } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2TipsProvider } from '@aztec/stdlib/block';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { BlockHeader, CallContext, HashedValues, TxContext, TxExecutionRequest } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import type { ContractClassService } from '../../contract/contract_class_service.js';
import type { ContractSyncService } from '../../contract/contract_sync_service.js';
import type { MessageContextService } from '../../messages/message_context_service.js';
import { ORACLE_VERSION_MAJOR, ORACLE_VERSION_MINOR } from '../../oracle_version.js';
import type { AddressStore } from '../../storage/address_store/address_store.js';
import { CapsuleService } from '../../storage/capsule_store/capsule_service.js';
import type { CapsuleStore } from '../../storage/capsule_store/capsule_store.js';
import type { ContractStore } from '../../storage/contract_store/contract_store.js';
import type { NoteStore } from '../../storage/note_store/note_store.js';
import type { PrivateEventStore } from '../../storage/private_event_store/private_event_store.js';
import type { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import type { SenderTaggingStore } from '../../storage/tagging_store/sender_tagging_store.js';
import type { TaggingSecretSourcesStore } from '../../storage/tagging_store/tagging_secret_sources_store.js';
import { AnchoredContractData } from '../anchored_contract_data.js';
import { ContractFunctionSimulator } from '../contract_function_simulator.js';
import { TransientArrayService } from '../transient_array_service.js';
import { buildACIRCallback } from './acir_callback.js';
import { UtilityExecutionOracle } from './utility_execution_oracle.js';

describe('Oracle Version Check test suite', () => {
  const simulator = new WASMSimulator();

  let contractStore: ReturnType<typeof mock<ContractStore>>;
  let contractClassService: ReturnType<typeof mock<ContractClassService>>;
  let noteStore: ReturnType<typeof mock<NoteStore>>;
  let keyStore: ReturnType<typeof mock<KeyStore>>;
  let addressStore: ReturnType<typeof mock<AddressStore>>;
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  let senderTaggingStore: ReturnType<typeof mock<SenderTaggingStore>>;
  let recipientTaggingStore: ReturnType<typeof mock<RecipientTaggingStore>>;
  let taggingSecretSourcesStore: ReturnType<typeof mock<TaggingSecretSourcesStore>>;
  let capsuleStore: ReturnType<typeof mock<CapsuleStore>>;
  let privateEventStore: ReturnType<typeof mock<PrivateEventStore>>;
  let contractSyncService: ReturnType<typeof mock<ContractSyncService>>;
  let messageContextService: ReturnType<typeof mock<MessageContextService>>;
  let l2TipsStore: ReturnType<typeof mock<L2TipsProvider>>;
  let acirSimulator: ContractFunctionSimulator;
  let contractAddress: AztecAddress;
  let anchorBlockHeader: BlockHeader;
  let assertCompatibleOracleVersionSpy: jest.SpiedFunction<
    typeof UtilityExecutionOracle.prototype.assertCompatibleOracleVersion
  >;

  beforeEach(async () => {
    contractStore = mock<ContractStore>();
    noteStore = mock<NoteStore>();
    keyStore = mock<KeyStore>();
    addressStore = mock<AddressStore>();
    aztecNode = mock<AztecNode>();
    senderTaggingStore = mock<SenderTaggingStore>();
    recipientTaggingStore = mock<RecipientTaggingStore>();
    taggingSecretSourcesStore = mock<TaggingSecretSourcesStore>();
    capsuleStore = mock<CapsuleStore>();
    privateEventStore = mock<PrivateEventStore>();
    contractSyncService = mock<ContractSyncService>();
    messageContextService = mock<MessageContextService>();
    l2TipsStore = mock<L2TipsProvider>();
    assertCompatibleOracleVersionSpy = jest.spyOn(UtilityExecutionOracle.prototype, 'assertCompatibleOracleVersion');
    assertCompatibleOracleVersionSpy.mockClear();

    aztecNode.getPublicStorageAt.mockResolvedValue(Fr.ZERO);
    anchorBlockHeader = BlockHeader.random();
    capsuleStore.getCapsule.mockImplementation((_, __) => Promise.resolve(null));
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
    contractStore.getFunctionArtifactWithDebugMetadata.mockImplementation(async (classId, selector) => {
      const artifact = await contractStore.getFunctionArtifact(classId, selector);
      if (!artifact) {
        throw new Error(`Function not found: ${selector.toString()} in contract class ${classId}`);
      }
      return { ...artifact, debug: undefined };
    });

    contractClassService = mock<ContractClassService>();
    contractClassService.getCurrentClassId.mockResolvedValue(new Fr(42));

    acirSimulator = new ContractFunctionSimulator({
      contractStore,
      contractClassService,
      noteStore,
      keyStore,
      addressStore,
      aztecNode,
      l2TipsStore: mock(),
      senderTaggingStore,
      recipientTaggingStore,
      taggingSecretSourcesStore,
      capsuleStore,
      privateEventStore,
      simulator,
      contractSyncService,
      messageContextService,
    });
  });

  describe('private function execution', () => {
    it('should call assertCompatibleOracleVersion oracle when private function is called', async () => {
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
          gasSettings: GasSettings.fallback({
            gasLimits: new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS),
            maxFeesPerGas: new GasFees(10, 10),
          }),
        }),
        argsOfCalls: [hashedArguments],
        authWitnesses: [],
        capsules: [],
        salt: Fr.random(),
      });

      // Call the private function with arbitrary message sender and sender for tags
      const msgSender = await AztecAddress.random();
      const senderForTags = await AztecAddress.random();
      await acirSimulator.run(txRequest, {
        msgSender,
        anchorBlockHeader,
        senderForTags,
        jobId: 'test',
        scopes: [],
      });

      expect(assertCompatibleOracleVersionSpy).toHaveBeenCalledTimes(1);
    }, 30_000);
  });

  describe('utility function execution', () => {
    it('should call assertCompatibleOracleVersion oracle when utility function is called', async () => {
      // Load the artifact of the OracleVersionCheck::utility_function contract function and set up the relevant oracle
      // handler
      const utilityFunctionArtifact = {
        ...OracleVersionCheckContractArtifact.functions.find(f => f.name === 'utility_function')!,
        contractName: OracleVersionCheckContractArtifact.name,
      };
      contractStore.getFunctionArtifact.mockResolvedValue(utilityFunctionArtifact);

      // Form the execution request for the utility function
      const execRequest = FunctionCall.from({
        name: utilityFunctionArtifact.name,
        to: contractAddress,
        selector: FunctionSelector.empty(),
        type: FunctionType.UTILITY,
        hideMsgSender: false,
        isStatic: false,
        args: encodeArguments(utilityFunctionArtifact, []),
        returnTypes: utilityFunctionArtifact.returnTypes,
      });

      // Call the utility function
      await acirSimulator.runUtility(execRequest, [], anchorBlockHeader, [], 'test');

      expect(assertCompatibleOracleVersionSpy).toHaveBeenCalledTimes(1);
    }, 30_000);
  });

  describe('oracle version mismatch error messages', () => {
    let oracle: UtilityExecutionOracle;

    beforeEach(() => {
      oracle = new UtilityExecutionOracle({
        callContext: new CallContext(AztecAddress.NULL_MSG_SENDER, contractAddress, FunctionSelector.empty(), true),
        authWitnesses: [],
        capsules: [],
        anchorBlockHeader,
        anchoredContractData: new AnchoredContractData(contractStore, contractClassService, anchorBlockHeader),
        noteStore,
        keyStore,
        addressStore,
        aztecNode,
        recipientTaggingStore,
        taggingSecretSourcesStore,
        capsuleService: new CapsuleService(capsuleStore, []),
        privateEventStore,
        messageContextService,
        contractSyncService,
        jobId: 'test',
        scopes: [],
        l2TipsStore,
        simulator,
        utilityExecutor: () => Promise.resolve(),
        transientArrayService: new TransientArrayService(),
      });
    });

    it('suggests upgrading PXE when contract major oracle version is newer', () => {
      const newerMajor = ORACLE_VERSION_MAJOR + 1;
      expect(() => oracle.assertCompatibleOracleVersion(newerMajor, ORACLE_VERSION_MINOR)).toThrow(
        /Incompatible private environment version:.*Upgrade your private environment to a compatible version.*See https:\/\/docs\.aztec\.network\/errors\/8/,
      );
    });

    it('suggests recompiling the contract when contract major oracle version is older', () => {
      const olderMajor = ORACLE_VERSION_MAJOR - 1;
      expect(() => oracle.assertCompatibleOracleVersion(olderMajor, ORACLE_VERSION_MINOR)).toThrow(
        /Incompatible private environment version:.*Recompile the contract with a compatible version of Aztec\.nr.*See https:\/\/docs\.aztec\.network\/errors\/8/,
      );
    });

    it('does not throw when major version matches', () => {
      expect(() => oracle.assertCompatibleOracleVersion(ORACLE_VERSION_MAJOR, ORACLE_VERSION_MINOR)).not.toThrow();
    });

    it('does not throw when contract minor version is higher than PXE minor version', () => {
      // We don't throw if AZTEC_NR_MINOR > PXE_MINOR because if a contract is updated to use a newer Aztec.nr
      // dependency without actually using any of the new oracles then there is no reason to throw.
      const higherMinor = ORACLE_VERSION_MINOR + 5;
      expect(() => oracle.assertCompatibleOracleVersion(ORACLE_VERSION_MAJOR, higherMinor)).not.toThrow();
    });

    it('stores the contract oracle version for later diagnostics', () => {
      oracle.assertCompatibleOracleVersion(ORACLE_VERSION_MAJOR, 3);
      expect(oracle.nonOracleFunctionGetContractOracleVersion()).toEqual({ major: ORACLE_VERSION_MAJOR, minor: 3 });
    });

    it('provides enhanced error when oracle not found and contract minor > PXE minor', () => {
      // Register a higher minor version (contract expects oracles the PXE doesn't have)
      oracle.assertCompatibleOracleVersion(ORACLE_VERSION_MAJOR, ORACLE_VERSION_MINOR + 1);

      // Build the ACIR callback and try to call a non-existent oracle
      const callback = buildACIRCallback(oracle);
      const contractVersion = `${ORACLE_VERSION_MAJOR}\\.${ORACLE_VERSION_MINOR + 1}`;
      const pxeVersion = `${ORACLE_VERSION_MAJOR}\\.${ORACLE_VERSION_MINOR}`;
      expect(() => callback['aztec_utl_someNewOracle']()).toThrow(
        new RegExp(
          `Oracle 'aztec_utl_someNewOracle' not found\\. This usually means the contract requires a newer private execution environment than you have\\. Upgrade your private execution environment to a compatible version\\. The contract was compiled with Aztec\\.nr oracle version ${contractVersion}, but this private execution environment only supports up to ${pxeVersion}\\.`,
        ),
      );
    });

    it('suggests contract bug when oracle not found and contract minor <= PXE minor', () => {
      const contractMinor = 0;
      oracle.assertCompatibleOracleVersion(ORACLE_VERSION_MAJOR, contractMinor);

      const callback = buildACIRCallback(oracle);
      expect(() => callback['aztec_utl_someNewOracle']()).toThrow(
        new RegExp(
          `Oracle 'aztec_utl_someNewOracle' not found\\. The contract's oracle version \\(${ORACLE_VERSION_MAJOR}\\.${contractMinor}\\) is compatible with this private execution environment \\(${ORACLE_VERSION_MAJOR}\\.${ORACLE_VERSION_MINOR}\\), so all standard oracles should be available\\. This could mean the contract was compiled against a modified version of Aztec\\.nr, or that it references an oracle that does not exist\\.`,
        ),
      );
    });
  });
});
