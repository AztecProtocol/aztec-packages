import { UnencryptedL2Log } from '@aztec/circuit-types';
import {
  AztecAddress,
  EthAddress,
  Gas,
  L2ToL1Message,
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
  NullifierLeafPreimage,
  PublicDataTreeLeafPreimage,
  SerializableContractInstance,
} from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

import { randomBytes, randomInt } from 'crypto';

import { AvmContractCallResult } from '../avm/avm_contract_call_result.js';
import { initExecutionEnvironment } from '../avm/fixtures/index.js';
import { SideEffectLimitReachedError } from './side_effect_errors.js';
import { PublicSideEffectTrace } from './side_effect_trace.js';

describe('Side Effect Trace', () => {
  const address = AztecAddress.random();
  const utxo = Fr.random();
  const leafIndex = Fr.random();
  const slot = Fr.random();
  const value = Fr.random();
  const recipient = Fr.random();
  const content = Fr.random();
  const log = [Fr.random(), Fr.random(), Fr.random()];
  const contractInstance = SerializableContractInstance.default();

  const startGasLeft = Gas.fromFields([new Fr(randomInt(10000)), new Fr(randomInt(10000))]);
  const endGasLeft = Gas.fromFields([new Fr(randomInt(10000)), new Fr(randomInt(10000))]);
  const transactionFee = Fr.random();
  const calldata = [Fr.random(), Fr.random(), Fr.random(), Fr.random()];
  const bytecode = randomBytes(100);
  const returnValues = [Fr.random(), Fr.random()];

  const avmEnvironment = initExecutionEnvironment({
    address,
    calldata,
    transactionFee,
  });
  const reverted = false;
  const avmCallResults = new AvmContractCallResult(reverted, returnValues, endGasLeft);

  let startCounter: number;
  let startCounterFr: Fr;
  let startCounterPlus1: number;
  let trace: PublicSideEffectTrace;

  beforeEach(() => {
    startCounter = randomInt(/*max=*/ 1000000);
    startCounterFr = new Fr(startCounter);
    startCounterPlus1 = startCounter + 1;
    trace = new PublicSideEffectTrace(startCounter);
  });

  const toPxResult = (trc: PublicSideEffectTrace) => {
    return trc.toPublicFunctionCallResult(avmEnvironment, startGasLeft, bytecode, avmCallResults.finalize());
  };

  it('Should trace storage reads', () => {
    const leafPreimage = new PublicDataTreeLeafPreimage(slot, value, Fr.ZERO, 0n);
    trace.tracePublicStorageRead(address, slot, value, leafPreimage, Fr.ZERO, []);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const pxResult = toPxResult(trace);
    expect(pxResult.contractStorageReads).toEqual([
      {
        storageSlot: slot,
        currentValue: value,
        counter: startCounter,
        contractAddress: address,
        //exists: exists,
        //cached: cached,
      },
    ]);
    expect(pxResult.avmCircuitHints.storageValues.items).toEqual([{ key: startCounterFr, value: value }]);
  });

  it('Should trace storage writes', () => {
    const lowLeafPreimage = new PublicDataTreeLeafPreimage(slot, value, Fr.ZERO, 0n);
    const newLeafPreimage = new PublicDataTreeLeafPreimage(slot, value, Fr.ZERO, 0n);

    trace.tracePublicStorageWrite(address, slot, value, lowLeafPreimage, Fr.ZERO, [], newLeafPreimage, []);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const pxResult = toPxResult(trace);
    expect(pxResult.contractStorageUpdateRequests).toEqual([
      {
        storageSlot: slot,
        newValue: value,
        counter: startCounter,
        contractAddress: address,
      },
    ]);
  });

  it('Should trace note hash checks', () => {
    const exists = true;
    trace.traceNoteHashCheck(address, utxo, leafIndex, exists, []);

    const pxResult = toPxResult(trace);
    expect(pxResult.noteHashReadRequests).toEqual([
      {
        // contractAddress,
        value: utxo,
        //exists: exists,
        // counter: startCounter,
        leafIndex,
      },
    ]);
    expect(pxResult.avmCircuitHints.noteHashExists.items).toEqual([{ key: leafIndex, value: new Fr(exists) }]);
  });

  it('Should trace note hashes', () => {
    trace.traceNewNoteHash(address, utxo, Fr.ZERO, []);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const pxResult = toPxResult(trace);
    expect(pxResult.noteHashes).toEqual([
      {
        // contractAddress,
        value: utxo,
        counter: startCounter,
      },
    ]);
  });

  it('Should trace nullifier checks', () => {
    const exists = true;
    const lowLeafPreimage = new NullifierLeafPreimage(utxo, Fr.ZERO, 0n);
    trace.traceNullifierCheck(utxo, exists, lowLeafPreimage, Fr.ZERO, []);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const pxResult = toPxResult(trace);
    expect(pxResult.nullifierReadRequests).toEqual([
      {
        value: utxo,
        counter: startCounter,
      },
    ]);
    expect(pxResult.nullifierNonExistentReadRequests).toEqual([]);
    expect(pxResult.avmCircuitHints.nullifierExists.items).toEqual([{ key: startCounterFr, value: new Fr(exists) }]);
  });

  it('Should trace non-existent nullifier checks', () => {
    const exists = false;
    const lowLeafPreimage = new NullifierLeafPreimage(utxo, Fr.ZERO, 0n);
    trace.traceNullifierCheck(utxo, exists, lowLeafPreimage, Fr.ZERO, []);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const pxResult = toPxResult(trace);
    expect(pxResult.nullifierReadRequests).toEqual([]);
    expect(pxResult.nullifierNonExistentReadRequests).toEqual([
      {
        value: utxo,
        counter: startCounter,
      },
    ]);
    expect(pxResult.avmCircuitHints.nullifierExists.items).toEqual([{ key: startCounterFr, value: new Fr(exists) }]);
  });

  it('Should trace nullifiers', () => {
    const lowLeafPreimage = new NullifierLeafPreimage(utxo, Fr.ZERO, 0n);
    trace.traceNewNullifier(utxo, lowLeafPreimage, Fr.ZERO, [], []);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const pxResult = toPxResult(trace);
    expect(pxResult.nullifiers).toEqual([
      {
        value: utxo,
        counter: startCounter,
        noteHash: Fr.ZERO,
      },
    ]);
  });

  it('Should trace L1ToL2 Message checks', () => {
    const exists = true;
    trace.traceL1ToL2MessageCheck(address, utxo, leafIndex, exists, []);

    const pxResult = toPxResult(trace);
    expect(pxResult.l1ToL2MsgReadRequests).toEqual([
      {
        value: utxo,
        leafIndex,
      },
    ]);
    expect(pxResult.avmCircuitHints.l1ToL2MessageExists.items).toEqual([
      {
        key: leafIndex,
        value: new Fr(exists),
      },
    ]);
  });

  it('Should trace new L2ToL1 messages', () => {
    trace.traceNewL2ToL1Message(address, recipient, content);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const pxResult = toPxResult(trace);
    expect(pxResult.l2ToL1Messages).toEqual([
      new L2ToL1Message(EthAddress.fromField(recipient), content, startCounter),
    ]);
  });

  it('Should trace new unencrypted logs', () => {
    trace.traceUnencryptedLog(address, log);
    expect(trace.getCounter()).toBe(startCounterPlus1);

    const pxResult = toPxResult(trace);
    const expectLog = new UnencryptedL2Log(address, Buffer.concat(log.map(f => f.toBuffer())));
    expect(pxResult.unencryptedLogs.logs).toEqual([expectLog]);
    expect(pxResult.allUnencryptedLogs.logs).toEqual([expectLog]);
    expect(pxResult.unencryptedLogsHashes).toEqual([
      expect.objectContaining({
        counter: startCounter,
      }),
    ]);
  });

  describe('Maximum accesses', () => {
    it('Should enforce maximum number of public storage reads', () => {
      for (let i = 0; i < MAX_PUBLIC_DATA_READS_PER_TX; i++) {
        const leafPreimage = new PublicDataTreeLeafPreimage(new Fr(i), new Fr(i), Fr.ZERO, 0n);
        trace.tracePublicStorageRead(address, slot, value, leafPreimage, Fr.ZERO, []);
      }
      const leafPreimage = new PublicDataTreeLeafPreimage(new Fr(42), new Fr(42), Fr.ZERO, 0n);
      expect(() => trace.tracePublicStorageRead(address, new Fr(42), value, leafPreimage, Fr.ZERO, [])).toThrow(
        SideEffectLimitReachedError,
      );
    });

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

    it('Should enforce maximum number of note hash checks', () => {
      for (let i = 0; i < MAX_NOTE_HASH_READ_REQUESTS_PER_TX; i++) {
        trace.traceNoteHashCheck(AztecAddress.fromNumber(i), new Fr(i), new Fr(i), true, []);
      }
      expect(() => trace.traceNoteHashCheck(AztecAddress.fromNumber(42), new Fr(42), new Fr(42), true, [])).toThrow(
        SideEffectLimitReachedError,
      );
    });

    it('Should enforce maximum number of new note hashes', () => {
      for (let i = 0; i < MAX_NOTE_HASHES_PER_TX; i++) {
        trace.traceNewNoteHash(AztecAddress.fromNumber(i), new Fr(i), Fr.ZERO, []);
      }
      expect(() => trace.traceNewNoteHash(AztecAddress.fromNumber(42), new Fr(42), Fr.ZERO, [])).toThrow(
        SideEffectLimitReachedError,
      );
    });

    it('Should enforce maximum number of nullifier checks', () => {
      for (let i = 0; i < MAX_NULLIFIER_READ_REQUESTS_PER_TX; i++) {
        const lowLeafPreimage = new NullifierLeafPreimage(new Fr(i), Fr.ZERO, 0n);
        trace.traceNullifierCheck(new Fr(i + 1), true, lowLeafPreimage, Fr.ZERO, []);
      }
      const lowLeafPreimage = new NullifierLeafPreimage(new Fr(41), Fr.ZERO, 0n);
      expect(() => trace.traceNullifierCheck(new Fr(42), true, lowLeafPreimage, Fr.ZERO, [])).toThrow(
        SideEffectLimitReachedError,
      );
      // NOTE: also cannot do a non-existent check once existent checks have filled up
      expect(() => trace.traceNullifierCheck(new Fr(42), false, lowLeafPreimage, Fr.ZERO, [])).toThrow(
        SideEffectLimitReachedError,
      );
    });

    it('Should enforce maximum number of nullifier non-existent checks', () => {
      for (let i = 0; i < MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX; i++) {
        const lowLeafPreimage = new NullifierLeafPreimage(new Fr(i), Fr.ZERO, 0n);
        trace.traceNullifierCheck(new Fr(i + 1), true, lowLeafPreimage, Fr.ZERO, []);
      }
      const lowLeafPreimage = new NullifierLeafPreimage(new Fr(41), Fr.ZERO, 0n);
      expect(() => trace.traceNullifierCheck(new Fr(42), false, lowLeafPreimage, Fr.ZERO, [])).toThrow(
        SideEffectLimitReachedError,
      );
      // NOTE: also cannot do a existent check once non-existent checks have filled up
      expect(() => trace.traceNullifierCheck(new Fr(42), true, lowLeafPreimage, Fr.ZERO, [])).toThrow(
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

    it('Should enforce maximum number of L1 to L2 message checks', () => {
      for (let i = 0; i < MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX; i++) {
        trace.traceL1ToL2MessageCheck(AztecAddress.fromNumber(i), new Fr(i), new Fr(i), true, []);
      }
      expect(() =>
        trace.traceL1ToL2MessageCheck(AztecAddress.fromNumber(42), new Fr(42), new Fr(42), true, []),
      ).toThrow(SideEffectLimitReachedError);
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

    it('Should enforce maximum number of nullifier checks for GETCONTRACTINSTANCE', () => {
      for (let i = 0; i < MAX_NULLIFIER_READ_REQUESTS_PER_TX; i++) {
        const lowLeafPreimage = new NullifierLeafPreimage(new Fr(i), Fr.ZERO, 0n);
        trace.traceNullifierCheck(new Fr(i + 1), true, lowLeafPreimage, Fr.ZERO, []);
      }
      expect(() => trace.traceGetContractInstance(address, /*exists=*/ true, contractInstance)).toThrow(
        SideEffectLimitReachedError,
      );
      // NOTE: also cannot do a existent check once non-existent checks have filled up
      expect(() => trace.traceGetContractInstance(address, /*exists=*/ false, contractInstance)).toThrow(
        SideEffectLimitReachedError,
      );
    });

    it('Should enforce maximum number of nullifier non-existent checks for GETCONTRACTINSTANCE', () => {
      for (let i = 0; i < MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX; i++) {
        const lowLeafPreimage = new NullifierLeafPreimage(new Fr(i), Fr.ZERO, 0n);
        trace.traceNullifierCheck(new Fr(i + 1), true, lowLeafPreimage, Fr.ZERO, []);
      }
      expect(() => trace.traceGetContractInstance(address, /*exists=*/ false, contractInstance)).toThrow(
        SideEffectLimitReachedError,
      );
      // NOTE: also cannot do a existent check once non-existent checks have filled up
      expect(() => trace.traceGetContractInstance(address, /*exists=*/ true, contractInstance)).toThrow(
        SideEffectLimitReachedError,
      );
    });
  });

  it('Should trace nested calls', () => {
    const existsDefault = true;

    const nestedTrace = new PublicSideEffectTrace(startCounter);
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

    trace.traceNestedCall(nestedTrace, avmEnvironment, startGasLeft, bytecode, avmCallResults);
    // parent trace adopts nested call's counter
    expect(trace.getCounter()).toBe(testCounter);

    // get parent trace as result
    const parentPxResult = toPxResult(trace);
    const childPxResult = toPxResult(nestedTrace);
    expect(parentPxResult.nestedExecutions).toEqual([childPxResult]);

    // parent absorb's child's unencryptedLogs into all*
    expect(parentPxResult.allUnencryptedLogs).toEqual(childPxResult.allUnencryptedLogs);
  });
});
