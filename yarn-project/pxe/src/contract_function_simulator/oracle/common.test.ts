import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import { CompleteAddress } from '@aztec/stdlib/contract';
import { computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, type IndexedTxEffect, TxEffect, TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import {
  AddressDataProvider,
  AnchorBlockDataProvider,
  ContractDataProvider,
  NoteDataProvider,
  PrivateEventDataProvider,
} from '../../storage/index.js';
import { deliverEvent, deliverNote } from './common.js';

jest.setTimeout(30_000);

describe('Common oracle functions', () => {
  let aztecNode: MockProxy<AztecNode>;

  let addressDataProvider: AddressDataProvider;
  let contractDataProvider: ContractDataProvider;
  let anchorBlockDataProvider: AnchorBlockDataProvider;
  let keyStore: KeyStore;
  let privateEventDataProvider: PrivateEventDataProvider;
  let noteDataProvider: NoteDataProvider;

  let recipient: CompleteAddress;
  let contractAddress: AztecAddress;

  // The block number of the last log to be emitted.
  const MAX_BLOCK_NUMBER_OF_A_LOG = BlockNumber(3);

  beforeEach(async () => {
    const store = await openTmpStore('test');
    aztecNode = mock<AztecNode>();
    contractDataProvider = new ContractDataProvider(store);
    jest.spyOn(contractDataProvider, 'getDebugContractName').mockImplementation(() => Promise.resolve('TestContract'));

    addressDataProvider = new AddressDataProvider(store);
    anchorBlockDataProvider = new AnchorBlockDataProvider(store);
    keyStore = new KeyStore(store);
    privateEventDataProvider = new PrivateEventDataProvider(store);
    noteDataProvider = await NoteDataProvider.create(store);

    // Set up recipient account
    recipient = await keyStore.addAccount(new Fr(69), Fr.random());
    await addressDataProvider.addCompleteAddress(recipient);

    // PXEOracleInterface.syncTaggedLogs(...) function syncs logs up to the block number up to which PXE synced. We set
    // the synced block number to that of the last emitted log to receive all the logs by default.
    await setSyncedBlockNumber(MAX_BLOCK_NUMBER_OF_A_LOG);

    contractAddress = await AztecAddress.random();
  });

  describe('deliverEvent', () => {
    let blockNumber: BlockNumber;
    let eventSelector: EventSelector;
    let eventContent: Fr[];
    let eventCommitment: Fr;
    let eventNullifier: Fr;
    let txEffect: TxEffect;
    let indexedTxEffect: IndexedTxEffect;

    // beforeEach sets up the happy path case, so error modes are tested
    // by minimally failing happy path conditions
    beforeEach(async () => {
      blockNumber = BlockNumber(42);
      eventSelector = EventSelector.random();
      eventContent = [Fr.random(), Fr.random()];

      eventCommitment = Fr.random();
      eventNullifier = await siloNullifier(contractAddress, eventCommitment);

      txEffect = TxEffect.from({
        ...(await TxEffect.random()),
        nullifiers: [eventNullifier],
      });

      indexedTxEffect = {
        l2BlockNumber: blockNumber,
        l2BlockHash: L2BlockHash.random(),
        data: txEffect,
        txIndexInBlock: 0,
      };

      /* Happy path context conditions:
       ** - PXE is sync'd to _at least_ block including tx
       ** - Node knows tx effect
       ** - Node knows siloed event commitment
       */
      await setSyncedBlockNumber(blockNumber);

      aztecNode.getTxEffect.mockImplementation(() => Promise.resolve(indexedTxEffect));

      aztecNode.findLeavesIndexes.mockImplementation(() =>
        Promise.resolve([
          {
            data: BigInt(0),
            l2BlockNumber: indexedTxEffect.l2BlockNumber,
            l2BlockHash: indexedTxEffect.l2BlockHash,
          },
        ]),
      );
    });

    function runDeliverEvent(
      overrides: {
        eventCommitment?: Fr;
      } = {},
    ) {
      return deliverEvent(
        contractAddress,
        eventSelector,
        eventContent,
        overrides.eventCommitment || eventCommitment,
        txEffect.txHash,
        recipient.address,
        anchorBlockDataProvider,
        aztecNode,
        privateEventDataProvider,
      );
    }

    it('should throw when tx does not exist or has no effects', async () => {
      aztecNode.getTxEffect.mockImplementation(() => Promise.resolve(undefined));
      await expect(runDeliverEvent).rejects.toThrow(/Could not find tx effect for tx hash/);
    });

    it('should throw when tx block has not yet been synchronized', async () => {
      indexedTxEffect = {
        ...indexedTxEffect,
        l2BlockNumber: BlockNumber(blockNumber + 1),
      };
      aztecNode.getTxEffect.mockImplementation(() => Promise.resolve(indexedTxEffect));

      await expect(runDeliverEvent).rejects.toThrow(/Could not find tx effect for tx hash .* as of block number/);
    });

    it('should throw if event is not in tx effects', async () => {
      await expect(runDeliverEvent({ eventCommitment: Fr.random() })).rejects.toThrow(
        /Event commitment .* is not present in tx/,
      );
    });

    it('should throw if event is not in nullifiers', async () => {
      aztecNode.findLeavesIndexes.mockImplementation(() => Promise.resolve([]));

      await expect(runDeliverEvent).rejects.toThrow(/Event commitment .* is not present on the nullifier tree/);
    });

    it('should store event for later retrieval', async () => {
      await runDeliverEvent();

      // I should be able to retrieve the private event I just saved using getPrivateEvents
      const result = await privateEventDataProvider.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: blockNumber,
        toBlock: blockNumber + 1,
        scopes: [recipient.address],
      });

      expect(result.length).toEqual(1);
      expect(result[0].packedEvent).toEqual(eventContent);
    });
  });

  describe('deliverNote', () => {
    // Recipient is different from the owner because recipient refers to the
    // recipient of the message containing the note, while owner refers to the
    // owner of the note.
    let owner: AztecAddress;
    let storageSlot: Fr;
    let randomness: Fr;
    let noteNonce: Fr;
    let content: Fr[];

    let noteHash: Fr;
    let uniqueNoteHash: Fr;
    let nullifier: Fr;
    let siloedNullifier: Fr;

    let txHash: TxHash;
    let txEffect: TxEffect;
    let indexedTxEffect: IndexedTxEffect;
    let blockNumber: BlockNumber;

    let nullified = false;

    // beforeEach sets up the happy path case, so error modes are tested
    // by minimally failing happy path conditions
    beforeEach(async () => {
      noteHash = Fr.random();
      nullifier = Fr.random();
      txHash = TxHash.random();
      owner = await AztecAddress.random();
      storageSlot = Fr.random();
      randomness = Fr.random();
      noteNonce = Fr.random();
      content = [Fr.random(), Fr.random()];

      uniqueNoteHash = await computeUniqueNoteHash(noteNonce, await siloNoteHash(contractAddress, noteHash));
      siloedNullifier = await siloNullifier(contractAddress, nullifier);

      blockNumber = BlockNumber(42);

      txEffect = TxEffect.from({
        ...(await TxEffect.random()),
        noteHashes: [uniqueNoteHash],
      });

      indexedTxEffect = {
        l2BlockNumber: blockNumber,
        l2BlockHash: L2BlockHash.random(),
        data: txEffect,
        txIndexInBlock: 0,
      };

      /* Happy path context conditions:
       ** - PXE is sync'd to _at least_ block including tx
       ** - Node knows tx effect
       ** - Node knows unique note hash (and siloed nullifier if requested)
       */
      await setSyncedBlockNumber(blockNumber);

      aztecNode.getTxEffect.mockImplementation(queryTxHash =>
        Promise.resolve(queryTxHash == txHash ? indexedTxEffect : undefined),
      );

      aztecNode.findLeavesIndexes.mockImplementation((queryBlockNum, treeId, leaves) => {
        if (queryBlockNum != blockNumber) {
          throw new Error(`Got a tree query for block ${queryBlockNum} but synced block is ${blockNumber}`);
        }

        if (treeId == MerkleTreeId.NOTE_HASH_TREE && leaves[0].equals(uniqueNoteHash)) {
          return Promise.resolve([
            {
              data: BigInt(0),
              l2BlockNumber: indexedTxEffect.l2BlockNumber,
              l2BlockHash: indexedTxEffect.l2BlockHash,
            },
          ]);
        } else if (treeId == MerkleTreeId.NULLIFIER_TREE && leaves[0].equals(siloedNullifier)) {
          // Note that returning undefined (i.e. the un-nullified case) covers both scenarios where the note has not
          // been nullified and where the nullifier is in a block past the synced block.
          return Promise.resolve([
            nullified
              ? {
                  data: BigInt(0),
                  l2BlockNumber: indexedTxEffect.l2BlockNumber,
                  l2BlockHash: indexedTxEffect.l2BlockHash,
                }
              : undefined,
          ]);
        } else {
          throw new Error();
        }
      });
    });

    it('should store note if it exists in note hash tree and is not nullified', async () => {
      await deliverNote(
        contractAddress,
        owner,
        storageSlot,
        randomness,
        noteNonce,
        content,
        noteHash,
        nullifier,
        txHash,
        recipient.address,
        anchorBlockDataProvider,
        aztecNode,
        noteDataProvider,
      );

      // Verify note was stored
      const notes = await noteDataProvider.getNotes({ contractAddress, scopes: [recipient.address] });

      expect(notes).toHaveLength(1);
      expect(notes[0].noteHash.equals(noteHash)).toBe(true);
    });

    it('should throw if tx hash does not exist', async () => {
      await expect(
        deliverNote(
          contractAddress,
          owner,
          storageSlot,
          randomness,
          noteNonce,
          content,
          noteHash,
          nullifier,
          TxHash.random(),
          recipient.address,
          anchorBlockDataProvider,
          aztecNode,
          noteDataProvider,
        ),
      ).rejects.toThrow(/Could not find tx effect/);
    });

    it('should throw if note was not emitted in the tx', async () => {
      await expect(
        deliverNote(
          contractAddress,
          owner,
          storageSlot,
          randomness,
          noteNonce,
          content,
          Fr.random(), // note hash
          nullifier,
          txHash,
          recipient.address,
          anchorBlockDataProvider,
          aztecNode,
          noteDataProvider,
        ),
      ).rejects.toThrow(/is not present in tx/);
    });

    it('should throw if tx was mined after synced block number', async () => {
      await setSyncedBlockNumber(BlockNumber(blockNumber - 1));

      await expect(
        deliverNote(
          contractAddress,
          owner,
          storageSlot,
          randomness,
          noteNonce,
          content,
          noteHash,
          nullifier,
          txHash,
          recipient.address,
          anchorBlockDataProvider,
          aztecNode,
          noteDataProvider,
        ),
      ).rejects.toThrow(/as of block number/);
    });

    it('should store and immediately remove note if it is already nullified', async () => {
      nullified = true;

      await deliverNote(
        contractAddress,
        owner,
        storageSlot,
        randomness,
        noteNonce,
        content,
        noteHash,
        nullifier,
        txHash,
        recipient.address,
        anchorBlockDataProvider,
        aztecNode,
        noteDataProvider,
      );

      // Verify note was removed
      const notes = await noteDataProvider.getNotes({ contractAddress, scopes: [recipient.address] });
      expect(notes).toHaveLength(0);
    });
  });

  const setSyncedBlockNumber = (blockNumber: BlockNumber) => {
    return anchorBlockDataProvider.setHeader(
      BlockHeader.empty({
        globalVariables: GlobalVariables.empty({ blockNumber }),
      }),
    );
  };
});
