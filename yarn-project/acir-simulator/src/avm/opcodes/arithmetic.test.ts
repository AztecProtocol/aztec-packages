import { MockProxy, mock } from 'jest-mock-extended';

import { AvmMachineState } from '../avm_machine_state.js';
import { Field, TypeTag } from '../avm_memory_types.js';
import { initExecutionEnvironment } from '../fixtures/index.js';
import { AvmJournal } from '../journal/journal.js';
import { Add, Div, Mul, Sub } from './arithmetic.js';

describe('Arithmetic Instructions', () => {
  let machineState: AvmMachineState;
  let journal: MockProxy<AvmJournal>;

  beforeEach(async () => {
    machineState = new AvmMachineState(initExecutionEnvironment());
    journal = mock<AvmJournal>();
  });

  describe('Add', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        // indirect
        0x01,
        // inTag
        0x03,
        // aOffset
        0x12, 0x34, 0x56, 0x78,
        // bOffset
        0x23, 0x45, 0x67, 0x89,
        // dstOffset
        0x34, 0x56, 0x78, 0x9a,
      ]);

      const inst = Add.deserialize(buf);
      expect(inst).toEqual(
        new Add(
          /*indirect=*/ 0x01,
          /*inTag=*/ 0x03,
          /*aOffset=*/ 0x12345678,
          /*bOffset=*/ 0x23456789,
          /*dstOffset=*/ 0x3456789a,
        ),
      );
    });

    it('Should serialize correctly', () => {
      const inst = new Add(
        /*indirect=*/ 0x01,
        /*inTag=*/ 0x03,
        /*aOffset=*/ 0x12345678,
        /*bOffset=*/ 0x23456789,
        /*dstOffset=*/ 0x3456789a,
      );
      console.log(inst);

      const expected = Buffer.from([
        // indirect
        0x01,
        // inTag
        0x03,
        // aOffset
        0x12, 0x34, 0x56, 0x78,
        // bOffset
        0x23, 0x45, 0x67, 0x89,
        // dstOffset
        0x34, 0x56, 0x78, 0x9a,
      ]);
      expect(inst.serialize()).toEqual(expected);
    });

    it('Should add correctly over field elements', async () => {
      const a = new Field(1n);
      const b = new Field(2n);

      machineState.memory.set(0, a);
      machineState.memory.set(1, b);

      await new Add(0, TypeTag.FIELD, 0, 1, 2).execute(machineState, journal);

      const expected = new Field(3n);
      const actual = machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should wrap around on addition', async () => {
      const a = new Field(1n);
      const b = new Field(Field.MODULUS - 1n);

      machineState.memory.set(0, a);
      machineState.memory.set(1, b);

      await new Add(0, TypeTag.FIELD, 0, 1, 2).execute(machineState, journal);

      const expected = new Field(0n);
      const actual = machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });
  });

  describe('Sub', () => {
    it('Should subtract correctly over field elements', async () => {
      const a = new Field(1n);
      const b = new Field(2n);

      machineState.memory.set(0, a);
      machineState.memory.set(1, b);

      await new Sub(0, 1, 2).execute(machineState, journal);

      const expected = new Field(Field.MODULUS - 1n);
      const actual = machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });
  });

  describe('Mul', () => {
    it('Should multiply correctly over field elements', async () => {
      const a = new Field(2n);
      const b = new Field(3n);

      machineState.memory.set(0, a);
      machineState.memory.set(1, b);

      await new Mul(0, 1, 2).execute(machineState, journal);

      const expected = new Field(6n);
      const actual = machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should wrap around on multiplication', async () => {
      const a = new Field(2n);
      const b = new Field(Field.MODULUS / 2n - 1n);

      machineState.memory.set(0, a);
      machineState.memory.set(1, b);

      await new Mul(0, 1, 2).execute(machineState, journal);

      const expected = new Field(Field.MODULUS - 3n);
      const actual = machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });
  });

  describe('Div', () => {
    it('Should perform field division', async () => {
      const a = new Field(2n);
      const b = new Field(3n);

      machineState.memory.set(0, a);
      machineState.memory.set(1, b);

      await new Div(0, 1, 2).execute(machineState, journal);

      // Note
      const actual = machineState.memory.get(2);
      const recovered = actual.mul(b);
      expect(recovered).toEqual(a);
    });
  });
});
