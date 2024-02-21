import { UnencryptedL2Log } from '@aztec/circuit-types';
import { AvmContext } from '../avm_context.js';
import { Field, Uint32 } from '../avm_memory_types.js';
import { initContext, initExecutionEnvironment } from '../fixtures/index.js';
import { EmitNoteHash, EmitNullifier, EmitUnencryptedLog, SendL2ToL1Message } from './accrued_substate.js';
import { StaticCallStorageAlterError } from './storage.js';
import { AztecAddress, EthAddress, Fr, L2ToL1Message } from '@aztec/circuits.js';
import { EventSelector } from '@aztec/foundation/abi';
import { TracedNoteHash, TracedNullifier } from '../journal/trace_types.js';

describe('Accrued Substate', () => {
  let context: AvmContext;

  beforeEach(() => {
    context = initContext();
  });

  describe('EmitNoteHash', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        EmitNoteHash.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('12345678', 'hex'), // dstOffset
      ]);
      const inst = new EmitNoteHash(/*indirect=*/ 0x01, /*dstOffset=*/ 0x12345678);

      expect(EmitNoteHash.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Should append a new note hash correctly', async () => {
      const value = new Field(69n);
      context.machineState.memory.set(0, value);

      await new EmitNoteHash(/*indirect=*/ 0, /*offset=*/ 0).execute(context);

      const sideEffects = context.worldState.getSideEffects();
      const expected: TracedNoteHash = {
        callPointer: Fr.ZERO,
        storageAddress: Fr.ZERO,
        noteHash: value.toFr(),
        counter: Fr.ZERO,
        endLifetime: Fr.ZERO,
      };
      expect(sideEffects.trace.newNoteHashes).toEqual([expected]);
    });
  });

  describe('EmitNullifier', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        EmitNullifier.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('12345678', 'hex'), // dstOffset
      ]);
      const inst = new EmitNullifier(/*indirect=*/ 0x01, /*dstOffset=*/ 0x12345678);

      expect(EmitNullifier.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Should append a new nullifier correctly', async () => {
      const value = new Field(69n);
      context.machineState.memory.set(0, value);

      await new EmitNullifier(/*indirect=*/ 0, /*offset=*/ 0).execute(context);

      const sideEffects = context.worldState.getSideEffects();
      const expected: TracedNullifier = {
        callPointer: Fr.ZERO,
        storageAddress: Fr.ZERO,
        nullifier: value.toFr(),
        counter: Fr.ZERO,
        endLifetime: Fr.ZERO,
      };
      expect(sideEffects.trace.newNullifiers).toEqual([expected]);
    });
  });

  describe('EmitUnencryptedLog', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        EmitUnencryptedLog.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('00000123', 'hex'), // selectorOffset
        ...Buffer.from('12345678', 'hex'), // logOffset
        ...Buffer.from('a2345678', 'hex'), // logSize
      ]);
      const inst = new EmitUnencryptedLog(
        /*indirect=*/ 0x01,
        /*selectorOffset=*/ 0x0123,
        /*logOffset=*/ 0x12345678,
        /*logSize=*/ 0xa2345678
      );

      expect(EmitUnencryptedLog.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Should append unencrypted logs correctly', async () => {
      const logOffset = 0;
      const selectorOffset = 0x0123;
      const selector = new Uint32(42);
      const values = [new Field(69n), new Field(420n), new Field(Field.MODULUS - 1n)];

      context.machineState.memory.set(selectorOffset, selector);
      context.machineState.memory.setSlice(0, values);

      const logSize = values.length;

      await new EmitUnencryptedLog(/*indirect=*/ 0, selectorOffset, logOffset, logSize).execute(context);

      const sideEffects = context.worldState.getSideEffects();
      const expected = new UnencryptedL2Log(
        AztecAddress.zero(),
        EventSelector.fromField(selector.toFr()),
        Buffer.concat(values.map(field => field.toBuffer())));
      expect(sideEffects.unencryptedLogs).toEqual([expected]);
    });
  });

  describe('SendL2ToL1Message', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        SendL2ToL1Message.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('12345678', 'hex'), // offset
        ...Buffer.from('a2345678', 'hex'), // length
      ]);
      const inst = new SendL2ToL1Message(/*indirect=*/ 0x01, /*dstOffset=*/ 0x12345678, /*length=*/ 0xa2345678);

      expect(SendL2ToL1Message.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Should append l1 to l2 messages correctly', async () => {
      const recipientOffset = 0;
      const recipient = new Field(42);
      const contentOffset = 1;
      const content = new Field(420);

      context.machineState.memory.set(recipientOffset, recipient);
      context.machineState.memory.set(contentOffset, content);

      await new SendL2ToL1Message(/*indirect=*/ 0, recipientOffset, contentOffset).execute(context);

      const sideEffects = context.worldState.getSideEffects();
      const expected = new L2ToL1Message(EthAddress.fromField(recipient.toFr()), content.toFr());
      expect(sideEffects.newL2ToL1Messages).toEqual([expected]);
    });
  });

  it('All substate instructions should fail within a static call', async () => {
    context = initContext({ env: initExecutionEnvironment({ isStaticCall: true }) });

    const instructions = [
      new EmitNoteHash(/*indirect=*/ 0, /*offset=*/ 0),
      new EmitNullifier(/*indirect=*/ 0, /*offset=*/ 0),
      new EmitUnencryptedLog(/*indirect=*/ 0, /*selectorOffset=*/ 0, /*logOffset=*/ 0, /*logSize=*/ 1),
      new SendL2ToL1Message(/*indirect=*/ 0, /*recipientOffset=*/ 0, /*contentOffset=*/ 1),
    ];

    for (const instruction of instructions) {
      await expect(instruction.execute(context)).rejects.toThrow(StaticCallStorageAlterError);
    }
  });
});
