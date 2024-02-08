import { AvmContext } from '../avm_context.js';
import { Field, TypeTag, Uint16, Uint32 } from '../avm_memory_types.js';
import { TagCheckError } from '../errors.js';
import { initContext } from '../fixtures/index.js';
import { Eq, Lt, Lte } from './comparators.js';

type ComparatorClass = typeof Eq | typeof Lt | typeof Lte;
describe.each([
  [Eq, (a: number, b: number) => (a == b ? 1 : 0)],
  [Lt, (a: number, b: number) => (a < b ? 1 : 0)],
  [Lte, (a: number, b: number) => (a <= b ? 1 : 0)],
])('Comparators', (clsValue: ComparatorClass, cmpf: (a: number, b: number) => number) => {
  let context: AvmContext;

  beforeEach(() => {
    context = initContext();
  });

  describe(clsValue.name, () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        clsValue.opcode, // opcode
        0x01, // indirect
        TypeTag.UINT64, // inTag
        ...Buffer.from('12345678', 'hex'), // aOffset
        ...Buffer.from('23456789', 'hex'), // bOffset
        ...Buffer.from('3456789a', 'hex'), // dstOffset
      ]);
      const inst = new clsValue(
        /*indirect=*/ 0x01,
        /*inTag=*/ TypeTag.UINT64,
        /*aOffset=*/ 0x12345678,
        /*bOffset=*/ 0x23456789,
        /*dstOffset=*/ 0x3456789a,
      );

      expect(clsValue.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Works on integral types', async () => {
      context.machineState.memory.setSlice(0, [new Uint32(1), new Uint32(2), new Uint32(3), new Uint32(1)]);

      [
        new clsValue(/*indirect=*/ 0, TypeTag.UINT32, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 10),
        new clsValue(/*indirect=*/ 0, TypeTag.UINT32, /*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 11),
        new clsValue(/*indirect=*/ 0, TypeTag.UINT32, /*aOffset=*/ 0, /*bOffset=*/ 3, /*dstOffset=*/ 12),
      ].forEach(i => i.execute(context));

      const actual = context.machineState.memory.getSlice(/*offset=*/ 10, /*size=*/ 4);
      expect(actual).toEqual([new Uint32(cmpf(1, 2)), new Uint32(cmpf(1, 2)), new Uint32(cmpf(1, 1))]);
    });

    it('Does not work on field elements', async () => {
      await expect(() =>
        new clsValue(/*indirect=*/ 0, TypeTag.FIELD, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 10).execute(
          context,
        ),
      ).rejects.toThrow(TagCheckError);
    });

    it('InTag is checked', async () => {
      context.machineState.memory.setSlice(0, [new Field(1), new Uint32(2), new Uint16(3)]);

      const ops = [
        new clsValue(/*indirect=*/ 0, TypeTag.UINT32, /*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 10),
        new clsValue(/*indirect=*/ 0, TypeTag.UINT16, /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 10),
        new clsValue(/*indirect=*/ 0, TypeTag.UINT16, /*aOffset=*/ 1, /*bOffset=*/ 1, /*dstOffset=*/ 10),
      ];

      for (const o of ops) {
        await expect(() => o.execute(context)).rejects.toThrow(TagCheckError);
      }
    });
  });
});
