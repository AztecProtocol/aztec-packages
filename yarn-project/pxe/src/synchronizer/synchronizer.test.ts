import { BlockHeader, CompleteAddress, EthAddress, Fr, GrumpkinScalar } from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { TestKeyStore } from '@aztec/key-store';
import { AztecLmdbStore } from '@aztec/kv-store';
import { AztecNode, INITIAL_L2_BLOCK_NUM, L2Block, MerkleTreeId } from '@aztec/types';

import { MockProxy, mock } from 'jest-mock-extended';
import omit from 'lodash.omit';

import { PxeDatabase } from '../database/index.js';
import { KVPxeDatabase } from '../database/kv_pxe_database.js';
import { Synchronizer } from './synchronizer.js';

describe('Synchronizer', () => {
  let aztecNode: MockProxy<AztecNode>;
  let database: PxeDatabase;
  let synchronizer: TestSynchronizer;
  let roots: Record<MerkleTreeId, Fr>;
  let blockHeader: BlockHeader;

  beforeEach(async () => {
    blockHeader = BlockHeader.random();
    roots = {
      [MerkleTreeId.CONTRACT_TREE]: blockHeader.contractTreeRoot,
      [MerkleTreeId.NOTE_HASH_TREE]: blockHeader.noteHashTreeRoot,
      [MerkleTreeId.NULLIFIER_TREE]: blockHeader.nullifierTreeRoot,
      [MerkleTreeId.PUBLIC_DATA_TREE]: blockHeader.publicDataTreeRoot,
      [MerkleTreeId.L1_TO_L2_MESSAGES_TREE]: blockHeader.l1ToL2MessagesTreeRoot,
      [MerkleTreeId.ARCHIVE]: blockHeader.archiveRoot,
    };

    aztecNode = mock<AztecNode>();
    database = new KVPxeDatabase(await AztecLmdbStore.create(EthAddress.random()));
    synchronizer = new TestSynchronizer(aztecNode, database);
  });

  it('sets tree roots from aztec node on initial sync', async () => {
    aztecNode.getBlockNumber.mockResolvedValue(3);
    aztecNode.getBlockHeader.mockResolvedValue(blockHeader);

    await synchronizer.initialSync();

    expect(database.getTreeRoots()).toEqual(roots);
  });

  it('sets tree roots from latest block', async () => {
    const block = L2Block.random(1, 4);
    aztecNode.getBlocks.mockResolvedValue([L2Block.fromFields(omit(block, 'newEncryptedLogs', 'newUnencryptedLogs'))]);
    aztecNode.getLogs.mockResolvedValueOnce([block.newEncryptedLogs!]).mockResolvedValue([block.newUnencryptedLogs!]);

    await synchronizer.work();

    const roots = database.getTreeRoots();
    expect(roots[MerkleTreeId.CONTRACT_TREE]).toEqual(block.endContractTreeSnapshot.root);
  });

  it('overrides tree roots from initial sync once current block number is larger', async () => {
    // Initial sync is done on block with height 3
    aztecNode.getBlockNumber.mockResolvedValue(3);
    aztecNode.getBlockHeader.mockResolvedValue(blockHeader);

    await synchronizer.initialSync();
    const roots0 = database.getTreeRoots();
    expect(roots0[MerkleTreeId.CONTRACT_TREE]).toEqual(roots[MerkleTreeId.CONTRACT_TREE]);

    // We then process block with height 1, this should not change tree roots
    const block1 = L2Block.random(1, 4);
    aztecNode.getBlocks.mockResolvedValueOnce([
      L2Block.fromFields(omit(block1, 'newEncryptedLogs', 'newUnencryptedLogs')),
    ]);
    aztecNode.getLogs.mockResolvedValue([block1.newEncryptedLogs!]).mockResolvedValue([block1.newUnencryptedLogs!]);

    await synchronizer.work();
    const roots1 = database.getTreeRoots();
    expect(roots1[MerkleTreeId.CONTRACT_TREE]).toEqual(roots[MerkleTreeId.CONTRACT_TREE]);
    expect(roots1[MerkleTreeId.CONTRACT_TREE]).not.toEqual(block1.endContractTreeSnapshot.root);

    // But they should change when we process block with height 5
    const block5 = L2Block.random(5, 4);
    aztecNode.getBlocks.mockResolvedValueOnce([
      L2Block.fromFields(omit(block5, 'newEncryptedLogs', 'newUnencryptedLogs')),
    ]);

    await synchronizer.work();
    const roots5 = database.getTreeRoots();
    expect(roots5[MerkleTreeId.CONTRACT_TREE]).not.toEqual(roots[MerkleTreeId.CONTRACT_TREE]);
    expect(roots5[MerkleTreeId.CONTRACT_TREE]).toEqual(block5.endContractTreeSnapshot.root);
  });

  it('note processor successfully catches up', async () => {
    const block = L2Block.random(1, 4);

    // getBlocks is called by both synchronizer.work and synchronizer.workNoteProcessorCatchUp
    aztecNode.getBlocks.mockResolvedValue([L2Block.fromFields(omit(block, 'newEncryptedLogs', 'newUnencryptedLogs'))]);
    aztecNode.getLogs
      .mockResolvedValueOnce([block.newEncryptedLogs!]) // called by synchronizer.work
      .mockResolvedValueOnce([block.newUnencryptedLogs!]) // called by synchronizer.work
      .mockResolvedValueOnce([block.newEncryptedLogs!]); // called by synchronizer.workNoteProcessorCatchUp

    // Sync the synchronizer so that note processor has something to catch up to
    await synchronizer.work();

    // Used in synchronizer.isAccountStateSynchronized
    aztecNode.getBlockNumber.mockResolvedValueOnce(1);

    // Manually adding account to database so that we can call synchronizer.isAccountStateSynchronized
    const keyStore = new TestKeyStore(new Grumpkin(), await AztecLmdbStore.create(EthAddress.random()));
    const privateKey = GrumpkinScalar.random();
    await keyStore.addAccount(privateKey);
    const completeAddress = CompleteAddress.fromPrivateKeyAndPartialAddress(privateKey, Fr.random());
    await database.addCompleteAddress(completeAddress);

    // Add the account which will add the note processor to the synchronizer
    synchronizer.addAccount(completeAddress.publicKey, keyStore, INITIAL_L2_BLOCK_NUM);

    await synchronizer.workNoteProcessorCatchUp();

    expect(await synchronizer.isAccountStateSynchronized(completeAddress.address)).toBe(true);
  });
});

class TestSynchronizer extends Synchronizer {
  public work() {
    return super.work();
  }

  public initialSync(): Promise<void> {
    return super.initialSync();
  }

  public workNoteProcessorCatchUp(): Promise<void> {
    return super.workNoteProcessorCatchUp();
  }
}
