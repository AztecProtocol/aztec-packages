import { FunctionSelector } from '@aztec/circuits.js';
import { makeContractClassPublic, makeContractInstanceFromClassId } from '@aztec/circuits.js/testing';
import { Fr } from '@aztec/foundation/fields';

import { mock } from 'jest-mock-extended';

import { type WorldStateDB } from '../../public/public_db_sources.js';
import { type PublicSideEffectTraceInterface } from '../../public/side_effect_trace_interface.js';
import { type AvmContext } from '../avm_context.js';
import { Field, TypeTag, Uint8, Uint32 } from '../avm_memory_types.js';
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
        ...Buffer.from('d234', 'hex'), // retOffset
        ...Buffer.from('e234', 'hex'), // retSize
        ...Buffer.from('f234', 'hex'), // successOffset
        ...Buffer.from('f334', 'hex'), // functionSelectorOffset
      ]);
      const inst = new Call(
        /*indirect=*/ 0x1234,
        /*gasOffset=*/ 0x1234,
        /*addrOffset=*/ 0xa234,
        /*argsOffset=*/ 0xb234,
        /*argsSizeOffset=*/ 0xc234,
        /*retOffset=*/ 0xd234,
        /*retSize=*/ 0xe234,
        /*successOffset=*/ 0xf234,
        /*functionSelectorOffset=*/ 0xf334,
      );

      expect(Call.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Should execute a call correctly', async () => {
      const gasOffset = 0;
      const l2Gas = 2e6;
      const daGas = 3e6;
      const addrOffset = 2;
      const addr = new Fr(123456n);
      const argsOffset = 3;
      const valueToStore = new Fr(42);
      const valueOffset = 0; // 0th entry in calldata to nested call
      const slot = new Fr(100);
      const slotOffset = 1; // 1st entry in calldata to nested call
      const args = [new Field(valueToStore), new Field(slot), new Field(3n)];
      const argsSize = args.length;
      const argsSizeOffset = 20;
      const retOffset = 7;
      const retSize = 2;
      const expectedRetValue = args.slice(0, retSize);
      const successOffset = 6;

      // const otherContextInstructionsL2GasCost = 780; // Includes the cost of the call itself
      const otherContextInstructionsBytecode = markBytecodeAsAvm(
        encodeToBytecode([
          new Set(/*indirect=*/ 0, TypeTag.UINT32, 0, /*dstOffset=*/ 0).as(Opcode.SET_8, Set.wireFormat8),
          new Set(/*indirect=*/ 0, TypeTag.UINT32, argsSize, /*dstOffset=*/ 1).as(Opcode.SET_8, Set.wireFormat8),
          new CalldataCopy(/*indirect=*/ 0, /*csOffsetAddress=*/ 0, /*copySizeOffset=*/ 1, /*dstOffset=*/ 0),
          new SStore(/*indirect=*/ 0, /*srcOffset=*/ valueOffset, /*slotOffset=*/ slotOffset),
          new Return(/*indirect=*/ 0, /*retOffset=*/ 0, /*size=*/ 2),
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

      const instruction = new Call(
        /*indirect=*/ 0,
        gasOffset,
        addrOffset,
        argsOffset,
        argsSizeOffset,
        retOffset,
        retSize,
        successOffset,
        /*functionSelectorOffset=*/ 0,
      );
      await instruction.execute(context);

      const successValue = context.machineState.memory.get(successOffset);
      expect(successValue).toEqual(new Uint8(1n));

      const retValue = context.machineState.memory.getSlice(retOffset, retSize);
      expect(retValue).toEqual(expectedRetValue);

      // Check that the storage call has been merged into the parent journal
      expect(await context.persistableState.peekStorage(addr, slot)).toEqual(valueToStore);

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
      const retOffset = 7;
      const retSize = 1;
      const successOffset = 6;

      const otherContextInstructionsBytecode = markBytecodeAsAvm(
        encodeToBytecode([
          new GetEnvVar(/*indirect=*/ 0, /*envVar=*/ EnvironmentVariable.L2GASLEFT, /*dstOffset=*/ 0).as(
            Opcode.GETENVVAR_16,
            GetEnvVar.wireFormat16,
          ),
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
        retOffset,
        retSize,
        successOffset,
        /*functionSelectorOffset=*/ 0,
      );
      await instruction.execute(context);

      const successValue = context.machineState.memory.get(successOffset);
      expect(successValue).toEqual(new Uint8(1n));

      const retValue = context.machineState.memory.get(retOffset).toBigInt();
      expect(retValue).toBeLessThan(initialL2Gas);

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
        ...Buffer.from('d234', 'hex'), // retOffset
        ...Buffer.from('e234', 'hex'), // retSize
        ...Buffer.from('f234', 'hex'), // successOffset
        ...Buffer.from('f334', 'hex'), // functionSelectorOffset
      ]);
      const inst = new StaticCall(
        /*indirect=*/ 0x1234,
        /*gasOffset=*/ 0x1234,
        /*addrOffset=*/ 0xa234,
        /*argsOffset=*/ 0xb234,
        /*argsSizeOffset=*/ 0xc234,
        /*retOffset=*/ 0xd234,
        /*retSize=*/ 0xe234,
        /*successOffset=*/ 0xf234,
        /*functionSelectorOffset=*/ 0xf334,
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
      const retOffset = 80;
      const retSize = 2;
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
        retOffset,
        retSize,
        successOffset,
        /*functionSelectorOffset=*/ 0,
      );
      await expect(() => instruction.execute(context)).rejects.toThrow(
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

      const instruction = new Return(/*indirect=*/ 0, /*returnOffset=*/ 0, returnData.length);
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
