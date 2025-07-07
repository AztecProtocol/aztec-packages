import { AVM_EMITUNENCRYPTEDLOG_BASE_L2_GAS, AVM_EMITUNENCRYPTEDLOG_DYN_DA_GAS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeNoteHashNonce, computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';

import { mock } from 'jest-mock-extended';

import type { PublicSideEffectTraceInterface } from '../../../public/side_effect_trace_interface.js';
import type { PublicTreesDB } from '../../public_db_sources.js';
import type { PublicPersistableStateManager } from '../../state_manager/state_manager.js';
import type { AvmContext } from '../avm_context.js';
import { Field, Uint8, Uint32 } from '../avm_memory_types.js';
import { InstructionExecutionError, StaticCallAlterationError } from '../errors.js';
import { initContext, initExecutionEnvironment, initPersistableStateManager } from '../fixtures/initializers.js';
import {
  mockCheckNullifierExists,
  mockL1ToL2MessageExists,
  mockNoteHashCount,
  mockNoteHashExists,
} from '../test_utils.js';
import {
  EmitNoteHash,
  EmitNullifier,
  EmitUnencryptedLog,
  L1ToL2MessageExists,
  NoteHashExists,
  NullifierExists,
  SendL2ToL1Message,
} from './accrued_substate.js';

describe('Accrued Substate', () => {
  let treesDB: PublicTreesDB;
  let trace: PublicSideEffectTraceInterface;
  let persistableState: PublicPersistableStateManager;
  let context: AvmContext;

  const address = AztecAddress.fromNumber(1);
  const sender = AztecAddress.fromNumber(42);
  const value0 = new Fr(69); // noteHash or nullifier...
  const value0Offset = 100;
  const value1 = new Fr(420);
  const value1Offset = 200;
  const leafIndex = new Fr(7);
  const leafIndexOffset = 1;
  const existsOffset = 2;
  const firstNullifier = new Fr(420000);
  let siloedNullifier0: Fr;

  beforeAll(async () => {
    siloedNullifier0 = await siloNullifier(address, value0);
  });

  beforeEach(() => {
    treesDB = mock<PublicTreesDB>();
    trace = mock<PublicSideEffectTraceInterface>();
    persistableState = initPersistableStateManager({ treesDB, trace, firstNullifier });
    context = initContext({ persistableState, env: initExecutionEnvironment({ address, sender }) });
  });

  describe('NoteHashExists', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        NoteHashExists.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // noteHashOffset
        ...Buffer.from('2345', 'hex'), // leafIndexOffset
        ...Buffer.from('4567', 'hex'), // existsOffset
      ]);
      const inst = new NoteHashExists(
        /*indirect=*/ 0x01,
        /*noteHashOffset=*/ 0x1234,
        /*leafIndexOffset=*/ 0x2345,
        /*existsOffset=*/ 0x4567,
      );

      expect(NoteHashExists.fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    // Will check existence at leafIndex, but nothing may be found there and/or something may be found at mockAtLeafIndex
    describe.each([
      [/*mockAtLeafIndex=*/ undefined], // doesn't exist at all
      [/*mockAtLeafIndex=*/ leafIndex], // should be found!
      [/*mockAtLeafIndex=*/ leafIndex.add(Fr.ONE)], // won't be found! (checking leafIndex+1, but it exists at leafIndex)
    ])('Note hash checks', (mockAtLeafIndex?: Fr) => {
      const expectFound = mockAtLeafIndex !== undefined && mockAtLeafIndex.equals(leafIndex);
      const existsElsewhere = mockAtLeafIndex !== undefined && !mockAtLeafIndex.equals(leafIndex);
      const existsStr = expectFound ? 'DOES exist' : 'does NOT exist';
      const foundAtStr = existsElsewhere
        ? `at leafIndex=${mockAtLeafIndex.toNumber()} (exists at leafIndex=${leafIndex.toNumber()})`
        : '';
      it(`Should return ${expectFound} (and be traced) when noteHash ${existsStr} ${foundAtStr}`, async () => {
        if (mockAtLeafIndex !== undefined) {
          mockNoteHashExists(treesDB, mockAtLeafIndex, value0);
        }

        context.machineState.memory.set(value0Offset, new Field(value0)); // noteHash
        context.machineState.memory.set(leafIndexOffset, new Field(leafIndex));
        await new NoteHashExists(
          /*indirect=*/ 0,
          /*noteHashOffset=*/ value0Offset,
          leafIndexOffset,
          existsOffset,
        ).execute(context);

        const gotExists = context.machineState.memory.getAs<Uint8>(existsOffset);
        expect(gotExists).toEqual(new Uint8(expectFound ? 1 : 0));
      });
    });
  });

  describe('EmitNoteHash', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        EmitNoteHash.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // offset
      ]);
      const inst = new EmitNoteHash(/*indirect=*/ 0x01, /*offset=*/ 0x1234);

      expect(EmitNoteHash.fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should append a new note hash correctly', async () => {
      mockNoteHashCount(trace, 0);
      context.machineState.memory.set(value0Offset, new Field(value0));
      await new EmitNoteHash(/*indirect=*/ 0, /*offset=*/ value0Offset).execute(context);
      expect(trace.traceNewNoteHash).toHaveBeenCalledTimes(1);
      const siloedNotehash = await siloNoteHash(address, value0);
      const noteNonce = await computeNoteHashNonce(firstNullifier, 0);
      const uniqueNoteHash = await computeUniqueNoteHash(noteNonce, siloedNotehash);
      expect(trace.traceNewNoteHash).toHaveBeenCalledWith(uniqueNoteHash);
    });
  });

  describe('NullifierExists', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        NullifierExists.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // nullifierOffset
        ...Buffer.from('0234', 'hex'), // addressOffset
        ...Buffer.from('4567', 'hex'), // existsOffset
      ]);
      const inst = new NullifierExists(
        /*indirect=*/ 0x01,
        /*nullifierOffset=*/ 0x1234,
        /*addressOffset=*/ 0x0234,
        /*existsOffset=*/ 0x4567,
      );

      expect(NullifierExists.fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    describe.each([[/*exists=*/ false], [/*exists=*/ true]])('Nullifier checks', (exists: boolean) => {
      const existsStr = exists ? 'DOES exist' : 'does NOT exist';
      it(`Should return ${exists} (and be traced) when noteHash ${existsStr}`, async () => {
        const addressOffset = 1;

        if (exists) {
          mockCheckNullifierExists(treesDB, true, value0);
        }

        context.machineState.memory.set(value0Offset, new Field(value0)); // nullifier
        context.machineState.memory.set(addressOffset, new Field(address.toField()));
        await new NullifierExists(
          /*indirect=*/ 0,
          /*nullifierOffset=*/ value0Offset,
          addressOffset,
          existsOffset,
        ).execute(context);

        const gotExists = context.machineState.memory.getAs<Uint8>(existsOffset);
        expect(gotExists).toEqual(new Uint8(exists ? 1 : 0));
      });
    });
  });

  describe('EmitNullifier', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        EmitNullifier.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // offset
      ]);
      const inst = new EmitNullifier(/*indirect=*/ 0x01, /*offset=*/ 0x1234);

      expect(EmitNullifier.fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should append a new nullifier correctly', async () => {
      context.machineState.memory.set(value0Offset, new Field(value0));
      await new EmitNullifier(/*indirect=*/ 0, /*offset=*/ value0Offset).execute(context);
      expect(trace.traceNewNullifier).toHaveBeenCalledTimes(1);
      expect(trace.traceNewNullifier).toHaveBeenCalledWith(siloedNullifier0);
    });

    it('Nullifier collision reverts (same nullifier emitted twice)', async () => {
      context.machineState.memory.set(value0Offset, new Field(value0));
      await new EmitNullifier(/*indirect=*/ 0, /*offset=*/ value0Offset).execute(context);
      await expect(new EmitNullifier(/*indirect=*/ 0, /*offset=*/ value0Offset).execute(context)).rejects.toThrow(
        new InstructionExecutionError(
          `Attempted to emit duplicate nullifier ${value0} (contract address: ${address}).`,
        ),
      );
      expect(trace.traceNewNullifier).toHaveBeenCalledTimes(1);
      expect(trace.traceNewNullifier).toHaveBeenCalledWith(siloedNullifier0);
    });

    it('Nullifier collision reverts (nullifier exists in host state)', async () => {
      mockCheckNullifierExists(treesDB, true, leafIndex);
      context.machineState.memory.set(value0Offset, new Field(value0));
      await expect(new EmitNullifier(/*indirect=*/ 0, /*offset=*/ value0Offset).execute(context)).rejects.toThrow(
        new InstructionExecutionError(
          `Attempted to emit duplicate nullifier ${value0} (contract address: ${address}).`,
        ),
      );
      expect(trace.traceNewNullifier).toHaveBeenCalledTimes(0); // the only attempt should fail before tracing
    });
  });

  describe('L1ToL2MessageExists', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        L1ToL2MessageExists.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // msgHashOffset
        ...Buffer.from('4567', 'hex'), // msgLeafIndexOffset
        ...Buffer.from('CDEF', 'hex'), // existsOffset
      ]);
      const inst = new L1ToL2MessageExists(
        /*indirect=*/ 0x01,
        /*msgHashOffset=*/ 0x1234,
        /*msgLeafIndexOffset=*/ 0x4567,
        /*existsOffset=*/ 0xcdef,
      );

      expect(L1ToL2MessageExists.fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    // Will check existence at leafIndex, but nothing may be found there and/or something may be found at mockAtLeafIndex
    describe.each([
      [/*mockAtLeafIndex=*/ undefined], // doesn't exist at all
      [/*mockAtLeafIndex=*/ leafIndex], // should be found!
      [/*mockAtLeafIndex=*/ leafIndex.add(Fr.ONE)], // won't be found! (checking leafIndex+1, but it exists at leafIndex)
    ])('L1ToL2 message checks', (mockAtLeafIndex?: Fr) => {
      const expectFound = mockAtLeafIndex !== undefined && mockAtLeafIndex.equals(leafIndex);
      const existsElsewhere = mockAtLeafIndex !== undefined && !mockAtLeafIndex.equals(leafIndex);
      const existsStr = expectFound ? 'DOES exist' : 'does NOT exist';
      const foundAtStr = existsElsewhere
        ? `at leafIndex=${mockAtLeafIndex.toNumber()} (exists at leafIndex=${leafIndex.toNumber()})`
        : '';

      it(`Should return ${expectFound} (and be traced) when noteHash ${existsStr} ${foundAtStr}`, async () => {
        if (mockAtLeafIndex !== undefined) {
          mockL1ToL2MessageExists(treesDB, mockAtLeafIndex, value0, /*valueAtOtherIndices=*/ value1);
        }

        context.machineState.memory.set(value0Offset, new Field(value0)); // noteHash
        context.machineState.memory.set(leafIndexOffset, new Field(leafIndex));
        await new L1ToL2MessageExists(
          /*indirect=*/ 0,
          /*msgHashOffset=*/ value0Offset,
          leafIndexOffset,
          existsOffset,
        ).execute(context);

        const gotExists = context.machineState.memory.getAs<Uint8>(existsOffset);
        expect(gotExists).toEqual(new Uint8(expectFound ? 1 : 0));
      });
    });
  });

  describe('EmitUnencryptedLog', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        EmitUnencryptedLog.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // log offset
        ...Buffer.from('a234', 'hex'), // length offset
      ]);
      const inst = new EmitUnencryptedLog(/*indirect=*/ 0x01, /*offset=*/ 0x1234, /*lengthOffset=*/ 0xa234);

      expect(EmitUnencryptedLog.fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should append public logs correctly', async () => {
      const startOffset = 0;
      const logSizeOffset = 20;

      const values = [new Fr(69n), new Fr(420n), new Fr(Fr.MODULUS - 1n)];
      context.machineState.memory.setSlice(
        startOffset,
        values.map(f => new Field(f)),
      );
      context.machineState.memory.set(logSizeOffset, new Uint32(values.length));

      await new EmitUnencryptedLog(/*indirect=*/ 0, /*offset=*/ startOffset, logSizeOffset).execute(context);

      expect(trace.tracePublicLog).toHaveBeenCalledTimes(1);
      expect(trace.tracePublicLog).toHaveBeenCalledWith(address, values);
    });

    it('Should charge dynamic gas', async () => {
      const startOffset = 0;
      const logSizeOffset = 20;

      const values = [new Fr(69n), new Fr(420n), new Fr(Fr.MODULUS - 1n)];
      context.machineState.memory.setSlice(
        startOffset,
        values.map(f => new Field(f)),
      );
      context.machineState.memory.set(logSizeOffset, new Uint32(values.length));

      const l2GasBefore = context.machineState.l2GasLeft;
      const daGasBefore = context.machineState.daGasLeft;
      await new EmitUnencryptedLog(/*indirect=*/ 0, /*offset=*/ startOffset, logSizeOffset).execute(context);

      expect(context.machineState.l2GasLeft).toEqual(l2GasBefore - AVM_EMITUNENCRYPTEDLOG_BASE_L2_GAS);
      expect(context.machineState.daGasLeft).toEqual(daGasBefore - AVM_EMITUNENCRYPTEDLOG_DYN_DA_GAS * values.length);
    });
  });

  describe('SendL2ToL1Message', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        SendL2ToL1Message.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // recipientOffset
        ...Buffer.from('a234', 'hex'), // contentOffset
      ]);
      const inst = new SendL2ToL1Message(/*indirect=*/ 0x01, /*recipientOffset=*/ 0x1234, /*contentOffset=*/ 0xa234);

      expect(SendL2ToL1Message.fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should append l2 to l1 message correctly', async () => {
      // recipient: value0
      // content: value1
      context.machineState.memory.set(value0Offset, new Field(value0));
      context.machineState.memory.set(value1Offset, new Field(value1));
      await new SendL2ToL1Message(
        /*indirect=*/ 0,
        /*recipientOffset=*/ value0Offset,
        /*contentOffset=*/ value1Offset,
      ).execute(context);
      expect(trace.traceNewL2ToL1Message).toHaveBeenCalledTimes(1);
      expect(trace.traceNewL2ToL1Message).toHaveBeenCalledWith(address, /*recipient=*/ value0, /*content=*/ value1);
    });
  });

  it('All substate emission instructions should fail within a static call', async () => {
    context = initContext({ env: initExecutionEnvironment({ isStaticCall: true }) });
    context.machineState.memory.set(0, new Field(2020n));

    const instructions = [
      new EmitNoteHash(/*indirect=*/ 0, /*offset=*/ 0),
      new EmitNullifier(/*indirect=*/ 0, /*offset=*/ 0),
      new EmitUnencryptedLog(/*indirect=*/ 0, /*offset=*/ 0, /*logSizeOffset=*/ 0),
      new SendL2ToL1Message(/*indirect=*/ 0, /*recipientOffset=*/ 0, /*contentOffset=*/ 1),
    ];

    for (const instruction of instructions) {
      await expect(instruction.execute(context)).rejects.toThrow(StaticCallAlterationError);
    }
  });
});
