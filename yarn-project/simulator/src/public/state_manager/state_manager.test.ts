import { randomBigInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { SerializableContractInstance, computePublicBytecodeCommitment } from '@aztec/stdlib/contract';
import { computeNoteHashNonce, computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import { makeContractClassPublic } from '@aztec/stdlib/testing';

import { mock } from 'jest-mock-extended';

import { initPersistableStateManager } from '../avm/fixtures/initializers.js';
import {
  mockCheckNullifierExists,
  mockGetBytecodeCommitment,
  mockGetContractClass,
  mockGetContractInstance,
  mockL1ToL2MessageExists,
  mockNoteHashCount,
  mockNoteHashExists,
  mockStorageRead,
} from '../avm/test_utils.js';
import type { PublicContractsDB, PublicTreesDB } from '../public_db_sources.js';
import type { PublicSideEffectTraceInterface } from '../side_effect_trace_interface.js';
import type { PublicPersistableStateManager } from './state_manager.js';

describe('state_manager', () => {
  let address: AztecAddress;
  const utxo = Fr.random();
  const leafIndex = randomBigInt(2n << 64n);
  const firstNullifier = new Fr(4200);

  let treesDB: PublicTreesDB;
  let contractsDB: PublicContractsDB;
  let trace: PublicSideEffectTraceInterface;
  let persistableState: PublicPersistableStateManager;

  beforeEach(async () => {
    address = await AztecAddress.random();
    treesDB = mock<PublicTreesDB>();
    contractsDB = mock<PublicContractsDB>();
    trace = mock<PublicSideEffectTraceInterface>();
    persistableState = initPersistableStateManager({ treesDB, contractsDB, trace, firstNullifier });
  });

  describe('Public Storage', () => {
    it('When reading from storage, should check the cache first, and be appended to read/write journal', async () => {
      // Store a different value in storage vs the cache, and make sure the cache is returned
      const slot = new Fr(2);
      const storedValue = new Fr(420);
      const cachedValue = new Fr(69);

      mockStorageRead(treesDB, storedValue);

      // Get the cache first
      const cacheMissResult = await persistableState.readStorage(address, slot);
      expect(cacheMissResult).toEqual(storedValue);

      // Write to storage
      await persistableState.writeStorage(address, slot, cachedValue);

      // Get the storage value
      const cachedResult = await persistableState.readStorage(address, slot);
      expect(cachedResult).toEqual(cachedValue);
    });
  });

  describe('UTXOs & messages', () => {
    it('checkNoteHashExists works for missing note hashes', async () => {
      const exists = await persistableState.checkNoteHashExists(address, utxo, leafIndex);
      expect(exists).toEqual(false);
    });

    it('checkNoteHashExists works for existing note hashes', async () => {
      mockNoteHashExists(treesDB, leafIndex, utxo);
      const exists = await persistableState.checkNoteHashExists(address, utxo, leafIndex);
      expect(exists).toEqual(true);
    });

    it('writeNoteHash works', async () => {
      mockNoteHashCount(trace, 1);
      await persistableState.writeNoteHash(address, utxo);
      expect(trace.traceNewNoteHash).toHaveBeenCalledTimes(1);
      const siloedNotehash = await siloNoteHash(address, utxo);
      const noteNonce = await computeNoteHashNonce(firstNullifier, 1);
      const uniqueNoteHash = await computeUniqueNoteHash(noteNonce, siloedNotehash);
      expect(trace.traceNewNoteHash).toHaveBeenCalledWith(uniqueNoteHash);
    });

    it('checkNullifierExists works for missing nullifiers', async () => {
      mockCheckNullifierExists(treesDB, false, new Fr(leafIndex));
      const exists = await persistableState.checkNullifierExists(address, utxo);
      expect(exists).toEqual(false);
    });

    it('checkNullifierExists works for existing nullifiers', async () => {
      mockCheckNullifierExists(treesDB, true, new Fr(leafIndex));
      const exists = await persistableState.checkNullifierExists(address, utxo);
      expect(exists).toEqual(true);
    });

    it('writeNullifier works', async () => {
      await persistableState.writeNullifier(address, utxo);
      const siloedNullifier = await siloNullifier(address, utxo);
      expect(trace.traceNewNullifier).toHaveBeenCalledTimes(1);
      expect(trace.traceNewNullifier).toHaveBeenCalledWith(siloedNullifier);
    });

    it('checkL1ToL2MessageExists works for missing message', async () => {
      const exists = await persistableState.checkL1ToL2MessageExists(utxo, new Fr(leafIndex));
      expect(exists).toEqual(false);
    });

    it('checkL1ToL2MessageExists works for existing message', async () => {
      mockL1ToL2MessageExists(treesDB, new Fr(leafIndex), utxo);
      const exists = await persistableState.checkL1ToL2MessageExists(utxo, new Fr(leafIndex));
      expect(exists).toEqual(true);
    });

    it('Should maintain l1 messages', () => {
      const recipient = new Fr(1);
      persistableState.writeL2ToL1Message(address, recipient, utxo);
      expect(trace.traceNewL2ToL1Message).toHaveBeenCalledTimes(1);
      expect(trace.traceNewL2ToL1Message).toHaveBeenCalledWith(address, recipient, utxo);
    });
  });

  describe('Getting contract instances', () => {
    it('Should get contract instance', async () => {
      const contractInstance = SerializableContractInstance.default();
      const siloedNullifier = await siloNullifier(ProtocolContractAddress.ContractInstanceRegistry, address.toField());

      mockGetContractInstance(contractsDB, contractInstance.withAddress(address));
      mockCheckNullifierExists(treesDB, true, new Fr(leafIndex));

      await persistableState.getContractInstance(address);

      expect(contractsDB.getContractInstance).toHaveBeenCalledTimes(1);
      expect(contractsDB.getContractInstance).toHaveBeenCalledWith(address, /*timestamp=*/ expect.any(BigInt));
      expect(treesDB.checkNullifierExists).toHaveBeenCalledTimes(1);
      expect(treesDB.checkNullifierExists).toHaveBeenCalledWith(siloedNullifier);
    });

    it('Can get undefined contract instance', async () => {
      await persistableState.getContractInstance(address);
    });
  });

  describe('Getting bytecode', () => {
    it('Should get bytecode', async () => {
      const bytecode = Buffer.from('0xdeadbeef');
      const bytecodeCommitment = await computePublicBytecodeCommitment(bytecode);
      const contractInstance = SerializableContractInstance.default();
      const contractClass = await makeContractClassPublic();
      contractClass.packedBytecode = bytecode;

      mockCheckNullifierExists(treesDB, true, new Fr(leafIndex));
      mockGetContractInstance(contractsDB, contractInstance.withAddress(address));
      mockGetContractClass(contractsDB, contractClass);
      mockGetBytecodeCommitment(contractsDB, bytecodeCommitment);

      await persistableState.getBytecode(address);
      // From GetContractClass.
      expect(trace.traceGetContractClass).toHaveBeenCalledTimes(1);
      expect(trace.traceGetContractClass).toHaveBeenCalledWith(
        /*id=*/ contractInstance.currentContractClassId,
        /*exists=*/ true,
      );
    });
    it('Can get undefined bytecode', async () => {
      await persistableState.getBytecode(address);
    });
  });

  //it('Should merge two successful journals together', async () => {
  //  // Fundamentally checking that insert ordering of public storage is preserved upon journal merge
  //  // time | journal | op     | value
  //  // t0 -> journal0 -> write | 1
  //  // t1 -> journal1 -> write | 2
  //  // merge journals
  //  // t2 -> journal0 -> read  | 2

  //  const contractAddress = AztecAddress.fromNumber(1);
  //  const aztecContractAddress = AztecAddress.fromField(contractAddress);
  //  const key = new Fr(2);
  //  const value = new Fr(1);
  //  const valueT1 = new Fr(2);
  //  const recipient = EthAddress.fromField(new Fr(42));
  //  const commitment = new Fr(10);
  //  const commitmentT1 = new Fr(20);
  //  const log = { address: 10n, selector: 5, data: [new Fr(5), new Fr(6)] };
  //  const logT1 = { address: 20n, selector: 8, data: [new Fr(7), new Fr(8)] };
  //  const index = new Fr(42);
  //  const indexT1 = new Fr(24);
  //  const instance = emptyTracedContractInstance(aztecContractAddress);

  //  persistableState.writeStorage(contractAddress, key, value);
  //  await persistableState.readStorage(contractAddress, key);
  //  persistableState.writeNoteHash(contractAddress, commitment);
  //  persistableState.writeUnencryptedLog(new Fr(log.address), new Fr(log.selector), log.data);
  //  persistableState.writeL2ToL1Message(recipient, commitment);
  //  await persistableState.writeNullifier(contractAddress, commitment);
  //  await persistableState.checkNullifierExists(contractAddress, commitment);
  //  await persistableState.checkL1ToL2MessageExists(commitment, index);
  //  await persistableState.getContractInstance(aztecContractAddress);

  //  const childJournal = new AvmPersistableStateManager(persistableState.hostStorage, persistableState);
  //  childJournal.writeStorage(contractAddress, key, valueT1);
  //  await childJournal.readStorage(contractAddress, key);
  //  childJournal.writeNoteHash(contractAddress, commitmentT1);
  //  childJournal.writeUnencryptedLog(new Fr(logT1.address), new Fr(logT1.selector), logT1.data);
  //  childJournal.writeL2ToL1Message(recipient, commitmentT1);
  //  await childJournal.writeNullifier(contractAddress, commitmentT1);
  //  await childJournal.checkNullifierExists(contractAddress, commitmentT1);
  //  await childJournal.checkL1ToL2MessageExists(commitmentT1, indexT1);
  //  await childJournal.getContractInstance(aztecContractAddress);

  //  persistableState.acceptNestedCallState(childJournal);

  //  const result = await persistableState.readStorage(contractAddress, key);
  //  expect(result).toEqual(valueT1);

  //  // Check that the storage is merged by reading from the journal
  //  // Check that the UTXOs are merged
  //  const journalUpdates: JournalData = persistableState.getTrace()();

  //  // Check storage reads order is preserved upon merge
  //  // We first read value from t0, then value from t1
  //  expect(journalUpdates.storageReads).toEqual([
  //    expect.objectContaining({
  //      storageAddress: contractAddress,
  //      exists: true,
  //      slot: key,
  //      value: value,
  //    }),
  //    expect.objectContaining({
  //      storageAddress: contractAddress,
  //      exists: true,
  //      slot: key,
  //      value: valueT1,
  //    }),
  //    // Read a third time to check storage
  //    expect.objectContaining({
  //      storageAddress: contractAddress,
  //      exists: true,
  //      slot: key,
  //      value: valueT1,
  //    }),
  //  ]);

  //  // We first write value from t0, then value from t1
  //  expect(journalUpdates.storageWrites).toEqual([
  //    expect.objectContaining({
  //      storageAddress: contractAddress,
  //      slot: key,
  //      value: value,
  //    }),
  //    expect.objectContaining({
  //      storageAddress: contractAddress,
  //      slot: key,
  //      value: valueT1,
  //    }),
  //  ]);

  //  expect(journalUpdates.noteHashes).toEqual([
  //    expect.objectContaining({ noteHash: commitment, storageAddress: contractAddress }),
  //    expect.objectContaining({ noteHash: commitmentT1, storageAddress: contractAddress }),
  //  ]);
  //  expect(journalUpdates.newLogs).toEqual([
  //    new UnencryptedL2Log(
  //      AztecAddress.fromBigInt(log.address),
  //      new EventSelector(log.selector),
  //      Buffer.concat(log.data.map(f => f.toBuffer())),
  //    ),
  //    new UnencryptedL2Log(
  //      AztecAddress.fromBigInt(logT1.address),
  //      new EventSelector(logT1.selector),
  //      Buffer.concat(logT1.data.map(f => f.toBuffer())),
  //    ),
  //  ]);
  //  expect(journalUpdates.newL1Messages).toEqual([
  //    expect.objectContaining({ recipient, content: commitment }),
  //    expect.objectContaining({ recipient, content: commitmentT1 }),
  //  ]);
  //  expect(journalUpdates.nullifierChecks).toEqual([
  //    expect.objectContaining({ nullifier: commitment, exists: true }),
  //    expect.objectContaining({ nullifier: commitmentT1, exists: true }),
  //  ]);
  //  expect(journalUpdates.nullifiers).toEqual([
  //    expect.objectContaining({
  //      storageAddress: contractAddress,
  //      nullifier: commitment,
  //    }),
  //    expect.objectContaining({
  //      storageAddress: contractAddress,
  //      nullifier: commitmentT1,
  //    }),
  //  ]);
  //  expect(journalUpdates.l1ToL2MessageChecks).toEqual([
  //    expect.objectContaining({ leafIndex: index, msgHash: commitment, exists: false }),
  //    expect.objectContaining({ leafIndex: indexT1, msgHash: commitmentT1, exists: false }),
  //  ]);
  //  expect(persistableState.trace.gotContractInstances).toEqual([instance, instance]);
  //});

  //it('Should merge failed journals together', async () => {
  //  // Checking public storage update journals are preserved upon journal merge,
  //  // But the latest state is not

  //  // time | journal | op     | value
  //  // t0 -> journal0 -> write | 1
  //  // t1 -> journal1 -> write | 2
  //  // merge journals
  //  // t2 -> journal0 -> read  | 1

  //  const contractAddress = AztecAddress.fromNumber(1);
  //  const aztecContractAddress = AztecAddress.fromField(contractAddress);
  //  const key = new Fr(2);
  //  const value = new Fr(1);
  //  const valueT1 = new Fr(2);
  //  const recipient = EthAddress.fromField(new Fr(42));
  //  const commitment = new Fr(10);
  //  const commitmentT1 = new Fr(20);
  //  const log = { address: 10n, selector: 5, data: [new Fr(5), new Fr(6)] };
  //  const logT1 = { address: 20n, selector: 8, data: [new Fr(7), new Fr(8)] };
  //  const index = new Fr(42);
  //  const indexT1 = new Fr(24);
  //  const instance = emptyTracedContractInstance(aztecContractAddress);

  //  persistableState.writeStorage(contractAddress, key, value);
  //  await persistableState.readStorage(contractAddress, key);
  //  persistableState.writeNoteHash(contractAddress, commitment);
  //  await persistableState.writeNullifier(contractAddress, commitment);
  //  await persistableState.checkNullifierExists(contractAddress, commitment);
  //  await persistableState.checkL1ToL2MessageExists(commitment, index);
  //  persistableState.writeUnencryptedLog(new Fr(log.address), new Fr(log.selector), log.data);
  //  persistableState.writeL2ToL1Message(recipient, commitment);
  //  await persistableState.getContractInstance(aztecContractAddress);

  //  const childJournal = new AvmPersistableStateManager(persistableState.hostStorage, persistableState);
  //  childJournal.writeStorage(contractAddress, key, valueT1);
  //  await childJournal.readStorage(contractAddress, key);
  //  childJournal.writeNoteHash(contractAddress, commitmentT1);
  //  await childJournal.writeNullifier(contractAddress, commitmentT1);
  //  await childJournal.checkNullifierExists(contractAddress, commitmentT1);
  //  await persistableState.checkL1ToL2MessageExists(commitmentT1, indexT1);
  //  childJournal.writeUnencryptedLog(new Fr(logT1.address), new Fr(logT1.selector), logT1.data);
  //  childJournal.writeL2ToL1Message(recipient, commitmentT1);
  //  await childJournal.getContractInstance(aztecContractAddress);

  //  persistableState.rejectNestedCallState(childJournal);

  //  // Check that the storage is reverted by reading from the journal
  //  const result = await persistableState.readStorage(contractAddress, key);
  //  expect(result).toEqual(value); // rather than valueT1

  //  const journalUpdates: JournalData = persistableState.getTrace()();

  //  // Reads and writes should be preserved
  //  // Check storage reads order is preserved upon merge
  //  // We first read value from t0, then value from t1
  //  expect(journalUpdates.storageReads).toEqual([
  //    expect.objectContaining({
  //      storageAddress: contractAddress,
  //      exists: true,
  //      slot: key,
  //      value: value,
  //    }),
  //    expect.objectContaining({
  //      storageAddress: contractAddress,
  //      exists: true,
  //      slot: key,
  //      value: valueT1,
  //    }),
  //    // Read a third time to check storage
  //    expect.objectContaining({
  //      storageAddress: contractAddress,
  //      exists: true,
  //      slot: key,
  //      value: value,
  //    }),
  //  ]);

  //  // We first write value from t0, then value from t1
  //  expect(journalUpdates.storageWrites).toEqual([
  //    expect.objectContaining({
  //      storageAddress: contractAddress,
  //      slot: key,
  //      value: value,
  //    }),
  //    expect.objectContaining({
  //      storageAddress: contractAddress,
  //      slot: key,
  //      value: valueT1,
  //    }),
  //  ]);

  //  // Check that the world state _traces_ are merged even on rejection
  //  expect(journalUpdates.noteHashes).toEqual([
  //    expect.objectContaining({ noteHash: commitment, storageAddress: contractAddress }),
  //    expect.objectContaining({ noteHash: commitmentT1, storageAddress: contractAddress }),
  //  ]);
  //  expect(journalUpdates.nullifierChecks).toEqual([
  //    expect.objectContaining({ nullifier: commitment, exists: true }),
  //    expect.objectContaining({ nullifier: commitmentT1, exists: true }),
  //  ]);
  //  expect(journalUpdates.nullifiers).toEqual([
  //    expect.objectContaining({
  //      storageAddress: contractAddress,
  //      nullifier: commitment,
  //    }),
  //    expect.objectContaining({
  //      storageAddress: contractAddress,
  //      nullifier: commitmentT1,
  //    }),
  //  ]);
  //  expect(journalUpdates.l1ToL2MessageChecks).toEqual([
  //    expect.objectContaining({ leafIndex: index, msgHash: commitment, exists: false }),
  //    expect.objectContaining({ leafIndex: indexT1, msgHash: commitmentT1, exists: false }),
  //  ]);

  //  // Check that rejected Accrued Substate is absent
  //  expect(journalUpdates.newLogs).toEqual([
  //    new UnencryptedL2Log(
  //      AztecAddress.fromBigInt(log.address),
  //      new EventSelector(log.selector),
  //      Buffer.concat(log.data.map(f => f.toBuffer())),
  //    ),
  //  ]);
  //  expect(journalUpdates.newL1Messages).toEqual([expect.objectContaining({ recipient, content: commitment })]);
  //  expect(persistableState.trace.gotContractInstances).toEqual([instance, instance]);
  //});

  //it('Can fork and merge journals', () => {
  //  const rootJournal = new AvmPersistableStateManager(persistableState.hostStorage);
  //  const childJournal = rootJournal.fork();

  //  expect(() => rootJournal.acceptNestedCallState(childJournal));
  //  expect(() => rootJournal.rejectNestedCallState(childJournal));
  //});
});
