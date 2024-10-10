import { UnencryptedL2Log } from '@aztec/circuit-types';
import {
  AztecAddress,
  CombinedConstantData,
  EthAddress,
  Gas,
  L2ToL1Message,
  LogHash,
  MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_PUBLIC_DATA_READS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_UNENCRYPTED_LOGS_PER_TX,
  NoteHash,
  Nullifier,
  PublicAccumulatedData,
  PublicAccumulatedDataArrayLengths,
  PublicDataRead,
  PublicDataUpdateRequest,
  PublicValidationRequestArrayLengths,
  PublicValidationRequests,
  ReadRequest,
  TreeLeafReadRequest,
} from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { SerializableContractInstance } from '@aztec/types/contracts';

import { randomBytes, randomInt } from 'crypto';

import { AvmContractCallResult } from '../avm/avm_contract_call_result.js';
import { initExecutionEnvironment } from '../avm/fixtures/index.js';
import { PublicEnqueuedCallSideEffectTrace, type TracedContractInstance } from './enqueued_call_side_effect_trace.js';
import { SideEffectLimitReachedError } from './side_effect_errors.js';

function randomTracedContractInstance(): TracedContractInstance {
  const instance = SerializableContractInstance.random();
  const address = AztecAddress.random();
  return { exists: true, ...instance, address };
}

describe('Enqueued-call Side Effect Trace', () => {
  const address = Fr.random();
  const utxo = Fr.random();
  const leafIndex = Fr.random();
  const slot = Fr.random();
  const value = Fr.random();
  const recipient = Fr.random();
  const content = Fr.random();
  const log = [Fr.random(), Fr.random(), Fr.random()];
  const contractInstance = SerializableContractInstance.empty().withAddress(new Fr(42));

  const startGasLeft = Gas.fromFields([new Fr(randomInt(10000)), new Fr(randomInt(10000))]);
  const endGasLeft = Gas.fromFields([new Fr(randomInt(10000)), new Fr(randomInt(10000))]);
  const transactionFee = Fr.random();
  const calldata = [Fr.random(), Fr.random(), Fr.random(), Fr.random()];
  const bytecode = randomBytes(100);
  const returnValues = [Fr.random(), Fr.random()];

  const constants = CombinedConstantData.empty();
  const avmEnvironment = initExecutionEnvironment({
    address,
    calldata,
    transactionFee,
  });
  const avmCallResults = new AvmContractCallResult(/*reverted=*/ false, returnValues);
  const avmCallRevertedResults = new AvmContractCallResult(/*reverted=*/ true, returnValues);

  const emptyValidationRequests = PublicValidationRequests.empty();

  let startCounter: number;
  let startCounterFr: Fr;
  let startCounterPlus1: number;
  let trace: PublicEnqueuedCallSideEffectTrace;

  beforeEach(() => {
    startCounter = randomInt(/*max=*/ 1000000);
    startCounterFr = new Fr(startCounter);
    startCounterPlus1 = startCounter + 1;
    trace = new PublicEnqueuedCallSideEffectTrace(startCounter);
  });

  const toVMCircuitPublicInputs = (trc: PublicEnqueuedCallSideEffectTrace) => {
    return trc.toVMCircuitPublicInputs(constants, avmEnvironment, startGasLeft, endGasLeft, avmCallResults);
  };

  it('Should trace storage reads', () => {
    const exists = true;
    const cached = false;
    trace.tracePublicStorageRead(address, slot, value, exists, cached);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expectedArray = PublicValidationRequests.empty().publicDataReads;
    expectedArray[0] = new PublicDataRead(slot, value, startCounter /*contractAddress*/);

    const circuitPublicInputs = toVMCircuitPublicInputs(trace);
    expect(circuitPublicInputs.validationRequests.publicDataReads).toEqual(expectedArray);
    expect(trace.getAvmCircuitHints().storageValues.items).toEqual([{ key: startCounterFr, value: value }]);
  });

  it('Should trace storage writes', () => {
    trace.tracePublicStorageWrite(address, slot, value);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expectedArray = PublicAccumulatedData.empty().publicDataUpdateRequests;
    expectedArray[0] = new PublicDataUpdateRequest(slot, value, startCounter /*contractAddress*/);

    const circuitPublicInputs = toVMCircuitPublicInputs(trace);
    expect(circuitPublicInputs.accumulatedData.publicDataUpdateRequests).toEqual(expectedArray);
  });

  it('Should trace note hash checks', () => {
    const exists = true;
    trace.traceNoteHashCheck(address, utxo, leafIndex, exists);

    const expectedArray = PublicValidationRequests.empty().noteHashReadRequests;
    expectedArray[0] = new TreeLeafReadRequest(utxo, leafIndex);

    const circuitPublicInputs = toVMCircuitPublicInputs(trace);
    expect(circuitPublicInputs.validationRequests.noteHashReadRequests).toEqual(expectedArray);

    expect(trace.getAvmCircuitHints().noteHashExists.items).toEqual([{ key: leafIndex, value: new Fr(exists) }]);
  });

  it('Should trace note hashes', () => {
    trace.traceNewNoteHash(address, utxo);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expectedArray = PublicAccumulatedData.empty().noteHashes;
    expectedArray[0] = new NoteHash(utxo, startCounter).scope(address);

    const circuitPublicInputs = toVMCircuitPublicInputs(trace);
    expect(circuitPublicInputs.accumulatedData.noteHashes).toEqual(expectedArray);
  });

  it('Should trace nullifier checks', () => {
    const exists = true;
    const isPending = false;
    trace.traceNullifierCheck(address, utxo, leafIndex, exists, isPending);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expectedArray = PublicValidationRequests.empty().nullifierReadRequests;
    expectedArray[0] = new ReadRequest(utxo, startCounter).scope(address);

    const circuitPublicInputs = toVMCircuitPublicInputs(trace);
    expect(circuitPublicInputs.validationRequests.nullifierReadRequests).toEqual(expectedArray);
    expect(circuitPublicInputs.validationRequests.nullifierNonExistentReadRequests).toEqual(
      emptyValidationRequests.nullifierNonExistentReadRequests,
    );

    expect(trace.getAvmCircuitHints().nullifierExists.items).toEqual([{ key: startCounterFr, value: new Fr(exists) }]);
  });

  it('Should trace non-existent nullifier checks', () => {
    const exists = false;
    const isPending = false;
    trace.traceNullifierCheck(address, utxo, leafIndex, exists, isPending);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expectedArray = PublicValidationRequests.empty().nullifierNonExistentReadRequests;
    expectedArray[0] = new ReadRequest(utxo, startCounter).scope(address);

    const circuitPublicInputs = toVMCircuitPublicInputs(trace);
    expect(circuitPublicInputs.validationRequests.nullifierReadRequests).toEqual(
      emptyValidationRequests.nullifierReadRequests,
    );
    expect(circuitPublicInputs.validationRequests.nullifierNonExistentReadRequests).toEqual(expectedArray);

    expect(trace.getAvmCircuitHints().nullifierExists.items).toEqual([{ key: startCounterFr, value: new Fr(exists) }]);
  });

  it('Should trace nullifiers', () => {
    trace.traceNewNullifier(address, utxo);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expectedArray = PublicAccumulatedData.empty().nullifiers;
    expectedArray[0] = new Nullifier(utxo, startCounter, Fr.ZERO);

    const circuitPublicInputs = toVMCircuitPublicInputs(trace);
    expect(circuitPublicInputs.accumulatedData.nullifiers).toEqual(expectedArray);
  });

  it('Should trace L1ToL2 Message checks', () => {
    const exists = true;
    trace.traceL1ToL2MessageCheck(address, utxo, leafIndex, exists);

    const expectedArray = PublicValidationRequests.empty().l1ToL2MsgReadRequests;
    expectedArray[0] = new TreeLeafReadRequest(utxo, leafIndex);

    const circuitPublicInputs = toVMCircuitPublicInputs(trace);
    expect(circuitPublicInputs.validationRequests.l1ToL2MsgReadRequests).toEqual(expectedArray);

    expect(trace.getAvmCircuitHints().l1ToL2MessageExists.items).toEqual([
      {
        key: leafIndex,
        value: new Fr(exists),
      },
    ]);
  });

  it('Should trace new L2ToL1 messages', () => {
    trace.traceNewL2ToL1Message(address, recipient, content);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expectedArray = PublicAccumulatedData.empty().l2ToL1Msgs;
    expectedArray[0] = new L2ToL1Message(EthAddress.fromField(recipient), content, startCounter).scope(address);

    const circuitPublicInputs = toVMCircuitPublicInputs(trace);
    expect(circuitPublicInputs.accumulatedData.l2ToL1Msgs).toEqual(expectedArray);
  });

  it('Should trace new unencrypted logs', () => {
    trace.traceUnencryptedLog(address, log);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const expectedLog = new UnencryptedL2Log(
      AztecAddress.fromField(address),
      Buffer.concat(log.map(f => f.toBuffer())),
    );
    const expectedArray = PublicAccumulatedData.empty().unencryptedLogsHashes;
    expectedArray[0] = new LogHash(
      Fr.fromBuffer(expectedLog.hash()),
      startCounter,
      new Fr(expectedLog.length + 4),
    ).scope(AztecAddress.fromField(address));

    const circuitPublicInputs = toVMCircuitPublicInputs(trace);
    expect(trace.getUnencryptedLogs()).toEqual([expectedLog]);
    expect(circuitPublicInputs.accumulatedData.unencryptedLogsHashes).toEqual(expectedArray);
  });

  it('Should trace get contract instance', () => {
    const instance = randomTracedContractInstance();
    const { version: _, ...instanceWithoutVersion } = instance;
    trace.traceGetContractInstance(instance);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    //const circuitPublicInputs = toVMCircuitPublicInputs(trace);
    // TODO(dbanks12): once this emits nullifier read, check here
    expect(trace.getAvmCircuitHints().contractInstances.items).toEqual([
      {
        // hint omits "version" and has "exists" as an Fr
        ...instanceWithoutVersion,
        exists: new Fr(instance.exists),
      },
    ]);
  });
  describe('Maximum accesses', () => {
    it('Should enforce maximum number of public storage reads', () => {
      for (let i = 0; i < MAX_PUBLIC_DATA_READS_PER_TX; i++) {
        trace.tracePublicStorageRead(new Fr(i), new Fr(i), new Fr(i), true, true);
      }
      expect(() => trace.tracePublicStorageRead(new Fr(42), new Fr(42), new Fr(42), true, true)).toThrow(
        SideEffectLimitReachedError,
      );
    });

    it('Should enforce maximum number of public storage writes', () => {
      for (let i = 0; i < MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX; i++) {
        trace.tracePublicStorageWrite(new Fr(i), new Fr(i), new Fr(i));
      }
      expect(() => trace.tracePublicStorageWrite(new Fr(42), new Fr(42), new Fr(42))).toThrow(
        SideEffectLimitReachedError,
      );
    });

    it('Should enforce maximum number of note hash checks', () => {
      for (let i = 0; i < MAX_NOTE_HASH_READ_REQUESTS_PER_TX; i++) {
        trace.traceNoteHashCheck(new Fr(i), new Fr(i), new Fr(i), true);
      }
      expect(() => trace.traceNoteHashCheck(new Fr(42), new Fr(42), new Fr(42), true)).toThrow(
        SideEffectLimitReachedError,
      );
    });

    it('Should enforce maximum number of new note hashes', () => {
      for (let i = 0; i < MAX_NOTE_HASHES_PER_TX; i++) {
        trace.traceNewNoteHash(new Fr(i), new Fr(i));
      }
      expect(() => trace.traceNewNoteHash(new Fr(42), new Fr(42))).toThrow(SideEffectLimitReachedError);
    });

    it('Should enforce maximum number of nullifier checks', () => {
      for (let i = 0; i < MAX_NULLIFIER_READ_REQUESTS_PER_TX; i++) {
        trace.traceNullifierCheck(new Fr(i), new Fr(i), new Fr(i), true, true);
      }
      expect(() => trace.traceNullifierCheck(new Fr(42), new Fr(42), new Fr(42), true, true)).toThrow(
        SideEffectLimitReachedError,
      );
      // NOTE: also cannot do a non-existent check once existent checks have filled up
      expect(() => trace.traceNullifierCheck(new Fr(42), new Fr(42), new Fr(42), false, true)).toThrow(
        SideEffectLimitReachedError,
      );
    });

    it('Should enforce maximum number of nullifier non-existent checks', () => {
      for (let i = 0; i < MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX; i++) {
        trace.traceNullifierCheck(new Fr(i), new Fr(i), new Fr(i), false, true);
      }
      expect(() => trace.traceNullifierCheck(new Fr(42), new Fr(42), new Fr(42), false, true)).toThrow(
        SideEffectLimitReachedError,
      );
      // NOTE: also cannot do a existent check once non-existent checks have filled up
      expect(() => trace.traceNullifierCheck(new Fr(42), new Fr(42), new Fr(42), true, true)).toThrow(
        SideEffectLimitReachedError,
      );
    });

    it('Should enforce maximum number of new nullifiers', () => {
      for (let i = 0; i < MAX_NULLIFIERS_PER_TX; i++) {
        trace.traceNewNullifier(new Fr(i), new Fr(i));
      }
      expect(() => trace.traceNewNullifier(new Fr(42), new Fr(42))).toThrow(SideEffectLimitReachedError);
    });

    it('Should enforce maximum number of L1 to L2 message checks', () => {
      for (let i = 0; i < MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX; i++) {
        trace.traceL1ToL2MessageCheck(new Fr(i), new Fr(i), new Fr(i), true);
      }
      expect(() => trace.traceL1ToL2MessageCheck(new Fr(42), new Fr(42), new Fr(42), true)).toThrow(
        SideEffectLimitReachedError,
      );
    });

    it('Should enforce maximum number of new l2 to l1 messages', () => {
      for (let i = 0; i < MAX_L2_TO_L1_MSGS_PER_TX; i++) {
        trace.traceNewL2ToL1Message(new Fr(i), new Fr(i), new Fr(i));
      }
      expect(() => trace.traceNewL2ToL1Message(new Fr(42), new Fr(42), new Fr(42))).toThrow(
        SideEffectLimitReachedError,
      );
    });

    it('Should enforce maximum number of new logs hashes', () => {
      for (let i = 0; i < MAX_UNENCRYPTED_LOGS_PER_TX; i++) {
        trace.traceUnencryptedLog(new Fr(i), [new Fr(i), new Fr(i)]);
      }
      expect(() => trace.traceUnencryptedLog(new Fr(42), [new Fr(42), new Fr(42)])).toThrow(
        SideEffectLimitReachedError,
      );
    });

    it('Should enforce maximum number of nullifier checks for GETCONTRACTINSTANCE', () => {
      for (let i = 0; i < MAX_NULLIFIER_READ_REQUESTS_PER_TX; i++) {
        trace.traceNullifierCheck(new Fr(i), new Fr(i), new Fr(i), true, true);
      }
      expect(() => trace.traceGetContractInstance({ ...contractInstance, exists: true })).toThrow(
        SideEffectLimitReachedError,
      );
      // NOTE: also cannot do a existent check once non-existent checks have filled up
      expect(() => trace.traceGetContractInstance({ ...contractInstance, exists: false })).toThrow(
        SideEffectLimitReachedError,
      );
    });

    it('Should enforce maximum number of nullifier non-existent checks for GETCONTRACTINSTANCE', () => {
      for (let i = 0; i < MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX; i++) {
        trace.traceNullifierCheck(new Fr(i), new Fr(i), new Fr(i), false, true);
      }
      expect(() => trace.traceGetContractInstance({ ...contractInstance, exists: false })).toThrow(
        SideEffectLimitReachedError,
      );
      // NOTE: also cannot do a existent check once non-existent checks have filled up
      expect(() => trace.traceGetContractInstance({ ...contractInstance, exists: true })).toThrow(
        SideEffectLimitReachedError,
      );
    });

    it('PreviousValidationRequestArrayLengths and PreviousAccumulatedDataArrayLengths contribute to limits', () => {
      trace = new PublicEnqueuedCallSideEffectTrace(
        0,
        new PublicValidationRequestArrayLengths(
          MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
          MAX_NULLIFIER_READ_REQUESTS_PER_TX,
          MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX,
          MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX,
          MAX_PUBLIC_DATA_READS_PER_TX,
        ),
        new PublicAccumulatedDataArrayLengths(
          MAX_NOTE_HASHES_PER_TX,
          MAX_NULLIFIERS_PER_TX,
          MAX_L2_TO_L1_MSGS_PER_TX,
          0,
          0,
          MAX_UNENCRYPTED_LOGS_PER_TX,
          MAX_PUBLIC_DATA_READS_PER_TX,
          0,
        ),
      );
      expect(() => trace.tracePublicStorageRead(new Fr(42), new Fr(42), new Fr(42), true, true)).toThrow(
        SideEffectLimitReachedError,
      );
      expect(() => trace.tracePublicStorageWrite(new Fr(42), new Fr(42), new Fr(42))).toThrow(
        SideEffectLimitReachedError,
      );
      expect(() => trace.traceNoteHashCheck(new Fr(42), new Fr(42), new Fr(42), true)).toThrow(
        SideEffectLimitReachedError,
      );
      expect(() => trace.traceNewNoteHash(new Fr(42), new Fr(42))).toThrow(SideEffectLimitReachedError);
      expect(() => trace.traceNullifierCheck(new Fr(42), new Fr(42), new Fr(42), false, true)).toThrow(
        SideEffectLimitReachedError,
      );
      expect(() => trace.traceNullifierCheck(new Fr(42), new Fr(42), new Fr(42), true, true)).toThrow(
        SideEffectLimitReachedError,
      );
      expect(() => trace.traceNewNullifier(new Fr(42), new Fr(42))).toThrow(SideEffectLimitReachedError);
      expect(() => trace.traceL1ToL2MessageCheck(new Fr(42), new Fr(42), new Fr(42), true)).toThrow(
        SideEffectLimitReachedError,
      );
      expect(() => trace.traceNewL2ToL1Message(new Fr(42), new Fr(42), new Fr(42))).toThrow(
        SideEffectLimitReachedError,
      );
      expect(() => trace.traceUnencryptedLog(new Fr(42), [new Fr(42), new Fr(42)])).toThrow(
        SideEffectLimitReachedError,
      );
      expect(() => trace.traceGetContractInstance({ ...contractInstance, exists: false })).toThrow(
        SideEffectLimitReachedError,
      );
      expect(() => trace.traceGetContractInstance({ ...contractInstance, exists: true })).toThrow(
        SideEffectLimitReachedError,
      );
    });
  });

  describe.each([avmCallResults, avmCallRevertedResults])('Should trace & absorb nested calls', callResults => {
    it(`${callResults.reverted ? 'Reverted' : 'Successful'} calls should be traced and absorbed properly`, () => {
      const existsDefault = true;
      const cached = false;
      const isPending = false;

      const nestedTrace = new PublicEnqueuedCallSideEffectTrace(startCounter);
      let testCounter = startCounter;
      nestedTrace.tracePublicStorageRead(address, slot, value, existsDefault, cached);
      testCounter++;
      nestedTrace.tracePublicStorageWrite(address, slot, value);
      testCounter++;
      nestedTrace.traceNoteHashCheck(address, utxo, leafIndex, existsDefault);
      // counter does not increment for note hash checks
      nestedTrace.traceNewNoteHash(address, utxo);
      testCounter++;
      nestedTrace.traceNullifierCheck(address, utxo, leafIndex, /*exists=*/ true, isPending);
      testCounter++;
      nestedTrace.traceNullifierCheck(address, utxo, leafIndex, /*exists=*/ false, isPending);
      testCounter++;
      nestedTrace.traceNewNullifier(address, utxo);
      testCounter++;
      nestedTrace.traceL1ToL2MessageCheck(address, utxo, leafIndex, existsDefault);
      // counter does not increment for l1tol2 message checks
      nestedTrace.traceNewL2ToL1Message(address, recipient, content);
      testCounter++;
      nestedTrace.traceUnencryptedLog(address, log);
      testCounter++;
      nestedTrace.traceGetContractInstance({ ...contractInstance, exists: true });
      testCounter++;
      nestedTrace.traceGetContractInstance({ ...contractInstance, exists: false });
      testCounter++;

      trace.traceNestedCall(nestedTrace, avmEnvironment, startGasLeft, endGasLeft, bytecode, callResults);

      // parent trace adopts nested call's counter
      expect(trace.getCounter()).toBe(testCounter);

      // parent absorbs child's side effects
      const parentSideEffects = trace.getSideEffects();
      const childSideEffects = nestedTrace.getSideEffects();
      if (callResults.reverted) {
        expect(parentSideEffects.contractStorageReads).toEqual(childSideEffects.contractStorageReads);
        expect(parentSideEffects.contractStorageUpdateRequests).toEqual(childSideEffects.contractStorageUpdateRequests);
        expect(parentSideEffects.noteHashReadRequests).toEqual(childSideEffects.noteHashReadRequests);
        expect(parentSideEffects.noteHashes).toEqual([]);
        expect(parentSideEffects.nullifierReadRequests).toEqual(childSideEffects.nullifierReadRequests);
        expect(parentSideEffects.nullifierNonExistentReadRequests).toEqual(
          childSideEffects.nullifierNonExistentReadRequests,
        );
        expect(parentSideEffects.nullifiers).toEqual(childSideEffects.nullifiers);
        expect(parentSideEffects.l1ToL2MsgReadRequests).toEqual(childSideEffects.l1ToL2MsgReadRequests);
        expect(parentSideEffects.l2ToL1Msgs).toEqual([]);
        expect(parentSideEffects.unencryptedLogs).toEqual([]);
        expect(parentSideEffects.unencryptedLogsHashes).toEqual([]);
      } else {
        expect(parentSideEffects).toEqual(childSideEffects);
      }
    });
  });
});
