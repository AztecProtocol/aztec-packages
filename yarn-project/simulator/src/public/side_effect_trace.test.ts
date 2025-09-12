import {
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_PUBLIC_LOGS_PER_TX,
  PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PUBLIC_LOG_SIZE_IN_FIELDS,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { PublicDataUpdateRequest } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import { NoteHash, Nullifier } from '@aztec/stdlib/kernel';
import { PublicLog } from '@aztec/stdlib/logs';
import { L2ToL1Message } from '@aztec/stdlib/messaging';
import { makeContractClassPublic } from '@aztec/stdlib/testing';

import { randomInt } from 'crypto';

import { SideEffectLimitReachedError } from './side_effect_errors.js';
import { SideEffectArrayLengths, SideEffectTrace } from './side_effect_trace.js';

describe('Public Side Effect Trace', () => {
  const utxo = Fr.random();
  const slot = Fr.random();
  const value = Fr.random();
  const recipient = Fr.random();
  const content = Fr.random();
  const log = [Fr.random(), Fr.random(), Fr.random()];

  let startCounter: number;
  let startCounterPlus1: number;
  let trace: SideEffectTrace;
  let address: AztecAddress;

  beforeEach(async () => {
    address = await AztecAddress.random();
    startCounter = randomInt(/*max=*/ 1000000);
    startCounterPlus1 = startCounter + 1;
    trace = new SideEffectTrace(startCounter);
  });

  it('Should trace storage writes', async () => {
    expect(trace.isStorageCold(address, slot)).toBe(true);
    await trace.tracePublicStorageWrite(address, slot, value, false);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const leafSlot = await computePublicDataTreeLeafSlot(address, slot);
    const expected = [new PublicDataUpdateRequest(leafSlot, value, startCounter /*contractAddress*/)];
    expect(trace.getSideEffects().publicDataWrites).toEqual(expected);
    expect(trace.isStorageCold(address, slot)).toBe(false);
  });

  it('Should trace note hashes', () => {
    trace.traceNewNoteHash(utxo);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expected = [new NoteHash(utxo, startCounter)];
    expect(trace.getSideEffects().noteHashes).toEqual(expected);
  });

  it('Should trace nullifiers', () => {
    trace.traceNewNullifier(utxo);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expected = [new Nullifier(utxo, startCounter, Fr.ZERO)];
    expect(trace.getSideEffects().nullifiers).toEqual(expected);
  });

  it('Should trace new L2ToL1 messages', () => {
    trace.traceNewL2ToL1Message(address, recipient, content);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expected = [new L2ToL1Message(EthAddress.fromField(recipient), content).scope(address)];
    expect(trace.getSideEffects().l2ToL1Msgs).toEqual(expected);
  });

  it('Should trace new public logs', () => {
    trace.tracePublicLog(address, log);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expectedLog = new PublicLog(address, padArrayEnd(log, Fr.ZERO, PUBLIC_LOG_SIZE_IN_FIELDS), log.length);

    expect(trace.getSideEffects().publicLogs).toEqual([expectedLog]);
  });

  describe('Maximum accesses', () => {
    it('Should enforce maximum number of user public storage writes', async () => {
      for (let i = 0; i < MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX; i++) {
        await trace.tracePublicStorageWrite(address, slot.add(new Fr(i)), value, false);
      }
      // We should be able to write again to all the same slots, since we've already written to them.
      for (let i = 0; i < MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX; i++) {
        await trace.tracePublicStorageWrite(address, slot.add(new Fr(i)), value.add(new Fr(1)), false);
      }
      await expect(
        trace.tracePublicStorageWrite(AztecAddress.fromNumber(42), new Fr(42), value, false),
      ).rejects.toThrow(SideEffectLimitReachedError);
      // Still allows protocol writes
      await expect(
        trace.tracePublicStorageWrite(AztecAddress.fromNumber(42), new Fr(42), value, true),
      ).resolves.not.toThrow();
    });

    it('Should enforce maximum number of protocol public storage writes', async () => {
      for (let i = 0; i < PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX; i++) {
        await trace.tracePublicStorageWrite(address, slot, value, true);
      }
      await expect(trace.tracePublicStorageWrite(AztecAddress.fromNumber(42), new Fr(42), value, true)).rejects.toThrow(
        SideEffectLimitReachedError,
      );
      // Still allows user writes
      await expect(
        trace.tracePublicStorageWrite(AztecAddress.fromNumber(42), new Fr(42), value, false),
      ).resolves.not.toThrow();
    });

    it('Should enforce maximum number of new note hashes', () => {
      for (let i = 0; i < MAX_NOTE_HASHES_PER_TX; i++) {
        trace.traceNewNoteHash(new Fr(i));
      }
      expect(() => trace.traceNewNoteHash(new Fr(42))).toThrow(SideEffectLimitReachedError);
    });

    it('Should enforce maximum number of new nullifiers', () => {
      for (let i = 0; i < MAX_NULLIFIERS_PER_TX; i++) {
        trace.traceNewNullifier(new Fr(i));
      }
      expect(() => trace.traceNewNullifier(new Fr(42))).toThrow(SideEffectLimitReachedError);
    });

    it('Should enforce maximum number of new l2 to l1 messages', () => {
      for (let i = 0; i < MAX_L2_TO_L1_MSGS_PER_TX; i++) {
        trace.traceNewL2ToL1Message(AztecAddress.fromNumber(i), new Fr(i), new Fr(i));
      }
      expect(() => trace.traceNewL2ToL1Message(AztecAddress.fromNumber(42), new Fr(42), new Fr(42))).toThrow(
        SideEffectLimitReachedError,
      );
    });

    it('Should enforce maximum number of new logs', () => {
      for (let i = 0; i < MAX_PUBLIC_LOGS_PER_TX; i++) {
        trace.tracePublicLog(AztecAddress.fromNumber(i), [new Fr(i), new Fr(i)]);
      }
      expect(() => trace.tracePublicLog(AztecAddress.fromNumber(42), [new Fr(42), new Fr(42)])).toThrow(
        SideEffectLimitReachedError,
      );
    });

    it('Should enforce maximum number of unique contract class IDs', async () => {
      const firstClass = { ...(await makeContractClassPublic(0)), publicBytecodeCommitment: Fr.random() };
      trace.traceGetContractClass(firstClass.id, /*exists=*/ true);

      for (let i = 1; i < MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS; i++) {
        const klass = { ...(await makeContractClassPublic(i)), publicBytecodeCommitment: Fr.random() };
        trace.traceGetContractClass(klass.id, /*exists=*/ true);
      }

      const klass = {
        ...(await makeContractClassPublic(MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS)),
        publicBytecodeCommitment: Fr.random(),
      };
      expect(() => trace.traceGetContractClass(klass.id, /*exists=*/ true)).toThrow(SideEffectLimitReachedError);

      // can re-trace same first class
      trace.traceGetContractClass(firstClass.id, /*exists=*/ true);

      const differentClass = {
        ...(await makeContractClassPublic(MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS + 1)),
        publicBytecodeCommitment: Fr.random(),
      };
      const classWithSameId = {
        ...(await makeContractClassPublic(MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS + 3)),
        publicBytecodeCommitment: Fr.random(),
        id: firstClass.id,
      };
      // can re-trace different class if it has a duplicate class ID
      trace.traceGetContractClass(classWithSameId.id, /*exists=*/ true);

      // can trace a call to a non-existent class
      trace.traceGetContractClass(differentClass.id, /*exists=*/ false);
    });

    it('PreviousValidationRequestArrayLengths and PreviousAccumulatedDataArrayLengths contribute to limits', async () => {
      trace = new SideEffectTrace(
        0,
        new SideEffectArrayLengths(
          MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
          PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
          MAX_NOTE_HASHES_PER_TX,
          MAX_NULLIFIERS_PER_TX,
          MAX_L2_TO_L1_MSGS_PER_TX,
          MAX_PUBLIC_LOGS_PER_TX,
        ),
      );
      await expect(
        trace.tracePublicStorageWrite(AztecAddress.fromNumber(42), new Fr(42), new Fr(42), false),
      ).rejects.toThrow(SideEffectLimitReachedError);
      await expect(
        trace.tracePublicStorageWrite(AztecAddress.fromNumber(42), new Fr(42), new Fr(42), true),
      ).rejects.toThrow(SideEffectLimitReachedError);
      expect(() => trace.traceNewNoteHash(new Fr(42))).toThrow(SideEffectLimitReachedError);
      expect(() => trace.traceNewNullifier(new Fr(42))).toThrow(SideEffectLimitReachedError);
      expect(() => trace.traceNewL2ToL1Message(AztecAddress.fromNumber(42), new Fr(42), new Fr(42))).toThrow(
        SideEffectLimitReachedError,
      );
      expect(() => trace.tracePublicLog(AztecAddress.fromNumber(42), [new Fr(42), new Fr(42)])).toThrow(
        SideEffectLimitReachedError,
      );
    });
  });

  describe.each([false, true])('Should merge forked traces', reverted => {
    it(`${reverted ? 'Reverted' : 'Successful'} forked trace should be merged properly`, async () => {
      const nestedTrace = new SideEffectTrace(startCounter);
      let testCounter = startCounter;
      await nestedTrace.tracePublicStorageWrite(address, slot, value, false);
      testCounter++;
      nestedTrace.traceNewNoteHash(utxo);
      testCounter++;
      nestedTrace.traceNewNullifier(utxo);
      testCounter++;
      nestedTrace.traceNewL2ToL1Message(address, recipient, content);
      testCounter++;
      nestedTrace.tracePublicLog(address, log);
      testCounter++;

      trace.merge(nestedTrace, reverted);

      // parent trace adopts nested call's counter
      expect(trace.getCounter()).toBe(testCounter);

      // parent absorbs child's side effects
      const parentSideEffects = trace.getSideEffects();
      const childSideEffects = nestedTrace.getSideEffects();
      // TODO(dbanks12): confirm that all hints were merged from child
      if (reverted) {
        expect(parentSideEffects.publicDataWrites).toEqual([]);
        expect(parentSideEffects.noteHashes).toEqual([]);
        expect(parentSideEffects.nullifiers).toEqual([]);
        expect(parentSideEffects.l2ToL1Msgs).toEqual([]);
        expect(parentSideEffects.publicLogs).toEqual([]);
        // parent trace does not adopt nested call's writtenPublicDataSlots
        expect(trace.isStorageCold(address, slot)).toBe(true);
      } else {
        expect(parentSideEffects).toEqual(childSideEffects);
        // parent trace adopts nested call's writtenPublicDataSlots
        expect(trace.isStorageCold(address, slot)).toBe(false);
      }
    });
  });
});
