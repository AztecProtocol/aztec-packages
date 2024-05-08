import { Fr } from '@aztec/foundation/fields';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import { type CommitmentsDB, type PublicContractsDB, type PublicStateDB } from '../../index.js';
import { markBytecodeAsAvm } from '../../public/transitional_adaptors.js';
import { type AvmContext } from '../avm_context.js';
import { Field, Uint8, Uint32 } from '../avm_memory_types.js';
import { adjustCalldataIndex, initContext } from '../fixtures/index.js';
import { HostStorage } from '../journal/host_storage.js';
import { AvmPersistableStateManager } from '../journal/journal.js';
import { encodeToBytecode } from '../serialization/bytecode_serialization.js';
import { Call, Return, Revert, StaticCall } from './external_calls.js';
import { type Instruction } from './instruction.js';
import { CalldataCopy } from './memory.js';
import { SStore } from './storage.js';

describe('External Calls', () => {
  let context: AvmContext;

  beforeEach(() => {
    const contractsDb = mock<PublicContractsDB>();
    const commitmentsDb = mock<CommitmentsDB>();
    const publicStateDb = mock<PublicStateDB>();
    const hostStorage = new HostStorage(publicStateDb, contractsDb, commitmentsDb);
    const journal = new AvmPersistableStateManager(hostStorage);
    context = initContext({ persistableState: journal });
  });

  describe('Call', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Call.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('12345678', 'hex'), // gasOffset
        ...Buffer.from('a2345678', 'hex'), // addrOffset
        ...Buffer.from('b2345678', 'hex'), // argsOffset
        ...Buffer.from('c2345678', 'hex'), // argsSizeOffset
        ...Buffer.from('d2345678', 'hex'), // retOffset
        ...Buffer.from('e2345678', 'hex'), // retSize
        ...Buffer.from('f2345678', 'hex'), // successOffset
        ...Buffer.from('f3345678', 'hex'), // temporaryFunctionSelectorOffset
      ]);
      const inst = new Call(
        /*indirect=*/ 0x01,
        /*gasOffset=*/ 0x12345678,
        /*addrOffset=*/ 0xa2345678,
        /*argsOffset=*/ 0xb2345678,
        /*argsSizeOffset=*/ 0xc2345678,
        /*retOffset=*/ 0xd2345678,
        /*retSize=*/ 0xe2345678,
        /*successOffset=*/ 0xf2345678,
        /*temporaryFunctionSelectorOffset=*/ 0xf3345678,
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
      const args = [new Field(1n), new Field(2n), new Field(3n)];
      const argsSize = args.length;
      const argsSizeOffset = 20;
      const retOffset = 7;
      const retSize = 2;
      const successOffset = 6;

      // const otherContextInstructionsL2GasCost = 780; // Includes the cost of the call itself
      const otherContextInstructionsBytecode = markBytecodeAsAvm(
        encodeToBytecode([
          new CalldataCopy(
            /*indirect=*/ 0,
            /*csOffset=*/ adjustCalldataIndex(0),
            /*copySize=*/ argsSize,
            /*dstOffset=*/ 0,
          ),
          new SStore(/*indirect=*/ 0, /*srcOffset=*/ 0, /*size=*/ 1, /*slotOffset=*/ 0),
          new Return(/*indirect=*/ 0, /*retOffset=*/ 0, /*size=*/ 2),
        ]),
      );

      // const {  l2GasLeft: initialL2Gas, daGasLeft: initialDaGas } = context.machineState;
      const { daGasLeft: initialDaGas } = context.machineState;

      context.machineState.memory.set(0, new Field(l2Gas));
      context.machineState.memory.set(1, new Field(daGas));
      context.machineState.memory.set(2, new Field(addr));
      context.machineState.memory.set(argsSizeOffset, new Uint32(argsSize));
      context.machineState.memory.setSlice(3, args);
      jest
        .spyOn(context.persistableState.hostStorage.contractsDb, 'getBytecode')
        .mockReturnValue(Promise.resolve(otherContextInstructionsBytecode));

      const instruction = new Call(
        /*indirect=*/ 0,
        gasOffset,
        addrOffset,
        argsOffset,
        argsSizeOffset,
        retOffset,
        retSize,
        successOffset,
        /*temporaryFunctionSelectorOffset=*/ 0,
      );
      await instruction.execute(context);

      const successValue = context.machineState.memory.get(successOffset);
      expect(successValue).toEqual(new Uint8(1n));

      const retValue = context.machineState.memory.getSlice(retOffset, retSize);
      expect(retValue).toEqual([new Field(1n), new Field(2n)]);

      // Check that the storage call has been merged into the parent journal
      const { currentStorageValue } = context.persistableState.flush();
      expect(currentStorageValue.size).toEqual(1);

      const nestedContractWrites = currentStorageValue.get(addr.toBigInt());
      expect(nestedContractWrites).toBeDefined();

      const slotNumber = 1n;
      const expectedStoredValue = new Fr(1n);
      expect(nestedContractWrites!.get(slotNumber)).toEqual(expectedStoredValue);

      // TODO(https://github.com/AztecProtocol/aztec-packages/issues/5625): gas not plumbed through correctly in nested calls.
      // expect(context.machineState.l2GasLeft).toEqual(initialL2Gas - otherContextInstructionsL2GasCost);
      expect(context.machineState.daGasLeft).toEqual(initialDaGas);
    });

    it('Should refuse to execute a call if not enough gas', async () => {
      const gasOffset = 0;
      const l2Gas = 1e9;
      const daGas = 3e6;
      const addrOffset = 2;
      const addr = new Fr(123456n);
      const argsOffset = 3;
      const args = [new Field(1n), new Field(2n), new Field(3n)];
      const argsSize = args.length;
      const argsSizeOffset = 20;
      const retOffset = 7;
      const retSize = 2;
      const successOffset = 6;

      context.machineState.memory.set(0, new Field(l2Gas));
      context.machineState.memory.set(1, new Field(daGas));
      context.machineState.memory.set(2, new Field(addr));
      context.machineState.memory.set(argsSizeOffset, new Uint32(argsSize));
      context.machineState.memory.setSlice(3, args);

      jest
        .spyOn(context.persistableState.hostStorage.contractsDb, 'getBytecode')
        .mockRejectedValue(new Error('No bytecode expected to be requested since not enough gas'));

      const instruction = new Call(
        /*indirect=*/ 0,
        gasOffset,
        addrOffset,
        argsOffset,
        argsSizeOffset,
        retOffset,
        retSize,
        successOffset,
        /*temporaryFunctionSelectorOffset=*/ 0,
      );

      await expect(() => instruction.execute(context)).rejects.toThrow(/Not enough.*gas left/i);
    });
  });

  describe('Static Call', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        StaticCall.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('12345678', 'hex'), // gasOffset
        ...Buffer.from('a2345678', 'hex'), // addrOffset
        ...Buffer.from('b2345678', 'hex'), // argsOffset
        ...Buffer.from('c2345678', 'hex'), // argsSizeOffset
        ...Buffer.from('d2345678', 'hex'), // retOffset
        ...Buffer.from('e2345678', 'hex'), // retSize
        ...Buffer.from('f2345678', 'hex'), // successOffset
        ...Buffer.from('f3345678', 'hex'), // temporaryFunctionSelectorOffset
      ]);
      const inst = new StaticCall(
        /*indirect=*/ 0x01,
        /*gasOffset=*/ 0x12345678,
        /*addrOffset=*/ 0xa2345678,
        /*argsOffset=*/ 0xb2345678,
        /*argsSizeOffset=*/ 0xc2345678,
        /*retOffset=*/ 0xd2345678,
        /*retSize=*/ 0xe2345678,
        /*successOffset=*/ 0xf2345678,
        /*temporaryFunctionSelectorOffset=*/ 0xf3345678,
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
        new SStore(/*indirect=*/ 0, /*srcOffset=*/ 0, /*size=*/ 0, /*slotOffset=*/ 0),
      ];

      const otherContextInstructionsBytecode = markBytecodeAsAvm(encodeToBytecode(otherContextInstructions));

      jest
        .spyOn(context.persistableState.hostStorage.contractsDb, 'getBytecode')
        .mockReturnValue(Promise.resolve(otherContextInstructionsBytecode));

      const instruction = new StaticCall(
        /*indirect=*/ 0,
        gasOffset,
        addrOffset,
        argsOffset,
        argsSizeOffset,
        retOffset,
        retSize,
        successOffset,
        /*temporaryFunctionSelectorOffset=*/ 0,
      );
      await expect(() => instruction.execute(context)).rejects.toThrow(/Static calls cannot alter storage/);
    });
  });

  describe('RETURN', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Return.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('12345678', 'hex'), // returnOffset
        ...Buffer.from('a2345678', 'hex'), // copySize
      ]);
      const inst = new Return(/*indirect=*/ 0x01, /*returnOffset=*/ 0x12345678, /*copySize=*/ 0xa2345678);

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

      expect(context.machineState.halted).toBe(true);
      expect(context.machineState.getResults()).toEqual({
        reverted: false,
        output: returnData,
      });
    });
  });

  describe('REVERT', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Revert.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('12345678', 'hex'), // returnOffset
        ...Buffer.from('a2345678', 'hex'), // retSize
      ]);
      const inst = new Revert(/*indirect=*/ 0x01, /*returnOffset=*/ 0x12345678, /*retSize=*/ 0xa2345678);

      expect(Revert.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Should return data and revert from the revert opcode', async () => {
      const returnData = [...'assert message'].flatMap(c => new Field(c.charCodeAt(0)));
      returnData.unshift(new Field(0n)); // Prepend an error selector

      context.machineState.memory.setSlice(0, returnData);

      const instruction = new Revert(/*indirect=*/ 0, /*returnOffset=*/ 0, returnData.length);
      await instruction.execute(context);

      expect(context.machineState.halted).toBe(true);
      expect(context.machineState.getResults()).toEqual({
        reverted: true,
        revertReason: new Error('Assertion failed: assert message'),
        output: returnData.map(f => f.toFr()),
      });
    });
  });
});
