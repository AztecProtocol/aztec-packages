import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type AvmContext } from '../avm_context.js';
import { Field } from '../avm_memory_types.js';
import { StaticCallAlterationError } from '../errors.js';
import { initContext, initExecutionEnvironment } from '../fixtures/index.js';
import { type AvmPersistableStateManager } from '../journal/journal.js';
import { SLoad, SStore } from './storage.js';

describe('Storage Instructions', () => {
  let context: AvmContext;
  let persistableState: MockProxy<AvmPersistableStateManager>;
  const address = AztecAddress.random();

  beforeEach(async () => {
    persistableState = mock<AvmPersistableStateManager>();
    context = initContext({
      persistableState: persistableState,
      env: initExecutionEnvironment({ address }),
    });
  });

  describe('SSTORE', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        SStore.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // srcOffset
        ...Buffer.from('3456', 'hex'), // slotOffset
      ]);
      const inst = new SStore(/*indirect=*/ 0x01, /*srcOffset=*/ 0x1234, /*slotOffset=*/ 0x3456);

      expect(SStore.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Sstore should Write into storage', async () => {
      const a = new Field(1n);
      const b = new Field(2n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await new SStore(/*indirect=*/ 0, /*srcOffset=*/ 1, /*slotOffset=*/ 0).execute(context);

      expect(persistableState.writeStorage).toHaveBeenCalledWith(address, new Fr(a.toBigInt()), new Fr(b.toBigInt()));
    });

    it('Should not be able to write to storage in a static call', async () => {
      context = initContext({
        persistableState: persistableState,
        env: initExecutionEnvironment({ address, isStaticCall: true }),
      });

      const a = new Field(1n);
      const b = new Field(2n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      const instruction = () => new SStore(/*indirect=*/ 0, /*srcOffset=*/ 0, /*slotOffset=*/ 1).execute(context);
      await expect(instruction()).rejects.toThrow(StaticCallAlterationError);
    });
  });

  describe('SLOAD', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        SLoad.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // slotOffset
        ...Buffer.from('3456', 'hex'), // dstOffset
      ]);
      const inst = new SLoad(/*indirect=*/ 0x01, /*slotOffset=*/ 0x1234, /*dstOffset=*/ 0x3456);

      expect(SLoad.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Sload should Read into storage', async () => {
      // Mock response
      const expectedResult = new Fr(1n);
      persistableState.readStorage.mockResolvedValueOnce(expectedResult);

      const a = new Field(1n);
      const b = new Field(2n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await new SLoad(/*indirect=*/ 0, /*slotOffset=*/ 0, /*dstOffset=*/ 1).execute(context);

      expect(persistableState.readStorage).toHaveBeenCalledWith(address, new Fr(a.toBigInt()));

      const actual = context.machineState.memory.get(1);
      expect(actual).toEqual(new Field(expectedResult));
    });
  });
});
