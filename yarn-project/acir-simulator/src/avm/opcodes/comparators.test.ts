import { MockProxy, mock } from 'jest-mock-extended';

import { AvmMachineState } from '../avm_machine_state.js';
import { Field, TypeTag, Uint16, Uint32 } from '../avm_memory_types.js';
import { initExecutionEnvironment } from '../fixtures/index.js';
import { AvmJournal } from '../journal/journal.js';
import { Eq, Lt, Lte } from './comparators.js';
import { InstructionExecutionError } from './instruction.js';

describe('Comparators', () => {
  let machineState: AvmMachineState;
  let journal: MockProxy<AvmJournal>;

  beforeEach(async () => {
    machineState = new AvmMachineState(initExecutionEnvironment());
    journal = mock<AvmJournal>();
  });

  describe('Eq', () => {
    it('Works on integral types', async () => {
      machineState.memory.setSlice(0, [new Uint32(1), new Uint32(2), new Uint32(3), new Uint32(1)]);

      [
        new Eq(/*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 10, TypeTag.UINT32),
        new Eq(/*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 11, TypeTag.UINT32),
        new Eq(/*aOffset=*/ 0, /*bOffset=*/ 3, /*dstOffset=*/ 12, TypeTag.UINT32),
      ].forEach(i => i.execute(machineState, journal));

      const actual = machineState.memory.getSlice(/*offset=*/ 10, /*size=*/ 4);
      expect(actual).toEqual([new Uint32(0), new Uint32(0), new Uint32(1)]);
    });

    it('Works on field elements', async () => {
      machineState.memory.setSlice(0, [new Field(1), new Field(2), new Field(3), new Field(1)]);

      [
        new Eq(/*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 10, TypeTag.FIELD),
        new Eq(/*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 11, TypeTag.FIELD),
        new Eq(/*aOffset=*/ 0, /*bOffset=*/ 3, /*dstOffset=*/ 12, TypeTag.FIELD),
      ].forEach(i => i.execute(machineState, journal));

      const actual = machineState.memory.getSlice(/*offset=*/ 10, /*size=*/ 4);
      expect(actual).toEqual([new Field(0), new Field(0), new Field(1)]);
    });

    it('InTag is checked', async () => {
      machineState.memory.setSlice(0, [new Field(1), new Uint32(2), new Uint16(3)]);

      const ops = [
        new Eq(/*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 10, TypeTag.FIELD),
        new Eq(/*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 10, TypeTag.UINT32),
        new Eq(/*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 10, TypeTag.UINT16),
        new Eq(/*aOffset=*/ 1, /*bOffset=*/ 1, /*dstOffset=*/ 10, TypeTag.UINT16),
      ];

      for (const o of ops) {
        await expect(() => o.execute(machineState, journal)).rejects.toThrow(InstructionExecutionError);
      }
    });
  });

  describe('Lt', () => {
    it('Works on integral types', async () => {
      machineState.memory.setSlice(0, [new Uint32(1), new Uint32(2), new Uint32(0)]);

      [
        new Lt(/*aOffset=*/ 0, /*bOffset=*/ 0, /*dstOffset=*/ 10, TypeTag.UINT32),
        new Lt(/*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 11, TypeTag.UINT32),
        new Lt(/*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 12, TypeTag.UINT32),
      ].forEach(i => i.execute(machineState, journal));

      const actual = machineState.memory.getSlice(/*offset=*/ 10, /*size=*/ 4);
      expect(actual).toEqual([new Uint32(0), new Uint32(1), new Uint32(0)]);
    });

    it('Works on field elements', async () => {
      machineState.memory.setSlice(0, [new Field(1), new Field(2), new Field(0)]);

      [
        new Lt(/*aOffset=*/ 0, /*bOffset=*/ 0, /*dstOffset=*/ 10, TypeTag.FIELD),
        new Lt(/*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 11, TypeTag.FIELD),
        new Lt(/*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 12, TypeTag.FIELD),
      ].forEach(i => i.execute(machineState, journal));

      const actual = machineState.memory.getSlice(/*offset=*/ 10, /*size=*/ 4);
      expect(actual).toEqual([new Field(0), new Field(1), new Field(0)]);
    });

    it('InTag is checked', async () => {
      machineState.memory.setSlice(0, [new Field(1), new Uint32(2), new Uint16(3)]);

      const ops = [
        new Lt(/*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 10, TypeTag.FIELD),
        new Lt(/*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 10, TypeTag.UINT32),
        new Lt(/*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 10, TypeTag.UINT16),
        new Lt(/*aOffset=*/ 1, /*bOffset=*/ 1, /*dstOffset=*/ 10, TypeTag.UINT16),
      ];

      for (const o of ops) {
        await expect(() => o.execute(machineState, journal)).rejects.toThrow(InstructionExecutionError);
      }
    });
  });

  describe('Lte', () => {
    it('Works on integral types', async () => {
      machineState.memory.setSlice(0, [new Uint32(1), new Uint32(2), new Uint32(0)]);

      [
        new Lte(/*aOffset=*/ 0, /*bOffset=*/ 0, /*dstOffset=*/ 10, TypeTag.UINT32),
        new Lte(/*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 11, TypeTag.UINT32),
        new Lte(/*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 12, TypeTag.UINT32),
      ].forEach(i => i.execute(machineState, journal));

      const actual = machineState.memory.getSlice(/*offset=*/ 10, /*size=*/ 4);
      expect(actual).toEqual([new Uint32(1), new Uint32(1), new Uint32(0)]);
    });

    it('Works on field elements', async () => {
      machineState.memory.setSlice(0, [new Field(1), new Field(2), new Field(0)]);

      [
        new Lte(/*aOffset=*/ 0, /*bOffset=*/ 0, /*dstOffset=*/ 10, TypeTag.FIELD),
        new Lte(/*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 11, TypeTag.FIELD),
        new Lte(/*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 12, TypeTag.FIELD),
      ].forEach(i => i.execute(machineState, journal));

      const actual = machineState.memory.getSlice(/*offset=*/ 10, /*size=*/ 4);
      expect(actual).toEqual([new Field(1), new Field(1), new Field(0)]);
    });

    it('InTag is checked', async () => {
      machineState.memory.setSlice(0, [new Field(1), new Uint32(2), new Uint16(3)]);

      const ops = [
        new Lte(/*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 10, TypeTag.FIELD),
        new Lte(/*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 10, TypeTag.UINT32),
        new Lte(/*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 10, TypeTag.UINT16),
        new Lte(/*aOffset=*/ 1, /*bOffset=*/ 1, /*dstOffset=*/ 10, TypeTag.UINT16),
      ];

      for (const o of ops) {
        await expect(() => o.execute(machineState, journal)).rejects.toThrow(InstructionExecutionError);
      }
    });
  });
});
