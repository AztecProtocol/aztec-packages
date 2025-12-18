import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { KeyStore } from '@aztec/key-store';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { WASMSimulator } from '@aztec/simulator/client';
import { FunctionCall, FunctionSelector, FunctionType, encodeArguments } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import { CompleteAddress, type ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { Note, NoteDao } from '@aztec/stdlib/note';
import { BlockHeader, TxHash } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import {
  AddressDataProvider,
  AnchorBlockDataProvider,
  CapsuleDataProvider,
  ContractDataProvider,
  NoteDataProvider,
  PrivateEventDataProvider,
  RecipientTaggingDataProvider,
  SenderTaggingDataProvider,
} from '../../storage/index.js';
import { ContractFunctionSimulator } from '../contract_function_simulator.js';
import type { ExecutionDataProvider } from '../execution_data_provider.js';

describe('Utility Execution test suite', () => {
  const simulator = new WASMSimulator();

  let executionDataProvider: ReturnType<typeof mock<ExecutionDataProvider>>;
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
  let owner: AztecAddress;
  let anchorBlockHeader: BlockHeader;
  const ownerSecretKey = Fr.fromHexString('2dcc5485a58316776299be08c78fa3788a1a7961ae30dc747fb1be17692a8d32');

  const buildNote = (amount: bigint) => {
    return new Note([new Fr(amount)]);
  };

  beforeEach(async () => {
    executionDataProvider = mock<ExecutionDataProvider>();
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
    anchorBlockHeader = BlockHeader.random();
    anchorBlockDataProvider.getBlockHeader.mockImplementation(() => Promise.resolve(anchorBlockHeader));
    senderTaggingDataProvider.getLastFinalizedIndex.mockResolvedValue(undefined);
    senderTaggingDataProvider.getLastUsedIndex.mockResolvedValue(undefined);
    senderTaggingDataProvider.getTxHashesOfPendingIndexes.mockResolvedValue([]);
    senderTaggingDataProvider.storePendingIndexes.mockResolvedValue();
    recipientTaggingDataProvider.getSenderAddresses.mockResolvedValue([]);
    recipientTaggingDataProvider.getLastUsedIndexes.mockImplementation(secrets =>
      Promise.resolve(secrets.map(() => undefined)),
    );
    capsuleDataProvider.readCapsuleArray.mockResolvedValue([]);
    acirSimulator = new ContractFunctionSimulator(
      executionDataProvider,
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

    const ownerCompleteAddress = await CompleteAddress.fromSecretKeyAndPartialAddress(ownerSecretKey, Fr.random());
    owner = ownerCompleteAddress.address;
    keyStore.getAccounts.mockResolvedValue([owner]);

    addressDataProvider.getCompleteAddress.mockImplementation((account: AztecAddress) => {
      if (account.equals(owner)) {
        return Promise.resolve(ownerCompleteAddress);
      }
      throw new Error(`Unknown address ${account}`);
    });
  });

  it('should run the summed_values function on StatefulTestContractArtifact', async () => {
    const contractAddress = await AztecAddress.random();
    const artifact = {
      ...StatefulTestContractArtifact.functions.find(f => f.name === 'summed_values')!,
      contractName: StatefulTestContractArtifact.name,
    };

    const notes: Note[] = [...Array(5).fill(buildNote(1n)), ...Array(2).fill(buildNote(2n))];

    aztecNode.getPublicStorageAt.mockResolvedValue(Fr.ZERO);
    contractDataProvider.getFunctionArtifact.mockResolvedValue(artifact);
    contractDataProvider.getContractInstance.mockResolvedValue({
      currentContractClassId: new Fr(42),
      originalContractClassId: new Fr(42),
      address: contractAddress,
    } as ContractInstanceWithAddress);
    noteDataProvider.getNotes.mockResolvedValue(
      notes.map(
        (note, index) =>
          new NoteDao(
            note,
            contractAddress,
            owner,
            Fr.random(),
            Fr.random(),
            Fr.random(),
            Fr.random(),
            Fr.random(),
            TxHash.random(),
            BlockNumber(42),
            L2BlockHash.random().toString(),
            BigInt(index),
          ),
      ),
    );

    capsuleDataProvider.loadCapsule.mockImplementation((_, __) => Promise.resolve(null));

    const execRequest: FunctionCall = {
      name: artifact.name,
      to: contractAddress,
      selector: FunctionSelector.empty(),
      type: FunctionType.UTILITY,
      isStatic: false,
      hideMsgSender: false,
      args: encodeArguments(artifact, [owner]),
      returnTypes: artifact.returnTypes,
    };

    const result = await acirSimulator.runUtility(execRequest, [], anchorBlockHeader, []);

    expect(result).toEqual([new Fr(9)]);
  }, 30_000);
});
