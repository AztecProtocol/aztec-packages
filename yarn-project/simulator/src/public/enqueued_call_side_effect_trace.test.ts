import { UnencryptedL2Log } from '@aztec/circuit-types';
import {
  AvmAppendTreeHint,
  AvmNullifierReadTreeHint,
  AvmNullifierWriteTreeHint,
  AvmPublicDataReadTreeHint,
  AvmPublicDataWriteTreeHint,
  AztecAddress,
  EthAddress,
  L2ToL1Message,
  LogHash,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_UNENCRYPTED_LOGS_PER_TX,
  NoteHash,
  Nullifier,
  NullifierLeafPreimage,
  PublicDataTreeLeafPreimage,
  PublicDataUpdateRequest,
  SerializableContractInstance,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot } from '@aztec/circuits.js/hash';
import { Fr } from '@aztec/foundation/fields';

import { randomInt } from 'crypto';

import { PublicEnqueuedCallSideEffectTrace, SideEffectArrayLengths } from './enqueued_call_side_effect_trace.js';
import { SideEffectLimitReachedError } from './side_effect_errors.js';

describe('Enqueued-call Side Effect Trace', () => {
  const address = AztecAddress.random();
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
  let trace: PublicEnqueuedCallSideEffectTrace;

  beforeEach(() => {
    startCounter = randomInt(/*max=*/ 1000000);
    startCounterPlus1 = startCounter + 1;
    trace = new PublicEnqueuedCallSideEffectTrace(startCounter);
  });

  it('Should trace storage reads', () => {
    const leafPreimage = new PublicDataTreeLeafPreimage(slot, value, Fr.ZERO, 0n);
    trace.tracePublicStorageRead(address, slot, value, leafPreimage, leafIndex, siblingPath);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expected = new AvmPublicDataReadTreeHint(leafPreimage, leafIndex, siblingPath);
    expect(trace.getAvmCircuitHints().storageReadRequest.items).toEqual([expected]);
  });

  it('Should trace storage writes', () => {
    const lowLeafPreimage = new PublicDataTreeLeafPreimage(slot, value, Fr.ZERO, 0n);
    const newLeafPreimage = new PublicDataTreeLeafPreimage(slot, value, Fr.ZERO, 0n);

    trace.tracePublicStorageWrite(
      address,
      slot,
      value,
      lowLeafPreimage,
      lowLeafIndex,
      lowLeafSiblingPath,
      newLeafPreimage,
      siblingPath,
    );
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const leafSlot = computePublicDataTreeLeafSlot(address, slot);
    const expected = [new PublicDataUpdateRequest(leafSlot, value, startCounter /*contractAddress*/)];
    expect(trace.getSideEffects().publicDataWrites).toEqual(expected);

    const readHint = new AvmPublicDataReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafSiblingPath);
    const expectedHint = new AvmPublicDataWriteTreeHint(readHint, newLeafPreimage, siblingPath);
    expect(trace.getAvmCircuitHints().storageUpdateRequest.items).toEqual([expectedHint]);
  });

  it('Should trace note hash checks', () => {
    const exists = true;
    trace.traceNoteHashCheck(address, utxo, leafIndex, exists, siblingPath);
    const expected = new AvmAppendTreeHint(leafIndex, utxo, siblingPath);
    expect(trace.getAvmCircuitHints().noteHashReadRequest.items).toEqual([expected]);
  });

  it('Should trace note hashes', () => {
    trace.traceNewNoteHash(address, utxo, leafIndex, siblingPath);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expected = [new NoteHash(utxo, startCounter).scope(address)];
    expect(trace.getSideEffects().noteHashes).toEqual(expected);

    const expectedHint = new AvmAppendTreeHint(leafIndex, utxo, siblingPath);
    expect(trace.getAvmCircuitHints().noteHashWriteRequest.items).toEqual([expectedHint]);
  });

  it('Should trace nullifier checks', () => {
    const exists = true;
    const lowLeafPreimage = new NullifierLeafPreimage(utxo, Fr.ZERO, 0n);
    trace.traceNullifierCheck(utxo, exists, lowLeafPreimage, leafIndex, siblingPath);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expected = new AvmNullifierReadTreeHint(lowLeafPreimage, leafIndex, siblingPath);
    expect(trace.getAvmCircuitHints().nullifierReadRequest.items).toEqual([expected]);
  });

  it('Should trace nullifiers', () => {
    const lowLeafPreimage = new NullifierLeafPreimage(utxo, Fr.ZERO, 0n);
    trace.traceNewNullifier(utxo, lowLeafPreimage, lowLeafIndex, lowLeafSiblingPath, siblingPath);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expected = [new Nullifier(utxo, startCounter, Fr.ZERO)];
    expect(trace.getSideEffects().nullifiers).toEqual(expected);

    const readHint = new AvmNullifierReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafSiblingPath);
    const expectedHint = new AvmNullifierWriteTreeHint(readHint, siblingPath);
    expect(trace.getAvmCircuitHints().nullifierWriteHints.items).toEqual([expectedHint]);
  });

  it('Should trace L1ToL2 Message checks', () => {
    const exists = true;
    trace.traceL1ToL2MessageCheck(address, utxo, leafIndex, exists, siblingPath);
    const expected = new AvmAppendTreeHint(leafIndex, utxo, siblingPath);
    expect(trace.getAvmCircuitHints().l1ToL2MessageReadRequest.items).toEqual([expected]);
  });

  it('Should trace new L2ToL1 messages', () => {
    trace.traceNewL2ToL1Message(address, recipient, content);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expected = [new L2ToL1Message(EthAddress.fromField(recipient), content, startCounter).scope(address)];
    expect(trace.getSideEffects().l2ToL1Msgs).toEqual(expected);
  });

  it('Should trace new unencrypted logs', () => {
    trace.traceUnencryptedLog(address, log);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expectedLog = new UnencryptedL2Log(address, Buffer.concat(log.map(f => f.toBuffer())));
    const expectedHashes = [
      new LogHash(Fr.fromBuffer(expectedLog.hash()), startCounter, new Fr(expectedLog.length + 4)).scope(address),
    ];

    expect(trace.getUnencryptedLogs()).toEqual([expectedLog]);
    expect(trace.getSideEffects().unencryptedLogsHashes).toEqual(expectedHashes);
  });

  it('Should trace get contract instance', () => {
    const instance = SerializableContractInstance.random();
    const { version: _, ...instanceWithoutVersion } = instance;
    const exists = true;
    trace.traceGetContractInstance(address, exists, instance);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    expect(trace.getAvmCircuitHints().contractInstances.items).toEqual([
      {
        address,
        exists,
        ...instanceWithoutVersion,
      },
    ]);
  });
  describe('Maximum accesses', () => {
    it('Should enforce maximum number of public storage writes', () => {
      for (let i = 0; i < MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX; i++) {
        const lowLeafPreimage = new PublicDataTreeLeafPreimage(new Fr(i), new Fr(i), Fr.ZERO, 0n);
        const newLeafPreimage = new PublicDataTreeLeafPreimage(new Fr(i + 1), new Fr(i + 1), Fr.ZERO, 0n);
        trace.tracePublicStorageWrite(address, slot, value, lowLeafPreimage, Fr.ZERO, [], newLeafPreimage, []);
      }
      const leafPreimage = new PublicDataTreeLeafPreimage(new Fr(42), new Fr(42), Fr.ZERO, 0n);
      expect(() =>
        trace.tracePublicStorageWrite(
          AztecAddress.fromNumber(42),
          new Fr(42),
          value,
          leafPreimage,
          Fr.ZERO,
          [],
          leafPreimage,
          [],
        ),
      ).toThrow(SideEffectLimitReachedError);
    });

    it('Should enforce maximum number of new note hashes', () => {
      for (let i = 0; i < MAX_NOTE_HASHES_PER_TX; i++) {
        trace.traceNewNoteHash(AztecAddress.fromNumber(i), new Fr(i), Fr.ZERO, []);
      }
      expect(() => trace.traceNewNoteHash(AztecAddress.fromNumber(42), new Fr(42), Fr.ZERO, [])).toThrow(
        SideEffectLimitReachedError,
      );
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

    it('Should enforce maximum number of new logs hashes', () => {
      for (let i = 0; i < MAX_UNENCRYPTED_LOGS_PER_TX; i++) {
        trace.traceUnencryptedLog(AztecAddress.fromNumber(i), [new Fr(i), new Fr(i)]);
      }
      expect(() => trace.traceUnencryptedLog(AztecAddress.fromNumber(42), [new Fr(42), new Fr(42)])).toThrow(
        SideEffectLimitReachedError,
      );
    });

    it('PreviousValidationRequestArrayLengths and PreviousAccumulatedDataArrayLengths contribute to limits', () => {
      trace = new PublicEnqueuedCallSideEffectTrace(
        0,
        new SideEffectArrayLengths(
          MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
          MAX_NOTE_HASHES_PER_TX,
          MAX_NULLIFIERS_PER_TX,
          MAX_L2_TO_L1_MSGS_PER_TX,
          MAX_UNENCRYPTED_LOGS_PER_TX,
        ),
      );
      expect(() => trace.tracePublicStorageWrite(AztecAddress.fromNumber(42), new Fr(42), new Fr(42))).toThrow(
        SideEffectLimitReachedError,
      );
      expect(() => trace.traceNewNoteHash(AztecAddress.fromNumber(42), new Fr(42), new Fr(42))).toThrow(
        SideEffectLimitReachedError,
      );
      expect(() => trace.traceNewNullifier(new Fr(42))).toThrow(SideEffectLimitReachedError);
      expect(() => trace.traceNewL2ToL1Message(AztecAddress.fromNumber(42), new Fr(42), new Fr(42))).toThrow(
        SideEffectLimitReachedError,
      );
      expect(() => trace.traceUnencryptedLog(AztecAddress.fromNumber(42), [new Fr(42), new Fr(42)])).toThrow(
        SideEffectLimitReachedError,
      );
    });
  });

  describe.each([false, true])('Should merge forked traces', reverted => {
    it(`${reverted ? 'Reverted' : 'Successful'} forked trace should be merged properly`, () => {
      const existsDefault = true;

      const nestedTrace = new PublicEnqueuedCallSideEffectTrace(startCounter);
      let testCounter = startCounter;
      const leafPreimage = new PublicDataTreeLeafPreimage(slot, value, Fr.ZERO, 0n);
      const lowLeafPreimage = new NullifierLeafPreimage(utxo, Fr.ZERO, 0n);
      nestedTrace.tracePublicStorageRead(address, slot, value, leafPreimage, Fr.ZERO, []);
      testCounter++;
      nestedTrace.tracePublicStorageWrite(address, slot, value, leafPreimage, Fr.ZERO, [], leafPreimage, []);
      testCounter++;
      nestedTrace.traceNoteHashCheck(address, utxo, leafIndex, existsDefault, []);
      // counter does not increment for note hash checks
      nestedTrace.traceNewNoteHash(address, utxo, Fr.ZERO, []);
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
      nestedTrace.traceUnencryptedLog(address, log);
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
        expect(parentSideEffects.unencryptedLogs).toEqual([]);
        expect(parentSideEffects.unencryptedLogsHashes).toEqual([]);
      } else {
        expect(parentSideEffects).toEqual(childSideEffects);
      }

      const parentHints = trace.getAvmCircuitHints();
      const childHints = nestedTrace.getAvmCircuitHints();
      expect(parentHints.enqueuedCalls.items).toEqual(childHints.enqueuedCalls.items);
      expect(parentHints.storageValues.items).toEqual(childHints.storageValues.items);
      expect(parentHints.noteHashExists.items).toEqual(childHints.noteHashExists.items);
      expect(parentHints.nullifierExists.items).toEqual(childHints.nullifierExists.items);
      expect(parentHints.l1ToL2MessageExists.items).toEqual(childHints.l1ToL2MessageExists.items);
      expect(parentHints.externalCalls.items).toEqual(childHints.externalCalls.items);
      expect(parentHints.contractInstances.items).toEqual(childHints.contractInstances.items);
      expect(parentHints.contractBytecodeHints.items).toEqual(childHints.contractBytecodeHints.items);
      expect(parentHints.storageReadRequest.items).toEqual(childHints.storageReadRequest.items);
      expect(parentHints.storageUpdateRequest.items).toEqual(childHints.storageUpdateRequest.items);
      expect(parentHints.nullifierReadRequest.items).toEqual(childHints.nullifierReadRequest.items);
      expect(parentHints.nullifierWriteHints.items).toEqual(childHints.nullifierWriteHints.items);
      expect(parentHints.noteHashReadRequest.items).toEqual(childHints.noteHashReadRequest.items);
      expect(parentHints.noteHashWriteRequest.items).toEqual(childHints.noteHashWriteRequest.items);
      expect(parentHints.l1ToL2MessageReadRequest.items).toEqual(childHints.l1ToL2MessageReadRequest.items);
    });
  });
});
