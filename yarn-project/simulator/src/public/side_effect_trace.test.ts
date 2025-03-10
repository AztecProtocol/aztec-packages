import {
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_PUBLIC_LOGS_PER_TX,
  PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PUBLIC_LOG_DATA_SIZE_IN_FIELDS,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import {
  AvmAppendTreeHint,
  AvmContractInstanceHint,
  AvmNullifierReadTreeHint,
  AvmNullifierWriteTreeHint,
  AvmPublicDataReadTreeHint,
  AvmPublicDataWriteTreeHint,
  PublicDataUpdateRequest,
} from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { SerializableContractInstance } from '@aztec/stdlib/contract';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import { NoteHash, Nullifier } from '@aztec/stdlib/kernel';
import { PublicLog } from '@aztec/stdlib/logs';
import { L2ToL1Message } from '@aztec/stdlib/messaging';
import { makeContractClassPublic } from '@aztec/stdlib/testing';
import { NullifierLeafPreimage, PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';

import { randomInt } from 'crypto';

import { SideEffectLimitReachedError } from './side_effect_errors.js';
import { SideEffectArrayLengths, SideEffectTrace } from './side_effect_trace.js';

describe('Public Side Effect Trace', () => {
  const utxo = Fr.random();
  const leafIndex = Fr.random();
  const lowLeafIndex = Fr.random();
  const slot = Fr.random();
  const value = Fr.random();
  const recipient = Fr.random();
  const content = Fr.random();
  const log = [Fr.random(), Fr.random(), Fr.random()];
  const contractInstance = SerializableContractInstance.default();
  const siblingPath = [Fr.random(), Fr.random(), Fr.random(), Fr.random()];
  const lowLeafSiblingPath = [Fr.random(), Fr.random(), Fr.random()];

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

  it('Should trace storage reads', () => {
    const leafPreimage = new PublicDataTreeLeafPreimage(slot, value, Fr.ZERO, 0n);
    trace.tracePublicStorageRead(address, slot, value, leafPreimage, leafIndex, siblingPath);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expected = new AvmPublicDataReadTreeHint(leafPreimage, leafIndex, siblingPath);
    expect(trace.getAvmCircuitHints().publicDataReads).toEqual([expected]);
  });

  it('Should trace storage writes', async () => {
    const lowLeafPreimage = new PublicDataTreeLeafPreimage(slot, value, Fr.ZERO, 0n);
    const newLeafPreimage = new PublicDataTreeLeafPreimage(slot, value, Fr.ZERO, 0n);

    await trace.tracePublicStorageWrite(
      address,
      slot,
      value,
      false,
      lowLeafPreimage,
      lowLeafIndex,
      lowLeafSiblingPath,
      newLeafPreimage,
      siblingPath,
    );
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const leafSlot = await computePublicDataTreeLeafSlot(address, slot);
    const expected = [new PublicDataUpdateRequest(leafSlot, value, startCounter /*contractAddress*/)];
    expect(trace.getSideEffects().publicDataWrites).toEqual(expected);

    const readHint = new AvmPublicDataReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafSiblingPath);
    const expectedHint = new AvmPublicDataWriteTreeHint(readHint, newLeafPreimage, siblingPath);
    expect(trace.getAvmCircuitHints().publicDataWrites).toEqual([expectedHint]);
  });

  it('Should trace note hash checks', () => {
    const exists = true;
    trace.traceNoteHashCheck(address, utxo, leafIndex, exists, siblingPath);
    const expected = new AvmAppendTreeHint(leafIndex, utxo, siblingPath);
    expect(trace.getAvmCircuitHints().noteHashReads).toEqual([expected]);
  });

  it('Should trace note hashes', () => {
    trace.traceNewNoteHash(utxo, leafIndex, siblingPath);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expected = [new NoteHash(utxo, startCounter)];
    expect(trace.getSideEffects().noteHashes).toEqual(expected);

    const expectedHint = new AvmAppendTreeHint(leafIndex, utxo, siblingPath);
    expect(trace.getAvmCircuitHints().noteHashWrites).toEqual([expectedHint]);
  });

  it('Should trace nullifier checks', () => {
    const exists = true;
    const lowLeafPreimage = new NullifierLeafPreimage(utxo, Fr.ZERO, 0n);
    trace.traceNullifierCheck(utxo, exists, lowLeafPreimage, leafIndex, siblingPath);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expected = new AvmNullifierReadTreeHint(lowLeafPreimage, leafIndex, siblingPath);
    expect(trace.getAvmCircuitHints().nullifierReads).toEqual([expected]);
  });

  it('Should trace nullifiers', () => {
    const lowLeafPreimage = new NullifierLeafPreimage(utxo, Fr.ZERO, 0n);
    trace.traceNewNullifier(utxo, lowLeafPreimage, lowLeafIndex, lowLeafSiblingPath, siblingPath);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expected = [new Nullifier(utxo, startCounter, Fr.ZERO)];
    expect(trace.getSideEffects().nullifiers).toEqual(expected);

    const readHint = new AvmNullifierReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafSiblingPath);
    const expectedHint = new AvmNullifierWriteTreeHint(readHint, siblingPath);
    expect(trace.getAvmCircuitHints().nullifierWrites).toEqual([expectedHint]);
  });

  it('Should trace L1ToL2 Message checks', () => {
    const exists = true;
    trace.traceL1ToL2MessageCheck(address, utxo, leafIndex, exists, siblingPath);
    const expected = new AvmAppendTreeHint(leafIndex, utxo, siblingPath);
    expect(trace.getAvmCircuitHints().l1ToL2MessageReads).toEqual([expected]);
  });

  it('Should trace new L2ToL1 messages', () => {
    trace.traceNewL2ToL1Message(address, recipient, content);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expected = [new L2ToL1Message(EthAddress.fromField(recipient), content, startCounter).scope(address)];
    expect(trace.getSideEffects().l2ToL1Msgs).toEqual(expected);
  });

  it('Should trace new public logs', () => {
    trace.tracePublicLog(address, log);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expectedLog = new PublicLog(address, padArrayEnd(log, Fr.ZERO, PUBLIC_LOG_DATA_SIZE_IN_FIELDS));

    expect(trace.getPublicLogs()).toEqual([expectedLog]);
    expect(trace.getSideEffects().publicLogs).toEqual([expectedLog]);
  });

  it('Should trace get contract instance', async () => {
    const instance = await SerializableContractInstance.random();
    const updateSlot = Fr.random();
    const updateMembershipHint = new AvmPublicDataReadTreeHint(
      new PublicDataTreeLeafPreimage(updateSlot, Fr.ZERO, Fr.ZERO, updateSlot.add(new Fr(10n)).toBigInt()),
      new Fr(1),
      [],
    );
    const updatePreimage = [new Fr(1), new Fr(2), new Fr(3), new Fr(4)];
    const exists = true;
    trace.traceGetContractInstance(address, exists, instance, updateMembershipHint, updatePreimage);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    expect(trace.getAvmCircuitHints().contractInstances).toEqual([
      new AvmContractInstanceHint(
        address,
        exists,
        instance.salt,
        instance.deployer,
        instance.currentContractClassId,
        instance.originalContractClassId,
        instance.initializationHash,
        instance.publicKeys,
        updateMembershipHint,
        updatePreimage,
      ),
    ]);
  });

  it('Should trace get contract class', async () => {
    const klass = { ...(await makeContractClassPublic()), publicBytecodeCommitment: Fr.random() };
    trace.traceGetContractClass(/*id=*/ new Fr(44), /*exists=*/ true, klass);

    expect(Array.from(trace.getAvmCircuitHints().contractClasses)).toEqual([
      {
        classId: new Fr(44),
        exists: true,
        artifactHash: klass.artifactHash,
        privateFunctionsRoot: klass.privateFunctionsRoot,
        publicBytecodeCommitment: klass.publicBytecodeCommitment,
        packedBytecode: klass.packedBytecode,
      },
    ]);
  });

  describe('Maximum accesses', () => {
    it('Should enforce maximum number of user public storage writes', async () => {
      for (let i = 0; i < MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX; i++) {
        const lowLeafPreimage = new PublicDataTreeLeafPreimage(new Fr(i), new Fr(i), Fr.ZERO, 0n);
        const newLeafPreimage = new PublicDataTreeLeafPreimage(new Fr(i + 1), new Fr(i + 1), Fr.ZERO, 0n);
        await trace.tracePublicStorageWrite(
          address,
          slot,
          value,
          false,
          lowLeafPreimage,
          Fr.ZERO,
          [],
          newLeafPreimage,
          [],
        );
      }
      const leafPreimage = new PublicDataTreeLeafPreimage(new Fr(42), new Fr(42), Fr.ZERO, 0n);
      await expect(
        trace.tracePublicStorageWrite(
          AztecAddress.fromNumber(42),
          new Fr(42),
          value,
          false,
          leafPreimage,
          Fr.ZERO,
          [],
          leafPreimage,
          [],
        ),
      ).rejects.toThrow(SideEffectLimitReachedError);
      // Still allows protocol writes
      await expect(
        trace.tracePublicStorageWrite(
          AztecAddress.fromNumber(42),
          new Fr(42),
          value,
          true,
          leafPreimage,
          Fr.ZERO,
          [],
          leafPreimage,
          [],
        ),
      ).resolves.not.toThrow();
    });

    it('Should enforce maximum number of protocol public storage writes', async () => {
      for (let i = 0; i < PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX; i++) {
        const lowLeafPreimage = new PublicDataTreeLeafPreimage(new Fr(i), new Fr(i), Fr.ZERO, 0n);
        const newLeafPreimage = new PublicDataTreeLeafPreimage(new Fr(i + 1), new Fr(i + 1), Fr.ZERO, 0n);
        await trace.tracePublicStorageWrite(
          address,
          slot,
          value,
          true,
          lowLeafPreimage,
          Fr.ZERO,
          [],
          newLeafPreimage,
          [],
        );
      }
      const leafPreimage = new PublicDataTreeLeafPreimage(new Fr(42), new Fr(42), Fr.ZERO, 0n);
      await expect(
        trace.tracePublicStorageWrite(
          AztecAddress.fromNumber(42),
          new Fr(42),
          value,
          true,
          leafPreimage,
          Fr.ZERO,
          [],
          leafPreimage,
          [],
        ),
      ).rejects.toThrow(SideEffectLimitReachedError);
      // Still allows user writes
      await expect(
        trace.tracePublicStorageWrite(
          AztecAddress.fromNumber(42),
          new Fr(42),
          value,
          false,
          leafPreimage,
          Fr.ZERO,
          [],
          leafPreimage,
          [],
        ),
      ).resolves.not.toThrow();
    });

    it('Should enforce maximum number of new note hashes', () => {
      for (let i = 0; i < MAX_NOTE_HASHES_PER_TX; i++) {
        trace.traceNewNoteHash(new Fr(i), Fr.ZERO, []);
      }
      expect(() => trace.traceNewNoteHash(new Fr(42), Fr.ZERO, [])).toThrow(SideEffectLimitReachedError);
    });

    it('Should enforce maximum number of new nullifiers', () => {
      for (let i = 0; i < MAX_NULLIFIERS_PER_TX; i++) {
        const lowLeafPreimage = new NullifierLeafPreimage(new Fr(i + 1), Fr.ZERO, 0n);
        trace.traceNewNullifier(new Fr(i), lowLeafPreimage, Fr.ZERO, [], []);
      }
      const lowLeafPreimage = new NullifierLeafPreimage(new Fr(41), Fr.ZERO, 0n);
      expect(() => trace.traceNewNullifier(new Fr(42), lowLeafPreimage, Fr.ZERO, [], [])).toThrow(
        SideEffectLimitReachedError,
      );
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
      trace.traceGetContractClass(firstClass.id, /*exists=*/ true, firstClass);

      for (let i = 1; i < MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS; i++) {
        const klass = { ...(await makeContractClassPublic(i)), publicBytecodeCommitment: Fr.random() };
        trace.traceGetContractClass(klass.id, /*exists=*/ true, klass);
      }

      const klass = {
        ...(await makeContractClassPublic(MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS)),
        publicBytecodeCommitment: Fr.random(),
      };
      expect(() => trace.traceGetContractClass(klass.id, /*exists=*/ true, klass)).toThrow(SideEffectLimitReachedError);

      // can re-trace same first class
      trace.traceGetContractClass(firstClass.id, /*exists=*/ true, firstClass);

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
      trace.traceGetContractClass(classWithSameId.id, /*exists=*/ true, classWithSameId);

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
      expect(() => trace.traceNewNoteHash(new Fr(42), new Fr(42))).toThrow(SideEffectLimitReachedError);
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
      const existsDefault = true;

      const nestedTrace = new SideEffectTrace(startCounter);
      let testCounter = startCounter;
      const leafPreimage = new PublicDataTreeLeafPreimage(slot, value, Fr.ZERO, 0n);
      const lowLeafPreimage = new NullifierLeafPreimage(utxo, Fr.ZERO, 0n);
      nestedTrace.tracePublicStorageRead(address, slot, value, leafPreimage, Fr.ZERO, []);
      testCounter++;
      await nestedTrace.tracePublicStorageWrite(
        address,
        slot,
        value,
        false,
        leafPreimage,
        Fr.ZERO,
        [],
        leafPreimage,
        [],
      );
      testCounter++;
      nestedTrace.traceNoteHashCheck(address, utxo, leafIndex, existsDefault, []);
      // counter does not increment for note hash checks
      nestedTrace.traceNewNoteHash(utxo, Fr.ZERO, []);
      testCounter++;
      nestedTrace.traceNullifierCheck(utxo, true, lowLeafPreimage, Fr.ZERO, []);
      testCounter++;
      nestedTrace.traceNullifierCheck(utxo, true, lowLeafPreimage, Fr.ZERO, []);
      testCounter++;
      nestedTrace.traceNewNullifier(utxo, lowLeafPreimage, Fr.ZERO, [], []);
      testCounter++;
      nestedTrace.traceL1ToL2MessageCheck(address, utxo, leafIndex, existsDefault, []);
      // counter does not increment for l1tol2 message checks
      nestedTrace.traceNewL2ToL1Message(address, recipient, content);
      testCounter++;
      nestedTrace.tracePublicLog(address, log);
      testCounter++;
      nestedTrace.traceGetContractInstance(address, /*exists=*/ true, contractInstance);
      testCounter++;
      nestedTrace.traceGetContractInstance(address, /*exists=*/ false, contractInstance);
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
      } else {
        expect(parentSideEffects).toEqual(childSideEffects);
      }

      const parentHints = trace.getAvmCircuitHints();
      const childHints = nestedTrace.getAvmCircuitHints();
      expect(parentHints.enqueuedCalls).toEqual(childHints.enqueuedCalls);
      expect(parentHints.contractInstances).toEqual(childHints.contractInstances);
      expect(parentHints.contractClasses).toEqual(childHints.contractClasses);
      expect(parentHints.publicDataReads).toEqual(childHints.publicDataReads);
      expect(parentHints.publicDataWrites).toEqual(childHints.publicDataWrites);
      expect(parentHints.nullifierReads).toEqual(childHints.nullifierReads);
      expect(parentHints.nullifierWrites).toEqual(childHints.nullifierWrites);
      expect(parentHints.noteHashReads).toEqual(childHints.noteHashReads);
      expect(parentHints.noteHashWrites).toEqual(childHints.noteHashWrites);
      expect(parentHints.l1ToL2MessageReads).toEqual(childHints.l1ToL2MessageReads);
    });
  });
});
