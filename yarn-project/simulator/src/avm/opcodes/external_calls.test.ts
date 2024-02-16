import { Fr } from '@aztec/foundation/fields';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import { CommitmentsDB, NullifiersDB, PublicContractsDB, PublicStateDB } from '../../index.js';
import { AvmContext } from '../avm_context.js';
import { Field } from '../avm_memory_types.js';
import { initContext } from '../fixtures/index.js';
import { HostAztecState } from '../journal/host_storage.js';
import { AvmPersistableState } from '../journal/journal.js';
import { encodeToBytecode } from '../serialization/bytecode_serialization.js';
import { Return } from './control_flow.js';
import { Call, StaticCall } from './external_calls.js';
import { Instruction } from './instruction.js';
import { CalldataCopy } from './memory.js';
import { SStore } from './storage.js';

describe('External Calls', () => {
  let hostStorage: HostAztecState;
  let context: AvmContext;

  beforeEach(() => {
    const publicStateDb = mock<PublicStateDB>();
    const contractsDb = mock<PublicContractsDB>();
    const commitmentsDb = mock<CommitmentsDB>();
    const nullifiersDb = mock<NullifiersDB>();
    hostStorage = new HostAztecState(publicStateDb, contractsDb, commitmentsDb, nullifiersDb);
    const journal = new AvmPersistableState(hostStorage);
    context = initContext({ worldState: journal });
  });

  describe('Call', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Call.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('12345678', 'hex'), // gasOffset
        ...Buffer.from('a2345678', 'hex'), // addrOffset
        ...Buffer.from('b2345678', 'hex'), // argsOffset
        ...Buffer.from('c2345678', 'hex'), // argsSize
        ...Buffer.from('d2345678', 'hex'), // retOffset
        ...Buffer.from('e2345678', 'hex'), // retSize
        ...Buffer.from('f2345678', 'hex'), // successOffset
      ]);
      const inst = new Call(
        /*indirect=*/ 0x01,
        /*gasOffset=*/ 0x12345678,
        /*addrOffset=*/ 0xa2345678,
        /*argsOffset=*/ 0xb2345678,
        /*argsSize=*/ 0xc2345678,
        /*retOffset=*/ 0xd2345678,
        /*retSize=*/ 0xe2345678,
        /*successOffset=*/ 0xf2345678,
      );

      expect(Call.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/3992): gas not implemented
    it('Should execute a call correctly', async () => {
      const gasOffset = 0;
      const gas = Fr.zero();
      const addrOffset = 1;
      const addr = new Fr(123456n);
      const argsOffset = 2;
      const args = [new Field(1n), new Field(2n), new Field(3n)];
      const argsSize = args.length;
      const retOffset = 8;
      const retSize = 2;
      const successOffset = 7;
      // copy all args to memory
      // sstore: S[args[0]] = args[0] (S[1] = 1)
      // return args[0:1]
      const otherContextInstructionsBytecode = encodeToBytecode([
        new CalldataCopy(/*indirect=*/ 0, /*csOffset=*/ 0, /*copySize=*/ argsSize, /*dstOffset=*/ 0),
        new SStore(/*indirect=*/ 0, /*srcOffset=*/ 0, /*slotOffset=*/ 0),
        new Return(/*indirect=*/ 0, /*retOffset=*/ 0, /*size=*/ 2),
      ]);

      context.machineState.memory.set(0, new Field(gas));
      context.machineState.memory.set(1, new Field(addr));
      context.machineState.memory.setSlice(2, args);
      jest
        .spyOn(hostStorage.contractsDb, 'getBytecode')
        .mockReturnValue(Promise.resolve(otherContextInstructionsBytecode));

      const instruction = new Call(
        /*indirect=*/ 0,
        gasOffset,
        addrOffset,
        argsOffset,
        argsSize,
        retOffset,
        retSize,
        successOffset,
      );
      await instruction.execute(context);

      const successValue = context.machineState.memory.get(successOffset);
      expect(successValue).toEqual(new Field(1n));

      const retValue = context.machineState.memory.getSlice(retOffset, retSize);
      expect(retValue).toEqual([new Field(1n), new Field(2n)]);

      // Check that the storage call has been merged into the parent journal
      const { publicStorageWrites } = context.worldState.getWorldStateAccessTrace();
      expect(publicStorageWrites.length).toEqual(1);
      expect(publicStorageWrites[0].value).toEqual(new Fr(1n));

      const slot = new Fr(1);
      const expectVal = new Fr(1);
      const readStorageVal = await context.worldState.readPublicStorage(/*callPointer=*/Fr.ZERO, addr, new Fr(slot));
      expect(readStorageVal).toEqual(expectVal);
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
        ...Buffer.from('c2345678', 'hex'), // argsSize
        ...Buffer.from('d2345678', 'hex'), // retOffset
        ...Buffer.from('e2345678', 'hex'), // retSize
        ...Buffer.from('f2345678', 'hex'), // successOffset
      ]);
      const inst = new StaticCall(
        /*indirect=*/ 0x01,
        /*gasOffset=*/ 0x12345678,
        /*addrOffset=*/ 0xa2345678,
        /*argsOffset=*/ 0xb2345678,
        /*argsSize=*/ 0xc2345678,
        /*retOffset=*/ 0xd2345678,
        /*retSize=*/ 0xe2345678,
        /*successOffset=*/ 0xf2345678,
      );

      expect(StaticCall.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Should fail if a static call attempts to touch storage', async () => {
      const gasOffset = 0;
      const gas = new Field(0);
      const addrOffset = 1;
      const addr = new Field(123456n);
      const argsOffset = 2;
      const args = [new Field(1n), new Field(2n), new Field(3n)];

      const argsSize = args.length;
      const retOffset = 8;
      const retSize = 2;
      const successOffset = 7;

      context.machineState.memory.set(0, gas);
      context.machineState.memory.set(1, addr);
      context.machineState.memory.setSlice(2, args);

      const otherContextInstructions: Instruction[] = [
        new CalldataCopy(/*indirect=*/ 0, /*csOffset=*/ 0, /*copySize=*/ argsSize, /*dstOffset=*/ 0),
        new SStore(/*indirect=*/ 0, /*srcOffset=*/ 1, /*slotOffset=*/ 0),
      ];

      const otherContextInstructionsBytecode = encodeToBytecode(otherContextInstructions);

      jest
        .spyOn(hostStorage.contractsDb, 'getBytecode')
        .mockReturnValue(Promise.resolve(otherContextInstructionsBytecode));

      const instruction = new StaticCall(
        /*indirect=*/ 0,
        gasOffset,
        addrOffset,
        argsOffset,
        argsSize,
        retOffset,
        retSize,
        successOffset,
      );
      await instruction.execute(context);

      // No revert has occurred, but the nested execution has failed
      const successValue = context.machineState.memory.get(successOffset);
      expect(successValue).toEqual(new Field(0n));
    });
  });
});
