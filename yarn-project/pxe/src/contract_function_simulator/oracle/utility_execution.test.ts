import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import type { KeyStore } from '@aztec/key-store';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { WASMSimulator } from '@aztec/simulator/client';
import { FunctionCall, FunctionSelector, FunctionType, encodeArguments } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import { CompleteAddress, type ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { deriveKeys } from '@aztec/stdlib/keys';
import { Note, NoteDao } from '@aztec/stdlib/note';
import { makeL2Tips } from '@aztec/stdlib/testing';
import { BlockHeader, GlobalVariables, TxHash } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';
import type { _MockProxy } from 'jest-mock-extended/lib/Mock.js';

import type { AddressStore } from '../../storage/address_store/address_store.js';
import type { AnchorBlockStore } from '../../storage/anchor_block_store/anchor_block_store.js';
import type { CapsuleStore } from '../../storage/capsule_store/capsule_store.js';
import type { ContractStore } from '../../storage/contract_store/contract_store.js';
import type { NoteStore } from '../../storage/note_store/note_store.js';
import type { PrivateEventStore } from '../../storage/private_event_store/private_event_store.js';
import type { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import type { SenderAddressBookStore } from '../../storage/tagging_store/sender_address_book_store.js';
import type { SenderTaggingStore } from '../../storage/tagging_store/sender_tagging_store.js';
import { ContractFunctionSimulator } from '../contract_function_simulator.js';
import { UtilityExecutionOracle } from './utility_execution_oracle.js';

describe('Utility Execution test suite', () => {
  const simulator = new WASMSimulator();

  let contractStore: ReturnType<typeof mock<ContractStore>>;
  let noteStore: ReturnType<typeof mock<NoteStore>>;
  let keyStore: ReturnType<typeof mock<KeyStore>>;
  let addressStore: ReturnType<typeof mock<AddressStore>>;
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  let anchorBlockStore: ReturnType<typeof mock<AnchorBlockStore>>;
  let senderTaggingStore: ReturnType<typeof mock<SenderTaggingStore>>;
  let recipientTaggingStore: ReturnType<typeof mock<RecipientTaggingStore>>;
  let senderAddressBookStore: ReturnType<typeof mock<SenderAddressBookStore>>;
  let capsuleStore: ReturnType<typeof mock<CapsuleStore>>;
  let privateEventStore: ReturnType<typeof mock<PrivateEventStore>>;
  let acirSimulator: ContractFunctionSimulator;
  let owner: AztecAddress;
  let ownerCompleteAddress: CompleteAddress;
  let anchorBlockHeader: BlockHeader;
  const ownerSecretKey = Fr.fromHexString('2dcc5485a58316776299be08c78fa3788a1a7961ae30dc747fb1be17692a8d32');

  const buildNote = (amount: bigint) => {
    return new Note([new Fr(amount)]);
  };

  beforeEach(async () => {
    contractStore = mock<ContractStore>();
    noteStore = mock<NoteStore>();
    keyStore = mock<KeyStore>();
    addressStore = mock<AddressStore>();
    aztecNode = mock<AztecNode>();
    anchorBlockStore = mock<AnchorBlockStore>();
    senderTaggingStore = mock<SenderTaggingStore>();
    recipientTaggingStore = mock<RecipientTaggingStore>();
    senderAddressBookStore = mock<SenderAddressBookStore>();
    capsuleStore = mock<CapsuleStore>();
    privateEventStore = mock<PrivateEventStore>();
    const capsuleArrays = new Map<string, Fr[][]>();
    anchorBlockHeader = BlockHeader.random();
    anchorBlockStore.getBlockHeader.mockImplementation(() => Promise.resolve(anchorBlockHeader));
    senderTaggingStore.getLastFinalizedIndex.mockResolvedValue(undefined);
    senderTaggingStore.getLastUsedIndex.mockResolvedValue(undefined);
    senderTaggingStore.getTxHashesOfPendingIndexes.mockResolvedValue([]);
    senderTaggingStore.storePendingIndexes.mockResolvedValue();
    senderAddressBookStore.getSenders.mockResolvedValue([]);

    // Mock getL2Tips and getBlockHeader for loadPrivateLogsForSenderRecipientPair
    aztecNode.getL2Tips.mockResolvedValue(makeL2Tips(anchorBlockHeader.globalVariables.blockNumber));
    aztecNode.getBlockHeader.mockImplementation((blockNumber: BlockNumber | 'latest') => {
      if (blockNumber === 'latest') {
        return Promise.resolve(anchorBlockHeader);
      }
      return Promise.resolve(anchorBlockHeader);
    });
    aztecNode.getPrivateLogsByTags.mockImplementation((tags: any[]) => Promise.resolve(tags.map(() => [])));

    capsuleStore.setCapsuleArray.mockImplementation((address, slot, content) => {
      capsuleArrays.set(`${address.toString()}:${slot.toString()}`, content);
      return Promise.resolve();
    });
    capsuleStore.readCapsuleArray.mockImplementation((address, slot) => {
      return Promise.resolve(capsuleArrays.get(`${address.toString()}:${slot.toString()}`) ?? []);
    });
    acirSimulator = new ContractFunctionSimulator(
      contractStore,
      noteStore,
      keyStore,
      addressStore,
      aztecNode,
      anchorBlockStore,
      senderTaggingStore,
      recipientTaggingStore,
      senderAddressBookStore,
      capsuleStore,
      privateEventStore,
      simulator,
    );

    const ownerPartialAddress = Fr.random();
    ownerCompleteAddress = await CompleteAddress.fromSecretKeyAndPartialAddress(ownerSecretKey, ownerPartialAddress);
    owner = ownerCompleteAddress.address;

    // Derive keys to get the incoming viewing secret key
    const { masterIncomingViewingSecretKey: ownerIvskM } = await deriveKeys(ownerSecretKey);

    keyStore.getAccounts.mockResolvedValue([owner]);

    // Mock getMasterIncomingViewingSecretKey to return a valid scalar
    // This is needed when LogService tries to compute directional app tagging secrets
    keyStore.getMasterIncomingViewingSecretKey.mockImplementation((address: AztecAddress) => {
      if (address.equals(owner)) {
        return Promise.resolve(ownerIvskM);
      }
      // Return a default value for any other address
      return Promise.resolve(GrumpkinScalar.random());
    });

    addressStore.getCompleteAddress.mockImplementation((account: AztecAddress) => {
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
    contractStore.getFunctionArtifact.mockResolvedValue(artifact);
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
    noteStore.getNotes.mockResolvedValue(
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

    capsuleStore.loadCapsule.mockImplementation((_, __) => Promise.resolve(null));

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

    const result = await acirSimulator.runUtility(execRequest, [], anchorBlockHeader, [], 'test-job-id');

    expect(result).toEqual([new Fr(9)]);
  }, 30_000);

  describe('UtilityExecutionOracle', () => {
    let contractAddress: AztecAddress;
    let utilityExecutionOracle: UtilityExecutionOracle;
    const syncedBlockNumber = 100;

    beforeEach(async () => {
      contractAddress = await AztecAddress.random();
      anchorBlockHeader = BlockHeader.empty({
        globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(syncedBlockNumber) }),
      });
      anchorBlockStore.getBlockHeader.mockResolvedValue(anchorBlockHeader);

      utilityExecutionOracle = new UtilityExecutionOracle(
        contractAddress,
        [],
        [],
        anchorBlockHeader,
        contractStore,
        noteStore,
        keyStore,
        addressStore,
        aztecNode,
        anchorBlockStore,
        recipientTaggingStore,
        senderAddressBookStore,
        capsuleStore,
        privateEventStore,
        'test-job-id',
      );
    });

    describe('Respects synced block number', () => {
      let nullifier: Fr;
      let leafSlot: Fr;

      beforeEach(() => {
        leafSlot = Fr.random();
        nullifier = Fr.random();
      });

      it('throws when getting low nullifier membership witness for future block', async () => {
        await expect(
          utilityExecutionOracle.utilityGetLowNullifierMembershipWitness(BlockNumber(syncedBlockNumber + 1), nullifier),
        ).rejects.toThrow(`Block number ${syncedBlockNumber + 1} is higher than current block ${syncedBlockNumber}`);
      });

      it('throws when getting block for future block number', async () => {
        await expect(utilityExecutionOracle.utilityGetBlockHeader(BlockNumber(syncedBlockNumber + 1))).rejects.toThrow(
          `Block number ${syncedBlockNumber + 1} is higher than current block ${syncedBlockNumber}`,
        );
      });

      it('throws when getting public data witness for future block', async () => {
        await expect(
          utilityExecutionOracle.utilityGetPublicDataWitness(BlockNumber(syncedBlockNumber + 1), leafSlot),
        ).rejects.toThrow(`Block number ${syncedBlockNumber + 1} is higher than current block ${syncedBlockNumber}`);
      });

      it('throws when getting public storage for future block', async () => {
        await expect(
          utilityExecutionOracle.utilityStorageRead(contractAddress, leafSlot, BlockNumber(syncedBlockNumber + 1), 1),
        ).rejects.toThrow(`Block number ${syncedBlockNumber + 1} is higher than current block ${syncedBlockNumber}`);
      });
    });
  });
});
