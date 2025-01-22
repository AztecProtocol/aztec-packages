import { NoteStatus, type NotesFilter, randomTxHash } from '@aztec/circuit-types';
import {
  AztecAddress,
  CompleteAddress,
  INITIAL_L2_BLOCK_NUM,
  PublicKeys,
  SerializableContractInstance,
} from '@aztec/circuits.js';
import { makeHeader } from '@aztec/circuits.js/testing';
import { FunctionType } from '@aztec/foundation/abi';
import { timesParallel } from '@aztec/foundation/collection';
import { randomInt } from '@aztec/foundation/crypto';
import { Fr, Point } from '@aztec/foundation/fields';
import { BenchmarkingContractArtifact } from '@aztec/noir-contracts.js/Benchmarking';
import { TestContractArtifact } from '@aztec/noir-contracts.js/Test';

import times from 'lodash.times';

import { NoteDao } from './note_dao.js';
import { type PxeDatabase } from './pxe_database.js';

/**
 * A common test suite for a PXE database.
 * @param getDatabase - A function that returns a database instance.
 */
export function describePxeDatabase(getDatabase: () => PxeDatabase) {
  let database: PxeDatabase;

  beforeEach(() => {
    database = getDatabase();
  });

  describe('Database', () => {
    describe('auth witnesses', () => {
      it('stores and retrieves auth witnesses', async () => {
        const messageHash = Fr.random();
        const witness = [Fr.random(), Fr.random()];

        await database.addAuthWitness(messageHash, witness);
        await expect(database.getAuthWitness(messageHash)).resolves.toEqual(witness);
      });

      it("returns undefined if it doesn't have auth witnesses for the message", async () => {
        const messageHash = Fr.random();
        await expect(database.getAuthWitness(messageHash)).resolves.toBeUndefined();
      });

      it.skip('refuses to overwrite auth witnesses for the same message', async () => {
        const messageHash = Fr.random();
        const witness = [Fr.random(), Fr.random()];

        await database.addAuthWitness(messageHash, witness);
        await expect(database.addAuthWitness(messageHash, witness)).rejects.toThrow();
      });
    });

    describe('capsules', () => {
      it('stores and retrieves capsules', async () => {
        const capsule = [Fr.random(), Fr.random()];

        await database.addCapsule(capsule);
        await expect(database.popCapsule()).resolves.toEqual(capsule);
      });

      it("returns undefined if it doesn't have capsules", async () => {
        await expect(database.popCapsule()).resolves.toBeUndefined();
      });

      it('behaves like a stack when storing capsules', async () => {
        const capsule1 = [Fr.random(), Fr.random()];
        const capsule2 = [Fr.random(), Fr.random()];

        await database.addCapsule(capsule1);
        await database.addCapsule(capsule2);
        await expect(database.popCapsule()).resolves.toEqual(capsule2);
        await expect(database.popCapsule()).resolves.toEqual(capsule1);
      });
    });

    describe('incoming notes', () => {
      let owners: CompleteAddress[];
      let contractAddresses: AztecAddress[];
      let storageSlots: Fr[];
      let notes: NoteDao[];

      const filteringTests: [() => Promise<NotesFilter>, () => Promise<NoteDao[]>][] = [
        [() => Promise.resolve({}), () => Promise.resolve(notes)],

        [
          () => Promise.resolve({ contractAddress: contractAddresses[0] }),
          () => Promise.resolve(notes.filter(note => note.contractAddress.equals(contractAddresses[0]))),
        ],
        [async () => ({ contractAddress: await AztecAddress.random() }), () => Promise.resolve([])],

        [
          () => Promise.resolve({ storageSlot: storageSlots[0] }),
          () => Promise.resolve(notes.filter(note => note.storageSlot.equals(storageSlots[0]))),
        ],
        [() => Promise.resolve({ storageSlot: Fr.random() }), () => Promise.resolve([])],

        [() => Promise.resolve({ txHash: notes[0].txHash }), () => Promise.resolve([notes[0]])],
        [() => Promise.resolve({ txHash: randomTxHash() }), () => Promise.resolve([])],

        [
          () => Promise.resolve({ owner: owners[0].address }),
          async () => {
            const ownerAddressPoint = await owners[0].address.toAddressPoint();
            return notes.filter(note => note.addressPoint.equals(ownerAddressPoint));
          },
        ],

        [
          () => Promise.resolve({ contractAddress: contractAddresses[0], storageSlot: storageSlots[0] }),
          () =>
            Promise.resolve(
              notes.filter(
                note => note.contractAddress.equals(contractAddresses[0]) && note.storageSlot.equals(storageSlots[0]),
              ),
            ),
        ],
        [
          () => Promise.resolve({ contractAddress: contractAddresses[0], storageSlot: storageSlots[1] }),
          () => Promise.resolve([]),
        ],
      ];

      beforeEach(async () => {
        owners = times(2, () => CompleteAddress.random());
        contractAddresses = await timesParallel(2, () => AztecAddress.random());
        storageSlots = times(2, () => Fr.random());

        notes = await timesParallel(10, async i => {
          const addressPoint = await owners[i % owners.length].address.toAddressPoint();
          return NoteDao.random({
            contractAddress: contractAddresses[i % contractAddresses.length],
            storageSlot: storageSlots[i % storageSlots.length],
            addressPoint,
            index: BigInt(i),
            l2BlockNumber: i,
          });
        });

        for (const owner of owners) {
          await database.addCompleteAddress(owner);
        }
      });

      it.each(filteringTests)('stores notes in bulk and retrieves notes', async (getFilter, getExpected) => {
        await database.addNotes(notes);
        const returnedNotes = await database.getNotes(await getFilter());
        const expected = await getExpected();
        expect(returnedNotes.sort()).toEqual(expected.sort());
      });

      it.each(filteringTests)('stores notes one by one and retrieves notes', async (getFilter, getExpected) => {
        for (const note of notes) {
          await database.addNote(note);
        }

        const returnedNotes = await database.getNotes(await getFilter());

        const expected = await getExpected();
        expect(returnedNotes.sort()).toEqual(expected.sort());
      });

      it.each(filteringTests)('retrieves nullified notes', async (getFilter, getExpected) => {
        await database.addNotes(notes);

        // Nullify all notes and use the same filter as other test cases
        for (const owner of owners) {
          const ownerAddressPoint = await owner.address.toAddressPoint();
          const notesToNullify = notes.filter(note => note.addressPoint.equals(ownerAddressPoint));
          const nullifiers = notesToNullify.map(note => ({
            data: note.siloedNullifier,
            l2BlockNumber: note.l2BlockNumber,
            l2BlockHash: note.l2BlockHash,
          }));
          await expect(database.removeNullifiedNotes(nullifiers, ownerAddressPoint)).resolves.toEqual(notesToNullify);
        }
        const filter = await getFilter();
        const returnedNotes = await database.getNotes({ ...filter, status: NoteStatus.ACTIVE_OR_NULLIFIED });
        const expected = await getExpected();
        expect(returnedNotes.sort()).toEqual(expected.sort());
      });

      it('skips nullified notes by default or when requesting active', async () => {
        await database.addNotes(notes);
        const ownerAddressPoint = await owners[0].address.toAddressPoint();
        const notesToNullify = notes.filter(note => note.addressPoint.equals(ownerAddressPoint));
        const nullifiers = notesToNullify.map(note => ({
          data: note.siloedNullifier,
          l2BlockNumber: note.l2BlockNumber,
          l2BlockHash: note.l2BlockHash,
        }));
        await expect(database.removeNullifiedNotes(nullifiers, notesToNullify[0].addressPoint)).resolves.toEqual(
          notesToNullify,
        );

        const actualNotesWithDefault = await database.getNotes({});
        const actualNotesWithActive = await database.getNotes({ status: NoteStatus.ACTIVE });

        expect(actualNotesWithDefault).toEqual(actualNotesWithActive);
        expect(actualNotesWithActive).toEqual(notes.filter(note => !notesToNullify.includes(note)));
      });

      it('handles note unnullification', async () => {
        await database.setHeader(makeHeader(randomInt(1000), 100, 0 /** slot number */));
        await database.addNotes(notes);
        const ownerAddressPoint = await owners[0].address.toAddressPoint();

        const notesToNullify = notes.filter(note => note.addressPoint.equals(ownerAddressPoint));
        const nullifiers = notesToNullify.map(note => ({
          data: note.siloedNullifier,
          l2BlockNumber: 99,
          l2BlockHash: Fr.random().toString(),
        }));
        await expect(database.removeNullifiedNotes(nullifiers, notesToNullify[0].addressPoint)).resolves.toEqual(
          notesToNullify,
        );
        await expect(database.unnullifyNotesAfter(98)).resolves.toEqual(undefined);

        const result = await database.getNotes({ status: NoteStatus.ACTIVE, owner: owners[0].address });

        expect(result.sort()).toEqual([...notesToNullify].sort());
      });

      it('returns active and nullified notes when requesting either', async () => {
        await database.addNotes(notes);
        const ownerAddressPoint = await owners[0].address.toAddressPoint();

        const notesToNullify = notes.filter(note => note.addressPoint.equals(ownerAddressPoint));
        const nullifiers = notesToNullify.map(note => ({
          data: note.siloedNullifier,
          l2BlockNumber: note.l2BlockNumber,
          l2BlockHash: note.l2BlockHash,
        }));
        await expect(database.removeNullifiedNotes(nullifiers, notesToNullify[0].addressPoint)).resolves.toEqual(
          notesToNullify,
        );

        const result = await database.getNotes({
          status: NoteStatus.ACTIVE_OR_NULLIFIED,
        });

        // We have to compare the sorted arrays since the database does not return the same order as when originally
        // inserted combining active and nullified results.
        expect(result.sort()).toEqual([...notes].sort());
      });

      it('stores notes one by one and retrieves notes with siloed account', async () => {
        for (const note of notes.slice(0, 5)) {
          await database.addNote(note, owners[0].address);
        }

        for (const note of notes.slice(5)) {
          await database.addNote(note, owners[1].address);
        }

        const owner0Notes = await database.getNotes({
          scopes: [owners[0].address],
        });

        expect(owner0Notes.sort()).toEqual(notes.slice(0, 5).sort());

        const owner1Notes = await database.getNotes({
          scopes: [owners[1].address],
        });

        expect(owner1Notes.sort()).toEqual(notes.slice(5).sort());

        const bothOwnerNotes = await database.getNotes({
          scopes: [owners[0].address, owners[1].address],
        });

        expect(bothOwnerNotes.sort()).toEqual(notes.sort());
      });

      it('a nullified note removes notes from all accounts in the pxe', async () => {
        await database.addNote(notes[0], owners[0].address);
        await database.addNote(notes[0], owners[1].address);

        await expect(
          database.getNotes({
            scopes: [owners[0].address],
          }),
        ).resolves.toEqual([notes[0]]);
        await expect(
          database.getNotes({
            scopes: [owners[1].address],
          }),
        ).resolves.toEqual([notes[0]]);
        const ownerAddressPoint = await owners[0].address.toAddressPoint();
        await expect(
          database.removeNullifiedNotes(
            [
              {
                data: notes[0].siloedNullifier,
                l2BlockHash: notes[0].l2BlockHash,
                l2BlockNumber: notes[0].l2BlockNumber,
              },
            ],
            ownerAddressPoint,
          ),
        ).resolves.toEqual([notes[0]]);

        await expect(
          database.getNotes({
            scopes: [owners[0].address],
          }),
        ).resolves.toEqual([]);
        await expect(
          database.getNotes({
            scopes: [owners[1].address],
          }),
        ).resolves.toEqual([]);
      });

      it('removes notes after a given block', async () => {
        await database.addNotes(notes, owners[0].address);

        await database.removeNotesAfter(5);
        const result = await database.getNotes({ scopes: [owners[0].address] });
        expect(new Set(result)).toEqual(new Set(notes.slice(0, 6)));
      });
    });

    describe('block header', () => {
      it('stores and retrieves the block header', async () => {
        const header = makeHeader(randomInt(1000), INITIAL_L2_BLOCK_NUM, 0 /** slot number */);

        await database.setHeader(header);
        await expect(database.getBlockHeader()).resolves.toEqual(header);
      });

      it('rejects getting header if no block set', async () => {
        await expect(() => database.getBlockHeader()).rejects.toThrow();
      });
    });

    describe('addresses', () => {
      it('stores and retrieves addresses', async () => {
        const address = CompleteAddress.random();
        await expect(database.addCompleteAddress(address)).resolves.toBe(true);
        await expect(database.getCompleteAddress(address.address)).resolves.toEqual(address);
      });

      it('silently ignores an address it already knows about', async () => {
        const address = CompleteAddress.random();
        await expect(database.addCompleteAddress(address)).resolves.toBe(true);
        await expect(database.addCompleteAddress(address)).resolves.toBe(false);
      });

      it.skip('refuses to overwrite an address with a different public key', async () => {
        const address = CompleteAddress.random();
        const otherAddress = new CompleteAddress(
          address.address,
          new PublicKeys(await Point.random(), await Point.random(), await Point.random(), await Point.random()),
          address.partialAddress,
        );

        await database.addCompleteAddress(address);
        await expect(database.addCompleteAddress(otherAddress)).rejects.toThrow();
      });

      it('returns all addresses', async () => {
        const addresses = Array.from({ length: 10 }).map(() => CompleteAddress.random());
        for (const address of addresses) {
          await database.addCompleteAddress(address);
        }

        const result = await database.getCompleteAddresses();
        expect(result).toEqual(expect.arrayContaining(addresses));
      });

      it('returns a single address', async () => {
        const addresses = Array.from({ length: 10 }).map(() => CompleteAddress.random());
        for (const address of addresses) {
          await database.addCompleteAddress(address);
        }

        const result = await database.getCompleteAddress(addresses[3].address);
        expect(result).toEqual(addresses[3]);
      });

      it("returns an empty array if it doesn't have addresses", async () => {
        expect(await database.getCompleteAddresses()).toEqual([]);
      });

      it("returns undefined if it doesn't have an address", async () => {
        expect(await database.getCompleteAddress(CompleteAddress.random().address)).toBeUndefined();
      });
    });

    describe('contracts', () => {
      it('stores a contract artifact', async () => {
        const artifact = BenchmarkingContractArtifact;
        const id = Fr.random();
        await database.addContractArtifact(id, artifact);
        await expect(database.getContractArtifact(id)).resolves.toEqual(artifact);
      });

      it('does not store a contract artifact with a duplicate private function selector', async () => {
        const artifact = TestContractArtifact;
        const index = artifact.functions.findIndex(fn => fn.functionType === FunctionType.PRIVATE);

        const copiedFn = structuredClone(artifact.functions[index]);
        artifact.functions.push(copiedFn);

        const id = Fr.random();
        await expect(database.addContractArtifact(id, artifact)).rejects.toThrow(
          'Repeated function selectors of private functions',
        );
      });

      it('stores a contract instance', async () => {
        const address = await AztecAddress.random();
        const instance = (await SerializableContractInstance.random()).withAddress(address);
        await database.addContractInstance(instance);
        await expect(database.getContractInstance(address)).resolves.toEqual(instance);
      });
    });

    describe('contract non-volatile database', () => {
      let contract: AztecAddress;

      beforeEach(async () => {
        // Setup mock contract address
        contract = await AztecAddress.random();
      });

      it('stores and loads a single value', async () => {
        const slot = new Fr(1);
        const values = [new Fr(42)];

        await database.dbStore(contract, slot, values);
        const result = await database.dbLoad(contract, slot);
        expect(result).toEqual(values);
      });

      it('stores and loads multiple values', async () => {
        const slot = new Fr(1);
        const values = [new Fr(42), new Fr(43), new Fr(44)];

        await database.dbStore(contract, slot, values);
        const result = await database.dbLoad(contract, slot);
        expect(result).toEqual(values);
      });

      it('overwrites existing values', async () => {
        const slot = new Fr(1);
        const initialValues = [new Fr(42)];
        const newValues = [new Fr(100)];

        await database.dbStore(contract, slot, initialValues);
        await database.dbStore(contract, slot, newValues);

        const result = await database.dbLoad(contract, slot);
        expect(result).toEqual(newValues);
      });

      it('stores values for different contracts independently', async () => {
        const anotherContract = await AztecAddress.random();
        const slot = new Fr(1);
        const values1 = [new Fr(42)];
        const values2 = [new Fr(100)];

        await database.dbStore(contract, slot, values1);
        await database.dbStore(anotherContract, slot, values2);

        const result1 = await database.dbLoad(contract, slot);
        const result2 = await database.dbLoad(anotherContract, slot);

        expect(result1).toEqual(values1);
        expect(result2).toEqual(values2);
      });

      it('returns null for non-existent slots', async () => {
        const slot = Fr.random();
        const result = await database.dbLoad(contract, slot);
        expect(result).toBeNull();
      });

      it('deletes a slot', async () => {
        const slot = new Fr(1);
        const values = [new Fr(42)];

        await database.dbStore(contract, slot, values);
        await database.dbDelete(contract, slot);

        expect(await database.dbLoad(contract, slot)).toBeNull();
      });

      it('deletes an empty slot', async () => {
        const slot = new Fr(1);
        await database.dbDelete(contract, slot);

        expect(await database.dbLoad(contract, slot)).toBeNull();
      });

      it('copies a single value', async () => {
        const slot = new Fr(1);
        const values = [new Fr(42)];

        await database.dbStore(contract, slot, values);

        const dstSlot = new Fr(5);
        await database.dbCopy(contract, slot, dstSlot, 1);

        expect(await database.dbLoad(contract, dstSlot)).toEqual(values);
      });

      it('copies multiple non-overlapping values', async () => {
        const src = new Fr(1);
        const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

        await database.dbStore(contract, src, valuesArray[0]);
        await database.dbStore(contract, src.add(new Fr(1)), valuesArray[1]);
        await database.dbStore(contract, src.add(new Fr(2)), valuesArray[2]);

        const dst = new Fr(5);
        await database.dbCopy(contract, src, dst, 3);

        expect(await database.dbLoad(contract, dst)).toEqual(valuesArray[0]);
        expect(await database.dbLoad(contract, dst.add(new Fr(1)))).toEqual(valuesArray[1]);
        expect(await database.dbLoad(contract, dst.add(new Fr(2)))).toEqual(valuesArray[2]);
      });

      it('copies overlapping values with src ahead', async () => {
        const src = new Fr(1);
        const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

        await database.dbStore(contract, src, valuesArray[0]);
        await database.dbStore(contract, src.add(new Fr(1)), valuesArray[1]);
        await database.dbStore(contract, src.add(new Fr(2)), valuesArray[2]);

        const dst = new Fr(2);
        await database.dbCopy(contract, src, dst, 3);

        expect(await database.dbLoad(contract, dst)).toEqual(valuesArray[0]);
        expect(await database.dbLoad(contract, dst.add(new Fr(1)))).toEqual(valuesArray[1]);
        expect(await database.dbLoad(contract, dst.add(new Fr(2)))).toEqual(valuesArray[2]);

        // Slots 2 and 3 (src[1] and src[2]) should have been overwritten since they are also dst[0] and dst[1]
        expect(await database.dbLoad(contract, src)).toEqual(valuesArray[0]); // src[0] (unchanged)
        expect(await database.dbLoad(contract, src.add(new Fr(1)))).toEqual(valuesArray[0]); // dst[0]
        expect(await database.dbLoad(contract, src.add(new Fr(2)))).toEqual(valuesArray[1]); // dst[1]
      });

      it('copies overlapping values with dst ahead', async () => {
        const src = new Fr(5);
        const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

        await database.dbStore(contract, src, valuesArray[0]);
        await database.dbStore(contract, src.add(new Fr(1)), valuesArray[1]);
        await database.dbStore(contract, src.add(new Fr(2)), valuesArray[2]);

        const dst = new Fr(4);
        await database.dbCopy(contract, src, dst, 3);

        expect(await database.dbLoad(contract, dst)).toEqual(valuesArray[0]);
        expect(await database.dbLoad(contract, dst.add(new Fr(1)))).toEqual(valuesArray[1]);
        expect(await database.dbLoad(contract, dst.add(new Fr(2)))).toEqual(valuesArray[2]);

        // Slots 5 and 6 (src[0] and src[1]) should have been overwritten since they are also dst[1] and dst[2]
        expect(await database.dbLoad(contract, src)).toEqual(valuesArray[1]); // dst[1]
        expect(await database.dbLoad(contract, src.add(new Fr(1)))).toEqual(valuesArray[2]); // dst[2]
        expect(await database.dbLoad(contract, src.add(new Fr(2)))).toEqual(valuesArray[2]); // src[2] (unchanged)
      });

      it('copying fails if any value is empty', async () => {
        const src = new Fr(1);
        const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

        await database.dbStore(contract, src, valuesArray[0]);
        // We skip src[1]
        await database.dbStore(contract, src.add(new Fr(2)), valuesArray[2]);

        const dst = new Fr(5);
        await expect(database.dbCopy(contract, src, dst, 3)).rejects.toThrow('Attempted to copy empty slot');
      });
    });
  });
}
