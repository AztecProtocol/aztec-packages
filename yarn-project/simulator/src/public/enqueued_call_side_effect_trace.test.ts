import { UnencryptedL2Log } from '@aztec/circuit-types';
import {
  AvmAppendTreeHint,
  AvmNullifierReadTreeHint,
  AvmNullifierWriteTreeHint,
  AvmPublicDataReadTreeHint,
  AvmPublicDataWriteTreeHint,
  AztecAddress,
  type ContractClassIdPreimage,
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
  PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
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
  const bytecode = Buffer.from('0xdeadbeef');
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
    expect(trace.getAvmCircuitHints().publicDataReads.items).toEqual([expected]);
  });

  it('Should trace storage writes', () => {
    const lowLeafPreimage = new PublicDataTreeLeafPreimage(slot, value, Fr.ZERO, 0n);
    const newLeafPreimage = new PublicDataTreeLeafPreimage(slot, value, Fr.ZERO, 0n);

    trace.tracePublicStorageWrite(
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

    const leafSlot = computePublicDataTreeLeafSlot(address, slot);
    const expected = [new PublicDataUpdateRequest(leafSlot, value, startCounter /*contractAddress*/)];
    expect(trace.getSideEffects().publicDataWrites).toEqual(expected);

    const readHint = new AvmPublicDataReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafSiblingPath);
    const expectedHint = new AvmPublicDataWriteTreeHint(readHint, newLeafPreimage, siblingPath);
    expect(trace.getAvmCircuitHints().publicDataWrites.items).toEqual([expectedHint]);
  });

  it('Should trace note hash checks', () => {
    const exists = true;
    trace.traceNoteHashCheck(address, utxo, leafIndex, exists, siblingPath);
    const expected = new AvmAppendTreeHint(leafIndex, utxo, siblingPath);
    expect(trace.getAvmCircuitHints().noteHashReads.items).toEqual([expected]);
  });

  it('Should trace note hashes', () => {
    trace.traceNewNoteHash(utxo, leafIndex, siblingPath);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expected = [new NoteHash(utxo, startCounter)];
    expect(trace.getSideEffects().noteHashes).toEqual(expected);

    const expectedHint = new AvmAppendTreeHint(leafIndex, utxo, siblingPath);
    expect(trace.getAvmCircuitHints().noteHashWrites.items).toEqual([expectedHint]);
  });

  it('Should trace nullifier checks', () => {
    const exists = true;
    const lowLeafPreimage = new NullifierLeafPreimage(utxo, Fr.ZERO, 0n);
    trace.traceNullifierCheck(utxo, exists, lowLeafPreimage, leafIndex, siblingPath);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expected = new AvmNullifierReadTreeHint(lowLeafPreimage, leafIndex, siblingPath);
    expect(trace.getAvmCircuitHints().nullifierReads.items).toEqual([expected]);
  });

  it('Should trace nullifiers', () => {
    const lowLeafPreimage = new NullifierLeafPreimage(utxo, Fr.ZERO, 0n);
    trace.traceNewNullifier(utxo, lowLeafPreimage, lowLeafIndex, lowLeafSiblingPath, siblingPath);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expected = [new Nullifier(utxo, startCounter, Fr.ZERO)];
    expect(trace.getSideEffects().nullifiers).toEqual(expected);

    const readHint = new AvmNullifierReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafSiblingPath);
    const expectedHint = new AvmNullifierWriteTreeHint(readHint, siblingPath);
    expect(trace.getAvmCircuitHints().nullifierWrites.items).toEqual([expectedHint]);
  });

  it('Should trace L1ToL2 Message checks', () => {
    const exists = true;
    trace.traceL1ToL2MessageCheck(address, utxo, leafIndex, exists, siblingPath);
    const expected = new AvmAppendTreeHint(leafIndex, utxo, siblingPath);
    expect(trace.getAvmCircuitHints().l1ToL2MessageReads.items).toEqual([expected]);
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
    const lowLeafPreimage = new NullifierLeafPreimage(/*siloedNullifier=*/ address.toField(), Fr.ZERO, 0n);
    const exists = true;
    trace.traceGetContractInstance(address, exists, instance, lowLeafPreimage, lowLeafIndex, lowLeafSiblingPath);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const membershipHint = new AvmNullifierReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafSiblingPath);
    expect(trace.getAvmCircuitHints().contractInstances.items).toEqual([
      {
        address,
        exists,
        ...instanceWithoutVersion,
        membershipHint,
      },
    ]);
  });

  it('Should trace get bytecode', () => {
    const instance = SerializableContractInstance.random();
    const contractClass: ContractClassIdPreimage = {
      artifactHash: Fr.random(),
      privateFunctionsRoot: Fr.random(),
      publicBytecodeCommitment: Fr.random(),
    };
    const { version: _, ...instanceWithoutVersion } = instance;
    const lowLeafPreimage = new NullifierLeafPreimage(/*siloedNullifier=*/ address.toField(), Fr.ZERO, 0n);
    const exists = true;
    trace.traceGetBytecode(
      address,
      exists,
      bytecode,
      instance,
      contractClass,
      lowLeafPreimage,
      lowLeafIndex,
      lowLeafSiblingPath,
    );

    const membershipHint = new AvmNullifierReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafSiblingPath);
    expect(trace.getAvmCircuitHints().contractBytecodeHints.items).toEqual([
      {
        bytecode,
        contractInstanceHint: { address, exists, ...instanceWithoutVersion, membershipHint: { ...membershipHint } },
        contractClassHint: contractClass,
      },
    ]);
  });

  describe('Maximum accesses', () => {
    it('Should enforce maximum number of user public storage writes', () => {
      for (let i = 0; i < MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX; i++) {
        const lowLeafPreimage = new PublicDataTreeLeafPreimage(new Fr(i), new Fr(i), Fr.ZERO, 0n);
        const newLeafPreimage = new PublicDataTreeLeafPreimage(new Fr(i + 1), new Fr(i + 1), Fr.ZERO, 0n);
        trace.tracePublicStorageWrite(address, slot, value, false, lowLeafPreimage, Fr.ZERO, [], newLeafPreimage, []);
      }
      const leafPreimage = new PublicDataTreeLeafPreimage(new Fr(42), new Fr(42), Fr.ZERO, 0n);
      expect(() =>
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
      ).toThrow(SideEffectLimitReachedError);
      // Still allows protocol writes
      expect(() =>
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
      ).not.toThrow();
    });

    it('Should enforce maximum number of protocol public storage writes', () => {
      for (let i = 0; i < PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX; i++) {
        const lowLeafPreimage = new PublicDataTreeLeafPreimage(new Fr(i), new Fr(i), Fr.ZERO, 0n);
        const newLeafPreimage = new PublicDataTreeLeafPreimage(new Fr(i + 1), new Fr(i + 1), Fr.ZERO, 0n);
        trace.tracePublicStorageWrite(address, slot, value, true, lowLeafPreimage, Fr.ZERO, [], newLeafPreimage, []);
      }
      const leafPreimage = new PublicDataTreeLeafPreimage(new Fr(42), new Fr(42), Fr.ZERO, 0n);
      expect(() =>
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
      ).toThrow(SideEffectLimitReachedError);
      // Still allows user writes
      expect(() =>
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
      ).not.toThrow();
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
          PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
          MAX_NOTE_HASHES_PER_TX,
          MAX_NULLIFIERS_PER_TX,
          MAX_L2_TO_L1_MSGS_PER_TX,
          MAX_UNENCRYPTED_LOGS_PER_TX,
        ),
      );
      expect(() => trace.tracePublicStorageWrite(AztecAddress.fromNumber(42), new Fr(42), new Fr(42), false)).toThrow(
        SideEffectLimitReachedError,
      );
      expect(() => trace.tracePublicStorageWrite(AztecAddress.fromNumber(42), new Fr(42), new Fr(42), true)).toThrow(
        SideEffectLimitReachedError,
      );
      expect(() => trace.traceNewNoteHash(new Fr(42), new Fr(42))).toThrow(SideEffectLimitReachedError);
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
      nestedTrace.tracePublicStorageWrite(address, slot, value, false, leafPreimage, Fr.ZERO, [], leafPreimage, []);
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
      nestedTrace.traceUnencryptedLog(address, log);
      testCounter++;
      nestedTrace.traceGetContractInstance(address, /*exists=*/ true, contractInstance, lowLeafPreimage, Fr.ZERO, []);
      testCounter++;
      nestedTrace.traceGetContractInstance(address, /*exists=*/ false, contractInstance, lowLeafPreimage, Fr.ZERO, []);
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
      expect(parentHints.contractInstances.items).toEqual(childHints.contractInstances.items);
      expect(parentHints.contractBytecodeHints.items).toEqual(childHints.contractBytecodeHints.items);
      expect(parentHints.publicDataReads.items).toEqual(childHints.publicDataReads.items);
      expect(parentHints.publicDataWrites.items).toEqual(childHints.publicDataWrites.items);
      expect(parentHints.nullifierReads.items).toEqual(childHints.nullifierReads.items);
      expect(parentHints.nullifierWrites.items).toEqual(childHints.nullifierWrites.items);
      expect(parentHints.noteHashReads.items).toEqual(childHints.noteHashReads.items);
      expect(parentHints.noteHashWrites.items).toEqual(childHints.noteHashWrites.items);
      expect(parentHints.l1ToL2MessageReads.items).toEqual(childHints.l1ToL2MessageReads.items);
    });
  });
});
