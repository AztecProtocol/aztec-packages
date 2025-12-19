import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { KeyStore } from '@aztec/key-store';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { WASMSimulator } from '@aztec/simulator/client';
import { FunctionCall, FunctionSelector, FunctionType, encodeArguments } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import { CompleteAddress, type ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { siloPrivateLog } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { PublicLog, TxScopedL2Log } from '@aztec/stdlib/logs';
import { Note, NoteDao } from '@aztec/stdlib/note';
import { BlockHeader, GlobalVariables, TxHash, randomIndexedTxEffect } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';
import type { _MockProxy } from 'jest-mock-extended/lib/Mock.js';

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
import { LogRetrievalRequest } from '../noir-structs/log_retrieval_request.js';
import { UtilityExecutionOracle } from './utility_execution_oracle.js';

describe('Utility Execution test suite', () => {
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
  let owner: AztecAddress;
  let ownerCompleteAddress: CompleteAddress;
  let anchorBlockHeader: BlockHeader;
  const ownerSecretKey = Fr.fromHexString('2dcc5485a58316776299be08c78fa3788a1a7961ae30dc747fb1be17692a8d32');

  const buildNote = (amount: bigint) => {
    return new Note([new Fr(amount)]);
  };

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
    const capsuleArrays = new Map<string, Fr[][]>();
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
    capsuleDataProvider.setCapsuleArray.mockImplementation((address, slot, content) => {
      capsuleArrays.set(`${address.toString()}:${slot.toString()}`, content);
      return Promise.resolve();
    });
    capsuleDataProvider.readCapsuleArray.mockImplementation((address, slot) => {
      return Promise.resolve(capsuleArrays.get(`${address.toString()}:${slot.toString()}`) ?? []);
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

    ownerCompleteAddress = await CompleteAddress.fromSecretKeyAndPartialAddress(ownerSecretKey, Fr.random());
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
    contractDataProvider.getFunctionArtifactWithDebugMetadata.mockImplementation(async (address, selector) => {
      const artifact = await contractDataProvider.getFunctionArtifact(address, selector);
      if (!artifact) {
        throw new Error(`Function not found: ${selector.toString()} in contract ${address}`);
      }
      return { ...artifact, debug: undefined };
    });
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

  describe('UtilityExecutionOracle', () => {
    let contractAddress: AztecAddress;
    let utilityExecutionOracle: UtilityExecutionOracle;
    const syncedBlockNumber = 100;

    beforeEach(async () => {
      contractAddress = await AztecAddress.random();
      anchorBlockHeader = BlockHeader.empty({
        globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(syncedBlockNumber) }),
      });
      anchorBlockDataProvider.getBlockHeader.mockResolvedValue(anchorBlockHeader);

      utilityExecutionOracle = new UtilityExecutionOracle(
        contractAddress,
        [],
        [],
        anchorBlockHeader,
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
      );
    });

    describe('utilityBulkRetrieveLogs', () => {
      const unsiloedTag = Fr.random();
      const REQUEST_SLOT = Fr.random();
      const RESPONSE_SLOT = Fr.random();

      beforeEach(() => {
        aztecNode.getLogsByTags.mockReset();
        aztecNode.getTxEffect.mockReset();
      });

      it('returns no logs if none are found', async () => {
        aztecNode.getLogsByTags.mockResolvedValue([[]]);

        const request = new LogRetrievalRequest(contractAddress, unsiloedTag);

        await capsuleDataProvider.setCapsuleArray(contractAddress, REQUEST_SLOT, [request.toFields()]);
        await utilityExecutionOracle.utilityBulkRetrieveLogs(contractAddress, REQUEST_SLOT, RESPONSE_SLOT);

        expect((await capsuleDataProvider.readCapsuleArray(contractAddress, REQUEST_SLOT)).length).toEqual(0);

        const responses = await capsuleDataProvider.readCapsuleArray(contractAddress, RESPONSE_SLOT);
        expect(responses.length).toEqual(1);

        // Check Option::none
        expect(responses[0][0]).toEqual(new Fr(0)); // TODO: deserialize into option and check properly
      });

      it('returns a public log if one is found', async () => {
        const scopedLog = await TxScopedL2Log.random(true);
        (scopedLog.log as PublicLog).contractAddress = contractAddress;

        aztecNode.getLogsByTags.mockResolvedValue([[scopedLog]]);
        const indexedTxEffect = await randomIndexedTxEffect();

        aztecNode.getTxEffect.mockImplementation((txHash: TxHash) =>
          txHash.equals(scopedLog.txHash) ? Promise.resolve(indexedTxEffect) : Promise.resolve(undefined),
        );

        const request = new LogRetrievalRequest(contractAddress, scopedLog.log.fields[0]);

        await capsuleDataProvider.setCapsuleArray(contractAddress, REQUEST_SLOT, [request.toFields()]);
        await utilityExecutionOracle.utilityBulkRetrieveLogs(contractAddress, REQUEST_SLOT, RESPONSE_SLOT);

        expect((await capsuleDataProvider.readCapsuleArray(contractAddress, REQUEST_SLOT)).length).toEqual(0);

        const responses = await capsuleDataProvider.readCapsuleArray(contractAddress, RESPONSE_SLOT);
        expect(responses.length).toEqual(1);

        // Check Option::some
        expect(responses[0][0]).toEqual(new Fr(1)); // TODO: deserialize into option and check properly
      });

      it('returns a private log if one is found', async () => {
        const scopedLog = await TxScopedL2Log.random(false);
        scopedLog.log.fields[0] = await siloPrivateLog(contractAddress, Fr.random());

        aztecNode.getLogsByTags.mockResolvedValue([[scopedLog]]);
        const indexedTxEffect = await randomIndexedTxEffect();
        aztecNode.getTxEffect.mockResolvedValue(indexedTxEffect);

        aztecNode.getTxEffect.mockImplementation((txHash: TxHash) =>
          txHash.equals(scopedLog.txHash) ? Promise.resolve(indexedTxEffect) : Promise.resolve(undefined),
        );

        const request = new LogRetrievalRequest(contractAddress, scopedLog.log.fields[0]);

        await capsuleDataProvider.setCapsuleArray(contractAddress, REQUEST_SLOT, [request.toFields()]);
        await utilityExecutionOracle.utilityBulkRetrieveLogs(contractAddress, REQUEST_SLOT, RESPONSE_SLOT);

        expect((await capsuleDataProvider.readCapsuleArray(contractAddress, REQUEST_SLOT)).length).toEqual(0);

        const responses = await capsuleDataProvider.readCapsuleArray(contractAddress, RESPONSE_SLOT);
        expect(responses.length).toEqual(1);

        // Check Option::some
        expect(responses[0][0]).toEqual(new Fr(1)); // TODO: deserialize into option and check properly
      });
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
