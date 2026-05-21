import { Grumpkin } from '@aztec/foundation/crypto/grumpkin';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';

import { beforeEach } from '@jest/globals';

import type { AvmContext } from '../avm_context.js';
import { Field, Uint32 } from '../avm_memory_types.js';
import { EcAddPointNotOnCurveError } from '../errors.js';
import { initContext } from '../fixtures/initializers.js';
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
        ...Buffer.from('1234', 'hex'), // indirect
        ...Buffer.from('1235', 'hex'), // p1x
        ...Buffer.from('1236', 'hex'), // p1y
        ...Buffer.from('1237', 'hex'), // p2x
        ...Buffer.from('1238', 'hex'), // p2y
        ...Buffer.from('1239', 'hex'), // dstOffset
      ]);
      const inst = new EcAdd(
        /*addressing_mode=*/ 0x1234,
        /*p1X=*/ 0x1235,
        /*p1Y=*/ 0x1236,
        /*p2X=*/ 0x1237,
        /*p2Y=*/ 0x1238,
        /*dstOffset=*/ 0x1239,
      );

      expect(EcAdd.fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it(`Should double correctly`, async () => {
      const x = new Field(Grumpkin.generator.x);
      const y = new Field(Grumpkin.generator.y);

      context.machineState.memory.set(0, x);
      context.machineState.memory.set(1, y);
      context.machineState.memory.set(2, x);
      context.machineState.memory.set(3, y);
      // context.machineState.memory.set(4, new Uint32(4));

      await new EcAdd(/*addressing_mode=*/ 0, /*p1X=*/ 0, /*p1Y=*/ 1, /*p2X=*/ 2, /*p2Y=*/ 3, /*dstOffset=*/ 4).execute(
        context,
      );

      const actual = new Point(context.machineState.memory.get(4).toFr(), context.machineState.memory.get(5).toFr());
      const expected = await Grumpkin.add(Grumpkin.generator, Grumpkin.generator);
      expect(actual).toEqual(expected);
    });

    it('Should add correctly', async () => {
      const G2 = await Grumpkin.add(Grumpkin.generator, Grumpkin.generator);

      const x1 = new Field(Grumpkin.generator.x);
      const y1 = new Field(Grumpkin.generator.y);
      const x2 = new Field(G2.x);
      const y2 = new Field(G2.y);

      context.machineState.memory.set(0, x1);
      context.machineState.memory.set(1, y1);
      context.machineState.memory.set(2, x2);
      context.machineState.memory.set(3, y2);
      context.machineState.memory.set(4, new Uint32(4));

      await new EcAdd(/*addressing_mode=*/ 0, /*p1X=*/ 0, /*p1Y=*/ 1, /*p2X=*/ 2, /*p2Y=*/ 3, /*dstOffset=*/ 4).execute(
        context,
      );

      const actual = new Point(context.machineState.memory.get(4).toFr(), context.machineState.memory.get(5).toFr());
      const G3 = await Grumpkin.add(Grumpkin.generator, G2);
      expect(actual).toEqual(G3);
    });

    it('Should add correctly with rhs being infinity', async () => {
      const zero = new Field(0);

      const x = new Field(Grumpkin.generator.x);
      const y = new Field(Grumpkin.generator.y);

      // Point 1 is not infinity
      context.machineState.memory.set(0, x);
      context.machineState.memory.set(1, y);
      // Point 2 is infinity
      context.machineState.memory.set(2, zero);
      context.machineState.memory.set(3, zero);
      context.machineState.memory.set(4, new Uint32(4));

      await new EcAdd(/*addressing_mode=*/ 0, /*p1X=*/ 0, /*p1Y=*/ 1, /*p2X=*/ 2, /*p2Y=*/ 3, /*dstOffset=*/ 4).execute(
        context,
      );

      expect([context.machineState.memory.get(4).toFr(), context.machineState.memory.get(5).toFr()]).toEqual([
        x.toFr(),
        y.toFr(),
      ]);
    });

    it('Should add correctly with lhs being infinity', async () => {
      const zero = new Field(0);

      const x = new Field(Grumpkin.generator.x);
      const y = new Field(Grumpkin.generator.y);

      // Point 1 is infinity
      context.machineState.memory.set(0, zero);
      context.machineState.memory.set(1, zero);
      // Point 2 is not infinity
      context.machineState.memory.set(2, x);
      context.machineState.memory.set(3, y);
      context.machineState.memory.set(4, new Uint32(4));

      await new EcAdd(/*addressing_mode=*/ 0, /*p1X=*/ 0, /*p1Y=*/ 1, /*p2X=*/ 2, /*p2Y=*/ 3, /*dstOffset=*/ 4).execute(
        context,
      );

      expect([context.machineState.memory.get(4).toFr(), context.machineState.memory.get(5).toFr()]).toEqual([
        x.toFr(),
        y.toFr(),
      ]);
    });

    it('Should add correctly with both being infinity', async () => {
      const zero = new Field(0);

      // Point 1 is infinity
      context.machineState.memory.set(0, zero);
      context.machineState.memory.set(1, zero);
      // Point 2 is infinity
      context.machineState.memory.set(2, zero);
      context.machineState.memory.set(3, zero);
      context.machineState.memory.set(4, new Uint32(4));

      await new EcAdd(/*addressing_mode=*/ 0, /*p1X=*/ 0, /*p1Y=*/ 1, /*p2X=*/ 2, /*p2Y=*/ 3, /*dstOffset=*/ 4).execute(
        context,
      );

      expect([context.machineState.memory.get(4).toFr(), context.machineState.memory.get(5).toFr()]).toEqual([
        Fr.ZERO,
        Fr.ZERO,
      ]);
    });

    it('Should add correctly with none infinity adding up to infinity', async () => {
      // Point 1 is a "random" point on the curve
      const x1 = new Field(2165030248772332382647339664685760681662697934905450801078761197378150920554n);
      const y1 = new Field(1518479793551399970960577643223827307749147426195887130444945641264602004320n);
      // Point 2 is negation of point 1
      const x2 = new Field(2165030248772332382647339664685760681662697934905450801078761197378150920554n);
      const y2 = new Field(20369763078287875251285828102033447780799216974220147213253258545311206491297n);

      context.machineState.memory.set(0, x1);
      context.machineState.memory.set(1, y1);

      context.machineState.memory.set(2, x2);
      context.machineState.memory.set(3, y2);
      context.machineState.memory.set(4, new Uint32(4));

      await new EcAdd(/*addressing_mode=*/ 0, /*p1X=*/ 0, /*p1Y=*/ 1, /*p2X=*/ 2, /*p2Y=*/ 3, /*dstOffset=*/ 4).execute(
        context,
      );

      expect([context.machineState.memory.get(4).toFr(), context.machineState.memory.get(5).toFr()]).toEqual([
        Fr.ZERO,
        Fr.ZERO,
      ]);
    });
  });

  describe('EcAdd should throw an error when a point is not on the curve', () => {
    it('Should throw an error when point1 is not on the curve', async () => {
      const validPoint = await Point.random();
      const p1xOffset = 0;
      const p1yOffset = 1;
      const p2xOffset = 2;
      const p2yOffset = 3;
      const dstOffset = 4;
      context.machineState.memory.set(p1xOffset, new Field(new Fr(1))); // p1x (point is invalid)
      context.machineState.memory.set(p1yOffset, new Field(new Fr(1))); // p1y (point is invalid)
      context.machineState.memory.set(p2xOffset, new Field(validPoint.x)); // p2x
      context.machineState.memory.set(p2yOffset, new Field(validPoint.y)); // p2y

      await expect(
        new EcAdd(/*addressing_mode=*/ 0, p1xOffset, p1yOffset, p2xOffset, p2yOffset, dstOffset).execute(context),
      ).rejects.toThrow(EcAddPointNotOnCurveError);
    });

    it('Should throw an error when point2 is not on the curve', async () => {
      const validPoint = await Point.random();
      const p1xOffset = 0;
      const p1yOffset = 1;
      const p2xOffset = 2;
      const p2yOffset = 3;
      const dstOffset = 4;
      context.machineState.memory.set(p1xOffset, new Field(validPoint.x)); // p1x
      context.machineState.memory.set(p1yOffset, new Field(validPoint.y)); // p1y
      context.machineState.memory.set(p2xOffset, new Field(new Fr(1))); // p2x (point is invalid)
      context.machineState.memory.set(p2yOffset, new Field(new Fr(1))); // p2y (point is invalid)

      await expect(
        new EcAdd(/*addressing_mode=*/ 0, p1xOffset, p1yOffset, p2xOffset, p2yOffset, dstOffset).execute(context),
      ).rejects.toThrow(EcAddPointNotOnCurveError);
    });
  });
});
