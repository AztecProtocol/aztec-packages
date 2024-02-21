import { Fr } from '@aztec/foundation/fields';

import { MockProxy, mock } from 'jest-mock-extended';

import { CommitmentsDB, NullifiersDB, PublicContractsDB, PublicStateDB } from '../../index.js';
import { HostAztecState } from './host_storage.js';
import { AvmWorldStateJournal } from './journal.js';
import { WorldStateAccessTrace } from './trace.js';
import { TracedNullifierCheck, TracedNullifier, TracedPublicStorageRead, TracedPublicStorageWrite } from './trace_types.js';

describe('journal', () => {
  let publicStorageDb: MockProxy<PublicStateDB>;
  let contractsDb = mock<PublicContractsDB>();
  let commitmentsDb = mock<CommitmentsDB>();
  let nullifiersDb = mock<NullifiersDB>();
  let hostStorage: HostAztecState;
  let journal: AvmWorldStateJournal;

  beforeEach(() => {
    publicStorageDb = mock<PublicStateDB>();
    contractsDb = mock<PublicContractsDB>();
    commitmentsDb = mock<CommitmentsDB>();
    nullifiersDb = mock<NullifiersDB>();

    hostStorage = new HostAztecState(publicStorageDb, contractsDb, commitmentsDb, nullifiersDb);
    journal = new AvmWorldStateJournal(hostStorage);
  });

  describe('Public Storage', () => {
    it('Should cache write to storage', async () => {
      // When writing to storage we should write to the storage writes map
      const callPointer = new Fr(42);
      const storageAddress = new Fr(1);
      const slot = new Fr(2);
      const value = new Fr(3);

      journal.writePublicStorage(callPointer, storageAddress, slot, value);
      const gotValue = await journal.readPublicStorage(Fr.ZERO, storageAddress, slot);
      expect(gotValue).toEqual(value);
    });

    it('When reading from storage, should check current cache, then parent, then host', async () => {
      // Store a different value in storage vs the cache, and make sure the cache is returned
      const parentCallPointer = new Fr(42);
      const childCallPointer = new Fr(42);
      const storageAddress = new Fr(1);
      const slot = new Fr(2);
      const storedValue = new Fr(420);
      const parentValue = new Fr(69);
      const cachedValue = new Fr(1337);

      publicStorageDb.storageRead.mockResolvedValue(Promise.resolve(storedValue));

      const childJournal = new AvmWorldStateJournal(hostStorage, journal);

      // Cache miss should get value from host state
      const cacheMissResult = await childJournal.readPublicStorage(childCallPointer, storageAddress, slot);
      expect(cacheMissResult).toEqual(storedValue);

      // Write to parent storage
      journal.writePublicStorage(parentCallPointer, storageAddress, slot, parentValue);
      // Read from child (should get value written in parent cache)
      const parentResult = await childJournal.readPublicStorage(childCallPointer, storageAddress, slot);
      expect(parentResult).toEqual(parentValue);

      // Write to child storage
      childJournal.writePublicStorage(childCallPointer, storageAddress, slot, cachedValue);

      // Value in child cache should take precedence over parent
      const cachedResult = await childJournal.readPublicStorage(childCallPointer, storageAddress, slot);
      expect(cachedResult).toEqual(cachedValue);
    });

    it('Public storage reads and writes should be traced', async () => {
      // Store a different value in storage vs the cache, and make sure the cache is returned
      const callPointer = new Fr(42);
      const storageAddress = new Fr(1);
      const slot = new Fr(2);
      const storedValue = new Fr(420);
      const cachedValue = new Fr(69);

      publicStorageDb.storageRead.mockResolvedValue(Promise.resolve(storedValue));

      // Cache miss should get value from host state
      const cacheMissResult = await journal.readPublicStorage(callPointer, storageAddress, slot);
      expect(cacheMissResult).toEqual(storedValue);
      const expectTracedRead0: TracedPublicStorageRead = {
        callPointer,
        storageAddress,
        exists: true, // exists in host state
        slot,
        value: storedValue,
        counter: Fr.ZERO,
        endLifetime: Fr.ZERO,
      };

      // Write to storage
      journal.writePublicStorage(callPointer, storageAddress, slot, cachedValue);
      const expectTracedWrite0: TracedPublicStorageWrite = {
        callPointer,
        storageAddress,
        slot,
        value: cachedValue,
        counter: new Fr(1),
        endLifetime: Fr.ZERO,
      };

      // Get the storage value
      const cachedResult = await journal.readPublicStorage(callPointer, storageAddress, slot);
      expect(cachedResult).toEqual(cachedValue);
      const expectTracedRead1: TracedPublicStorageRead = {
        callPointer,
        storageAddress,
        exists: true, // exists in host state
        slot,
        value: cachedResult,
        counter: new Fr(2),
        endLifetime: Fr.ZERO,
      };

      // We expect the journal to store the access in [storedVal, cachedVal] - [time0, time1]
      const { publicStorageReads, publicStorageWrites }: WorldStateAccessTrace = journal.getWorldStateAccessTrace();
      expect(publicStorageReads.length).toEqual(2);
      expect(publicStorageWrites.length).toEqual(1);
      expect(publicStorageReads[0]).toEqual(expectTracedRead0)
      expect(publicStorageReads[1]).toEqual(expectTracedRead1)
      expect(publicStorageWrites[0]).toEqual(expectTracedWrite0)
    });
  });

  describe('UTXOs', () => {
    //it('Should maintain noteHashes', () => {
    //  const utxo = new Fr(1);
    //  journal.newNoteHash(utxo);

    //  const journalUpdates = journal.getWorldStateAccessTrace();
    //  expect(journalUpdates.newNoteHashes).toEqual([utxo]);
    //});

    //it('Should maintain l1 messages', () => {
    //  const utxo = [new Fr(1)];
    //  journal.writeL1Message(utxo);

    //  const journalUpdates = journal.getWorldStateAccessTrace();
    //  expect(journalUpdates.newL1Messages).toEqual([utxo]);
    //});

    it('Should maintain nullifiers', () => {
      const callPointer = new Fr(42);
      const storageAddress = new Fr(1);
      const nullifier = new Fr(1);
      journal.appendNullifier(callPointer, storageAddress, nullifier);
      const expectTracedNullifier: TracedNullifier = {
        callPointer,
        storageAddress,
        nullifier,
        counter: Fr.ZERO,
        endLifetime: Fr.ZERO,
      };

      const { newNullifiers } = journal.getWorldStateAccessTrace();
      expect(newNullifiers).toEqual([expectTracedNullifier]);
    });
    it('Can check existence of nullifier that exists only in host aztec state (not pending)', async () => {
      const callPointer = new Fr(42);
      const storageAddress = new Fr(1);
      const nullifier = new Fr(1);
      const leafIndex = BigInt(69);

      nullifiersDb.getNullifierIndex.mockResolvedValue(Promise.resolve(leafIndex));
      const exists = await journal.checkNullifierExists(callPointer, storageAddress, nullifier);
      expect(exists).toEqual(true);
    });
    it('Can check existence of pending nullifier', async () => {
      const callPointer = new Fr(42);
      const storageAddress = new Fr(1);
      const nullifier = new Fr(1);
      journal.appendNullifier(callPointer, storageAddress, nullifier);
      const exists = await journal.checkNullifierExists(callPointer, storageAddress, nullifier);
      expect(exists).toEqual(true);
    });
    it('Can check existence of pending nullifier created in parent', async () => {
      const parentCallPointer = new Fr(42);
      const childCallPointer = new Fr(42);
      const storageAddress = new Fr(1);
      const nullifier = new Fr(1);
      const childJournal = new AvmWorldStateJournal(hostStorage, journal);
      journal.appendNullifier(parentCallPointer, storageAddress, nullifier);
      const exists = await childJournal.checkNullifierExists(childCallPointer, storageAddress, nullifier);
      expect(exists).toEqual(true);
    });
    it('Nullifiers found in current cache are traced properly as pending', async () => {
      const callPointer = new Fr(42);
      const storageAddress = new Fr(1);
      const nullifier = new Fr(1);

      journal.appendNullifier(callPointer, storageAddress, nullifier);
      const expectTracedNullifier: TracedNullifier = {
        callPointer,
        storageAddress,
        nullifier,
        counter: Fr.ZERO,
        endLifetime: Fr.ZERO,
      };

      const exists = await journal.checkNullifierExists(callPointer, storageAddress, nullifier);
      expect(exists).toEqual(true);
      const expectTracedNullifierCheck: TracedNullifierCheck = {
        callPointer,
        storageAddress,
        nullifier,
        exists: true,
        counter: new Fr(1),
        endLifetime: Fr.ZERO,
        isPending: true,
        leafIndex: Fr.ZERO, // pending, so leaf index is 0 (none)
      };

      const { nullifierChecks, newNullifiers } = journal.getWorldStateAccessTrace();
      expect(newNullifiers).toEqual([expectTracedNullifier]);
      expect(nullifierChecks).toEqual([expectTracedNullifierCheck]);
    });
    it('Nullifiers found in parent cache are traced properly as pending', async () => {
      const parentCallPointer = new Fr(42);
      const childCallPointer = new Fr(42);
      const storageAddress = new Fr(1);
      const nullifier = new Fr(1);
      const childJournal = new AvmWorldStateJournal(hostStorage, journal);

      journal.appendNullifier(parentCallPointer, storageAddress, nullifier);
      const expectTracedNullifier: TracedNullifier = {
        callPointer: parentCallPointer,
        storageAddress,
        nullifier,
        counter: Fr.ZERO,
        endLifetime: Fr.ZERO,
      };

      const exists = await childJournal.checkNullifierExists(childCallPointer, storageAddress, nullifier);
      expect(exists).toEqual(true);
      const expectTracedNullifierCheck: TracedNullifierCheck = {
        callPointer: childCallPointer,
        storageAddress,
        nullifier,
        exists: true,
        counter: new Fr(1),
        endLifetime: Fr.ZERO,
        isPending: true,
        leafIndex: Fr.ZERO, // pending, so leaf index is 0 (none)
      };

      const { nullifierChecks, newNullifiers } = journal.getWorldStateAccessTrace();
      expect(newNullifiers).toEqual([expectTracedNullifier]);
      expect(nullifierChecks).toEqual([expectTracedNullifierCheck]);
    });
    it('Nullifiers found in host state are traced properly as NOT pending', async () => {
      const callPointer = new Fr(42);
      const storageAddress = new Fr(1);
      const nullifier = new Fr(1);
      const leafIndex = BigInt(69);

      nullifiersDb.getNullifierIndex.mockResolvedValue(Promise.resolve(leafIndex));

      const exists = await journal.checkNullifierExists(callPointer, storageAddress, nullifier);
      expect(exists).toEqual(true);
      const expectTracedNullifier: TracedNullifierCheck = {
        callPointer,
        storageAddress,
        nullifier,
        exists: true,
        counter: Fr.ZERO,
        endLifetime: Fr.ZERO,
        isPending: false,
        leafIndex: new Fr(leafIndex),
      };
      expect(journal.getWorldStateAccessTrace().nullifierChecks).toEqual([expectTracedNullifier]);
    });
  });

  it('Should merge two successful journals together', async () => {
    // Fundamentally checking that insert ordering of public storage is preserved upon journal merge
    // time | journal | op     | value
    // t0 -> journal0 -> write | 1
    // t1 -> journal1 -> write | 2
    // merge journals
    // t2 -> journal0 -> read  | 2

    let counter = 0;
    const parentCallPointer = new Fr(1);
    const childCallPointer = new Fr(2);
    const storageAddress = new Fr(1);
    const slot = new Fr(2);
    const value = new Fr(1);
    const valueT1 = new Fr(2);
    const commitment = new Fr(10);
    const commitmentT1 = new Fr(20);
    //const logs = [new Fr(1), new Fr(2)];
    //const logsT1 = [new Fr(3), new Fr(4)];

    // Do some stuff in parent
    journal.writePublicStorage(parentCallPointer, storageAddress, slot, value);
    const expectTracedWrite0: TracedPublicStorageWrite = {
      callPointer: parentCallPointer,
      storageAddress,
      slot,
      value: value,
      counter: new Fr(counter++),
      endLifetime: Fr.ZERO,
    };
    await journal.readPublicStorage(parentCallPointer, storageAddress, slot);
    const expectTracedRead0: TracedPublicStorageRead = {
      callPointer: parentCallPointer,
      storageAddress,
      exists: true, // exists in host state
      slot,
      value: value,
      counter: new Fr(counter++),
      endLifetime: Fr.ZERO,
    };
    //journal.newNoteHash(commitment);
    //journal.writeLog(logs);
    //journal.writeL1Message(logs);
    journal.appendNullifier(parentCallPointer, storageAddress, commitment);
    const expectTracedNullifier0: TracedNullifier = {
      callPointer: parentCallPointer,
      storageAddress,
      nullifier: commitment,
      counter: new Fr(counter++),
      endLifetime: Fr.ZERO,
    };
    await journal.checkNullifierExists(parentCallPointer, storageAddress, commitment);
    const expectTracedNullifierCheck0: TracedNullifierCheck = {
      callPointer: parentCallPointer,
      storageAddress,
      nullifier: commitment,
      exists: true,
      counter: new Fr(counter++),
      endLifetime: Fr.ZERO,
      isPending: true,
      leafIndex: Fr.ZERO, // pending, so leaf index is 0 (none)
    };

    // Do some stuff in child
    const childJournal = new AvmWorldStateJournal(hostStorage, journal);

    childJournal.writePublicStorage(childCallPointer, storageAddress, slot, valueT1);
    const expectTracedWrite1: TracedPublicStorageWrite = {
      callPointer: childCallPointer,
      storageAddress,
      slot,
      value: valueT1,
      counter: new Fr(counter++),
      endLifetime: Fr.ZERO,
    };
    await childJournal.readPublicStorage(childCallPointer, storageAddress, slot);
    const expectTracedRead1: TracedPublicStorageRead = {
      callPointer: childCallPointer,
      storageAddress,
      exists: true, // exists in host state
      slot,
      value: valueT1,
      counter: new Fr(counter++),
      endLifetime: Fr.ZERO,
    };
    //childJournal.newNoteHash(commitmentT1);
    childJournal.appendNullifier(childCallPointer, storageAddress, commitmentT1);
    const expectTracedNullifier1: TracedNullifier = {
      callPointer: childCallPointer,
      storageAddress,
      nullifier: commitmentT1,
      counter: new Fr(counter++),
      endLifetime: Fr.ZERO,
    };
    await childJournal.checkNullifierExists(childCallPointer, storageAddress, commitmentT1);
    const expectTracedNullifierCheck1: TracedNullifierCheck = {
      callPointer: childCallPointer,
      storageAddress,
      nullifier: commitmentT1,
      exists: true,
      counter: new Fr(counter++),
      endLifetime: Fr.ZERO,
      isPending: true,
      leafIndex: Fr.ZERO, // pending, so leaf index is 0 (none)
    };
    //childJournal.writeLog(logsT1);
    //childJournal.writeL1Message(logsT1);

    // MERGE
    journal.acceptNestedCallState(childJournal);

    // Do some reads after merge
    const result = await journal.readPublicStorage(parentCallPointer, storageAddress, slot);
    expect(result).toEqual(valueT1);
    const expectTracedRead2: TracedPublicStorageRead = {
      callPointer: parentCallPointer,
      storageAddress,
      exists: true, // exists in host state
      slot,
      value: valueT1,
      counter: new Fr(counter++),
      endLifetime: Fr.ZERO,
    };
    await journal.checkNullifierExists(parentCallPointer, storageAddress, commitmentT1);
    const expectTracedNullifierCheck2: TracedNullifierCheck = {
      callPointer: parentCallPointer,
      storageAddress,
      nullifier: commitmentT1,
      exists: true,
      counter: new Fr(counter++),
      endLifetime: Fr.ZERO,
      isPending: true,
      leafIndex: Fr.ZERO, // pending, so leaf index is 0 (none)
    };

    // Ensure trace order and contents are preserved after merge
    const trace: WorldStateAccessTrace = journal.getWorldStateAccessTrace();

    expect(trace.publicStorageReads).toEqual([
      expectTracedRead0,
      expectTracedRead1,
      expectTracedRead2,
    ]);
    expect(trace.publicStorageWrites).toEqual([
      expectTracedWrite0,
      expectTracedWrite1,
    ]);
    //expect(trace.noteHashChecks).toEqual([commitment, commitmentT1]);
    //expect(trace.newNoteHashes).toEqual([commitment, commitmentT1]);
    expect(trace.nullifierChecks).toEqual([
      expectTracedNullifierCheck0,
      expectTracedNullifierCheck1,
      expectTracedNullifierCheck2,
    ]);
    expect(trace.newNullifiers).toEqual([
      expectTracedNullifier0,
      expectTracedNullifier1,
    ]);
    //expect(trace.newLogs).toEqual([logs, logsT1]);
    //expect(trace.newL1Messages).toEqual([logs, logsT1]);
  });

  //it('Should merge failed journals together', async () => {
  //  // Checking public storage update journals are preserved upon journal merge,
  //  // But the latest state is not

  //  // time | journal | op     | value
  //  // t0 -> journal0 -> write | 1
  //  // t1 -> journal1 -> write | 2
  //  // merge journals
  //  // t2 -> journal0 -> read  | 1

  //  const contractAddress = new Fr(1);
  //  const key = new Fr(2);
  //  const value = new Fr(1);
  //  const valueT1 = new Fr(2);
  //  const commitment = new Fr(10);
  //  const commitmentT1 = new Fr(20);
  //  const logs = [new Fr(1), new Fr(2)];
  //  const logsT1 = [new Fr(3), new Fr(4)];

  //  journal.writePublicStorage(contractAddress, key, value);
  //  await journal.readPublicStorage(contractAddress, key);
  //  journal.newNoteHash(commitment);
  //  journal.writeLog(logs);
  //  journal.writeL1Message(logs);
  //  journal.writeNullifier(commitment);

  //  const childJournal = new AvmPersistableState(journal.hostStorage, journal);
  //  childJournal.writePublicStorage(contractAddress, key, valueT1);
  //  await childJournal.readPublicStorage(contractAddress, key);
  //  childJournal.newNoteHash(commitmentT1);
  //  childJournal.writeLog(logsT1);
  //  childJournal.writeL1Message(logsT1);
  //  childJournal.writeNullifier(commitmentT1);

  //  journal.rejectNestedCallState(childJournal);

  //  // Check that the storage is reverted by reading from the journal
  //  const result = await journal.readPublicStorage(contractAddress, key);
  //  expect(result).toEqual(value); // rather than valueT1

  //  // Check that the UTXOs are merged
  //  const journalUpdates: WorldStateAccessTrace = journal.getWorldStateAccessTrace();

  //  // Reads and writes should be preserved
  //  // Check storage reads order is preserved upon merge
  //  // We first read value from t0, then value from t1
  //  const contractReads = journalUpdates.storageReads.get(contractAddress.toBigInt());
  //  const slotReads = contractReads?.get(key.toBigInt());
  //  expect(slotReads).toEqual([value, valueT1, value]); // Read a third time to check storage above

  //  // We first write value from t0, then value from t1
  //  const contractWrites = journalUpdates.storageWrites.get(contractAddress.toBigInt());
  //  const slotWrites = contractWrites?.get(key.toBigInt());
  //  expect(slotWrites).toEqual([value, valueT1]);

  //  expect(journalUpdates.newNoteHashes).toEqual([commitment]);
  //  expect(journalUpdates.newLogs).toEqual([logs]);
  //  expect(journalUpdates.newL1Messages).toEqual([logs]);
  //  expect(journalUpdates.newNullifiers).toEqual([commitment]);
  //});

  //it('Can fork and merge journals', () => {
  //  const rootJournal = new AvmPersistableState(journal.hostStorage);
  //  const childJournal = rootJournal.fork();

  //  expect(() => rootJournal.acceptNestedCallState(childJournal));
  //  expect(() => rootJournal.rejectNestedCallState(childJournal));
  //});
});
