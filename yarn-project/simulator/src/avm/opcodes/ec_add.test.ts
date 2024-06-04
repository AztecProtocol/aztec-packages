import { Point } from '@aztec/circuits.js';

import { beforeEach } from '@jest/globals';

import { type AvmContext } from '../avm_context.js';
import { Field } from '../avm_memory_types.js';
import { initContext } from '../fixtures/index.js';
import { EcAdd } from './ec_add.js';

describe('EC Instructions', () => {
  let context: AvmContext;

  beforeEach(() => {
    context = initContext();
  });

  describe('EcAdd', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        EcAdd.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('12345678', 'hex'), // aOffset
        ...Buffer.from('23456789', 'hex'), // bOffset
        ...Buffer.from('3456789a', 'hex'), // dstOffset
      ]);
      const inst = new EcAdd(
        /*indirect=*/ 0x01,
        /*aOffset=*/ 0x12345678,
        /*bOffset=*/ 0x23456789,
        /*dstOffset=*/ 0x3456789a,
      );

      expect(EcAdd.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it(`Should double correctly`, async () => {
      const x = new Field(Point.G.x);
      const y = new Field(Point.G.y);

      context.machineState.memory.set(0, x);
      context.machineState.memory.set(1, y);
      context.machineState.memory.set(2, x);
      context.machineState.memory.set(3, y);

      await new EcAdd(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 4).execute(context);

      const actual = new Point(context.machineState.memory.get(4).toFr(), context.machineState.memory.get(5).toFr());
      const expected = Point.G.double();
      expect(actual).toEqual(expected);
    });

    it('Should add correctly', async () => {
      const G2 = Point.G.add(Point.G);

      const x1 = new Field(Point.G.x);
      const y1 = new Field(Point.G.y);
      const x2 = new Field(G2.x);
      const y2 = new Field(G2.y);

      context.machineState.memory.set(0, x1);
      context.machineState.memory.set(1, y1);
      context.machineState.memory.set(2, x2);
      context.machineState.memory.set(3, y2);

      await new EcAdd(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 4).execute(context);

      const actual = new Point(context.machineState.memory.get(4).toFr(), context.machineState.memory.get(5).toFr());
      const G3 = G2.add(Point.G);
      expect(actual).toEqual(G3);
    });
  });
});
