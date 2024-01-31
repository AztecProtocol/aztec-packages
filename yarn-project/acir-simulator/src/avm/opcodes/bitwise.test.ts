import { MockProxy, mock } from 'jest-mock-extended';

import { AvmMachineState } from '../avm_machine_state.js';
import { TypeTag, Uint16, Uint32 } from '../avm_memory_types.js';
import { initExecutionEnvironment } from '../fixtures/index.js';
import { AvmJournal } from '../journal/journal.js';
import { And, Not, Or, Shl, Shr, Xor } from './bitwise.js';

describe('Bitwise instructions', () => {
  let machineState: AvmMachineState;
  let journal: MockProxy<AvmJournal>;

  beforeEach(async () => {
    machineState = new AvmMachineState(initExecutionEnvironment());
    journal = mock<AvmJournal>();
  });

  describe('AND', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        // opcode
        And.opcode,
        // indirect
        0x01,
        // inTag
        TypeTag.UINT64,
        // aOffset
        0x12,
        0x34,
        0x56,
        0x78,
        // bOffset
        0x23,
        0x45,
        0x67,
        0x89,
        // dstOffset
        0x34,
        0x56,
        0x78,
        0x9a,
      ]);

      const inst: And = And.deserialize(buf);
      expect(inst).toEqual(
        new And(
          /*indirect=*/ 0x01,
          /*inTag=*/ TypeTag.UINT64,
          /*aOffset=*/ 0x12345678,
          /*bOffset=*/ 0x23456789,
          /*dstOffset=*/ 0x3456789a,
        ),
      );
    });

    it('Should serialize correctly', () => {
      const inst = new And(
        /*indirect=*/ 0x01,
        /*inTag=*/ TypeTag.UINT64,
        /*aOffset=*/ 0x12345678,
        /*bOffset=*/ 0x23456789,
        /*dstOffset=*/ 0x3456789a,
      );

      const expected = Buffer.from([
        // opcode
        And.opcode,
        // indirect
        0x01,
        // inTag
        TypeTag.UINT64,
        // aOffset
        0x12,
        0x34,
        0x56,
        0x78,
        // bOffset
        0x23,
        0x45,
        0x67,
        0x89,
        // dstOffset
        0x34,
        0x56,
        0x78,
        0x9a,
      ]);
      expect(inst.serialize()).toEqual(expected);
    });

    it('Should AND correctly over integral types', async () => {
      machineState.memory.set(0, new Uint32(0b11111110010011100100n));
      machineState.memory.set(1, new Uint32(0b11100100111001001111n));

      await new And(
        /*indirect=*/ 0,
        /*inTag=*/ TypeTag.UINT32,
        /*aOffset=*/ 0,
        /*bOffset=*/ 1,
        /*dstOffset=*/ 2,
      ).execute(machineState, journal);

      const actual = machineState.memory.get(2);
      expect(actual).toEqual(new Uint32(0b11100100010001000100n));
    });
  });

  describe('OR', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        // opcode
        Or.opcode,
        // indirect
        0x01,
        // inTag
        TypeTag.UINT64,
        // aOffset
        0x12,
        0x34,
        0x56,
        0x78,
        // bOffset
        0x23,
        0x45,
        0x67,
        0x89,
        // dstOffset
        0x34,
        0x56,
        0x78,
        0x9a,
      ]);

      const inst: Or = Or.deserialize(buf);
      expect(inst).toEqual(
        new Or(
          /*indirect=*/ 0x01,
          /*inTag=*/ TypeTag.UINT64,
          /*aOffset=*/ 0x12345678,
          /*bOffset=*/ 0x23456789,
          /*dstOffset=*/ 0x3456789a,
        ),
      );
    });

    it('Should serialize correctly', () => {
      const inst = new Or(
        /*indirect=*/ 0x01,
        /*inTag=*/ TypeTag.UINT64,
        /*aOffset=*/ 0x12345678,
        /*bOffset=*/ 0x23456789,
        /*dstOffset=*/ 0x3456789a,
      );

      const expected = Buffer.from([
        // opcode
        Or.opcode,
        // indirect
        0x01,
        // inTag
        TypeTag.UINT64,
        // aOffset
        0x12,
        0x34,
        0x56,
        0x78,
        // bOffset
        0x23,
        0x45,
        0x67,
        0x89,
        // dstOffset
        0x34,
        0x56,
        0x78,
        0x9a,
      ]);
      expect(inst.serialize()).toEqual(expected);
    });

    it('Should OR correctly over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint32(0b11100100111001001111n);

      machineState.memory.set(0, a);
      machineState.memory.set(1, b);

      await new Or(
        /*indirect=*/ 0,
        /*inTag=*/ TypeTag.UINT32,
        /*aOffset=*/ 0,
        /*bOffset=*/ 1,
        /*dstOffset=*/ 2,
      ).execute(machineState, journal);

      const expected = new Uint32(0b11111110111011101111n);
      const actual = machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });
  });

  describe('XOR', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        // opcode
        Xor.opcode,
        // indirect
        0x01,
        // inTag
        TypeTag.UINT64,
        // aOffset
        0x12,
        0x34,
        0x56,
        0x78,
        // bOffset
        0x23,
        0x45,
        0x67,
        0x89,
        // dstOffset
        0x34,
        0x56,
        0x78,
        0x9a,
      ]);

      const inst: Xor = Xor.deserialize(buf);
      expect(inst).toEqual(
        new Xor(
          /*indirect=*/ 0x01,
          /*inTag=*/ TypeTag.UINT64,
          /*aOffset=*/ 0x12345678,
          /*bOffset=*/ 0x23456789,
          /*dstOffset=*/ 0x3456789a,
        ),
      );
    });

    it('Should serialize correctly', () => {
      const inst = new Xor(
        /*indirect=*/ 0x01,
        /*inTag=*/ TypeTag.UINT64,
        /*aOffset=*/ 0x12345678,
        /*bOffset=*/ 0x23456789,
        /*dstOffset=*/ 0x3456789a,
      );

      const expected = Buffer.from([
        // opcode
        Xor.opcode,
        // indirect
        0x01,
        // inTag
        TypeTag.UINT64,
        // aOffset
        0x12,
        0x34,
        0x56,
        0x78,
        // bOffset
        0x23,
        0x45,
        0x67,
        0x89,
        // dstOffset
        0x34,
        0x56,
        0x78,
        0x9a,
      ]);
      expect(inst.serialize()).toEqual(expected);
    });

    it('Should XOR correctly over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint32(0b11100100111001001111n);

      machineState.memory.set(0, a);
      machineState.memory.set(1, b);

      await new Xor(
        /*indirect=*/ 0,
        /*inTag=*/ TypeTag.UINT32,
        /*aOffset=*/ 0,
        /*bOffset=*/ 1,
        /*dstOffset=*/ 2,
      ).execute(machineState, journal);

      const expected = new Uint32(0b00011010101010101011n);
      const actual = machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });
  });

  describe('SHR', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        // opcode
        Shr.opcode,
        // indirect
        0x01,
        // inTag
        TypeTag.UINT64,
        // aOffset
        0x12,
        0x34,
        0x56,
        0x78,
        // bOffset
        0x23,
        0x45,
        0x67,
        0x89,
        // dstOffset
        0x34,
        0x56,
        0x78,
        0x9a,
      ]);

      const inst: Shr = Shr.deserialize(buf);
      expect(inst).toEqual(
        new Shr(
          /*indirect=*/ 0x01,
          /*inTag=*/ TypeTag.UINT64,
          /*aOffset=*/ 0x12345678,
          /*bOffset=*/ 0x23456789,
          /*dstOffset=*/ 0x3456789a,
        ),
      );
    });

    it('Should serialize correctly', () => {
      const inst = new Shr(
        /*indirect=*/ 0x01,
        /*inTag=*/ TypeTag.UINT64,
        /*aOffset=*/ 0x12345678,
        /*bOffset=*/ 0x23456789,
        /*dstOffset=*/ 0x3456789a,
      );

      const expected = Buffer.from([
        // opcode
        Shr.opcode,
        // indirect
        0x01,
        // inTag
        TypeTag.UINT64,
        // aOffset
        0x12,
        0x34,
        0x56,
        0x78,
        // bOffset
        0x23,
        0x45,
        0x67,
        0x89,
        // dstOffset
        0x34,
        0x56,
        0x78,
        0x9a,
      ]);
      expect(inst.serialize()).toEqual(expected);
    });

    it('Should shift correctly 0 positions over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint32(0n);

      machineState.memory.set(0, a);
      machineState.memory.set(1, b);

      await new Shr(
        /*indirect=*/ 0,
        /*inTag=*/ TypeTag.UINT32,
        /*aOffset=*/ 0,
        /*bOffset=*/ 1,
        /*dstOffset=*/ 2,
      ).execute(machineState, journal);

      const expected = a;
      const actual = machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should shift correctly 2 positions over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint32(2n);

      machineState.memory.set(0, a);
      machineState.memory.set(1, b);

      await new Shr(
        /*indirect=*/ 0,
        /*inTag=*/ TypeTag.UINT32,
        /*aOffset=*/ 0,
        /*bOffset=*/ 1,
        /*dstOffset=*/ 2,
      ).execute(machineState, journal);

      const expected = new Uint32(0b00111111100100111001n);
      const actual = machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should shift correctly 19 positions over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint32(19n);

      machineState.memory.set(0, a);
      machineState.memory.set(1, b);

      await new Shr(
        /*indirect=*/ 0,
        /*inTag=*/ TypeTag.UINT32,
        /*aOffset=*/ 0,
        /*bOffset=*/ 1,
        /*dstOffset=*/ 2,
      ).execute(machineState, journal);

      const expected = new Uint32(0b01n);
      const actual = machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });
  });

  describe('SHL', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        // opcode
        Shl.opcode,
        // indirect
        0x01,
        // inTag
        TypeTag.UINT64,
        // aOffset
        0x12,
        0x34,
        0x56,
        0x78,
        // bOffset
        0x23,
        0x45,
        0x67,
        0x89,
        // dstOffset
        0x34,
        0x56,
        0x78,
        0x9a,
      ]);

      const inst: Shl = Shl.deserialize(buf);
      expect(inst).toEqual(
        new Shl(
          /*indirect=*/ 0x01,
          /*inTag=*/ TypeTag.UINT64,
          /*aOffset=*/ 0x12345678,
          /*bOffset=*/ 0x23456789,
          /*dstOffset=*/ 0x3456789a,
        ),
      );
    });

    it('Should serialize correctly', () => {
      const inst = new Shl(
        /*indirect=*/ 0x01,
        /*inTag=*/ TypeTag.UINT64,
        /*aOffset=*/ 0x12345678,
        /*bOffset=*/ 0x23456789,
        /*dstOffset=*/ 0x3456789a,
      );

      const expected = Buffer.from([
        // opcode
        Shl.opcode,
        // indirect
        0x01,
        // inTag
        TypeTag.UINT64,
        // aOffset
        0x12,
        0x34,
        0x56,
        0x78,
        // bOffset
        0x23,
        0x45,
        0x67,
        0x89,
        // dstOffset
        0x34,
        0x56,
        0x78,
        0x9a,
      ]);
      expect(inst.serialize()).toEqual(expected);
    });

    it('Should shift correctly 0 positions over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint32(0n);

      machineState.memory.set(0, a);
      machineState.memory.set(1, b);

      await new Shl(
        /*indirect=*/ 0,
        /*inTag=*/ TypeTag.UINT32,
        /*aOffset=*/ 0,
        /*bOffset=*/ 1,
        /*dstOffset=*/ 2,
      ).execute(machineState, journal);

      const expected = a;
      const actual = machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should shift correctly 2 positions over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint32(2n);

      machineState.memory.set(0, a);
      machineState.memory.set(1, b);

      await new Shl(
        /*indirect=*/ 0,
        /*inTag=*/ TypeTag.UINT32,
        /*aOffset=*/ 0,
        /*bOffset=*/ 1,
        /*dstOffset=*/ 2,
      ).execute(machineState, journal);

      const expected = new Uint32(0b1111111001001110010000n);
      const actual = machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should shift correctly over bit limit over integral types', async () => {
      const a = new Uint16(0b1110010011100111n);
      const b = new Uint16(17n);

      machineState.memory.set(0, a);
      machineState.memory.set(1, b);

      await new Shl(
        /*indirect=*/ 0,
        /*inTag=*/ TypeTag.UINT16,
        /*aOffset=*/ 0,
        /*bOffset=*/ 1,
        /*dstOffset=*/ 2,
      ).execute(machineState, journal);

      const expected = new Uint16(0n);
      const actual = machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should truncate when shifting over bit size over integral types', async () => {
      const a = new Uint16(0b1110010011100111n);
      const b = new Uint16(2n);

      machineState.memory.set(0, a);
      machineState.memory.set(1, b);

      await new Shl(
        /*indirect=*/ 0,
        /*inTag=*/ TypeTag.UINT16,
        /*aOffset=*/ 0,
        /*bOffset=*/ 1,
        /*dstOffset=*/ 2,
      ).execute(machineState, journal);

      const expected = new Uint16(0b1001001110011100n);
      const actual = machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });
  });

  describe('NOT', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        // opcode
        Not.opcode,
        // indirect
        0x01,
        // inTag
        TypeTag.UINT64,
        // aOffset
        0x12,
        0x34,
        0x56,
        0x78,
        // dstOffset
        0x34,
        0x56,
        0x78,
        0x9a,
      ]);

      const inst: Not = Not.deserialize(buf);
      expect(inst).toEqual(
        new Not(/*indirect=*/ 0x01, /*inTag=*/ TypeTag.UINT64, /*aOffset=*/ 0x12345678, /*dstOffset=*/ 0x3456789a),
      );
    });

    it('Should serialize correctly', () => {
      const inst = new Not(
        /*indirect=*/ 0x01,
        /*inTag=*/ TypeTag.UINT64,
        /*aOffset=*/ 0x12345678,
        /*dstOffset=*/ 0x3456789a,
      );

      const expected = Buffer.from([
        // opcode
        Not.opcode,
        // indirect
        0x01,
        // inTag
        TypeTag.UINT64,
        // aOffset
        0x12,
        0x34,
        0x56,
        0x78,
        // dstOffset
        0x34,
        0x56,
        0x78,
        0x9a,
      ]);
      expect(inst.serialize()).toEqual(expected);
    });

    it('Should NOT correctly over integral types', async () => {
      const a = new Uint16(0b0110010011100100n);

      machineState.memory.set(0, a);

      await new Not(/*indirect=*/ 0, /*inTag=*/ TypeTag.UINT16, /*aOffset=*/ 0, /*dstOffset=*/ 1).execute(
        machineState,
        journal,
      );

      const expected = new Uint16(0b1001101100011011n); // high bits!
      const actual = machineState.memory.get(1);
      expect(actual).toEqual(expected);
    });
  });
});
