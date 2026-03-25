import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import type { KeyStore } from '@aztec/key-store';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { WASMSimulator } from '@aztec/simulator/client';
import { FunctionCall, FunctionSelector, FunctionType, encodeArguments } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import { CompleteAddress, type ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { deriveKeys } from '@aztec/stdlib/keys';
import { MessageContext } from '@aztec/stdlib/logs';
import { Note, NoteDao } from '@aztec/stdlib/note';
import { makeL2Tips } from '@aztec/stdlib/testing';
import { BlockHeader, Capsule, GlobalVariables, TxHash } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';
import type { _MockProxy } from 'jest-mock-extended/lib/Mock.js';

import type { ContractSyncService } from '../../contract_sync/contract_sync_service.js';
import { MessageContextService } from '../../messages/message_context_service.js';
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

describe('Utility Execution test suite', () => {
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
  let contractSyncService: ReturnType<typeof mock<ContractSyncService>>;
  let messageContextService: MessageContextService;
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
    senderTaggingStore = mock<SenderTaggingStore>();
    recipientTaggingStore = mock<RecipientTaggingStore>();
    senderAddressBookStore = mock<SenderAddressBookStore>();
    capsuleStore = mock<CapsuleStore>();
    privateEventStore = mock<PrivateEventStore>();
    contractSyncService = mock<ContractSyncService>();
    messageContextService = new MessageContextService(aztecNode);
    const capsuleArrays = new Map<string, Fr[][]>();
    anchorBlockHeader = BlockHeader.random();
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
    acirSimulator = new ContractFunctionSimulator({
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
      contractSyncService,
      messageContextService,
    });

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
        note =>
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
            BlockHash.random().toString(),
            0,
            0,
          ),
      ),
    );

    capsuleStore.loadCapsule.mockImplementation((_, __) => Promise.resolve(null));

    const execRequest = FunctionCall.from({
      name: artifact.name,
      to: contractAddress,
      selector: FunctionSelector.empty(),
      type: FunctionType.UTILITY,
      hideMsgSender: false,
      isStatic: false,
      args: encodeArguments(artifact, [owner]),
      returnTypes: artifact.returnTypes,
    });

    const { result, offchainEffects } = await acirSimulator.runUtility(
      execRequest,
      [],
      anchorBlockHeader,
      [],
      'test-job-id',
    );

    expect(result).toEqual([new Fr(9)]);
    expect(offchainEffects).toEqual([]);
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

      utilityExecutionOracle = new UtilityExecutionOracle({
        contractAddress,
        authWitnesses: [],
        capsules: [],
        anchorBlockHeader,
        contractStore,
        noteStore,
        keyStore,
        addressStore,
        aztecNode,
        recipientTaggingStore,
        senderAddressBookStore,
        capsuleStore,
        privateEventStore,
        messageContextService,
        contractSyncService,
        jobId: 'test-job-id',
        scopes: 'ALL_SCOPES',
      });
    });

    describe('Respects synced block number', () => {
      it('throws when getting block for future block number', async () => {
        await expect(utilityExecutionOracle.getBlockHeader(BlockNumber(syncedBlockNumber + 1))).rejects.toThrow(
          `Block number ${syncedBlockNumber + 1} is higher than current block ${syncedBlockNumber}`,
        );
      });
    });

    describe('capsules', () => {
      it('forwards scope to the capsule store', async () => {
        const scope = await AztecAddress.random();
        const slot = Fr.random();
        const srcSlot = Fr.random();
        const dstSlot = Fr.random();
        const capsule = [Fr.random()];

        capsuleStore.loadCapsule.mockResolvedValueOnce(capsule);

        utilityExecutionOracle.storeCapsule(contractAddress, slot, capsule, scope);
        await utilityExecutionOracle.loadCapsule(contractAddress, slot, scope);
        utilityExecutionOracle.deleteCapsule(contractAddress, slot, scope);
        await utilityExecutionOracle.copyCapsule(contractAddress, srcSlot, dstSlot, 1, scope);

        expect(capsuleStore.storeCapsule).toHaveBeenCalledWith(contractAddress, slot, capsule, 'test-job-id', scope);
        expect(capsuleStore.loadCapsule).toHaveBeenCalledWith(contractAddress, slot, 'test-job-id', scope);
        expect(capsuleStore.deleteCapsule).toHaveBeenCalledWith(contractAddress, slot, 'test-job-id', scope);
        expect(capsuleStore.copyCapsule).toHaveBeenCalledWith(
          contractAddress,
          srcSlot,
          dstSlot,
          1,
          'test-job-id',
          scope,
        );
      });

      it('loads transient capsules by scope', async () => {
        const scope = await AztecAddress.random();
        const slot = Fr.random();
        const transientGlobal = [Fr.random()];
        const transientScoped = [Fr.random()];
        const persisted = [Fr.random()];

        utilityExecutionOracle = new UtilityExecutionOracle({
          contractAddress,
          authWitnesses: [],
          capsules: [
            new Capsule(contractAddress, slot, transientGlobal),
            new Capsule(contractAddress, slot, transientScoped, scope),
          ],
          anchorBlockHeader,
          contractStore,
          noteStore,
          keyStore,
          addressStore,
          aztecNode,
          recipientTaggingStore,
          senderAddressBookStore,
          capsuleStore,
          privateEventStore,
          messageContextService,
          contractSyncService,
          jobId: 'test-job-id',
          scopes: 'ALL_SCOPES',
        });

        capsuleStore.loadCapsule.mockResolvedValueOnce(persisted);

        expect(await utilityExecutionOracle.loadCapsule(contractAddress, slot, AztecAddress.ZERO)).toEqual(
          transientGlobal,
        );
        expect(await utilityExecutionOracle.loadCapsule(contractAddress, slot, AztecAddress.ZERO)).toEqual(
          transientGlobal,
        );
        expect(await utilityExecutionOracle.loadCapsule(contractAddress, slot, scope)).toEqual(transientScoped);
      });
    });

    describe('invalidateContractSyncCache', () => {
      it('throws when contract address does not match', async () => {
        const otherAddress = await AztecAddress.random();
        const scope = await AztecAddress.random();
        expect(() => utilityExecutionOracle.invalidateContractSyncCache(otherAddress, [scope])).toThrow(
          `Contract ${contractAddress} cannot invalidate sync cache of ${otherAddress}`,
        );
        expect(contractSyncService.invalidateContractForScopes).not.toHaveBeenCalled();
      });

      it('invalidates cache for the given scopes', async () => {
        const scopeA = await AztecAddress.random();
        const scopeB = await AztecAddress.random();
        utilityExecutionOracle.invalidateContractSyncCache(contractAddress, [scopeA, scopeB]);
        expect(contractSyncService.invalidateContractForScopes).toHaveBeenCalledWith(contractAddress, [scopeA, scopeB]);
      });
    });

    describe('utilityResolveMessageContexts', () => {
      const requestSlot = Fr.random();
      const responseSlot = Fr.random();
      const scope = AztecAddress.fromBigInt(42n);

      it('throws when contractAddress does not match', async () => {
        const wrongAddress = await AztecAddress.random();
        await expect(
          utilityExecutionOracle.utilityResolveMessageContexts(wrongAddress, requestSlot, responseSlot, scope),
        ).rejects.toThrow(`Got a message context request from ${wrongAddress}, expected ${contractAddress}`);
      });

      it('sets null in response capsule for zero tx hashes', async () => {
        capsuleStore.readCapsuleArray.mockResolvedValueOnce([[Fr.ZERO]]);

        await utilityExecutionOracle.utilityResolveMessageContexts(contractAddress, requestSlot, responseSlot, scope);

        const response = capsuleStore.setCapsuleArray.mock.calls.find(
          call => call[0].equals(contractAddress) && call[1].equals(responseSlot),
        );
        expect(response).toBeDefined();
        const responseFields = response![2][0];
        expect(responseFields).toEqual(MessageContext.toSerializedOption(null));
        expect(aztecNode.getTxEffect).not.toHaveBeenCalled();
      });

      it('resolves a valid tx hash into a MessageContext', async () => {
        const txHash = TxHash.random();
        const noteHash = Fr.random();
        const firstNullifier = Fr.random();

        capsuleStore.readCapsuleArray.mockResolvedValueOnce([[txHash.hash]]);
        aztecNode.getTxEffect.mockResolvedValueOnce({
          l2BlockNumber: BlockNumber(syncedBlockNumber - 1),
          l2BlockHash: BlockHash.random(),
          txIndexInBlock: 0,
          data: { txHash, noteHashes: [noteHash], nullifiers: [firstNullifier] },
        } as any);

        await utilityExecutionOracle.utilityResolveMessageContexts(contractAddress, requestSlot, responseSlot, scope);

        const response = capsuleStore.setCapsuleArray.mock.calls.find(
          call => call[0].equals(contractAddress) && call[1].equals(responseSlot),
        );
        expect(response).toBeDefined();
        const responseFields = response![2][0];
        const expected = MessageContext.toSerializedOption(new MessageContext(txHash, [noteHash], firstNullifier));
        expect(responseFields).toEqual(expected);
      });

      it('sets null in response capsule for tx effects beyond anchor block', async () => {
        const txHash = TxHash.random();

        capsuleStore.readCapsuleArray.mockResolvedValueOnce([[txHash.hash]]);
        aztecNode.getTxEffect.mockResolvedValueOnce({
          l2BlockNumber: BlockNumber(syncedBlockNumber + 1),
          l2BlockHash: BlockHash.random(),
          txIndexInBlock: 0,
          data: { txHash, noteHashes: [], nullifiers: [Fr.random()] },
        } as any);

        await utilityExecutionOracle.utilityResolveMessageContexts(contractAddress, requestSlot, responseSlot, scope);

        const response = capsuleStore.setCapsuleArray.mock.calls.find(
          call => call[0].equals(contractAddress) && call[1].equals(responseSlot),
        );
        expect(response).toBeDefined();
        const responseFields = response![2][0];
        expect(responseFields).toEqual(MessageContext.toSerializedOption(null));
      });

      it('throws on empty capsule entry', async () => {
        capsuleStore.readCapsuleArray.mockResolvedValueOnce([[]]);
        await expect(
          utilityExecutionOracle.utilityResolveMessageContexts(contractAddress, requestSlot, responseSlot, scope),
        ).rejects.toThrow('Malformed message context request at index 0: expected 1 field (tx hash), got 0');
      });

      it('throws on capsule entry with extra fields', async () => {
        capsuleStore.readCapsuleArray.mockResolvedValueOnce([[Fr.random(), Fr.random()]]);
        await expect(
          utilityExecutionOracle.utilityResolveMessageContexts(contractAddress, requestSlot, responseSlot, scope),
        ).rejects.toThrow('Malformed message context request at index 0: expected 1 field (tx hash), got 2');
      });

      it('clears the request capsule after processing', async () => {
        capsuleStore.readCapsuleArray.mockResolvedValueOnce([]);
        await utilityExecutionOracle.utilityResolveMessageContexts(contractAddress, requestSlot, responseSlot, scope);
        expect(capsuleStore.setCapsuleArray).toHaveBeenCalledWith(
          contractAddress,
          requestSlot,
          [],
          'test-job-id',
          scope,
        );
      });

      it('clears the request capsule even on error', async () => {
        capsuleStore.readCapsuleArray.mockResolvedValueOnce([[]]);
        await expect(
          utilityExecutionOracle.utilityResolveMessageContexts(contractAddress, requestSlot, responseSlot, scope),
        ).rejects.toThrow();
        expect(capsuleStore.setCapsuleArray).toHaveBeenCalledWith(
          contractAddress,
          requestSlot,
          [],
          'test-job-id',
          scope,
        );
      });
    });
  });
});
