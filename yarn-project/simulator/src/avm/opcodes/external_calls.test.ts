import { FunctionSelector } from '@aztec/circuits.js';
import { makeContractClassPublic, makeContractInstanceFromClassId } from '@aztec/circuits.js/testing';
import { Fr } from '@aztec/foundation/fields';

import { mock } from 'jest-mock-extended';

import { type WorldStateDB } from '../../public/public_db_sources.js';
import { type PublicSideEffectTraceInterface } from '../../public/side_effect_trace_interface.js';
import { type AvmContext } from '../avm_context.js';
import { Field, TypeTag, Uint1, Uint32 } from '../avm_memory_types.js';
import { markBytecodeAsAvm } from '../bytecode_utils.js';
import { initContext, initPersistableStateManager } from '../fixtures/index.js';
import { type AvmPersistableStateManager } from '../journal/journal.js';
import { encodeToBytecode } from '../serialization/bytecode_serialization.js';
import { Opcode } from '../serialization/instruction_serialization.js';
import { mockGetBytecode, mockGetContractClass, mockGetContractInstance, mockTraceFork } from '../test_utils.js';
import { EnvironmentVariable, GetEnvVar } from './environment_getters.js';
import { Call, Return, Revert, StaticCall } from './external_calls.js';
import { type Instruction } from './instruction.js';
import { CalldataCopy, Set } from './memory.js';
import { SStore } from './storage.js';

describe('External Calls', () => {
  let context: AvmContext;
  let worldStateDB: WorldStateDB;
  let trace: PublicSideEffectTraceInterface;
  let persistableState: AvmPersistableStateManager;

  beforeEach(() => {
    worldStateDB = mock<WorldStateDB>();
    trace = mock<PublicSideEffectTraceInterface>();
    persistableState = initPersistableStateManager({ worldStateDB, trace });
    context = initContext({ persistableState });
    mockTraceFork(trace); // make sure trace.fork() works on nested call
  });

  describe('Call', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Call.opcode, // opcode
        ...Buffer.from('1234', 'hex'), // indirect (16 bit)
        ...Buffer.from('1234', 'hex'), // gasOffset
        ...Buffer.from('a234', 'hex'), // addrOffset
        ...Buffer.from('b234', 'hex'), // argsOffset
        ...Buffer.from('c234', 'hex'), // argsSizeOffset
        ...Buffer.from('f234', 'hex'), // successOffset
      ]);
      const inst = new Call(
        /*indirect=*/ 0x1234,
        /*gasOffset=*/ 0x1234,
        /*addrOffset=*/ 0xa234,
        /*argsOffset=*/ 0xb234,
        /*argsSizeOffset=*/ 0xc234,
        /*successOffset=*/ 0xf234,
      );

      expect(Call.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Call to non-existent bytecode returns failure', async () => {
      const gasOffset = 0;
      const l2Gas = 2e6;
      const daGas = 3e6;
      const addrOffset = 2;
      const addr = new Fr(123456n);
      const argsOffset = 3;
      const args = [new Field(1), new Field(2), new Field(3)];
      const argsSize = args.length;
      const argsSizeOffset = 20;
      const successOffset = 6;

      const { l2GasLeft: initialL2Gas, daGasLeft: initialDaGas } = context.machineState;

      context.machineState.memory.set(0, new Field(l2Gas));
      context.machineState.memory.set(1, new Field(daGas));
      context.machineState.memory.set(2, new Field(addr));
      context.machineState.memory.set(argsSizeOffset, new Uint32(argsSize));
      context.machineState.memory.setSlice(3, args);

      const instruction = new Call(/*indirect=*/ 0, gasOffset, addrOffset, argsOffset, argsSizeOffset, successOffset);
      await instruction.execute(context);

      const successValue = context.machineState.memory.get(successOffset);
      expect(successValue).toEqual(new Uint1(0n)); // failure, contract non-existent!

      const retValue = context.machineState.nestedReturndata;
      expect(retValue).toEqual([]);

      // should charge for the CALL instruction itself, and all allocated gas should be consumed
      expect(context.machineState.l2GasLeft).toBeLessThan(initialL2Gas - l2Gas);
      expect(context.machineState.daGasLeft).toEqual(initialDaGas - daGas);
      expect(context.machineState.collectedRevertInfo?.recursiveRevertReason?.message).toMatch(/No bytecode found/);
    });

    it('Should execute a call correctly', async () => {
      const gasOffset = 0;
      const l2Gas = 2e6;
      const daGas = 3e6;
      const addrOffset = 2;
      const addr = new Fr(123456n);
      const argsOffset = 3;
      const args = [new Field(1), new Field(2), new Field(3)];
      const argsSize = args.length;
      const argsSizeOffset = 20;
      const successOffset = 6;

      const otherContextInstructionsBytecode = markBytecodeAsAvm(
        encodeToBytecode([
          new Set(/*indirect=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT32, 0).as(Opcode.SET_8, Set.wireFormat8),
          new Set(/*indirect=*/ 0, /*dstOffset=*/ 1, TypeTag.UINT32, argsSize).as(Opcode.SET_8, Set.wireFormat8),
          new Set(/*indirect=*/ 0, /*dstOffset=*/ 2, TypeTag.UINT32, 2).as(Opcode.SET_8, Set.wireFormat8),
          new CalldataCopy(/*indirect=*/ 0, /*csOffsetAddress=*/ 0, /*copySizeOffset=*/ 1, /*dstOffset=*/ 3),
          new Return(/*indirect=*/ 0, /*retOffset=*/ 3, /*sizeOffset=*/ 2),
        ]),
      );
      mockGetBytecode(worldStateDB, otherContextInstructionsBytecode);

      const contractClass = makeContractClassPublic(0, {
        bytecode: otherContextInstructionsBytecode,
        selector: FunctionSelector.random(),
      });
      mockGetContractClass(worldStateDB, contractClass);
      const contractInstance = makeContractInstanceFromClassId(contractClass.id);
      mockGetContractInstance(worldStateDB, contractInstance);

      const { l2GasLeft: initialL2Gas, daGasLeft: initialDaGas } = context.machineState;

      context.machineState.memory.set(0, new Field(l2Gas));
      context.machineState.memory.set(1, new Field(daGas));
      context.machineState.memory.set(2, new Field(addr));
      context.machineState.memory.set(argsSizeOffset, new Uint32(argsSize));
      context.machineState.memory.setSlice(3, args);

      const instruction = new Call(/*indirect=*/ 0, gasOffset, addrOffset, argsOffset, argsSizeOffset, successOffset);
      await instruction.execute(context);

      const successValue = context.machineState.memory.get(successOffset);
      expect(successValue).toEqual(new Uint1(1n));

      const retValue = context.machineState.nestedReturndata;
      expect(retValue).toEqual([new Fr(1n), new Fr(2n)]);

      expect(context.machineState.l2GasLeft).toBeLessThan(initialL2Gas);
      expect(context.machineState.daGasLeft).toBeLessThanOrEqual(initialDaGas);
    });

    it('Should cap to available gas if allocated is bigger', async () => {
      const gasOffset = 0;
      const l2Gas = 1e9;
      const daGas = 1e9;
      const addrOffset = 2;
      const addr = new Fr(123456n);
      const argsSize = 0;
      const argsSizeOffset = 20;
      const successOffset = 6;

      const otherContextInstructionsBytecode = markBytecodeAsAvm(
        encodeToBytecode([
          new GetEnvVar(/*indirect=*/ 0, /*dstOffset=*/ 0, /*envVar=*/ EnvironmentVariable.L2GASLEFT).as(
            Opcode.GETENVVAR_16,
            GetEnvVar.wireFormat16,
          ),
          new Set(/*indirect=*/ 0, /*dstOffset=*/ 1, TypeTag.UINT32, 1).as(Opcode.SET_8, Set.wireFormat8),
          new Return(/*indirect=*/ 0, /*retOffset=*/ 0, /*size=*/ 1),
        ]),
      );
      mockGetBytecode(worldStateDB, otherContextInstructionsBytecode);

      const contractClass = makeContractClassPublic(0, {
        bytecode: otherContextInstructionsBytecode,
        selector: FunctionSelector.random(),
      });
      mockGetContractClass(worldStateDB, contractClass);
      const contractInstance = makeContractInstanceFromClassId(contractClass.id);
      mockGetContractInstance(worldStateDB, contractInstance);

      const { l2GasLeft: initialL2Gas, daGasLeft: initialDaGas } = context.machineState;

      context.machineState.memory.set(0, new Field(l2Gas));
      context.machineState.memory.set(1, new Field(daGas));
      context.machineState.memory.set(2, new Field(addr));
      context.machineState.memory.set(argsSizeOffset, new Uint32(argsSize));

      const instruction = new Call(
        /*indirect=*/ 0,
        gasOffset,
        addrOffset,
        /*argsOffset=*/ 0,
        argsSizeOffset,
        successOffset,
      );
      await instruction.execute(context);

      const successValue = context.machineState.memory.get(successOffset);
      expect(successValue).toEqual(new Uint1(1n));

      const retValues = context.machineState.nestedReturndata;
      expect(retValues).toHaveLength(1);
      expect(retValues[0].toBigInt()).toBeLessThan(initialL2Gas);

      expect(context.machineState.l2GasLeft).toBeLessThan(initialL2Gas);
      expect(context.machineState.daGasLeft).toBeLessThanOrEqual(initialDaGas);
    });
  });

  describe('Static Call', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        StaticCall.opcode, // opcode
        ...Buffer.from('1234', 'hex'), // indirect (16 bit)
        ...Buffer.from('1234', 'hex'), // gasOffset
        ...Buffer.from('a234', 'hex'), // addrOffset
        ...Buffer.from('b234', 'hex'), // argsOffset
        ...Buffer.from('c234', 'hex'), // argsSizeOffset
        ...Buffer.from('f234', 'hex'), // successOffset
      ]);
      const inst = new StaticCall(
        /*indirect=*/ 0x1234,
        /*gasOffset=*/ 0x1234,
        /*addrOffset=*/ 0xa234,
        /*argsOffset=*/ 0xb234,
        /*argsSizeOffset=*/ 0xc234,
        /*successOffset=*/ 0xf234,
      );

      expect(StaticCall.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Should fail if a static call attempts to touch storage', async () => {
      const gasOffset = 0;
      const gas = [new Field(0n), new Field(0n), new Field(0n)];
      const addrOffset = 10;
      const addr = new Field(123456n);
      const argsOffset = 20;
      const args = [new Field(1n), new Field(2n), new Field(3n)];

      const argsSize = args.length;
      const argsSizeOffset = 40;
      const successOffset = 70;

      context.machineState.memory.setSlice(gasOffset, gas);
      context.machineState.memory.set(addrOffset, addr);
      context.machineState.memory.set(argsSizeOffset, new Uint32(argsSize));
      context.machineState.memory.setSlice(argsOffset, args);

      const otherContextInstructions: Instruction[] = [
        new SStore(/*indirect=*/ 0, /*srcOffset=*/ 0, /*slotOffset=*/ 0),
      ];

      const otherContextInstructionsBytecode = markBytecodeAsAvm(encodeToBytecode(otherContextInstructions));
      mockGetBytecode(worldStateDB, otherContextInstructionsBytecode);

      const contractClass = makeContractClassPublic(0, {
        bytecode: otherContextInstructionsBytecode,
        selector: FunctionSelector.random(),
      });
      mockGetContractClass(worldStateDB, contractClass);
      const contractInstance = makeContractInstanceFromClassId(contractClass.id);
      mockGetContractInstance(worldStateDB, contractInstance);

      const instruction = new StaticCall(
        /*indirect=*/ 0,
        gasOffset,
        addrOffset,
        argsOffset,
        argsSizeOffset,
        successOffset,
      );
      await instruction.execute(context);
      // Ideally we'd mock the nested call.
      expect(context.machineState.collectedRevertInfo?.recursiveRevertReason.message).toMatch(
        'Static call cannot update the state, emit L2->L1 messages or generate logs',
      );
    });
  });

  describe('RETURN', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Return.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // returnOffset
        ...Buffer.from('a234', 'hex'), // copySize
      ]);
      const inst = new Return(/*indirect=*/ 0x01, /*returnOffset=*/ 0x1234, /*copySize=*/ 0xa234);

      expect(Return.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Should return data from the return opcode', async () => {
      const returnData = [new Fr(1n), new Fr(2n), new Fr(3n)];

      context.machineState.memory.set(0, new Field(1n));
      context.machineState.memory.set(1, new Field(2n));
      context.machineState.memory.set(2, new Field(3n));
      context.machineState.memory.set(3, new Uint32(returnData.length));

      const instruction = new Return(/*indirect=*/ 0, /*returnOffset=*/ 0, 3);
      await instruction.execute(context);

      expect(context.machineState.getHalted()).toBe(true);
      expect(context.machineState.getReverted()).toBe(false);
      expect(context.machineState.getOutput()).toEqual(returnData);
    });
  });

  describe('REVERT', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Opcode.REVERT_16, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // returnOffset
        ...Buffer.from('a234', 'hex'), // retSizeOffset
      ]);
      const inst = new Revert(/*indirect=*/ 0x01, /*returnOffset=*/ 0x1234, /*retSizeOffset=*/ 0xa234).as(
        Opcode.REVERT_16,
        Revert.wireFormat16,
      );

      expect(Revert.as(Revert.wireFormat16).deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Should return data and revert from the revert opcode', async () => {
      const returnData = [...'assert message'].flatMap(c => new Field(c.charCodeAt(0)));
      returnData.unshift(new Field(0n)); // Prepend an error selector

      context.machineState.memory.set(0, new Uint32(returnData.length));
      context.machineState.memory.setSlice(10, returnData);

      const instruction = new Revert(/*indirect=*/ 0, /*returnOffset=*/ 10, /*retSizeOffset=*/ 0);
      await instruction.execute(context);

      expect(context.machineState.getHalted()).toBe(true);
      expect(context.machineState.getReverted()).toBe(true);
      expect(context.machineState.getOutput()).toEqual(returnData.map(f => f.toFr()));
    });
  });
});
