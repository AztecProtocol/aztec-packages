import { AztecNode } from '@aztec/aztec-node';
import { AztecAddress, Fr } from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { ConstantKeyPair, KeyStore } from '@aztec/key-store';
import { L2Block, MerkleTreeId } from '@aztec/types';
import { MockProxy, mock } from 'jest-mock-extended';
import omit from 'lodash.omit';
import { Database, MemoryDB } from '../database/index.js';
import { Synchroniser } from './synchroniser.js';
import { SchnorrAccountContractAbi } from '@aztec/noir-contracts/examples';

describe('Synchroniser', () => {
  let grumpkin: Grumpkin;
  let aztecNode: MockProxy<AztecNode>;
  let database: Database;
  let synchroniser: TestSynchroniser;
  let roots: Record<MerkleTreeId, Fr>;
  let keyStore: MockProxy<KeyStore>;

  beforeAll(async () => {
    grumpkin = await Grumpkin.new();
  });

  beforeEach(() => {
    roots = {
      [MerkleTreeId.CONTRACT_TREE]: Fr.random(),
      [MerkleTreeId.PRIVATE_DATA_TREE]: Fr.random(),
      [MerkleTreeId.NULLIFIER_TREE]: Fr.random(),
      [MerkleTreeId.PUBLIC_DATA_TREE]: Fr.random(),
      [MerkleTreeId.L1_TO_L2_MESSAGES_TREE]: Fr.random(),
      [MerkleTreeId.L1_TO_L2_MESSAGES_ROOTS_TREE]: Fr.random(),
      [MerkleTreeId.CONTRACT_TREE_ROOTS_TREE]: Fr.random(),
      [MerkleTreeId.PRIVATE_DATA_TREE_ROOTS_TREE]: Fr.random(),
    };

    aztecNode = mock<AztecNode>();
    database = new MemoryDB();
    synchroniser = new TestSynchroniser(aztecNode, database);
  });

  it('should create account state', async () => {
    const account = ConstantKeyPair.random(grumpkin);
    const address = AztecAddress.random();

    expect(synchroniser.getAccount(address)).toBeUndefined();

    await synchroniser.addAccount(account.getPublicKey(), address, Fr.random(), SchnorrAccountContractAbi, keyStore);

    expect(synchroniser.getAccount(address)!.getPublicKey()).toEqual(account.getPublicKey());
  });

  it('sets tree roots from aztec node on initial sync', async () => {
    aztecNode.getBlockHeight.mockResolvedValue(3);
    aztecNode.getTreeRoots.mockResolvedValue(roots);

    await synchroniser.initialSync();

    expect(database.getTreeRoots()).toEqual(roots);
  });

  it('sets tree roots from latest block', async () => {
    const block = L2Block.random(1, 4);
    aztecNode.getBlocks.mockResolvedValue([L2Block.fromFields(omit(block, 'newEncryptedLogs', 'newUnencryptedLogs'))]);
    aztecNode.getLogs.mockResolvedValueOnce([block.newEncryptedLogs!]).mockResolvedValue([block.newUnencryptedLogs!]);

    await synchroniser.work();

    const roots = database.getTreeRoots();
    expect(roots[MerkleTreeId.CONTRACT_TREE]).toEqual(block.endContractTreeSnapshot.root);
  });

  it('overrides tree roots from initial sync once block height is larger', async () => {
    // Initial sync is done on block with height 3
    aztecNode.getBlockHeight.mockResolvedValue(3);
    aztecNode.getTreeRoots.mockResolvedValue(roots);

    await synchroniser.initialSync();
    const roots0 = database.getTreeRoots();
    expect(roots0[MerkleTreeId.CONTRACT_TREE]).toEqual(roots[MerkleTreeId.CONTRACT_TREE]);

    // We then process block with height 1, this should not change tree roots
    const block1 = L2Block.random(1, 4);
    aztecNode.getBlocks.mockResolvedValueOnce([
      L2Block.fromFields(omit(block1, 'newEncryptedLogs', 'newUnencryptedLogs')),
    ]);
    aztecNode.getLogs.mockResolvedValue([block1.newEncryptedLogs!]).mockResolvedValue([block1.newUnencryptedLogs!]);

    await synchroniser.work();
    const roots1 = database.getTreeRoots();
    expect(roots1[MerkleTreeId.CONTRACT_TREE]).toEqual(roots[MerkleTreeId.CONTRACT_TREE]);
    expect(roots1[MerkleTreeId.CONTRACT_TREE]).not.toEqual(block1.endContractTreeSnapshot.root);

    // But they should change when we process block with height 5
    const block5 = L2Block.random(5, 4);
    aztecNode.getBlocks.mockResolvedValueOnce([
      L2Block.fromFields(omit(block5, 'newEncryptedLogs', 'newUnencryptedLogs')),
    ]);

    await synchroniser.work();
    const roots5 = database.getTreeRoots();
    expect(roots5[MerkleTreeId.CONTRACT_TREE]).not.toEqual(roots[MerkleTreeId.CONTRACT_TREE]);
    expect(roots5[MerkleTreeId.CONTRACT_TREE]).toEqual(block5.endContractTreeSnapshot.root);
  });
});

class TestSynchroniser extends Synchroniser {
  public work() {
    return super.work();
  }

  public initialSync(): Promise<void> {
    return super.initialSync();
  }
}
