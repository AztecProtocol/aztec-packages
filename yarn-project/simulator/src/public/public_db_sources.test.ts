import { MerkleTreeId, type MerkleTreeWriteOperations } from '@aztec/circuit-types';
import { AztecAddress, type ContractDataSource, Fr, PublicDataTreeLeafPreimage } from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot } from '@aztec/circuits.js/hash';
import { type IndexedTreeLeafPreimage } from '@aztec/foundation/trees';

import { type MockProxy, mock } from 'jest-mock-extended';

import { WorldStateDB } from './public_db_sources.js';

const DB_VALUES_SIZE = 10;

describe('world_state_public_db', () => {
  let db: MockProxy<MerkleTreeWriteOperations>;
  const contractDataSource: MockProxy<ContractDataSource> = mock<ContractDataSource>();
  let dbStorage: Map<number, Map<bigint, Buffer>>;
  let addresses: AztecAddress[];
  let slots: Fr[];
  let dbValues: Fr[];

  let worldStateDB: WorldStateDB;

  beforeEach(() => {
    addresses = Array(DB_VALUES_SIZE).fill(0).map(AztecAddress.random);
    slots = Array(DB_VALUES_SIZE).fill(0).map(Fr.random);
    dbValues = Array(DB_VALUES_SIZE).fill(0).map(Fr.random);
    const publicDataEntries = Array(DB_VALUES_SIZE)
      .fill(0)
      .map((_, idx: number) => {
        const leafSlot = computePublicDataTreeLeafSlot(addresses[idx], slots[idx]);
        return new PublicDataTreeLeafPreimage(leafSlot, dbValues[idx], Fr.ZERO, 0n);
      });
    dbStorage = new Map<number, Map<bigint, Buffer>>([
      [
        MerkleTreeId.PUBLIC_DATA_TREE,
        new Map(publicDataEntries.map((preimage, idx) => [BigInt(idx), preimage.toBuffer()])),
      ],
    ]);
    db = mock<MerkleTreeWriteOperations>();
    db.getPreviousValueIndex.mockImplementation(
      (
        treeId: MerkleTreeId,
        leafSlot: bigint,
      ): Promise<
        | {
            index: bigint;
            alreadyPresent: boolean;
          }
        | undefined
      > => {
        const sortedByLeafSlot = publicDataEntries.slice().sort((a, b) => Number(a.getKey() - b.getKey()));
        let findResult = undefined;
        for (const preimage of sortedByLeafSlot) {
          if (preimage.getKey() > leafSlot) {
            break;
          }
          findResult = {
            index: BigInt(publicDataEntries.indexOf(preimage)),
            alreadyPresent: preimage.getKey() === leafSlot,
          };
        }

        return Promise.resolve(findResult);
      },
    );
    db.getLeafPreimage.mockImplementation((treeId: MerkleTreeId, index: bigint): Promise<IndexedTreeLeafPreimage> => {
      const tree = dbStorage.get(treeId);
      if (!tree) {
        throw new Error('Invalid Tree Id');
      }

      return Promise.resolve(PublicDataTreeLeafPreimage.fromBuffer(tree.get(index)!));
    });

    worldStateDB = new WorldStateDB(db, contractDataSource);
  });

  it('reads unwritten value from merkle tree db', async function () {
    expect(await worldStateDB.storageRead(addresses[0], slots[0])).toEqual(dbValues[0]);
    expect(await worldStateDB.storageRead(addresses[1], slots[1])).toEqual(dbValues[1]);
  });

  it('reads uncommitted value back', async function () {
    expect(await worldStateDB.storageRead(addresses[0], slots[0])).toEqual(dbValues[0]);

    const newValue = new Fr(dbValues[0].toBigInt() + 1n);

    // write a new value to our first value
    await worldStateDB.storageWrite(addresses[0], slots[0], newValue);

    // should read back the uncommitted value
    expect(await worldStateDB.storageRead(addresses[0], slots[0])).toEqual(newValue);

    // other slots should be unchanged
    expect(await worldStateDB.storageRead(addresses[1], slots[1])).toEqual(dbValues[1]);
  });

  it('reads committed value back', async function () {
    expect(await worldStateDB.storageRead(addresses[0], slots[0])).toEqual(dbValues[0]);

    const newValue = new Fr(dbValues[0].toBigInt() + 1n);

    // write a new value to our first value
    await worldStateDB.storageWrite(addresses[0], slots[0], newValue);

    // commit the data
    await worldStateDB.commit();

    // should read back the committed value
    expect(await worldStateDB.storageRead(addresses[0], slots[0])).toEqual(newValue);

    // other slots should be unchanged
    expect(await worldStateDB.storageRead(addresses[1], slots[1])).toEqual(dbValues[1]);
  });

  it('will not rollback a committed value', async function () {
    expect(await worldStateDB.storageRead(addresses[0], slots[0])).toEqual(dbValues[0]);

    const newValue = new Fr(dbValues[0].toBigInt() + 1n);

    // write a new value to our first value
    await worldStateDB.storageWrite(addresses[0], slots[0], newValue);

    // commit the data
    await worldStateDB.commit();

    // should read back the committed value
    expect(await worldStateDB.storageRead(addresses[0], slots[0])).toEqual(newValue);

    await worldStateDB.rollbackToCommit();

    // should still read back the committed value
    expect(await worldStateDB.storageRead(addresses[0], slots[0])).toEqual(newValue);
  });

  it('reads original value if rolled back uncommitted value', async function () {
    expect(await worldStateDB.storageRead(addresses[0], slots[0])).toEqual(dbValues[0]);

    const newValue = new Fr(dbValues[0].toBigInt() + 1n);

    // write a new value to our first value
    await worldStateDB.storageWrite(addresses[0], slots[0], newValue);

    // should read back the uncommitted value
    expect(await worldStateDB.storageRead(addresses[0], slots[0])).toEqual(newValue);

    // now rollback
    await worldStateDB.rollbackToCommit();

    // should now read the original value
    expect(await worldStateDB.storageRead(addresses[0], slots[0])).toEqual(dbValues[0]);
  });

  it('reads newly uncommitted value back', async function () {
    expect(await worldStateDB.storageRead(addresses[0], slots[0])).toEqual(dbValues[0]);

    const newValue = new Fr(dbValues[0].toBigInt() + 1n);

    // write a new value to our first value
    await worldStateDB.storageWrite(addresses[0], slots[0], newValue);

    // commit the data
    await worldStateDB.commit();

    // should read back the committed value
    expect(await worldStateDB.storageRead(addresses[0], slots[0])).toEqual(newValue);

    // other slots should be unchanged
    expect(await worldStateDB.storageRead(addresses[1], slots[1])).toEqual(dbValues[1]);

    // now update the slot again
    const newValue2 = new Fr(dbValues[0].toBigInt() + 2n);
    // write a new value to our first value
    await worldStateDB.storageWrite(addresses[0], slots[0], newValue2);

    // should read back the uncommitted value
    expect(await worldStateDB.storageRead(addresses[0], slots[0])).toEqual(newValue2);
  });

  it('rolls back to previously committed value', async function () {
    expect(await worldStateDB.storageRead(addresses[0], slots[0])).toEqual(dbValues[0]);

    const newValue = new Fr(dbValues[0].toBigInt() + 1n);

    // write a new value to our first value
    await worldStateDB.storageWrite(addresses[0], slots[0], newValue);

    // commit the data
    await worldStateDB.commit();

    // should read back the committed value
    expect(await worldStateDB.storageRead(addresses[0], slots[0])).toEqual(newValue);

    // other slots should be unchanged
    expect(await worldStateDB.storageRead(addresses[1], slots[1])).toEqual(dbValues[1]);

    // now update the slot again
    const newValue2 = new Fr(dbValues[0].toBigInt() + 2n);
    // write a new value to our first value
    await worldStateDB.storageWrite(addresses[0], slots[0], newValue2);

    // should read back the uncommitted value
    expect(await worldStateDB.storageRead(addresses[0], slots[0])).toEqual(newValue2);

    // rollback
    await worldStateDB.rollbackToCommit();

    // should read back the previously committed value
    expect(await worldStateDB.storageRead(addresses[0], slots[0])).toEqual(newValue);
  });

  it('can use checkpoints', async function () {
    const read = () => worldStateDB.storageRead(addresses[0], slots[0]);
    const write = (value: Fr) => worldStateDB.storageWrite(addresses[0], slots[0], value);

    const newValue = new Fr(dbValues[0].toBigInt() + 1n);
    const newValue2 = new Fr(dbValues[0].toBigInt() + 2n);
    const newValue3 = new Fr(dbValues[0].toBigInt() + 3n);
    const newValue4 = new Fr(dbValues[0].toBigInt() + 4n);
    const newValue5 = new Fr(dbValues[0].toBigInt() + 5n);
    const newValue6 = new Fr(dbValues[0].toBigInt() + 6n);

    // basic
    expect(await read()).toEqual(dbValues[0]);
    await write(newValue);
    await worldStateDB.checkpoint();
    await write(newValue2);
    await worldStateDB.rollbackToCheckpoint();
    expect(await read()).toEqual(newValue);
    await worldStateDB.rollbackToCommit();
    expect(await read()).toEqual(dbValues[0]);

    // write, checkpoint, commit, rollback to checkpoint, rollback to commit
    await write(newValue3);
    await worldStateDB.checkpoint();
    await worldStateDB.rollbackToCheckpoint();
    expect(await read()).toEqual(newValue3);
    await worldStateDB.commit();
    await worldStateDB.rollbackToCommit();
    expect(await read()).toEqual(newValue3);

    // writes after checkpoint take precedence
    await write(newValue4);
    await worldStateDB.checkpoint();
    await write(newValue5);
    await worldStateDB.commit();
    expect(await read()).toEqual(newValue5);

    // rollback to checkpoint does not cross commit boundaries
    await write(newValue6);
    await worldStateDB.rollbackToCheckpoint();
    expect(await read()).toEqual(newValue5);
  });
});
