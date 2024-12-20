import { type IncomingNotesFilter, NoteStatus, randomTxHash } from '@aztec/circuit-types';
import {
  AztecAddress,
  CompleteAddress,
  INITIAL_L2_BLOCK_NUM,
  PublicKeys,
  SerializableContractInstance,
} from '@aztec/circuits.js';
import { makeHeader } from '@aztec/circuits.js/testing';
import { FunctionType } from '@aztec/foundation/abi';
import { randomInt } from '@aztec/foundation/crypto';
import { Fr, Point } from '@aztec/foundation/fields';
import { BenchmarkingContractArtifact } from '@aztec/noir-contracts.js/Benchmarking';
import { TestContractArtifact } from '@aztec/noir-contracts.js/Test';

import { IncomingNoteDao } from './incoming_note_dao.js';
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
      let notes: IncomingNoteDao[];

      const filteringTests: [() => IncomingNotesFilter, () => IncomingNoteDao[]][] = [
        [() => ({}), () => notes],

        [
          () => ({ contractAddress: contractAddresses[0] }),
          () => notes.filter(note => note.contractAddress.equals(contractAddresses[0])),
        ],
        [() => ({ contractAddress: AztecAddress.random() }), () => []],

        [
          () => ({ storageSlot: storageSlots[0] }),
          () => notes.filter(note => note.storageSlot.equals(storageSlots[0])),
        ],
        [() => ({ storageSlot: Fr.random() }), () => []],

        [() => ({ txHash: notes[0].txHash }), () => [notes[0]]],
        [() => ({ txHash: randomTxHash() }), () => []],

        [
          () => ({ owner: owners[0].address }),
          () => notes.filter(note => note.addressPoint.equals(owners[0].address.toAddressPoint())),
        ],

        [
          () => ({ contractAddress: contractAddresses[0], storageSlot: storageSlots[0] }),
          () =>
            notes.filter(
              note => note.contractAddress.equals(contractAddresses[0]) && note.storageSlot.equals(storageSlots[0]),
            ),
        ],
        [() => ({ contractAddress: contractAddresses[0], storageSlot: storageSlots[1] }), () => []],
      ];

      beforeEach(async () => {
        owners = Array.from({ length: 2 }).map(() => CompleteAddress.random());
        contractAddresses = Array.from({ length: 2 }).map(() => AztecAddress.random());
        storageSlots = Array.from({ length: 2 }).map(() => Fr.random());

        notes = Array.from({ length: 10 }).map((_, i) =>
          IncomingNoteDao.random({
            contractAddress: contractAddresses[i % contractAddresses.length],
            storageSlot: storageSlots[i % storageSlots.length],
            addressPoint: owners[i % owners.length].address.toAddressPoint(),
            index: BigInt(i),
            l2BlockNumber: i,
          }),
        );

        for (const owner of owners) {
          await database.addCompleteAddress(owner);
        }
      });

      it.each(filteringTests)('stores notes in bulk and retrieves notes', async (getFilter, getExpected) => {
        await database.addNotes(notes);
        const returnedNotes = await database.getIncomingNotes(getFilter());

        expect(returnedNotes.sort()).toEqual(getExpected().sort());
      });

      it.each(filteringTests)('stores notes one by one and retrieves notes', async (getFilter, getExpected) => {
        for (const note of notes) {
          await database.addNote(note);
        }

        const returnedNotes = await database.getIncomingNotes(getFilter());

        expect(returnedNotes.sort()).toEqual(getExpected().sort());
      });

      it.each(filteringTests)('retrieves nullified notes', async (getFilter, getExpected) => {
        await database.addNotes(notes);

        // Nullify all notes and use the same filter as other test cases
        for (const owner of owners) {
          const notesToNullify = notes.filter(note => note.addressPoint.equals(owner.address.toAddressPoint()));
          const nullifiers = notesToNullify.map(note => ({
            data: note.siloedNullifier,
            l2BlockNumber: note.l2BlockNumber,
            l2BlockHash: note.l2BlockHash,
          }));
          await expect(database.removeNullifiedNotes(nullifiers, owner.address.toAddressPoint())).resolves.toEqual(
            notesToNullify,
          );
        }

        await expect(
          database.getIncomingNotes({ ...getFilter(), status: NoteStatus.ACTIVE_OR_NULLIFIED }),
        ).resolves.toEqual(getExpected());
      });

      it('skips nullified notes by default or when requesting active', async () => {
        await database.addNotes(notes);

        const notesToNullify = notes.filter(note => note.addressPoint.equals(owners[0].address.toAddressPoint()));
        const nullifiers = notesToNullify.map(note => ({
          data: note.siloedNullifier,
          l2BlockNumber: note.l2BlockNumber,
          l2BlockHash: note.l2BlockHash,
        }));
        await expect(database.removeNullifiedNotes(nullifiers, notesToNullify[0].addressPoint)).resolves.toEqual(
          notesToNullify,
        );

        const actualNotesWithDefault = await database.getIncomingNotes({});
        const actualNotesWithActive = await database.getIncomingNotes({ status: NoteStatus.ACTIVE });

        expect(actualNotesWithDefault).toEqual(actualNotesWithActive);
        expect(actualNotesWithActive).toEqual(notes.filter(note => !notesToNullify.includes(note)));
      });

      it('handles note unnullification', async () => {
        await database.setHeader(makeHeader(randomInt(1000), 100, 0 /** slot number */));
        await database.addNotes(notes);

        const notesToNullify = notes.filter(note => note.addressPoint.equals(owners[0].address.toAddressPoint()));
        const nullifiers = notesToNullify.map(note => ({
          data: note.siloedNullifier,
          l2BlockNumber: 99,
          l2BlockHash: Fr.random().toString(),
        }));
        await expect(database.removeNullifiedNotes(nullifiers, notesToNullify[0].addressPoint)).resolves.toEqual(
          notesToNullify,
        );
        await expect(database.unnullifyNotesAfter(98)).resolves.toEqual(undefined);

        const result = await database.getIncomingNotes({ status: NoteStatus.ACTIVE, owner: owners[0].address });

        expect(result.sort()).toEqual([...notesToNullify].sort());
      });

      it('returns active and nullified notes when requesting either', async () => {
        await database.addNotes(notes);

        const notesToNullify = notes.filter(note => note.addressPoint.equals(owners[0].address.toAddressPoint()));
        const nullifiers = notesToNullify.map(note => ({
          data: note.siloedNullifier,
          l2BlockNumber: note.l2BlockNumber,
          l2BlockHash: note.l2BlockHash,
        }));
        await expect(database.removeNullifiedNotes(nullifiers, notesToNullify[0].addressPoint)).resolves.toEqual(
          notesToNullify,
        );

        const result = await database.getIncomingNotes({
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

        const owner0IncomingNotes = await database.getIncomingNotes({
          scopes: [owners[0].address],
        });

        expect(owner0IncomingNotes.sort()).toEqual(notes.slice(0, 5).sort());

        const owner1IncomingNotes = await database.getIncomingNotes({
          scopes: [owners[1].address],
        });

        expect(owner1IncomingNotes.sort()).toEqual(notes.slice(5).sort());

        const bothOwnerIncomingNotes = await database.getIncomingNotes({
          scopes: [owners[0].address, owners[1].address],
        });

        expect(bothOwnerIncomingNotes.sort()).toEqual(notes.sort());
      });

      it('a nullified note removes notes from all accounts in the pxe', async () => {
        await database.addNote(notes[0], owners[0].address);
        await database.addNote(notes[0], owners[1].address);

        await expect(
          database.getIncomingNotes({
            scopes: [owners[0].address],
          }),
        ).resolves.toEqual([notes[0]]);
        await expect(
          database.getIncomingNotes({
            scopes: [owners[1].address],
          }),
        ).resolves.toEqual([notes[0]]);

        await expect(
          database.removeNullifiedNotes(
            [
              {
                data: notes[0].siloedNullifier,
                l2BlockHash: notes[0].l2BlockHash,
                l2BlockNumber: notes[0].l2BlockNumber,
              },
            ],
            owners[0].address.toAddressPoint(),
          ),
        ).resolves.toEqual([notes[0]]);

        await expect(
          database.getIncomingNotes({
            scopes: [owners[0].address],
          }),
        ).resolves.toEqual([]);
        await expect(
          database.getIncomingNotes({
            scopes: [owners[1].address],
          }),
        ).resolves.toEqual([]);
      });

      it('removes notes after a given block', async () => {
        await database.addNotes(notes, owners[0].address);

        await database.removeNotesAfter(5);
        const result = await database.getIncomingNotes({ scopes: [owners[0].address] });
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
          new PublicKeys(Point.random(), Point.random(), Point.random(), Point.random()),
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
        const address = AztecAddress.random();
        const instance = SerializableContractInstance.random().withAddress(address);
        await database.addContractInstance(instance);
        await expect(database.getContractInstance(address)).resolves.toEqual(instance);
      });
    });

    describe('contract store', () => {
      let contract: AztecAddress;

      beforeEach(() => {
        // Setup mock contract address
        contract = AztecAddress.random();
      });

      it('stores and loads a single value', async () => {
        const key = new Fr(1);
        const values = [new Fr(42)];

        await database.store(contract, key, values);
        const result = await database.load(contract, key);
        expect(result).toEqual(values);
      });

      it('stores and loads multiple values', async () => {
        const key = new Fr(1);
        const values = [new Fr(42), new Fr(43), new Fr(44)];

        await database.store(contract, key, values);
        const result = await database.load(contract, key);
        expect(result).toEqual(values);
      });

      it('overwrites existing values', async () => {
        const key = new Fr(1);
        const initialValues = [new Fr(42)];
        const newValues = [new Fr(100)];

        await database.store(contract, key, initialValues);
        await database.store(contract, key, newValues);

        const result = await database.load(contract, key);
        expect(result).toEqual(newValues);
      });

      it('stores values for different contracts independently', async () => {
        const anotherContract = AztecAddress.random();
        const key = new Fr(1);
        const values1 = [new Fr(42)];
        const values2 = [new Fr(100)];

        await database.store(contract, key, values1);
        await database.store(anotherContract, key, values2);

        const result1 = await database.load(contract, key);
        const result2 = await database.load(anotherContract, key);

        expect(result1).toEqual(values1);
        expect(result2).toEqual(values2);
      });

      it('returns null for non-existent keys', async () => {
        const key = Fr.random();
        const result = await database.load(contract, key);
        expect(result).toBeNull();
      });
    });
  });
}
