import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { randomDataInBlock } from '@aztec/stdlib/block';
import { CompleteAddress } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { NoteDao, NoteStatus } from '@aztec/stdlib/note';
import { BlockHeader, GlobalVariables } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { AddressDataProvider } from '../storage/address_data_provider/address_data_provider.js';
import { AnchorBlockDataProvider } from '../storage/anchor_block_data_provider/anchor_block_data_provider.js';
import { ContractDataProvider } from '../storage/contract_data_provider/contract_data_provider.js';
import { NoteDataProvider } from '../storage/note_data_provider/note_data_provider.js';
import { PXEOracleInterface } from './pxe_oracle_interface.js';

jest.setTimeout(30_000);

describe('PXEOracleInterface', () => {
  let aztecNode: MockProxy<AztecNode>;

  let addressDataProvider: AddressDataProvider;
  let contractDataProvider: ContractDataProvider;
  let noteDataProvider: NoteDataProvider;
  let anchorBlockDataProvider: AnchorBlockDataProvider;
  let keyStore: KeyStore;

  let recipient: CompleteAddress;
  let contractAddress: AztecAddress;

  let pxeOracleInterface: PXEOracleInterface;

  // The block number of the last log to be emitted.
  const MAX_BLOCK_NUMBER_OF_A_LOG = BlockNumber(3);

  beforeEach(async () => {
    const store = await openTmpStore('test');
    aztecNode = mock<AztecNode>();
    contractDataProvider = new ContractDataProvider(store);
    jest.spyOn(contractDataProvider, 'getDebugContractName').mockImplementation(() => Promise.resolve('TestContract'));

    addressDataProvider = new AddressDataProvider(store);
    noteDataProvider = await NoteDataProvider.create(store);
    anchorBlockDataProvider = new AnchorBlockDataProvider(store);
    keyStore = new KeyStore(store);
    pxeOracleInterface = new PXEOracleInterface(aztecNode, noteDataProvider, anchorBlockDataProvider); // Set up contract address
    contractAddress = await AztecAddress.random();
    // Set up recipient account
    recipient = await keyStore.addAccount(new Fr(69), Fr.random());
    await addressDataProvider.addCompleteAddress(recipient);

    // PXEOracleInterface.syncTaggedLogs(...) function syncs logs up to the block number up to which PXE synced. We set
    // the synced block number to that of the last emitted log to receive all the logs by default.
    await setSyncedBlockNumber(MAX_BLOCK_NUMBER_OF_A_LOG);
  });

  describe('syncNoteNullifiers', () => {
    let recipient: AztecAddress;

    beforeEach(async () => {
      // Check that there are no notes in the database
      const notes = await noteDataProvider.getNotes({ contractAddress });
      expect(notes).toHaveLength(0);

      // Check that the expected number of accounts is present
      const accounts = await keyStore.getAccounts();
      expect(accounts).toHaveLength(1);

      recipient = accounts[0];
    });

    it('should remove notes that have been nullified', async () => {
      // Set up initial state with a note
      const noteDao = await NoteDao.random({ contractAddress });

      // Spy on the noteDataProvider.applyNullifiers to later on have additional guarantee that we really removed
      // the note.
      jest.spyOn(noteDataProvider, 'applyNullifiers');

      // Add the note to storage
      await noteDataProvider.addNotes([noteDao], recipient);

      // Set up the nullifier in the merkle tree
      const nullifierIndex = randomDataInBlock(123n);
      aztecNode.findLeavesIndexes.mockResolvedValue([nullifierIndex]);

      // Call the function under test
      await pxeOracleInterface.syncNoteNullifiers(contractAddress);

      // Verify the note was removed by checking storage
      const remainingNotes = await noteDataProvider.getNotes({
        contractAddress,
        status: NoteStatus.ACTIVE,
        scopes: [recipient],
      });
      expect(remainingNotes).toHaveLength(0);

      // Verify the note was removed by checking the spy
      expect(noteDataProvider.applyNullifiers).toHaveBeenCalledTimes(1);
    });

    it('should keep notes that have not been nullified', async () => {
      // Set up initial state with a note
      const noteDao = await NoteDao.random({ contractAddress });

      // Add the note to storage
      await noteDataProvider.addNotes([noteDao], recipient);

      // No nullifier found in merkle tree
      aztecNode.findLeavesIndexes.mockResolvedValue([undefined]);

      // Call the function under test
      await pxeOracleInterface.syncNoteNullifiers(contractAddress);

      // Verify note still exists
      const remainingNotes = await noteDataProvider.getNotes({
        contractAddress,
        status: NoteStatus.ACTIVE,
        scopes: [recipient],
      });
      expect(remainingNotes).toHaveLength(1);
      expect(remainingNotes[0]).toEqual(noteDao);
    });

    // Verifies that notes are not marked as nullified when their nullifier only exists in blocks that haven't been
    // synced yet. We mock the nullifier to only exist in blocks beyond our current sync point, then verify the note
    // is not removed by applyNullifiers.
    it('should not remove notes if nullifier is in unsynced blocks', async () => {
      // Set up initial state with a note
      const noteDao = await NoteDao.random({ contractAddress });
      const syncedBlockNumber = 100;
      await setSyncedBlockNumber(BlockNumber(syncedBlockNumber));

      // Add the note to storage
      await noteDataProvider.addNotes([noteDao], recipient);

      // Mock nullifier to only exist after synced block
      aztecNode.findLeavesIndexes.mockImplementation(blockNum => {
        if (typeof blockNum === 'number' && blockNum > syncedBlockNumber) {
          return Promise.resolve([randomDataInBlock(0n)]);
        }
        return Promise.resolve([undefined]);
      });

      // Call the function under test
      await pxeOracleInterface.syncNoteNullifiers(contractAddress);

      // Verify note still exists
      const remainingNotes = await noteDataProvider.getNotes({
        contractAddress,
        status: NoteStatus.ACTIVE,
        scopes: [recipient],
      });
      expect(remainingNotes).toHaveLength(1);
      expect(remainingNotes[0]).toEqual(noteDao);
    });

    it('should search for notes from all accounts', async () => {
      // Add multiple accounts to keystore
      await keyStore.addAccount(Fr.random(), Fr.random());
      await keyStore.addAccount(Fr.random(), Fr.random());

      expect(await keyStore.getAccounts()).toHaveLength(3);

      // Spy on the noteDataProvider.getNotesSpy
      const getNotesSpy = jest.spyOn(noteDataProvider, 'getNotes');

      // Call the function under test
      await pxeOracleInterface.syncNoteNullifiers(contractAddress);

      // Verify applyNullifiers was called once for all accounts
      expect(getNotesSpy).toHaveBeenCalledTimes(1);

      // Verify getNotes was called with the correct contract address
      expect(getNotesSpy).toHaveBeenCalledWith(expect.objectContaining({ contractAddress }));
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
